package turbotrivia

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

// fastConfig keeps timings short so a whole race runs in about a second.
func fastConfig() Config {
	c := Defaults
	c.Tick, c.PlayerTick = 10*time.Millisecond, 10*time.Millisecond
	c.Countdown, c.QuestionTime, c.YoungTime, c.RevealTime = 30*time.Millisecond, 300*time.Millisecond, 300*time.Millisecond, 30*time.Millisecond
	c.MinAnswer, c.MissileFlight, c.FinalWindow = 0, 40*time.Millisecond, 5*time.Second
	c.LobbyDrop = 200 * time.Millisecond
	c.Buffer = 4096
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
		if err := h.hub.Join(c, h.pin, nil); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
		h.kids = append(h.kids, c)
	}
	t.Cleanup(h.hub.CloseAll)
	return h
}

func (h *harness) inspect(fn func(r *Room) any) any {
	h.t.Helper()
	v, err := h.hub.Inspect(h.pin, fn)
	if err != nil {
		h.t.Fatal(err)
	}
	return v
}

// wait polls the room until cond holds.
func (h *harness) wait(what string, cond func(r *Room) bool) {
	h.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if h.inspect(func(r *Room) any { return cond(r) }).(bool) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	h.t.Fatalf("timeout waiting for %s", what)
}

// question waits for an open question and returns its id and answer.
func (h *harness) question(after int64) (int64, int) {
	h.t.Helper()
	var id int64
	var answer int
	h.wait("question", func(r *Room) bool {
		if r.phase == PhaseRace && r.q.Stage == StageQuestion && r.q.ID > after {
			id, answer = r.q.ID, r.q.Question.Answer
			return true
		}
		return false
	})
	return id, answer
}

func drain(c *Client) []Message {
	var out []Message
	for {
		select {
		case m := <-c.Out():
			out = append(out, m)
		default:
			return out
		}
	}
}

func has(msgs []Message, kind string) Message {
	for _, m := range msgs {
		if m["t"] == kind {
			return m
		}
	}
	return nil
}

func TestNitroDurationScalesWithSpeed(t *testing.T) {
	cases := map[float64]time.Duration{0: 2500 * time.Millisecond, 0.5: 3500 * time.Millisecond, 1: 4500 * time.Millisecond, 2: 4500 * time.Millisecond, -1: 2500 * time.Millisecond}
	for s, want := range cases {
		if got := NitroFor(s); got != want {
			t.Errorf("NitroFor(%v) = %v, want %v", s, got, want)
		}
	}
}

func TestKartSpeedStacksEffects(t *testing.T) {
	now := time.Now()
	k := &Kart{}
	if v := k.Speed(now); v != BaseSpeed {
		t.Fatalf("base %v", v)
	}
	k.stutterUntil = now.Add(time.Second)
	if v := k.Speed(now); v != StutterSpeed {
		t.Fatalf("stutter %v", v)
	}
	k.nitroUntil = now.Add(time.Second)
	if v := k.Speed(now); v != NitroSpeed {
		t.Fatalf("nitro beats stutter %v", v)
	}
	k.shrinkUntil = now.Add(time.Second)
	if v := k.Speed(now); v != NitroSpeed*ShrinkFactor {
		t.Fatalf("lightning keeps 60%%: %v", v)
	}
	k.spinUntil = now.Add(time.Second)
	if v := k.Speed(now); v != 0 {
		t.Fatalf("spin-out stops the kart: %v", v)
	}
	if v := k.Speed(now.Add(2 * time.Second)); v != BaseSpeed {
		t.Fatalf("effects expire: %v", v)
	}
}

