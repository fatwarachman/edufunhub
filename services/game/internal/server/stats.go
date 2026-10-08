package server

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"runtime"
	"strconv"
	"time"

	"edufunhub/game/internal/minigames"
)

// statsTolerance bounds the clock skew accepted on signed stats requests.
const statsTolerance = 5 * time.Minute

// Stats is the runtime snapshot the Laravel admin reads for the resource monitor.
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

// Usage counts live connections and resumable sessions for one game.
type Usage struct {
	Game        string `json:"game"`
	Connections int    `json:"connections"`
	Sessions    int    `json:"sessions"`
}

// Snapshot reports runtime memory and per-game connection counts.
func (s *Server) Snapshot() Stats {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	s.mu.Lock()
	games := []Usage{
		{Game: "flag-quest", Connections: len(s.conns), Sessions: len(s.sessions)},
		{Game: "sky-quiz", Connections: len(s.skyConns), Sessions: len(s.skies)},
	}
	duelConns := len(s.duelSubs)
	snakesConns := len(s.snakesSubs)
	crosswordConns := len(s.crosswordSubs)
	games = append(games, Usage{Game: "knowledge-train", Connections: len(s.trainConns), Sessions: len(s.trains)})
	games = append(games, Usage{Game: "port-sorter", Connections: len(s.portConns), Sessions: len(s.ports)})
	s.mu.Unlock()
	matches, _ := s.duels.Counts()
	games = append(games, Usage{Game: "quiz-duel", Connections: duelConns, Sessions: matches})
	rooms, _ := s.snakes.Counts()
	games = append(games, Usage{Game: "snakes-and-ladders", Connections: snakesConns, Sessions: rooms})
	cwRooms, _ := s.crosswords.Counts()
	games = append(games, Usage{Game: "crossword", Connections: crosswordConns, Sessions: cwRooms})
	for _, key := range minigames.Keys {
		s.mu.Lock()
		conns := len(s.miniSubs[key])
		s.mu.Unlock()
		rooms, _ := s.minis[key].Counts()
		games = append(games, Usage{Game: key, Connections: conns, Sessions: rooms})
	}
	s.mu.Lock()
	floorConns := len(s.floorConns)
	s.mu.Unlock()
	floorRooms, _ := s.floor.Counts()
	games = append(games, Usage{Game: "floor-drop", Connections: floorConns, Sessions: floorRooms})
	s.mu.Lock()
	heistConns := len(s.heistConns)
	s.mu.Unlock()
	heistRooms, _ := s.heist.Counts()
	games = append(games, Usage{Game: "economy-heist", Connections: heistConns, Sessions: heistRooms})
	s.mu.Lock()
	rushConns := len(s.rushConns)
	s.mu.Unlock()
	rushRooms, _ := s.rush.Counts()
	games = append(games, Usage{Game: "order-rush", Connections: rushConns, Sessions: rushRooms})
	s.mu.Lock()
	turboConns := len(s.turboConns)
	s.mu.Unlock()
	turboRooms, _ := s.turbo.Counts()
	games = append(games, Usage{Game: "turbo-trivia", Connections: turboConns, Sessions: turboRooms})
	s.mu.Lock()
	blockConns := len(s.blockConns)
	s.mu.Unlock()
	blockRooms, _ := s.block.Counts()
	games = append(games, Usage{Game: "block-battle", Connections: blockConns, Sessions: blockRooms})
	return Stats{
		Service:        "edufunhub-game",
		GoVersion:      runtime.Version(),
		UptimeSeconds:  int64(s.cfg.Now().Sub(s.started).Seconds()),
		Goroutines:     runtime.NumGoroutine(),
		HeapAllocBytes: mem.HeapAlloc,
		SysBytes:       mem.Sys,
		GCCycles:       mem.NumGC,
		CPUs:           runtime.NumCPU(),
		Games:          games,
	}
}

// serveStats answers signed requests only: X-Game-Signature = hex(HMAC(timestamp + ".")).
func (s *Server) serveStats(w http.ResponseWriter, r *http.Request) {
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > statsTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, nil)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(s.Snapshot())
}
