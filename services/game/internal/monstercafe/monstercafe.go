// Package monstercafe is the authoritative referee of Monster Café, a
// self-paced cooking quiz for 1 to 40 players per room.
//
// A host screen (teacher, classroom projector) opens a room, picks the game
// length (3, 5 or 7 minutes) and the question subject, and shares the 6 digit
// PIN or the invite link. Every student runs a private kitchen: monster
// customers order burgers and pizzas, each ingredient is earned by answering
// a quiz question correctly, the plate is cooked in an oven that burns
// forgotten dishes, rats steal ingredients from the tray unless shooed, and
// two serves in a row earn a pie that blurs a rival's screen for 2 seconds.
//
// Concurrency: each room runs in its own goroutine and owns its state; the
// WebSocket goroutines talk to it through a command channel, so every intent
// (answer, plate, cook, serve, pie) is applied in one serial order. All
// timers (oven, patience, rats, new orders, game clock) run on the room
// ticker; client timestamps are never read.
package monstercafe

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
	GameKey = "monster-cafe"
	HostKey = "monster-cafe-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "mc"

	MinPlayers = 1
	MaxPlayers = 40
	Options    = 4

	// MaxScoredAnswers caps how many correct answers earn portal points.
	MaxScoredAnswers = 40

	// Kitchen limits.
	MaxTray   = 8
	MaxPlate  = 6
	MaxOrders = 2
	MaxPies   = 2
	// PieStreak serves in a row grant one pie.
	PieStreak = 2

	// BaseCoins is paid for every correct dish, plus up to MaxTip by the
	// patience the monster still had.
	BaseCoins = 100
	MaxTip    = 50
	// WrongDishPenalty is the share of an order's total patience lost when it
	// receives a wrong dish (percent).
	WrongDishPenalty = 30
	// EasyPatience multiplies patience (percent) when the lowest grade at the
	// table is EasyGrade or below.
	EasyPatience = 130
	EasyGrade    = 2
)

// MaxPoints is the highest award of one game (Laravel validates the same cap).
var MaxPoints = points.Cap(MaxScoredAnswers)

// Room phases.
const (
	PhaseNone    = "NONE"
	PhaseLobby   = "LOBBY"
	PhasePlaying = "PLAYING"
	PhaseOver    = "GAME_OVER"
)

// Minutes are the selectable game lengths.
var Minutes = []int{3, 5, 7}

// DefaultMinutes is the game length of a new room.
const DefaultMinutes = 5

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
	ErrOption      = errors.New("invalid_option")
	ErrTooEarly    = errors.New("too_early")
	ErrStale       = errors.New("stale_question")
	ErrTarget      = errors.New("invalid_target")
	ErrNoTarget    = errors.New("no_target")
	ErrConfig      = errors.New("invalid_config")
	ErrIdentity    = errors.New("invalid_player")
	ErrClosed      = errors.New("room_closed")
	ErrBusy        = errors.New("busy")
	ErrCooldown    = errors.New("cooldown")
	ErrTrayFull    = errors.New("tray_full")
	ErrPlateFull   = errors.New("plate_full")
	ErrPlateEmpty  = errors.New("plate_empty")
	ErrNoIngr      = errors.New("no_ingredient")
	ErrIngredient  = errors.New("invalid_ingredient")
	ErrOvenBusy    = errors.New("oven_busy")
	ErrOvenEmpty   = errors.New("oven_empty")
	ErrNoDish      = errors.New("no_dish")
	ErrOrder       = errors.New("invalid_order_id")
	ErrNoPie       = errors.New("no_pie")
	ErrRat         = errors.New("invalid_rat")
	ErrUnknownType = errors.New("unknown_type")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// Cook is the oven time; BurnAfter how long a ready dish waits before it
	// burns.
	Cook      time.Duration
	BurnAfter time.Duration
	// Cooldown follows a wrong answer; MinAnswer rejects answers faster than
	// a human can read the options.
	Cooldown  time.Duration
	MinAnswer time.Duration
	// RatMin..RatMax is the delay between rats; RatSteal how long a rat
	// waits before it steals.
	RatMin   time.Duration
	RatMax   time.Duration
	RatSteal time.Duration
	// Pie is how long a pie blurs the target's screen.
	Pie time.Duration
	// NewOrder is the delay before a free order slot gets a new monster.
	NewOrder time.Duration
	// PatienceBase + PatienceItem × recipe length is an order's patience.
	PatienceBase time.Duration
	PatienceItem time.Duration
	// Harder is when recipes may grow to 3 extras.
	Harder time.Duration
	// LobbyDrop removes players offline that long in the lobby.
	LobbyDrop time.Duration

	// Tick drives timers; Board throttles leaderboard and roster broadcasts;
	// Kitchen is the longest gap between two kitchen_sync of a player.
	Tick    time.Duration
	Board   time.Duration
	Kitchen time.Duration

	// Idle closes untouched rooms; Empty closes rooms nobody is connected to.
	Idle  time.Duration
	Empty time.Duration

	// Buffer is the per-connection outbound queue; Commands the room
	// command queue length.
	Buffer   int
	Commands int
}

// Defaults are the production timings.
var Defaults = Config{
	Cook: 3 * time.Second, BurnAfter: 5 * time.Second,
	Cooldown: 2 * time.Second, MinAnswer: 300 * time.Millisecond,
	RatMin: 20 * time.Second, RatMax: 35 * time.Second, RatSteal: 3 * time.Second,
	Pie: 2 * time.Second, NewOrder: 3 * time.Second,
	PatienceBase: 15 * time.Second, PatienceItem: 18 * time.Second, Harder: 3 * time.Minute,
	LobbyDrop: time.Minute,
	Tick:      100 * time.Millisecond, Board: 250 * time.Millisecond, Kitchen: time.Second,
	Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 256, Commands: 1024,
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
