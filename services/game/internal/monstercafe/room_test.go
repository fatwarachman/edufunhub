package monstercafe

import (
	"encoding/json"
	"fmt"
	"runtime"
	"slices"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

// fast keeps real-time timers short; rats and new orders are pushed far out
// unless a test rigs them.
func fast() Config {
	c := Defaults
	c.Cook, c.BurnAfter = 60*time.Millisecond, 150*time.Millisecond
	c.Cooldown, c.MinAnswer = 100*time.Millisecond, 0
	c.RatMin, c.RatMax, c.RatSteal = time.Hour, time.Hour, 150*time.Millisecond
	c.NewOrder = time.Hour
	c.Tick, c.Board, c.Kitchen = 5*time.Millisecond, 20*time.Millisecond, 50*time.Millisecond
	return c
}

func client(id int64, host bool) *Client {
	look := json.RawMessage(`{"color":"teal","gender":"girl","skin":"tan","hair":"black"}`)
	return NewClient(auth.Claims{Subject: id, Name: fmt.Sprintf("P%d", id), Grade: 4, Character: look}, host, "id", 8192)
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

func setupWith(t *testing.T, cfg Config, players int) *table {
	t.Helper()
	h := NewHub(cfg, 42)
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

func setup(t *testing.T, players int) *table { return setupWith(t, fast(), players) }

func (tb *table) start(t *testing.T) {
	t.Helper()
	if err := tb.hub.Start(tb.host); err != nil {
		t.Fatal(err)
	}
}

func (tb *table) with(t *testing.T, id int64, fn func(r *Room, p *Player) any) any {
	t.Helper()
	v, err := tb.hub.Inspect(tb.pin, func(r *Room) any { return fn(r, r.byID[id]) })
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// earn requests ingredient and answers the question correctly.
func (tb *table) earn(t *testing.T, c *Client, ingredient string) {
	t.Helper()
	if err := tb.hub.Act(c, OpRequest, ingredient, 0); err != nil {
		t.Fatal(err)
	}
	q := tb.with(t, c.ID(), func(r *Room, p *Player) any { return []any{p.questionID, p.question.Answer} }).([]any)
	if err := tb.hub.Answer(c, q[0].(string), q[1].(int), time.Now()); err != nil {
		t.Fatal(err)
	}
}

// give puts ingredients straight on the tray (tests only).
func (tb *table) give(t *testing.T, id int64, items ...string) {
	tb.with(t, id, func(r *Room, p *Player) any { p.tray = append(p.tray, items...); return nil })
}

// rig replaces the player's first order with a known recipe.
func (tb *table) rig(t *testing.T, id int64, dish string, recipe ...string) string {
	return tb.with(t, id, func(r *Room, p *Player) any {
		o := p.orders[0]
		o.Dish, o.Recipe = dish, recipe
		return o.ID
	}).(string)
}

// cookDish plates items, cooks them and takes the dish out.
func (tb *table) cookDish(t *testing.T, c *Client, items ...string) {
	t.Helper()
	tb.give(t, c.ID(), items...)
	for _, it := range items {
		if err := tb.hub.Act(c, OpPlateAdd, it, 0); err != nil {
			t.Fatal(err)
		}
	}
	if err := tb.hub.Act(c, OpCook, "", 0); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		return tb.with(t, c.ID(), func(r *Room, p *Player) any { return p.oven.State }) == OvenReady
	})
	if err := tb.hub.Act(c, OpTakeOut, "", 0); err != nil {
		t.Fatal(err)
	}
}

func waitFor(t *testing.T, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRecipesAndDishes(t *testing.T) {
	h := NewHub(fast(), 1)
	for i := range 200 {
		dish := []string{DishBurger, DishPizza}[i%2]
		rec := NewRecipe(h.rng, dish, 1+i%3)
		if len(rec) != 3+i%3 || DishOf(rec) != dish {
			t.Fatalf("recipe %v for %s", rec, dish)
		}
		seen := map[string]bool{}
		for _, x := range rec {
			if seen[x] {
				t.Fatalf("duplicate in %v", rec)
			}
			seen[x] = true
		}
	}
	if DishOf([]string{Cheese}) != DishMess || !SameItems([]string{Bun, Patty, Cheese}, []string{Cheese, Bun, Patty}) || SameItems([]string{Bun, Bun}, []string{Bun, Patty}) {
		t.Fatal("dish inference / multiset compare")
	}
	if MoodOf(60, 100) != MoodHappy || MoodOf(30, 100) != MoodImpatient || MoodOf(10, 100) != MoodAngry {
		t.Fatal("mood thresholds")
	}
	if Tip(100, 100) != MaxTip || Tip(50, 100) != 25 || Tip(0, 100) != 0 {
		t.Fatal("tip")
	}
	if MaxPoints != points.Cap(40) || MaxPoints != 12150 {
		t.Fatalf("max points %d", MaxPoints)
	}
}

func TestCreateJoinStartEndSolo(t *testing.T) {
	tb := setup(t, 1)
	a := tb.ps[0]
	if _, err := tb.hub.Create(a, time.Now()); err != ErrHostOnly {
		t.Fatalf("player create: %v", err)
	}
	if err := tb.hub.Join(tb.host, tb.pin, nil); err != ErrPlayerOnly {
		t.Fatalf("host join: %v", err)
	}
	if err := tb.hub.Join(client(77, false), "000000", nil); err != ErrNotFound {
		t.Fatalf("bad pin: %v", err)
	}
	if err := tb.hub.Start(a); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := tb.hub.Configure(tb.host, 4); err != ErrConfig {
		t.Fatalf("bad minutes: %v", err)
	}
	if err := tb.hub.Configure(tb.host, 3); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.SetSubject(tb.host, "math"); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Act(a, OpCook, "", 0); err != ErrPhase {
		t.Fatalf("cook in lobby: %v", err)
	}
	tb.start(t) // solo allowed
	st := next(t, tb.host, "state_sync")
	for st["phase"] != PhasePlaying {
		st = next(t, tb.host, "state_sync")
	}
	if st["minutes"] != 3 || st["host_name"] != "P1000" || len(st["roster"].([]Message)) != 1 {
		t.Fatalf("state %v", st)
	}
	k := next(t, a, "kitchen_sync")
	orders := k["orders"].([]Message)
	if len(orders) != 2 || k["oven"].(Message)["state"] != OvenEmpty || k["question"] != nil {
		t.Fatalf("kitchen %v", k)
	}
	for _, o := range orders {
		if len(o["recipe"].([]string)) != 3 || o["mood"] != MoodHappy {
			t.Fatalf("first orders must have one extra: %v", o)
		}
		// grade 4: 15 s + 18 s × 3.
		if o["patience_total_ms"].(int64) != 69000 {
			t.Fatalf("patience %v", o)
		}
	}
	if err := tb.hub.Start(tb.host); err != ErrPhase {
		t.Fatalf("start twice: %v", err)
	}
	if err := tb.hub.End(a); err != ErrHostOnly {
		t.Fatalf("player end: %v", err)
	}
	if err := tb.hub.End(tb.host); err != nil {
		t.Fatal(err)
	}
	pod := next(t, a, "podium_result")
	if len(pod["podium"].([]Message)) != 1 || pod["you"].(Message)["rank"] != 1 {
		t.Fatalf("podium %v", pod)
	}
	res := tb.hub.TakeResults()
	if len(res) != 1 || res[0].GameKey != GameKey || res[0].Match == nil || res[0].Match.Level != 3 || res[0].Match.Mode != "room" {
		t.Fatalf("results %+v", res)
	}
	if want := "mc-1-room-"; res[0].EventID[:len(want)] != want || res[0].Points != Award(0, true) {
		t.Fatalf("result %+v", res[0])
	}
}

func TestEasyGradePatience(t *testing.T) {
	h := NewHub(fast(), 3)
	host := client(1000, true)
	r, _ := h.Create(host, time.Now())
	t.Cleanup(h.CloseAll)
	kid := NewClient(auth.Claims{Subject: 5, Name: "K", Grade: 1}, false, "id", 512)
	if err := h.Join(kid, r.Pin, nil); err != nil {
		t.Fatal(err)
	}
	if err := h.Start(host); err != nil {
		t.Fatal(err)
	}
	k := next(t, kid, "kitchen_sync")
	if got := k["orders"].([]Message)[0]["patience_total_ms"].(int64); got != 69000*13/10 {
		t.Fatalf("easy patience %d", got)
	}
}

func TestQuestionsCooldownTooEarly(t *testing.T) {
	cfg := fast()
	cfg.MinAnswer = 200 * time.Millisecond
	tb := setupWith(t, cfg, 1)
	a := tb.ps[0]
	tb.start(t)
	if err := tb.hub.Act(a, OpRequest, "SUSHI", 0); err != ErrIngredient {
		t.Fatalf("bad ingredient: %v", err)
	}
	if err := tb.hub.Act(a, OpRequest, Cheese, 0); err != nil {
		t.Fatal(err)
	}
	q := next(t, a, "question")["question"].(Message)
	if q["ingredient"] != Cheese || q["question_id"] == "" || len(q["options"].([]string)) < 2 {
		t.Fatalf("question %v", q)
	}
	if _, leaked := q["answer"]; leaked {
		t.Fatal("answer leaked")
	}
	qid := q["question_id"].(string)
	ans := tb.with(t, a.ID(), func(r *Room, p *Player) any { return p.question.Answer }).(int)
	if err := tb.hub.Answer(a, qid, ans, time.Now()); err != ErrTooEarly {
		t.Fatalf("too early: %v", err)
	}
	if err := tb.hub.Answer(a, "nope", ans, time.Now().Add(time.Second)); err != ErrStale {
		t.Fatalf("stale: %v", err)
	}
	// Wrong answer: cooldown, no ingredient.
	if err := tb.hub.Answer(a, qid, (ans+1)%len(q["options"].([]string)), time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	res := next(t, a, "answer_result")
	if res["correct"] != false || res["cooldown_ms"].(int64) != cfg.Cooldown.Milliseconds() || res["ingredient"] != nil {
		t.Fatalf("wrong result %v", res)
	}
	if err := tb.hub.Act(a, OpRequest, Cheese, 0); err != ErrCooldown {
		t.Fatalf("request in cooldown: %v", err)
	}
	if err := tb.hub.Answer(a, qid, ans, time.Now().Add(time.Second)); err != ErrStale {
		t.Fatalf("double answer: %v", err)
	}
	time.Sleep(cfg.Cooldown + 20*time.Millisecond)
	// A new request replaces a pending one; correct answer adds the ingredient.
	if err := tb.hub.Act(a, OpRequest, Bun, 0); err != nil {
		t.Fatal(err)
	}
	old := next(t, a, "question")["question"].(Message)["question_id"].(string)
	if err := tb.hub.Act(a, OpRequest, Patty, 0); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Answer(a, old, 0, time.Now().Add(time.Second)); err != ErrStale {
		t.Fatalf("replaced question: %v", err)
	}
	q2 := tb.with(t, a.ID(), func(r *Room, p *Player) any { return []any{p.questionID, p.question.Answer} }).([]any)
	if err := tb.hub.Answer(a, q2[0].(string), q2[1].(int), time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if res := next(t, a, "answer_result"); res["correct"] != true || res["ingredient"] != Patty {
		t.Fatalf("correct result %v", res)
	}
	k := next(t, a, "kitchen_sync")
	if !slices.Equal(k["tray"].([]string), []string{Patty}) || k["correct"] != 1 || k["answered"] != 2 {
		t.Fatalf("kitchen %v", k)
	}
	// Tray full.
	tb.give(t, a.ID(), Bun, Bun, Bun, Bun, Bun, Bun, Bun)
	if err := tb.hub.Act(a, OpRequest, Cheese, 0); err != ErrTrayFull {
		t.Fatalf("tray full: %v", err)
	}
}

func TestPlateOvenTimeline(t *testing.T) {
	tb := setup(t, 1)
	a := tb.ps[0]
	tb.start(t)
	if err := tb.hub.Act(a, OpCook, "", 0); err != ErrPlateEmpty {
		t.Fatalf("cook empty: %v", err)
	}
	if err := tb.hub.Act(a, OpPlateAdd, Bun, 0); err != ErrNoIngr {
		t.Fatalf("plate missing: %v", err)
	}
	if err := tb.hub.Act(a, OpTakeOut, "", 0); err != ErrOvenEmpty {
		t.Fatalf("take out empty: %v", err)
	}
	tb.earn(t, a, Bun)
	tb.give(t, a.ID(), Patty, Cheese, Olive, Olive, Olive)
	for _, it := range []string{Bun, Patty, Cheese, Olive, Olive, Olive} {
		if err := tb.hub.Act(a, OpPlateAdd, it, 0); err != nil {
			t.Fatal(err)
		}
	}
	tb.give(t, a.ID(), Tomato)
	if err := tb.hub.Act(a, OpPlateAdd, Tomato, 0); err != ErrPlateFull {
		t.Fatalf("plate full: %v", err)
	}
	if err := tb.hub.Act(a, OpPlateClear, "", 0); err != nil {
		t.Fatal(err)
	}
	if n := tb.with(t, a.ID(), func(r *Room, p *Player) any { return []int{len(p.tray), len(p.plate)} }).([]int); n[0] != 7 || n[1] != 0 {
		t.Fatalf("after clear tray/plate %v", n)
	}
	for _, it := range []string{Bun, Patty, Cheese} {
		if err := tb.hub.Act(a, OpPlateAdd, it, 0); err != nil {
			t.Fatal(err)
		}
	}
	drain(a)
	if err := tb.hub.Act(a, OpCook, "", 0); err != nil {
		t.Fatal(err)
	}
	k := next(t, a, "kitchen_sync")
	oven := k["oven"].(Message)
	if oven["state"] != OvenCooking || oven["dish"] != DishBurger || oven["ready_in_ms"].(int64) <= 0 || len(k["plate"].([]string)) != 0 {
		t.Fatalf("cooking %v", k)
	}
	tb.give(t, a.ID(), Bun)
	_ = tb.hub.Act(a, OpPlateAdd, Bun, 0)
	if err := tb.hub.Act(a, OpCook, "", 0); err != ErrOvenBusy {
		t.Fatalf("oven busy: %v", err)
	}
	if err := tb.hub.Act(a, OpTakeOut, "", 0); err != ErrOvenBusy {
		t.Fatalf("take out while cooking: %v", err)
	}
	waitFor(t, func() bool {
		return tb.with(t, a.ID(), func(r *Room, p *Player) any { return p.oven.State }) == OvenReady
	})
	if err := tb.hub.Act(a, OpTakeOut, "", 0); err != nil {
		t.Fatal(err)
	}
	held := tb.with(t, a.ID(), func(r *Room, p *Player) any { return p.dish }).(*Held)
	if held.Dish != DishBurger || !SameItems(held.Items, []string{Bun, Patty, Cheese}) {
		t.Fatalf("held %+v", held)
	}
	// Holding a dish blocks the oven; discard drops it.
	if err := tb.hub.Act(a, OpCook, "", 0); err != ErrOvenBusy {
		t.Fatalf("cook while holding: %v", err)
	}
	if err := tb.hub.Act(a, OpDiscard, "", 0); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Act(a, OpDiscard, "", 0); err != ErrNoDish {
		t.Fatalf("discard nothing: %v", err)
	}
	// A mess burns if forgotten.
	tb.with(t, a.ID(), func(r *Room, p *Player) any { p.plate = []string{Cheese}; return nil })
	if err := tb.hub.Act(a, OpCook, "", 0); err != nil {
		t.Fatal(err)
	}
	if b := next(t, a, "burnt"); b["dish"] != DishMess {
		t.Fatalf("burnt %v", b)
	}
	if fb := next(t, tb.host, "action_broadcast"); fb["kind"] != KindBurnt {
		t.Fatalf("host feed %v", fb)
	}
	if err := tb.hub.Act(a, OpTakeOut, "", 0); err != ErrOvenEmpty {
		t.Fatalf("take out burnt: %v", err)
	}
	if err := tb.hub.Act(a, OpDiscard, "", 0); err != nil {
		t.Fatal(err)
	}
	if st := tb.with(t, a.ID(), func(r *Room, p *Player) any { return []any{p.oven.State, p.burnt} }).([]any); st[0] != OvenEmpty || st[1] != 1 {
		t.Fatalf("after discard %v", st)
	}
}

func TestServeWrongDishAndAngry(t *testing.T) {
	cfg := fast()
	cfg.NewOrder = 30 * time.Millisecond
	tb := setupWith(t, cfg, 1)
	a := tb.ps[0]
	tb.start(t)
	if err := tb.hub.Act(a, OpServe, "x", 0); err != ErrNoDish {
		t.Fatalf("serve nothing: %v", err)
	}
	id := tb.rig(t, a.ID(), DishBurger, Bun, Patty, Cheese)
	tb.cookDish(t, a, Patty, Cheese, Bun)
	if err := tb.hub.Act(a, OpServe, "nope", 0); err != ErrOrder {
		t.Fatalf("unknown order: %v", err)
	}
	drain(a)
	if err := tb.hub.Act(a, OpServe, id, 0); err != nil {
		t.Fatal(err)
	}
	s := next(t, a, "order_served")
	if s["order_id"] != id || s["coins"].(int) < BaseCoins+MaxTip-1 || s["score"] != s["coins"] || s["pie_granted"] != false {
		t.Fatalf("served %v", s)
	}
	if fb := next(t, tb.host, "action_broadcast"); fb["kind"] != KindServed || fb["coins"] != s["coins"] || fb["dish"] != DishBurger {
		t.Fatalf("host feed %v", fb)
	}
	waitFor(t, func() bool { return tb.with(t, a.ID(), func(r *Room, p *Player) any { return len(p.orders) }) == 2 })

	// Wrong dish: dish lost, order loses 30% patience, streak reset.
	id = tb.rig(t, a.ID(), DishPizza, Dough, Sauce, Olive)
	tb.cookDish(t, a, Dough, Sauce, Mushroom)
	before := tb.with(t, a.ID(), func(r *Room, p *Player) any { return p.orders[0].Deadline }).(time.Time)
	if err := tb.hub.Act(a, OpServe, id, 0); err != nil {
		t.Fatal(err)
	}
	if f := next(t, a, "order_failed"); f["reason"] != FailWrong || f["order_id"] != id {
		t.Fatalf("wrong dish %v", f)
	}
	st := tb.with(t, a.ID(), func(r *Room, p *Player) any {
		return []any{p.dish == nil, p.streak, before.Sub(p.orders[0].Deadline), p.orders[0].Total}
	}).([]any)
	if st[0] != true || st[1] != 0 || st[2].(time.Duration) != st[3].(time.Duration)*3/10 {
		t.Fatalf("after wrong dish %v", st)
	}

	// Patience runs out: ANGRY, streak reset, new monster after NewOrder.
	tb.with(t, a.ID(), func(r *Room, p *Player) any {
		p.streak = 3
		p.orders[0].Deadline = time.Now().Add(-time.Millisecond)
		return nil
	})
	if f := next(t, a, "order_failed"); f["reason"] != FailAngry {
		t.Fatalf("angry %v", f)
	}
	st = tb.with(t, a.ID(), func(r *Room, p *Player) any { return []any{p.streak, p.angry} }).([]any)
	if st[0] != 0 || st[1] != 1 {
		t.Fatalf("after angry %v", st)
	}
	waitFor(t, func() bool { return tb.with(t, a.ID(), func(r *Room, p *Player) any { return len(p.orders) }) == 2 })
}

func TestRatStealAndShoo(t *testing.T) {
	cfg := fast()
	cfg.RatMin, cfg.RatMax = 20*time.Millisecond, 30*time.Millisecond
	tb := setupWith(t, cfg, 1)
	a := tb.ps[0]
	tb.start(t)
	if err := tb.hub.Act(a, OpShoo, "r", 0); err != ErrRat {
		t.Fatalf("no rat: %v", err)
	}
	tb.give(t, a.ID(), Cheese)
	ap := next(t, a, "rat_appear")
	if ap["ingredient"] != Cheese || ap["steal_ms"].(int64) != cfg.RatSteal.Milliseconds() {
		t.Fatalf("rat %v", ap)
	}
	if err := tb.hub.Act(a, OpShoo, "wrong", 0); err != ErrRat {
		t.Fatalf("wrong rat: %v", err)
	}
	if err := tb.hub.Act(a, OpShoo, ap["rat_id"].(string), 0); err != nil {
		t.Fatal(err)
	}
	if res := next(t, a, "rat_result"); res["shooed"] != true || res["rat_id"] != ap["rat_id"] {
		t.Fatalf("shoo %v", res)
	}
	if n := tb.with(t, a.ID(), func(r *Room, p *Player) any { return len(p.tray) }); n != 1 {
		t.Fatalf("tray after shoo %v", n)
	}
	// Next rat steals.
	ap = next(t, a, "rat_appear")
	res := next(t, a, "rat_result")
	if res["shooed"] != false || res["ingredient"] != Cheese || res["rat_id"] != ap["rat_id"] {
		t.Fatalf("steal %v", res)
	}
	if n := tb.with(t, a.ID(), func(r *Room, p *Player) any { return len(p.tray) }); n != 0 {
		t.Fatalf("tray after steal %v", n)
	}
	if fb := next(t, tb.host, "action_broadcast"); fb["kind"] != KindRat {
		t.Fatalf("host feed %v", fb)
	}
}

func TestPieGrantAndThrow(t *testing.T) {
	tb := setup(t, 2)
	a, b := tb.ps[0], tb.ps[1]
	tb.start(t)
	if err := tb.hub.Act(a, OpPie, "", 0); err != ErrNoPie {
		t.Fatalf("no pie: %v", err)
	}
	// b leads, so a's untargeted pie hits b.
	tb.with(t, b.ID(), func(r *Room, p *Player) any { p.coins = 500; return nil })
	for i := range 2 {
		id := tb.rig(t, a.ID(), DishBurger, Bun, Patty, Lettuce)
		tb.cookDish(t, a, Bun, Patty, Lettuce)
		drain(a)
		if err := tb.hub.Act(a, OpServe, id, 0); err != nil {
			t.Fatal(err)
		}
		s := next(t, a, "order_served")
		if s["pie_granted"] != (i == 1) {
			t.Fatalf("serve %d pie %v", i, s)
		}
		tb.with(t, a.ID(), func(r *Room, p *Player) any {
			if len(p.orders) == 0 {
				p.orders = append(p.orders, r.newOrder(p, time.Now()))
			}
			return nil
		})
	}
	if err := tb.hub.Act(a, OpPie, "", a.ID()); err != ErrTarget {
		t.Fatalf("pie self: %v", err)
	}
	if err := tb.hub.Act(a, OpPie, "", 999); err != ErrTarget {
		t.Fatalf("pie stranger: %v", err)
	}
	drain(b)
	if err := tb.hub.Act(a, OpPie, "", 0); err != nil {
		t.Fatal(err)
	}
	hit := next(t, b, "pie_hit")
	if hit["duration_ms"].(int64) != 2000 || hit["attacker"].(Message)["user_id"] != a.ID() {
		t.Fatalf("pie hit %v", hit)
	}
	if pr := next(t, a, "pie_result"); pr["target"].(Message)["user_id"] != b.ID() {
		t.Fatalf("pie result %v", pr)
	}
	if fb := next(t, b, "action_broadcast"); fb["kind"] != KindPie || fb["target"].(Message)["user_id"] != b.ID() {
		t.Fatalf("target feed %v", fb)
	}
	if err := tb.hub.Act(a, OpPie, "", 0); err != ErrNoPie {
		t.Fatalf("pie used: %v", err)
	}
	// Pies are capped at 2.
	tb.with(t, a.ID(), func(r *Room, p *Player) any { p.pies, p.streak = 2, 1; return nil })
	id := tb.rig(t, a.ID(), DishBurger, Bun, Patty, Tomato)
	tb.cookDish(t, a, Bun, Patty, Tomato)
	drain(a)
	_ = tb.hub.Act(a, OpServe, id, 0)
	if s := next(t, a, "order_served"); s["pie_granted"] != false {
		t.Fatalf("pie over cap %v", s)
	}
}

func TestPieNoTargetSolo(t *testing.T) {
	tb := setup(t, 1)
	a := tb.ps[0]
	tb.start(t)
	tb.with(t, a.ID(), func(r *Room, p *Player) any { p.pies = 1; return nil })
	if err := tb.hub.Act(a, OpPie, "", 0); err != ErrNoTarget {
		t.Fatalf("solo pie: %v", err)
	}
	if n := tb.with(t, a.ID(), func(r *Room, p *Player) any { return p.pies }); n != 1 {
		t.Fatal("refused pie must not be spent")
	}
}

func TestPointsCapAndAbandon(t *testing.T) {
	tb := setup(t, 3)
	a, b, c := tb.ps[0], tb.ps[1], tb.ps[2]
	tb.start(t)
	// a answers a lot: paid answers stop at MaxScoredAnswers.
	for range MaxScoredAnswers + 5 {
		tb.earn(t, a, Cheese)
		tb.with(t, a.ID(), func(r *Room, p *Player) any { p.tray = nil; return nil })
	}
	earned := tb.with(t, a.ID(), func(r *Room, p *Player) any { return []int{p.earned, p.correct} }).([]int)
	if earned[1] != MaxScoredAnswers+5 || earned[0] > MaxScoredAnswers*points.MaxWorth {
		t.Fatalf("earned %v", earned)
	}
	// c leaves without answering: nothing reported. b answers once then leaves.
	if err := tb.hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	tb.earn(t, b, Bun)
	bEarned := tb.with(t, b.ID(), func(r *Room, p *Player) any { return p.earned }).(int)
	if err := tb.hub.Leave(b); err != nil {
		t.Fatal(err)
	}
	res := tb.hub.TakeResults()
	if len(res) != 1 || res[0].UserID != b.ID() || res[0].Points != points.Abandoned(bEarned, 1, MaxPoints) || bEarned <= 0 || res[0].Match.Finished {
		t.Fatalf("abandon results %+v", res)
	}
	tb.with(t, a.ID(), func(r *Room, p *Player) any { p.coins = 300; return nil })
	if err := tb.hub.End(tb.host); err != nil {
		t.Fatal(err)
	}
	res = tb.hub.TakeResults()
	if len(res) != 1 || res[0].UserID != a.ID() || res[0].Points != Award(earned[0], true) || res[0].Points > MaxPoints {
		t.Fatalf("final results %+v", res)
	}
	m := res[0].Match
	if m.Players[0].UserID != a.ID() || m.Players[0].Score != 300 || *m.Players[0].Accuracy != 100 || len(m.Players) != 3 {
		t.Fatalf("match %+v", m.Players)
	}
	// Closing a running room pays abandoned games.
	tb2 := setup(t, 1)
	tb2.start(t)
	for range 3 {
		tb2.earn(t, tb2.ps[0], Bun)
	}
	e2 := tb2.with(t, tb2.ps[0].ID(), func(r *Room, p *Player) any { return p.earned }).(int)
	tb2.hub.CloseAll()
	res = tb2.hub.TakeResults()
	if len(res) != 1 || res[0].Points != points.Abandoned(e2, 3, MaxPoints) || res[0].Points <= e2 {
		t.Fatalf("closed results %+v", res)
	}
}

func TestRankingCoinsServedEarlier(t *testing.T) {
	tb := setup(t, 3)
	tb.start(t)
	now := time.Now()
	tb.with(t, 1, func(r *Room, p *Player) any { p.coins, p.served, p.lastServe = 200, 2, now; return nil })
	tb.with(t, 2, func(r *Room, p *Player) any {
		p.coins, p.served, p.lastServe = 200, 2, now.Add(-time.Second)
		return nil
	})
	tb.with(t, 3, func(r *Room, p *Player) any { p.coins, p.served = 250, 1; return nil })
	_ = tb.hub.End(tb.host)
	pod := next(t, tb.host, "podium_result")["ranking"].([]Message)
	if pod[0]["user_id"] != int64(3) || pod[1]["user_id"] != int64(2) || pod[2]["user_id"] != int64(1) {
		t.Fatalf("ranking %v", pod)
	}
}

func TestReconnectResume(t *testing.T) {
	tb := setup(t, 1)
	a := tb.ps[0]
	tb.start(t)
	tb.earn(t, a, Bun)
	tb.hub.Detach(a)
	again := client(a.ID(), false)
	if !tb.hub.Resume(again) {
		t.Fatal("resume failed")
	}
	st := next(t, again, "state_sync")
	if st["phase"] != PhasePlaying || st["you"] != a.ID() {
		t.Fatalf("resume state %v", st)
	}
	if k := next(t, again, "kitchen_sync"); !slices.Equal(k["tray"].([]string), []string{Bun}) {
		t.Fatalf("resume kitchen %v", k)
	}
	host2 := client(1000, true)
	if !tb.hub.Resume(host2) {
		t.Fatal("host resume failed")
	}
	if st := next(t, host2, "state_sync"); st["role"] != "host" || st["pin"] != tb.pin {
		t.Fatalf("host resume %v", st)
	}
	if tb.hub.Resume(client(555, false)) {
		t.Fatal("stranger resumed")
	}
	// Late joiner enters the running game.
	late := client(9, false)
	if err := tb.hub.Join(late, tb.pin, nil); err != nil {
		t.Fatal(err)
	}
	if k := next(t, late, "kitchen_sync"); len(k["orders"].([]Message)) != 2 {
		t.Fatalf("late kitchen %v", k)
	}
	if pin, phase, host, ok := tb.hub.Presence(a.ID()); !ok || pin != tb.pin || phase != PhasePlaying || host {
		t.Fatalf("presence %v %v %v %v", pin, phase, host, ok)
	}
}

func TestRoomFullAndLeave(t *testing.T) {
	tb := setup(t, MaxPlayers)
	if err := tb.hub.Join(client(999, false), tb.pin, nil); err != ErrFull {
		t.Fatalf("full: %v", err)
	}
	if err := tb.hub.Leave(tb.ps[0]); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Join(client(999, false), tb.pin, nil); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Leave(tb.host); err != nil {
		t.Fatal(err)
	}
	if _, ok := tb.hub.RoomPhase(tb.pin); ok {
		t.Fatal("room open after host left")
	}
}

// TestConcurrentActions hammers one room from many goroutines (run with
// -race): every intent is serialised by the room goroutine.
func TestConcurrentActions(t *testing.T) {
	cfg := fast()
	cfg.RatMin, cfg.RatMax = 10*time.Millisecond, 20*time.Millisecond
	cfg.NewOrder = 10 * time.Millisecond
	tb := setupWith(t, cfg, 12)
	tb.start(t)
	before := runtime.NumGoroutine()
	var wg sync.WaitGroup
	for i, c := range tb.ps {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range 60 {
				ing := Ingredients[(i+j)%len(Ingredients)]
				_ = tb.hub.Act(c, OpRequest, ing, 0)
				v, err := tb.hub.Inspect(tb.pin, func(r *Room) any {
					p := r.byID[c.ID()]
					return []any{p.questionID, p.question.Answer}
				})
				if err == nil {
					q := v.([]any)
					_ = tb.hub.Answer(c, q[0].(string), q[1].(int)+j%2, time.Now())
				}
				_ = tb.hub.Act(c, OpPlateAdd, ing, 0)
				_ = tb.hub.Act(c, OpCook, "", 0)
				_ = tb.hub.Act(c, OpTakeOut, "", 0)
				_ = tb.hub.Act(c, OpServe, fmt.Sprintf("o%d-%d", c.ID(), j%3+1), 0)
				_ = tb.hub.Act(c, OpPie, "", 0)
				_ = tb.hub.Act(c, OpShoo, fmt.Sprintf("r%d-%d", c.ID(), j%4), 0)
				_ = tb.hub.Sync(c)
				if j%10 == 0 {
					drain(c)
				}
			}
		}()
	}
	wg.Wait()
	v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any {
		for _, p := range r.players {
			if len(p.tray) > MaxTray || len(p.plate) > MaxPlate || len(p.orders) > MaxOrders || p.pies > MaxPies || p.pies < 0 {
				return fmt.Sprintf("invariant broken for %d: %d %d %d %d", p.ID(), len(p.tray), len(p.plate), len(p.orders), p.pies)
			}
		}
		return ""
	})
	if v != "" {
		t.Fatal(v)
	}
	if err := tb.hub.End(tb.host); err != nil {
		t.Fatal(err)
	}
	tb.hub.CloseAll()
	if runtime.NumGoroutine() > before+2 {
		t.Logf("goroutines %d -> %d", before, runtime.NumGoroutine())
	}
}

func TestGameClockEnds(t *testing.T) {
	tb := setup(t, 1)
	tb.start(t)
	tb.hub.Inspect(tb.pin, func(r *Room) any { r.endsAt = time.Now(); return nil })
	if pod := next(t, tb.ps[0], "podium_result"); pod["you"].(Message)["won"] != true {
		t.Fatalf("podium %v", pod)
	}
	if phase, _ := tb.hub.RoomPhase(tb.pin); phase != PhaseOver {
		t.Fatalf("phase %s", phase)
	}
	if _, _, _, ok := tb.hub.Presence(1); ok {
		t.Fatal("finished room reported as presence")
	}
	// Restart from GAME_OVER works.
	tb.start(t)
	if phase, _ := tb.hub.RoomPhase(tb.pin); phase != PhasePlaying {
		t.Fatalf("restart phase %s", phase)
	}
}
