package edukart

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
)

var t0 = time.Unix(1_800_000_000, 0)

func claims(id int64) auth.Claims {
	return auth.Claims{Subject: id, Name: "P" + string(rune('A'+id%26)), Grade: 4, Game: GameKey}
}

// clock drives a hub tick by tick.
type clock struct {
	h   *Hub
	now time.Time
	seq map[int64]int
}

func newClock(h *Hub) *clock { return &clock{h: h, now: t0, seq: map[int64]int{}} }

func (c *clock) tick() {
	c.now = c.now.Add(TickMs * time.Millisecond)
	c.h.Tick(c.now)
}

func (c *clock) input(uid int64, in Input) {
	c.seq[uid]++
	in.Seq = c.seq[uid]
	_ = c.h.Input(uid, in, c.now)
}

// with runs fn on uid's room race and racer under the hub lock.
func with(h *Hub, uid int64, fn func(r *room, rc *race, x *racer)) {
	h.rooms.View(uid, func(r *room) {
		if r == nil || r.Game.race == nil {
			fn(r, nil, nil)
			return
		}
		fn(r, r.Game.race, racerOfUser(r, uid))
	})
}

// startRace opens a room for the given humans and starts it.
func startRace(t *testing.T, bots bool, track string, ids ...int64) (*Hub, *clock, string) {
	t.Helper()
	h := NewHub(42)
	c := newClock(h)
	pin, _ := h.Create(claims(ids[0]), c.now)
	for _, id := range ids[1:] {
		if _, err := h.Enter(claims(id), pin, c.now); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range ids {
		h.Join(claims(id), "id")
	}
	if _, _, err := h.Configure(ids[0], Settings{Bots: &bots, Track: &track}, c.now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(ids[0], c.now); err != nil {
		t.Fatal(err)
	}
	return h, c, pin
}

// toGo ticks through the countdown.
func toGo(c *clock) {
	for i := 0; i < CountdownMs/TickMs; i++ {
		c.tick()
	}
}

func TestMaxPointsCap(t *testing.T) {
	if MaxPoints != points.Cap(15) || MaxPoints != 4650 {
		t.Fatalf("cap %d", MaxPoints)
	}
}

func TestRoomCreateJoinStart(t *testing.T) {
	h := NewHub(1)
	now := t0
	pin, ids := h.Create(claims(1), now)
	if len(pin) != 6 || len(ids) != 1 {
		t.Fatalf("create %q %v", pin, ids)
	}
	if _, err := h.Enter(claims(2), pin, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Enter(claims(3), "000000", now); err != lobby.ErrNotFound {
		t.Fatalf("bad pin: %v", err)
	}
	if _, err := h.Start(2, now); err != lobby.ErrNotHost {
		t.Fatalf("guest start: %v", err)
	}
	st := h.State(claims(2), now)
	if st["t"] != StateType || st["track"] != DefaultTrack || st["laps"] != DefaultLaps || st["bots"] != true || st["race"] != nil {
		t.Fatalf("lobby state %v", st)
	}
	for _, p := range st["players"].([]Message) {
		if p["vehicle"] != DefaultVehicle {
			t.Fatalf("seat vehicle %v", p)
		}
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	if phase, ok := h.RoomPhase(pin); !ok || phase != lobby.PhasePlaying {
		t.Fatalf("phase %q", phase)
	}
	if _, err := h.Enter(claims(3), pin, now); err != lobby.ErrStarted {
		t.Fatalf("late join: %v", err)
	}
	race := h.State(claims(1), now)["race"].(Message)
	if race["status"] != StatusCountdown || len(race["racers"].([]Message)) != MaxRacers {
		t.Fatalf("race %v", race)
	}
	if p, ok := h.Presence(2); !ok || p.Pin != pin {
		t.Fatalf("presence %+v", p)
	}
}

func TestSettingsValidation(t *testing.T) {
	h := NewHub(1)
	pin, _ := h.Create(claims(1), t0)
	_, _ = h.Enter(claims(2), pin, t0)
	bad, laps4, laps5, beach := "moon", 4, 5, "beach"
	cases := []struct {
		name string
		uid  int64
		in   Settings
		err  string
	}{
		{"track", 1, Settings{Track: &bad}, "invalid_track"},
		{"laps", 1, Settings{Laps: &laps4}, "invalid_laps"},
		{"guest", 2, Settings{Laps: &laps5}, "not_host"},
		{"ok", 1, Settings{Laps: &laps5, Track: &beach}, ""},
	}
	for _, tc := range cases {
		_, changed, err := h.Configure(tc.uid, tc.in, t0)
		got := ""
		if err != nil {
			got = err.Error()
		}
		if got != tc.err {
			t.Fatalf("%s: err %q want %q", tc.name, got, tc.err)
		}
		if tc.err == "" && !changed {
			t.Fatalf("%s: track change not reported", tc.name)
		}
	}
	st := h.State(claims(1), t0)
	if st["track"] != "beach" || st["laps"] != 5 {
		t.Fatalf("settings not applied: %v %v", st["track"], st["laps"])
	}
	if tm := h.TrackMessage(claims(2)); tm["t"] != "edukart_track" || string(tm["track"].(json.RawMessage)) != string(TrackRaw("beach")) {
		t.Fatal("track message is not the embedded beach file")
	}
	raw, _ := json.Marshal(h.TrackMessage(claims(2)))
	file, _ := trackFiles.ReadFile("tracks/beach.json")
	if !strings.Contains(string(raw), strings.TrimSpace(string(file))) {
		t.Fatal("track JSON not byte identical")
	}
}

func TestVehicleChoice(t *testing.T) {
	h := NewHub(1)
	pin, _ := h.Create(claims(1), t0)
	_, _ = h.Enter(claims(2), pin, t0)
	if _, err := h.SetVehicle(2, "spaceship", t0); err == nil || err.Error() != "invalid_vehicle" {
		t.Fatalf("bad vehicle: %v", err)
	}
	if _, err := h.SetVehicle(2, "formula", t0); err != nil {
		t.Fatal(err)
	}
	players := h.State(claims(1), t0)["players"].([]Message)
	if players[0]["vehicle"] != "classic" || players[1]["vehicle"] != "formula" {
		t.Fatalf("vehicles %v", players)
	}
	_, _ = h.Start(1, t0)
	with(h, 2, func(_ *room, _ *race, x *racer) {
		if x.veh.ID != "formula" || x.veh.Class != "speed" {
			t.Fatalf("racer vehicle %+v", x.veh)
		}
	})
	if _, err := h.SetVehicle(2, "buggy", t0); err != lobby.ErrPhase {
		t.Fatalf("vehicle during race: %v", err)
	}
}

func TestGridSoloAndBots(t *testing.T) {
	for _, bots := range []bool{true, false} {
		h, _, _ := startRace(t, bots, "forest", 1)
		with(h, 1, func(_ *room, rc *race, _ *racer) {
			want := 1
			if bots {
				want = MaxRacers
			}
			if len(rc.racers) != want {
				t.Fatalf("bots=%v racers %d", bots, len(rc.racers))
			}
			for i, x := range rc.racers {
				row := i / 2
				if x.kart.P != -float64(row*7+4) || (x.kart.D != -3.5 && x.kart.D != 3.5) {
					t.Fatalf("grid %d: %+v", i, x.kart)
				}
				if (i == 0) != (x.seat == 0) || (i > 0 && x.botNo != i) {
					t.Fatalf("order %d seat %d bot %d", i, x.seat, x.botNo)
				}
			}
		})
	}
}

func TestCountdownAndStartBoost(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1, 2)
	var p0 float64
	with(h, 1, func(_ *room, _ *race, x *racer) { p0 = x.kart.P })
	// Player 1 presses gas inside the window, player 2 far too early.
	c.input(2, Input{Throttle: 1})
	for i := 0; i < CountdownMs/TickMs-1; i++ {
		if i == CountdownMs/TickMs-6 {
			c.input(1, Input{Throttle: 1})
		}
		c.tick()
	}
	with(h, 1, func(_ *room, rc *race, x *racer) {
		if rc.status != StatusCountdown || x.kart.P != p0 {
			t.Fatalf("moved during countdown: %s %v", rc.status, x.kart.P)
		}
	})
	c.tick()
	frame := h.Frame(claims(1), c.now)
	if frame["ms"].(int64) != 0 {
		t.Fatalf("ms %v", frame["ms"])
	}
	boosts := map[float64]bool{}
	for _, ev := range frame["events"].([]Message) {
		if ev["k"] == "start_boost" {
			boosts[float64(ev["racer"].(int))] = true
		}
	}
	if !boosts[0] || boosts[1] {
		t.Fatalf("start boosts %v", boosts)
	}
	if h.State(claims(1), c.now)["race"].(Message)["status"] != StatusRacing {
		t.Fatal("not racing after GO")
	}
}

// drive sends a human-like autopilot input aiming at the right box.
func drive(h *Hub, c *clock, uid int64) {
	var in Input
	with(h, uid, func(_ *room, rc *race, x *racer) {
		if x == nil {
			return
		}
		target := 0.0
		if x.q != nil && x.kart.P > x.q.zone-20 {
			lanes, _ := rc.track.AnswerLanes(x.q.lanes)
			target = lanes[rightLane(x.q)]
		}
		in = Autopilot(&x.kart, rc.track, target)
		in.Hop, in.Fire = x.in.Hop, x.in.Fire
		if x.item != "" {
			in.Fire++
		}
	})
	c.input(uid, in)
}

func TestFullRaceEveryTrack(t *testing.T) {
	re := regexp.MustCompile(`^ek-[0-9]+-room-[0-9]+$`)
	for _, id := range TrackIDs {
		h, c, _ := startRace(t, true, id, 1)
		ticks := 0
		for ; ticks < 20*400; ticks++ {
			drive(h, c, 1)
			c.tick()
			if p, _ := h.Presence(1); p.Phase == lobby.PhaseDone {
				break
			}
		}
		st := h.State(claims(1), c.now)
		race := st["race"].(Message)
		if st["phase"] != lobby.PhaseDone || race["status"] != StatusDone {
			t.Fatalf("%s: race did not end after %d ticks", id, ticks)
		}
		var me Message
		ranks := map[int]bool{}
		for _, x := range race["racers"].([]Message) {
			ranks[x["rank"].(int)] = true
			if x["seat"] == 0 {
				me = x
			}
		}
		if len(ranks) != MaxRacers || me["finish_ms"].(int64) <= 0 || me["correct"].(int) < 7 {
			t.Fatalf("%s: ranks %v me %v", id, ranks, me)
		}
		res := h.TakeResults()
		if len(res) != 1 || res[0].Match == nil || !re.MatchString(res[0].EventID) || res[0].Points <= 0 || res[0].Points > MaxPoints {
			t.Fatalf("%s: results %+v", id, res)
		}
		bots := 0
		for _, p := range res[0].Match.Players {
			if p.Bot {
				bots++
			}
		}
		if bots != MaxRacers-1 || res[0].Match.Mode != "bot" || race["result"] == nil {
			t.Fatalf("%s: match %+v", id, res[0].Match)
		}
		t.Logf("%s: finished in %.1fs, rank %v, correct %v, points %d", id, float64(me["finish_ms"].(int64))/1000, me["rank"], me["correct"], res[0].Points)
	}
}

// atGate puts uid's kart just before its next gate with its question drawn
// and returns the gate.
func atGate(t *testing.T, h *Hub, uid int64, k int) *gateQ {
	t.Helper()
	var g *gateQ
	with(h, uid, func(_ *room, rc *race, x *racer) {
		x.nextK = k
		x.q = nil
		at, _, _ := rc.gateAt(k)
		x.kart.P, x.kart.Psi, x.kart.V, x.kart.Stun = at-3, 0, 12, 0
		rc.gates(x)
		g = x.q
	})
	if g == nil {
		t.Fatal("no question drawn")
	}
	return g
}

// passGate steers the kart into lane (or d when lane < 0) and drives through.
func passGate(h *Hub, c *clock, uid int64, d float64) []Message {
	with(h, uid, func(_ *room, _ *race, x *racer) { x.kart.D = d })
	var events []Message
	for i := 0; i < 6; i++ {
		c.input(uid, Input{Throttle: 0.5})
		c.tick()
		events = append(events, h.Frame(claims(uid), c.now)["events"].([]Message)...)
	}
	return events
}

func answerEvent(events []Message) Message {
	for _, ev := range events {
		if ev["k"] == "answer" {
			return ev
		}
	}
	return nil
}

func TestGateAnswers(t *testing.T) {
	for _, tc := range []struct {
		name  string
		k     int
		right bool
		off   bool
	}{
		{"tf right", 0, true, false},
		{"tf wrong", 0, false, false},
		{"choice right", 1, true, false},
		{"choice wrong", 1, false, false},
		{"off road", 1, true, true},
	} {
		h, c, _ := startRace(t, false, "forest", 1)
		toGo(c)
		g := atGate(t, h, 1, tc.k)
		if tc.k == 0 && (!g.tf || g.lanes != 2) || tc.k == 1 && (g.tf || g.lanes != 4) {
			t.Fatalf("%s: kind tf=%v lanes=%d", tc.name, g.tf, g.lanes)
		}
		var lanes []float64
		var halfWidth float64
		with(h, 1, func(_ *room, rc *race, x *racer) {
			lanes, _ = rc.track.AnswerLanes(g.lanes)
			halfWidth = rc.track.HalfWidth
			x.kart.Fruit = 5
		})
		lane := rightLane(g)
		if !tc.right {
			lane = (lane + 1) % g.lanes
		}
		d := lanes[lane]
		if tc.off {
			d = halfWidth + 1.5
		}
		ev := answerEvent(passGate(h, c, 1, d))
		if ev == nil {
			t.Fatalf("%s: no answer event", tc.name)
		}
		want := tc.right && !tc.off
		if ev["correct"] != want || ev["gate"] != g.id {
			t.Fatalf("%s: event %v", tc.name, ev)
		}
		if _, ok := ev["answer"]; !ok {
			t.Fatalf("%s: own answer missing: %v", tc.name, ev)
		}
		if g.tf {
			truth := g.q.Answer == 1
			if (lane == 0) != (want == truth) && !tc.off {
				t.Fatalf("%s: TF lane mapping wrong (lane %d answer %d)", tc.name, lane, g.q.Answer)
			}
			if ev["answer"] != map[bool]string{true: "true", false: "false"}[truth] {
				t.Fatalf("%s: tf answer %v", tc.name, ev["answer"])
			}
		}
		with(h, 1, func(_ *room, _ *race, x *racer) {
			switch {
			case want:
				if x.kart.Fruit != 7 || x.item == "" || ev["item"] != x.item || x.correct != 1 || x.earned <= 0 {
					t.Fatalf("%s: reward missing %+v item %q", tc.name, x.kart, x.item)
				}
			case tc.off:
				if ev["choice"] != -1 || x.kart.Fruit != 5 || x.wrong != 1 {
					t.Fatalf("%s: off road %v fruit %d", tc.name, ev, x.kart.Fruit)
				}
			default:
				if x.kart.Fruit != 2 || x.wrong != 1 || ev["choice"] != lane {
					t.Fatalf("%s: penalty missing %+v", tc.name, x.kart)
				}
			}
		})
	}
}

func TestWrongAnswerStuns(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1)
	toGo(c)
	g := atGate(t, h, 1, 1)
	var lanes []float64
	with(h, 1, func(_ *room, rc *race, _ *racer) { lanes, _ = rc.track.AnswerLanes(g.lanes) })
	with(h, 1, func(_ *room, _ *race, x *racer) { x.kart.D = lanes[(rightLane(g)+1)%4] })
	for i := 0; i < 20; i++ {
		c.input(1, Input{Throttle: 0.5})
		c.tick()
		var stun float64
		var answered bool
		with(h, 1, func(_ *room, _ *race, x *racer) { stun, answered = x.kart.Stun, x.wrong == 1 })
		if answered {
			if stun <= 0.5 {
				t.Fatalf("no stun after wrong answer: %v", stun)
			}
			return
		}
	}
	t.Fatal("gate not judged")
}

func TestNoAnswerLeakBeforeGate(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1)
	toGo(c)
	for k := 0; k < 2; k++ {
		g := atGate(t, h, 1, k)
		with(h, 1, func(_ *room, _ *race, x *racer) { x.kart.P = g.zone - 10; x.kart.V = 0 })
		c.tick()
		frame := h.Frame(claims(1), c.now)
		q, ok := frame["question"].(Message)
		if !ok || q["id"] != g.id {
			t.Fatalf("question not shown: %v", frame["question"])
		}
		raw, _ := json.Marshal(frame)
		s := string(raw)
		for _, bad := range []string{`"answer"`, `"hint"`, g.q.Key} {
			if strings.Contains(s, bad) {
				t.Fatalf("frame leaks %q: %s", bad, s)
			}
		}
		if hint := g.q.Hint.Get("id"); hint != "" && strings.Contains(s, hint) {
			t.Fatalf("frame leaks hint %q", hint)
		}
	}
}

func TestFrameFields(t *testing.T) {
	h, c, _ := startRace(t, true, "forest", 1)
	toGo(c)
	c.tick()
	raw, _ := json.Marshal(h.Frame(claims(1), c.now))
	var frame map[string]any
	_ = json.Unmarshal(raw, &frame)
	for _, k := range []string{"t", "ms", "you", "ack", "racers", "projectiles", "hazards", "question", "taken", "events"} {
		if _, ok := frame[k]; !ok {
			t.Fatalf("frame lacks %s", k)
		}
	}
	racer := frame["racers"].([]any)[0].(map[string]any)
	kartKeys := []string{"p", "d", "psi", "v", "y", "vy", "air", "drifting", "drift_dir", "drift_time", "charge", "stage", "boost", "boost_pow", "stun", "fruit", "zone_cap", "last_hop", "last_turbo", "hops", "fx"}
	for _, k := range append(kartKeys, "racer", "lap", "item", "juiced", "shield_ms", "tnt_ms", "finish_ms", "rank", "last_fire") {
		if _, ok := racer[k]; !ok {
			t.Fatalf("racer frame lacks %s: %v", k, racer)
		}
	}
	if frame["t"] != "race" || frame["you"].(float64) != 0 || len(frame["racers"].([]any)) != MaxRacers {
		t.Fatalf("frame %v", frame)
	}
	if _, ok := frame["taken"].([]any); !ok {
		t.Fatalf("taken must be an array: %v", frame["taken"])
	}
}

func TestFruitPickupOncePerLap(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1)
	toGo(c)
	var f Fruit
	with(h, 1, func(_ *room, rc *race, x *racer) {
		f = rc.track.Fruits[0]
		x.kart.P, x.kart.D, x.kart.V, x.kart.Psi, x.kart.Fruit = f.S-0.3, f.Lateral, 10, 0, 0
	})
	c.input(1, Input{Throttle: 0.3})
	c.tick()
	taken := h.Frame(claims(1), c.now)["taken"].([]int)
	with(h, 1, func(_ *room, _ *race, x *racer) {
		if x.kart.Fruit != 1 || len(taken) != 1 || taken[0] != 0 {
			t.Fatalf("fruit %d taken %v", x.kart.Fruit, taken)
		}
		x.kart.P = f.S - 0.3
	})
	c.tick()
	with(h, 1, func(_ *room, _ *race, x *racer) {
		if x.kart.Fruit != 1 {
			t.Fatalf("fruit taken twice in one lap: %d", x.kart.Fruit)
		}
	})
}

