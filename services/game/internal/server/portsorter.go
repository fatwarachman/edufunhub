package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/portsorter"
)

// servePortSorter runs the Port Sorter referee over WebSocket.
func (s *Server) servePortSorter(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, portsorter.GameKey, s.cfg.Now())
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
	if prev, ok := s.portConns[claims.Subject]; ok {
		prev.cancel()
	}
	current := &connection{cancel: cancel}
	s.portConns[claims.Subject] = current
	sess, ok := s.ports[claims.Subject]
	if !ok || sess.Claims.Name != claims.Name {
		sess = portsorter.New(claims, r.URL.Query().Get("locale"), s.cfg.Now())
		s.ports[claims.Subject] = sess
	} else {
		sess.SetLocale(r.URL.Query().Get("locale"))
	}
	s.mu.Unlock()

	var writeMu sync.Mutex
	send := func(msg portsorter.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	finish := func(res *portsorter.Result) {
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
			send(sess.Start(in.Value, now))
		case "choose":
			send(sess.Choose(in.Value, now))
		case "land":
			msg, res, err := sess.Land(in.Packet, in.Option, now)
			if err != nil {
				send(portsorter.Message{"t": "error", "code": err.Error()})
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
			send(portsorter.Message{"t": "pong"})
		default:
			send(portsorter.Message{"t": "error", "code": "unknown_type"})
		}
	}
	s.mu.Lock()
	if s.portConns[claims.Subject] == current {
		delete(s.portConns, claims.Subject)
	}
	s.mu.Unlock()
	conn.Close(websocket.StatusNormalClosure, "")
}
