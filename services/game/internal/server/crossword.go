package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/crossword"
)

type crosswordSub struct {
	claims auth.Claims
	send   func(crossword.Message)
	cancel context.CancelFunc
}

// RunCrosswords ends rooms whose time ran out and reports results.
func (s *Server) RunCrosswords(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.pushCrossword(s.crosswords.Tick(now), now)
			s.reportCrosswords()
		}
	}
}

func (s *Server) reportCrosswords() {
	for _, res := range s.crosswords.TakeResults() {
		go s.report(res)
	}
}

func (s *Server) pushCrossword(ids []int64, now time.Time) {
	s.mu.Lock()
	subs := make([]*crosswordSub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := s.crosswordSubs[id]; ok && !seen[id] {
			seen[id] = true
			subs = append(subs, sub)
		}
	}
	s.mu.Unlock()
	for _, sub := range subs {
		sub.send(s.crosswords.State(sub.claims, now))
	}
}

// serveCrossword runs the Teka-Teki Silang room WebSocket.
func (s *Server) serveCrossword(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, crossword.GameKey, s.cfg.Now())
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
	send := func(msg crossword.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	sub := &crosswordSub{claims: claims, send: send, cancel: cancel}
	s.mu.Lock()
	if prev, ok := s.crosswordSubs[claims.Subject]; ok {
		prev.cancel()
	}
	s.crosswordSubs[claims.Subject] = sub
	s.mu.Unlock()

	s.crosswords.Join(claims, r.URL.Query().Get("locale"))
	s.pushCrossword(append(s.crosswords.Peers(claims.Subject), claims.Subject), s.cfg.Now())

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
			ids, err = s.crosswords.Create(claims, in.Level, now)
		case "join":
			ids, err = s.crosswords.Enter(claims, in.Pin, now)
		case "leave":
			ids = s.crosswords.Leave(claims.Subject, now)
		case "level":
			ids, err = s.crosswords.SetLevel(claims.Subject, in.Level, now)
		case "start":
			ids, err = s.crosswords.Start(claims.Subject, now)
		case "guess":
			var right bool
			ids, right, err = s.crosswords.Guess(claims.Subject, in.Word, in.Value, now)
			if err == nil {
				send(crossword.Message{"t": "guess", "word": in.Word, "correct": right})
			}
		case "hint":
			ids, err = s.crosswords.Hint(claims.Subject, in.Word, now)
		case "locale":
			s.crosswords.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			send(crossword.Message{"t": "pong"})
			continue
		default:
			send(crossword.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			send(crossword.Message{"t": "error", "code": err.Error()})
			continue
		}
		s.pushCrossword(ids, now)
		s.reportCrosswords()
	}

	s.mu.Lock()
	current := s.crosswordSubs[claims.Subject] == sub
	if current {
		delete(s.crosswordSubs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.crosswords.Offline(claims.Subject)
		s.pushCrossword(s.crosswords.Peers(claims.Subject), s.cfg.Now())
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
