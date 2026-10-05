// Package heist is the authoritative referee of Economy Heist (Peti Emas
// Misteri), a self-paced gold quest for 2 to 60 players per room.
//
// A host screen (teacher, classroom projector) opens a room, picks the win
// condition (time limit or gold target) and shares the 6 digit PIN or the
// invite link. Students answer questions at their own pace. A correct answer
// opens three mystery chests; the server rolls their contents before the
// player picks one and reveals all three afterwards. Chests add or remove
// gold, grant a shield, or let the player steal from or swap gold with a
// rival. A shield blocks the next steal or swap and breaks. A wrong answer
// costs a short cooldown and no chest.
//
// Concurrency: each room runs in its own goroutine and owns its state; the
// WebSocket goroutines talk to it through a command channel, so every intent
// (answer, chest, heist target) is applied in one serial order. Gold and
// shields live in a Ledger guarded by its own mutex: every steal or swap
// reads, checks and moves balances in one critical section, so balances
// never go negative and gold is never created by a transfer.
//
// Clients only send intents. Answers, chest contents, amounts and targets
// are validated and computed here; client timestamps are never read.
package heist

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
	GameKey = "economy-heist"
	HostKey = "economy-heist-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "eh"

	MinPlayers = 2
	MaxPlayers = 60
	Chests     = 3
	Options    = 4

	// MaxScoredAnswers caps how many correct answers earn portal points.
	MaxScoredAnswers = 40
	// MaxGold caps a balance (keeps compounding gains inside the database
	// column that stores the final gold as the match score).
	MaxGold int64 = 10_000_000
)

// MaxPoints is the highest award of one game (Laravel validates the same cap).
var MaxPoints = points.Cap(MaxScoredAnswers)

// Room phases.
const (
	PhaseLobby   = "LOBBY"
	PhasePlaying = "PLAYING"
	PhaseOver    = "GAME_OVER"
)

// Player stages while the room is playing.
const (
	StageQuestion = "QUESTION"
	StageChest    = "CHEST"
	StageTarget   = "TARGET"
	StageCooldown = "COOLDOWN"
)

// Win conditions.
const (
	WinTime = "TIME_LIMIT"
	WinGold = "GOLD_TARGET"
)

// TimeLimits are the selectable game lengths in minutes; GoldTargets the
// selectable gold goals.
var (
	TimeLimits  = []int{3, 5, 7, 10, 15}
	GoldTargets = []int64{1000, 2500, 5000, 10000, 25000}
)

const (
	DefaultMinutes       = 5
	DefaultGold    int64 = 2500
)

// Errors share their codes with the client (room.errors.*).
var (
	ErrNotFound   = lobby.ErrNotFound
	ErrFull       = lobby.ErrFull
	ErrNotHost    = lobby.ErrNotHost
	ErrPlayers    = lobby.ErrPlayers
	ErrPhase      = lobby.ErrPhase
	ErrNoRoom     = lobby.ErrNoRoom
	ErrHostOnly   = errors.New("host_only")
	ErrPlayerOnly = errors.New("player_only")
	ErrOption     = errors.New("invalid_option")
	ErrTooEarly   = errors.New("too_early")
	ErrStage      = errors.New("wrong_stage")
	ErrStale      = errors.New("stale_question")
	ErrChest      = errors.New("invalid_chest")
	ErrTarget     = errors.New("invalid_target")
	ErrConfig     = errors.New("invalid_config")
	ErrIdentity   = errors.New("invalid_player")
	ErrClosed     = errors.New("room_closed")
	ErrBusy       = errors.New("busy")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// Cooldown follows a wrong answer before the next question.
	Cooldown time.Duration
	// MinAnswer rejects answers faster than a human can read the options.
	MinAnswer time.Duration
	// TargetTime is how long a player may pick a heist target before the
	// steal or swap expires.
	TargetTime time.Duration
	// GoldCap ends a gold target game that nobody finishes in time.
	GoldCap time.Duration
	// LobbyDrop removes players offline that long in the lobby.
	LobbyDrop time.Duration

	// Tick drives timers; Board throttles leaderboard and roster broadcasts.
	Tick  time.Duration
	Board time.Duration

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
	Cooldown: 3 * time.Second, MinAnswer: 400 * time.Millisecond, TargetTime: 20 * time.Second,
	GoldCap: 20 * time.Minute, LobbyDrop: time.Minute,
	Tick: 100 * time.Millisecond, Board: 250 * time.Millisecond,
	Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 128, Commands: 1024,
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
