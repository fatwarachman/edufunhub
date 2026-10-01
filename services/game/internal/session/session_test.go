package session

import (
	"strconv"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/challenge"
)

func claims() auth.Claims {
	return auth.Claims{Subject: 9, Name: "Andika", Grade: 6, Color: "teal", Accessory: "cap", Game: GameKey}
}

func solve(t *testing.T, s *Session, now time.Time) {
	t.Helper()
	for guard := 0; guard < 80; guard++ {
		c := s.ActiveChallenge()
		if c == nil {
			t.Fatal("no active challenge")
		}
		if c.Phase == challenge.PhaseDone {
			if !c.Passed {
				t.Fatal("challenge failed unexpectedly")
			}
			s.Leave(now)
			return
		}
		if c.Phase == challenge.PhaseRoll {
			c.SetRoller(func() int { return 6 })
			s.Roll(now)
			continue
		}
		q := c.Question()
		v := strconv.Itoa(q.Answer)
		if c.Kind == challenge.TrueFalse {
			v = strconv.FormatBool(q.Answer == 1)
		}
		if m := s.Answer(v, now); m["t"] == "error" {
			t.Fatalf("answer error %v", m)
		}
	}
	t.Fatal("challenge did not finish")
}

func TestFullMissionFlowProducesResult(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := New(claims(), "id", now)
	w := s.World()

	s.Teleport(w.Flag.X-0.5, w.Flag.Y)
	if m := s.Raise(now); m["code"] != "locked" {
		t.Fatalf("flag must be locked, got %v", m)
	}
	for i, cp := range w.Checkpoints {
		s.Teleport(cp.X+1, cp.Y+0.6)
		m := s.Interact(now)
		if m["t"] != "challenge" || (m["question"] == nil && m["phase"] != challenge.PhaseRoll) {
			t.Fatalf("station %d did not start challenge: %v", i, m)
		}
		if q, ok := m["question"].(Message); ok {
			if _, leaked := q["answer"]; leaked {
				t.Fatal("answer leaked to client")
			}
		}
		solve(t, s, now)
		if !w.Checkpoints[i].Cleared {
			t.Fatalf("gate %d not cleared", i)
		}
	}
	s.Teleport(w.Flag.X-0.8, w.Flag.Y)
	if m := s.Interact(now); m["t"] != "raise" {
		t.Fatalf("raise not started: %v", m)
	}
	if m, r := s.Tick(now.Add(time.Second)); m != nil || r != nil {
		t.Fatal("completed too early")
	}
	m, r := s.Tick(now.Add(4 * time.Second))
	if m["t"] != "complete" || r == nil || r.Points <= 0 || r.UserID != 9 || r.GameKey != GameKey {
		t.Fatalf("bad completion %v %+v", m, r)
	}
	if again, r2 := s.Tick(now.Add(5 * time.Second)); again != nil || r2 != nil {
		t.Fatal("result must be emitted once")
	}
}

func TestMovementIsValidatedAndSpeedCapped(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := New(claims(), "en", now)
	x, y := s.Position()
	m := s.Move(x+30, y, now.Add(100*time.Millisecond))
	if m == nil || m["t"] != "correct" {
		t.Fatal("teleport must be corrected")
	}
	nx, _ := s.Position()
	if nx-x > 1.5 {
		t.Fatalf("moved too far: %v", nx-x)
	}
	s.Move(x, y-40, now.Add(600*time.Millisecond))
	_, ny := s.Position()
	if ny < 6 {
		t.Fatal("walked into the lake")
	}
}

func TestAbandonAppliesCooldown(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := New(claims(), "id", now)
	cp := s.World().Checkpoints[0]
	s.Teleport(cp.X+1, cp.Y+0.6)
	s.Interact(now)
	s.Leave(now)
	if m := s.Interact(now.Add(time.Second)); m["code"] != "cooldown" {
		t.Fatalf("expected cooldown got %v", m)
	}
	if m := s.Interact(now.Add(4 * time.Second)); m["t"] != "challenge" {
		t.Fatalf("expected retry to work got %v", m)
	}
	if s.Welcome()["stats"].(Message)["failures"] != 1 {
		t.Fatal("abandon must count as failure")
	}
}

func TestSwitchMissionResets(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := New(claims(), "id", now)
	if err := s.StartMission("summit", now); err != nil {
		t.Fatal(err)
	}
	if s.Welcome()["mission"] != "summit" {
		t.Fatal("mission not switched")
	}
	if err := s.StartMission("nope", now); err == nil {
		t.Fatal("unknown mission accepted")
	}
}
