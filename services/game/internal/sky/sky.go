// Package sky implements the authoritative referee for Sukhoi Sky Quiz.
//
// The browser renders the flight and reports what the jet did (touched or shot an
// answer, let the answers pass, crashed into an obstacle, destroyed a drone). This
// package owns the questions, the correct answers, shields, score, rounds and the
// final point award, and rejects reports that are impossible in time.
package sky

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
)

const (
	GameKey = "sky-quiz"
	Rounds  = 10
	Shields = 5
	Options = 3

	// RoundGap is the pause between rounds while the client shows feedback.
	RoundGap = 2200 * time.Millisecond
	// MinTouch is the earliest an answer can physically reach the jet after spawning.
	MinTouch = 1200 * time.Millisecond
	// MinShot is the earliest a bullet can reach a freshly spawned answer.
	MinShot = 300 * time.Millisecond
	// MinMiss is the earliest every answer can have fallen past the bottom edge.
	MinMiss = 12 * time.Second
	// RoundTimeout auto-resolves a round as missed (client stalled or cheating).
	RoundTimeout = 45 * time.Second
	// MaxPause is how long a flight may stay paused before the round clock resumes.
	MaxPause = 10 * time.Minute
	// HitCooldown mirrors the client invincibility window after a crash.
	HitCooldown = 1200 * time.Millisecond
	// MaxDronesPerRound caps drone bonus reports per round.
	MaxDronesPerRound = 6
	// MinDroneGap is the minimum interval between two drone kills.
	MinDroneGap = 400 * time.Millisecond

	ScoreCorrect = 100
	ScoreRemoved = 20
	ScoreDrone   = 10

	// PassPercent: a flight with more than this share of correct answers earns the congrats screen.
	PassPercent = 70

	PointsFinish   = 20
	PointsFlawless = 20
)

// MaxPoints is the highest award of one flight.
var MaxPoints = points.Cap(Rounds) + PointsFinish + PointsFlawless

// Phases.
const (
	PhaseReady    = "ready"
	PhaseQuestion = "question"
	PhaseDone     = "done"
)

// Feedback kinds sent to the client.
const (
	FeedbackCorrect     = "correct"      // touched the right answer
	FeedbackWrongTouch  = "wrong_touch"  // touched a wrong answer
	FeedbackRemoved     = "removed"      // shot a wrong answer
	FeedbackShotCorrect = "shot_correct" // shot the right answer
	FeedbackMissed      = "missed"       // all answers passed
	FeedbackCrash       = "crash"        // hit an obstacle
	FeedbackDrone       = "drone"        // destroyed a drone
)

var (
	ErrPhase    = errors.New("wrong_phase")
	ErrTooEarly = errors.New("too_early")
	ErrOption   = errors.New("invalid_option")
	ErrIgnored  = errors.New("ignored")
)

// Message is a generic event.
type Message map[string]any

// Result is reported to Laravel when a flight ends.
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
	// Answers lists bank questions answered during the flight.
	Answers []questions.Answer `json:"answers"`
}

// Session is one player's flight. Safe for concurrent use.
type Session struct {
	mu        sync.Mutex
	Claims    auth.Claims
	Locale    string
	gen       *questions.Generator
	seed      uint64
	phase     string
	round     int
	shields   int
	score     int
	earned    int
	correct   int
	wrong     int
	subject   string
	question  questions.Question
	removed   map[int]bool
	picked    *int // original bank option the jet flew into this round
	roundAt   time.Time
	started   time.Time
	lastHit   time.Time
	lastDrone time.Time
	drones    int
	pausedAt  time.Time
	history   []bool
	answers   []questions.Answer
	result    *Result
	reported  bool
	LastSeen  time.Time
}

// New creates a session waiting for "start".
func New(claims auth.Claims, locale string, now time.Time) *Session {
	return &Session{
		Claims:   claims,
		Locale:   normLocale(locale),
		seed:     uint64(now.UnixNano()) ^ uint64(claims.Subject)<<20,
		phase:    PhaseReady,
		shields:  Shields,
		LastSeen: now,
	}
}

func normLocale(l string) string {
	if l == "en" {
		return "en"
	}
	return "id"
}

// SetLocale switches the language of question texts.
// SetSubject picks the question subject for the next run ("" or mix = all).
func (s *Session) SetSubject(subject string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subject = questions.NormSubject(subject)
}

func (s *Session) SetLocale(l string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Locale = normLocale(l)
}

