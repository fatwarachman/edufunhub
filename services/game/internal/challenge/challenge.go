// Package challenge implements the server-authoritative mini games guarding mission gates.
package challenge

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"edufunhub/game/internal/questions"
)

// Kinds.
const (
	QuickQuiz     = "quick_quiz"
	TrueFalse     = "true_false"
	MathSprint    = "math_sprint"
	SnakesLadders = "snakes_ladders"
)

// Phases.
const (
	PhaseQuestion = "question"
	PhaseRoll     = "roll"
	PhaseDone     = "done"
)

var (
	ErrWrongPhase = errors.New("action not allowed in this phase")
	ErrBadAnswer  = errors.New("invalid answer")
)

// BoardSize is the number of cells on the mini snakes & ladders board.
const BoardSize = 25

// BoardCols is the number of columns (rows = BoardSize / BoardCols), numbered boustrophedon.
const BoardCols = 5

// Jumps maps ladder bottoms/snake heads to destinations.
var Jumps = map[int]int{3: 11, 8: 16, 12: 21, 17: 9, 22: 14}

// Rules per kind.
type Rules struct {
	Total    int           `json:"total"`
	Needed   int           `json:"needed"`
	PerStep  time.Duration `json:"-"`
	Overall  time.Duration `json:"-"`
	MaxTurns int           `json:"max_turns,omitempty"`
}

// RulesFor returns the rules for a kind scaled by mission difficulty (1..3).
func RulesFor(kind string, difficulty int) Rules {
	switch kind {
	case QuickQuiz:
		return Rules{Total: 5, Needed: 3 + min(difficulty-1, 1), PerStep: 15 * time.Second}
	case TrueFalse:
		return Rules{Total: 6, Needed: 4 + min(difficulty-1, 1), PerStep: 10 * time.Second}
	case MathSprint:
		return Rules{Total: 0, Needed: 5 + difficulty, Overall: 60 * time.Second}
	default:
		return Rules{Total: 0, Needed: 1, PerStep: 25 * time.Second, MaxTurns: 16 - 2*difficulty}
	}
}

// Challenge holds one running mini game.
type Challenge struct {
	Kind       string
	Checkpoint int
	Rules      Rules
	Phase      string
	Step       int
	Correct    int
	Wrong      int
	Position   int
	Turns      int
	LastRoll   int
	LastJump   int
	// PendingRoll is the rolled value waiting for a correct answer (0 = none).
	PendingRoll int
	// MoveFrom/MoveLanding describe the last move for step-by-step client animation.
	MoveFrom    int
	MoveLanding int
	Passed      bool
	Deadline    time.Time
	Ends        time.Time
	current     questions.Question
	gen         *questions.Generator
	rollFn      func() int
}

// Feedback describes the result of one answer.
type Feedback struct {
	Correct bool   `json:"correct"`
	Answer  string `json:"answer"`
	Hint    string `json:"hint,omitempty"`
	Timeout bool   `json:"timeout,omitempty"`
}

// Start creates a challenge.
func Start(kind string, checkpoint, difficulty int, gen *questions.Generator, now time.Time) *Challenge {
	c := &Challenge{Kind: kind, Checkpoint: checkpoint, Rules: RulesFor(kind, difficulty), gen: gen, Position: 1}
	c.rollFn = func() int { return 1 + gen.Rand.IntN(6) }
	if kind == MathSprint {
		c.Ends = now.Add(c.Rules.Overall)
	}
	if kind == SnakesLadders {
		// Classic flow: roll the dice first, then answer to earn the move.
		c.Phase = PhaseRoll
		return c
	}
	c.next(now)
	return c
}

// SetRoller overrides the dice (tests).
func (c *Challenge) SetRoller(fn func() int) { c.rollFn = fn }

func (c *Challenge) next(now time.Time) {
	c.Phase = PhaseQuestion
	switch c.Kind {
	case TrueFalse:
		c.current = c.gen.TrueFalse()
	case MathSprint:
		c.current = c.gen.Arithmetic()
	default:
		c.current = c.gen.Choice()
	}
	if c.Rules.PerStep > 0 {
		c.Deadline = now.Add(c.Rules.PerStep)
	} else {
		c.Deadline = c.Ends
	}
}

// Question returns the current question (never includes the answer).
func (c *Challenge) Question() questions.Question { return c.current }

