package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/train"
)

// serveTrain runs the Kereta Pengetahuan referee over WebSocket.
func (s *Server) serveTrain(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, train.GameKey, s.cfg.Now())
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

	s.mu.Lock()
	if prev, ok := s.trainConns[claims.Subject]; ok {
		prev.cancel()
	}
	current := &connection{cancel: cancel}
	s.trainConns[claims.Subject] = current
	sess, ok := s.trains[claims.Subject]
	if !ok || sess.Claims.Grade != claims.Grade || sess.Claims.Name != claims.Name {
		sess = train.New(claims, r.URL.Query().Get("locale"), s.cfg.Now())
		s.trains[claims.Subject] = sess
	} else {
		sess.SetLocale(r.URL.Query().Get("locale"))
	}
	s.mu.Unlock()

	var writeMu sync.Mutex
	send := func(msg train.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	finish := func(res *train.Result) {
		if res != nil {
			go s.report(*res)
		}
	}
	send(sess.State(s.cfg.Now()))

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				msg, res := sess.Tick(s.cfg.Now())
				send(msg)
				finish(res)
			}
		}
	}()

	for {
		var in inbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		now := s.cfg.Now()
		switch in.T {
		case "start":
			sess.SetSubject(in.Subject)
			send(sess.Start(now))
		case "pass":
			msg, res, err := sess.Pass(in.Option, now)
			if err != nil {
				send(train.Message{"t": "error", "code": err.Error()})
				continue
			}
			send(msg)
			finish(res)
		case "pause":
			send(sess.Pause(now))
		case "resume":
			send(sess.Resume(now))
		case "locale":
			sess.SetLocale(in.Locale)
			send(sess.State(now))
		case "ping":
			send(train.Message{"t": "pong"})
		default:
			send(train.Message{"t": "error", "code": "unknown_type"})
		}
	}
	s.mu.Lock()
	if s.trainConns[claims.Subject] == current {
		delete(s.trainConns, claims.Subject)
	}
	s.mu.Unlock()
	conn.Close(websocket.StatusNormalClosure, "")
}
