package edusnake

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
)

var t0 = time.Date(2026, 10, 30, 10, 0, 0, 0, time.UTC)

var fast = Config{
	Step:      100 * time.Millisecond,
	Countdown: time.Second,
	Answer:    20 * time.Second,
	Game:      5 * time.Minute,
	Respawn:   500 * time.Millisecond,
	Obstacle:  2 * time.Second,
}

func claims(id int64, grade int) auth.Claims {
	return auth.Claims{Subject: id, Name: "P", Grade: grade, Game: GameKey}
}

func setup(t *testing.T, players int, mode string) (*Hub, *room) {
	t.Helper()
	h := NewHub(fast, 7)
	h.Join(claims(1, 4), "id")
	pin, _ := h.Create(claims(1, 4), t0)
	for i := 2; i <= players; i++ {
		h.Join(claims(int64(i), 4), "id")
		if _, err := h.Enter(claims(int64(i), 4), pin, t0); err != nil {
			t.Fatalf("enter: %v", err)
		}
	}
	if mode != ModeShared {
		if _, err := h.SetMode(1, mode, t0); err != nil {
			t.Fatalf("mode: %v", err)
		}
	}
	if _, err := h.Start(1, t0); err != nil {
		t.Fatalf("start: %v", err)
	}
	var r *room
	h.rooms.View(1, func(rm *room) { r = rm })
	return h, r
}

func TestStartShowsQuestionAndFood(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	st := h.State(claims(1, 4), t0)
	if st["phase"] != lobby.PhasePlaying {
		t.Fatalf("phase %v", st["phase"])
	}
	board := st["board"].(Message)
	q, ok := board["question"].(Message)
	if !ok || q["text"] == "" {
		t.Fatalf("no question in state: %#v", board["question"])
	}
	if n := len(q["options"].([]string)); n < 2 || n > Options {
		t.Fatalf("options %d", n)
	}
	if len(board["foods"].([]Message)) != len(q["options"].([]string)) {
		t.Fatal("one food per option")
	}
	if got := r.Seats[0].Data.tail(); got != InitialTail {
		t.Fatalf("tail %d", got)
	}
}

func TestSnakesFrozenDuringCountdown(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	head := r.Seats[0].Data.body[0]
	h.Tick(t0.Add(500 * time.Millisecond))
	if r.Seats[0].Data.body[0] != head {
		t.Fatal("moved during countdown")
	}
	h.Tick(t0.Add(fast.Countdown))
	if r.Seats[0].Data.body[0] == head {
		t.Fatal("did not move after countdown")
	}
}

// place puts the correct (or a wrong) food right in front of seat 0.
func place(r *room, b *board, correct bool) {
	p := &r.Seats[0].Data
	front := p.body[0].add(p.dir)
	for i := range b.foods {
		if (b.foods[i].option == b.q.Answer) == correct {
			b.foods[i].at = front
		} else {
			b.foods[i].at = Point{0, 0}
		}
	}
}

func TestCorrectBiteCutsTailAndLoadsNextQuestion(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	b := r.Game.shared
	place(r, b, true)
	round := b.round
	h.Tick(t0.Add(fast.Countdown))
	p := &r.Seats[0].Data
	if p.tail() != InitialTail-Cut || p.correct != 1 || p.earned == 0 {
		t.Fatalf("tail %d correct %d earned %d", p.tail(), p.correct, p.earned)
	}
	if b.round != round+1 || b.q.Prompt.ID == "" {
		t.Fatal("next question not loaded")
	}
}

func TestWrongBiteGrowsTail(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	b := r.Game.shared
	place(r, b, false)
	round := b.round
	h.Tick(t0.Add(fast.Countdown))
	p := &r.Seats[0].Data
	if p.tail() != InitialTail+Grow || p.wrong != 1 {
		t.Fatalf("tail %d wrong %d", p.tail(), p.wrong)
	}
	if b.round != round {
		t.Fatal("wrong answer must keep the question")
	}
	if len(b.foods) != len(b.q.Options)-1 {
		t.Fatal("eaten wrong option leaves the board")
	}
}

