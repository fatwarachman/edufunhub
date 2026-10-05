// Package floordrop is the authoritative referee of Floor Drop, a trivia
// battle royale for 2 to 100 players per room.
//
// A host (teacher screen) opens a room and shares the 6 digit PIN or the
// invite link; students join from their own devices. Every round shows one
// question with up to four answer tiles and a strict countdown. When the
// time is up the correct tile stays and the wrong tiles drop: every player
// who answered wrong or not at all is eliminated and becomes a spectator.
// The answer window shrinks by 10% each round. The game ends when one
// player is left, when everyone left fails in the same round (ranked by the
// fastest submission of that round) or after MaxRounds.
//
// Concurrency: each room runs in its own goroutine and owns its state; the
// WebSocket goroutines talk to it through a command channel. The answer gate
// (round id, deadline, open flag) is published with atomics so late answers
// are refused at reception, before they reach the room. Submission time is
// always the server's reception clock; client timestamps are never read.
package floordrop

import (
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

const (
	// GameKey signs player tokens, HostKey signs host (teacher) tokens.
	GameKey = "floor-drop"
	HostKey = "floor-drop-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "fd"

	MinPlayers = 2
	MaxPlayers = 100
	MaxRounds  = 20
	Options    = 4
)

// MaxPoints is the highest award of one game (Laravel validates the same cap).
var MaxPoints = points.Cap(MaxRounds)

// Room states.
const (
	PhaseLobby    = "LOBBY"
	PhaseQuestion = "QUESTION_ACTIVE"
	PhaseLock     = "LOCK_ANSWERS"
	PhaseReveal   = "REVEAL_DROP"
	PhaseSummary  = "ROUND_SUMMARY"
	PhaseOver     = "GAME_OVER"
)

// Errors share their codes with the client (room.errors.*).
var (
	ErrNotFound   = lobby.ErrNotFound
	ErrFull       = lobby.ErrFull
	ErrStarted    = lobby.ErrStarted
	ErrNotHost    = lobby.ErrNotHost
	ErrPlayers    = lobby.ErrPlayers
	ErrPhase      = lobby.ErrPhase
	ErrNoRoom     = lobby.ErrNoRoom
	ErrHostOnly   = errors.New("host_only")
	ErrPlayerOnly = errors.New("player_only")
	ErrLocked     = errors.New("answers_locked")
	ErrOption     = errors.New("invalid_option")
	ErrAnswered   = errors.New("already_answered")
	ErrTooEarly   = errors.New("too_early")
	ErrEliminated = errors.New("eliminated")
	ErrClosed     = errors.New("room_closed")
	ErrBusy       = errors.New("busy")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// BaseTime is the first answer window (YoungTime for grades 0-2). Every
	// next round keeps DecayPct percent of the previous window, never less
	// than MinTime.
	BaseTime  time.Duration
	YoungTime time.Duration
	MinTime   time.Duration
	DecayPct  int

	ReadyTime   time.Duration // "get ready" before round 1
	LockTime    time.Duration // answers frozen, before the drop
	RevealTime  time.Duration // floor drop animation
	SummaryTime time.Duration // survivors between rounds

	// Grace is the reconnect window before a disconnected player is
	// eliminated. LobbyDrop removes players offline that long in the lobby.
	Grace     time.Duration
	LobbyDrop time.Duration

	// MinAnswer rejects answers faster than a human can read the options.
	MinAnswer time.Duration
	// Tick drives timers; Progress throttles answer progress broadcasts.
	Tick     time.Duration
	Progress time.Duration

	// Idle closes untouched rooms; Empty closes rooms nobody is connected to.
	Idle  time.Duration
	Empty time.Duration

	// Buffer is the per-connection outbound queue; a client that falls this
	// far behind is disconnected and resyncs on reconnect.
	Buffer int
	// Commands is the room command queue length.
	Commands int
}

// Defaults are the production timings.
var Defaults = Config{
	BaseTime: 10 * time.Second, YoungTime: 15 * time.Second, MinTime: 4 * time.Second, DecayPct: 90,
	ReadyTime: 3 * time.Second, LockTime: 800 * time.Millisecond, RevealTime: 3 * time.Second, SummaryTime: 2500 * time.Millisecond,
	Grace: 5 * time.Second, LobbyDrop: time.Minute,
	MinAnswer: 300 * time.Millisecond, Tick: 50 * time.Millisecond, Progress: 250 * time.Millisecond,
	Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 64, Commands: 512,
}

// FirstLimit is the answer window of round 1 for a grade.
func (c Config) FirstLimit(grade int) time.Duration {
	if grade <= 2 {
		return c.YoungTime
	}
	return c.BaseTime
}

// NextLimit shrinks the answer window by the decay, bounded by MinTime.
func (c Config) NextLimit(limit time.Duration) time.Duration {
	return max(c.MinTime, limit*time.Duration(c.DecayPct)/100)
}

// Message is a JSON object sent to clients.
type Message = map[string]any

// Result is reported to Laravel for each player.
type Result struct {
	EventID     string             `json:"event_id"`
	UserID      int64              `json:"user_id"`
	GameKey     string             `json:"game_key"`
	Mission     string             `json:"mission"`
	Grade       int                `json:"grade"`
	Points      int                `json:"points"`
	Correct     int                `json:"correct"`
	Wrong       int                `json:"wrong"`
	Seconds     int                `json:"duration_seconds"`
	CompletedAt string             `json:"completed_at"`
	Answers     []questions.Answer `json:"answers"`
	Match       *record.Match      `json:"match,omitempty"`
}

// Award converts a finished game into portal points.
func Award(earned int, won bool) int {
	return points.Finished(points.Outcome(earned, won, false), MaxPoints)
}

// Client is one WebSocket connection: a player device or a host screen.
// Outbound messages are queued; the server's writer goroutine drains Out.
type Client struct {
	Claims auth.Claims
	Host   bool

	locale atomic.Value
	out    chan Message
	gone   chan struct{}
	once   sync.Once
}

// NewClient creates a connection with an outbound queue of size buffer.
func NewClient(claims auth.Claims, host bool, locale string, buffer int) *Client {
	c := &Client{Claims: claims, Host: host, out: make(chan Message, max(1, buffer)), gone: make(chan struct{})}
	c.SetLocale(locale)
	return c
}

// ID is the account id.
func (c *Client) ID() int64 { return c.Claims.Subject }

// Out is the outbound queue.
func (c *Client) Out() <-chan Message { return c.out }

// Gone is closed when the connection must stop (replaced, too slow, closed).
func (c *Client) Gone() <-chan struct{} { return c.gone }

// Close stops the connection once.
func (c *Client) Close() { c.once.Do(func() { close(c.gone) }) }

// SetLocale changes the language of the messages this client receives.
func (c *Client) SetLocale(l string) {
	if l != "en" {
		l = "id"
	}
	c.locale.Store(l)
}

// Locale returns "id" or "en".
func (c *Client) Locale() string {
	if l, ok := c.locale.Load().(string); ok {
		return l
	}
	return "id"
}

// Reply queues a direct reply (errors, pong) from the connection goroutine.
func (c *Client) Reply(msg Message) bool { return c.push(msg) }

// push queues msg without blocking; a full queue drops the slow client.
func (c *Client) push(msg Message) bool {
	select {
	case <-c.gone:
		return false
	default:
	}
	select {
	case c.out <- msg:
		return true
	default:
		c.Close()
		return false
	}
}
