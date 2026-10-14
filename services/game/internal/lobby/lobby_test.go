package lobby

import (
	"encoding/json"
	"sort"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

type game struct{ started int }
type data struct{ score int }

func c(id int64) auth.Claims { return auth.Claims{Subject: id, Name: "P", Grade: 3, Game: "x"} }

func TestPinJoinHostAndStart(t *testing.T) {
	h := New[game, data](1, Config{Min: 2, Max: 3})
	now := time.Unix(1_800_000_000, 0)
	pin, _ := h.Create(c(1), now, nil)
	if len(pin) != PinDigits {
		t.Fatalf("pin %q", pin)
	}
	if _, err := h.Enter(c(2), "000000", now); err != ErrNotFound {
		t.Fatalf("bad pin: %v", err)
	}
	start := func(r *Room[game, data]) error { r.Game.started++; return nil }
	if _, err := h.Start(1, now, start); err != ErrPlayers {
		t.Fatalf("alone: %v", err)
	}
	_, _ = h.Enter(c(2), pin, now)
	_, _ = h.Enter(c(3), pin, now)
	if _, err := h.Enter(c(4), pin, now); err != ErrFull {
		t.Fatalf("full: %v", err)
	}
	if _, err := h.Start(2, now, start); err != ErrNotHost {
		t.Fatalf("guest start: %v", err)
	}
	if _, err := h.Start(1, now, start); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Enter(c(5), pin, now); err != ErrStarted {
		t.Fatalf("late: %v", err)
	}
	h.View(1, func(r *Room[game, data]) {
		if r.Game.started != 1 || r.Phase != PhasePlaying {
			t.Fatalf("room %+v", r)
		}
	})
}

func TestLocalSeatsBelongToHost(t *testing.T) {
	h := New[game, data](2, Config{Min: 1, Max: 4, Local: true})
	now := time.Unix(1_800_000_000, 0)
	_, _ = h.Create(c(1), now, nil)
	_, _ = h.AddLocal(1, "Adik", now)
	pin := ""
	h.View(1, func(r *Room[game, data]) { pin = r.Pin })
	_, _ = h.Enter(c(2), pin, now)
	if _, err := h.AddLocal(2, "X", now); err != ErrNotHost {
		t.Fatalf("guest added local: %v", err)
	}
	h.View(1, func(r *Room[game, data]) {
		if len(r.Seats) != 3 || !r.Seats[1].Local || r.Seats[1].ID() >= 0 {
			t.Fatalf("seats %+v", r.Seats)
		}
		if !r.Controls(1, 1) || r.Controls(2, 1) || !r.Controls(2, 2) {
			t.Fatal("control rules")
		}
		if got := r.Humans(); len(got) != 2 {
			t.Fatalf("humans %v", got)
		}
	})
	if _, err := h.RemoveLocal(1, 2, now); err != ErrNotLocal {
		t.Fatalf("remove human: %v", err)
	}
	_, _ = h.RemoveLocal(1, 1, now)
	h.View(1, func(r *Room[game, data]) {
		if len(r.Seats) != 2 {
			t.Fatalf("after remove %d", len(r.Seats))
		}
	})
}

func TestHostLeavingHandsOverAndTakesLocalSeats(t *testing.T) {
	h := New[game, data](3, Config{Min: 1, Max: 4, Local: true})
	now := time.Unix(1_800_000_000, 0)
	pin, _ := h.Create(c(1), now, nil)
	_, _ = h.AddLocal(1, "Adik", now)
	_, _ = h.Enter(c(2), pin, now)
	left := []int{}
	h.OnLeave = func(_ *Room[game, data], seat int, _ time.Time) { left = append(left, seat) }
	_, _ = h.Start(1, now, func(*Room[game, data]) error { return nil })
	h.Leave(1, now)
	if len(left) != 2 {
		t.Fatalf("host and local seat should leave: %v", left)
	}
	h.View(2, func(r *Room[game, data]) {
		if r == nil || r.Host != 2 {
			t.Fatalf("handover failed: %+v", r)
		}
	})
	h.Leave(2, now)
	if rooms, _ := h.Counts(); rooms != 0 {
		t.Fatal("empty room kept")
	}
}

func TestPruneDropsOfflineRooms(t *testing.T) {
	h := New[game, data](4, Config{Min: 1, Max: 2})
	now := time.Unix(1_800_000_000, 0)
	h.Join(c(1), "en")
	_, _ = h.Create(c(1), now, nil)
	h.Prune(now.Add(time.Minute), time.Hour, 5*time.Minute, nil)
	if rooms, _ := h.Counts(); rooms != 1 {
		t.Fatal("online room pruned")
	}
	h.Offline(1)
	dropped := 0
	h.Prune(now.Add(6*time.Minute), time.Hour, 5*time.Minute, func(*Room[game, data]) { dropped++ })
	if rooms, players := h.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("offline room kept %d %d", rooms, players)
	}
}

