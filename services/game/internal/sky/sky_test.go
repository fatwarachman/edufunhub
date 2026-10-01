package sky

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

var t0 = time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)

func newSession(grade int) *Session {
	return New(auth.Claims{Subject: 7, Name: "Andika", Grade: grade, Game: GameKey}, "id", t0)
}

func wrongOption(s *Session) int {
	_, _, _, _, answer, n := s.Snapshot()
	for i := 0; i < n; i++ {
		if i != answer {
			return i
		}
	}
	return -1
}

func answer(s *Session) int {
	_, _, _, _, a, _ := s.Snapshot()
	return a
}

func TestStartUsesGradeAndThreeOptions(t *testing.T) {
	s := newSession(5)
	msg := s.Start(t0)
	q := msg["question"].(Message)
	if len(q["options"].([]string)) != Options {
		t.Fatalf("expected %d options, got %v", Options, q["options"])
	}
	if msg["player"].(Message)["grade"] != 5 {
		t.Fatal("grade must come from the signed token")
	}
	if _, leaked := q["answer"]; leaked {
		t.Fatal("answer must never be sent before resolving")
	}
}

func TestPerfectFlightAwardsMaxPoints(t *testing.T) {
	s := newSession(3)
	s.Start(t0)
	now := t0
	var res *Result
	for i := 0; i < Rounds; i++ {
		now = now.Add(RoundGap + MinTouch)
		w := wrongOption(s)
		if _, _, err := s.Shoot(w, now); err != nil {
			t.Fatalf("shoot wrong: %v", err)
		}
		if _, _, err := s.Shoot(w, now); err != ErrOption {
			t.Fatal("removed option cannot be hit twice")
		}
		msg, r, err := s.Touch(answer(s), now)
		if err != nil {
			t.Fatalf("touch: %v", err)
		}
		if fb := msg["feedback"].(Message); fb["kind"] != FeedbackCorrect {
			t.Fatalf("feedback %v", fb)
		}
		res = r
	}
	if res == nil || res.Points != Rounds*PointsPerCorrect+PointsFinish+PointsFlawless || res.Correct != Rounds {
		t.Fatalf("unexpected result %+v", res)
	}
	phase, _, shields, score, _, _ := s.Snapshot()
	if phase != PhaseDone || shields != Shields || score != Rounds*(ScoreCorrect+ScoreRemoved) {
		t.Fatalf("phase=%s shields=%d score=%d", phase, shields, score)
	}
	if _, _, err := s.Touch(0, now.Add(time.Hour)); err != ErrPhase {
		t.Fatal("finished flight must reject answers")
	}
}

