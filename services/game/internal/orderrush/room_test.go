package orderrush

import (
	"encoding/json"
	"math/rand/v2"
	"slices"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

func fast() Config {
	c := Defaults
	c.MinSubmit, c.Retry = 0, 0
	c.Tangle, c.Freeze = 300*time.Millisecond, 200*time.Millisecond
	c.Tick, c.Board = 10*time.Millisecond, 20*time.Millisecond
	c.RaceCap = 5 * time.Second
	return c
}

func client(id int64, host bool) *Client {
	look := json.RawMessage(`{"color":"teal","gender":"girl","skin":"tan","hair":"black"}`)
	return NewClient(auth.Claims{Subject: id, Name: "P" + string(rune('A'+id%26)), Grade: 10, Character: look}, host, "id", 4096)
}

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

type table struct {
	hub  *Hub
	host *Client
	pin  string
	ps   []*Client
}

func setup(t *testing.T, players int, mode string, value int) *table {
	t.Helper()
	h := NewHub(fast(), 7)
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
	if err := h.Configure(host, mode, value, nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(h.CloseAll)
	return tb
}

func (tb *table) question(t *testing.T, id int64) SequenceQuestion {
	t.Helper()
	v, err := tb.hub.Inspect(tb.pin, func(r *Room) any { return r.byID[id].question })
	if err != nil {
		t.Fatal(err)
	}
	return v.(SequenceQuestion)
}

func (tb *table) solve(t *testing.T, c *Client) Message {
	t.Helper()
	q := tb.question(t, c.ID())
	if err := tb.hub.Submit(c, q.ID, q.CorrectOrder, time.Now()); err != nil {
		t.Fatal(err)
	}
	return next(t, c, "sequence_validated")
}

func (tb *table) account(t *testing.T, id int64) Account {
	t.Helper()
	v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { a, _ := r.board.Get(id); return a })
	return v.(Account)
}

func TestFirstMismatchNeverPanics(t *testing.T) {
	correct := []string{"a", "b", "c", "d"}
	cases := []struct {
		in   []string
		want int
	}{
		{nil, 0},
		{[]string{}, 0},
		{[]string{"a"}, 1},
		{[]string{"a", "b", "c", "d"}, -1},
		{[]string{"a", "b", "d", "c"}, 2},
		{[]string{"x", "b", "c", "d"}, 0},
		{[]string{"a", "b", "c", "d", "e"}, 4},
		{make([]string, 1000), 0},
	}
	for _, c := range cases {
		if got := FirstMismatch(c.in, correct); got != c.want {
			t.Errorf("FirstMismatch(%v) = %d, want %d", c.in, got, c.want)
		}
	}
	if FirstMismatch(nil, nil) != -1 || FirstMismatch([]string{"a"}, nil) != 0 {
		t.Fatal("empty correct order")
	}
}

func TestWellFormedRejectsMalformedOrders(t *testing.T) {
	correct := []string{"a", "b", "c"}
	for _, bad := range [][]string{nil, {}, {"a", "b"}, {"a", "b", "c", "d"}, {"a", "a", "b"}, {"a", "b", "x"}} {
		if WellFormed(bad, correct) {
			t.Errorf("accepted %v", bad)
		}
	}
	if !WellFormed([]string{"c", "a", "b"}, correct) {
		t.Fatal("rejected a permutation")
	}
}

func TestBuiltinBankMatchesTKJMaterial(t *testing.T) {
	want := map[string][]string{
		"utp-t568b":       {"Putih-Orange", "Orange", "Putih-Hijau", "Biru", "Putih-Biru", "Hijau", "Putih-Cokelat", "Cokelat"},
		"utp-t568a":       {"Putih-Hijau", "Hijau", "Putih-Orange", "Biru", "Putih-Biru", "Orange", "Putih-Cokelat", "Cokelat"},
		"fiber-12":        {"Biru", "Orange", "Hijau", "Cokelat", "Abu-abu", "Putih", "Merah", "Hitam", "Kuning", "Ungu", "Pink", "Tosca"},
		"osi-top-down":    {"Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"},
		"osi-bottom-up":   {"Physical", "Data Link", "Network", "Transport", "Session", "Presentation", "Application"},
		"pdu":             {"Data", "Segment", "Packet", "Frame", "Bits"},
		"dhcp-dora":       {"Discover", "Offer", "Request", "Acknowledge"},
		"tcp-handshake":   {"SYN", "SYN-ACK", "ACK"},
		"troubleshooting": {"Fisik Kabel/Link", "IP Address", "Gateway", "DNS Public", "Domain Name"},
	}
	b := Builtin()
	if len(b.Sets) != len(want) {
		t.Fatalf("sets: %d", len(b.Sets))
	}
	for key, labels := range want {
		s, ok := b.Get(key)
		if !ok {
			t.Fatalf("missing %s", key)
		}
		got := make([]string, len(s.Items))
		for i, it := range s.Items {
			got[i] = it.Label.ID
		}
		if !slices.Equal(got, labels) {
			t.Errorf("%s = %v", key, got)
		}
	}
}

func TestDealHidesOrderAndNeverPresolves(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	s, _ := Builtin().Get("tcp-handshake")
	for i := range 200 {
		q := s.Deal("q", "en", rng)
		pool := make([]string, len(q.PoolItems))
		for j, it := range q.PoolItems {
			pool[j] = it.ID
		}
		if slices.Equal(pool, q.CorrectOrder) {
			t.Fatalf("deal %d is already solved", i)
		}
		if !WellFormed(pool, q.CorrectOrder) {
			t.Fatal("pool is not a permutation of the answer")
		}
		raw, _ := json.Marshal(q)
		var out map[string]any
		_ = json.Unmarshal(raw, &out)
		if _, leaked := out["correct_order"]; leaked {
			t.Fatal("correct order serialised to the client")
		}
	}
}

func TestSpeedScore(t *testing.T) {
	if SpeedScore(0) != 100 || SpeedScore(2500*time.Millisecond) != 50 || SpeedScore(5*time.Second) != 0 || SpeedScore(time.Minute) != 0 || SpeedScore(-time.Second) != 100 {
		t.Fatal("speed bonus curve")
	}
}

func TestParseRejectsBadBank(t *testing.T) {
	for _, body := range []string{
		`{}`,
		`{"sets":[{"key":"x","category":"X","kind":"cable","title":{"id":"X"},"items":[{"label":{"id":"a"}}]}]}`,
		`{"sets":[{"key":"x","category":"X","kind":"weird","title":{"id":"X"},"items":[{"label":{"id":"a"}},{"label":{"id":"b"}}]}]}`,
		`{"sets":[{"key":"x","category":"X","kind":"cable","title":{"id":"X"},"items":[{"label":{"id":"a"}},{"label":{"id":"a"}}]}]}`,
		`{"sets":[{"key":"x","category":"X","kind":"cable","title":{"id":"X"},"items":[{"label":{"id":"a"},"color":"red"},{"label":{"id":"b"}}]}]}`,
	} {
		if _, err := Parse([]byte(body)); err == nil {
			t.Errorf("accepted %s", body)
		}
	}
	b, err := Parse([]byte(`{"version":"v1","sets":[{"key":"x","category":"X","kind":"protocol","title":{"id":"X"},"items":[{"label":{"id":"a"}},{"label":{"id":"b"}}]}]}`))
	if err != nil || b.Version != "v1" || len(b.Sets) != 1 {
		t.Fatalf("valid bank: %v", err)
	}
}

func TestStartNeedsTwoPlayersAndHost(t *testing.T) {
	tb := setup(t, 1, ModeRace, 5)
	if err := tb.hub.Start(tb.ps[0]); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := tb.hub.Start(tb.host); err != ErrPlayers {
		t.Fatalf("one player: %v", err)
	}
	if err := tb.hub.Configure(tb.host, ModeRace, 7, nil); err != ErrConfig {
		t.Fatalf("bad target: %v", err)
	}
	if err := tb.hub.Configure(tb.host, ModeTimeAttack, 3, []string{"nope"}); err != ErrConfig {
		t.Fatalf("bad set: %v", err)
	}
}

func TestSubmitValidationAndScoring(t *testing.T) {
	tb := setup(t, 2, ModeRace, 10)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	a := tb.ps[0]
	q := tb.question(t, a.ID())

	// Malformed submissions never count and never panic.
	for _, bad := range [][]string{{}, q.CorrectOrder[:1], append(slices.Clone(q.CorrectOrder), "extra"), {"x", "y", "z", "w", "v", "u", "t", "s", "r", "q", "p", "o"}} {
		if err := tb.hub.Submit(a, q.ID, bad, time.Now()); err != ErrOrder {
			t.Fatalf("malformed %v: %v", bad, err)
		}
	}
	if err := tb.hub.Submit(a, "other", q.CorrectOrder, time.Now()); err != ErrStale {
		t.Fatalf("stale: %v", err)
	}
	if err := tb.hub.Submit(tb.host, q.ID, q.CorrectOrder, time.Now()); err != ErrPlayerOnly {
		t.Fatalf("host submit: %v", err)
	}

	// Wrong order: swap the last two slots, the error is reported there.
	wrong := slices.Clone(q.CorrectOrder)
	n := len(wrong)
	wrong[n-2], wrong[n-1] = wrong[n-1], wrong[n-2]
	if err := tb.hub.Submit(a, q.ID, wrong, time.Now()); err != nil {
		t.Fatal(err)
	}
	res := next(t, a, "sequence_validated")
	if res["is_correct"] != false || res["error_slot_index"] != n-2 || res["earned_score"] != 0 {
		t.Fatalf("wrong result: %v", res)
	}

	// Correct order: base 100 + speed bonus, next module dealt.
	res = tb.solve(t, a)
	earned := res["earned_score"].(int64)
	if res["is_correct"] != true || earned < BaseScore || earned > BaseScore+SpeedBonus || res["next_question"] == nil {
		t.Fatalf("correct result: %v", res)
	}
	if acc := tb.account(t, a.ID()); acc.Score != earned || acc.Streak != 1 {
		t.Fatalf("account: %+v", acc)
	}
}

func TestComboGrantsPowerUpAndSabotage(t *testing.T) {
	tb := setup(t, 2, ModeRace, 20)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	a, b := tb.ps[0], tb.ps[1]
	var granted string
	for i := range ComboEvery {
		res := tb.solve(t, a)
		if g, ok := res["powerup_granted"].(string); ok {
			if i != ComboEvery-1 {
				t.Fatalf("power-up after %d", i+1)
			}
			granted = g
		}
	}
	if granted == "" {
		t.Fatal("no power-up after the combo")
	}
	// Rig the inventory to test each effect deterministically.
	tb.hub.Inspect(tb.pin, func(r *Room) any {
		r.board.mu.Lock()
		r.board.accounts[a.ID()].Inventory = []string{PowerFreeze, PowerShield}
		r.board.accounts[b.ID()].Inventory = []string{PowerShield, PowerTangle}
		r.board.mu.Unlock()
		return nil
	})
	if err := tb.hub.UsePowerUp(a, PowerTangle, b.ID(), time.Now()); err != ErrNoPowerUp {
		t.Fatalf("unowned power-up: %v", err)
	}
	if err := tb.hub.UsePowerUp(a, PowerFreeze, a.ID(), time.Now()); err != ErrTarget {
		t.Fatalf("self target: %v", err)
	}
	// B arms a shield; A's freeze breaks it without freezing B.
	if err := tb.hub.UsePowerUp(b, PowerShield, 0, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.UsePowerUp(a, PowerFreeze, b.ID(), time.Now()); err != nil {
		t.Fatal(err)
	}
	hit := next(t, b, "sabotage_received")
	if hit["blocked"] != true || hit["type"] != PowerFreeze {
		t.Fatalf("shield: %v", hit)
	}
	if acc := tb.account(t, b.ID()); acc.Shield || !acc.FrozenUntil.IsZero() {
		t.Fatalf("shield not consumed: %+v", acc)
	}
	// B tangles A (A still has a shield in stock but did not arm it).
	if err := tb.hub.UsePowerUp(b, PowerTangle, 0, time.Now()); err != nil {
		t.Fatal(err)
	}
	hit = next(t, a, "sabotage_received")
	if hit["blocked"] != false || hit["duration_ms"] != int64(300) || hit["attacker_name"] != "PC" {
		t.Fatalf("tangle: %v", hit)
	}
	// A freeze blocks submissions until it expires.
	tb.hub.Inspect(tb.pin, func(r *Room) any {
		r.board.mu.Lock()
		r.board.accounts[a.ID()].Inventory = []string{PowerFreeze}
		r.board.mu.Unlock()
		return nil
	})
	if err := tb.hub.UsePowerUp(a, PowerFreeze, b.ID(), time.Now()); err != nil {
		t.Fatal(err)
	}
	q := tb.question(t, b.ID())
	if err := tb.hub.Submit(b, q.ID, q.CorrectOrder, time.Now()); err != ErrFrozen {
		t.Fatalf("frozen submit: %v", err)
	}
	time.Sleep(250 * time.Millisecond)
	if err := tb.hub.Submit(b, q.ID, q.CorrectOrder, time.Now()); err != nil {
		t.Fatalf("after freeze: %v", err)
	}
}

// TestConcurrentSabotageOneShield fires many simultaneous attacks at one
// shielded player: exactly one is blocked and every power-up is spent once.
func TestConcurrentSabotageOneShield(t *testing.T) {
	sb := NewScoreboard()
	ids := make([]int64, 21)
	for i := range ids {
		ids[i] = int64(i + 1)
	}
	sb.Reset(ids)
	sb.mu.Lock()
	sb.accounts[1].Shield = true
	for _, id := range ids[1:] {
		sb.accounts[id].Inventory = []string{PowerFreeze}
	}
	sb.mu.Unlock()
	var wg sync.WaitGroup
	var mu sync.Mutex
	blocked, hit, failed := 0, 0, 0
	now := time.Now()
	for _, id := range ids[1:] {
		for range 2 { // every attacker tries twice: one must fail
			wg.Add(1)
			go func(id int64) {
				defer wg.Done()
				res, err := sb.Sabotage(id, 1, PowerFreeze, time.Second, now)
				mu.Lock()
				defer mu.Unlock()
				switch {
				case err != nil:
					failed++
				case res.Blocked:
					blocked++
				default:
					hit++
				}
			}(id)
		}
	}
	wg.Wait()
	if blocked != 1 || hit != 19 || failed != 20 {
		t.Fatalf("blocked=%d hit=%d failed=%d", blocked, hit, failed)
	}
}

// TestConcurrentSubmitsScoreOnce submits the same correct order from many
// goroutines: one wins, the others see a stale or too-fast module.
func TestConcurrentSubmitsScoreOnce(t *testing.T) {
	tb := setup(t, 2, ModeRace, 20)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	a := tb.ps[0]
	q := tb.question(t, a.ID())
	var wg sync.WaitGroup
	for range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = tb.hub.Submit(a, q.ID, q.CorrectOrder, time.Now())
		}()
	}
	wg.Wait()
	acc := tb.account(t, a.ID())
	if acc.Streak != 1 || acc.Score < BaseScore || acc.Score > BaseScore+SpeedBonus {
		t.Fatalf("double scored: %+v", acc)
	}
}

