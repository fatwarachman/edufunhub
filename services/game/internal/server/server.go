// Package server exposes the WebSocket gameplay API.
package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/blockbattle"
	"edufunhub/game/internal/crossword"
	"edufunhub/game/internal/duel"
	"edufunhub/game/internal/floordrop"
	"edufunhub/game/internal/heist"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/minigames"
	"edufunhub/game/internal/orderrush"
	"edufunhub/game/internal/portsorter"
	"edufunhub/game/internal/session"
	"edufunhub/game/internal/sky"
	"edufunhub/game/internal/snakes"
	"edufunhub/game/internal/train"
	"edufunhub/game/internal/turbotrivia"
)

// Config for the server.
type Config struct {
	Secret         []byte
	ResultURL      string
	AllowedOrigins []string
	Now            func() time.Time
	HTTPClient     *http.Client
	Logger         *slog.Logger
	// FloorDrop timings (zero = floordrop.Defaults).
	FloorDrop floordrop.Config
	// Heist timings (zero = heist.Defaults).
	Heist heist.Config
	// OrderRush timings (zero = orderrush.Defaults).
	OrderRush orderrush.Config
	// TurboTrivia timings (zero = turbotrivia.Defaults).
	TurboTrivia turbotrivia.Config
	// BlockBattle timings (zero = blockbattle.Defaults).
	BlockBattle blockbattle.Config
}

type connection struct{ cancel context.CancelFunc }

// Server holds sessions keyed by user id so a reconnect resumes progress.
type Server struct {
	cfg           Config
	mu            sync.Mutex
	sessions      map[int64]*session.Session
	conns         map[int64]*connection
	skies         map[int64]*sky.Session
	skyConns      map[int64]*connection
	trains        map[int64]*train.Session
	trainConns    map[int64]*connection
	ports         map[int64]*portsorter.Session
	portConns     map[int64]*connection
	duels         *duel.Hub
	duelSubs      map[int64]*duelSub
	duelRooms     *lobby.Hub[struct{}, struct{}]
	snakes        *snakes.Hub
	snakesSubs    map[int64]*snakesSub
	crosswords    *crossword.Hub
	crosswordSubs map[int64]*crosswordSub
	minis         map[string]*minigames.Hub
	miniSubs      map[string]map[int64]*miniSub
	floor         *floordrop.Hub
	floorConns    map[floorKey]*floordrop.Client
	heist         *heist.Hub
	heistConns    map[floorKey]*heist.Client
	rush          *orderrush.Hub
	rushConns     map[floorKey]*orderrush.Client
	turbo         *turbotrivia.Hub
	turboConns    map[floorKey]*turbotrivia.Client
	block         *blockbattle.Hub
	blockConns    map[floorKey]*blockbattle.Client
	started       time.Time
}

// New builds a server.
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
	if cfg.FloorDrop.Tick == 0 {
		cfg.FloorDrop = floordrop.Defaults
	}
	if cfg.Heist.Tick == 0 {
		cfg.Heist = heist.Defaults
	}
	if cfg.OrderRush.Tick == 0 {
		cfg.OrderRush = orderrush.Defaults
	}
	if cfg.TurboTrivia.Tick == 0 {
		cfg.TurboTrivia = turbotrivia.Defaults
	}
	if cfg.BlockBattle.Tick == 0 {
		cfg.BlockBattle = blockbattle.Defaults
	}
	s := &Server{
		cfg: cfg, sessions: map[int64]*session.Session{}, conns: map[int64]*connection{},
		skies: map[int64]*sky.Session{}, skyConns: map[int64]*connection{},
		trains: map[int64]*train.Session{}, trainConns: map[int64]*connection{},
		ports: map[int64]*portsorter.Session{}, portConns: map[int64]*connection{},
		duels: duel.NewHub(uint64(cfg.Now().UnixNano())), duelSubs: map[int64]*duelSub{},
		duelRooms: lobby.New[struct{}, struct{}](uint64(cfg.Now().UnixNano())^0xd0e1, lobby.Config{Min: 2, Max: 2}),
		snakes:    snakes.NewHub(uint64(cfg.Now().UnixNano()) ^ 0x51ed), snakesSubs: map[int64]*snakesSub{},
		crosswords: crossword.NewHub(uint64(cfg.Now().UnixNano()) ^ 0xc055), crosswordSubs: map[int64]*crosswordSub{},
		minis: map[string]*minigames.Hub{}, miniSubs: map[string]map[int64]*miniSub{},
		floor:      floordrop.NewHub(cfg.FloorDrop, uint64(cfg.Now().UnixNano())^0xf1d0),
		floorConns: map[floorKey]*floordrop.Client{},
		heist:      heist.NewHub(cfg.Heist, uint64(cfg.Now().UnixNano())^0x4e57),
		heistConns: map[floorKey]*heist.Client{},
		rush:       orderrush.NewHub(cfg.OrderRush, uint64(cfg.Now().UnixNano())^0x0d3e),
		rushConns:  map[floorKey]*orderrush.Client{},
		turbo:      turbotrivia.NewHub(cfg.TurboTrivia, uint64(cfg.Now().UnixNano())^0x7b70),
		turboConns: map[floorKey]*turbotrivia.Client{},
		block:      blockbattle.NewHub(cfg.BlockBattle, uint64(cfg.Now().UnixNano())^0xb10c),
		blockConns: map[floorKey]*blockbattle.Client{},
		started:    cfg.Now(),
	}
	for i, key := range minigames.Keys {
		s.minis[key] = minigames.NewHub(minigames.Specs[key], uint64(cfg.Now().UnixNano())^uint64(0x3a11+i))
		s.miniSubs[key] = map[int64]*miniSub{}
	}
	return s
}

