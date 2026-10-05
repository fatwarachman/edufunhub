package floordrop

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/questions"
)

// fastConfig keeps timings short so a whole game runs in a few seconds.
func fastConfig() Config {
	c := Defaults
	c.BaseTime, c.YoungTime, c.MinTime = 400*time.Millisecond, 400*time.Millisecond, 150*time.Millisecond
	c.ReadyTime, c.LockTime, c.RevealTime, c.SummaryTime = 60*time.Millisecond, 30*time.Millisecond, 40*time.Millisecond, 30*time.Millisecond
	c.Grace, c.LobbyDrop = 120*time.Millisecond, 200*time.Millisecond
	c.MinAnswer = 0
	c.Tick, c.Progress = 10*time.Millisecond, 20*time.Millisecond
	c.Buffer = 512
	return c
}

func claims(id int64, grade int) auth.Claims {
	return auth.Claims{Subject: id, Name: fmt.Sprintf("P%d", id), Grade: grade, Game: GameKey}
}

type harness struct {
	t    *testing.T
	hub  *Hub
	host *Client
	pin  string
	kids []*Client
}

func newHarness(t *testing.T, cfg Config, players int) *harness {
	t.Helper()
	h := &harness{t: t, hub: NewHub(cfg, 7)}
	h.host = NewClient(auth.Claims{Subject: 9000, Name: "Teacher", Grade: 4, Game: HostKey}, true, "id", cfg.Buffer)
	room, err := h.hub.Create(h.host, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	h.pin = room.Pin
	for i := 1; i <= players; i++ {
		c := NewClient(claims(int64(i), 4), false, "id", cfg.Buffer)
		if err := h.hub.Join(c, h.pin); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
		h.kids = append(h.kids, c)
	}
	t.Cleanup(h.hub.CloseAll)
	return h
}

// inspect reads room state on the room goroutine.
func (h *harness) inspect(fn func(r *Room) any) any {
	v, err := h.hub.Inspect(h.pin, fn)
	if err != nil {
		h.t.Fatalf("inspect: %v", err)
	}
	return v
}

func (h *harness) phase() string { return h.inspect(func(r *Room) any { return r.phase }).(string) }

// waitFor polls the room until cond holds.
func (h *harness) waitFor(what string, cond func(r *Room) bool) {
	h.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if h.inspect(func(r *Room) any { return cond(r) }).(bool) {
			return
		}
		time.Sleep(3 * time.Millisecond)
	}
	h.t.Fatalf("timeout waiting for %s (phase %s)", what, h.phase())
}

type roundInfo struct {
	id     int64
	number int
	answer int
	limit  time.Duration
}

func (h *harness) waitQuestion(after int) roundInfo {
	h.waitFor(fmt.Sprintf("question %d", after+1), func(r *Room) bool { return r.phase == PhaseQuestion && r.round.Number > after })
	return h.inspect(func(r *Room) any {
		return roundInfo{r.round.ID, r.round.Number, r.round.Question.Answer, r.round.Limit}
	}).(roundInfo)
}

func wrong(answer int) int { return (answer + 1) % Options }

func drain(c *Client) []Message {
	var out []Message
	for {
		select {
		case m := <-c.out:
			out = append(out, m)
		default:
			return out
		}
	}
}

func TestAccuracyRoundsToOneDecimal(t *testing.T) {
	if got := accuracy(&Player{correct: 2, rounds: 3}); got != 66.7 {
		t.Fatalf("accuracy %v", got)
	}
	if got := accuracy(&Player{}); got != 0 {
		t.Fatalf("empty accuracy %v", got)
	}
}

func TestLobbyRequiresHostAndPlayers(t *testing.T) {
	h := newHarness(t, fastConfig(), 1)
	if err := h.hub.Start(h.kids[0]); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := h.hub.Start(h.host); err != ErrPlayers {
		t.Fatalf("start with one player: %v", err)
	}
	if err := h.hub.Join(h.host, h.pin); err != ErrPlayerOnly {
		t.Fatalf("host join: %v", err)
	}
	if err := h.hub.Join(NewClient(claims(50, 4), false, "id", 8), "000000"); err != ErrNotFound {
		t.Fatalf("bad pin: %v", err)
	}
}