func TestTimeoutGrowsAndChangesQuestion(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	b := r.Game.shared
	round := b.round
	h.Tick(b.deadline)
	if r.Seats[0].Data.tail() != InitialTail+Grow || b.round != round+1 {
		t.Fatalf("tail %d round %d", r.Seats[0].Data.tail(), b.round)
	}
	if fb := r.Game.feedback; fb == nil || !fb.timeout {
		t.Fatal("timeout feedback")
	}
}

func TestClearingTailWinsAndReports(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	now := t0.Add(fast.Countdown)
	for i := 0; r.Phase == lobby.PhasePlaying && i < 20; i++ {
		place(r, r.Game.shared, true)
		h.Tick(now)
		now = now.Add(fast.Step)
	}
	if r.Phase != lobby.PhaseDone || r.Game.winner != 0 || r.Game.reason != "cleared" {
		t.Fatalf("phase %s winner %d reason %s", r.Phase, r.Game.winner, r.Game.reason)
	}
	res := h.TakeResults()
	if len(res) != 1 || res[0].GameKey != "snake" || res[0].Points <= 0 || res[0].Mission != "room" {
		t.Fatalf("results %#v", res)
	}
	if res[0].Points > MaxPoints {
		t.Fatal("over cap")
	}
}

func TestWallCrashCostsLifeThenOut(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	now := t0.Add(fast.Countdown)
	p := &r.Seats[0].Data
	for i := 0; r.Phase == lobby.PhasePlaying && i < 400; i++ {
		// Hide food so the snake only crashes.
		for k := range r.Game.shared.foods {
			r.Game.shared.foods[k].at = Point{-5, -5}
		}
		r.Game.shared.deadline = now.Add(time.Hour)
		p.dir, p.queue = Point{1, 0}, nil
		h.Tick(now)
		now = now.Add(fast.Step)
	}
	if p.lives != 0 || p.alive || r.Phase != lobby.PhaseDone {
		t.Fatalf("lives %d alive %v phase %s", p.lives, p.alive, r.Phase)
	}
}

func TestSpawnLaysWholeTailInside(t *testing.T) {
	for _, mode := range []string{ModeShared, ModeSplit} {
		_, r := setup(t, MaxPlayers, mode)
		for i, s := range r.Seats {
			seen := map[Point]bool{}
			for _, c := range s.Data.body {
				if !inside(c) || seen[c] {
					t.Fatalf("%s seat %d: bad body cell %v", mode, i, c)
				}
				seen[c] = true
			}
			if len(seen) != InitialTail+1 {
				t.Fatalf("%s seat %d: %d cells", mode, i, len(seen))
			}
		}
	}
}

func TestTurnRejectsReverse(t *testing.T) {
	h, r := setup(t, 1, ModeShared)
	if _, err := h.Turn(1, "left", t0); err != nil {
		t.Fatal(err)
	}
	if len(r.Seats[0].Data.queue) != 0 {
		t.Fatal("reverse turn accepted")
	}
	_, _ = h.Turn(1, "up", t0)
	if len(r.Seats[0].Data.queue) != 1 {
		t.Fatal("turn not queued")
	}
	if _, err := h.Turn(1, "diagonal", t0); err != ErrDirection {
		t.Fatal("bad direction accepted")
	}
}

func TestSharedEveryoneSeesSameQuestion(t *testing.T) {
	h, _ := setup(t, 3, ModeShared)
	q1 := h.State(claims(1, 4), t0)["board"].(Message)["question"].(Message)
	q2 := h.State(claims(3, 4), t0)["board"].(Message)["question"].(Message)
	if q1["id"] != q2["id"] || q1["text"] != q2["text"] {
		t.Fatal("shared mode must show one question")
	}
}