func TestRoomPayloadCarriesSeatCharacter(t *testing.T) {
	h := New[game, data](1, Config{Min: 1, Max: 2})
	now := time.Unix(1_800_000_000, 0)
	host := c(1)
	host.Character = []byte(`{"color":"violet","gender":"girl"}`)
	pin, _ := h.Create(host, now, nil)
	_, _ = h.Enter(c(2), pin, now)
	h.View(1, func(r *Room[game, data]) {
		players := h.RoomPayload(r, 1, nil)["players"].([]Message)
		if string(players[0]["character"].(json.RawMessage)) != `{"color":"violet","gender":"girl"}` {
			t.Fatalf("host character %v", players[0]["character"])
		}
		if _, ok := players[1]["character"]; ok {
			t.Fatal("seat without a look must not send character")
		}
		if players[0]["user_id"] != int64(1) || players[1]["user_id"] != int64(2) {
			t.Fatalf("account seats carry user_id %v %v", players[0]["user_id"], players[1]["user_id"])
		}
	})
}

func TestDisconnectedHostHandsOverAfterGrace(t *testing.T) {
	h := New[game, data](5, Config{Min: 1, Max: 4, Local: true})
	now := time.Unix(1_800_000_000, 0)
	for _, id := range []int64{1, 2, 3} {
		h.Join(c(id), "id")
	}
	pin, _ := h.Create(c(1), now, nil)
	_, _ = h.AddLocal(1, "Adik", now)
	_, _ = h.Enter(c(2), pin, now)
	_, _ = h.Enter(c(3), pin, now)
	h.Offline(1)
	h.Offline(2)
	h.HandOver(now, HostGrace)
	if ids := h.HandOver(now.Add(HostGrace/2), HostGrace); len(ids) != 0 {
		t.Fatal("no handover inside the grace period")
	}
	if ids := h.HandOver(now.Add(HostGrace), HostGrace); len(ids) != 3 {
		t.Fatalf("handover updates the room: %v", ids)
	}
	h.View(1, func(r *Room[game, data]) {
		if r.Host != 3 {
			t.Fatalf("host must move to the first connected player: %d", r.Host)
		}
		if !r.Controls(1, 1) || r.Controls(3, 1) {
			t.Fatal("local seat stays on its device")
		}
	})
	if p, ok := h.PresenceOf(1); !ok || p.Pin != pin || p.Host {
		t.Fatalf("old host still seated: %+v %v", p, ok)
	}
	if _, err := h.Configure(3, now, func(*Room[game, data]) error { return nil }); err != nil {
		t.Fatalf("new host configures: %v", err)
	}
	if _, err := h.Configure(1, now, func(*Room[game, data]) error { return nil }); err != ErrNotHost {
		t.Fatalf("old host configures: %v", err)
	}
	h.Leave(1, now)
	h.View(3, func(r *Room[game, data]) {
		for _, s := range r.Seats {
			if s.Local {
				t.Fatal("leaving takes the device's local seats along")
			}
		}
	})
	if _, ok := h.PresenceOf(1); ok {
		t.Fatal("left player has no presence")
	}
}

func cc(id, room int64) auth.Claims {
	cl := c(id)
	cl.Classroom = room
	return cl
}

func pinOf[S, P any](h *Hub[S, P], uid int64) string {
	pin := ""
	h.View(uid, func(r *Room[S, P]) {
		if r != nil {
			pin = r.Pin
		}
	})
	return pin
}

