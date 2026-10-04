package snakes

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

func claims(id int64, grade int) auth.Claims {
	return auth.Claims{Subject: id, Name: "P", Grade: grade, Game: GameKey}
}

func roomOf(h *Hub, uid int64) *room {
	var out *room
	h.rooms.View(uid, func(r *room) { out = r })
	return out
}

func TestLandingBouncesAndBoardJumps(t *testing.T) {
	cases := []struct{ pos, dice, want int }{{1, 3, 4}, {97, 3, 100}, {97, 6, 97}, {99, 5, 96}}
	for _, c := range cases {
		if got := Landing(c.pos, c.dice); got != c.want {
			t.Fatalf("Landing(%d,%d)=%d want %d", c.pos, c.dice, got, c.want)
		}
	}
	if Destination(4) != 16 || Destination(98) != 78 || Destination(50) != 50 {
		t.Fatal("ladders and snakes must apply")
	}
}

func TestRoomLifecycleWithPin(t *testing.T) {
	h := NewHub(7)
	now := time.Unix(1_800_000_000, 0)
	host, guest := claims(1, 5), claims(2, 3)
	h.Join(host, "id")
	h.Join(guest, "en")

	pin, _ := h.Create(host, now)
	if len(pin) != PinDigits {
		t.Fatalf("pin %q", pin)
	}
	if _, err := h.Enter(guest, "000000", now); err != ErrNotFound {
		t.Fatalf("unknown pin: %v", err)
	}
	if _, err := h.Enter(guest, pin, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(2, now); err != ErrNotHost {
		t.Fatalf("guest started: %v", err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Enter(claims(3, 4), pin, now); err != ErrStarted {
		t.Fatalf("late join: %v", err)
	}
	st := h.State(guest, now)
	if st["phase"] != PhasePlaying || st["turn"] != 0 || st["step"] != StepRoll || len(st["players"].([]Message)) != 2 || st["you"] != 1 {
		t.Fatalf("state: %v", st)
	}
	if _, err := h.Roll(2, now); err != ErrNotTurn {
		t.Fatalf("guest rolled on host turn: %v", err)
	}
}

func TestSoloRoomAndLocalSeatsAreControlledByHost(t *testing.T) {
	h := NewHub(13)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1, 2), "id")
	_, _ = h.Create(claims(1, 2), now)
	if _, err := h.Start(1, now); err != nil {
		t.Fatalf("solo start: %v", err)
	}
	if r := roomOf(h, 1); len(r.Seats) != 1 {
		t.Fatalf("solo must have one seat: %d", len(r.Seats))
	}
	h.Leave(1, now)

	_, _ = h.Create(claims(1, 2), now)
	_, _ = h.AddLocal(1, "Adik", now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	r.Game.turn = 1
	beginTurn(r, now)
	if _, err := h.Roll(1, now); err != nil {
		t.Fatalf("host must roll for local seat: %v", err)
	}
}

func TestTurnFlowCorrectAnswerMovesWrongPasses(t *testing.T) {
	h := NewHub(11)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 2), claims(2, 2)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	g := &r.Game

	if _, err := h.Roll(1, now); err != nil {
		t.Fatal(err)
	}
	if g.step != StepQuestion || g.dice < 1 || g.dice > 6 {
		t.Fatalf("after roll: %s %d", g.step, g.dice)
	}
	if _, err := h.Answer(1, g.question.Answer, now.Add(100*time.Millisecond)); err != ErrTooEarly {
		t.Fatalf("instant answer: %v", err)
	}
	now = now.Add(time.Second)
	if _, err := h.Answer(1, g.question.Answer, now); err != nil {
		t.Fatal(err)
	}
	if r.Seats[0].Data.score != ScoreCorrect || g.step != StepReveal {
		t.Fatalf("judge: %+v %s", r.Seats[0].Data, g.step)
	}
	final := g.final
	now = now.Add(RevealTime)
	h.Tick(now)
	if g.step != StepMove || r.Seats[0].Data.position != final {
		t.Fatalf("move: %s %d want %d", g.step, r.Seats[0].Data.position, final)
	}
	wantTurn := 1
	if g.dice == 6 {
		wantTurn = 0
	}
	now = now.Add(moveDuration(g))
	h.Tick(now)
	if g.turn != wantTurn || g.step != StepRoll {
		t.Fatalf("turn after move: %d %s", g.turn, g.step)
	}

	g.turn = 1
	beginTurn(r, now)
	_, _ = h.Roll(2, now)
	wrong := (g.question.Answer + 1) % len(g.question.Options)
	now = now.Add(time.Second)
	_, _ = h.Answer(2, wrong, now)
	h.Tick(now.Add(RevealTime))
	if g.turn != 0 || r.Seats[1].Data.position != 1 || r.Seats[1].Data.wrong != 1 {
		t.Fatalf("wrong answer must pass turn without moving: turn %d %+v", g.turn, r.Seats[1].Data)
	}
}

func TestTimersAutoRollAndSkipOffline(t *testing.T) {
	h := NewHub(3)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 8), claims(2, 8)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	g := &r.Game

	h.Tick(now.Add(RollTime))
	if g.step != StepQuestion {
		t.Fatalf("idle player must be auto-rolled: %s", g.step)
	}
	h.Tick(now.Add(RollTime + AnswerTime))
	if g.step != StepReveal || g.right {
		t.Fatalf("unanswered question must count wrong: %s %v", g.step, g.right)
	}
	h.Tick(now.Add(RollTime + AnswerTime + RevealTime))
	if g.turn != 1 {
		t.Fatalf("turn should pass: %d", g.turn)
	}
	h.Offline(2)
	at := now.Add(RollTime + AnswerTime + RevealTime)
	h.Tick(at.Add(OfflineSkip))
	if g.turn != 0 {
		t.Fatalf("offline player must be skipped: %d", g.turn)
	}
}

