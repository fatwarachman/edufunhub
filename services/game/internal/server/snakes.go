package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/snakes"
)

// snakesSub is one connected Ular Tangga player.
type snakesSub struct {
	claims auth.Claims
	send   func(snakes.Message)
	cancel context.CancelFunc
}

// RunSnakes drives Ular Tangga room timers (auto roll, answer timeout, moves).
func (s *Server) RunSnakes(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.pushSnakes(append(s.snakes.Tick(now), s.snakes.HandOver(now)...), now)
			s.reportSnakes()
		}
	}
}

// reportSnakes sends finished Ular Tangga results to Laravel.
func (s *Server) reportSnakes() {
	for _, res := range s.snakes.TakeResults() {
		go s.report(res)
	}
}

// pushSnakes sends the current state to every listed, connected player.
func (s *Server) pushSnakes(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*snakesSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.snakesSubs[id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.snakes.State(sub.claims, now))
	}
}

// serveSnakes runs the online Ular Tangga room WebSocket.
func (s *Server) serveSnakes(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, snakes.GameKey, s.cfg.Now())
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
	send := func(msg snakes.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &snakesSub{claims: claims, send: send, cancel: cancel}

	s.mu.Lock()
	if prev, ok := s.snakesSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.snakesSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.snakes.Join(claims, r.URL.Query().Get("locale"))
	now := s.cfg.Now()
	s.pushSnakes(append(s.snakes.Peers(claims.Subject), claims.Subject), now)

	fail := func(err error) {
		send(snakes.Message{"t": "error", "code": err.Error()})
	}
	for {
		var in inbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		var ids []int64
		var err error
		switch in.T {
		case "create":
			_, ids = s.snakes.Create(claims, now)
		case "join":
			ids, err = s.snakes.Enter(claims, in.Pin, now)
		case "leave":
			var paid int
			ids, paid = s.snakes.Leave(claims.Subject, now)
			if paid >= 0 {
				send(snakes.Message{"t": "left", "points": paid})
			}
		case "add_local":
			ids, err = s.snakes.AddLocal(claims.Subject, localName(in.Name), now)
		case "remove_local":
			ids, err = s.snakes.RemoveLocal(claims.Subject, in.Seat, now)
		case "subject":
			ids, err = s.snakes.SetSubject(claims.Subject, in.Subject, now)
		case "duration":
			ids, err = s.snakes.SetDuration(claims.Subject, in.Minutes, now)
		case "answer_time":
			ids, err = s.snakes.SetAnswerTime(claims.Subject, in.Seconds, now)
		case "stop":
			ids, err = s.snakes.Stop(claims.Subject, now)
		case "sync":
			ids = []int64{claims.Subject}
		case "start":
			ids, err = s.snakes.Start(claims.Subject, now)
		case "roll":
			ids, err = s.snakes.Roll(claims.Subject, now)
		case "answer":
			ids, err = s.snakes.Answer(claims.Subject, in.Option, now)
		case "locale":
			s.snakes.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			send(snakes.Message{"t": "pong"})
			continue
		default:
			send(snakes.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			fail(err)
			continue
		}
		s.pushSnakes(ids, now)
		s.reportSnakes()
	}

	s.mu.Lock()
	current := s.snakesSubs[claims.Subject] == sub
	if current {
		delete(s.snakesSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.snakes.Offline(claims.Subject)
		s.pushSnakes(s.snakes.Peers(claims.Subject), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
