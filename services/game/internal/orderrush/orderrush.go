// Package orderrush is the authoritative referee of Order Rush / Sequence
// Masters (Edisi TKJ): a tap-to-order race for 2 to 60 players per room.
//
// A host screen (teacher, classroom projector) opens a room, picks the mode
// (RACE: first to finish N modules, or TIME_ATTACK: most points in M
// minutes) and the TKJ sequence categories (UTP T568A/B, fibre 12-core,
// OSI layers, PDU, DHCP DORA, TCP handshake, troubleshooting steps), then
// shares the 6 digit PIN or the invite link.
//
// Every player gets their own stream of sequence modules. A module is a
// shuffled pool of opaque piece ids; the player taps them into numbered
// slots and submits the order. The server compares the submission with the
// correct order (never sent to clients), reports the first wrong slot, and
// scores 100 + a speed bonus up to 100 for a module solved under 5 seconds.
// Three correct modules in a row grant a random power-up: TANGLE scrambles a
// rival's pool for 3 s, FREEZE blocks a rival's input for 1.5 s, SHIELD
// blocks the next attack on the owner.
//
// Concurrency: each room runs in its own goroutine and owns its state;
// WebSocket goroutines send intents through a command channel. Scores,
// streaks, shields, power-up inventories and sabotage effects live in a
// Scoreboard guarded by its own mutex, so a power-up use reads, checks and
// consumes the inventory and the target's shield in one critical section.
//
// Clients only send intents. Validation, timing (server reception time),
// scoring and power-up effects are computed here; client timestamps and
// durations are never trusted.
package orderrush

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
	GameKey = "order-rush"
	HostKey = "order-rush-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "or"

	MinPlayers = 2
	MaxPlayers = 60

	// MaxScoredModules caps how many solved modules earn portal points.
	MaxScoredModules = 40
	// MaxSubmitted caps the submitted order length read from a client.
	MaxSubmitted = 32

	// BaseScore is earned per correct order; SpeedBonus is the most extra
	// score for a module solved within SpeedWindow.
	BaseScore   = 100
	SpeedBonus  = 100
	SpeedWindow = 5 * time.Second
	// ComboEvery correct modules in a row grant a power-up.
	ComboEvery = 3
	// MaxInventory caps the power-ups a player can hold.
	MaxInventory = 3
)

// MaxPoints is the highest portal award of one game (Laravel validates it).
var MaxPoints = points.Cap(MaxScoredModules)

// Room phases.
const (
	PhaseLobby  = "LOBBY"
	PhaseActive = "RACE_ACTIVE"
	PhaseOver   = "GAME_OVER"
)

// Game modes.
const (
	ModeRace       = "RACE"
	ModeTimeAttack = "TIME_ATTACK"
)

// Power-ups.
const (
	PowerTangle = "TANGLE"
	PowerFreeze = "FREEZE"
	PowerShield = "SHIELD"
)

// PowerUps lists every power-up type.
var PowerUps = []string{PowerTangle, PowerFreeze, PowerShield}

// RaceTargets are the selectable module goals; TimeLimits the selectable
// time attack lengths in minutes.
var (
	RaceTargets = []int{5, 10, 15, 20}
	TimeLimits  = []int{3, 4, 5}
)

const (
	DefaultModules = 10
	DefaultMinutes = 3
)

// Errors share their codes with the client (room.errors.*).
var (
	ErrNotFound    = lobby.ErrNotFound
	ErrFull        = lobby.ErrFull
	ErrNotHost     = lobby.ErrNotHost
	ErrPlayers     = lobby.ErrPlayers
	ErrPhase       = lobby.ErrPhase
	ErrNoRoom      = lobby.ErrNoRoom
	ErrHostOnly    = errors.New("host_only")
	ErrPlayerOnly  = errors.New("player_only")
	ErrStale       = errors.New("stale_question")
	ErrOrder       = errors.New("invalid_order")
	ErrTooFast     = errors.New("too_fast")
	ErrFrozen      = errors.New("frozen")
	ErrConfig      = errors.New("invalid_config")
	ErrIdentity    = errors.New("invalid_player")
	ErrTarget      = errors.New("invalid_target")
	ErrPowerUp     = errors.New("invalid_powerup")
	ErrNoPowerUp   = errors.New("no_powerup")
	ErrTargetBusy  = errors.New("target_busy")
	ErrShieldReady = errors.New("shield_active")
	ErrClosed      = errors.New("room_closed")
	ErrBusy        = errors.New("busy")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// MinSubmit rejects submissions faster than a human can tap the pieces.
	MinSubmit time.Duration
	// Retry is the shortest gap between two submissions of one player.
	Retry time.Duration
	// Tangle and Freeze are the sabotage durations.
	Tangle time.Duration
	Freeze time.Duration
	// RaceCap ends a race nobody finishes in time.
	RaceCap time.Duration
	// LobbyDrop removes players offline that long in the lobby.
	LobbyDrop time.Duration

	// Tick drives timers; Board throttles race_progress_broadcast.
	Tick  time.Duration
	Board time.Duration

	// Idle closes untouched rooms; Empty closes rooms nobody is connected to.
	Idle  time.Duration
	Empty time.Duration

	// Buffer is the per-connection outbound queue; Commands the room queue.
	Buffer   int
	Commands int
}

// Defaults are the production timings.
var Defaults = Config{
	MinSubmit: 300 * time.Millisecond, Retry: 400 * time.Millisecond,
	Tangle: 3 * time.Second, Freeze: 1500 * time.Millisecond,
	RaceCap: 15 * time.Minute, LobbyDrop: time.Minute,
	Tick: 50 * time.Millisecond, Board: 250 * time.Millisecond,
	Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 128, Commands: 1024,
}

// Message is a JSON object sent to clients.
type Message = map[string]any

// CategoryStat summarises one player's attempts on one sequence set;
// Laravel stores it for the "most misunderstood sequence" analytics.
type CategoryStat struct {
	Set        string `json:"set"`
	Category   string `json:"category"`
	Attempts   int    `json:"attempts"`
	Solved     int    `json:"solved"`
	Wrong      int    `json:"wrong"`
	TotalMs    int64  `json:"total_ms"`
	SlotErrors []int  `json:"slot_errors"`
}

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
	Sequences   []CategoryStat     `json:"sequence_stats"`
}

// Award converts a finished game into portal points.
func Award(earned int, won bool) int {
	return points.Finished(points.Outcome(earned, won, false), MaxPoints)
}

// Client is one WebSocket connection: a player device or a host screen.
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
