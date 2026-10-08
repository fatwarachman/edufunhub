package session

import (
	"testing"
	"time"

	"edufunhub/game/internal/challenge"
	"edufunhub/game/internal/questions"
)

func failChallenge(t *testing.T, s *Session, now time.Time) {
	t.Helper()
	for guard := 0; guard < 80; guard++ {
		c := s.ActiveChallenge()
		if c.Phase == challenge.PhaseDone {
			return
		}
		if c.Phase == challenge.PhaseRoll {
			c.SetRoller(func() int { return 1 })
			s.Roll(now)
			continue
		}
		q := c.Question()
		v := "0"
		switch c.Kind {
		case challenge.TrueFalse:
			v = "true"
			if q.Answer == 1 {
				v = "false"
			}
		case challenge.MathSprint:
			v = "-99999"
		default:
			if q.Answer == 0 {
				v = "1"
			}
		}
		s.Answer(v, now)
	}
	t.Fatal("challenge did not finish")
}

func TestFailedStationResumesFromCheckpoint(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := New(claims(), "id", now)
	w := s.World()
	for i := 0; i < 2; i++ {
		cp := w.Checkpoints[i]
		s.Teleport(cp.X+1, cp.Y+0.6)
		s.Interact(now)
		solve(t, s, now)
	}
	cp := w.Checkpoints[2]
	s.Teleport(cp.X+1, cp.Y+0.6)
	s.Interact(now)
	failChallenge(t, s, now)
	c := s.ActiveChallenge()
	keptCorrect, keptPos := c.Correct, c.Position
	s.Leave(now)
	if !w.Checkpoints[0].Cleared || !w.Checkpoints[1].Cleared {
		t.Fatal("cleared gates must stay open after a failure")
	}
	if x, y := s.Position(); x < w.Checkpoints[1].X {
		t.Fatalf("player sent back towards spawn: %.1f,%.1f", x, y)
	}
	m := s.Interact(now.Add(RetryCooldown + time.Second))
	if m["t"] != "challenge" {
		t.Fatalf("retry did not start: %v", m)
	}
	retry := s.ActiveChallenge()
	if retry.Kind == challenge.SnakesLadders {
		if keptPos > 1 && retry.Position != keptPos {
			t.Fatalf("snakes retry restarted at %d, want %d", retry.Position, keptPos)
		}
	} else if keptCorrect > 0 && retry.Correct != min(keptCorrect, retry.Rules.Needed-1) {
		t.Fatalf("retry restarted with %d correct, want %d", retry.Correct, keptCorrect)
	}
	solve(t, s, now.Add(RetryCooldown+time.Second))
	if !w.Checkpoints[2].Cleared {
		t.Fatal("third gate not cleared after retry")
	}
}

func TestResumeKeepsCorrectAnswers(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	gen := questions.New(6, 1)
	c := challenge.Resume(challenge.QuickQuiz, 2, 1, gen, challenge.Progress{Correct: 2}, now)
	if c.Correct != 2 || !c.Resumed || c.Step != 0 {
		t.Fatalf("resume lost progress: correct=%d resumed=%v step=%d", c.Correct, c.Resumed, c.Step)
	}
	full := challenge.Resume(challenge.QuickQuiz, 2, 1, gen, challenge.Progress{Correct: 99}, now)
	if full.Correct != full.Rules.Needed-1 {
		t.Fatalf("resume must still need one correct answer, got %d", full.Correct)
	}
	board := challenge.Resume(challenge.SnakesLadders, 1, 1, gen, challenge.Progress{Position: 18}, now)
	if board.Position != 18 {
		t.Fatalf("board resume position %d", board.Position)
	}
}

func TestNewTokenKeepsMissionProgress(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	old := New(claims(), "id", now)
	if err := old.StartMission("forest", "", now); err != nil {
		t.Fatal(err)
	}
	w := old.World()
	cp := w.Checkpoints[0]
	old.Teleport(cp.X+1, cp.Y+0.6)
	old.Interact(now)
	solve(t, old, now)

	renamed := claims()
	renamed.Name = "Andika Baru"
	fresh := New(renamed, "id", now.Add(time.Minute))
	fresh.CarryFrom(old)
	if fresh.Welcome()["mission"] != "forest" {
		t.Fatalf("mission reset to %v", fresh.Welcome()["mission"])
	}
	if !fresh.World().Checkpoints[0].Cleared {
		t.Fatal("cleared gate lost on a new token")
	}
}