// Answer evaluates a submitted answer. value is an option index, "true"/"false", or a number.
func (c *Challenge) Answer(value string, locale string, now time.Time) (Feedback, error) {
	if c.Phase != PhaseQuestion {
		return Feedback{}, ErrWrongPhase
	}
	if c.expired(now) {
		return c.timeout(locale, now), nil
	}
	value = strings.TrimSpace(value)
	var ok bool
	switch c.Kind {
	case TrueFalse:
		if value != "true" && value != "false" {
			return Feedback{}, ErrBadAnswer
		}
		ok = (value == "true") == (c.current.Answer == 1)
	case MathSprint:
		value = strings.ReplaceAll(value, "−", "-")
		n, err := strconv.Atoi(value)
		if err != nil || len(value) > 8 {
			return Feedback{}, ErrBadAnswer
		}
		ok = n == c.current.Answer
	default:
		i, err := strconv.Atoi(value)
		if err != nil || i < 0 || i >= len(c.current.Options) {
			return Feedback{}, ErrBadAnswer
		}
		ok = i == c.current.Answer
	}
	fb := Feedback{Correct: ok, Answer: c.answerText(locale), Hint: c.current.Hint.Get(locale)}
	c.record(ok, now)
	return fb, nil
}

// Roll throws the dice. The pawn only moves after the following question is answered correctly.
func (c *Challenge) Roll(now time.Time) (int, error) {
	if c.Kind != SnakesLadders || c.Phase != PhaseRoll {
		return 0, ErrWrongPhase
	}
	roll := c.rollFn()
	c.LastRoll = roll
	c.LastJump = 0
	c.PendingRoll = roll
	c.MoveFrom, c.MoveLanding = c.Position, c.Position
	c.next(now)
	return roll, nil
}

// move applies the pending roll: walk, then ladder/snake. Reaching or passing the last cell wins.
func (c *Challenge) move(now time.Time) {
	roll := c.PendingRoll
	c.PendingRoll = 0
	c.MoveFrom = c.Position
	landing := min(c.Position+roll, BoardSize)
	c.MoveLanding = landing
	c.LastJump = 0
	pos := landing
	if to, ok := Jumps[landing]; ok {
		c.LastJump = to
		pos = to
	}
	c.Position = pos
	if pos == BoardSize {
		c.finish(true)
		return
	}
	if roll == 6 {
		// Bonus turn on a six, like the full board game.
		c.Phase = PhaseRoll
		c.Deadline = time.Time{}
		return
	}
	c.endTurn()
}

// Tick expires timers; returns feedback when a timeout happened.
func (c *Challenge) Tick(locale string, now time.Time) (Feedback, bool) {
	if c.Phase == PhaseDone {
		return Feedback{}, false
	}
	if c.Kind == MathSprint && !now.Before(c.Ends) {
		c.finish(c.Correct >= c.Rules.Needed)
		return Feedback{Timeout: true}, true
	}
	if c.Phase == PhaseQuestion && c.expired(now) {
		return c.timeout(locale, now), true
	}
	return Feedback{}, false
}

func (c *Challenge) expired(now time.Time) bool {
	return !c.Deadline.IsZero() && !now.Before(c.Deadline)
}

func (c *Challenge) timeout(locale string, now time.Time) Feedback {
	fb := Feedback{Correct: false, Timeout: true, Answer: c.answerText(locale), Hint: c.current.Hint.Get(locale)}
	if c.Kind == MathSprint {
		c.finish(c.Correct >= c.Rules.Needed)
		return fb
	}
	c.record(false, now)
	return fb
}

func (c *Challenge) answerText(locale string) string {
	switch c.Kind {
	case TrueFalse:
		return strconv.FormatBool(c.current.Answer == 1)
	case MathSprint:
		return strconv.Itoa(c.current.Answer)
	default:
		return c.current.Options[c.current.Answer].Get(locale)
	}
}

func (c *Challenge) record(ok bool, now time.Time) {
	if ok {
		c.Correct++
	} else {
		c.Wrong++
	}
	switch c.Kind {
	case SnakesLadders:
		if ok {
			c.move(now)
			return
		}
		c.PendingRoll = 0
		c.MoveFrom, c.MoveLanding, c.LastJump = c.Position, c.Position, 0
		c.endTurn()
	case MathSprint:
		c.Step++
		if c.Correct >= c.Rules.Needed {
			c.finish(true)
			return
		}
		c.next(now)
	default:
		c.Step++
		remaining := c.Rules.Total - c.Step
		if c.Correct >= c.Rules.Needed {
			c.finish(true)
			return
		}
		if c.Correct+remaining < c.Rules.Needed {
			c.finish(false)
			return
		}
		c.next(now)
	}
}

// endTurn consumes a snakes & ladders turn and waits for the next dice roll.
func (c *Challenge) endTurn() {
	c.Turns++
	if c.Turns >= c.Rules.MaxTurns {
		c.finish(false)
		return
	}
	c.Phase = PhaseRoll
	c.Deadline = time.Time{}
}

func (c *Challenge) finish(passed bool) {
	c.Phase = PhaseDone
	c.Passed = passed
	c.Deadline = time.Time{}
}
