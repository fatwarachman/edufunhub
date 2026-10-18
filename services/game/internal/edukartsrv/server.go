// Package edukartsrv serves EduKart (Balap Kuis 3D) over HTTP/WebSocket. It
// runs in its own container (edufunhub-edukart), separate from the game
// service, and shares the game service secret for tokens and signatures.
package edukartsrv

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
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/edukart"
	"edufunhub/game/internal/lobby"
)

// signatureTolerance is the accepted clock skew for signed internal calls.
const signatureTolerance = 5 * time.Minute

// classroomEnded is the error code sent when a teacher closes the classroom.
const classroomEnded = "classroom_ended"

// outbox is how many messages may wait for a slow client before it is dropped.
const outbox = 64

// Config for the EduKart server.
type Config struct {
	Secret         []byte
	ResultURL      string
	AllowedOrigins []string
	Now            func() time.Time
	HTTPClient     *http.Client
	Logger         *slog.Logger
	Seed           uint64
}

// sub is one connected player.
type sub struct {
	claims   auth.Claims
	out      chan edukart.Message
	cancel   context.CancelFunc
	mu       sync.Mutex
	track    string // track id last sent to this connection
	conn     *websocket.Conn
	replaced atomic.Bool // a newer connection of the same account took over
}

// StatusReplaced closes a connection that a newer tab or device of the same
// account took over; clients must not reconnect on it.
const StatusReplaced websocket.StatusCode = 4001

// send queues msg; a client that cannot keep up is disconnected.
func (c *sub) send(msg edukart.Message) {
	if msg == nil {
		return
	}
	select {
	case c.out <- msg:
	default:
		c.cancel()
	}
}

// Server serves EduKart.
type Server struct {
	cfg     Config
	hub     *edukart.Hub
	started time.Time
	mu      sync.Mutex
	subs    map[int64]*sub
}

// New builds an EduKart server.
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
	if cfg.Seed == 0 {
		cfg.Seed = uint64(cfg.Now().UnixNano()) ^ 0xed0ca7
	}
	return &Server{cfg: cfg, hub: edukart.NewHub(cfg.Seed), started: cfg.Now(), subs: map[int64]*sub{}}
}

// Hub exposes the referee (tests).
func (s *Server) Hub() *edukart.Hub { return s.hub }

// Handler returns the HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"edufunhub-edukart","protocol":1}`))
	})
	mux.HandleFunc("GET /ws/edu-kart", s.serveWS)
	mux.HandleFunc("GET /internal/presence", s.servePresence)
	mux.HandleFunc("GET /internal/room", s.serveFindPin)
	mux.HandleFunc("GET /internal/live-rooms", s.serveLiveRooms)
	mux.HandleFunc("GET /internal/stats", s.serveStats)
	mux.HandleFunc("POST /internal/classroom/close", s.serveClassroomClose)
	return mux
}

// Run drives races (20 Hz frames), host hand over, results and pruning.
func (s *Server) Run(ctx context.Context) {
	t := time.NewTicker(edukart.TickMs * time.Millisecond)
	defer t.Stop()
	lastPrune := s.cfg.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := s.cfg.Now()
			s.Step(now)
			if now.Sub(lastPrune) >= time.Minute {
				lastPrune = now
				s.hub.Prune(now)
			}
		}
	}
}

// Step runs one referee tick: frames to racers, state on phase changes.
func (s *Server) Step(now time.Time) {
	state, frames := s.hub.Tick(now)
	s.pushFrames(frames, now)
	s.push(append(state, s.hub.HandOver(now)...), now)
	s.reportResults()
}

func (s *Server) pick(ids []int64) []*sub {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*sub, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if c, ok := s.subs[id]; ok && !seen[id] {
			seen[id] = true
			out = append(out, c)
		}
	}
	return out
}

