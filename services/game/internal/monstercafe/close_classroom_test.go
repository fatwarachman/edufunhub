package monstercafe

import (
	"testing"
	"time"
)

// closedReason returns the "closed" reason of the last NONE state_sync
// queued for c ("" when none).
func closedReason(c *Client) string {
	reason := ""
	for {
		select {
		case m := <-c.Out():
			if m["t"] == "state_sync" && m["closed"] != nil {
				reason, _ = m["closed"].(string)
			}
		default:
			return reason
		}
	}
}

func roomOfPlayer(h *Hub, uid int64) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.players[uid]
}

// TestCloseClassroomClosesOnlyThatClassroom: ending classroom 7 closes its
// room with reason "classroom_ended"; a normal PIN room and the room of
// classroom 8 stay open.
func TestCloseClassroomClosesOnlyThatClassroom(t *testing.T) {
	hub := NewHub(fast(), 31)
	t.Cleanup(hub.CloseAll)
	now := time.Now()

	host := NewClient(classroomClient(900, 0).Claims, true, "id", 4096)
	normal, err := hub.Create(host, now)
	if err != nil {
		t.Fatal(err)
	}
	guest := classroomClient(10, 0)
	if err := hub.Join(guest, normal.Pin, nil); err != nil {
		t.Fatal(err)
	}
	a, b, other := classroomClient(1, 7), classroomClient(2, 7), classroomClient(3, 8)
	for _, c := range []*Client{a, b, other} {
		if err := enter(hub, c, now); err != nil {
			t.Fatal(err)
		}
	}
	class := roomOfPlayer(hub, 1)
	if class == nil || roomOfPlayer(hub, 2) != class || roomOfPlayer(hub, 3) == class {
		t.Fatal("classroom rooms not set up")
	}
	otherPin := roomOfPlayer(hub, 3).Pin
	for _, c := range []*Client{host, guest, a, b, other} {
		closedReason(c)
	}

	if n := hub.CloseClassroom(0); n != 0 {
		t.Fatalf("classroom 0 closed %d rooms", n)
	}
	if n := hub.CloseClassroom(7); n != 1 {
		t.Fatalf("closed %d rooms, want 1", n)
	}
	for _, c := range []*Client{a, b} {
		if got := closedReason(c); got != ClosedClassroom {
			t.Fatalf("player %d close reason %q", c.ID(), got)
		}
		if roomOfPlayer(hub, c.ID()) != nil {
			t.Fatalf("player %d still seated", c.ID())
		}
	}
	if _, err := hub.Inspect(class.Pin, func(r *Room) any { return nil }); err == nil {
		t.Fatal("classroom room still registered")
	}
	for _, c := range []*Client{host, guest, other} {
		if got := closedReason(c); got != "" {
			t.Fatalf("client %d got close %q", c.ID(), got)
		}
	}
	for _, pin := range []string{normal.Pin, otherPin} {
		if _, err := hub.Inspect(pin, func(r *Room) any { return nil }); err != nil {
			t.Fatalf("room %s closed: %v", pin, err)
		}
	}
	if n := hub.CloseClassroom(7); n != 0 {
		t.Fatalf("second close closed %d rooms", n)
	}
}

func enter(h *Hub, c *Client, now time.Time) error {
	_, err := h.EnterClassroom(c, nil, now)
	return err
}