// duel sets up two humans on a straight, owner behind target.
func duel(t *testing.T, gap float64) (*Hub, *clock) {
	h, c, _ := startRace(t, false, "forest", 1, 2)
	toGo(c)
	with(h, 1, func(r *room, rc *race, _ *racer) {
		a, b := rc.racers[0], rc.racers[1]
		a.kart = Kart{P: 200, D: 0, LastHop: a.in.Hop, LastTurbo: a.in.Turbo}
		b.kart = Kart{P: 200 + gap, D: 0, LastHop: b.in.Hop, LastTurbo: b.in.Turbo}
	})
	return h, c
}

func collect(h *Hub, c *clock, ticks int, each func()) []Message {
	var events []Message
	for i := 0; i < ticks; i++ {
		if each != nil {
			each()
		}
		c.tick()
		events = append(events, h.Frame(claims(1), c.now)["events"].([]Message)...)
	}
	return events
}

func find(events []Message, kind string) Message {
	for _, ev := range events {
		if ev["k"] == kind {
			return ev
		}
	}
	return nil
}

func TestRocketHitsRacerAhead(t *testing.T) {
	for _, shielded := range []bool{false, true} {
		h, c := duel(t, 20)
		with(h, 1, func(_ *room, rc *race, x *racer) {
			x.item = ItemRocket
			if shielded {
				rc.racers[1].shield = 5
			}
		})
		c.input(1, Input{Fire: 1})
		events := collect(h, c, 30, nil)
		fire, hit := find(events, "fire"), find(events, "hit")
		if fire == nil || fire["item"] != ItemRocket || hit == nil || hit["racer"] != 1 || hit["by"] != 0 || hit["cause"] != "rocket" || hit["blocked"] != shielded {
			t.Fatalf("shield=%v events %v", shielded, events)
		}
		with(h, 1, func(_ *room, rc *race, x *racer) {
			v := rc.racers[1]
			if x.item != "" || x.lastFire != 1 || len(rc.projs) != 0 {
				t.Fatalf("rocket not consumed: item %q fire %d projs %d", x.item, x.lastFire, len(rc.projs))
			}
			if shielded && (v.shield != 0 || v.kart.Stun > 0) || !shielded && v.kart.Stun <= 0 {
				t.Fatalf("shield=%v target %+v shield %v", shielded, v.kart, v.shield)
			}
		})
		if f := h.Frame(claims(1), c.now)["racers"].([]racerFrame); f[0].LastFire != 1 {
			t.Fatalf("last_fire %d", f[0].LastFire)
		}
	}
}

