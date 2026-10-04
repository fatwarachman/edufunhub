package train

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

var t0 = time.Date(2026, 10, 4, 9, 0, 0, 0, time.UTC)

func newRun(grade int) (*Session, time.Time) {
	s := New(auth.Claims{Subject: 4, Name: "Rani", Grade: grade, Game: GameKey}, "id", t0)
	s.Start(t0)
	return s, t0
}

// arrive returns the earliest legal junction time for the current round.
func arrive(s *Session, now time.Time) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.roundAt.Add(Approach(s.Claims.Grade, s.wagons))
}

func answer(s *Session) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.question.Answer
}

func TestStartUsesThreeLanes(t *testing.T) {
	s, now := newRun(3)
	st := s.State(now)
	q := st["question"].(Message)
	if len(q["options"].([]string)) != Lanes || st["lives"] != Lives || st["phase"] != PhaseQuestion {
		t.Fatalf("start state %v", st)
	}
	if _, ok := q["answer"]; ok {
		t.Fatal("answer leaked to client")
	}
}

func TestPerfectRunBuildsWagonsAndAwardsMax(t *testing.T) {
	s, now := newRun(5)
	var res *Result
	for r := 0; r < Rounds; r++ {
		now = arrive(s, now)
		_, out, err := s.Pass(answer(s), now)
		if err != nil {
			t.Fatalf("round %d: %v", r, err)
		}
		res = out
	}
	if res == nil || res.Correct != Rounds || res.Points != 145 || res.GameKey != GameKey || res.Mission != Mission {
		t.Fatalf("result %+v", res)
	}
	st := s.State(now)
	if st["wagons"] != Rounds || st["phase"] != PhaseDone {
		t.Fatalf("final %v", st)
	}
	// 100 + (0..5 capped streak bonus) per round
	want := 0
	for i := 0; i < Rounds; i++ {
		want += ScoreCorrect + ScoreStreak*min(i, 5)
	}
	if st["score"] != want {
		t.Fatalf("score %v want %d", st["score"], want)
	}
}

func TestWrongLanesCostLivesAndEndRun(t *testing.T) {
	s, now := newRun(8)
	var res *Result
	for i := 0; i < Lives; i++ {
		now = arrive(s, now)
		wrong := (answer(s) + 1) % Lanes
		_, res, _ = s.Pass(wrong, now)
	}
	if res == nil || res.Wrong != Lives || res.Points != points.Defaults.Participation {
		t.Fatalf("run must end after %d wrong lanes: %+v", Lives, res)
	}
	if st := s.State(now); st["result"].(Message)["reason"] != "lives" {
		t.Fatalf("reason %v", st["result"])
	}
}

func TestJunctionCannotBeReachedEarly(t *testing.T) {
	s, now := newRun(2)
	if _, _, err := s.Pass(answer(s), now.Add(time.Second)); err != ErrTooEarly {
		t.Fatalf("early pass accepted: %v", err)
	}
	if _, _, err := s.Pass(5, arrive(s, now)); err != ErrLane {
		t.Fatalf("invalid lane accepted: %v", err)
	}
	if _, _, err := s.Pass(answer(s), arrive(s, now).Add(-Tolerance)); err != nil {
		t.Fatalf("pass within tolerance refused: %v", err)
	}
}

func TestTrainSpeedsUpAndKindergartenIsSlowest(t *testing.T) {
	if Approach(0, 0) <= Approach(1, 0) {
		t.Fatal("kindergarten must get the longest approach")
	}
	if Approach(10, 0) >= Approach(1, 0) {
		t.Fatal("older grades must be faster")
	}
	if Approach(5, 4) >= Approach(5, 0) || Approach(5, 20) != Approach(5, 8) {
		t.Fatal("wagons speed the train up, capped at 8")
	}
}

func TestPauseFreezesClockAndStallTimesOut(t *testing.T) {
	s, now := newRun(4)
	s.Pause(now.Add(time.Second))
	if _, _, err := s.Pass(answer(s), now.Add(time.Minute)); err != ErrPhase {
		t.Fatalf("pass while paused: %v", err)
	}
	s.Resume(now.Add(time.Minute))
	if _, _, err := s.Pass(answer(s), now.Add(time.Minute+2*time.Second)); err != ErrTooEarly {
		t.Fatalf("pause must not count as travel time: %v", err)
	}
	msg, _ := s.Tick(now.Add(time.Minute + RoundTimeout))
	if msg == nil || msg["feedback"].(Message)["kind"] != FeedbackMissed {
		t.Fatalf("stalled round must be missed: %v", msg)
	}
}

func TestAwardRules(t *testing.T) {
	cases := []struct{ correct, rounds, lives, want int }{
		{10, 10, 3, 145}, {9, 10, 1, 115}, {5, 7, 0, 55}, {0, 3, 0, 5},
	}
	for _, c := range cases {
		if got := Award(c.correct*10, c.correct, c.rounds, c.lives); got != c.want {
			t.Fatalf("Award(%d,%d,%d)=%d want %d", c.correct, c.rounds, c.lives, got, c.want)
		}
	}
}
