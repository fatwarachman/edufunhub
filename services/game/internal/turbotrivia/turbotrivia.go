// Package turbotrivia is the authoritative referee of Turbo Trivia (Kart
// Racer), a live quiz race for a classroom: 2 to 40 karts drive three laps
// on a projector while students answer the same trivia question on their
// phones.
//
//   - A correct answer fires a Nitro Boost (120 km/h for 2.5 + 2 x S seconds,
//     S = share of the answer window left) and rolls a random Item Box.
//   - A wrong answer causes an Engine Stutter (30 km/h for 2 seconds).
//   - Items: Banana (trap dropped behind the kart, spins out whoever drives
//     over it), Missile (homes in on the leader), Lightning (shrinks every
//     rival and slows them by 40%), Shield (absorbs one hit, immune to
//     Lightning). Karts in the top three never roll Missile or Lightning;
//     the back of the field rolls them more often.
//
// Concurrency: each room runs in its own goroutine and owns its state. A
// fixed 20 Hz tick moves the karts (track progress in laps), resolves banana
// collisions and missile impacts, and broadcasts the positions to the host
// screen. WebSocket goroutines only send commands; answer time is always the
// server's reception clock.
package turbotrivia

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
	// GameKey signs player tokens, HostKey signs host (projector) tokens.
	GameKey = "turbo-trivia"
	HostKey = "turbo-trivia-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "tt"

	MinPlayers = 2
	MaxPlayers = 40
	Laps       = 3
	Options    = 4

	// DefaultQuestions and MaxQuestions bound the questions of one race.
	DefaultQuestions = 12
	MaxQuestions     = 15
	// MaxItems is how many item boxes a kart can hold.
	MaxItems = 2
)

// QuestionCounts are the race lengths the host can pick.
var QuestionCounts = []int{10, 12, 15}

// MaxPoints is the highest award of one race (Laravel validates the same cap).
var MaxPoints = points.Cap(MaxQuestions)

// Speeds in km/h and effect durations.
const (
	BaseSpeed    = 50.0
	NitroSpeed   = 120.0
	StutterSpeed = 30.0
	// ShrinkFactor keeps 60% of the speed while Lightning shrinks a kart.
	ShrinkFactor = 0.6
)

// Effect durations.
const (
	NitroBase   = 2500 * time.Millisecond
	NitroBonus  = 2 * time.Second // x S (share of the answer window left)
	StutterTime = 2 * time.Second
	SpinTime    = 3 * time.Second         // banana
	StaggerTime = 2500 * time.Millisecond // missile
	ShrinkTime  = 4 * time.Second         // lightning
	ShieldTime  = 8 * time.Second
	// BananaBehind is how far (in laps) behind the kart a banana lands.
	BananaBehind = 0.006
	MaxBananas   = 24
)

// Items.
const (
	ItemBanana    = "BANANA"
	ItemMissile   = "MISSILE"
	ItemLightning = "LIGHTNING"
	ItemShield    = "SHIELD"
)

// Items lists every item type.
var Items = []string{ItemBanana, ItemMissile, ItemLightning, ItemShield}

// Room phases.
const (
	PhaseLobby     = "LOBBY"
	PhaseCountdown = "COUNTDOWN"
	PhaseRace      = "RACE"
	PhaseOver      = "GAME_OVER"
)

// Question stages inside PhaseRace.
const (
	StageQuestion = "QUESTION"
	StageReveal   = "REVEAL"
	StageDone     = "DONE" // no questions left: sprint to the finish
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
	ErrClosed     = errors.New("room_closed")
	ErrBusy       = errors.New("busy")
	ErrConfig     = errors.New("invalid_config")
	ErrItem       = errors.New("invalid_item")
	ErrNoItem     = errors.New("no_item")
	ErrNoTarget   = errors.New("no_target")
	ErrFinished   = errors.New("kart_finished")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// Tick is the authoritative physics and broadcast rate (20 Hz).
	Tick time.Duration
	// PlayerTick throttles the personal kart status sent to phones.
	PlayerTick time.Duration

	Countdown    time.Duration // lights before the start
	QuestionTime time.Duration // answer window (YoungTime for grades 0-2)
	YoungTime    time.Duration
	RevealTime   time.Duration // correct answer shown between questions
	MinAnswer    time.Duration // faster answers are refused as bots

	// FinalWindow ends the race this long after the first kart finishes.
	FinalWindow time.Duration
	// MissileFlight is the homing missile's travel time.
	MissileFlight time.Duration
	// BananaLife removes a banana nobody drove over.
	BananaLife time.Duration
	// LapKm is the lap length; 0 sizes it from the question count so a
	// kart at base speed finishes shortly after the last question.
	LapKm float64
	// RaceCap ends the race (ranked by distance) after this multiple of
	// the expected question time.
	RaceCap float64

	Grace     time.Duration // lobby: offline players are removed after LobbyDrop
	LobbyDrop time.Duration
	Idle      time.Duration
	Empty     time.Duration

	Buffer   int
	Commands int
}

// Defaults are the production timings.
var Defaults = Config{
	Tick: 50 * time.Millisecond, PlayerTick: 200 * time.Millisecond,
	Countdown: 3 * time.Second, QuestionTime: 15 * time.Second, YoungTime: 20 * time.Second,
	RevealTime: 3 * time.Second, MinAnswer: 300 * time.Millisecond,
	FinalWindow: 30 * time.Second, MissileFlight: 1200 * time.Millisecond, BananaLife: time.Minute,
	RaceCap: 1.8,
	Grace:   5 * time.Second, LobbyDrop: time.Minute, Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 128, Commands: 512,
}

// AnswerTime is the answer window for the youngest grade in the room.
func (c Config) AnswerTime(grade int) time.Duration {
	if grade <= 2 {
		return c.YoungTime
	}
	return c.QuestionTime
}

// PaceSpeed is the average speed of a kart that answers about half of the
// questions right; laps are sized so it finishes with the last question.
const PaceSpeed = 60.0

// LapLength is the lap length in km for a race of n questions. A class
// usually closes a question at about three quarters of the window (the
// question ends early once every kart answered). A kart answering every
// question right and fast finishes a few questions early; the race then
// ends FinalWindow later.
func (c Config) LapLength(n, grade int) float64 {
	if c.LapKm > 0 {
		return c.LapKm
	}
	cycle := c.AnswerTime(grade)*3/4 + c.RevealTime
	race := time.Duration(n) * cycle
	return PaceSpeed * race.Hours() / Laps
}

// NitroFor is the boost duration for an answer with share s of the window left.
func NitroFor(s float64) time.Duration {
	s = max(0, min(1, s))
	return NitroBase + time.Duration(float64(NitroBonus)*s)
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

// Award converts a finished race into portal points.
func Award(earned int, won bool) int {
	return points.Finished(points.Outcome(earned, won, false), MaxPoints)
}

// Client is one WebSocket connection: a player phone or the host screen.
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
