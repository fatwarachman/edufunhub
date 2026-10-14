package minigames

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

func closeClaims(id, room int64) auth.Claims {
	return auth.Claims{Subject: id, Name: "P", Grade: 4, Game: "mini-lab", Classroom: room}
}

// TestCloseClassroomOnlyThatClassroom: ending classroom 7 removes its room
// and returns its players; the normal PIN room and classroom 8 stay.
func TestCloseClassroomOnlyThatClassroom(t *testing.T) {
	h := NewHub(Specs["mini-lab"], 1)
	now := time.Now()
	h.Create(closeClaims(1, 0), now)
	for _, c := range []auth.Claims{closeClaims(2, 7), closeClaims(3, 7), closeClaims(4, 8)} {
		if _, err := h.EnterClassroom(c, now); err != nil {
			t.Fatal(err)
		}
	}
	if ids := h.CloseClassroom(0, now); len(ids) != 0 {
		t.Fatalf("classroom 0: %v", ids)
	}
	ids := h.CloseClassroom(7, now)
	if len(ids) != 2 || ids[0]+ids[1] != 5 {
		t.Fatalf("closed %v", ids)
	}
	for _, uid := range []int64{2, 3} {
		if _, ok := h.Presence(uid); ok {
			t.Fatalf("player %d still seated", uid)
		}
	}
	for _, uid := range []int64{1, 4} {
		if _, ok := h.Presence(uid); !ok {
			t.Fatalf("player %d lost their room", uid)
		}
	}
}
