package challenge

import (
	"testing"
	"time"

	"edufunhub/game/internal/questions"
)

var t0 = time.Unix(1_800_000_000, 0)

func correctValue(c *Challenge) string {
	q := c.Question()
	switch c.Kind {
	case TrueFalse:
		if q.Answer == 1 {
			return "true"
		}
		return "false"
	default:
		return itoa(q.Answer)
	}
}

func wrongValue(c *Challenge) string {
	q := c.Question()
	switch c.Kind {
	case TrueFalse:
		if q.Answer == 1 {
			return "false"
		}
		return "true"
	case MathSprint:
		return itoa(q.Answer + 1)
	default:
		return itoa((q.Answer + 1) % len(q.Options))
	}
}

func itoa(n int) string {
	if n < 0 {
		return "-" + itoa(-n)
	}
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

func TestQuizPassesAndFailsEarly(t *testing.T) {
	c := Start(QuickQuiz, 0, 1, questions.New(4, 1), t0)
	for i := 0; i < 3; i++ {
		fb, err := c.Answer(correctValue(c), "id", t0)
		if err != nil || !fb.Correct {
			t.Fatalf("expected correct: %v %v", fb, err)
		}
	}
	if c.Phase != PhaseDone || !c.Passed {
		t.Fatalf("quiz should pass after 3 correct, phase=%s", c.Phase)
	}

	c = Start(QuickQuiz, 0, 1, questions.New(4, 2), t0)
	for i := 0; i < 3; i++ {
		c.Answer(wrongValue(c), "en", t0)
	}
	if c.Phase != PhaseDone || c.Passed {
		t.Fatal("quiz must fail once passing is impossible")
	}
	if _, err := c.Answer("0", "id", t0); err != ErrWrongPhase {
		t.Fatalf("answer after done must be rejected, got %v", err)
	}
}

func TestInvalidAnswersAreRejectedWithoutPenalty(t *testing.T) {
	c := Start(QuickQuiz, 0, 1, questions.New(8, 3), t0)
	for _, v := range []string{"", "9", "-1", "abc"} {
		if _, err := c.Answer(v, "id", t0); err != ErrBadAnswer {
			t.Fatalf("%q: expected ErrBadAnswer got %v", v, err)
		}
	}
	tf := Start(TrueFalse, 0, 1, questions.New(8, 3), t0)
	if _, err := tf.Answer("maybe", "id", t0); err != ErrBadAnswer {
		t.Fatal("true/false must reject non booleans")
	}
	if c.Wrong != 0 || tf.Wrong != 0 {
		t.Fatal("invalid input must not count")
	}
}

func TestTimeoutCountsAsWrong(t *testing.T) {
	c := Start(TrueFalse, 1, 1, questions.New(2, 4), t0)
	fb, fired := c.Tick("id", t0.Add(11*time.Second))
	if !fired || !fb.Timeout || c.Wrong != 1 {
		t.Fatalf("timeout not applied: %+v wrong=%d", fb, c.Wrong)
	}
	fb, _ = c.Answer(correctValue(c), "id", t0.Add(30*time.Second))
	if !fb.Timeout {
		t.Fatal("late answer must be treated as timeout")
	}
}

func TestMathSprintNeedsTargetBeforeClock(t *testing.T) {
	c := Start(MathSprint, 2, 1, questions.New(12, 5), t0)
	for i := 0; i < c.Rules.Needed; i++ {
		if fb, err := c.Answer(correctValue(c), "id", t0.Add(time.Second)); err != nil || !fb.Correct {
			t.Fatalf("sprint answer failed: %v %v (%s)", fb, err, c.Question().Prompt.ID)
		}
	}
	if !c.Passed {
		t.Fatal("sprint should pass")
	}
	c = Start(MathSprint, 2, 1, questions.New(1, 6), t0)
	c.Answer(correctValue(c), "id", t0)
	c.Tick("id", t0.Add(61*time.Second))
	if c.Phase != PhaseDone || c.Passed {
		t.Fatal("sprint must fail when clock ends")
	}
}

func TestSnakesAndLaddersFlow(t *testing.T) {
	c := Start(SnakesLadders, 1, 1, questions.New(5, 7), t0)
	if c.Phase != PhaseRoll {
		t.Fatalf("board game must start by rolling, got %s", c.Phase)
	}
	if _, err := c.Answer("0", "id", t0); err != ErrWrongPhase {
		t.Fatal("answer must require a dice roll first")
	}
	turn := func(roll int, correct bool) {
		t.Helper()
		c.SetRoller(func() int { return roll })
		if _, err := c.Roll(t0); err != nil {
			t.Fatalf("roll: %v", err)
		}
		if c.Phase != PhaseQuestion || c.PendingRoll != roll {
			t.Fatalf("roll must open a question with pending roll, got %s/%d", c.Phase, c.PendingRoll)
		}
		if _, err := c.Roll(t0); err != ErrWrongPhase {
			t.Fatal("cannot roll twice before answering")
		}
		v := correctValue(c)
		if !correct {
			v = wrongValue(c)
		}
		c.Answer(v, "id", t0)
	}
	turn(2, true) // 1+2=3 ladder -> 11
	if c.Position != 11 || c.LastJump != 11 || c.MoveFrom != 1 || c.MoveLanding != 3 {
		t.Fatalf("ladder not applied: pos=%d jump=%d from=%d land=%d", c.Position, c.LastJump, c.MoveFrom, c.MoveLanding)
	}
	turn(5, false) // wrong answer: no move, turn consumed
	if c.Position != 11 || c.PendingRoll != 0 || c.Turns != 2 || c.Phase != PhaseRoll {
		t.Fatalf("wrong answer must not move: pos=%d turns=%d", c.Position, c.Turns)
	}
	turn(6, true) // 17 snake -> 9, six grants bonus roll (turn not consumed)
	if c.Position != 9 || c.LastJump != 9 || c.Turns != 2 || c.Phase != PhaseRoll {
		t.Fatalf("snake/bonus wrong: pos=%d turns=%d phase=%s", c.Position, c.Turns, c.Phase)
	}
	turn(4, true) // 13
	turn(5, true) // 18
	turn(4, true) // 22 snake -> 14
	if c.Position != 14 {
		t.Fatalf("expected 14 got %d", c.Position)
	}
	turn(5, true) // 19
	turn(6, true) // 25 capped -> win
	if !c.Passed || c.Phase != PhaseDone || c.Position != BoardSize {
		t.Fatalf("should finish at 25, got %d", c.Position)
	}

	f := Start(SnakesLadders, 1, 1, questions.New(5, 8), t0)
	f.SetRoller(func() int { return 3 })
	for f.Phase != PhaseDone {
		f.Roll(t0)
		f.Answer(wrongValue(f), "id", t0)
	}
	if f.Passed || f.Turns != f.Rules.MaxTurns {
		t.Fatal("running out of turns must fail")
	}
}

func TestSnakesQuestionTimeoutEndsTurn(t *testing.T) {
	c := Start(SnakesLadders, 1, 1, questions.New(5, 9), t0)
	c.Roll(t0)
	if _, fired := c.Tick("id", t0.Add(26*time.Second)); !fired {
		t.Fatal("question timeout expected")
	}
	if c.Phase != PhaseRoll || c.Position != 1 || c.Turns != 1 {
		t.Fatalf("timeout must consume turn without moving: %s %d %d", c.Phase, c.Position, c.Turns)
	}
}

func TestGradeBandsAndShuffledAnswers(t *testing.T) {
	for grade := 1; grade <= 12; grade++ {
		g := questions.New(grade, uint64(grade))
		for i := 0; i < 40; i++ {
			q := g.Choice()
			if len(q.Options) != 4 || q.Answer < 0 || q.Answer > 3 {
				t.Fatalf("grade %d bad question %+v", grade, q)
			}
			seen := map[string]bool{}
			for _, o := range q.Options {
				if seen[o.ID] {
					t.Fatalf("duplicate option in %s", q.Prompt.ID)
				}
				seen[o.ID] = true
			}
		}
	}
	if questions.Band(1) != 0 || questions.Band(6) != 1 || questions.Band(9) != 2 || questions.Band(12) != 3 {
		t.Fatal("band mapping wrong")
	}
}