// push sends edukart_state (after edukart_track when the room's circuit
// differs from what the connection has) to the listed players.
func (s *Server) push(ids []int64, now time.Time) {
	for _, c := range s.pick(ids) {
		s.sendTrack(c, false)
		c.send(s.hub.State(c.claims, now))
	}
}

// sendTrack sends edukart_track when needed (always when force).
func (s *Server) sendTrack(c *sub, force bool) {
	msg := s.hub.TrackMessage(c.claims)
	id := ""
	if raw, ok := msg["track"].(json.RawMessage); ok {
		var head struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(raw, &head)
		id = head.ID
	}
	c.mu.Lock()
	changed := force || c.track != id
	c.track = id
	c.mu.Unlock()
	if changed {
		c.send(msg)
	}
}

func (s *Server) pushFrames(ids []int64, now time.Time) {
	for _, c := range s.pick(ids) {
		c.send(s.hub.Frame(c.claims, now))
	}
}

func (s *Server) reportResults() {
	for _, res := range s.hub.TakeResults() {
		go s.report(res)
	}
}

// inbound is every client message field.
type inbound struct {
	T        string  `json:"t"`
	Pin      string  `json:"pin"`
	Subject  string  `json:"subject"`
	Locale   string  `json:"locale"`
	Track    *string `json:"track"`
	Laps     *int    `json:"laps"`
	Bots     *bool   `json:"bots"`
	Vehicle  string  `json:"vehicle"`
	Seq      int     `json:"seq"`
	Steer    float64 `json:"steer"`
	Throttle float64 `json:"throttle"`
	Drift    bool    `json:"drift"`
	Hop      int     `json:"hop"`
	Turbo    int     `json:"turbo"`
	Fire     int     `json:"fire"`
}

// serveWS runs the EduKart room WebSocket.
func (s *Server) serveWS(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, edukart.GameKey, s.cfg.Now())
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

	c := &sub{claims: claims, out: make(chan edukart.Message, outbox), cancel: cancel, conn: conn}
	go func() {
		defer cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-c.out:
				wctx, done := context.WithTimeout(ctx, 3*time.Second)
				err := wsjson.Write(wctx, conn, msg)
				done()
				if err != nil {
					return
				}
			}
		}
	}()

	s.mu.Lock()
	if prev, ok := s.subs[claims.Subject]; ok {
		// Tell the older tab/device it was replaced, so it stops instead of
		// reconnecting and kicking this one out in turn (a reconnect loop).
		// Closing first sends the code; cancelling first would drop the TCP
		// connection without it.
		prev.replaced.Store(true)
		go func() {
			ctx, done := context.WithTimeout(context.Background(), 2*time.Second)
			defer done()
			// Browsers may report this close as 1006, so the message is
			// what clients rely on.
			_ = wsjson.Write(ctx, prev.conn, map[string]string{"t": "replaced"})
			prev.conn.Close(StatusReplaced, "replaced")
			prev.cancel()
		}()
	}
	s.subs[claims.Subject] = c
	s.mu.Unlock()

	s.hub.Join(claims, r.URL.Query().Get("locale"))
	now := s.cfg.Now()
	s.sendTrack(c, true)
	s.push(append(s.hub.Peers(claims.Subject), claims.Subject), now)

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
			_, ids = s.hub.Create(claims, now)
		case "join":
			ids, err = s.hub.Enter(claims, in.Pin, now)
		case "classroom":
			ids, err = s.hub.EnterClassroom(claims, now)
		case "leave":
			var paid int
			ids, paid = s.hub.Leave(claims.Subject, now)
			if paid >= 0 {
				c.send(edukart.Message{"t": "left", "points": paid})
			}
		case "start":
			ids, err = s.hub.Start(claims.Subject, now)
		case "stop":
			ids, err = s.hub.Stop(claims.Subject, now)
		case "subject":
			ids, err = s.hub.SetSubject(claims.Subject, in.Subject, now)
		case "settings":
			ids, _, err = s.hub.Configure(claims.Subject, edukart.Settings{Track: in.Track, Laps: in.Laps, Bots: in.Bots}, now)
		case "vehicle":
			ids, err = s.hub.SetVehicle(claims.Subject, in.Vehicle, now)
		case "input":
			_ = s.hub.Input(claims.Subject, edukart.Input{Seq: in.Seq, Steer: in.Steer, Throttle: in.Throttle, Drift: in.Drift, Hop: in.Hop, Turbo: in.Turbo, Fire: in.Fire}, now)
			continue
		case "sync":
			s.sendTrack(c, true)
			ids = []int64{claims.Subject}
		case "locale":
			s.hub.SetLocale(claims.Subject, in.Locale)
			ids = []int64{claims.Subject}
		case "ping":
			c.send(edukart.Message{"t": "pong"})
			continue
		default:
			c.send(edukart.Message{"t": "error", "code": "unknown_type"})
			continue
		}
		if err != nil {
			c.send(edukart.Message{"t": "error", "code": err.Error()})
			continue
		}
		s.push(ids, now)
		s.reportResults()
	}

	s.mu.Lock()
	current := s.subs[claims.Subject] == c
	if current {
		delete(s.subs, claims.Subject)
	}
	s.mu.Unlock()
	if current {
		s.hub.Offline(claims.Subject)
		s.push(s.hub.Peers(claims.Subject), s.cfg.Now())
	}
	if c.replaced.Load() {
		return // the takeover goroutine is closing it with StatusReplaced
	}
	conn.Close(websocket.StatusNormalClosure, "")
}

