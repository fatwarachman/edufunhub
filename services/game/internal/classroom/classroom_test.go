package classroom

import (
	"math"
	"strings"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *clock) add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func newTestHub() (*Hub, *clock) {
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	return NewHub(Config{Now: c.now, Manual: true, Seed: 7}), c
}

func claim(id, room int64, booths ...string) auth.Claims {
	return auth.Claims{Subject: id, Name: "U" + string(rune('A'+id)), Game: GameKey, Classroom: room, Booths: booths}
}

// drain returns every queued message of type kind.
func drain(c *Client, kind string) []Message {
	var out []Message
	for {
		select {
		case m := <-c.out:
			if m["t"] == kind {
				out = append(out, m)
			}
		default:
			return out
		}
	}
}

func allBooths() []string {
	keys := make([]string, MaxBooths)
	for i := range keys {
		keys[i] = "game-" + string(rune('a'+i))
	}
	return keys
}

var layoutSeats = []int{1, 12, 30, 60, 120, 200}

func overlaps(a, b Box) bool {
	return math.Abs(a.X-b.X) < (a.W+b.W)/2 && math.Abs(a.Z-b.Z) < (a.D+b.D)/2
}

func TestGeometryLayout(t *testing.T) {
	want := map[int]struct {
		desks int
		w, d  float64
	}{
		1: {6, 24, 16}, 12: {6, 24, 16}, 24: {12, 24, 16}, 30: {15, 24, 19},
		60: {30, 24, 31}, 120: {60, 30, 37}, 200: {100, 30, 58},
	}
	for _, seats := range append([]int{0, -3, 24, 999}, layoutSeats...) {
		g := Layout(allBooths(), seats)
		room := g.Room
		solids := g.Solids()
		if w, ok := want[seats]; ok && (len(g.Desks) != w.desks || room.W != w.w || room.D != w.d) {
			t.Errorf("seats %d: desks %d room %vx%v, want %d %vx%v", seats, len(g.Desks), room.W, room.D, w.desks, w.w, w.d)
		}
		if len(g.Desks) != DeskCount(seats) || len(solids) != len(g.Desks)+1 || len(g.Booths) != MaxBooths {
			t.Fatalf("seats %d: desks %d solids %d booths %d", seats, len(g.Desks), len(solids), len(g.Booths))
		}
		if room.W < MinRoomW || room.D < MinRoomD {
			t.Errorf("seats %d: room %+v below minimum", seats, room)
		}
		for i, b := range solids {
			if b.X-b.W/2 < -room.W/2 || b.X+b.W/2 > room.W/2 || b.Z-b.D/2 < -room.D/2 || b.Z+b.D/2 > room.D/2 {
				t.Errorf("seats %d: solid %d out of bounds: %+v", seats, i, b)
			}
			for j := i + 1; j < len(solids); j++ {
				if overlaps(b, solids[j]) {
					t.Errorf("seats %d: solids %d and %d overlap", seats, i, j)
				}
			}
		}
		if g.TeacherDesk.Z != -room.D/2+2 {
			t.Errorf("seats %d: teacher desk z %v", seats, g.TeacherDesk.Z)
		}
		if g.Spawn.X <= 0 || g.Spawn.Z <= 0 || Blocked(g.Spawn.X, g.Spawn.Z, solids, room) {
			t.Fatalf("seats %d: spawn %+v blocked or not back right", seats, g.Spawn)
		}
		for _, dx := range []float64{-SpawnJitterX, SpawnJitterX} {
			for _, dz := range []float64{-SpawnJitterZ, SpawnJitterZ} {
				if Blocked(g.Spawn.X+dx, g.Spawn.Z+dz, solids, room) {
					t.Errorf("seats %d: spawn corner blocked: %v %v", seats, dx, dz)
				}
			}
		}
		for _, b := range g.Booths {
			if Blocked(b.X, b.Z, solids, room) {
				t.Errorf("seats %d: booth %d centre blocked", seats, b.I)
			}
			if !g.Inside(b.I, b.X, b.Z) || b.R != BoothRadius {
				t.Errorf("seats %d: booth %d centre not inside", seats, b.I)
			}
			if math.Hypot(b.X-g.Spawn.X, b.Z-g.Spawn.Z) < b.R+SpawnJitterX+PlayerRadius {
				t.Errorf("seats %d: booth %d covers the spawn", seats, b.I)
			}
			for _, o := range g.Booths[b.I+1:] {
				if math.Hypot(b.X-o.X, b.Z-o.Z) < 2*BoothRadius {
					t.Errorf("seats %d: booths %d and %d overlap", seats, b.I, o.I)
				}
			}
			for _, d := range solids {
				cx, cz := clamp(b.X, d.X-d.W/2, d.X+d.W/2), clamp(b.Z, d.Z-d.D/2, d.Z+d.D/2)
				if math.Hypot(b.X-cx, b.Z-cz) < b.R {
					t.Errorf("seats %d: booth %d pad overlaps a desk", seats, b.I)
				}
			}
		}
	}
	if len(Layout(append(allBooths(), "extra"), 30).Booths) != MaxBooths {
		t.Fatal("booths not capped")
	}
	g := Layout(allBooths(), 0)
	if g.Inside(-1, 0, 0) || g.Inside(MaxBooths, 0, 0) {
		t.Fatal("invalid booth index inside")
	}
	if g.Seats != DefaultSeats || len(g.Desks) != 12 {
		t.Fatalf("legacy layout: seats %d desks %d", g.Seats, len(g.Desks))
	}
	for k := 0; k <= MaxBooths; k++ {
		if n := len(Layout(allBooths()[:k], 200).Booths); n != k {
			t.Fatalf("%d booths placed as %d", k, n)
		}
	}
}

