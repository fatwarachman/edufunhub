// Package blockbattle is the authoritative referee of Block Battle (Tetris
// Kuis), a classroom block game on a projector with phone controllers.
//
//   - BATTLE: every student plays an own 10x20 board next to an own quiz
//     stream. Line clears send garbage to a rival (1/2/3/4 lines send
//     0/1/2/4). A correct answer grants a reward choice (next piece I, or an
//     attack of 2 garbage lines); a wrong answer doubles gravity and exposes
//     the player for 5 seconds. The last board standing wins.
//   - WORDS: the same personal boards, cells carry letters (WORDS_ID,
//     WORDS_EN) or digits and operators (MATH). A row holding a dictionary
//     word or an expression equal to the target explodes.
//   - FORTRESS: a shared 12x16 wall. Correct answers queue students for a
//     turn placing one patch piece; full rows become armored and fire the
//     cannon at the monster, which hits the wall on a timer.
//
// Concurrency: each room runs in its own goroutine and owns its state. A
// fixed 20 Hz tick drives gravity, lock delay, quiz timers and the monster.
// WebSocket goroutines only send commands; answer and input times are the
// server's reception clock.
package blockbattle

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
	GameKey = "block-battle"
	HostKey = "block-battle-host"
	Mission = "room"
	// Prefix starts result event ids and match keys.
	Prefix = "bb"

	MaxPlayers = 50
	// MinBattle is the minimum number of players of a BATTLE room.
	MinBattle = 2
	Options   = 4

	// MaxPaid is how many correct answers pay points in one game.
	MaxPaid = 40
	// MaxInputs is the input rate limit per player and second.
	MaxInputs = 30
	// MaxLockResets bounds how often moves postpone the lock of a grounded piece.
	MaxLockResets = 15
	// MaxCombo caps the WORDS explosion combo multiplier.
	MaxCombo = 5
	// Previews is the length of the next-piece queue.
	Previews = 3
)

// Modes.
const (
	ModeBattle   = "BATTLE"
	ModeWords    = "WORDS"
	ModeFortress = "FORTRESS"
)

// Word contents.
const (
	ContentWordsID = "WORDS_ID"
	ContentWordsEN = "WORDS_EN"
	ContentMath    = "MATH"
)

// Rewards of a correct BATTLE answer.
const (
	RewardIPiece = "I_PIECE"
	RewardAttack = "ATTACK"
)

// Status effects.
const (
	FxPenalty = "PENALTY"
	FxExposed = "EXPOSED"
)

// Modes, Durations and Contents are the lobby choices.
var (
	Modes     = []string{ModeBattle, ModeWords, ModeFortress}
	Durations = []int{3, 5, 7, 10}
	Contents  = []string{ContentWordsID, ContentWordsEN, ContentMath}
)

// DefaultMinutes is the default game length.
const DefaultMinutes = 5

// MaxPoints is the highest award of one game (Laravel validates the same cap).
var MaxPoints = points.Cap(MaxPaid)

// Room phases.
const (
	PhaseLobby     = "LOBBY"
	PhaseCountdown = "COUNTDOWN"
	PhasePlaying   = "PLAYING"
	PhaseOver      = "GAME_OVER"
)

// Battle tuning.
const (
	// AttackLines is the garbage of a quiz ATTACK reward.
	AttackLines = 2
	// ExposedBonus is added to every attack on an exposed player.
	ExposedBonus = 1
	// KOCredit is how long after an attack a knock-out is credited to it.
	KOCredit = 5 * time.Second
	// MonsterHP is the fortress monster's health; CannonDamage per armored row.
	MonsterHP    = 100
	CannonDamage = 10
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
	ErrNotTurn    = errors.New("not_your_turn")
	ErrInput      = errors.New("invalid_input")
	ErrReward     = errors.New("invalid_reward")
	ErrNoReward   = errors.New("no_reward")
	ErrKnocked    = errors.New("knocked_out")
)

// Config holds the timings. Tests shorten them; production uses Defaults.
type Config struct {
	// Tick is the authoritative step (20 Hz); BoardsTick throttles the
	// projector boards and the fortress broadcast (5 Hz).
	Tick       time.Duration
	BoardsTick time.Duration

	// Minute is the length of one game minute (tests shorten it).
	Minute time.Duration

	Countdown    time.Duration
	QuestionTime time.Duration // answer window (YoungTime for grades 0-2)
	YoungTime    time.Duration
	RevealTime   time.Duration // pause before the next question
	MinAnswer    time.Duration // faster answers are refused as bots
	RewardWindow time.Duration // BATTLE reward pick; no pick = ATTACK
	PenaltyTime  time.Duration // gravity x2 (and EXPOSED in BATTLE)
	WrongCool    time.Duration // FORTRESS pause after a wrong answer

	// Gravity is the fall interval at the start; it drops by GravityStep
	// every game minute down to MinGravity. PENALTY halves it.
	Gravity     time.Duration
	GravityStep time.Duration
	MinGravity  time.Duration
	LockDelay   time.Duration // grounded piece locks after this (reset by moves)

	TurnTime      time.Duration // FORTRESS turn length
	FortressFall  time.Duration // FORTRESS gravity
	MonsterEvery  time.Duration // monster hit interval (first 2 minutes)
	MonsterFast   time.Duration // after 2 minutes
	MonsterFaster time.Duration // after 4 minutes

	Grace     time.Duration
	LobbyDrop time.Duration
	Idle      time.Duration
	Empty     time.Duration

	Buffer   int
	Commands int
}

// Defaults are the production timings.
var Defaults = Config{
	Tick: 50 * time.Millisecond, BoardsTick: 200 * time.Millisecond, Minute: time.Minute,
	Countdown: 3 * time.Second, QuestionTime: 15 * time.Second, YoungTime: 20 * time.Second,
	RevealTime: 2 * time.Second, MinAnswer: 300 * time.Millisecond, RewardWindow: 6 * time.Second,
	PenaltyTime: 5 * time.Second, WrongCool: 3 * time.Second,
	Gravity: time.Second, GravityStep: 100 * time.Millisecond, MinGravity: 250 * time.Millisecond,
	LockDelay: 500 * time.Millisecond,
	TurnTime:  10 * time.Second, FortressFall: 700 * time.Millisecond,
	MonsterEvery: 7 * time.Second, MonsterFast: 6 * time.Second, MonsterFaster: 5 * time.Second,
	Grace: 5 * time.Second, LobbyDrop: time.Minute, Idle: 30 * time.Minute, Empty: 3 * time.Minute,
	Buffer: 256, Commands: 1024,
}

// AnswerTime is the answer window for the youngest grade in the room.
func (c Config) AnswerTime(grade int) time.Duration {
	if grade <= 2 {
		return c.YoungTime
	}
	return c.QuestionTime
}

// MonsterInterval is the time between monster hits after elapsed play time.
func (c Config) MonsterInterval(elapsed time.Duration) time.Duration {
	switch {
	case elapsed >= 4*c.Minute:
		return c.MonsterFaster
	case elapsed >= 2*c.Minute:
		return c.MonsterFast
	}
	return c.MonsterEvery
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
