// Package server exposes the chat WebSocket and the signed publish endpoint.
package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"edufunhub/chat/internal/auth"
	"edufunhub/chat/internal/hub"
)

// MaxPublishBytes caps one publish request from Laravel.
const MaxPublishBytes = 64 << 10

// MaxPublishUsers caps recipients of one event (largest group).
const MaxPublishUsers = 200

// PingInterval keeps idle sockets alive through proxies.
const PingInterval = 25 * time.Second

// Config for the server.
type Config struct {
	Secret         []byte
	AllowedOrigins []string
	Logger         *slog.Logger
	Now            func() time.Time
}

// Server wires HTTP routes to the hub.
type Server struct {
	cfg Config
	hub *hub.Hub
}

// New creates a server.
func New(cfg Config) *Server {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &Server{cfg: cfg, hub: hub.New()}
}

// Hub exposes the hub (tests).
func (s *Server) Hub() *hub.Hub { return s.hub }

// Handler returns the HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		users, sockets := s.hub.Stats()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "service": "edufunhub-chat", "users": users, "sockets": sockets})
	})
	mux.HandleFunc("GET /ws", s.serveWS)
	mux.HandleFunc("POST /internal/publish", s.publish)
	return mux
}

type publishRequest struct {
	Users []int64         `json:"users"`
	Event json.RawMessage `json:"event"`
}

func (s *Server) publish(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxPublishBytes+1))
	if err != nil || len(body) > MaxPublishBytes {
		http.Error(w, "too large", http.StatusRequestEntityTooLarge)
		return
	}
	if !auth.VerifyRequest(s.cfg.Secret, r.Header.Get("X-Chat-Timestamp"), r.Header.Get("X-Chat-Signature"), body, s.cfg.Now(), 5*time.Minute) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req publishRequest
	if json.Unmarshal(body, &req) != nil || len(req.Event) == 0 || req.Event[0] != '{' || len(req.Users) == 0 || len(req.Users) > MaxPublishUsers {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	sent := s.hub.Publish(req.Users, req.Event)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"delivered": sent})
}

func (s *Server) serveWS(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, s.cfg.Now())
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	// Clients only send pings; messages go through Laravel.
	conn.SetReadLimit(512)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := s.hub.Register(claims.Subject)
	defer s.hub.Unregister(client)

	go func() {
		defer cancel()
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()

	hello, _ := json.Marshal(map[string]any{"t": "hello", "user": claims.Subject})
	if write(ctx, conn, hello) != nil {
		return
	}
	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()
	expires := time.Until(time.Unix(claims.Expires, 0))
	if expires < time.Second {
		expires = time.Second
	}
	expiry := time.NewTimer(expires)
	defer expiry.Stop()

	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "")
			return
		case <-client.Done:
			conn.Close(websocket.StatusTryAgainLater, "dropped")
			return
		case <-expiry.C:
			conn.Close(websocket.StatusPolicyViolation, "token_expired")
			return
		case event := <-client.Send:
			if write(ctx, conn, event) != nil {
				return
			}
		case <-ticker.C:
			pctx, pcancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pctx)
			pcancel()
			if err != nil {
				return
			}
		}
	}
}

func write(ctx context.Context, conn *websocket.Conn, payload []byte) error {
	wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return conn.Write(wctx, websocket.MessageText, payload)
}
