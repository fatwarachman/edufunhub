package orderrush

import (
	"errors"
	"testing"
	"time"

	"edufunhub/game/internal/record"
)

// soloTable opens a private room for player 7 (no host screen).
func soloTable(t *testing.T) (*table, *Client) {
	t.Helper()
	h := NewHub(fast(), 9)
	t.Cleanup(h.CloseAll)
	c := client(7, false)
	r, err := h.CreateSolo(c, nil, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return &table{hub: h, pin: r.Pin, ps: []*Client{c}}, c
}

// drainSolo empties the outbox of c.
func drainSolo(c *Client) {
	for {
		select {
		case <-c.Out():
		default:
			return
		}
	}
}

func TestSoloCreateStartPlay(t *testing.T) {
	tb, c := soloTable(t)
	st := next(t, c, "state_sync")
	if st["solo"] != true || st["captain"] != int64(7) || st["min_players"] != 1 || st["phase"] != PhaseLobby || st["role"] != "player" {
		t.Fatalf("solo lobby state %v", st)
	}
	if _, err := tb.hub.CreateSolo(client(8, true), nil, time.Now()); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host create_solo: %v", err)
	}
	if err := tb.hub.Configure(c, ModeRace, RaceTargets[len(RaceTargets)-1], nil); err != nil {
		t.Fatalf("owner configure: %v", err)
	}
	if err := tb.hub.Start(c); err != nil {
		t.Fatalf("owner start alone: %v", err)
	}
	// A combo only grants SHIELD in solo: there is no rival to attack.
	var granted string
	for range ComboEvery {
		if g, ok := tb.solve(t, c)["powerup_granted"].(string); ok {
			granted = g
		}
	}
	if granted != PowerShield {
		t.Fatalf("solo combo granted %q, want SHIELD", granted)
	}
	// Rigged attack power-ups must fail cleanly without a rival.
	tb.hub.Inspect(tb.pin, func(r *Room) any {
		r.board.mu.Lock()
		r.board.accounts[7].Inventory = []string{PowerTangle, PowerFreeze}
		r.board.mu.Unlock()
		return nil
	})
	for _, kind := range []string{PowerTangle, PowerFreeze} {
		if err := tb.hub.UsePowerUp(c, kind, 0, time.Now()); !errors.Is(err, ErrTarget) {
			t.Fatalf("solo %s: %v", kind, err)
		}
		if err := tb.hub.UsePowerUp(c, kind, 7, time.Now()); !errors.Is(err, ErrTarget) {
			t.Fatalf("solo %s on self: %v", kind, err)
		}
	}
}

func TestSoloIsPrivate(t *testing.T) {
	tb, _ := soloTable(t)
	if err := tb.hub.Join(client(8, false), tb.pin, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stranger joined solo room: %v", err)
	}
	if _, ok := tb.hub.RoomPhase(tb.pin); ok {
		t.Fatal("solo room visible to PIN lookup")
	}
	if _, ok := tb.hub.Spectate(tb.pin, "id", time.Now()); ok {
		t.Fatal("solo room visible to spectators")
	}
	if pin, phase, host, ok := tb.hub.Presence(7); !ok || pin != tb.pin || phase != PhaseLobby || host {
		t.Fatalf("presence %q %q %v %v", pin, phase, host, ok)
	}
	r, err := tb.hub.EnterClassroom(classroomClient(9, 3), nil, time.Now())
	if err != nil || r.Pin == tb.pin {
		t.Fatalf("classroom player landed in solo room: %v", err)
	}
}

func TestSoloRaceFinishNoWinBonus(t *testing.T) {
	tb, c := soloTable(t)
	target := RaceTargets[0]
	if err := tb.hub.Configure(c, ModeRace, target, nil); err != nil {
		t.Fatal(err)
	}
	if err := tb.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	tb.solve(t, c)
	tb.hub.Detach(c)
	again := client(7, false)
	if !tb.hub.Resume(again) {
		t.Fatal("solo owner could not resume")
	}
	if st := next(t, again, "state_sync"); st["phase"] != PhaseActive || st["solo"] != true {
		t.Fatalf("resumed state %v", st)
	}
	for i := 1; i < target; i++ {
		tb.solve(t, again)
	}
	you := next(t, again, "podium_result")["you"].(Message)
	earned := func() int {
		v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { return r.byID[7].earned })
		return v.(int)
	}()
	if earned <= 0 || you["won"] != false || you["points"] != Award(earned, false) {
		t.Fatalf("solo result %v earned %d (want no win bonus)", you, earned)
	}
	results := tb.hub.TakeResults()
	if len(results) != 1 || results[0].Match.Mode != record.ModeSolo || results[0].Points != Award(earned, false) || !results[0].Match.Finished {
		t.Fatalf("solo results %+v", results)
	}
	if err := tb.hub.Start(again); err != nil {
		t.Fatalf("play again: %v", err)
	}
}

func TestSoloLeaveClosesRoom(t *testing.T) {
	tb, c := soloTable(t)
	if err := tb.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	tb.solve(t, c)
	drainSolo(c)
	if err := tb.hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	if st := lastState(t, c); st["phase"] != "NONE" {
		t.Fatalf("after leave %v", st)
	}
	if _, _, _, ok := tb.hub.Presence(7); ok {
		t.Fatal("solo room still present after leave")
	}
	if rooms, players := tb.hub.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("after leave: %d rooms %d players", rooms, players)
	}
	for _, res := range tb.hub.TakeResults() {
		if res.Match.Finished || res.Match.Mode != record.ModeSolo {
			t.Fatalf("abandoned solo result %+v", res)
		}
	}
}

func TestNonSoloPlayerCannotRun(t *testing.T) {
	tb := setup(t, 1, ModeRace, RaceTargets[0])
	if err := tb.hub.Start(tb.ps[0]); err != ErrHostOnly {
		t.Fatalf("player start in host room: %v", err)
	}
}