func TestTNTOnHeadShakenOffByHops(t *testing.T) {
	h, c := duel(t, 30)
	with(h, 1, func(_ *room, rc *race, _ *racer) {
		rc.hazards = append(rc.hazards, &hazard{id: 99, kind: "tnt", owner: 1, p: 201.5, d: 0})
	})
	events := collect(h, c, 10, func() { c.input(1, Input{Throttle: 0.4}) })
	if find(events, "tnt_on") == nil {
		t.Fatalf("no tnt_on: %v", events)
	}
	var hop int
	with(h, 1, func(_ *room, rc *race, x *racer) {
		if x.tnt <= 0 || len(rc.hazards) != 0 {
			t.Fatalf("tnt not on head: %v", x.tnt)
		}
		hop = x.in.Hop
	})
	events = collect(h, c, 4, func() { hop += 2; c.input(1, Input{Throttle: 0.4, Hop: hop}) })
	if find(events, "tnt_off") == nil || find(events, "hit") != nil {
		t.Fatalf("tnt not removed by hops: %v", events)
	}
}

func TestTNTBlowsAfterFuse(t *testing.T) {
	h, c := duel(t, 30)
	with(h, 1, func(_ *room, rc *race, x *racer) {
		x.tnt, x.tntBy, x.tntHops = TNTFuseMs/1000.0, 1, x.kart.Hops
	})
	events := collect(h, c, TNTFuseMs/TickMs+2, nil)
	hit := find(events, "hit")
	if find(events, "boom") == nil || hit == nil || hit["cause"] != "tnt" || hit["racer"] != 0 {
		t.Fatalf("tnt fuse: %v", events)
	}
}

