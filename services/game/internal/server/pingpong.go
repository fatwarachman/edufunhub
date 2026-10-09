package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/pingpong"
)

// pingpongSub is one connected Ping Pong player.
type pingpongSub struct {
	claims auth.Claims
	send   func(pingpong.Message)
	cancel context.CancelFunc
}

// RunPingPong drives Ping Pong room timers (answer timeout, bot returns).
func (s *Server) RunPingPong(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.pushPingPong(append(s.pingpong.Tick(now), s.pingpong.HandOver(now)...), now)
			s.reportPingPong()
		}
	}
}

// reportPingPong sends finished Ping Pong results to Laravel.
func (s *Server) reportPingPong() {
	for _, res := range s.pingpong.TakeResults() {
		go s.report(res)
	}
}

// pushPingPong sends the current state to every listed, connected player.
func (s *Server) pushPingPong(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*pingpongSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.pingpongSubs[id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.pingpong.State(sub.claims, now))
	}
}

// servePingPong runs the online Ping Pong room WebSocket.
func (s *Server) servePingPong(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, pingpong.GameKey, s.cfg.Now())
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
	send := func(msg pingpong.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &pingpongSub{claims: claims, send: send, cancel: cancel}

	s.mu.Lock()
	if prev, ok := s.pingpongSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.pingpongSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.pingpong.Join(claims, r.URL.Query().Get("locale"))
	now := s.cfg.Now()
	s.pushPingPong(append(s.pingpong.Peers(claims.Subject), claims.Subject), now)

	fail := func(err error) {
		send(pingpong.Message{"t": "error", "code": err.Error()})
	}
	for {
		var in struct {
			T       string `json:"t"`
			Pin     string `json:"pin"`
			Round   int    `json:"round"`
			Option  int    `json:"option"`
			Subject string `json:"subject"`
			Seconds int    `json:"seconds"`
			Locale  string `json:"locale"`
		}
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		var ids []int64
		var err error
		switch in.T {
		case "create":
			_, ids = s.pingpong.Create(claims, now)
		case "join":
			ids, err = s.pingpong.Enter(claims, in.Pin, now)
		case "leave":
			var paid int
			ids, paid = s.pingpong.Leave(claims.Subject, now)
			if paid >= 0 {
				send(pingpong.Message{"t": "left", "points": paid})
			}
		case "subject":
			ids, err = s.pingpong.SetSubject(claims.Subject, in.Subject, now)
		case "answer_time":
			ids, err = s.pingpong.SetAnswerTime(claims.Subject, in.Seconds, now)
		case "stop":
			ids, err = s.pingpong.Stop(claims.Subject, now)
		case "sync":
			ids = []int64{claims.Subject}
		case "start":
			ids, err = s.pingpong.Start(claims.Subject, now)
		case "answer":
			ids, err = s.pingpong.Answer(claims.Subject, in.Round, in.Option, now)
		case "locale":
			s.pingpong.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			send(pingpong.Message{"t": "pong"})
			continue
		default:
			send(pingpong.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			fail(err)
			continue
		}
		s.pushPingPong(ids, now)
		s.reportPingPong()
	}

	s.mu.Lock()
	current := s.pingpongSubs[claims.Subject] == sub
	if current {
		delete(s.pingpongSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.pingpong.Offline(claims.Subject)
		s.pushPingPong(s.pingpong.Peers(claims.Subject), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