func TestSplitBoardsAndJunkAttack(t *testing.T) {
	h, r := setup(t, 2, ModeSplit)
	if r.Seats[0].Data.board == r.Seats[1].Data.board {
		t.Fatal("split mode needs own boards")
	}
	st := h.State(claims(1, 4), t0)
	if st["board"].(Message)["question"] == nil || len(st["boards"].([]Message)) != 1 {
		t.Fatal("own question + opponent mini board")
	}
	if _, ok := st["boards"].([]Message)[0]["question"]; ok {
		t.Fatal("opponent question must stay hidden")
	}
	place(r, r.Seats[0].Data.board, true)
	r.Seats[1].Data.frozenUntil = t0.Add(time.Hour)
	h.Tick(t0.Add(fast.Countdown))
	if r.Seats[1].Data.tail() != InitialTail+Junk {
		t.Fatalf("junk tail %d", r.Seats[1].Data.tail())
	}
	if fb := r.Game.feedback; fb == nil || fb.attack == nil || fb.attack.to != 1 {
		t.Fatal("attack feedback")
	}
	place(r, r.Seats[0].Data.board, true)
	h.Tick(t0.Add(fast.Countdown + fast.Step))
	if len(r.Seats[1].Data.board.obstacles) != JunkBlocks {
		t.Fatal("second attack drops blocks")
	}
	h.Tick(t0.Add(fast.Countdown + fast.Obstacle + time.Second))
	if len(r.Seats[1].Data.board.obstacles) != 0 {
		t.Fatal("blocks expire")
	}
}

func TestLastSnakeStandingWins(t *testing.T) {
	h, r := setup(t, 2, ModeShared)
	r.Seats[1].Data.lives = 1
	r.Seats[1].Data.dir = Point{0, -1}
	r.Seats[1].Data.body = stacked(Point{20, 0}, 3)
	r.Seats[0].Data.frozenUntil = t0.Add(time.Hour)
	h.Tick(t0.Add(fast.Countdown))
	if r.Phase != lobby.PhaseDone || r.Game.winner != 0 {
		t.Fatalf("phase %s winner %d", r.Phase, r.Game.winner)
	}
	if len(h.TakeResults()) != 2 {
		t.Fatal("both players reported")
	}
}

func TestHeadOnBodyCollision(t *testing.T) {
	h, r := setup(t, 2, ModeShared)
	a, b := &r.Seats[0].Data, &r.Seats[1].Data
	b.body = []Point{{10, 10}, {11, 10}, {12, 10}}
	b.frozenUntil = t0.Add(time.Hour)
	a.body = []Point{{11, 9}, {11, 8}}
	a.dir = Point{0, 1}
	lives := a.lives
	h.Tick(t0.Add(fast.Countdown))
	if a.lives != lives-1 {
		t.Fatal("hitting another body costs a life")
	}
}

func TestLeaveMidGamePays(t *testing.T) {
	h, r := setup(t, 2, ModeShared)
	place(r, r.Game.shared, true)
	h.Tick(t0.Add(fast.Countdown))
	_, paid := h.Leave(1, t0.Add(2*time.Second))
	if paid <= 0 {
		t.Fatalf("paid %d", paid)
	}
	if r.Phase != lobby.PhaseDone {
		t.Fatal("last player standing ends the game")
	}
}

func TestModeOnlyForHostInLobby(t *testing.T) {
	h := NewHub(fast, 1)
	h.Join(claims(1, 4), "id")
	pin, _ := h.Create(claims(1, 4), t0)
	h.Join(claims(2, 4), "id")
	_, _ = h.Enter(claims(2, 4), pin, t0)
	if _, err := h.SetMode(2, ModeSplit, t0); err == nil {
		t.Fatal("guest changed mode")
	}
	if _, err := h.SetMode(1, "chaos", t0); err != ErrMode {
		t.Fatal("bad mode accepted")
	}
	if _, err := h.SetMode(1, ModeSplit, t0); err != nil {
		t.Fatal(err)
	}
	if h.State(claims(2, 4), t0)["mode"] != ModeSplit {
		t.Fatal("mode not shared with room")
	}
}
