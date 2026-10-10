package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/edusnake"
)

// snakeSub is one connected Main Ular player.
type snakeSub struct {
	claims auth.Claims
	send   func(edusnake.Message)
	cancel context.CancelFunc
}

// RunEduSnake drives Main Ular rooms: snake steps, question timers, host
// hand over and result reporting.
func (s *Server) RunEduSnake(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.pushEduSnake(append(s.snake.Tick(now), s.snake.HandOver(now)...), now)
			s.reportEduSnake()
		}
	}
}

func (s *Server) reportEduSnake() {
	for _, res := range s.snake.TakeResults() {
		go s.report(res)
	}
}

// pushEduSnake sends the current state to every listed, connected player.
func (s *Server) pushEduSnake(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*snakeSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.snakeSubs[id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.snake.State(sub.claims, now))
	}
}

// serveEduSnake runs the Main Ular room WebSocket.
func (s *Server) serveEduSnake(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, edusnake.GameKey, s.cfg.Now())
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
	send := func(msg edusnake.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &snakeSub{claims: claims, send: send, cancel: cancel}

	s.mu.Lock()
	if prev, ok := s.snakeSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.snakeSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.snake.Join(claims, r.URL.Query().Get("locale"))
	now := s.cfg.Now()
	s.pushEduSnake(append(s.snake.Peers(claims.Subject), claims.Subject), now)

	for {
		var in struct {
			T         string `json:"t"`
			Pin       string `json:"pin"`
			Direction string `json:"direction"`
			Mode      string `json:"mode"`
			Subject   string `json:"subject"`
			Seconds   int    `json:"seconds"`
			Locale    string `json:"locale"`
		}
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		var ids []int64
		var err error
		switch in.T {
		case "create":
			_, ids = s.snake.Create(claims, now)
		case "join":
			ids, err = s.snake.Enter(claims, in.Pin, now)
		case "leave":
			var paid int
			ids, paid = s.snake.Leave(claims.Subject, now)
			if paid >= 0 {
				send(edusnake.Message{"t": "left", "points": paid})
			}
		case "mode":
			ids, err = s.snake.SetMode(claims.Subject, in.Mode, now)
		case "subject":
			ids, err = s.snake.SetSubject(claims.Subject, in.Subject, now)
		case "answer_time":
			ids, err = s.snake.SetAnswerTime(claims.Subject, in.Seconds, now)
		case "stop":
			ids, err = s.snake.Stop(claims.Subject, now)
		case "sync":
			ids = []int64{claims.Subject}
		case "start":
			ids, err = s.snake.Start(claims.Subject, now)
		case "ready":
			ids, err = s.snake.Ready(claims.Subject, now)
		case "turn":
			ids, err = s.snake.Turn(claims.Subject, in.Direction, now)
			// Turns take effect on the next step, which pushes the state.
			ids = nil
		case "locale":
			s.snake.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			send(edusnake.Message{"t": "pong"})
			continue
		default:
			send(edusnake.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			send(edusnake.Message{"t": "error", "code": err.Error()})
			continue
		}
		s.pushEduSnake(ids, now)
		s.reportEduSnake()
	}

	s.mu.Lock()
	current := s.snakeSubs[claims.Subject] == sub
	if current {
		delete(s.snakeSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.snake.Offline(claims.Subject)
		s.pushEduSnake(s.snake.Peers(claims.Subject), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