func TestNitroExplodesOnContact(t *testing.T) {
	h, c := duel(t, 30)
	with(h, 1, func(_ *room, rc *race, _ *racer) {
		rc.hazards = append(rc.hazards, &hazard{id: 7, kind: "nitro", owner: 1, p: 201.5, d: 0})
	})
	events := collect(h, c, 10, func() { c.input(1, Input{Throttle: 0.4}) })
	hit := find(events, "hit")
	if find(events, "tnt_on") != nil || hit == nil || hit["cause"] != "nitro" || find(events, "boom") == nil {
		t.Fatalf("nitro: %v", events)
	}
}

func TestJuicedTNTDropsNitroAndNOS(t *testing.T) {
	h, c := duel(t, 30)
	with(h, 1, func(_ *room, _ *race, x *racer) { x.item, x.kart.Fruit = ItemTNT, MaxFruit })
	c.input(1, Input{Fire: 1})
	c.tick()
	with(h, 1, func(_ *room, rc *race, x *racer) {
		if len(rc.hazards) != 1 || rc.hazards[0].kind != "nitro" {
			t.Fatalf("juiced tnt %+v", rc.hazards)
		}
		x.item = ItemNOS
	})
	c.input(1, Input{Fire: 2})
	c.tick()
	with(h, 1, func(_ *room, _ *race, x *racer) {
		if x.kart.Boost < 3 || x.kart.BoostPow < 9 {
			t.Fatalf("juiced nos %+v", x.kart)
		}
	})
}