// TestBoothsReachable walks from spawn to every booth and desk side with a
// grid BFS over unblocked cells for every layout size, proving nothing is
// sealed off by desks.
func TestBoothsReachable(t *testing.T) {
	for _, seats := range layoutSeats {
		g := Layout(allBooths(), seats)
		room := g.Room
		solids := g.Solids()
		const step = 0.25
		type cell struct{ i, j int }
		toXZ := func(c cell) (float64, float64) { return -room.W/2 + float64(c.i)*step, -room.D/2 + float64(c.j)*step }
		toCell := func(x, z float64) cell {
			return cell{int(math.Round((x + room.W/2) / step)), int(math.Round((z + room.D/2) / step))}
		}
		start := toCell(g.Spawn.X, g.Spawn.Z)
		seen := map[cell]bool{start: true}
		queue := []cell{start}
		for len(queue) > 0 {
			c := queue[0]
			queue = queue[1:]
			for _, d := range []cell{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				n := cell{c.i + d.i, c.j + d.j}
				x, z := toXZ(n)
				if seen[n] || Blocked(x, z, solids, room) {
					continue
				}
				seen[n] = true
				queue = append(queue, n)
			}
		}
		for _, b := range g.Booths {
			if !seen[toCell(b.X, b.Z)] {
				t.Errorf("seats %d: booth %d unreachable", seats, b.I)
			}
		}
		for i, d := range g.Desks {
			if !seen[toCell(d.X, d.Z+d.D/2+0.6)] {
				t.Errorf("seats %d: desk %d seat unreachable", seats, i)
			}
		}
	}
}

func TestRoomLayoutFromFirstJoiner(t *testing.T) {
	h, _ := newTestHub()
	a, b := NewClient(), NewClient()
	first := claim(1, 8, "snake")
	first.Seats = 120
	_ = h.Join(first, a)
	w := drain(a, "welcome")
	if len(w) != 1 || w[0]["room"].(Bounds) != (Bounds{W: 30, D: 37}) || len(w[0]["desks"].([]Box)) != 60 || w[0]["seats"] != 120 || w[0]["entry"].(Point) != (Point{X: 12, Z: 16.5}) {
		t.Fatalf("welcome: %v", w)
	}
	second := claim(2, 8, "snake")
	second.Seats = 10
	_ = h.Join(second, b)
	if g, _ := h.Geometry(8); g.Seats != 120 || len(g.Desks) != 60 {
		t.Fatalf("later joiner changed layout: seats %d desks %d", g.Seats, len(g.Desks))
	}
	p, _ := h.Player(8, 2)
	if p.X < 10 || p.Z < 14 {
		t.Fatalf("spawn not back right of a big room: %+v", p)
	}
	h.Leave(8, 1, a)
	h.Leave(8, 2, b)
	_ = h.Join(second, NewClient())
	if g, _ := h.Geometry(8); g.Seats != 10 || g.Room != (Bounds{W: MinRoomW, D: MinRoomD}) {
		t.Fatalf("empty room not rebuilt: %+v", g.Room)
	}
}