// Start begins a new flight (also used for "play again").
func (s *Session) Start(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	s.seed++
	s.gen = questions.NewFor(GameKey, s.Claims.Grade, s.seed).For(s.subject, s.Claims.Subject).AtLevel(s.Claims.Level)
	s.phase = PhaseQuestion
	s.round, s.shields, s.score, s.earned, s.correct, s.wrong = 0, Shields, 0, 0, 0, 0
	s.started = now
	s.result, s.reported = nil, false
	s.lastHit = time.Time{}
	s.pausedAt = time.Time{}
	s.history = []bool{}
	s.answers = nil
	s.nextQuestion(now, 0)
	return s.stateLocked(nil, now)
}

// nextQuestion prepares the round; it becomes playable after delay.
func (s *Session) nextQuestion(now time.Time, delay time.Duration) {
	s.question = s.gen.Present(s.gen.Choice(), Options)
	s.removed = map[int]bool{}
	s.roundAt = now.Add(delay)
	s.drones = 0
}

func (s *Session) elapsed(now time.Time) time.Duration {
	if !s.pausedAt.IsZero() {
		return s.pausedAt.Sub(s.roundAt)
	}
	return now.Sub(s.roundAt)
}

// Pause freezes the round clock (the client hides the arena while paused).
func (s *Session) Pause(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase == PhaseQuestion && s.pausedAt.IsZero() {
		s.pausedAt = now
	}
	return s.stateLocked(nil, now)
}

// Resume restarts the round clock, shifting it by the paused time (capped).
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

// FallSpeed is the answer fall speed (arena px/s) for a grade: higher grades fall faster.
func FallSpeed(grade int) float64 {
	switch questions.Band(grade) {
	case 0:
		return 30
	case 1:
		return 35
	case 2:
		return 40
	default:
		return 45
	}
}

// Touch: the jet flew into an answer.
func (s *Session) Touch(option int, now time.Time) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.checkOption(option, now, MinTouch); err != nil {
		return nil, nil, err
	}
	s.picked = s.question.Original(option)
	if option == s.question.Answer {
		s.correct++
		s.score += ScoreCorrect
		s.earned += s.question.Worth()
		return s.resolve(FeedbackCorrect, ScoreCorrect, 0, now)
	}
	s.wrong++
	return s.resolve(FeedbackWrongTouch, 0, 1, now)
}

// Shoot: a bullet hit an answer.
func (s *Session) Shoot(option int, now time.Time) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.checkOption(option, now, MinShot); err != nil {
		return nil, nil, err
	}
	if option == s.question.Answer {
		s.wrong++
		return s.resolve(FeedbackShotCorrect, 0, 1, now)
	}
	s.removed[option] = true
	s.score += ScoreRemoved
	fb := Message{"kind": FeedbackRemoved, "option": option, "score": ScoreRemoved}
	return s.stateLocked(fb, now), nil, nil
}

// Miss: every remaining answer left the screen.
func (s *Session) Miss(now time.Time) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase != PhaseQuestion || !s.pausedAt.IsZero() {
		return nil, nil, ErrPhase
	}
	if s.elapsed(now) < MinMiss {
		return nil, nil, ErrTooEarly
	}
	s.wrong++
	return s.resolve(FeedbackMissed, 0, 1, now)
}

// Crash: the jet hit an obstacle.
func (s *Session) Crash(now time.Time) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase != PhaseQuestion || !s.pausedAt.IsZero() || s.elapsed(now) < 0 {
		return nil, nil, ErrPhase
	}
	if !s.lastHit.IsZero() && now.Sub(s.lastHit) < HitCooldown {
		return nil, nil, ErrIgnored
	}
	s.lastHit = now
	s.shields--
	fb := Message{"kind": FeedbackCrash, "damage": 1}
	if s.shields <= 0 {
		s.shields = 0
		res := s.finish(now)
		return s.stateLocked(fb, now), res, nil
	}
	return s.stateLocked(fb, now), nil, nil
}

// Drone: the jet destroyed a drone (small bonus, rate limited).
func (s *Session) Drone(now time.Time) (Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase != PhaseQuestion || !s.pausedAt.IsZero() || s.elapsed(now) < 0 {
		return nil, ErrPhase
	}
	if s.drones >= MaxDronesPerRound || (!s.lastDrone.IsZero() && now.Sub(s.lastDrone) < MinDroneGap) {
		return nil, ErrIgnored
	}
	s.drones++
	s.lastDrone = now
	s.score += ScoreDrone
	return Message{"t": "sky_score", "score": s.score}, nil
}

// Tick auto-resolves stalled rounds.
func (s *Session) Tick(now time.Time) (Message, *Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.phase != PhaseQuestion {
		return nil, nil
	}
	if !s.pausedAt.IsZero() {
		if now.Sub(s.pausedAt) < MaxPause {
			return nil, nil
		}
		s.resumeLocked(now)
	}
	if s.elapsed(now) < RoundTimeout {
		return nil, nil
	}
	s.wrong++
	msg, res, _ := s.resolve(FeedbackMissed, 0, 1, now)
	return msg, res
}