func TestHazardLimit(t *testing.T) {
	h, c := duel(t, 30)
	for i := 0; i < MaxHazards+5; i++ {
		with(h, 1, func(_ *room, rc *race, x *racer) {
			x.item = ItemTNT
			x.kart.D = 100 // far off any racer line: crates stay
			rc.fire(x)
		})
	}
	c.tick()
	with(h, 1, func(_ *room, rc *race, _ *racer) {
		if len(rc.hazards) != MaxHazards {
			t.Fatalf("hazards %d", len(rc.hazards))
		}
	})
}

func TestInputSeqAndRate(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1)
	_ = h.Input(1, Input{Seq: 5, Throttle: 1}, c.now)
	_ = h.Input(1, Input{Seq: 4, Throttle: -1}, c.now)
	with(h, 1, func(_ *room, _ *race, x *racer) {
		if x.seq != 5 || x.in.Throttle != 1 {
			t.Fatalf("stale input applied: %+v", x.in)
		}
	})
	for i := 0; i < 200; i++ {
		_ = h.Input(1, Input{Seq: 6 + i, Throttle: 1}, c.now)
	}
	with(h, 1, func(_ *room, _ *race, x *racer) {
		if x.seq != 5+MaxInputsPerSecond-1 {
			t.Fatalf("rate limit: seq %d", x.seq)
		}
	})
	if f := h.Frame(claims(1), c.now); f["ack"] != 5+MaxInputsPerSecond-1 {
		t.Fatalf("ack %v", f["ack"])
	}
}

