// Package portsorter implements the authoritative referee for Port Sorter
// (Pilah Port & Protokol).
//
// Packets carrying a label (a port number by default) fall one at a time
// above a row of bins. Bins and the answer key come from an admin-managed
// set (bank.go): any topic with 2 to 6 bins, synced from Laravel. The
// browser animates the fall and lets the player slide the packet between
// columns; when it lands, the client reports the bin it fell into. This
// package owns the packet order, the answer key, lives, the speed curve and
// the point award, and rejects landings reported before the packet could
// physically fall.
package portsorter

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"slices"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

const (
	GameKey = "port-sorter"
	Mission = "sort"
	Packets = 30
	Lives   = 3

	// PacketsPerLevel is how many packets fall before the speed level rises.
	PacketsPerLevel = 5

	// RoundGap is the pause between packets while the client shows feedback.
	RoundGap = 900 * time.Millisecond
	// Tolerance absorbs network latency on the landing check.
	Tolerance = 400 * time.Millisecond
	// MissGrace is how long after the landing time a silent packet counts as dropped.
	MissGrace = 6 * time.Second
	// MaxPause is how long a run may stay paused before the clock resumes.
	MaxPause = 10 * time.Minute

	ScoreCorrect = 100
	ScoreStreak  = 20
	ScoreLevel   = 10

	PassPercent = 70

	PointsFinish   = 20
	PointsFlawless = 20
)

// MaxPoints is the highest award of one run.
var MaxPoints = points.Cap(Packets) + PointsFinish + PointsFlawless

// Phases.
const (
	PhaseReady   = "ready"
	PhaseFalling = "falling"
	PhaseDone    = "done"
)

// Feedback kinds.
const (
	FeedbackCorrect = "correct"
	FeedbackWrong   = "wrong"
	FeedbackMissed  = "missed"
)

var (
	ErrPhase    = errors.New("wrong_phase")
	ErrTooEarly = errors.New("too_early")
	ErrBin      = errors.New("invalid_bin")
	ErrPacket   = errors.New("stale_packet")
)

// Message is a generic event.
type Message map[string]any

// Result is reported to Laravel when a run ends.
type Result struct {
	EventID     string `json:"event_id"`
	UserID      int64  `json:"user_id"`
	GameKey     string `json:"game_key"`
	Mission     string `json:"mission"`
	Grade       int    `json:"grade"`
	Points      int    `json:"points"`
	Correct     int    `json:"correct"`
	Wrong       int    `json:"wrong"`
	Seconds     int    `json:"duration_seconds"`
	CompletedAt string `json:"completed_at"`
}

// Session is one player's run. Safe for concurrent use.
type Session struct {
	mu       sync.Mutex
	Claims   auth.Claims
	Locale   string
	rng      *rand.Rand
	set      Set
	phase    string
	round    int
	lives    int
	streak   int
	best     int
	score    int
	correct  int
	wrong    int
	packet   Item
	column   int
	roundAt  time.Time
	started  time.Time
	pausedAt time.Time
	history  []bool
	missed   []string
	result   *Result
	LastSeen time.Time
}

// New creates a session waiting for "start" on the first set of the bank.
func New(claims auth.Claims, locale string, now time.Time) *Session {
	seed := uint64(now.UnixNano()) ^ uint64(claims.Subject)<<24
	return &Session{
		Claims:   claims,
		Locale:   normLocale(locale),
		rng:      rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)),
		set:      Current().Sets[0],
		phase:    PhaseReady,
		lives:    Lives,
		LastSeen: now,
	}
}

func normLocale(l string) string {
	if l == "en" {
		return "en"
	}
	return "id"
}

// SetLocale switches the language of bin names and hints.
func (s *Session) SetLocale(l string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Locale = normLocale(l)
}

// Level is the speed level of packet round (0-based).
func Level(round int) int { return min(round/PacketsPerLevel, MaxLevel) }

// Fall is how long a packet takes to reach the bins: packets fall faster
// every PacketsPerLevel packets.
func Fall(round int) time.Duration {
	return []time.Duration{
		6500 * time.Millisecond,
		5600 * time.Millisecond,
		4800 * time.Millisecond,
		4100 * time.Millisecond,
		3500 * time.Millisecond,
		3000 * time.Millisecond,
	}[Level(round)]
}

// Choose picks the set for the next run while no packet falls. Unknown keys
// fall back to the first set of the bank.
func (s *Session) Choose(key string, now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	if s.phase != PhaseFalling {
		s.set = Current().Pick(key)
	}
	return s.stateLocked(nil, now)
}

