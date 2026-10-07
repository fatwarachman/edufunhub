package snakes

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
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
	if _, paid := h.Leave(2, now); paid != 0 || len(h.TakeResults()) != 0 {
		t.Fatal("leaving without answering must not pay")
	}
	r := roomOf(h, 1)
	r.Seats[2].Data.correct, r.Seats[2].Data.wrong, r.Seats[2].Data.earned = 2, 1, 20
	if _, paid := h.Leave(3, now); paid != points.Defaults.Participation+20 {
		t.Fatalf("leaver is told the points kept: %d", paid)
	}
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

// finishSeat moves seat i onto square 100 through the normal reveal/move flow.
func finishSeat(h *Hub, r *room, i int, now time.Time) time.Time {
	g := &r.Game
	g.turn = i
	r.Seats[i].Data.position = 99
	g.dice, g.from, g.landing, g.final = 1, 99, 100, 100
	g.step, g.right, g.stepAt = StepReveal, true, now
	now = now.Add(RevealTime)
	h.Tick(now)
	now = now.Add(moveDuration(g))
	h.Tick(now)
	return now
}

func TestFirstFinisherEarnsFinishBonus(t *testing.T) {
	h := NewHub(31)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 4), claims(2, 4)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	finishSeat(h, r, 1, now)
	if r.Phase != PhaseDone || r.Game.winner != 1 || r.Game.first != 1 {
		t.Fatalf("untimed game ends at the first finish: %s winner %d", r.Phase, r.Game.winner)
	}
	byUser := map[int64]Result{}
	for _, res := range h.TakeResults() {
		byUser[res.UserID] = res
	}
	if byUser[2].Points != Award(0, true)+FinishBonus || byUser[1].Points != Award(0, false) {
		t.Fatalf("finish bonus goes to the first finisher only: %+v", byUser)
	}
	if st := h.State(b, now); st["finish_bonus_won"] != true || st["points"] != Award(0, true)+FinishBonus {
		t.Fatalf("state shows the bonus: %v %v", st["finish_bonus_won"], st["points"])
	}
}

func TestTimedGameRunsUntilTimeIsUp(t *testing.T) {
	h := NewHub(33)
	now := time.Unix(1_800_000_000, 0)
	a, b, c := claims(1, 4), claims(2, 4), claims(3, 4)
	for _, x := range []auth.Claims{a, b, c} {
		h.Join(x, "id")
	}
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Enter(c, pin, now)
	if _, err := h.SetDuration(2, 10, now); err != ErrNotHost {
		t.Fatalf("guest set duration: %v", err)
	}
	if _, err := h.SetDuration(1, 7, now); err != ErrDuration {
		t.Fatalf("unknown duration: %v", err)
	}
	if _, err := h.SetDuration(1, 10, now); err != nil {
		t.Fatal(err)
	}
	if st := h.State(b, now); st["minutes"] != 10 {
		t.Fatalf("lobby shows duration: %v", st["minutes"])
	}
	_, _ = h.Start(1, now)
	if _, err := h.SetDuration(1, 5, now); err != ErrPhase {
		t.Fatalf("duration changed while playing: %v", err)
	}
	r := roomOf(h, 1)
	now = finishSeat(h, r, 2, now)
	if r.Phase != PhasePlaying || r.Game.first != 2 || r.Seats[2].Data.finished != 1 {
		t.Fatalf("timed game keeps going after a finish: %s first %d", r.Phase, r.Game.first)
	}
	if r.Game.turn == 2 {
		t.Fatal("a finished seat takes no more turns")
	}
	r.Seats[1].Data.position = 50
	r.Game.turn = 0
	beginTurn(r, now)
	h.Tick(r.Game.started.Add(10 * time.Minute))
	if r.Phase != PhaseDone || h.State(a, now)["reason"] != "time" || r.Game.winner != 2 {
		t.Fatalf("time up ends the game, first finisher wins: %s %v %d", r.Phase, h.State(a, now)["reason"], r.Game.winner)
	}
	m := h.TakeResults()[0].Match
	if m.Players[2].Rank != 1 || m.Players[1].Rank != 2 || m.Players[0].Rank != 3 {
		t.Fatalf("ranking finisher, then furthest: %+v", m.Players)
	}
}

