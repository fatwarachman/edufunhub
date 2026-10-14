package turbotrivia

import (
	"errors"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

func classClaims(id, room int64) auth.Claims {
	c := claims(id, 4)
	c.Classroom = room
	return c
}

func classClient(id, room int64, cfg Config) *Client {
	return NewClient(classClaims(id, room), false, "id", cfg.Buffer)
}

// lastState returns the newest state_sync queued for c.
func lastState(c *Client) Message {
	var last Message
	for _, m := range drain(c) {
		if m["t"] == "state_sync" {
			last = m
		}
	}
	return last
}

// classPin finds the classroom room of a player (Presence hides nothing for
// classroom rooms, only PIN lookup does).
func classPin(t *testing.T, hub *Hub, uid int64) string {
	t.Helper()
	hub.mu.Lock()
	defer hub.mu.Unlock()
	r := hub.players[uid]
	if r == nil {
		t.Fatalf("player %d has no room", uid)
	}
	return r.Pin
}

func TestClassroomRoomWithoutHostScreen(t *testing.T) {
	cfg := fastConfig()
	hub := NewHub(cfg, 11)
	t.Cleanup(hub.CloseAll)
	now := time.Now()

	if err := hub.EnterClassroom(NewClient(claims(50, 4), false, "id", cfg.Buffer), now, nil); !errors.Is(err, ErrNoClassroom) {
		t.Fatalf("no classroom claim: %v", err)
	}
	hostTok := NewClient(auth.Claims{Subject: 9000, Name: "T", Grade: 4, Game: HostKey, Classroom: 7}, true, "id", cfg.Buffer)
	if err := hub.EnterClassroom(hostTok, now, nil); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host token: %v", err)
	}

	captain := classClient(1, 7, cfg)
	if err := hub.EnterClassroom(captain, now, nil); err != nil {
		t.Fatal(err)
	}
	pin := classPin(t, hub, 1)
	state := lastState(captain)
	if state["classroom"] != int64(7) || state["captain"] != int64(1) || state["role"] != "player" {
		t.Fatalf("captain state: classroom=%v captain=%v role=%v", state["classroom"], state["captain"], state["role"])
	}
	if _, ok := hub.RoomPhase(pin); ok {
		t.Fatal("PIN lookup must not find a classroom room")
	}
	// Reload: entering again reattaches the same seat.
	if err := hub.EnterClassroom(captain, now, nil); err != nil || classPin(t, hub, 1) != pin {
		t.Fatalf("re-enter: %v", err)
	}

	mate := classClient(2, 7, cfg)
	if err := hub.EnterClassroom(mate, now, nil); err != nil {
		t.Fatal(err)
	}
	if classPin(t, hub, 2) != pin {
		t.Fatal("second player must join the same classroom room")
	}
	if st := lastState(mate); st["captain"] != int64(1) {
		t.Fatalf("mate sees captain %v", st["captain"])
	}

	other := classClient(3, 8, cfg)
	if err := hub.Join(other, pin, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other classroom by PIN: %v", err)
	}
	if err := hub.EnterClassroom(other, now, nil); err != nil {
		t.Fatal(err)
	}
	if classPin(t, hub, 3) == pin {
		t.Fatal("another classroom must get its own room")
	}
	outsider := NewClient(claims(4, 4), false, "id", cfg.Buffer)
	if err := hub.Join(outsider, pin, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no classroom by PIN: %v", err)
	}

	if err := hub.Configure(mate, QuestionCounts[0]); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain configure: %v", err)
	}
	if err := hub.Configure(captain, QuestionCounts[0]); err != nil {
		t.Fatalf("captain configure: %v", err)
	}
	if err := hub.SetSubject(captain, "math"); err != nil {
		t.Fatalf("captain subject: %v", err)
	}
	if err := hub.Start(mate); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain start: %v", err)
	}
	if err := hub.Start(captain); err != nil {
		t.Fatalf("captain start: %v", err)
	}
	h := &harness{t: t, hub: hub, pin: pin, kids: []*Client{captain, mate}}
	qid, answer := h.question(0)
	if err := hub.Answer(captain, qid, answer, time.Now()); err != nil {
		t.Fatalf("captain answer: %v", err)
	}
	if err := hub.End(mate); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain end: %v", err)
	}
	if err := hub.End(captain); err != nil {
		t.Fatalf("captain end: %v", err)
	}
	h.wait("over", func(r *Room) bool { return r.phase == PhaseOver })
	if len(hub.TakeResults()) == 0 {
		t.Fatal("results must be reported")
	}
}

func TestClassroomCaptainLeavingHandsOver(t *testing.T) {
	cfg := fastConfig()
	hub := NewHub(cfg, 12)
	t.Cleanup(hub.CloseAll)
	now := time.Now()
	a, b, c := classClient(1, 9, cfg), classClient(2, 9, cfg), classClient(3, 9, cfg)
	for _, cl := range []*Client{a, b, c} {
		if err := hub.EnterClassroom(cl, now, nil); err != nil {
			t.Fatal(err)
		}
	}
	pin := classPin(t, hub, 1)
	captainOf := func() int64 {
		v, err := hub.Inspect(pin, func(r *Room) any { return r.captain() })
		if err != nil {
			t.Fatal(err)
		}
		return v.(int64)
	}
	if err := hub.Leave(a); err != nil {
		t.Fatal(err)
	}
	if got := captainOf(); got != 2 {
		t.Fatalf("lobby hand-over: captain %d", got)
	}
	if err := hub.Start(b); err != nil {
		t.Fatalf("new captain start: %v", err)
	}
	if err := hub.Leave(b); err != nil {
		t.Fatal(err)
	}
	if got := captainOf(); got != 3 {
		t.Fatalf("in-game hand-over: captain %d", got)
	}
	if err := hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := hub.Inspect(pin, func(r *Room) any { return nil }); err != nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("empty classroom room must close")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