func TestRoomIsCappedAtMaxPlayers(t *testing.T) {
	h := newHarness(t, fastConfig(), MaxPlayers)
	if err := h.hub.Join(NewClient(claims(5000, 4), false, "id", 8), h.pin); err != ErrFull {
		t.Fatalf("join beyond %d players: %v", MaxPlayers, err)
	}
}

func TestStateMachineAndElimination(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	q := h.waitQuestion(0)
	at := time.Now()
	// P1 right, P2 wrong, P3 silent.
	if err := h.hub.Answer(h.kids[0], q.id, q.answer, at); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.Answer(h.kids[0], q.id, q.answer, at); err != ErrAnswered {
		t.Fatalf("double answer: %v", err)
	}
	if err := h.hub.Answer(h.kids[1], q.id, wrong(q.answer), at); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.Answer(h.kids[1], q.id+1, 0, at); err != ErrLocked {
		t.Fatalf("wrong round id: %v", err)
	}
	if err := h.hub.Answer(h.host, q.id, 0, at); err != ErrPlayerOnly {
		t.Fatalf("host answer: %v", err)
	}
	h.waitFor("game over", func(r *Room) bool { return r.phase == PhaseOver })
	var kinds []string
	for _, m := range drain(h.host) {
		kinds = append(kinds, m["t"].(string))
	}
	want := []string{"question_start", "lock_answers", "tile_drop", "podium_result"}
	idx := 0
	for _, k := range kinds {
		if idx < len(want) && k == want[idx] {
			idx++
		}
	}
	if idx != len(want) {
		t.Fatalf("host message order %v, want subsequence %v", kinds, want)
	}
	ranks := h.inspect(func(r *Room) any {
		out := map[int64]int{}
		for _, p := range r.players {
			out[p.ID()] = p.rank
		}
		return out
	}).(map[int64]int)
	// Winner P1; P2 answered (wrong) so ranks above silent P3.
	if ranks[1] != 1 || ranks[2] != 2 || ranks[3] != 3 {
		t.Fatalf("ranks %v", ranks)
	}
	res := h.hub.TakeResults()
	if len(res) != 3 {
		t.Fatalf("results %d", len(res))
	}
	for _, r := range res {
		if r.GameKey != GameKey || r.Match == nil || len(r.Match.Players) != 3 || r.Points > MaxPoints {
			t.Fatalf("bad result %+v", r)
		}
		if r.UserID == 1 && (r.Correct != 1 || r.Points != Award(r.Correct*10, true)) {
			t.Fatalf("winner result %+v", r)
		}
	}
}

func TestSuddenDeathRanksFastestSubmission(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	q := h.waitQuestion(0)
	// Everyone fails: P3 answers first, then P1, P2 never answers.
	_ = h.hub.Answer(h.kids[2], q.id, wrong(q.answer), time.Now())
	time.Sleep(15 * time.Millisecond)
	_ = h.hub.Answer(h.kids[0], q.id, wrong(q.answer), time.Now())
	h.waitFor("game over", func(r *Room) bool { return r.phase == PhaseOver })
	got := h.inspect(func(r *Room) any {
		order := make([]int64, len(r.ranking))
		for i, p := range r.ranking {
			order[i] = p.ID()
		}
		return []any{order, r.round.SuddenDeath}
	}).([]any)
	order := got[0].([]int64)
	if order[0] != 3 || order[1] != 1 || order[2] != 2 || !got[1].(bool) {
		t.Fatalf("sudden death order %v (sudden %v)", order, got[1])
	}
}

func TestTimerDecaysEachRound(t *testing.T) {
	cfg := fastConfig()
	cfg.BaseTime, cfg.YoungTime, cfg.MinTime = 300*time.Millisecond, 300*time.Millisecond, 200*time.Millisecond
	h := newHarness(t, cfg, 2)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	var limits []time.Duration
	after := 0
	for len(limits) < 5 {
		q := h.waitQuestion(after)
		after = q.number
		limits = append(limits, q.limit)
		for _, k := range h.kids {
			if err := h.hub.Answer(k, q.id, q.answer, time.Now()); err != nil {
				t.Fatalf("round %d: %v", q.number, err)
			}
		}
	}
	want := []time.Duration{300, 270, 243, 218, 200}
	for i, l := range limits {
		if l.Milliseconds() != int64(want[i]) {
			t.Fatalf("round %d limit %v, want %dms (%v)", i+1, l, want[i], limits)
		}
	}
}

