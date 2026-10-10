// Package train implements the authoritative referee for Kereta Pengetahuan.
//
// Each round three signboards (one answer per rail) roll toward the train.
// The browser animates the run and reports which rail the train was on when
// it reached the junction. This package owns the questions, correct answers,
// lives, wagons, speed and the final point award, and rejects reports that
// arrive before the junction can physically be reached.
package train

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
	GameKey = "knowledge-train"
	Mission = "train"
	Rounds  = 10
	Lives   = 3
	Lanes   = 3

	// RoundGap is the pause between rounds while the client shows feedback.
	RoundGap = 1800 * time.Millisecond
	// Tolerance absorbs network latency on the junction check.
	Tolerance = 400 * time.Millisecond
	// RoundTimeout auto-resolves a stalled round as missed.
	RoundTimeout = 40 * time.Second
	// MaxPause is how long a run may stay paused before the clock resumes.
	MaxPause = 10 * time.Minute

	ScoreCorrect = 100
	ScoreStreak  = 20

	PassPercent = 70

	PointsFinish   = 20
	PointsFlawless = 20
)

// MaxPoints is the highest award of one run.
var MaxPoints = points.Cap(Rounds) + PointsFinish + PointsFlawless

// Phases.
const (
	PhaseReady    = "ready"
	PhaseQuestion = "question"
	PhaseDone     = "done"
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
	ErrLane     = errors.New("invalid_lane")
)

// Message is a generic event.
type Message map[string]any

// Result is reported to Laravel when a run ends.
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
}

// Session is one player's run. Safe for concurrent use.
type Session struct {
	mu       sync.Mutex
	Claims   auth.Claims
	Locale   string
	gen      *questions.Generator
	seed     uint64
	phase    string
	round    int
	lives    int
	wagons   int
	streak   int
	score    int
	earned   int
	correct  int
	wrong    int
	subject  string
	question questions.Question
	roundAt  time.Time
	started  time.Time
	pausedAt time.Time
	history  []bool
	answers  []questions.Answer
	result   *Result
	LastSeen time.Time
}