func TestClassroomRoomCreateJoinAndRejoin(t *testing.T) {
	h := New[game, data](7, Config{Min: 2, Max: 3})
	now := time.Unix(1_800_000_000, 0)
	inits := 0
	init := func(r *Room[game, data]) { inits++ }
	if _, err := h.EnterClassroom(c(1), now, init); err != ErrNoClassroom {
		t.Fatalf("no claim: %v", err)
	}
	ids, err := h.EnterClassroom(cc(1, 9), now, init)
	if err != nil || len(ids) != 1 || ids[0] != 1 || inits != 1 {
		t.Fatalf("create: %v %v inits=%d", ids, err, inits)
	}
	pin := pinOf(h, 1)
	h.View(1, func(r *Room[game, data]) {
		if r.ClassroomID != 9 || r.Host != 1 || r.Phase != PhaseLobby || len(pin) != PinDigits {
			t.Fatalf("room %+v", r)
		}
	})
	ids, err = h.EnterClassroom(cc(2, 9), now, init)
	if err != nil || len(ids) != 2 || inits != 1 || pinOf(h, 2) != pin {
		t.Fatalf("join: %v %v inits=%d", ids, err, inits)
	}
	// Reload: same seat, no new room, host unchanged.
	ids, err = h.EnterClassroom(cc(1, 9), now, init)
	if err != nil || len(ids) != 2 || inits != 1 || pinOf(h, 1) != pin {
		t.Fatalf("rejoin: %v %v", ids, err)
	}
	h.View(1, func(r *Room[game, data]) {
		if len(r.Seats) != 2 || r.Host != 1 {
			t.Fatalf("seats %d host %d", len(r.Seats), r.Host)
		}
	})
	// Same classroom may also use the PIN.
	if _, err := h.Enter(cc(3, 9), pin, now); err != nil {
		t.Fatalf("pin same classroom: %v", err)
	}
	if rooms, _ := h.Counts(); rooms != 1 {
		t.Fatalf("rooms %d", rooms)
	}
}

func TestClassroomRoomIsolatedFromOtherClassrooms(t *testing.T) {
	h := New[game, data](8, Config{Min: 2, Max: 4})
	now := time.Unix(1_800_000_000, 0)
	_, _ = h.EnterClassroom(cc(1, 9), now, nil)
	pin := pinOf(h, 1)
	if _, err := h.EnterClassroom(cc(2, 10), now, nil); err != nil {
		t.Fatal(err)
	}
	if other := pinOf(h, 2); other == pin || other == "" {
		t.Fatalf("other classroom joined %q (classroom room %q)", other, pin)
	}
	for _, cl := range []auth.Claims{c(3), cc(4, 10)} {
		if _, err := h.Enter(cl, pin, now); err != ErrNotFound {
			t.Fatalf("pin from classroom %d: %v", cl.Classroom, err)
		}
	}
	// A normal PIN room never becomes a classroom room.
	normal, _ := h.Create(c(5), now, nil)
	_, _ = h.EnterClassroom(cc(6, 11), now, nil)
	if pinOf(h, 6) == normal {
		t.Fatal("classroom player joined a normal room")
	}
}

func TestClassroomRoomFullOrPlayingOpensNewRoom(t *testing.T) {
	h := New[game, data](9, Config{Min: 2, Max: 2})
	now := time.Unix(1_800_000_000, 0)
	_, _ = h.EnterClassroom(cc(1, 9), now, nil)
	_, _ = h.EnterClassroom(cc(2, 9), now, nil)
	first := pinOf(h, 1)
	if _, err := h.EnterClassroom(cc(3, 9), now, nil); err != nil {
		t.Fatal(err)
	}
	second := pinOf(h, 3)
	if second == first {
		t.Fatal("joined a full room")
	}
	h.View(3, func(r *Room[game, data]) {
		if r.Host != 3 || r.ClassroomID != 9 {
			t.Fatalf("new room %+v", r)
		}
	})
	if _, err := h.EnterClassroom(cc(4, 9), now, nil); err != nil || pinOf(h, 4) != second {
		t.Fatalf("join open room: %v", err)
	}
	if _, err := h.Start(3, now, func(*Room[game, data]) error { return nil }); err != nil {
		t.Fatal(err)
	}
	_, _ = h.Leave(1, now), h.Leave(2, now)
	_, _ = h.EnterClassroom(cc(5, 9), now, nil)
	// first room is gone (empty); second is playing: a third room opens.
	if p := pinOf(h, 5); p == second || p == "" {
		t.Fatalf("joined a playing room: %q", p)
	}
	if _, err := h.Stop(3, now, func(*Room[game, data]) {}); err != nil {
		t.Fatal(err)
	}
	// A finished room counts as open again once a seat is free.
	_ = h.Leave(4, now)
	_, _ = h.EnterClassroom(cc(6, 9), now, nil)
	if p := pinOf(h, 6); p != second && p != pinOf(h, 5) {
		t.Fatalf("done/lobby room not reused: %q", p)
	}
}

