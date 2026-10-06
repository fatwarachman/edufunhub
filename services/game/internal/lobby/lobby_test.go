package lobby

import (
	"encoding/json"
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