func TestLeaveMidRacePaysAbandoned(t *testing.T) {
	h, c, _ := startRace(t, true, "forest", 1, 2)
	toGo(c)
	g := atGate(t, h, 2, 1)
	var lanes []float64
	with(h, 2, func(_ *room, rc *race, _ *racer) { lanes, _ = rc.track.AnswerLanes(g.lanes) })
	if ev := answerEvent(passGate(h, c, 2, lanes[rightLane(g)])); ev == nil || ev["correct"] != true {
		t.Fatalf("setup answer %v", ev)
	}
	var earned int
	with(h, 2, func(_ *room, _ *race, x *racer) { earned = x.earned })
	_, paid := h.Leave(2, c.now)
	if paid != points.Abandoned(earned, 1, MaxPoints) || paid <= 0 {
		t.Fatalf("paid %d earned %d", paid, earned)
	}
	res := h.TakeResults()
	if len(res) != 1 || res[0].UserID != 2 || res[0].Points != paid || res[0].Match == nil || res[0].Correct != 1 {
		t.Fatalf("results %+v", res)
	}
	st := h.State(claims(1), c.now)
	if st["phase"] != lobby.PhasePlaying {
		t.Fatalf("race must go on: %v", st["phase"])
	}
	for _, x := range st["race"].(Message)["racers"].([]Message) {
		if x["seat"] == 1 && x["left"] != true {
			t.Fatalf("leaver not marked: %v", x)
		}
	}
	if _, paid := h.Leave(2, c.now); paid != -1 {
		t.Fatalf("second leave paid %d", paid)
	}
}