func (s *Session) checkOption(option int, now time.Time, min time.Duration) error {
	if s.phase != PhaseQuestion || !s.pausedAt.IsZero() {
		return ErrPhase
	}
	if option < 0 || option >= len(s.question.Options) || s.removed[option] {
		return ErrOption
	}
	if s.elapsed(now) < min {
		return ErrTooEarly
	}
	return nil
}

// resolve ends the round, reveals the answer and moves on.
func (s *Session) resolve(kind string, score, damage int, now time.Time) (Message, *Result, error) {
	fb := Message{
		"kind":   kind,
		"score":  score,
		"damage": damage,
		"answer": s.question.Options[s.question.Answer].Get(s.Locale),
	}
	s.shields = max(0, s.shields-damage)
	s.history = append(s.history, kind == FeedbackCorrect)
	if s.question.FromBank {
		s.answers = append(s.answers, questions.Answer{Key: s.question.Key, Correct: kind == FeedbackCorrect, Choice: s.picked})
	}
	s.picked = nil
	s.round++
	var res *Result
	if s.shields == 0 || s.round >= Rounds {
		res = s.finish(now)
	} else {
		s.nextQuestion(now, RoundGap)
	}
	return s.stateLocked(fb, now), res, nil
}

// finish computes the server-side award once.
func (s *Session) finish(now time.Time) *Result {
	s.phase = PhaseDone
	if s.result != nil {
		return nil
	}
	s.result = &Result{
		EventID:     fmt.Sprintf("sq-%d-sky-%d", s.Claims.Subject, s.started.UnixNano()),
		UserID:      s.Claims.Subject,
		GameKey:     GameKey,
		Mission:     "sky",
		Grade:       s.Claims.Grade,
		Points:      Award(s.earned, s.correct, s.round, s.shields),
		Correct:     s.correct,
		Wrong:       s.wrong,
		Seconds:     int(now.Sub(s.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, s.answers...),
	}
	return s.result
}

// Passed reports whether more than PassPercent of all questions were answered correctly.
func Passed(correct int) bool { return correct*100 > PassPercent*Rounds }

// Award converts a flight into portal points. Every flight pays the
// standard participation award on top of what the pilot achieved.
func Award(earned, correct, rounds, shields int) int {
	achieved := earned
	if rounds >= Rounds && shields > 0 {
		achieved += PointsFinish
		if correct == Rounds {
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
		"t":                "sky_state",
		"phase":            s.phase,
		"subject":          subjectOrMix(s.subject),
		"subject_fallback": s.gen != nil && s.gen.Fallback(),
		"round":            s.round,
		"total":            Rounds,
		"shields":          s.shields,
		"max":              Shields,
		"score":            s.score,
		"correct":          s.correct,
		"wrong":            s.wrong,
		"player":           Message{"name": s.Claims.Name, "grade": s.Claims.Grade, "character": s.Claims.Character},
		"speed":            FallSpeed(s.Claims.Grade),
		"paused":           !s.pausedAt.IsZero(),
		"history":          append([]bool{}, s.history...),
	}
	if s.phase == PhaseQuestion {
		opts := make([]string, len(s.question.Options))
		for i, o := range s.question.Options {
			opts[i] = o.Get(s.Locale)
		}
		removed := make([]int, 0, len(s.removed))
		for i := range s.removed {
			removed = append(removed, i)
		}
		msg["question"] = Message{
			"id":      fmt.Sprintf("%d-%d", s.started.UnixNano(), s.round),
			"subject": s.question.Subject,
			"text":    s.question.Prompt.Get(s.Locale),
			"options": opts,
			"removed": removed,
			"delay":   max(0, -s.elapsed(now).Milliseconds()),
		}
	}
	if feedback != nil {
		msg["feedback"] = feedback
	}
	if s.result != nil {
		msg["result"] = Message{
			"points": s.result.Points, "correct": s.result.Correct, "wrong": s.result.Wrong, "seconds": s.result.Seconds,
			"percent": s.result.Correct * 100 / Rounds, "passed": Passed(s.result.Correct),
			"reason": map[bool]string{true: "shields", false: "finished"}[s.shields == 0],
		}
	}
	return msg
}

// Snapshot for tests.
func (s *Session) Snapshot() (phase string, round, shields, score int, answer int, options int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.phase, s.round, s.shields, s.score, s.question.Answer, len(s.question.Options)
}

func subjectOrMix(s string) string {
	if s == "" {
		return questions.Mix
	}
	return s
}
