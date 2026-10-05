package heist

import (
	"encoding/json"
	"runtime"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

func fast() Config {
	c := Defaults
	c.Cooldown, c.MinAnswer, c.TargetTime = 80*time.Millisecond, 0, 300*time.Millisecond
	c.Tick, c.Board = 10*time.Millisecond, 20*time.Millisecond
	c.GoldCap = 5 * time.Second
	return c
}

func client(id int64, host bool) *Client {
	look := json.RawMessage(`{"color":"teal","gender":"girl","skin":"tan","hair":"black"}`)
	return NewClient(auth.Claims{Subject: id, Name: "P" + string(rune('A'+id%26)), Grade: 4, Character: look}, host, "id", 4096)
}

// next returns the next message of kind on c (skipping others).
func next(t *testing.T, c *Client, kind string) Message {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case m := <-c.Out():
			if m["t"] == kind {
				return m
			}
		case <-deadline:
			t.Fatalf("timeout waiting for %s", kind)
		}
	}
}

func drain(c *Client) {
	for {
		select {
		case <-c.Out():
		default:
			return
		}
	}
}

type table struct {
	hub  *Hub
	host *Client
	pin  string
	ps   []*Client
}

func setup(t *testing.T, players int) *table {
	t.Helper()
	h := NewHub(fast(), 42)
	host := client(1000, true)
	r, err := h.Create(host, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	tb := &table{hub: h, host: host, pin: r.Pin}
	for i := range players {
		c := client(int64(i+1), false)
		if err := h.Join(c, r.Pin, nil); err != nil {
			t.Fatal(err)
		}
		tb.ps = append(tb.ps, c)
	}
	t.Cleanup(h.CloseAll)
	return tb
}

// current reads a player's question id, correct option and stage.
func (tb *table) current(t *testing.T, id int64) (string, int, string) {
	t.Helper()
	v, err := tb.hub.Inspect(tb.pin, func(r *Room) any {
		p := r.byID[id]
		return []any{p.questionID, p.question.Answer, p.stage}
	})
	if err != nil {
		t.Fatal(err)
	}
	s := v.([]any)
	return s[0].(string), s[1].(int), s[2].(string)
}

// force rigs the chests offered to a player (tests only).
func (tb *table) force(t *testing.T, id int64, chest Chest) {
	t.Helper()
	tb.hub.Inspect(tb.pin, func(r *Room) any {
		p := r.byID[id]
		p.chests = [Chests]Chest{chest, chest, chest}
		return nil
	})
}

func (tb *table) correct(t *testing.T, c *Client) {
	t.Helper()
	qid, ans, stage := tb.current(t, c.ID())
	if stage != StageQuestion {
		t.Fatalf("player %d stage %s", c.ID(), stage)
	}
	if err := tb.hub.Answer(c, qid, ans, time.Now()); err != nil {
		t.Fatal(err)
	}
}

func (tb *table) gold(t *testing.T, id int64) Account {
	t.Helper()
	v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { a, _ := r.ledger.Get(id); return a })
	return v.(Account)
}

func (tb *table) setGold(t *testing.T, id, gold int64) {
	t.Helper()
	tb.hub.Inspect(tb.pin, func(r *Room) any {
		r.ledger.Add(id, gold-r.ledger.Gold(id))
		return nil
	})
}

