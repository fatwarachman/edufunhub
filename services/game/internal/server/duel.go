package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/duel"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/questions"
)

// duelSub is one connected duel player. The hub pushes state to it whenever
// the opponent acts or a timer fires.
type duelSub struct {
	claims auth.Claims
	send   func(duel.Message)
	cancel context.CancelFunc
}

// RunDuels drives duel timers (countdown, round timeout, bot answers, queue).
func (s *Server) RunDuels(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.tickDuels()
		}
	}
}

func (s *Server) tickDuels() {
	now := s.cfg.Now()
	ids, results := s.duels.Tick(now)
	s.pushDuel(ids, now)
	for _, res := range results {
		go s.report(res)
	}
}

// pushDuel sends the current state to every listed, connected player.
func (s *Server) pushDuel(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*duelSub, 0, len(ids))
	for _, id := range ids {
		if sub, ok := s.duelSubs[id]; ok {
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.duelState(sub.claims, now))
	}
}

// duelState is the duel snapshot plus the invite room, when the player is in one.
func (s *Server) duelState(claims auth.Claims, now time.Time) duel.Message {
	msg := s.duels.State(claims, now)
	if msg["phase"] != duel.PhaseIdle && msg["phase"] != duel.PhaseDone {
		return msg
	}
	s.duelRooms.View(claims.Subject, func(r *lobby.Room[struct{}, struct{}]) {
		if r != nil {
			msg["room"] = s.duelRooms.RoomPayload(r, claims.Subject, nil)
		}
	})
	return msg
}

// startDuelRoom turns a full invite room into a private match.
func (s *Server) startDuelRoom(uid int64, now time.Time) ([]int64, error) {
	var a, b auth.Claims
	var pin, subject string
	_, err := s.duelRooms.Start(uid, now, func(r *lobby.Room[struct{}, struct{}]) error {
		a, b, pin, subject = r.Seats[0].Claims, r.Seats[1].Claims, r.Pin, r.Subject
		return nil
	})
	if err != nil {
		return nil, err
	}
	ids, err := s.duels.StartPrivate(a, b, pin, subject, now)
	if err != nil {
		return nil, err
	}
	s.duelRooms.Dissolve(uid)
	return ids, nil
}

// serveDuel runs the Duel Kuis Kelas WebSocket.
func (s *Server) serveDuel(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, duel.GameKey, s.cfg.Now())
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	conn.SetReadLimit(1024)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var writeMu sync.Mutex
	send := func(msg duel.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &duelSub{claims: claims, send: send, cancel: cancel}

	s.mu.Lock()
	if prev, ok := s.duelSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.duelSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.duels.Join(claims, r.URL.Query().Get("locale"), s.cfg.Now())
	s.duelRooms.Join(claims, r.URL.Query().Get("locale"))
	send(s.duelState(claims, s.cfg.Now()))
	s.pushDuel(s.others(claims.Subject), s.cfg.Now())

	for {
		var in inbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		switch in.T {
		case "queue":
			if s.duelRooms.Peers(claims.Subject) != nil {
				peers := s.duelRooms.Leave(claims.Subject, now)
				s.pushDuel(peers[:len(peers)-1], now)
			}
			ids, err := s.duels.Queue(claims, in.Subject, now)
			if err != nil {
				send(duel.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushDuel(ids, now)
		case "cancel":
			s.duels.Cancel(claims.Subject)
			send(s.duelState(claims, now))
		case "create":
			if s.duels.Busy(claims.Subject) {
				send(duel.Message{"t": "error", "code": duel.ErrPhase.Error()})
				continue
			}
			s.duels.Cancel(claims.Subject)
			_, ids := s.duelRooms.Create(claims, now, nil)
			s.pushDuel(ids, now)
		case "join":
			if s.duels.Busy(claims.Subject) {
				send(duel.Message{"t": "error", "code": duel.ErrPhase.Error()})
				continue
			}
			s.duels.Cancel(claims.Subject)
			ids, err := s.duelRooms.Enter(claims, in.Pin, now)
			if err != nil {
				send(duel.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushDuel(ids, now)
		case "leave":
			s.pushDuel(s.duelRooms.Leave(claims.Subject, now), now)
		case "subject":
			ids, err := s.duelRooms.SetSubject(claims.Subject, in.Subject, questions.NormSubject, now)
			if err != nil {
				send(duel.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushDuel(ids, now)
		case "start":
			ids, err := s.startDuelRoom(claims.Subject, now)
			if err != nil {
				send(duel.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushDuel(ids, now)
		case "answer":
			ids, err := s.duels.Answer(claims.Subject, in.Option, now)
			if err != nil {
				send(duel.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushDuel(ids, now)
		case "locale":
			s.duels.SetLocale(claims.Subject, in.Locale)
			s.duelRooms.SetLocale(claims.Subject, in.Locale)
			send(s.duelState(claims, now))
		case "ping":
			send(duel.Message{"t": "pong"})
		default:
			send(duel.Message{"t": "error", "code": "unknown_type"})
		}
	}

	s.mu.Lock()
	current := s.duelSubs[claims.Subject] == sub
	if current {
		delete(s.duelSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.duels.Offline(claims.Subject)
		s.duelRooms.Offline(claims.Subject)
		s.pushDuel(append(s.others(claims.Subject), s.duelRooms.Peers(claims.Subject)...), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}

// others lists the opponent of uid in a live match, if any.
func (s *Server) others(uid int64) []int64 {
	out := []int64{}
	for _, id := range s.duels.Peers(uid) {
		if id != uid {
			out = append(out, id)
		}
	}
	return out
}