// Handler returns the HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"edufunhub-game","protocol":1}`))
	})
	mux.HandleFunc("GET /ws", s.serveWS)
	mux.HandleFunc("GET /ws/sky", s.serveSky)
	mux.HandleFunc("GET /ws/duel", s.serveDuel)
	mux.HandleFunc("GET /ws/train", s.serveTrain)
	mux.HandleFunc("GET /ws/port-sorter", s.servePortSorter)
	mux.HandleFunc("GET /ws/snakes", s.serveSnakes)
	mux.HandleFunc("GET /ws/crossword", s.serveCrossword)
	for _, key := range minigames.Keys {
		mux.HandleFunc("GET /ws/"+key, s.serveMini(key))
	}
	mux.HandleFunc("GET /ws/floor-drop", s.serveFloorDrop)
	mux.HandleFunc("GET /ws/economy-heist", s.serveHeist)
	mux.HandleFunc("GET /ws/order-rush", s.serveOrderRush)
	mux.HandleFunc("GET /ws/turbo-trivia", s.serveTurboTrivia)
	mux.HandleFunc("GET /ws/block-battle", s.serveBlockBattle)
	mux.HandleFunc("GET /internal/stats", s.serveStats)
	mux.HandleFunc("GET /internal/presence", s.servePresence)
	mux.HandleFunc("GET /internal/room", s.serveFindPin)
	return mux
}