// New creates a session waiting for "start".
func New(claims auth.Claims, locale string, now time.Time) *Session {
	return &Session{
		Claims:   claims,
		Locale:   normLocale(locale),
		seed:     uint64(now.UnixNano()) ^ uint64(claims.Subject)<<24,
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

// SetSubject picks the question subject for the next run ("" or mix = all).
func (s *Session) SetSubject(subject string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subject = questions.NormSubject(subject)
}

// SetLocale switches the language of question texts.
func (s *Session) SetLocale(l string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Locale = normLocale(l)
}

// Approach is how long the signboards take to reach the train: younger
// players get more reading time, and the train speeds up as wagons are added.
func Approach(grade, wagons int) time.Duration {
	base := []time.Duration{9 * time.Second, 8 * time.Second, 7 * time.Second, 6500 * time.Millisecond}[questions.Band(grade)]
	if grade == 0 {
		base = 11 * time.Second
	}
	faster := time.Duration(min(wagons, 8)) * 250 * time.Millisecond
	return base - faster
}

// Start begins a new run (also used for "play again").
func (s *Session) Start(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	s.seed++
	s.gen = questions.NewFor(GameKey, s.Claims.Grade, s.seed).For(s.subject, s.Claims.Subject).AtLevel(s.Claims.Level)
	s.phase = PhaseQuestion
	s.round, s.lives, s.wagons, s.streak, s.score, s.earned, s.correct, s.wrong = 0, Lives, 0, 0, 0, 0, 0, 0
	s.started = now
	s.pausedAt = time.Time{}
	s.result = nil
	s.history = []bool{}
	s.answers = nil
	s.nextQuestion(now, 0)
	return s.stateLocked(nil, now)
}

func (s *Session) nextQuestion(now time.Time, delay time.Duration) {
	s.question = s.gen.Present(s.gen.Choice(), Lanes)
	s.roundAt = now.Add(delay)
}

func (s *Session) elapsed(now time.Time) time.Duration {
	if !s.pausedAt.IsZero() {
		return s.pausedAt.Sub(s.roundAt)
	}
	return now.Sub(s.roundAt)
}

// Pause freezes the round clock.
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

// Pass: the train reached the junction on lane.
func (s *Session) Pass(lane int, now time.Time) (Message, *Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	if s.phase != PhaseQuestion || !s.pausedAt.IsZero() {
		return nil, nil, ErrPhase
	}
	if lane < 0 || lane >= len(s.question.Options) {
		return nil, nil, ErrLane
	}
	if s.elapsed(now) < Approach(s.Claims.Grade, s.wagons)-Tolerance {
		return nil, nil, ErrTooEarly
	}
	if lane == s.question.Answer {
		s.correct++
		s.streak++
		s.wagons++
		gained := ScoreCorrect + ScoreStreak*min(s.streak-1, 5)
		s.score += gained
		s.earned += s.question.Worth()
		return s.resolve(FeedbackCorrect, lane, gained, now)
	}
	s.wrong++
	s.streak = 0
	s.lives--
	return s.resolve(FeedbackWrong, lane, 0, now)
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
	s.streak = 0
	s.lives--
	msg, res, _ := s.resolve(FeedbackMissed, -1, 0, now)
	return msg, res
}

func (s *Session) resolve(kind string, lane, gained int, now time.Time) (Message, *Result, error) {
	fb := Message{
		"kind":   kind,
		"lane":   lane,
		"score":  gained,
		"answer": s.question.Answer,
		"text":   s.question.Options[s.question.Answer].Get(s.Locale),
	}
	s.lives = max(0, s.lives)
	s.history = append(s.history, kind == FeedbackCorrect)
	if s.question.FromBank {
		s.answers = append(s.answers, questions.Answer{Key: s.question.Key, Correct: kind == FeedbackCorrect, Choice: s.question.Original(lane)})
	}
	s.round++
	var res *Result
	if s.lives == 0 || s.round >= Rounds {
		res = s.finish(now)
	} else {
		s.nextQuestion(now, RoundGap)
	}
	return s.stateLocked(fb, now), res, nil
}

func (s *Session) finish(now time.Time) *Result {
	s.phase = PhaseDone
	if s.result != nil {
		return nil
	}
	s.result = &Result{
		EventID:     fmt.Sprintf("kt-%d-train-%d", s.Claims.Subject, s.started.UnixNano()),
		UserID:      s.Claims.Subject,
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       s.Claims.Grade,
		Points:      Award(s.earned, s.correct, s.round, s.lives),
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

// Award converts a run into portal points.
func Award(earned, correct, rounds, lives int) int {
	achieved := earned
	if rounds >= Rounds && lives > 0 {
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
		"t":                "train_state",
		"phase":            s.phase,
		"subject":          subjectOrMix(s.subject),
		"subject_fallback": s.gen != nil && s.gen.Fallback(),
		"round":            s.round,
		"total":            Rounds,
		"lives":            s.lives,
		"max":              Lives,
		"wagons":           s.wagons,
		"streak":           s.streak,
		"score":            s.score,
		"correct":          s.correct,
		"wrong":            s.wrong,
		"player":           Message{"name": s.Claims.Name, "grade": s.Claims.Grade, "character": s.Claims.Character},
		"paused":           !s.pausedAt.IsZero(),
		"history":          append([]bool{}, s.history...),
	}
	if s.phase == PhaseQuestion {
		opts := make([]string, len(s.question.Options))
		for i, o := range s.question.Options {
			opts[i] = o.Get(s.Locale)
		}
		msg["question"] = Message{
			"id":          fmt.Sprintf("%d-%d", s.started.UnixNano(), s.round),
			"subject":     s.question.Subject,
			"text":        s.question.Prompt.Get(s.Locale),
			"media":       s.question.Media(),
			"options":     opts,
			"delay":       max(0, -s.elapsed(now).Milliseconds()),
			"approach_ms": Approach(s.Claims.Grade, s.wagons).Milliseconds(),
			"elapsed_ms":  max(0, s.elapsed(now).Milliseconds()),
		}
	}
	if feedback != nil {
		msg["feedback"] = feedback
	}
	if s.result != nil {
		msg["result"] = Message{
			"points": s.result.Points, "correct": s.result.Correct, "wrong": s.result.Wrong,
			"seconds": s.result.Seconds, "percent": s.result.Correct * 100 / Rounds,
			"passed": Passed(s.result.Correct), "wagons": s.wagons,
			"reason": map[bool]string{true: "lives", false: "finished"}[s.lives == 0],
		}
	}
	return msg
}

func subjectOrMix(s string) string {
	if s == "" {
		return questions.Mix
	}
	return s
}