func TestRoomFlowRolesAndAvatars(t *testing.T) {
	tb := setup(t, 2)
	a, b := tb.ps[0], tb.ps[1]
	if err := tb.hub.Start(a); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := tb.hub.Configure(tb.host, WinTime, 4); err != ErrConfig {
		t.Fatalf("bad minutes accepted: %v", err)
	}
	if err := tb.hub.Configure(tb.host, WinGold, 1000); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	st := next(t, tb.host, "state_sync")
	for st["phase"] != PhasePlaying {
		st = next(t, tb.host, "state_sync")
	}
	board := st["leaderboard"].([]Message)
	if len(board) != 2 || board[0]["character"] == nil {
		t.Fatalf("leaderboard without avatars: %v", board)
	}
	if board[0]["gold"].(int64) != 0 {
		t.Fatal("players must start at 0 gold")
	}
	q := next(t, a, "question")["question"].(Message)
	if _, leaked := q["answer"]; leaked {
		t.Fatal("question leaked the answer")
	}

	// Wrong answer: cooldown, no chest, then a new question.
	qid, ans, _ := tb.current(t, b.ID())
	if err := tb.hub.Answer(b, qid, (ans+1)%len(q["options"].([]string)), time.Now()); err != nil {
		t.Fatal(err)
	}
	if res := next(t, b, "answer_result"); res["correct"] != false || res["cooldown_ms"] == nil {
		t.Fatalf("wrong answer result %v", res)
	}
	if err := tb.hub.SelectChest(b, 0); err != ErrStage {
		t.Fatalf("chest after wrong answer: %v", err)
	}
	if err := tb.hub.Answer(b, qid, ans, time.Now()); err != ErrStage {
		t.Fatalf("answer during cooldown: %v", err)
	}
	next(t, b, "question")
	if _, _, stage := tb.current(t, b.ID()); stage != StageQuestion {
		t.Fatalf("after cooldown stage %s", stage)
	}

	// Stale question id and double answer are refused.
	if err := tb.hub.Answer(b, qid, ans, time.Now()); err != ErrStale {
		t.Fatalf("stale question: %v", err)
	}

	// Correct answer: chest stage, flat gold.
	tb.correct(t, a)
	if res := next(t, a, "answer_result"); res["correct"] != true {
		t.Fatalf("correct answer result %v", res)
	}
	tb.force(t, a.ID(), Chest{ChestAddGold, 250, UnitFlat})
	if err := tb.hub.SelectChest(a, 5); err != ErrChest {
		t.Fatalf("chest 5: %v", err)
	}
	if err := tb.hub.SelectChest(a, 1); err != nil {
		t.Fatal(err)
	}
	cr := next(t, a, "chest_result")
	if cr["type"] != ChestAddGold || cr["gold"].(int64) != 250 || cr["requires_target"] != false || len(cr["chests"].([]Message)) != 3 {
		t.Fatalf("chest result %v", cr)
	}
	if bu := next(t, tb.host, "balance_update"); bu["player_id"] != a.ID() || bu["delta"].(int64) != 250 {
		t.Fatalf("host balance update %v", bu)
	}
	if err := tb.hub.SelectChest(a, 1); err != ErrStage {
		t.Fatalf("chest opened twice: %v", err)
	}
	ab := next(t, tb.host, "action_broadcast")
	if src := ab["source_player"].(Message); src["character"] == nil || src["user_id"] != a.ID() {
		t.Fatalf("action without avatar %v", ab)
	}
	if ls := next(t, tb.host, "leaderboard_sync"); ls["leaderboard"].([]Message)[0]["user_id"] != a.ID() {
		t.Fatalf("leaderboard order %v", ls)
	}
}

func TestStealShieldAndSwap(t *testing.T) {
	tb := setup(t, 3)
	a, b, c := tb.ps[0], tb.ps[1], tb.ps[2]
	tb.hub.Start(tb.host)
	tb.setGold(t, b.ID(), 1000)
	tb.setGold(t, c.ID(), 400)

	// B arms a shield.
	tb.correct(t, b)
	tb.force(t, b.ID(), Chest{ChestShield, 1, UnitFlat})
	tb.hub.SelectChest(b, 0)
	if !tb.gold(t, b.ID()).Shield {
		t.Fatal("shield not armed")
	}

	// A steals 20% from B: blocked, shield breaks, nothing moves.
	tb.correct(t, a)
	tb.force(t, a.ID(), Chest{ChestSteal, 20, UnitPercent})
	tb.hub.SelectChest(a, 2)
	if cr := next(t, a, "chest_result"); cr["requires_target"] != true {
		t.Fatalf("steal must require a target: %v", cr)
	}
	if err := tb.hub.Target(a, a.ID()); err != ErrTarget {
		t.Fatalf("self target: %v", err)
	}
	if err := tb.hub.Target(a, 777); err != ErrTarget {
		t.Fatalf("unknown target: %v", err)
	}
	drain(b)
	if err := tb.hub.Target(a, b.ID()); err != nil {
		t.Fatal(err)
	}
	blocked := next(t, b, "action_broadcast")
	if blocked["action"] != "BLOCKED" || blocked["blocked"] != true {
		t.Fatalf("victim not told about the block: %v", blocked)
	}
	if acc := tb.gold(t, b.ID()); acc.Gold != 1000 || acc.Shield {
		t.Fatalf("after block B=%+v", acc)
	}
	if tb.gold(t, a.ID()).Gold != 0 {
		t.Fatal("gold moved through a shield")
	}

	// A steals again: no shield now, 20% of 1000 moves.
	tb.correct(t, a)
	tb.force(t, a.ID(), Chest{ChestSteal, 20, UnitPercent})
	tb.hub.SelectChest(a, 0)
	tb.hub.Target(a, b.ID())
	if tb.gold(t, a.ID()).Gold != 200 || tb.gold(t, b.ID()).Gold != 800 {
		t.Fatalf("steal moved %d/%d", tb.gold(t, a.ID()).Gold, tb.gold(t, b.ID()).Gold)
	}

	// C swaps with B.
	tb.correct(t, c)
	tb.force(t, c.ID(), Chest{ChestSwap, 100, UnitPercent})
	tb.hub.SelectChest(c, 0)
	tb.hub.Target(c, b.ID())
	if tb.gold(t, c.ID()).Gold != 800 || tb.gold(t, b.ID()).Gold != 400 {
		t.Fatalf("swap %d/%d", tb.gold(t, c.ID()).Gold, tb.gold(t, b.ID()).Gold)
	}
	// Bankrupt bomb halves C.
	tb.correct(t, c)
	tb.force(t, c.ID(), Chest{ChestBankrupt, BankruptPct, UnitPercent})
	tb.hub.SelectChest(c, 0)
	if tb.gold(t, c.ID()).Gold != 400 {
		t.Fatalf("bomb left %d", tb.gold(t, c.ID()).Gold)
	}
	if err := tb.hub.Target(c, a.ID()); err != ErrStage {
		t.Fatalf("target without a pending heist: %v", err)
	}
}