func TestMovementClampsAndCollides(t *testing.T) {
	g := Layout(nil, 0)
	solids, room := g.Solids(), g.Room
	cases := []struct {
		name         string
		x, z, ix, iz float64
		dt           float64
		check        func(x, z float64) bool
	}{
		{"wall east", 11, 0, 1, 0, 5, func(x, z float64) bool { return math.Abs(x-(room.W/2-PlayerRadius)) < 1e-9 }},
		{"wall north", 0, 7, 0, 1, 5, func(x, z float64) bool { return math.Abs(z-(room.D/2-PlayerRadius)) < 1e-9 }},
		{"desk stops", 6.5, 3, 0, 1, 2, func(x, z float64) bool { return z <= 4-0.45-PlayerRadius+1e-6 }},
		{"teacher desk", 0, -3, 0, -1, 5, func(x, z float64) bool { return z >= -6+0.6+PlayerRadius-1e-6 }},
		{"free speed", 0, 0, 1, 0, 1, func(x, z float64) bool { return math.Abs(x-Speed) < 1e-9 && z == 0 }},
	}
	for _, tc := range cases {
		x, z := Advance(tc.x, tc.z, tc.ix, tc.iz, tc.dt, solids, room)
		if !tc.check(x, z) || Blocked(x, z, solids, room) && !nearWall(x, z, room) {
			t.Errorf("%s: ended at %.3f,%.3f", tc.name, x, z)
		}
	}
	x, z := Resolve(6.5, 4, solids, room) // centre inside a desk
	if Blocked(x, z, solids, room) && !nearWall(x, z, room) {
		t.Fatalf("push out failed: %v %v", x, z)
	}
	big := Layout(nil, 200)
	x, _ = Advance(0, 0, 1, 0, 10, nil, big.Room)
	if math.Abs(x-(big.Room.W/2-PlayerRadius)) > 1e-9 {
		t.Fatalf("big room wall: %v", x)
	}
	_, z = Advance(0, 0, 0, 1, 20, nil, big.Room)
	if math.Abs(z-(big.Room.D/2-PlayerRadius)) > 1e-9 || z < MinRoomD {
		t.Fatalf("big room depth not used: %v", z)
	}
}

func nearWall(x, z float64, room Bounds) bool {
	return math.Abs(math.Abs(x)-(room.W/2-PlayerRadius)) < 1e-6 || math.Abs(math.Abs(z)-(room.D/2-PlayerRadius)) < 1e-6
}

func TestClampInput(t *testing.T) {
	cases := []struct{ x, z, wx, wz float64 }{
		{3, 4, 0.6, 0.8},
		{0.5, 0, 0.5, 0},
		{math.NaN(), 1, 0, 1},
		{math.Inf(1), math.Inf(-1), 0, 0},
	}
	for _, tc := range cases {
		x, z := ClampInput(tc.x, tc.z)
		if math.Abs(x-tc.wx) > 1e-9 || math.Abs(z-tc.wz) > 1e-9 {
			t.Errorf("ClampInput(%v,%v) = %v,%v", tc.x, tc.z, x, z)
		}
	}
}