// Start begins a new run (also used for "play again") on set key ("" keeps
// the chosen set, refreshed from the current bank).
func (s *Session) Start(key string, now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	if key == "" {
		key = s.set.Key
	}
	s.set = Current().Pick(key)
	s.phase = PhaseFalling
	s.round, s.lives, s.streak, s.best, s.score, s.correct, s.wrong = 0, Lives, 0, 0, 0, 0, 0
	s.started = now
	s.pausedAt = time.Time{}
	s.result = nil
	s.history = []bool{}
	s.missed = []string{}
	s.nextPacket(now, 0)
	return s.stateLocked(nil, now)
}

// nextPacket draws an item unlocked at the current level, never the same
// label twice in a row, and usually spawns it above a wrong bin so it must be
// moved.
func (s *Session) nextPacket(now time.Time, delay time.Duration) {
	level := Level(s.round)
	pool := make([]Item, 0, len(s.set.Items))
	for _, it := range s.set.Items {
		if it.Level <= level && (s.round == 0 || it.Label != s.packet.Label) {
			pool = append(pool, it)
		}
	}
	if len(pool) == 0 {
		pool = s.set.Items
	}
	bins := len(s.set.Bins)
	s.packet = pool[s.rng.IntN(len(pool))]
	s.column = s.rng.IntN(bins)
	if s.column == s.packet.Bin && s.rng.IntN(4) != 0 {
		s.column = (s.column + 1 + s.rng.IntN(bins-1)) % bins
	}
	s.roundAt = now.Add(delay)
}

func (s *Session) elapsed(now time.Time) time.Duration {
	if !s.pausedAt.IsZero() {
		return s.pausedAt.Sub(s.roundAt)
	}
	return now.Sub(s.roundAt)
}

func (s *Session) packetID() string { return fmt.Sprintf("%d-%d", s.started.UnixNano(), s.round) }

// Pause freezes the fall clock.
func (s *Session) Pause(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase == PhaseFalling && s.pausedAt.IsZero() {
		s.pausedAt = now
	}
	return s.stateLocked(nil, now)
}

// Resume restarts the fall clock, shifting it by the paused time (capped).
func (s *Session) Resume(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resumeLocked(now)
	return s.stateLocked(nil, now)
}

func (s *Session) resumeLocked(now time.Time) {
	if s.pausedAt.IsZero() {
		return
	}
	s.roundAt = s.roundAt.Add(min(now.Sub(s.pausedAt), MaxPause))
	s.pausedAt = time.Time{}
}

// Land: the packet with id reached the ground above bin.
func (s *Session) Land(id string, bin int, now time.Time) (Message, *Result, error) {
	return s.land(id, bin, now, true)
}

// Drop: the player sped the packet up (soft drop) and it reached the ground
// above bin before the natural fall time. The landing clock check is skipped;
// the packet must already be visible (past its spawn delay).
func (s *Session) Drop(id string, bin int, now time.Time) (Message, *Result, error) {
	return s.land(id, bin, now, false)
}

func (s *Session) land(id string, bin int, now time.Time, strict bool) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	if s.phase != PhaseFalling || !s.pausedAt.IsZero() {
		return nil, nil, ErrPhase
	}
	if id != s.packetID() {
		return nil, nil, ErrPacket
	}
	if bin < 0 || bin >= len(s.set.Bins) {
		return nil, nil, ErrBin
	}
	if strict && s.elapsed(now) < Fall(s.round)-Tolerance {
		return nil, nil, ErrTooEarly
	}
	if !strict && s.elapsed(now) < 0 {
		return nil, nil, ErrTooEarly
	}
	if bin == s.packet.Bin {
		s.correct++
		s.streak++
		s.best = max(s.best, s.streak)
		gained := ScoreCorrect + ScoreStreak*min(s.streak-1, 5) + ScoreLevel*Level(s.round)
		s.score += gained
		return s.resolve(FeedbackCorrect, bin, gained, now)
	}
	return s.lose(FeedbackWrong, bin, now)
}

// Tick drops packets nobody reported (closed tab, lost connection).
func (s *Session) Tick(now time.Time) (Message, *Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase != PhaseFalling {
		return nil, nil
	}
	if !s.pausedAt.IsZero() {
		if now.Sub(s.pausedAt) < MaxPause {
			return nil, nil
		}
		s.resumeLocked(now)
	}
	if s.elapsed(now) < Fall(s.round)+MissGrace {
		return nil, nil
	}
	msg, res, _ := s.lose(FeedbackMissed, -1, now)
	return msg, res
}

func (s *Session) lose(kind string, bin int, now time.Time) (Message, *Result, error) {
	s.wrong++
	s.streak = 0
	s.lives--
	if !slices.Contains(s.missed, s.packet.Label) {
		s.missed = append(s.missed, s.packet.Label)
	}
	return s.resolve(kind, bin, 0, now)
}