func TestHeistTargetExpires(t *testing.T) {
	tb := setup(t, 2)
	a := tb.ps[0]
	tb.hub.Start(tb.host)
	tb.correct(t, a)
	tb.force(t, a.ID(), Chest{ChestSwap, 100, UnitPercent})
	tb.hub.SelectChest(a, 0)
	next(t, a, "heist_expired")
	if _, _, stage := tb.current(t, a.ID()); stage != StageQuestion {
		t.Fatalf("after expiry stage %s", stage)
	}
}

func TestGoldTargetEndsGameAndReports(t *testing.T) {
	tb := setup(t, 2)
	a, b := tb.ps[0], tb.ps[1]
	tb.hub.Configure(tb.host, WinGold, 1000)
	tb.hub.Start(tb.host)
	for range 3 {
		tb.correct(t, b)
		tb.force(t, b.ID(), Chest{ChestAddGold, 50, UnitFlat})
		tb.hub.SelectChest(b, 0)
	}
	tb.setGold(t, a.ID(), 900)
	tb.correct(t, a)
	tb.force(t, a.ID(), Chest{ChestAddGold, 250, UnitFlat})
	tb.hub.SelectChest(a, 0)

	over := next(t, tb.host, "podium_result")
	podium := over["podium"].([]Message)
	if podium[0]["user_id"] != a.ID() || podium[0]["gold"].(int64) != 1150 || podium[0]["character"] == nil {
		t.Fatalf("podium %v", podium)
	}
	if you := next(t, a, "podium_result")["you"].(Message); you["won"] != true {
		t.Fatalf("winner result %v", you)
	}
	if err := tb.hub.SelectChest(a, 0); err != ErrPhase {
		t.Fatalf("action after game over: %v", err)
	}
	res := tb.hub.TakeResults()
	if len(res) != 2 {
		t.Fatalf("results %d", len(res))
	}
	for _, r := range res {
		if r.GameKey != GameKey || r.Match == nil || r.Match.Players[0].Score != 1150 || r.Points <= 0 || r.Points > MaxPoints {
			t.Fatalf("bad result %+v", r)
		}
	}
	if res[0].Match.Key != res[1].Match.Key {
		t.Fatal("players got different match keys")
	}
}

func TestTimeLimitEndsGame(t *testing.T) {
	tb := setup(t, 2)
	tb.hub.Start(tb.host)
	tb.hub.Inspect(tb.pin, func(r *Room) any { r.endsAt = time.Now().Add(50 * time.Millisecond); return nil })
	next(t, tb.host, "podium_result")
}

func TestLeaveMidGameAndLateJoin(t *testing.T) {
	tb := setup(t, 2)
	a := tb.ps[0]
	tb.hub.Start(tb.host)
	late := client(9, false)
	if err := tb.hub.Join(late, tb.pin, nil); err != nil {
		t.Fatalf("late join: %v", err)
	}
	next(t, late, "question")
	if err := tb.hub.Leave(a); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Answer(a, "x", 0, time.Now()); err != ErrNoRoom {
		t.Fatalf("answer after leave: %v", err)
	}
	// Left players cannot be targeted.
	tb.correct(t, late)
	tb.force(t, late.ID(), Chest{ChestSteal, 10, UnitPercent})
	tb.hub.SelectChest(late, 0)
	if err := tb.hub.Target(late, a.ID()); err != ErrTarget {
		t.Fatalf("target a leaver: %v", err)
	}
}