// Activity is one running room of a player (same shape as the game service).
type Activity struct {
	Game  string `json:"game"`
	Pin   string `json:"pin,omitempty"`
	Phase string `json:"phase"`
	Host  bool   `json:"host"`
}

// RoomMatch is an open room owning a PIN (same shape as the game service).
type RoomMatch struct {
	Game  string `json:"game"`
	Phase string `json:"phase"`
	Open  bool   `json:"open"`
}

// LiveRoom is a read-only room summary for admin monitoring.
type LiveRoom struct {
	Game    string `json:"game"`
	Pin     string `json:"pin,omitempty"`
	Phase   string `json:"phase"`
	Players int    `json:"players"`
}

// Usage counts live connections and rooms.
type Usage struct {
	Game        string `json:"game"`
	Connections int    `json:"connections"`
	Sessions    int    `json:"sessions"`
}

// Stats is the runtime snapshot for the admin resource monitor.
type Stats struct {
	Service        string  `json:"service"`
	GoVersion      string  `json:"go_version"`
	UptimeSeconds  int64   `json:"uptime_seconds"`
	Goroutines     int     `json:"goroutines"`
	HeapAllocBytes uint64  `json:"heap_alloc_bytes"`
	SysBytes       uint64  `json:"sys_bytes"`
	GCCycles       uint32  `json:"gc_cycles"`
	CPUs           int     `json:"cpus"`
	Games          []Usage `json:"games"`
}

var pinPattern = regexp.MustCompile(`^\d{6}$`)

// signedGet verifies a signed GET (signature over the empty body).
func (s *Server) signedGet(w http.ResponseWriter, r *http.Request) bool {
	return s.verify(w, r, nil)
}

func (s *Server) verify(w http.ResponseWriter, r *http.Request, body []byte) bool {
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > signatureTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, body)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

// servePresence: GET /internal/presence?user=ID (signed).
func (s *Server) servePresence(w http.ResponseWriter, r *http.Request) {
	if !s.signedGet(w, r) {
		return
	}
	uid, err := strconv.ParseInt(r.URL.Query().Get("user"), 10, 64)
	if err != nil || uid <= 0 {
		http.Error(w, "bad user", http.StatusBadRequest)
		return
	}
	out := []Activity{}
	if p, ok := s.hub.Presence(uid); ok && p.Phase != lobby.PhaseDone {
		out = append(out, Activity{Game: edukart.GameKey, Pin: p.Pin, Phase: p.Phase, Host: p.Host})
	}
	writeJSON(w, map[string]any{"rooms": out})
}