func TestItemWeightsProtectTheFront(t *testing.T) {
	for pos := 1; pos <= 3; pos++ {
		w := ItemWeights(pos, 10)
		if w[1] != 0 || w[2] != 0 {
			t.Fatalf("position %d may roll attacks: %v", pos, w)
		}
	}
	mid, last := ItemWeights(4, 10), ItemWeights(10, 10)
	if last[1] <= mid[1] || last[2] <= mid[2] {
		t.Fatalf("back of the field should roll more attacks: mid %v last %v", mid, last)
	}
	// Two karts: the trailing kart is not "top three" and can attack.
	if w := ItemWeights(2, 2); w[1] == 0 {
		t.Fatalf("last of two cannot attack: %v", w)
	}
	for pos := 1; pos <= 40; pos++ {
		total := 0
		for _, v := range ItemWeights(pos, 40) {
			if v < 0 {
				t.Fatalf("negative weight at %d", pos)
			}
			total += v
		}
		if total != 100 {
			t.Fatalf("weights at %d sum to %d", pos, total)
		}
	}
}

func TestCrossedWrapsLaps(t *testing.T) {
	cases := []struct {
		before, after, x float64
		hit              bool
		at               float64
	}{
		{0.10, 0.20, 0.15, true, 0.15},
		{0.10, 0.20, 0.25, false, 0},
		{0.98, 1.03, 0.01, true, 1.01},
		{1.98, 2.03, 0.99, true, 1.99},
		{0.50, 0.50, 0.50, false, 0},
	}
	for _, c := range cases {
		at, hit := Crossed(c.before, c.after, c.x)
		if hit != c.hit || (hit && (at < c.at-1e-9 || at > c.at+1e-9)) {
			t.Errorf("Crossed(%v,%v,%v) = %v,%v", c.before, c.after, c.x, at, hit)
		}
	}
}

func TestLobbyRulesAndConfigure(t *testing.T) {
	h := newHarness(t, fastConfig(), 1)
	if err := h.hub.Start(h.kids[0]); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := h.hub.Start(h.host); err != ErrPlayers {
		t.Fatalf("one kart start: %v", err)
	}
	if err := h.hub.Configure(h.host, 7); err != ErrConfig {
		t.Fatalf("bad count: %v", err)
	}
	if err := h.hub.Configure(h.kids[0], 10); err != ErrHostOnly {
		t.Fatalf("player configure: %v", err)
	}
	if err := h.hub.Configure(h.host, 10); err != nil {
		t.Fatal(err)
	}
	if n := h.inspect(func(r *Room) any { return r.total }).(int); n != 10 {
		t.Fatalf("total %d", n)
	}
	if err := h.hub.Join(NewClient(claims(5, 4), false, "id", 8), "000000", nil); err != ErrNotFound {
		t.Fatalf("unknown pin: %v", err)
	}
}

func TestRoomIsCappedAtMaxPlayers(t *testing.T) {
	h := newHarness(t, fastConfig(), MaxPlayers)
	if err := h.hub.Join(NewClient(claims(999, 4), false, "id", 8), h.pin, nil); err != ErrFull {
		t.Fatalf("41st kart: %v", err)
	}
}

func TestCorrectAnswerFiresNitroAndItem(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	qid, answer := h.question(0)
	drain(h.kids[0])
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != ErrAnswered {
		t.Fatalf("second answer: %v", err)
	}
	wrong := (answer + 1) % 4
	if err := h.hub.Answer(h.kids[1], qid, wrong, time.Now()); err != nil {
		t.Fatal(err)
	}
	msgs := drain(h.kids[0])
	res := has(msgs, "answer_result")
	if res == nil || res["correct"] != true || res["nitro_ms"].(int64) < 2500 {
		t.Fatalf("answer result %v", res)
	}
	if has(msgs, "item_gained") == nil {
		t.Fatal("correct answer should roll an item box")
	}
	state := h.inspect(func(r *Room) any {
		a, b := r.byID[1], r.byID[2]
		now := time.Now()
		return []any{a.Speed(now), b.Speed(now), len(a.Items), len(b.Items), a.correct, b.wrong}
	}).([]any)
	if state[0] != NitroSpeed || state[1] != StutterSpeed || state[2] != 1 || state[3] != 0 || state[4] != 1 || state[5] != 1 {
		t.Fatalf("after answers: %v", state)
	}
	// Everyone answered: the reveal starts without waiting for the timer.
	h.wait("reveal", func(r *Room) bool { return r.q.Stage != StageQuestion || r.q.ID != qid })
}