func TestClassroomRoomLeavesPreviousRoom(t *testing.T) {
	h := New[game, data](10, Config{Min: 2, Max: 4})
	now := time.Unix(1_800_000_000, 0)
	normal, _ := h.Create(c(1), now, nil)
	_, _ = h.Enter(c(2), normal, now)
	ids, err := h.EnterClassroom(cc(2, 9), now, nil)
	if err != nil || pinOf(h, 2) == normal {
		t.Fatalf("still in normal room: %v", err)
	}
	if len(ids) != 2 {
		t.Fatalf("affected %v (want old room + new)", ids)
	}
	if peers := h.Peers(1); len(peers) != 1 {
		t.Fatalf("old room peers %v", peers)
	}
}

func TestClassroomRoomRejectsLocalSeatsAndReportsClassroom(t *testing.T) {
	h := New[game, data](11, Config{Min: 1, Max: 4, Local: true})
	now := time.Unix(1_800_000_000, 0)
	_, _ = h.EnterClassroom(cc(1, 42), now, nil)
	if _, err := h.AddLocal(1, "Adik", now); err != ErrLocalLimit {
		t.Fatalf("local seat: %v", err)
	}
	var payload Message
	h.View(1, func(r *Room[game, data]) { payload = h.RoomPayload(r, 1, nil) })
	if payload["classroom"] != int64(42) {
		t.Fatalf("payload classroom %v", payload["classroom"])
	}
	raw, _ := json.Marshal(payload)
	var back map[string]any
	_ = json.Unmarshal(raw, &back)
	if back["classroom"] != float64(42) {
		t.Fatalf("json classroom %v", back["classroom"])
	}
	_, _ = h.Create(c(2), now, nil)
	h.View(2, func(r *Room[game, data]) { payload = h.RoomPayload(r, 2, nil) })
	if payload["classroom"] != int64(0) {
		t.Fatalf("normal room classroom %v", payload["classroom"])
	}
}

func TestClassroomRoomHiddenFromPinLookup(t *testing.T) {
	h := New[struct{}, struct{}](1, Config{Min: 1, Max: 4})
	now := time.Unix(0, 0)
	if _, err := h.EnterClassroom(cc(1, 7), now, nil); err != nil {
		t.Fatal(err)
	}
	pin := pinOf(h, 1)
	if _, ok := h.PhaseOf(pin); ok {
		t.Fatalf("classroom room %s must not be found by PIN lookup", pin)
	}
}

func TestCloseClassroomRemovesOnlyThatClassroom(t *testing.T) {
	h := New[game, data](21, Config{Min: 1, Max: 4})
	now := time.Unix(1_800_000_000, 0)
	normal, _ := h.Create(c(1), now, nil)
	_, _ = h.Enter(c(2), normal, now)
	_, _ = h.EnterClassroom(cc(3, 9), now, nil)
	_, _ = h.EnterClassroom(cc(4, 9), now, nil)
	_, _ = h.EnterClassroom(cc(5, 10), now, nil)
	playing := pinOf(h, 3)
	if _, err := h.Start(3, now, func(r *Room[game, data]) error { return nil }); err != nil {
		t.Fatal(err)
	}
	// A second, finished-lobby room of classroom 9 (the first one is playing).
	_, _ = h.EnterClassroom(cc(6, 9), now, nil)
	if pinOf(h, 6) == playing {
		t.Fatal("joined a playing room")
	}
	if ids := h.CloseClassroom(0); ids != nil {
		t.Fatalf("classroom 0: %v", ids)
	}
	dropped := 0
	ids := h.CloseClassroom(9, func(r *Room[game, data]) {
		if r.Pin != playing {
			t.Fatalf("drop on non-playing room %s", r.Pin)
		}
		dropped++
	})
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	if len(ids) != 3 || ids[0] != 3 || ids[1] != 4 || ids[2] != 6 || dropped != 1 {
		t.Fatalf("closed %v dropped %d", ids, dropped)
	}
	for _, uid := range []int64{3, 4, 6} {
		if _, ok := h.PresenceOf(uid); ok {
			t.Fatalf("player %d still seated", uid)
		}
	}
	for _, uid := range []int64{1, 2, 5} {
		if _, ok := h.PresenceOf(uid); !ok {
			t.Fatalf("player %d lost their room", uid)
		}
	}
	if rooms, players := h.Counts(); rooms != 2 || players != 3 {
		t.Fatalf("rooms %d players %d", rooms, players)
	}
	if ids := h.CloseClassroom(9); len(ids) != 0 {
		t.Fatalf("second close: %v", ids)
	}
}