// serveFindPin: GET /internal/room?pin=123456 (signed).
func (s *Server) serveFindPin(w http.ResponseWriter, r *http.Request) {
	if !s.signedGet(w, r) {
		return
	}
	pin := r.URL.Query().Get("pin")
	if !pinPattern.MatchString(pin) {
		http.Error(w, "bad pin", http.StatusBadRequest)
		return
	}
	out := []RoomMatch{}
	if phase, ok := s.hub.RoomPhase(pin); ok && phase != lobby.PhaseDone {
		out = append(out, RoomMatch{Game: edukart.GameKey, Phase: phase, Open: phase == lobby.PhaseLobby})
	}
	writeJSON(w, map[string]any{"rooms": out})
}

// serveLiveRooms: GET /internal/live-rooms (signed).
func (s *Server) serveLiveRooms(w http.ResponseWriter, r *http.Request) {
	if !s.signedGet(w, r) {
		return
	}
	out := []LiveRoom{}
	for _, room := range s.hub.RoomsSummary() {
		out = append(out, LiveRoom{Game: edukart.GameKey, Pin: room.Pin, Phase: room.Phase, Players: room.Players})
	}
	writeJSON(w, map[string]any{"rooms": out})
}

// Snapshot reports runtime memory and connection counts.
func (s *Server) Snapshot() Stats {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	s.mu.Lock()
	conns := len(s.subs)
	s.mu.Unlock()
	rooms, _ := s.hub.Counts()
	return Stats{
		Service: "edufunhub-edukart", GoVersion: runtime.Version(),
		UptimeSeconds: int64(s.cfg.Now().Sub(s.started).Seconds()), Goroutines: runtime.NumGoroutine(),
		HeapAllocBytes: mem.HeapAlloc, SysBytes: mem.Sys, GCCycles: mem.NumGC, CPUs: runtime.NumCPU(),
		Games: []Usage{{Game: edukart.GameKey, Connections: conns, Sessions: rooms}},
	}
}

// serveStats: GET /internal/stats (signed).
func (s *Server) serveStats(w http.ResponseWriter, r *http.Request) {
	if !s.signedGet(w, r) {
		return
	}
	writeJSON(w, s.Snapshot())
}

// serveClassroomClose: POST /internal/classroom/close {"classroom": id}
// (signed over the body). Closes the classroom's rooms, 204 on success.
func (s *Server) serveClassroomClose(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if !s.verify(w, r, body) {
		return
	}
	var in struct {
		Classroom int64 `json:"classroom"`
	}
	if json.Unmarshal(body, &in) != nil || in.Classroom <= 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	now := s.cfg.Now()
	ids := s.hub.CloseClassroom(in.Classroom, now)
	for _, c := range s.pick(ids) {
		c.send(edukart.Message{"t": "error", "code": classroomEnded})
	}
	s.push(ids, now)
	s.reportResults()
	w.WriteHeader(http.StatusNoContent)
}

// Sign computes the signature header value: hex(HMAC_SHA256(secret, ts+"."+body)).
func Sign(secret []byte, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// report posts one result to Laravel, retried 3 times.
func (s *Server) report(result any) {
	if s.cfg.ResultURL == "" {
		return
	}
	body, _ := json.Marshal(result)
	for attempt := 1; attempt <= 3; attempt++ {
		err := s.post(s.cfg.ResultURL, body)
		if err == nil {
			s.cfg.Logger.Info("result reported", "body", string(body))
			return
		}
		s.cfg.Logger.Warn("result report failed", "body", string(body), "attempt", attempt, "err", err)
		time.Sleep(time.Duration(attempt) * time.Second)
	}
}

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