func TestRaceFinishRanksAndReports(t *testing.T) {
	tb := setup(t, 3, ModeRace, 5)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	a, b := tb.ps[0], tb.ps[1]
	tb.solve(t, b)
	for range 5 {
		tb.solve(t, a)
	}
	pod := next(t, a, "podium_result")
	you := pod["you"].(Message)
	if you["rank"] != 1 || you["won"] != true || you["step"] != 5 {
		t.Fatalf("winner: %v", you)
	}
	top := pod["podium"].([]Message)
	if top[0]["user_id"] != a.ID() || top[1]["user_id"] != b.ID() || top[0]["character"] == nil {
		t.Fatalf("podium: %v", top)
	}
	if err := tb.hub.Submit(b, "x", []string{"a"}, time.Now()); err != ErrPhase {
		t.Fatalf("submit after game over: %v", err)
	}
	results := tb.hub.TakeResults()
	if len(results) != 3 {
		t.Fatalf("results: %d", len(results))
	}
	for _, r := range results {
		if r.Match == nil || len(r.Match.Players) != 3 || r.Points <= 0 || r.Points > MaxPoints {
			t.Fatalf("result: %+v", r)
		}
		if r.UserID == a.ID() && (len(r.Sequences) == 0 || r.Correct != 5) {
			t.Fatalf("winner stats: %+v", r)
		}
	}
}

