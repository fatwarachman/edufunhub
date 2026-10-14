package classroom

import (
	"math"
	"strings"
	"testing"
	"time"
)

func joinAs(t *testing.T, h *Hub, id, room, teacher int64, seats int) *Client {
	t.Helper()
	cl := claim(id, room, "ping-pong")
	cl.TeacherID = teacher
	cl.Seats = seats
	c := NewClient()
	if err := h.Join(cl, c); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestTeacherSeatInsideAndFree(t *testing.T) {
	for _, seats := range append([]int{0, 24}, layoutSeats...) {
		g := Layout(allBooths(), seats)
		s := g.TeacherSeat
		if s.X != g.TeacherDesk.X || math.Abs(s.Z-(g.TeacherDesk.Z-g.TeacherDesk.D/2-TeacherSeatGap)) > 1e-9 {
			t.Fatalf("seats %d: seat %+v desk %+v", seats, s, g.TeacherDesk)
		}
		if Blocked(s.X, s.Z, g.Solids(), g.Room) {
			t.Fatalf("seats %d: teacher seat blocked %+v", seats, s)
		}
		if x, z := Resolve(s.X, s.Z, g.Solids(), g.Room); x != s.X || z != s.Z {
			t.Fatalf("seats %d: seat moved by Resolve to %v,%v", seats, x, z)
		}
	}
}

func TestTeacherSpawnsAtSeat(t *testing.T) {
	for _, seats := range []int{1, 30, 120, 200} {
		h, _ := newTestHub()
		st := joinAs(t, h, 2, 4, 9, seats)
		w := drain(st, "welcome")[0]
		g, _ := h.Geometry(4)
		tm := w["teacher"].(map[string]any)
		if tm["id"] != int64(9) || tm["x"] != round2(g.TeacherSeat.X) || tm["z"] != round2(g.TeacherSeat.Z) {
			t.Fatalf("seats %d: welcome teacher %v seat %+v", seats, tm, g.TeacherSeat)
		}
		tc := joinAs(t, h, 9, 4, 9, seats)
		p, _ := h.Player(4, 9)
		if p.X != g.TeacherSeat.X || p.Z != g.TeacherSeat.Z {
			t.Fatalf("seats %d: teacher at %v,%v want %+v", seats, p.X, p.Z, g.TeacherSeat)
		}
		if s, _ := h.Player(4, 2); s.Z < 0 {
			t.Fatalf("seats %d: student spawned at front %+v", seats, s)
		}
		// Teacher faces the students (+z, facing 0).
		h.Step()
		st2 := drain(tc, "state")
		for _, row := range st2[len(st2)-1]["p"].([][]any) {
			if row[0] == int64(9) && row[3] != 0.0 {
				t.Fatalf("teacher facing %v", row[3])
			}
		}
	}
}

func TestRosterTeacherFlagAndWelcomeUnknown(t *testing.T) {
	h, _ := newTestHub()
	a := joinAs(t, h, 1, 3, 0, 0)
	if tm := drain(a, "welcome")[0]["teacher"].(map[string]any); tm["id"] != int64(0) {
		t.Fatalf("unknown teacher id: %v", tm)
	}
	joinAs(t, h, 7, 3, 7, 0)
	r := drain(a, "roster")
	players := r[len(r)-1]["players"].([]map[string]any)
	if len(players) != 2 {
		t.Fatalf("roster: %v", players)
	}
	for _, p := range players {
		_, flagged := p["teacher"]
		if (p["id"] == int64(7)) != flagged {
			t.Fatalf("teacher flag wrong: %v", p)
		}
	}
}

func TestTeacherCannotEnterBooth(t *testing.T) {
	h, _ := newTestHub()
	c := joinAs(t, h, 7, 3, 7, 0)
	drain(c, "")
	g, _ := h.Geometry(3)
	h.Place(3, 7, g.Booths[0].X+0.5, g.Booths[0].Z)
	h.Handle(3, 7, c, Inbound{T: "enter", Booth: 0})
	if e := drain(c, "error"); len(e) != 1 || e[0]["code"] != "teacher_no_booth" {
		t.Fatalf("teacher enter: %v", e)
	}
	if p, _ := h.Player(3, 7); p.Busy != "" {
		t.Fatalf("teacher busy: %+v", p)
	}
}

func sayHub(t *testing.T) (*Hub, *clock, chan SayEvent) {
	t.Helper()
	got := make(chan SayEvent, 16)
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	h := NewHub(Config{Now: c.now, Manual: true, Seed: 7, OnSay: func(e SayEvent) { got <- e }})
	return h, c, got
}

func TestSayNearDeliversToPairOnly(t *testing.T) {
	h, _, events := sayHub(t)
	a := joinAs(t, h, 1, 5, 9, 0)
	b := joinAs(t, h, 2, 5, 9, 0)
	c := joinAs(t, h, 3, 5, 9, 0)
	h.Place(5, 1, 0, 3)
	h.Place(5, 2, 2, 3)
	h.Place(5, 3, 1, 4)
	for _, cl := range []*Client{a, b, c} {
		drain(cl, "")
	}
	h.Handle(5, 1, a, Inbound{T: "say", To: 2, Text: " hai\u200b  teman "})
	for name, cl := range map[string]*Client{"sender": a, "target": b} {
		m := drain(cl, "say")
		if len(m) != 1 || m[0]["id"] != int64(1) || m[0]["to"] != int64(2) || m[0]["name"] != "UB" || m[0]["text"] != "hai teman" || m[0]["at"] == nil {
			t.Fatalf("%s: %v", name, m)
		}
	}
	if m := drain(c, "say"); len(m) != 0 {
		t.Fatalf("third player received say: %v", m)
	}
	select {
	case e := <-events:
		if e.Classroom != 5 || e.From != 1 || e.To != 2 || e.Text != "hai teman" || !strings.HasPrefix(e.EventID, "cw-5-1-") || e.At == 0 {
			t.Fatalf("event: %+v", e)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("OnSay not called")
	}
	select {
	case e := <-events:
		t.Fatalf("OnSay called twice: %+v", e)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSayRejections(t *testing.T) {
	h, clk, events := sayHub(t)
	a := joinAs(t, h, 1, 5, 9, 0)
	b := joinAs(t, h, 2, 5, 9, 0)
	h.Place(5, 1, 0, 3)
	h.Place(5, 2, 5, 3)
	drain(a, "")
	drain(b, "")
	code := func() any {
		e := drain(a, "error")
		if len(e) != 1 {
			return e
		}
		return e[0]["code"]
	}
	h.Handle(5, 1, a, Inbound{T: "say", To: 2, Text: "hai"})
	if c := code(); c != "too_far" {
		t.Fatalf("far: %v", c)
	}
	for _, to := range []int64{1, 0, -4, 55} {
		h.Handle(5, 1, a, Inbound{T: "say", To: to, Text: "hai"})
		if c := code(); c != "no_target" {
			t.Fatalf("to %d: %v", to, c)
		}
	}
	// Offline teacher far from the teacher desk.
	h.Handle(5, 1, a, Inbound{T: "say", To: 9, Text: "bu"})
	if c := code(); c != "too_far" {
		t.Fatalf("offline teacher far: %v", c)
	}
	// Empty text is dropped silently.
	h.Place(5, 2, 1, 3)
	h.Handle(5, 1, a, Inbound{T: "say", To: 2, Text: "\u200b  "})
	if len(drain(a, "error"))+len(drain(a, "say"))+len(drain(b, "say")) != 0 {
		t.Fatal("empty say must be dropped")
	}
	// Rate limit shared with chat.
	h.Handle(5, 1, a, Inbound{T: "chat", Text: "halo"})
	h.Handle(5, 1, a, Inbound{T: "say", To: 2, Text: "hai"})
	if c := code(); c != "chat_rate" {
		t.Fatalf("rate: %v", c)
	}
	clk.add(1600 * time.Millisecond)
	h.Handle(5, 1, a, Inbound{T: "say", To: 2, Text: "hai"})
	if len(drain(b, "say")) != 1 {
		t.Fatal("say after gap should pass")
	}
	if n := len(events); n > 1 {
		t.Fatalf("events %d", n)
	}
}

func TestSayToOfflineTeacherNearDesk(t *testing.T) {
	h, _, events := sayHub(t)
	a := joinAs(t, h, 1, 5, 9, 0)
	g, _ := h.Geometry(5)
	h.Place(5, 1, g.TeacherSeat.X+2.6, g.TeacherSeat.Z)
	drain(a, "")
	h.Handle(5, 1, a, Inbound{T: "say", To: 9, Text: "permisi bu"})
	if m := drain(a, "say"); len(m) != 1 || m[0]["to"] != int64(9) {
		t.Fatalf("sender echo: %v", m)
	}
	select {
	case e := <-events:
		if e.To != 9 || e.From != 1 || e.Text != "permisi bu" {
			t.Fatalf("event %+v", e)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("OnSay not called")
	}
}

func TestTeacherSaysToStudent(t *testing.T) {
	h, _, events := sayHub(t)
	s := joinAs(t, h, 1, 5, 9, 0)
	tc := joinAs(t, h, 9, 5, 9, 0)
	g, _ := h.Geometry(5)
	h.Place(5, 1, g.TeacherSeat.X+2.5, g.TeacherSeat.Z)
	drain(s, "")
	drain(tc, "")
	h.Handle(5, 9, tc, Inbound{T: "say", To: 1, Text: "ada apa?"})
	if len(drain(s, "say")) != 1 || len(drain(tc, "say")) != 1 {
		t.Fatal("teacher say not delivered to both")
	}
	if e := <-events; e.From != 9 || e.To != 1 {
		t.Fatalf("event %+v", e)
	}
}

// Students carrying the teacher_id claim are never flagged: only the player
// whose Subject equals the room teacherID is the teacher.
func TestTeacherIdentityFromClaimsOnly(t *testing.T) {
	h, _ := newTestHub()
	a := joinAs(t, h, 1, 5, 9, 0)
	joinAs(t, h, 2, 5, 9, 0)
	r := drain(a, "roster")
	for _, p := range r[len(r)-1]["players"].([]map[string]any) {
		if _, ok := p["teacher"]; ok {
			t.Fatalf("student flagged as teacher: %v", p)
		}
	}
}
