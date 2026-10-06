package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/minigames"
)

// miniSub is one connected player of a room quiz game (Market Math, Number &
// Letter Garden, Explore Indonesia, Mini Lab).
type miniSub struct {
	claims auth.Claims
	send   func(minigames.Message)
	cancel context.CancelFunc
}

// RunMinigames drives every room quiz game's timers and reports results.
func (s *Server) RunMinigames(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			for _, key := range minigames.Keys {
				s.pushMini(key, append(s.minis[key].Tick(now), s.minis[key].HandOver(now)...), now)
			}
			s.reportMinis()
		}
	}
}

func (s *Server) reportMinis() {
	for _, key := range minigames.Keys {
		for _, res := range s.minis[key].TakeResults() {
			go s.report(res)
		}
	}
}

func (s *Server) pushMini(key string, ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*miniSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.miniSubs[key][id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	hub := s.minis[key]
	for _, sub := range subs {
		sub.send(hub.State(sub.claims, now))
	}
}

// serveMini returns the WebSocket handler of one room quiz game.
func (s *Server) serveMini(key string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hub := s.minis[key]
		claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, key, s.cfg.Now())
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
		send := func(msg minigames.Message) {
			if msg == nil {
				return
			}
			writeMu.Lock()
			defer writeMu.Unlock()
			wctx, c := context.WithTimeout(ctx, 3*time.Second)
			defer c()
			_ = wsjson.Write(wctx, conn, msg)
		}
		sub := &miniSub{claims: claims, send: send, cancel: cancel}
		s.mu.Lock()
		if prev, ok := s.miniSubs[key][claims.Subject]; ok {
			prev.cancel()
		}
		s.miniSubs[key][claims.Subject] = sub
		s.mu.Unlock()

		hub.Join(claims, r.URL.Query().Get("locale"))
		s.pushMini(key, append(hub.Peers(claims.Subject), claims.Subject), s.cfg.Now())

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
				ids = hub.Create(claims, now)
			case "join":
				ids, err = hub.Enter(claims, in.Pin, now)
			case "leave":
				ids = hub.Leave(claims.Subject, now)
			case "start":
				ids, err = hub.Start(claims.Subject, now)
			case "answer":
				ids, err = hub.Answer(claims.Subject, in.Option, now)
			case "locale":
				hub.SetLocale(claims.Subject, in.Locale)
				ids = []int64{claims.Subject}
			case "sync":
				ids = []int64{claims.Subject}
			case "ping":
				send(minigames.Message{"t": "pong"})
				continue
			default:
				send(minigames.Message{"t": "error", "code": "unknown_type"})
				continue
			}
			if err != nil {
				send(minigames.Message{"t": "error", "code": err.Error()})
				continue
			}
			s.pushMini(key, ids, now)
			s.reportMinis()
		}

		s.mu.Lock()
		current := s.miniSubs[key][claims.Subject] == sub
		if current {
			delete(s.miniSubs[key], claims.Subject)
		}
		s.mu.Unlock()
		if current {
			hub.Offline(claims.Subject)
			s.pushMini(key, hub.Peers(claims.Subject), s.cfg.Now())
		}
		conn.Close(websocket.StatusNormalClosure, "")
	}
}