func (s *Session) resolve(kind string, bin, gained int, now time.Time) (Message, *Result, error) {
	fb := Message{
		"kind":   kind,
		"bin":    bin,
		"answer": s.packet.Bin,
		"label":  s.packet.Label,
		"hint":   s.packet.Hint.Get(s.Locale),
		"score":  gained,
	}
	s.lives = max(0, s.lives)
	s.history = append(s.history, kind == FeedbackCorrect)
	s.round++
	var res *Result
	if s.lives == 0 || s.round >= Packets {
		res = s.finish(now)
	} else {
		if Level(s.round) > Level(s.round-1) {
			fb["level_up"] = Level(s.round) + 1
		}
		s.nextPacket(now, RoundGap)
	}
	return s.stateLocked(fb, now), res, nil
}

func (s *Session) finish(now time.Time) *Result {
	s.phase = PhaseDone
	if s.result != nil {
		return nil
	}
	s.result = &Result{
		EventID:     fmt.Sprintf("ps-%d-sort-%d", s.Claims.Subject, s.started.UnixNano()),
		UserID:      s.Claims.Subject,
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       s.Claims.Grade,
		Points:      AwardAt(s.correct, s.round, s.lives, s.Claims.Level),
		Correct:     s.correct,
		Wrong:       s.wrong,
		Seconds:     int(now.Sub(s.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
	}
	return s.result
}

// Passed reports whether more than PassPercent of all packets were sorted right.
func Passed(correct int) bool { return correct*100 > PassPercent*Packets }

// Award converts a run into portal points: every sorted packet is worth one
// normal question, plus finish and flawless bonuses.
func Award(correct, rounds, lives int) int { return AwardAt(correct, rounds, lives, points.LevelEasy) }

// AwardAt is Award for a player's question level (medium x2, expert x3 per
// sorted packet).
func AwardAt(correct, rounds, lives, level int) int {
	achieved := correct * points.Worth(0, level)
	if rounds >= Packets && lives > 0 {
		achieved += PointsFinish
		if correct == Packets {
			achieved += PointsFlawless
		}
	}
	return points.Finished(achieved, MaxPoints)
}

// State returns the current snapshot (welcome / reconnect).
func (s *Session) State(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	return s.stateLocked(nil, now)
}

func (s *Session) stateLocked(feedback Message, now time.Time) Message {
	msg := Message{
		"t":       "port_state",
		"phase":   s.phase,
		"set":     Message{"key": s.set.Key, "title": s.set.Title.Get(s.Locale), "description": s.set.Description.Get(s.Locale)},
		"bins":    s.set.binMessages(s.Locale),
		"round":   s.round,
		"total":   Packets,
		"lives":   s.lives,
		"max":     Lives,
		"level":   Level(min(s.round, Packets-1)) + 1,
		"levels":  MaxLevel + 1,
		"streak":  s.streak,
		"best":    s.best,
		"score":   s.score,
		"correct": s.correct,
		"wrong":   s.wrong,
		"player":  Message{"name": s.Claims.Name, "grade": s.Claims.Grade, "character": s.Claims.Character},
		"paused":  !s.pausedAt.IsZero(),
		"history": append([]bool{}, s.history...),
	}
	if s.phase != PhaseFalling {
		// The set picker and the cheat sheet are shown before and after a
		// run, never while packets fall.
		msg["sets"] = Current().Catalog(s.Locale)
		legend := make([]Message, 0, len(s.set.Items))
		for _, it := range s.set.Items {
			legend = append(legend, Message{"label": it.Label, "hint": it.Hint.Get(s.Locale), "bin": it.Bin, "level": it.Level + 1})
		}
		msg["legend"] = legend
	}
	if s.phase == PhaseFalling {
		msg["packet"] = Message{
			"id":         s.packetID(),
			"label":      s.packet.Label,
			"column":     s.column,
			"delay":      max(0, -s.elapsed(now).Milliseconds()),
			"fall_ms":    Fall(s.round).Milliseconds(),
			"elapsed_ms": max(0, s.elapsed(now).Milliseconds()),
		}
	}
	if feedback != nil {
		msg["feedback"] = feedback
	}
	if s.result != nil {
		missed := make([]Message, 0, len(s.missed))
		for _, label := range s.missed {
			it := s.set.lookup(label)
			missed = append(missed, Message{"label": it.Label, "hint": it.Hint.Get(s.Locale), "bin": it.Bin})
		}
		msg["result"] = Message{
			"points": s.result.Points, "correct": s.result.Correct, "wrong": s.result.Wrong,
			"seconds": s.result.Seconds, "percent": s.result.Correct * 100 / Packets,
			"passed": Passed(s.result.Correct), "best_streak": s.best, "missed": missed,
			"reason": map[bool]string{true: "lives", false: "finished"}[s.lives == 0],
		}
	}
	return msg
}

func (s Set) lookup(label string) Item {
	for _, it := range s.Items {
		if it.Label == label {
			return it
		}
	}
	return Item{Label: label}
}
