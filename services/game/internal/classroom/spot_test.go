package classroom

import (
	"math"
	"testing"
	"time"
)

func TestRejoinKeepsSpot(t *testing.T) {
	h, clk := newTestHub()
	a := joinAs(t, h, 2, 5, 9, 12)
	_ = joinAs(t, h, 3, 5, 9, 12) // keeps the room alive
	h.Place(5, 2, 4, 3)
	want, _ := h.Player(5, 2)
	h.Leave(5, 2, a)
	clk.t = clk.t.Add(10 * time.Minute)
	b := joinAs(t, h, 2, 5, 9, 12)
	got, _ := h.Player(5, 2)
	if math.Abs(got.X-want.X) > 1e-9 || math.Abs(got.Z-want.Z) > 1e-9 {
		t.Fatalf("rejoin at %+v want %+v", got, want)
	}
	w := drain(b, "welcome")[0]["spawn"].(map[string]float64)
	if w["x"] != round2(want.X) || w["z"] != round2(want.Z) {
		t.Fatalf("welcome spawn %v want %+v", w, want)
	}
}

func TestRejoinKeepsSpotWhenRoomEmptied(t *testing.T) {
	h, _ := newTestHub()
	a := joinAs(t, h, 2, 5, 9, 12)
	h.Place(5, 2, -4, 5)
	want, _ := h.Player(5, 2)
	h.Leave(5, 2, a)
	if h.Rooms() != 0 {
		t.Fatal("empty room should close")
	}
	joinAs(t, h, 2, 5, 9, 12)
	got, _ := h.Player(5, 2)
	if math.Abs(got.X-want.X) > 1e-9 || math.Abs(got.Z-want.Z) > 1e-9 {
		t.Fatalf("rejoin at %+v want %+v", got, want)
	}
}

func TestSpotExpiresAndIsPerClassroom(t *testing.T) {
	h, clk := newTestHub()
	a := joinAs(t, h, 2, 5, 9, 12)
	h.Place(5, 2, 4, 3)
	h.Leave(5, 2, a)
	// Other classroom: normal spawn near the door.
	joinAs(t, h, 2, 6, 9, 12)
	g, _ := h.Geometry(6)
	if p, _ := h.Player(6, 2); math.Abs(p.X-g.Spawn.X) > SpawnJitterX+0.5 || math.Abs(p.Z-g.Spawn.Z) > SpawnJitterZ+0.5 {
		t.Fatalf("other classroom used spot: %+v", p)
	}
	clk.t = clk.t.Add(PlaceMemory + time.Minute)
	joinAs(t, h, 2, 5, 9, 12)
	g5, _ := h.Geometry(5)
	if p, _ := h.Player(5, 2); math.Abs(p.X-g5.Spawn.X) > SpawnJitterX+0.5 || math.Abs(p.Z-g5.Spawn.Z) > SpawnJitterZ+0.5 {
		t.Fatalf("expired spot used: %+v", p)
	}
}

func TestKickForgetsSpot(t *testing.T) {
	h, _ := newTestHub()
	a := joinAs(t, h, 2, 5, 9, 12)
	joinAs(t, h, 3, 5, 9, 12)
	h.Place(5, 2, 4, 3)
	h.Leave(5, 2, a)
	h.Kick(5, 2)
	joinAs(t, h, 2, 5, 9, 12)
	g, _ := h.Geometry(5)
	if p, _ := h.Player(5, 2); math.Abs(p.X-g.Spawn.X) > SpawnJitterX+0.5 || math.Abs(p.Z-g.Spawn.Z) > SpawnJitterZ+0.5 {
		t.Fatalf("kicked player kept spot: %+v", p)
	}
}

func TestSpotResolvedIntoSmallerRoom(t *testing.T) {
	h, _ := newTestHub()
	a := joinAs(t, h, 2, 5, 9, 200)
	g, _ := h.Geometry(5)
	h.Place(5, 2, 0, g.Room.D/2-1)
	h.Leave(5, 2, a)
	joinAs(t, h, 2, 5, 9, 12) // new room, smaller layout
	g2, _ := h.Geometry(5)
	p, _ := h.Player(5, 2)
	if Blocked(p.X, p.Z, g2.Solids(), g2.Room) || math.Abs(p.Z) > g2.Room.D/2 {
		t.Fatalf("spot outside resized room: %+v room %+v", p, g2.Room)
	}
}