func TestTimeAttackEndsOnClock(t *testing.T) {
	tb := setup(t, 2, ModeTimeAttack, 3)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	tb.solve(t, tb.ps[1])
	tb.hub.Inspect(tb.pin, func(r *Room) any { r.endsAt = time.Now(); return nil })
	pod := next(t, tb.host, "podium_result")
	top := pod["podium"].([]Message)
	if top[0]["user_id"] != tb.ps[1].ID() {
		t.Fatalf("time attack winner: %v", top)
	}
}

func TestLateJoinAndLeave(t *testing.T) {
	tb := setup(t, 2, ModeRace, 10)
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
	late := client(50, false)
	if err := tb.hub.Join(late, tb.pin, []byte(`{"color":"amber"}`)); err != nil {
		t.Fatal(err)
	}
	st := next(t, late, "state_sync")
	if st["phase"] != PhaseActive || st["you"].(Message)["question"] == nil {
		t.Fatalf("late join state: %v", st)
	}
	if err := tb.hub.Leave(tb.ps[0]); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Submit(tb.ps[0], "x", []string{"a"}, time.Now()); err != ErrNoRoom {
		t.Fatalf("left player submit: %v", err)
	}
}

func TestAvatarPrefersSignedClaim(t *testing.T) {
	signed := json.RawMessage(`{"color":"teal"}`)
	if string(avatarOf(auth.Claims{Character: signed}, []byte(`{"color":"coral"}`))) != string(signed) {
		t.Fatal("client look overrode the token look")
	}
	if avatarOf(auth.Claims{}, []byte(`"str"`)) != nil || avatarOf(auth.Claims{}, make([]byte, 5000)) != nil {
		t.Fatal("accepted invalid look")
	}
	if string(avatarOf(auth.Claims{}, []byte(`{"color":"coral"}`))) != `{"color":"coral"}` {
		t.Fatal("dropped valid look")
	}
}
