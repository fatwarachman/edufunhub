package monstercafe

import (
	"errors"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

// classroomClient is a player whose signed token carries classroom room.
func classroomClient(id, room int64) *Client {
	return NewClient(auth.Claims{Subject: id, Name: "C", Grade: 4, Classroom: room}, false, "id", 4096)
}

func pinOfPlayer(h *Hub, uid int64) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r := h.players[uid]; r != nil {
		return r.Pin
	}
	return ""
}

func captainOf(t *testing.T, h *Hub, pin string) int64 {
	t.Helper()
	v, err := h.Inspect(pin, func(r *Room) any { return r.captain() })
	if err != nil {
		t.Fatal(err)
	}
	return v.(int64)
}

// lastState returns the latest state_sync queued on c.
func lastState(t *testing.T, c *Client) Message {
	t.Helper()
	var last Message
	for {
		select {
		case m := <-c.Out():
			if m["t"] == "state_sync" {
				last = m
			}
		default:
			if last == nil {
				t.Fatal("no state_sync")
			}
			return last
		}
	}
}

func TestClassroomRoomCaptainFlow(t *testing.T) {
	h := NewHub(fast(), 11)
	t.Cleanup(h.CloseAll)
	now := time.Now()

	if _, err := h.EnterClassroom(classroomClient(1, 0), nil, now); !errors.Is(err, ErrNoClassroom) {
		t.Fatalf("no classroom claim: %v", err)
	}
	hostTok := NewClient(auth.Claims{Subject: 50, Name: "H", Grade: 4, Classroom: 9}, true, "id", 64)
	if _, err := h.EnterClassroom(hostTok, nil, now); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host token: %v", err)
	}

	captain := classroomClient(1, 9)
	r, err := h.EnterClassroom(captain, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	pin := r.Pin
	if pinOfPlayer(h, 1) != pin || captainOf(t, h, pin) != 1 {
		t.Fatalf("captain not seated: pin %q captain %d", pinOfPlayer(h, 1), captainOf(t, h, pin))
	}
	st := lastState(t, captain)
	if st["classroom"] != int64(9) || st["captain"] != int64(1) || st["role"] != "player" {
		t.Fatalf("state classroom/captain: %v %v %v", st["classroom"], st["captain"], st["role"])
	}
	h.mu.Lock()
	hosted := h.hosts[1]
	h.mu.Unlock()
	if hosted != nil {
		t.Fatal("classroom room registered a host screen")
	}

	// Second player of the classroom lands in the same room automatically.
	mate := classroomClient(2, 9)
	if r2, err := h.EnterClassroom(mate, nil, now); err != nil || r2.Pin != pin {
		t.Fatalf("mate join: %v", err)
	}
	// Reload: entering again is idempotent.
	if r3, err := h.EnterClassroom(classroomClient(1, 9), nil, now); err != nil || r3.Pin != pin {
		t.Fatalf("captain reload: %v", err)
	}
	captain = classroomClient(1, 9)
	if _, err := h.EnterClassroom(captain, nil, now); err != nil {
		t.Fatal(err)
	}

	// Another classroom: own room; PIN refused; PIN lookup hides the room.
	other := classroomClient(3, 10)
	if r4, err := h.EnterClassroom(other, nil, now); err != nil || r4.Pin == pin {
		t.Fatalf("other classroom: %v", err)
	}
	if err := h.Join(classroomClient(4, 10), pin, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("pin from other classroom: %v", err)
	}
	if err := h.Join(client(5, false), pin, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("pin without classroom: %v", err)
	}
	if _, ok := h.RoomPhase(pin); ok {
		t.Fatal("RoomPhase found a classroom room")
	}
	if err := h.Join(classroomClient(6, 9), pin, nil); err != nil {
		t.Fatalf("pin same classroom: %v", err)
	}
	if err := h.Leave(classroomClient(6, 9)); err != nil {
		t.Fatal(err)
	}

	// Only the captain runs the room.
	if err := h.Start(mate); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain start: %v", err)
	}
	if err := h.Configure(mate, 3); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain configure: %v", err)
	}
	if err := h.Configure(captain, 3); err != nil {
		t.Fatalf("captain configure: %v", err)
	}
	if err := h.SetSubject(captain, "math"); err != nil {
		t.Fatalf("captain subject: %v", err)
	}
	if err := h.Start(captain); err != nil {
		t.Fatalf("captain start: %v", err)
	}
	// Captain still plays (answers).
	if err := h.Act(captain, OpRequest, Bun, 0); err != nil {
		t.Fatal(err)
	}
	q, _ := h.Inspect(pin, func(r *Room) any { p := r.byID[1]; return []any{p.questionID, p.question.Answer} })
	qa := q.([]any)
	if err := h.Answer(captain, qa[0].(string), qa[1].(int), time.Now()); err != nil {
		t.Fatalf("captain answer: %v", err)
	}

	// Captain leaves while playing: game goes on, captain passes to the mate.
	if err := h.Leave(captain); err != nil {
		t.Fatal(err)
	}
	if got := captainOf(t, h, pin); got != 2 {
		t.Fatalf("captain after leave %d", got)
	}
	if err := h.End(mate); err != nil {
		t.Fatalf("new captain end: %v", err)
	}
	// Last player leaves: room closes.
	if err := h.Leave(mate); err != nil {
		t.Fatal(err)
	}
	waitClosed(t, h, pin)
}

func TestClassroomRoomLobbyHandoff(t *testing.T) {
	h := NewHub(fast(), 12)
	t.Cleanup(h.CloseAll)
	now := time.Now()
	a, b, c := classroomClient(1, 7), classroomClient(2, 7), classroomClient(3, 7)
	r, _ := h.EnterClassroom(a, nil, now)
	_, _ = h.EnterClassroom(b, nil, now)
	_, _ = h.EnterClassroom(c, nil, now)
	if err := h.Leave(a); err != nil {
		t.Fatal(err)
	}
	if got := captainOf(t, h, r.Pin); got != 2 {
		t.Fatalf("lobby handoff to %d", got)
	}
	if err := h.Start(c); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("non-captain start after handoff: %v", err)
	}
	if err := h.Start(b); err != nil {
		t.Fatalf("new captain start: %v", err)
	}
}

func waitClosed(t *testing.T, h *Hub, pin string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := h.Inspect(pin, func(r *Room) any { return nil }); err != nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("classroom room not closed")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