func TestJoinAvatarFallback(t *testing.T) {
	h := NewHub(fast(), 1)
	defer h.CloseAll()
	host := client(500, true)
	r, _ := h.Create(host, time.Now())
	plain := NewClient(auth.Claims{Subject: 7, Name: "N", Grade: 3}, false, "en", 64)
	if err := h.Join(plain, r.Pin, []byte(`{"color":"coral"}`)); err != nil {
		t.Fatal(err)
	}
	bad := NewClient(auth.Claims{Subject: 8, Name: "M", Grade: 3}, false, "en", 64)
	h.Join(bad, r.Pin, []byte(`"<script>"`))
	v, _ := h.Inspect(r.Pin, func(r *Room) any { return []string{string(r.byID[7].Avatar), string(r.byID[8].Avatar)} })
	got := v.([]string)
	if got[0] != `{"color":"coral"}` || got[1] != "" {
		t.Fatalf("avatars %q", got)
	}
}

// TestConcurrentHeistsKeepLedgerConsistent: every player hammers the room at
// once with answers, chests and heist targets; the room goroutine serialises
// them and the ledger never goes negative nor creates gold through a
// transfer.
func TestConcurrentHeistsKeepLedgerConsistent(t *testing.T) {
	tb := setup(t, 12)
	tb.hub.Start(tb.host)
	for _, c := range tb.ps {
		tb.setGold(t, c.ID(), 1000)
	}
	var wg sync.WaitGroup
	for i, c := range tb.ps {
		wg.Add(1)
		go func(i int, c *Client) {
			defer wg.Done()
			for n := range 40 {
				qid, ans, stage := tb.current(t, c.ID())
				if stage != StageQuestion {
					time.Sleep(5 * time.Millisecond)
					continue
				}
				if tb.hub.Answer(c, qid, ans, time.Now()) != nil {
					continue
				}
				kind := []Chest{{ChestSteal, 25, UnitPercent}, {ChestSwap, 100, UnitPercent}, {ChestShield, 1, UnitFlat}}[(i+n)%3]
				tb.force(t, c.ID(), kind)
				tb.hub.SelectChest(c, n%3)
				target := tb.ps[(i+n+1)%len(tb.ps)].ID()
				tb.hub.Target(c, target)
			}
		}(i, c)
	}
	// Drain outbound queues so slow-client protection does not kick in.
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
				for _, c := range append([]*Client{tb.host}, tb.ps...) {
					drain(c)
				}
				time.Sleep(time.Millisecond)
			}
		}
	}()
	wg.Wait()
	close(stop)
	v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { return r.ledger.Snapshot() })
	var total int64
	for id, a := range v.(map[int64]Account) {
		if a.Gold < 0 {
			t.Fatalf("player %d negative %d", id, a.Gold)
		}
		total += a.Gold
	}
	if total != 12*1000 {
		t.Fatalf("transfers changed total gold: %d", total)
	}
}

// TestRoomsReleaseGoroutines opens and closes many rooms and checks that
// the room goroutines exit (no leak after games end).
func TestRoomsReleaseGoroutines(t *testing.T) {
	before := runtime.NumGoroutine()
	h := NewHub(fast(), 3)
	for i := range 50 {
		host := client(int64(10000+i), true)
		r, err := h.Create(host, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		for j := range 3 {
			h.Join(client(int64(20000+i*10+j), false), r.Pin, nil)
		}
		h.Start(host)
		if i%2 == 0 {
			h.End(host)
			h.Leave(host)
		}
	}
	h.CloseAll()
	if rooms, players := h.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("registry not empty: %d rooms, %d players", rooms, players)
	}
	deadline := time.Now().Add(2 * time.Second)
	for runtime.NumGoroutine() > before+2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := runtime.NumGoroutine(); n > before+2 {
		t.Fatalf("goroutines leaked: %d before, %d after", before, n)
	}
}

func TestIdleRoomCloses(t *testing.T) {
	cfg := fast()
	cfg.Empty = 50 * time.Millisecond
	h := NewHub(cfg, 9)
	host := client(1, true)
	r, _ := h.Create(host, time.Now())
	h.Detach(host)
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if rooms, _ := h.Counts(); rooms == 0 {
			select {
			case <-r.done:
				return
			case <-time.After(time.Second):
				t.Fatal("room goroutine still running")
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("empty room not closed")
}

func TestBankQuestionsAreRecorded(t *testing.T) {
	tb := setup(t, 2)
	a := tb.ps[0]
	tb.hub.Start(tb.host)
	for range 6 {
		qid, ans, _ := tb.current(t, a.ID())
		tb.hub.Answer(a, qid, ans, time.Now())
		tb.force(t, a.ID(), Chest{ChestAddGold, 50, UnitFlat})
		tb.hub.SelectChest(a, 0)
	}
	v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { return []any{r.byID[a.ID()].correct, len(r.byID[a.ID()].answers)} })
	got := v.([]any)
	if got[0].(int) != 6 {
		t.Fatalf("correct %v", got)
	}
}