func TestWrongAnswersDrainShieldsAndEndFlight(t *testing.T) {
	s := newSession(8)
	s.Start(t0)
	now := t0
	var res *Result
	for i := 0; i < Shields; i++ {
		now = now.Add(RoundGap + MinTouch)
		var err error
		if i%2 == 0 {
			_, res, err = s.Touch(wrongOption(s), now)
		} else {
			_, res, err = s.Shoot(answer(s), now)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	phase, round, shields, _, _, _ := s.Snapshot()
	if phase != PhaseDone || shields != 0 || round != Shields {
		t.Fatalf("phase=%s round=%d shields=%d", phase, round, shields)
	}
	if res == nil || res.Points != 0 || res.Wrong != Shields {
		t.Fatalf("result %+v", res)
	}
}

func TestTimingGuards(t *testing.T) {
	s := newSession(2)
	s.Start(t0)
	if _, _, err := s.Touch(answer(s), t0.Add(100*time.Millisecond)); err != ErrTooEarly {
		t.Fatal("instant touch must be rejected")
	}
	if _, _, err := s.Miss(t0.Add(2 * time.Second)); err != ErrTooEarly {
		t.Fatal("early miss must be rejected")
	}
	if _, _, err := s.Touch(9, t0.Add(5*time.Second)); err != ErrOption {
		t.Fatal("out of range option must be rejected")
	}
	if _, _, err := s.Miss(t0.Add(MinMiss)); err != nil {
		t.Fatalf("miss after fall time: %v", err)
	}
	// Next round is not playable during the gap.
	if _, _, err := s.Touch(answer(s), t0.Add(MinMiss+time.Second)); err != ErrTooEarly {
		t.Fatal("touch during round gap must be rejected")
	}
}

func TestCrashCooldownAndDroneLimit(t *testing.T) {
	s := newSession(4)
	s.Start(t0)
	now := t0.Add(time.Second)
	if _, _, err := s.Crash(now); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Crash(now.Add(200 * time.Millisecond)); err != ErrIgnored {
		t.Fatal("crash inside cooldown must be ignored")
	}
	_, _, shields, _, _, _ := s.Snapshot()
	if shields != Shields-1 {
		t.Fatalf("shields %d", shields)
	}
	accepted := 0
	for i := 0; i < 20; i++ {
		if _, err := s.Drone(now.Add(time.Duration(i) * 500 * time.Millisecond)); err == nil {
			accepted++
		}
	}
	if accepted != MaxDronesPerRound {
		t.Fatalf("drone bonus not capped: %d", accepted)
	}
}

func TestStalledRoundTimesOut(t *testing.T) {
	s := newSession(6)
	s.Start(t0)
	if msg, _ := s.Tick(t0.Add(RoundTimeout - time.Second)); msg != nil {
		t.Fatal("tick before timeout must be silent")
	}
	msg, _ := s.Tick(t0.Add(RoundTimeout))
	if msg == nil || msg["feedback"].(Message)["kind"] != FeedbackMissed {
		t.Fatalf("timeout must resolve as missed: %v", msg)
	}
}

func TestAwardRules(t *testing.T) {
	cases := []struct{ correct, rounds, shields, want int }{
		{10, 10, 5, 140},
		{7, 10, 2, 90},
		{3, 6, 0, 30},
		{0, 5, 0, 0},
	}
	for _, c := range cases {
		if got := Award(c.correct, c.rounds, c.shields); got != c.want {
			t.Fatalf("Award(%d,%d,%d)=%d want %d", c.correct, c.rounds, c.shields, got, c.want)
		}
		if Award(c.correct, c.rounds, c.shields) > MaxPoints {
			t.Fatal("award above cap")
		}
	}
}

func TestPauseFreezesRoundClock(t *testing.T) {
	s := newSession(5)
	s.Start(t0)
	s.Pause(t0.Add(time.Second))
	if _, _, err := s.Touch(answer(s), t0.Add(5*time.Second)); err != ErrPhase {
		t.Fatal("answers must be rejected while paused")
	}
	if msg, _ := s.Tick(t0.Add(5 * time.Minute)); msg != nil {
		t.Fatal("paused round must not time out")
	}
	s.Resume(t0.Add(5 * time.Minute))
	// One second of play elapsed before pause; touch needs MinTouch.
	if _, _, err := s.Touch(answer(s), t0.Add(5*time.Minute+100*time.Millisecond)); err != ErrTooEarly {
		t.Fatalf("clock must resume from pause point, got %v", err)
	}
	if _, _, err := s.Touch(answer(s), t0.Add(5*time.Minute+500*time.Millisecond)); err != nil {
		t.Fatalf("touch after resume: %v", err)
	}
}

func TestFallSpeedByGrade(t *testing.T) {
	if !(FallSpeed(1) < FallSpeed(5) && FallSpeed(5) < FallSpeed(8) && FallSpeed(8) < FallSpeed(12)) {
		t.Fatal("higher grades must fall faster")
	}
	// Answers at the fastest speed still need longer than MinMiss to leave the arena.
	if time.Duration(float64(time.Second)*700/FallSpeed(12)) < MinMiss {
		t.Fatal("MinMiss too large for fastest fall speed")
	}
}

func TestHistoryAndPassFlag(t *testing.T) {
	s := newSession(5)
	s.Start(t0)
	now := t0
	var msg Message
	for i := 0; i < Rounds; i++ {
		now = now.Add(RoundGap + MinTouch)
		opt := answer(s)
		if i >= 8 { // 8/10 correct = 80% > 70%
			opt = wrongOption(s)
		}
		msg, _, _ = s.Touch(opt, now)
	}
	hist := msg["history"].([]bool)
	if len(hist) != Rounds || !hist[0] || hist[9] {
		t.Fatalf("history %v", hist)
	}
	res := msg["result"].(Message)
	if res["passed"] != true || res["percent"] != 80 || res["reason"] != "finished" {
		t.Fatalf("result %v", res)
	}
	if Passed(7) {
		t.Fatal("70% is not above the pass threshold")
	}
}

func TestShieldsDepletedReason(t *testing.T) {
	s := newSession(5)
	s.Start(t0)
	now := t0
	var msg Message
	for i := 0; i < Shields; i++ {
		now = now.Add(RoundGap + MinTouch)
		msg, _, _ = s.Touch(wrongOption(s), now)
	}
	if msg["result"].(Message)["reason"] != "shields" {
		t.Fatalf("expected shields reason: %v", msg["result"])
	}
}