func TestStopEndsRace(t *testing.T) {
	h, c, _ := startRace(t, true, "beach", 1)
	toGo(c)
	if _, err := h.Stop(1, c.now); err != nil {
		t.Fatal(err)
	}
	race := h.State(claims(1), c.now)["race"].(Message)
	if race["status"] != StatusDone || race["stopped"] != true || race["result"] == nil || race["match"] == nil {
		t.Fatalf("stopped race %v", race)
	}
	res := h.TakeResults()
	if len(res) != 1 || !regexp.MustCompile(`^ek-[0-9]+-room-[0-9]+$`).MatchString(res[0].EventID) {
		t.Fatalf("results %+v", res)
	}
	// Back to the lobby on the next create/settings.
	five := 5
	if _, _, err := h.Configure(1, Settings{Laps: &five}, c.now); err != nil {
		t.Fatal(err)
	}
	if st := h.State(claims(1), c.now); st["phase"] != lobby.PhaseLobby || st["race"] != nil || st["laps"] != 5 {
		t.Fatalf("reset %v", st)
	}
}

func TestRaceTimeLimit(t *testing.T) {
	h, c, _ := startRace(t, false, "forest", 1)
	toGo(c)
	with(h, 1, func(_ *room, rc *race, _ *racer) { rc.ms = RaceLimitMs })
	c.tick()
	if p, _ := h.Presence(1); p.Phase != lobby.PhaseDone {
		t.Fatalf("time limit not applied: %v", p.Phase)
	}
}