func TestLeavingHandsOverHostAndEndsLastPlayerStanding(t *testing.T) {
	h := NewHub(5)
	now := time.Unix(1_800_000_000, 0)
	a, b, c := claims(1, 4), claims(2, 4), claims(3, 4)
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Enter(c, pin, now)
	h.Leave(1, now)
	r := roomOf(h, 2)
	if r.Host != 2 || len(r.Seats) != 2 {
		t.Fatalf("host handover: host %d seats %d", r.Host, len(r.Seats))
	}
	_, _ = h.Start(2, now)
	h.Leave(3, now)
	if r.Phase != PhaseDone || r.Seats[r.Game.winner].ID() != 2 || h.State(b, now)["reason"] != "forfeit" {
		t.Fatalf("last player must win: %s %d", r.Phase, r.Game.winner)
	}
	h.Leave(2, now)
	if rooms, _ := h.Counts(); rooms != 0 {
		t.Fatal("empty room must be dropped")
	}
}

func TestEveryFinishedGamePaysPoints(t *testing.T) {
	if Award(0, false) != points.Defaults.Participation {
		t.Fatalf("losing with no correct answers still pays participation: %d", Award(0, false))
	}
	if Award(30, true) != points.Defaults.Participation+30+points.Defaults.Win {
		t.Fatalf("win award %d", Award(30, true))
	}
	if Award(100000, true) != MaxPoints {
		t.Fatal("award must be capped")
	}

	h := NewHub(21)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 4), claims(2, 4)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.AddLocal(1, "Adik", now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	r.Seats[0].Data.position = 99
	r.Game.dice, r.Game.from, r.Game.landing, r.Game.final = 1, 99, 100, 100
	r.Game.step, r.Game.right, r.Game.stepAt = StepReveal, true, now
	h.Tick(now.Add(RevealTime))
	h.Tick(now.Add(RevealTime + moveDuration(&r.Game)))
	if r.Phase != PhaseDone {
		t.Fatalf("game should end: %s", r.Phase)
	}
	results := h.TakeResults()
	if len(results) != 2 {
		t.Fatalf("both account holders get a result, local seat none: %+v", results)
	}
	for _, res := range results {
		if res.Points < points.Defaults.Participation || res.GameKey != GameKey || res.Mission != Mission {
			t.Fatalf("result %+v", res)
		}
	}
	m := results[0].Match
	if m == nil || results[1].Match == nil || m.Key != results[1].Match.Key || m.Mode != "room" || m.Pin != pin || len(m.Players) != 3 || !m.Finished {
		t.Fatalf("results must share the match summary: %+v", m)
	}
	if m.Players[0].Rank != 1 || m.Players[0].UserID != 1 || !m.Players[1].Local || m.Players[1].UserID != 0 || m.Players[1].Name != "Adik" {
		t.Fatalf("winner ranks first, local seat has no account: %+v", m.Players)
	}
	if len(h.TakeResults()) != 0 {
		t.Fatal("results must be reported once")
	}
}

func TestLeavingAfterAnsweringStillPays(t *testing.T) {
	h := NewHub(23)
	now := time.Unix(1_800_000_000, 0)
	a, b, c := claims(1, 4), claims(2, 4), claims(3, 4)
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Enter(c, pin, now)
	_, _ = h.Start(1, now)
	h.Leave(2, now)
	if len(h.TakeResults()) != 0 {
		t.Fatal("leaving without answering must not pay")
	}
	r := roomOf(h, 1)
	r.Seats[2].Data.correct, r.Seats[2].Data.wrong, r.Seats[2].Data.earned = 2, 1, 20
	h.Leave(3, now)
	res := h.TakeResults()
	if len(res) != 2 || res[0].UserID != 3 || res[0].Points != points.Defaults.Participation+20 {
		t.Fatalf("leaver paid for answers, last player wins: %+v", res)
	}
}

func TestRoomIsLimitedToFourAndPruned(t *testing.T) {
	h := NewHub(9)
	now := time.Unix(1_800_000_000, 0)
	pin, _ := h.Create(claims(1, 1), now)
	for id := int64(2); id <= MaxPlayers; id++ {
		if _, err := h.Enter(claims(id, 1), pin, now); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.Enter(claims(9, 1), pin, now); err != ErrFull {
		t.Fatalf("fifth player: %v", err)
	}
	h.Prune(now.Add(EmptyRoom + time.Second))
	if rooms, players := h.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("offline room must be pruned: %d %d", rooms, players)
	}
}
