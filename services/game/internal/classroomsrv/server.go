// Package classroomsrv exposes the 3D classroom world over HTTP/WebSocket. It
// runs in its own container (edufunhub-classroom), separate from the game
// service, and shares the game service secret for tokens and signatures.
package classroomsrv

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/classroom"
)

// signatureTolerance is the accepted clock skew for signed internal calls.
const signatureTolerance = 5 * time.Minute

// Config for the classroom server.
type Config struct {
	Secret []byte
	// ChatURL receives proximity `say` messages from the classroom world
	// (signed like game results). Empty = not stored.
	ChatURL        string
	AllowedOrigins []string
	Now            func() time.Time
	HTTPClient     *http.Client
	Logger         *slog.Logger
	// Classroom world tuning (zero = classroom defaults).
	Classroom classroom.Config
}

// Server serves the classroom world.
type Server struct {
	cfg       Config
	classroom *classroom.Hub
}

// New builds a classroom server.
func New(cfg Config) *Server {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Second}
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	s := &Server{cfg: cfg}
	if cfg.Classroom.Now == nil {
		cfg.Classroom.Now = cfg.Now
	}
	if cfg.Classroom.Seed == 0 {
		cfg.Classroom.Seed = uint64(cfg.Now().UnixNano()) ^ 0xc1a5
	}
	if cfg.Classroom.OnSay == nil && cfg.ChatURL != "" {
		cfg.Classroom.OnSay = s.reportSay
	}
	s.cfg = cfg
	s.classroom = classroom.NewHub(cfg.Classroom)
	return s
}

// Handler returns the HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"edufunhub-classroom","protocol":1}`))
	})
	mux.HandleFunc("GET /ws/classroom", s.serveClassroom)
	mux.HandleFunc("POST /internal/classroom/kick", s.serveKick)
	return mux
}

// serveClassroom runs the 3D classroom world WebSocket. The token must carry
// a classroom id; rooms are keyed by it.
func (s *Server) serveClassroom(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, classroom.GameKey, s.cfg.Now())
	if err != nil || claims.Classroom <= 0 {
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

	write := func(msg any) error {
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		return wsjson.Write(wctx, conn, msg)
	}

	client := classroom.NewClient()
	if err := s.classroom.Join(claims, client); err != nil {
		code := "unavailable"
		if errors.Is(err, classroom.ErrFull) {
			code = "full"
		}
		_ = write(classroom.Message{"t": "error", "code": code})
		conn.Close(websocket.StatusPolicyViolation, code)
		return
	}
	defer s.classroom.Leave(claims.Classroom, claims.Subject, client)

	// Writer: drains the hub queue; on kick or replacement it flushes what is
	// queued (e.g. `kicked`) and closes the socket.
	go func() {
		defer cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-client.Out():
				if write(msg) != nil {
					return
				}
			case <-client.Done():
				for {
					select {
					case msg := <-client.Out():
						_ = write(msg)
					default:
						conn.Close(websocket.StatusNormalClosure, "")
						return
					}
				}
			}
		}
	}()

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		var in classroom.Inbound
		if json.Unmarshal(data, &in) != nil {
			continue
		}
		s.classroom.Handle(claims.Classroom, claims.Subject, client, in)
	}
	conn.Close(websocket.StatusNormalClosure, "")
}

// serveKick removes a user (0 = everyone) from a classroom world.
// POST /internal/classroom/kick {"classroom":int,"user":int}, signed like results.
func (s *Server) serveKick(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > signatureTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, body)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var in struct {
		Classroom int64 `json:"classroom"`
		User      int64 `json:"user"`
	}
	if json.Unmarshal(body, &in) != nil || in.Classroom <= 0 || in.User < 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.classroom.Kick(in.Classroom, in.User)
	w.WriteHeader(http.StatusNoContent)
}

// reportSay stores one proximity `say` in Laravel: POST JSON
// {event_id, classroom, from, to, text, at} to ChatURL, signed like results,
// retried 3 times. Laravel dedupes by event_id.
func (s *Server) reportSay(ev classroom.SayEvent) {
	if s.cfg.ChatURL == "" {
		return
	}
	body, _ := json.Marshal(ev)
	for attempt := 1; attempt <= 3; attempt++ {
		err := s.post(s.cfg.ChatURL, body)
		if err == nil {
			return
		}
		s.cfg.Logger.Warn("classroom chat report failed", "event", ev.EventID, "attempt", attempt, "err", err)
		if attempt < 3 {
			time.Sleep(time.Duration(attempt) * time.Second)
		}
	}
}

// Sign computes the signature header value: hex(HMAC_SHA256(secret, ts+"."+body)).
func Sign(secret []byte, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// post sends a signed JSON body to url.
func (s *Server) post(url string, body []byte) error {
	ts := strconv.FormatInt(s.cfg.Now().Unix(), 10)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Game-Timestamp", ts)
	req.Header.Set("X-Game-Signature", Sign(s.cfg.Secret, ts, body))
	res, err := s.cfg.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return errors.New("status " + res.Status)
	}
	return nil
}