func TestTimedGameWithoutFinisherRanksFurthest(t *testing.T) {
	h := NewHub(35)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 4), claims(2, 4)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.SetDuration(1, 5, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	r.Seats[1].Data.position = 40
	h.Tick(now.Add(5 * time.Minute))
	if r.Phase != PhaseDone || r.Game.winner != 1 || r.Game.first != -1 {
		t.Fatalf("furthest seat wins on time: %s %d", r.Phase, r.Game.winner)
	}
	for _, res := range h.TakeResults() {
		if res.UserID == 2 && res.Points != Award(0, true) {
			t.Fatalf("no finish bonus without a finisher: %+v", res)
		}
	}
}

func TestIdlePlayerIsAutoRolledAfterTenSeconds(t *testing.T) {
	h := NewHub(37)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 4), claims(2, 4)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	if RollTime != 10*time.Second {
		t.Fatalf("turn wait must be 10 s: %v", RollTime)
	}
	h.Tick(now.Add(RollTime - time.Millisecond))
	if r.Game.step != StepRoll {
		t.Fatal("rolled too early")
	}
	now = now.Add(RollTime)
	h.Tick(now)
	if r.Game.step != StepQuestion || !r.Game.auto || h.State(a, now)["auto_roll"] != true {
		t.Fatalf("auto roll: %s %v", r.Game.step, r.Game.auto)
	}
	q := h.State(a, now)["question"].(Message)
	if q["remaining_ms"] != IdleAnswerTime.Milliseconds() {
		t.Fatalf("idle player gets the short answer window: %v", q["remaining_ms"])
	}
	h.Tick(now.Add(IdleAnswerTime))
	if r.Game.step != StepReveal || r.Game.right {
		t.Fatalf("away player times out: %s", r.Game.step)
	}
}

func TestHostDisconnectKeepsGameAndHandsOver(t *testing.T) {
	h := NewHub(39)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 4), claims(2, 4)
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	_, _ = h.AddLocal(1, "Adik", now)
	_, _ = h.Enter(b, pin, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	h.Offline(1)
	h.HandOver(now)
	if ids := h.HandOver(now.Add(lobby.HostGrace - time.Second)); len(ids) != 0 || r.Host != 1 {
		t.Fatal("host keeps the role during the grace period")
	}
	h.HandOver(now.Add(lobby.HostGrace))
	if r.Host != 2 || r.Phase != PhasePlaying {
		t.Fatalf("host role moves, game continues: host %d %s", r.Host, r.Phase)
	}
	if r.Controls(2, 1) || !r.Controls(1, 1) {
		t.Fatal("local seat stays with the device that added it")
	}
	// The game keeps going: offline turns are skipped, the guest plays on.
	for i := 0; i < 3 && r.Game.turn != 2; i++ {
		now = now.Add(time.Minute)
		h.Tick(now)
		h.Tick(now.Add(RevealTime))
	}
	if r.Game.turn != 2 || r.Phase != PhasePlaying {
		t.Fatalf("turn must reach the connected guest: turn %d %s", r.Game.turn, r.Phase)
	}
	h.Join(a, "id")
	if p, ok := h.Presence(1); !ok || p.Pin != pin || p.Phase != PhasePlaying || p.Host {
		t.Fatalf("returning host finds the room: %+v %v", p, ok)
	}
	if st := h.State(a, now); st["you"] != 0 {
		t.Fatalf("returning host gets the seat back: %v", st["you"])
	}
}

func TestHostAnswerTimeAndStop(t *testing.T) {
	h := NewHub(21)
	now := time.Unix(1_800_000_000, 0)
	pin, _ := h.Create(claims(1, 4), now)
	_, _ = h.Enter(claims(2, 4), pin, now)
	if _, err := h.SetAnswerTime(1, 15, now); err != nil {
		t.Fatal(err)
	}
	_, _ = h.Start(1, now)
	g := &roomOf(h, 1).Game
	if g.answer != 15*time.Second || answerTime(g) != 15*time.Second {
		t.Fatalf("answer %v", g.answer)
	}
	g.auto = true
	if answerTime(g) != IdleAnswerTime {
		t.Fatal("auto roll keeps the short idle window")
	}
	if _, err := h.Stop(2, now); err != ErrNotHost {
		t.Fatalf("guest stop: %v", err)
	}
	if _, err := h.Stop(1, now); err != nil {
		t.Fatal(err)
	}
	st := h.State(claims(2, 4), now)
	if st["phase"] != PhaseDone || st["reason"] != "stopped" {
		t.Fatalf("state %v %v", st["phase"], st["reason"])
	}
	if roomOf(h, 2) == nil {
		t.Fatal("guest stays in the room to see the result")
	}
}