func TestSanitizeChat(t *testing.T) {
	cases := map[string]struct{ in, want string }{
		"trim collapse": {"  halo \t\n  semua  ", "halo semua"},
		"control":       {"a\x00b\x1b[31mc\u0007", "ab[31mc"},
		"bidi zero":     {"he\u202ello\u200b\u2066x\u2069\ufeff", "hellox"},
		"empty":         {" \u200b\t\x00 ", ""},
		"bad words":     {"Dasar ANJING, fuck! anjingan", "Dasar ******, ****! anjingan"},
		"length":        {strings.Repeat("ab ", 100), strings.TrimSpace(strings.Repeat("ab ", 40))},
		"long word":     {strings.Repeat("é", 200), strings.Repeat("é", ChatMaxRunes)},
	}
	for name, tc := range cases {
		got := SanitizeChat(tc.in)
		if got != tc.want {
			t.Errorf("%s: got %q want %q", name, got, tc.want)
		}
		if n := len([]rune(got)); n > ChatMaxRunes {
			t.Errorf("%s: %d runes", name, n)
		}
	}
}

func TestChatRateLimit(t *testing.T) {
	h, clk := newTestHub()
	a, b := NewClient(), NewClient()
	_ = h.Join(claim(1, 5), a)
	_ = h.Join(claim(2, 5), b)
	drain(a, "")
	drain(b, "")
	say := func() { h.Handle(5, 1, a, Inbound{T: "chat", Text: "hai"}) }
	say()
	say() // too soon
	clk.add(1600 * time.Millisecond)
	say()
	clk.add(1600 * time.Millisecond)
	say()
	clk.add(1600 * time.Millisecond)
	say() // 4th within 10s
	if got := len(drain(b, "chat")); got != 3 {
		t.Fatalf("B received %d chats, want 3", got)
	}
	if got := len(drain(a, "error")); got != 2 {
		t.Fatalf("A got %d chat_rate errors, want 2", got)
	}
	clk.add(6 * time.Second)
	say()
	if len(drain(b, "chat")) != 1 {
		t.Fatal("chat after window should pass")
	}
	h.Handle(5, 1, a, Inbound{T: "chat", Text: "\u200b "})
	if len(drain(b, "chat")) != 0 || len(drain(a, "error")) != 0 {
		t.Fatal("empty chat must be dropped silently")
	}
}

func TestEnterBooth(t *testing.T) {
	h, clk := newTestHub()
	a := NewClient()
	_ = h.Join(claim(1, 9, "ping-pong", "snake"), a)
	drain(a, "")
	h.Handle(9, 1, a, Inbound{T: "enter", Booth: 0})
	if e := drain(a, "error"); len(e) != 1 || e[0]["code"] != "too_far" {
		t.Fatalf("far enter: %v", e)
	}
	h.Handle(9, 1, a, Inbound{T: "enter", Booth: 7})
	if e := drain(a, "error"); len(e) != 1 || e[0]["code"] != "too_far" {
		t.Fatalf("missing booth: %v", e)
	}
	g, _ := h.Geometry(9)
	h.Place(9, 1, g.Booths[0].X+1.0, g.Booths[0].Z)
	h.Handle(9, 1, a, Inbound{T: "enter", Booth: 0})
	e := drain(a, "enter")
	if len(e) != 1 || e[0]["game"] != "ping-pong" || e[0]["booth"] != 0 {
		t.Fatalf("near enter: %v", e)
	}
	if p, _ := h.Player(9, 1); p.Busy != "ping-pong" {
		t.Fatalf("busy not set: %+v", p)
	}
	h.Step()
	st := drain(a, "state")
	if len(st) == 0 || st[len(st)-1]["p"].([][]any)[0][4] != "ping-pong" {
		t.Fatalf("busy not in state: %v", st)
	}
	h.Handle(9, 1, a, Inbound{T: "input", X: 1, Z: 0})
	clk.add(200 * time.Millisecond)
	h.Step()
	if p, _ := h.Player(9, 1); p.Busy != "" {
		t.Fatalf("busy kept after leaving booth: %+v", p)
	}
}