func TestLateAnswerIsRejectedByServerClock(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	q := h.waitQuestion(0)
	deadline := h.inspect(func(r *Room) any { return r.round.Deadline }).(time.Time)
	if err := h.hub.Answer(h.kids[0], q.id, q.answer, deadline); err != ErrLocked {
		t.Fatalf("answer at deadline: %v", err)
	}
	if err := h.hub.Answer(h.kids[0], q.id, q.answer, deadline.Add(-time.Millisecond)); err != nil {
		t.Fatalf("answer before deadline: %v", err)
	}
}

func TestEliminatedPlayerBecomesSpectator(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	_ = h.hub.Start(h.host)
	q := h.waitQuestion(0)
	_ = h.hub.Answer(h.kids[0], q.id, q.answer, time.Now())
	_ = h.hub.Answer(h.kids[1], q.id, q.answer, time.Now())
	_ = h.hub.Answer(h.kids[2], q.id, wrong(q.answer), time.Now())
	q2 := h.waitQuestion(1)
	if err := h.hub.Answer(h.kids[2], q2.id, q2.answer, time.Now()); err != ErrEliminated {
		t.Fatalf("spectator answer: %v", err)
	}
	drain(h.kids[2])
	if err := h.hub.Sync(h.kids[2]); err != nil {
		t.Fatal(err)
	}
	h.waitFor("sync", func(*Room) bool { return true })
	var state Message
	for _, m := range drain(h.kids[2]) {
		if m["t"] == "state_sync" {
			state = m
		}
	}
	you := state["you"].(Message)
	if you["alive"] != false || you["reason"] != "wrong" || state["alive"] != 2 {
		t.Fatalf("spectator state %+v", state)
	}
	if _, leaked := state["correct_index"]; leaked && state["phase"] == PhaseQuestion {
		t.Fatal("answer leaked during the question")
	}
}

func TestReconnectWithinGraceKeepsPlayer(t *testing.T) {
	cfg := fastConfig()
	cfg.BaseTime, cfg.YoungTime = time.Second, time.Second
	h := newHarness(t, cfg, 3)
	_ = h.hub.Start(h.host)
	q := h.waitQuestion(0)
	h.hub.Detach(h.kids[0])
	time.Sleep(cfg.Grace / 3)
	again := NewClient(claims(1, 4), false, "id", cfg.Buffer)
	if !h.hub.Resume(again) {
		t.Fatal("resume failed")
	}
	if err := h.hub.Answer(again, q.id, q.answer, time.Now()); err != nil {
		t.Fatalf("answer after reconnect: %v", err)
	}
	// P2 disconnects for good: eliminated after the grace window.
	h.hub.Detach(h.kids[1])
	h.waitFor("disconnect elimination", func(r *Room) bool {
		return !r.byID[2].alive && r.byID[2].reason == "disconnected"
	})
	if alive := h.inspect(func(r *Room) any { return r.byID[1].alive }).(bool); !alive {
		t.Fatal("reconnected player was eliminated")
	}
}

func TestHostLeavingClosesRoomAndPaysPlayers(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	_ = h.hub.Start(h.host)
	after := 0
	for i := 0; i < 3; i++ {
		q := h.waitQuestion(after)
		after = q.number
		for _, k := range h.kids {
			_ = h.hub.Answer(k, q.id, q.answer, time.Now())
		}
	}
	h.waitFor("third drop", func(r *Room) bool { return r.round.Number == 3 && (r.phase == PhaseReveal || r.phase == PhaseSummary) })
	if err := h.hub.Leave(h.host); err != nil {
		t.Fatal(err)
	}
	if rooms, players := h.hub.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("room still open: %d rooms %d players", rooms, players)
	}
	res := h.hub.TakeResults()
	if len(res) != 3 || res[0].Match.Finished {
		t.Fatalf("abandoned results %+v", res)
	}
}

