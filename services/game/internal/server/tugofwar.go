package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/tugofwar"
)

// tugInputsPerSecond bounds client messages per connection.
const tugInputsPerSecond = 20

// tugSub is one connected Tarik Tambang player.
type tugSub struct {
	claims auth.Claims
	send   func(tugofwar.Message)
	cancel context.CancelFunc
}

// RunTugOfWar drives Tarik Tambang timers (countdown, deadlines, computer team).
func (s *Server) RunTugOfWar(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.pushTugOfWar(append(s.tug.Tick(now), s.tug.HandOver(now)...), now)
			s.reportTugOfWar()
		}
	}
}

// reportTugOfWar sends finished Tarik Tambang results to Laravel.
func (s *Server) reportTugOfWar() {
	for _, res := range s.tug.TakeResults() {
		go s.report(res)
	}
}

// pushTugOfWar sends the current state to every listed, connected player.
func (s *Server) pushTugOfWar(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*tugSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.tugSubs[id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.tug.State(sub.claims, now))
	}
}

// serveTugOfWar runs the Tarik Tambang room WebSocket.
func (s *Server) serveTugOfWar(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, tugofwar.GameKey, s.cfg.Now())
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
	send := func(msg tugofwar.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &tugSub{claims: claims, send: send, cancel: replacer(conn, cancel)}

	s.mu.Lock()
	if prev, ok := s.tugSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.tugSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.tug.Join(claims, r.URL.Query().Get("locale"))
	now := s.cfg.Now()
	s.pushTugOfWar(append(s.tug.Peers(claims.Subject), claims.Subject), now)

	// At most tugInputsPerSecond messages per second; the rest are dropped.
	var window time.Time
	inputs := 0
	for {
		var in struct {
			T       string `json:"t"`
			Pin     string `json:"pin"`
			Round   int    `json:"round"`
			Option  int    `json:"option"`
			Subject string `json:"subject"`
			Seconds int    `json:"seconds"`
			Count   int    `json:"count"`
			Seat    int    `json:"seat"`
			Team    int    `json:"team"`
			Locale  string `json:"locale"`
		}
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		if now.Sub(window) >= time.Second {
			window, inputs = now, 0
		}
		if inputs++; inputs > tugInputsPerSecond {
			continue
		}
		var ids []int64
		var err error
		switch in.T {
		case "create":
			_, ids = s.tug.Create(claims, now)
		case "join":
			ids, err = s.tug.Enter(claims, in.Pin, now)
		case "classroom":
			ids, err = s.tug.EnterClassroom(claims, now)
		case "leave":
			var paid int
			ids, paid = s.tug.Leave(claims.Subject, now)
			if paid >= 0 {
				send(tugofwar.Message{"t": "left", "points": paid})
			}
		case "subject":
			ids, err = s.tug.SetSubject(claims.Subject, in.Subject, now)
		case "answer_time":
			ids, err = s.tug.SetAnswerTime(claims.Subject, in.Seconds, now)
		case "questions":
			ids, err = s.tug.SetQuestions(claims.Subject, in.Count, now)
		case "team":
			ids, err = s.tug.SetTeam(claims.Subject, in.Seat, in.Team, now)
		case "shuffle_teams":
			ids, err = s.tug.ShuffleTeams(claims.Subject, now)
		case "stop":
			ids, err = s.tug.Stop(claims.Subject, now)
		case "sync":
			ids = []int64{claims.Subject}
		case "start":
			ids, err = s.tug.Start(claims.Subject, now)
		case "answer":
			ids, err = s.tug.Answer(claims.Subject, in.Round, in.Option, now)
		case "locale":
			s.tug.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			send(tugofwar.Message{"t": "pong"})
			continue
		default:
			send(tugofwar.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			send(tugofwar.Message{"t": "error", "code": err.Error()})
			continue
		}
		s.pushTugOfWar(ids, now)
		s.reportTugOfWar()
	}

	s.mu.Lock()
	current := s.tugSubs[claims.Subject] == sub
	if current {
		delete(s.tugSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.tug.Offline(claims.Subject)
		s.pushTugOfWar(s.tug.Peers(claims.Subject), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