func TestInputRateAndMovement(t *testing.T) {
	h, clk := newTestHub()
	a := NewClient()
	_ = h.Join(claim(1, 3), a)
	h.Place(3, 1, 0, 0)
	for i := 0; i < MaxInputsPerS; i++ {
		h.Handle(3, 1, a, Inbound{T: "input", X: 0, Z: 0})
	}
	h.Handle(3, 1, a, Inbound{T: "input", X: 1, Z: 0}) // 31st: ignored
	clk.add(100 * time.Millisecond)
	h.Step()
	if p, _ := h.Player(3, 1); p.X != 0 {
		t.Fatalf("31st input applied: %+v", p)
	}
	clk.add(time.Second)
	h.Step()
	h.Handle(3, 1, a, Inbound{T: "input", X: 30, Z: 0})
	clk.add(100 * time.Millisecond)
	h.Step()
	if p, _ := h.Player(3, 1); math.Abs(p.X-Speed*0.1) > 1e-9 {
		t.Fatalf("speed not clamped: %+v", p)
	}
}

func TestRosterKickAndRoomLifecycle(t *testing.T) {
	h, _ := newTestHub()
	a, b, a2 := NewClient(), NewClient(), NewClient()
	_ = h.Join(claim(1, 4), a)
	_ = h.Join(claim(2, 4), b)
	r := drain(a, "roster")
	if len(r) != 2 || len(r[1]["players"].([]map[string]any)) != 2 {
		t.Fatalf("roster: %v", r)
	}
	// Reconnect replaces the old connection.
	_ = h.Join(claim(1, 4), a2)
	select {
	case <-a.Done():
	default:
		t.Fatal("old connection not closed")
	}
	h.Leave(4, 1, a) // stale leave is ignored
	if _, ok := h.Player(4, 1); !ok {
		t.Fatal("stale leave removed player")
	}
	if n := h.Kick(4, 2); n != 1 {
		t.Fatalf("kick user: %d", n)
	}
	if k := drain(b, "kicked"); len(k) != 1 || k[0]["reason"] != "removed" {
		t.Fatalf("kicked msg: %v", k)
	}
	if n := h.Kick(4, 0); n != 1 || h.Rooms() != 0 {
		t.Fatalf("kick all: %d rooms %d", n, h.Rooms())
	}
	if k := drain(a2, "kicked"); len(k) != 1 || k[0]["reason"] != "ended" {
		t.Fatalf("ended msg: %v", k)
	}
	if err := h.Join(claim(1, 0), NewClient()); err == nil {
		t.Fatal("join without classroom")
	}
}

func TestRoomFull(t *testing.T) {
	h, _ := newTestHub()
	for i := int64(1); i <= MaxPlayers; i++ {
		if err := h.Join(claim(i, 2), NewClient()); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
	}
	if err := h.Join(claim(MaxPlayers+1, 2), NewClient()); err != ErrFull {
		t.Fatalf("201st: %v", err)
	}
	if err := h.Join(claim(5, 2), NewClient()); err != nil {
		t.Fatalf("reconnect in full room: %v", err)
	}
}

func TestEmoteAndPing(t *testing.T) {
	h, clk := newTestHub()
	a, b := NewClient(), NewClient()
	_ = h.Join(claim(1, 6), a)
	_ = h.Join(claim(2, 6), b)
	h.Handle(6, 1, a, Inbound{T: "emote", E: "wave"})
	h.Handle(6, 1, a, Inbound{T: "emote", E: "clap"}) // rate
	clk.add(time.Second)
	h.Handle(6, 1, a, Inbound{T: "emote", E: "dance"}) // unknown
	h.Handle(6, 1, a, Inbound{T: "emote", E: "jump"})
	if got := len(drain(b, "emote")); got != 2 {
		t.Fatalf("emotes: %d", got)
	}
	h.Handle(6, 1, a, Inbound{T: "ping"})
	if len(drain(a, "pong")) != 1 {
		t.Fatal("no pong")
	}
}

// TestLayoutTable logs seats -> desks and room size (go test -v -run Table).
func TestLayoutTable(t *testing.T) {
	for _, seats := range layoutSeats {
		g := Layout(allBooths(), seats)
		t.Logf("seats %3d -> desks %3d room %vx%v spawn %+v", seats, len(g.Desks), g.Room.W, g.Room.D, g.Spawn)
		for _, b := range g.Booths {
			t.Logf("   booth %d %v,%v", b.I, b.X, b.Z)
		}
	}
}