func TestBankQuestionsAreRecorded(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	_ = h.hub.Start(h.host)
	h.waitQuestion(0)
	fromBank := h.inspect(func(r *Room) any { return r.round.Question }).(questions.Question)
	if len(fromBank.Options) < 2 || len(fromBank.Options) > Options {
		t.Fatalf("options %d", len(fromBank.Options))
	}
}

// TestHundredPlayersTickVariance plays rounds with 100 concurrent players
// answering from their own goroutines and checks the room loop wakes up
// within 50ms of every scheduled timer.
func TestHundredPlayersTickVariance(t *testing.T) {
	if testing.Short() {
		t.Skip("load test")
	}
	cfg := fastConfig()
	cfg.Tick, cfg.Progress = 20*time.Millisecond, 250*time.Millisecond
	cfg.BaseTime, cfg.YoungTime = 600*time.Millisecond, 600*time.Millisecond
	h := newHarness(t, cfg, MaxPlayers)
	stop := make(chan struct{})
	var readers sync.WaitGroup
	for _, c := range append([]*Client{h.host}, h.kids...) {
		readers.Add(1)
		go func(c *Client) {
			defer readers.Done()
			for {
				select {
				case <-stop:
					return
				case <-c.out:
				}
			}
		}(c)
	}
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	after := 0
	for round := 0; round < 4; round++ {
		q := h.waitQuestion(after)
		after = q.number
		var wg sync.WaitGroup
		for i, k := range h.kids {
			wg.Add(1)
			go func(i int, k *Client) {
				defer wg.Done()
				choice := q.answer
				if round == 3 && i%2 == 0 {
					choice = wrong(q.answer)
				}
				_ = h.hub.Answer(k, q.id, choice, time.Now())
			}(i, k)
		}
		wg.Wait()
	}
	h.waitFor("drop", func(r *Room) bool { return r.round.Number >= 4 && r.phase != PhaseQuestion && r.phase != PhaseLock })
	stats, err := h.hub.TickStats(h.pin)
	close(stop)
	readers.Wait()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("ticks=%d p99=%v max=%v", stats.Ticks, stats.P99Late, stats.MaxLate)
	if stats.Ticks < 10 || stats.MaxLate > 50*time.Millisecond {
		t.Fatalf("tick variance too high: %+v", stats)
	}
	alive := h.inspect(func(r *Room) any { return r.aliveCount() }).(int)
	if alive != MaxPlayers/2 {
		t.Fatalf("alive %d after half failed", alive)
	}
}

// BenchmarkRoundHundredPlayers measures one round with 100 answers.
func BenchmarkRoundHundredPlayers(b *testing.B) {
	cfg := fastConfig()
	cfg.BaseTime, cfg.YoungTime, cfg.MinTime = time.Hour, time.Hour, time.Hour
	cfg.Buffer = 1 << 16
	for i := 0; i < b.N; i++ {
		b.StopTimer()
		hub := NewHub(cfg, uint64(i))
		host := NewClient(auth.Claims{Subject: 9000, Name: "T", Game: HostKey}, true, "id", cfg.Buffer)
		room, _ := hub.Create(host, time.Now())
		kids := make([]*Client, MaxPlayers)
		for j := range kids {
			kids[j] = NewClient(claims(int64(j+1), 4), false, "id", cfg.Buffer)
			_ = hub.Join(kids[j], room.Pin)
		}
		_ = hub.Start(host)
		var id int64
		var answer int
		for id == 0 {
			v, _ := hub.Inspect(room.Pin, func(r *Room) any {
				if r.phase == PhaseQuestion {
					return [2]int64{r.round.ID, int64(r.round.Question.Answer)}
				}
				return [2]int64{}
			})
			pair := v.([2]int64)
			id, answer = pair[0], int(pair[1])
		}
		b.StartTimer()
		for _, k := range kids {
			_ = hub.Answer(k, id, answer, time.Now())
		}
		b.StopTimer()
		hub.CloseAll()
	}
}
