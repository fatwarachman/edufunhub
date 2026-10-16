package classroom

import (
	"testing"

	"edufunhub/game/internal/auth"
)

func observerClaim(id, room int64) (c auth.Claims) {
	c = claim(id, room, "snake")
	c.Observer = true
	return c
}

func TestObserverIsNotSeatedAndCannotAct(t *testing.T) {
	h, _ := newTestHub()
	student, admin := NewClient(), NewClient()
	if err := h.Join(claim(1, 4, "snake"), student); err != nil {
		t.Fatal(err)
	}
	if err := h.Join(observerClaim(99, 4), admin); err != nil {
		t.Fatal(err)
	}
	if w := drain(admin, "welcome"); len(w) != 1 || w[0]["you"] != int64(0) {
		t.Fatalf("observer welcome: %v", w)
	}
	if _, seated := h.Player(4, 99); seated {
		t.Fatal("observer must not be seated as a player")
	}
	drain(student, "chat")
	h.Handle(4, 99, admin, Inbound{T: "chat", Text: "halo"})
	if got := drain(student, "chat"); len(got) != 0 {
		t.Fatalf("observer chat must be ignored, got %v", got)
	}
	h.Handle(4, 1, student, Inbound{T: "chat", Text: "hai"})
	if got := drain(admin, "chat"); len(got) != 1 {
		t.Fatalf("observer should see room chat, got %v", got)
	}
}

func TestObserverKeepsRoomAndCleansUp(t *testing.T) {
	h, _ := newTestHub()
	student, admin := NewClient(), NewClient()
	_ = h.Join(claim(1, 6, "snake"), student)
	_ = h.Join(observerClaim(99, 6), admin)
	h.Leave(6, 1, student)
	if _, ok := h.Geometry(6); !ok {
		t.Fatal("room closed while an observer is still watching")
	}
	h.Leave(6, 99, admin)
	if _, ok := h.Geometry(6); ok {
		t.Fatal("empty room with no observers must be dropped")
	}
}

func TestEndingClassDisconnectsObservers(t *testing.T) {
	h, _ := newTestHub()
	admin := NewClient()
	_ = h.Join(observerClaim(99, 7), admin)
	h.Kick(7, 0)
	select {
	case <-admin.Done():
	default:
		t.Fatal("observer must be disconnected when the class ends")
	}
	if _, ok := h.Geometry(7); ok {
		t.Fatal("ended room must be dropped")
	}
}