func TestClassroomRoom(t *testing.T) {
	h := NewHub(3)
	c1, c2 := claims(1), claims(2)
	c1.Classroom, c2.Classroom = 9, 9
	if _, err := h.EnterClassroom(claims(3), t0); err != lobby.ErrNoClassroom {
		t.Fatalf("no classroom: %v", err)
	}
	_, _ = h.EnterClassroom(c1, t0)
	_, _ = h.EnterClassroom(c2, t0)
	p1, _ := h.Presence(1)
	p2, _ := h.Presence(2)
	if p1.Pin != p2.Pin {
		t.Fatal("classmates in different rooms")
	}
	if _, ok := h.RoomPhase(p1.Pin); ok {
		t.Fatal("classroom room visible by PIN")
	}
	if ids := h.CloseClassroom(9, t0); len(ids) != 2 {
		t.Fatalf("close %v", ids)
	}
}

func TestBotsAnswerAndSteer(t *testing.T) {
	h, c, _ := startRace(t, true, "mandalika", 1)
	for i := 0; i < 20*90; i++ {
		c.input(1, Input{})
		c.tick()
	}
	with(h, 1, func(_ *room, rc *race, _ *racer) {
		answered, right := 0, 0
		for _, x := range rc.racers[1:] {
			answered += x.correct + x.wrong
			right += x.correct
		}
		if answered < 7*2 || right == 0 || right == answered {
			t.Fatalf("bots answered %d right %d", answered, right)
		}
	})
}