type inbound struct {
	T       string  `json:"t"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Value   string  `json:"value"`
	Mission string  `json:"mission"`
	Option  int     `json:"option"`
	Locale  string  `json:"locale"`
	Pin     string  `json:"pin"`
	Name    string  `json:"name"`
	Seat    int     `json:"seat"`
	Level   int     `json:"level"`
	Word    int     `json:"word"`
	Subject string  `json:"subject"`
	Packet  string  `json:"packet"`
	Minutes int     `json:"minutes"`
	Seconds int     `json:"seconds"`
}

func (s *Server) serveWS(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, session.GameKey, s.cfg.Now())
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	s.mu.Lock()
	if prev, ok := s.conns[claims.Subject]; ok {
		prev.cancel()
	}
	current := &connection{cancel: cancel}
	s.conns[claims.Subject] = current
	sess, ok := s.sessions[claims.Subject]
	if !ok || sess.Claims.Grade != claims.Grade || sess.Claims.Name != claims.Name {
		fresh := session.New(claims, r.URL.Query().Get("locale"), s.cfg.Now())
		fresh.CarryFrom(sess)
		sess = fresh
		s.sessions[claims.Subject] = sess
	} else {
		sess.SetLocale(r.URL.Query().Get("locale"))
	}
	s.mu.Unlock()

	var writeMu sync.Mutex
	send := func(msg session.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	send(sess.Welcome())

	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				msg, result := sess.Tick(s.cfg.Now())
				send(msg)
				if result != nil {
					go s.report(*result)
				}
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
		case "move":
			send(sess.Move(in.X, in.Y, now))
		case "interact":
			send(sess.Interact(now))
		case "raise":
			send(sess.Raise(now))
		case "answer":
			send(sess.Answer(in.Value, now))
		case "roll":
			send(sess.Roll(now))
		case "leave":
			send(sess.Leave(now))
		case "locale":
			sess.SetLocale(in.Locale)
		case "mission":
			if err := sess.StartMission(in.Mission, in.Subject, now); err != nil {
				send(session.Message{"t": "error", "code": "unknown_mission"})
				continue
			}
			send(sess.Welcome())
		case "ping":
			send(session.Message{"t": "pong"})
		default:
			send(session.Message{"t": "error", "code": "unknown_type"})
		}
	}
	s.mu.Lock()
	if s.conns[claims.Subject] == current {
		delete(s.conns, claims.Subject)
	}
	s.mu.Unlock()
	conn.Close(websocket.StatusNormalClosure, "")
}

// Sign computes the result signature header value.
func Sign(secret []byte, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Server) report(result any) {
	if s.cfg.ResultURL == "" {
		return
	}
	body, _ := json.Marshal(result)
	for attempt := 1; attempt <= 3; attempt++ {
		err := s.post(body)
		if err == nil {
			s.cfg.Logger.Info("result reported", "body", string(body))
			return
		}
		s.cfg.Logger.Warn("result report failed", "body", string(body), "attempt", attempt, "err", err)
		time.Sleep(time.Duration(attempt) * time.Second)
	}
}

func (s *Server) post(body []byte) error {
	ts := strconv.FormatInt(s.cfg.Now().Unix(), 10)
	req, err := http.NewRequest(http.MethodPost, s.cfg.ResultURL, bytes.NewReader(body))
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

// FlagQuestKeep is how long an offline Flag Quest mission is kept.
const FlagQuestKeep = 24 * time.Hour

// Prune drops sessions idle longer than ttl.
func (s *Server) Prune(ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := s.cfg.Now().Add(-ttl)
	// Flag Quest keeps mission progress (cleared gates, checkpoints) for a
	// day, so coming back later continues the mission instead of restarting.
	missionCutoff := s.cfg.Now().Add(-FlagQuestKeep)
	for id, sess := range s.sessions {
		if _, online := s.conns[id]; !online && sess.LastSeen.Before(missionCutoff) {
			delete(s.sessions, id)
		}
	}
	for id, sess := range s.skies {
		if _, online := s.skyConns[id]; !online && sess.LastSeen.Before(cutoff) {
			delete(s.skies, id)
		}
	}
	for id, sess := range s.trains {
		if _, online := s.trainConns[id]; !online && sess.LastSeen.Before(cutoff) {
			delete(s.trains, id)
		}
	}
	for id, sess := range s.ports {
		if _, online := s.portConns[id]; !online && sess.LastSeen.Before(cutoff) {
			delete(s.ports, id)
		}
	}
	s.duels.Prune(s.cfg.Now())
	s.duelRooms.Prune(s.cfg.Now(), 30*time.Minute, 5*time.Minute, nil)
	s.snakes.Prune(s.cfg.Now())
	s.reportSnakes()
	s.crosswords.Prune(s.cfg.Now())
	s.reportCrosswords()
	for _, key := range minigames.Keys {
		s.minis[key].Prune(s.cfg.Now())
	}
	s.reportMinis()
}

// serveSky runs the Sukhoi Sky Quiz referee over WebSocket.
func (s *Server) serveSky(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), s.cfg.Secret, sky.GameKey, s.cfg.Now())
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	conn.SetReadLimit(2048)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	s.mu.Lock()
	if prev, ok := s.skyConns[claims.Subject]; ok {
		prev.cancel()
	}
	current := &connection{cancel: cancel}
	s.skyConns[claims.Subject] = current
	sess, ok := s.skies[claims.Subject]
	if !ok || sess.Claims.Grade != claims.Grade || sess.Claims.Name != claims.Name {
		sess = sky.New(claims, r.URL.Query().Get("locale"), s.cfg.Now())
		s.skies[claims.Subject] = sess
	} else {
		sess.SetLocale(r.URL.Query().Get("locale"))
	}
	s.mu.Unlock()

	var writeMu sync.Mutex
	send := func(msg sky.Message) {
		if msg == nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		wctx, c := context.WithTimeout(ctx, 3*time.Second)
		defer c()
		_ = wsjson.Write(wctx, conn, msg)
	}
	finish := func(res *sky.Result) {
		if res != nil {
			go s.report(*res)
		}
	}
	reply := func(msg sky.Message, res *sky.Result, err error) {
		if err != nil {
			if err != sky.ErrIgnored {
				send(sky.Message{"t": "error", "code": err.Error()})
			}
			return
		}
		send(msg)
		finish(res)
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
		case "touch":
			reply(sess.Touch(in.Option, now))
		case "shoot":
			reply(sess.Shoot(in.Option, now))
		case "miss":
			reply(sess.Miss(now))
		case "crash":
			reply(sess.Crash(now))
		case "drone":
			msg, err := sess.Drone(now)
			reply(msg, nil, err)
		case "pause":
			send(sess.Pause(now))
		case "resume":
			send(sess.Resume(now))
		case "locale":
			sess.SetLocale(in.Locale)
		case "ping":
			send(sky.Message{"t": "pong"})
		default:
			send(sky.Message{"t": "error", "code": "unknown_type"})
		}
	}
	s.mu.Lock()
	if s.skyConns[claims.Subject] == current {
		delete(s.skyConns, claims.Subject)
	}
	s.mu.Unlock()
	conn.Close(websocket.StatusNormalClosure, "")
}