func TestLateAnswerAndInvalidOption(t *testing.T) {
	cfg := fastConfig()
	h := newHarness(t, cfg, 2)
	_ = h.hub.Start(h.host)
	qid, _ := h.question(0)
	if err := h.hub.Answer(h.kids[0], qid, 9, time.Now()); err != ErrOption {
		t.Fatalf("option 9: %v", err)
	}
	if err := h.hub.Answer(h.kids[0], qid+100, 0, time.Now()); err != ErrLocked {
		t.Fatalf("stale question: %v", err)
	}
	if err := h.hub.Answer(h.kids[0], qid, 0, time.Now().Add(time.Hour)); err != ErrLocked {
		t.Fatalf("late answer: %v", err)
	}
	if err := h.hub.Answer(h.host, qid, 0, time.Now()); err != ErrPlayerOnly {
		t.Fatalf("host answer: %v", err)
	}
}

func TestBananaSpinsOutTheKartBehind(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	_ = h.hub.Start(h.host)
	h.question(0)
	// Kart 1 leads; drop a banana just ahead of kart 2.
	h.inspect(func(r *Room) any {
		r.byID[1].Progress, r.byID[2].Progress = 0.30, 0.10
		r.byID[1].Items = []string{ItemBanana}
		return nil
	})
	if err := h.hub.UseItem(h.kids[0], ItemBanana, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.UseItem(h.kids[0], ItemBanana, time.Now()); err != ErrNoItem {
		t.Fatalf("empty inventory: %v", err)
	}
	x := h.inspect(func(r *Room) any { return r.bananas[0].X }).(float64)
	if x >= 0.30 || x < 0.29 {
		t.Fatalf("banana lands behind the kart: %v", x)
	}
	h.wait("spin out", func(r *Room) bool { return time.Now().Before(r.byID[2].spinUntil) })
	got := h.inspect(func(r *Room) any {
		k := r.byID[2]
		return []any{k.Speed(time.Now()), len(r.bananas), k.hits}
	}).([]any)
	if got[0] != 0.0 || got[1] != 0 || got[2] != 1 {
		t.Fatalf("after banana: %v", got)
	}
	msgs := drain(h.host)
	found := false
	for _, m := range msgs {
		if m["t"] == "item_triggered" && m["event"].(Message)["kind"] == "banana_hit" {
			found = true
		}
	}
	if !found {
		t.Fatal("projector did not receive banana_hit")
	}
}

func TestShieldBlocksBananaAndOwnerNeverSlips(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	_ = h.hub.Start(h.host)
	h.question(0)
	h.inspect(func(r *Room) any {
		r.byID[1].Progress, r.byID[2].Progress = 0.30, 0.10
		r.byID[2].shieldUntil = time.Now().Add(time.Minute)
		r.bananas = []Banana{{ID: 1, X: 0.12, Owner: 1, At: time.Now()}, {ID: 2, X: 0.305, Owner: 1, At: time.Now()}}
		return nil
	})
	h.wait("shield breaks", func(r *Room) bool { return !r.byID[2].Shielded(time.Now()) })
	got := h.inspect(func(r *Room) any {
		return []any{r.byID[2].Speed(time.Now()) > 0, r.byID[1].Speed(time.Now()) > 0, len(r.bananas)}
	}).([]any)
	if got[0] != true || got[1] != true || got[2] != 1 {
		t.Fatalf("shield/owner: %v", got)
	}
}

func TestMissileHomesOnLeaderAndShieldBlocks(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	_ = h.hub.Start(h.host)
	h.question(0)
	h.inspect(func(r *Room) any {
		r.byID[1].Progress, r.byID[2].Progress, r.byID[3].Progress = 0.9, 0.5, 0.1
		r.byID[3].Items = []string{ItemMissile, ItemMissile}
		return nil
	})
	if err := h.hub.UseItem(h.kids[2], ItemMissile, time.Now()); err != nil {
		t.Fatal(err)
	}
	h.wait("stagger", func(r *Room) bool { return time.Now().Before(r.byID[1].staggerUntil) })
	if h.inspect(func(r *Room) any { return r.byID[2].hits }).(int) != 0 {
		t.Fatal("missile hit the wrong kart")
	}
	// The leader shields up: the next missile is absorbed.
	h.inspect(func(r *Room) any {
		r.byID[1].staggerUntil = time.Time{}
		r.byID[1].shieldUntil = time.Now().Add(time.Minute)
		return nil
	})
	if err := h.hub.UseItem(h.kids[2], ItemMissile, time.Now()); err != nil {
		t.Fatal(err)
	}
	h.wait("shield absorbs", func(r *Room) bool { return !r.byID[1].Shielded(time.Now()) && len(r.missiles) == 0 })
	if hits := h.inspect(func(r *Room) any { return r.byID[1].hits }).(int); hits != 1 {
		t.Fatalf("leader hits %d", hits)
	}
}

func TestLightningShrinksRivalsExceptShielded(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	_ = h.hub.Start(h.host)
	h.question(0)
	h.inspect(func(r *Room) any {
		r.byID[1].Items = []string{ItemLightning}
		r.byID[3].shieldUntil = time.Now().Add(time.Minute)
		return nil
	})
	if err := h.hub.UseItem(h.kids[0], ItemLightning, time.Now()); err != nil {
		t.Fatal(err)
	}
	got := h.inspect(func(r *Room) any {
		now := time.Now()
		return []any{now.Before(r.byID[1].shrinkUntil), now.Before(r.byID[2].shrinkUntil), now.Before(r.byID[3].shrinkUntil), r.byID[3].Shielded(now)}
	}).([]any)
	if got[0] != false || got[1] != true || got[2] != false || got[3] != true {
		t.Fatalf("lightning: %v", got)
	}
}

func TestItemsRefusedOutsideRace(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	if err := h.hub.UseItem(h.kids[0], ItemShield, time.Now()); err != ErrPhase {
		t.Fatalf("lobby item: %v", err)
	}
	_ = h.hub.Start(h.host)
	h.question(0)
	if err := h.hub.UseItem(h.kids[0], "ROCKET", time.Now()); err != ErrItem {
		t.Fatalf("unknown item: %v", err)
	}
}

// TestFullRaceRanksFinishersAndReports drives a 10-question race where kart
// 1 answers everything right: it must finish first, every kart is paid and
// the results carry the match summary.
func TestFullRaceRanksFinishersAndReports(t *testing.T) {
	cfg := fastConfig()
	h := newHarness(t, cfg, 3)
	_ = h.hub.Configure(h.host, 10)
	if err := h.hub.Start(h.host); err != nil {
		t.Fatal(err)
	}
	var last int64
	for {
		over := h.inspect(func(r *Room) any { return r.phase == PhaseOver || r.asked >= r.total && r.q.Stage != StageQuestion }).(bool)
		if over {
			break
		}
		qid, answer := h.question(last)
		last = qid
		_ = h.hub.Answer(h.kids[0], qid, answer, time.Now())
		_ = h.hub.Answer(h.kids[1], qid, (answer+1)%4, time.Now())
		if qid%2 == 0 {
			_ = h.hub.Answer(h.kids[2], qid, answer, time.Now())
		}
	}
	h.wait("game over", func(r *Room) bool { return r.phase == PhaseOver })
	order := h.inspect(func(r *Room) any {
		ids := []int64{}
		for _, k := range r.ranking {
			ids = append(ids, k.ID())
		}
		return ids
	}).([]int64)
	if order[0] != 1 {
		t.Fatalf("all-correct kart should win: %v", order)
	}
	results := h.hub.TakeResults()
	if len(results) != 3 {
		t.Fatalf("results %d", len(results))
	}
	for _, res := range results {
		if res.Match == nil || len(res.Match.Players) != 3 || res.Points < 5 || res.Points > MaxPoints {
			t.Fatalf("bad result %+v", res)
		}
		// The winner may cross the line before the last question.
		if res.UserID == 1 && (res.Correct < 3 || res.Wrong != 0) {
			t.Fatalf("winner correct %d wrong %d", res.Correct, res.Wrong)
		}
	}
	podium := has(drain(h.host), "podium_result")
	if podium == nil {
		t.Fatal("host got no podium")
	}
}

func TestHostEndsRaceAndHostLeavingPays(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	_ = h.hub.Start(h.host)
	for i := 0; i < 3; i++ {
		qid, answer := h.question(int64(-1))
		_ = h.hub.Answer(h.kids[0], qid, answer, time.Now())
		_ = h.hub.Answer(h.kids[1], qid, answer, time.Now())
		h.wait("next", func(r *Room) bool { return r.q.ID != qid })
	}
	if err := h.hub.End(h.kids[0]); err != ErrHostOnly {
		t.Fatalf("player end: %v", err)
	}
	if err := h.hub.Leave(h.host); err != nil {
		t.Fatal(err)
	}
	results := h.hub.TakeResults()
	if len(results) != 2 || results[0].Match.Finished {
		t.Fatalf("abandoned race results %+v", results)
	}
}

func TestPlayerLeavingMidRaceKeepsRaceGoing(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	_ = h.hub.Start(h.host)
	h.question(0)
	if err := h.hub.Leave(h.kids[2]); err != nil {
		t.Fatal(err)
	}
	phase := h.inspect(func(r *Room) any { return r.phase }).(string)
	if phase != PhaseRace {
		t.Fatalf("phase %s", phase)
	}
	if err := h.hub.Answer(h.kids[2], 1, 0, time.Now()); err != ErrNoRoom {
		t.Fatalf("left kart answer: %v", err)
	}
}

func TestConcurrentAnswersAndItemsAreRaceFree(t *testing.T) {
	h := newHarness(t, fastConfig(), 20)
	_ = h.hub.Start(h.host)
	qid, answer := h.question(0)
	var wg sync.WaitGroup
	for i, c := range h.kids {
		wg.Add(1)
		go func(i int, c *Client) {
			defer wg.Done()
			_ = h.hub.Answer(c, qid, answer, time.Now())
			for _, it := range Items {
				_ = h.hub.UseItem(c, it, time.Now())
			}
			_ = h.hub.Sync(c)
		}(i, c)
	}
	wg.Wait()
	correct := h.inspect(func(r *Room) any {
		n := 0
		for _, k := range r.karts {
			n += k.correct
		}
		return n
	}).(int)
	if correct != 20 {
		t.Fatalf("correct %d", correct)
	}
}

func TestTickBroadcastsPositionsAtTwentyHertz(t *testing.T) {
	cfg := fastConfig()
	cfg.Tick = 50 * time.Millisecond
	h := newHarness(t, cfg, 2)
	_ = h.hub.Start(h.host)
	h.question(0)
	drain(h.host)
	time.Sleep(520 * time.Millisecond)
	ticks := 0
	var lastTick Message
	for _, m := range drain(h.host) {
		if m["t"] == "tick" {
			ticks++
			lastTick = m
		}
	}
	if ticks < 8 || ticks > 12 {
		t.Fatalf("ticks in 520ms at 20 Hz: %d", ticks)
	}
	karts := lastTick["karts"].([]Message)
	if len(karts) != 2 || karts[0]["p"].(float64) <= 0 {
		t.Fatalf("tick karts %v", karts)
	}
}
