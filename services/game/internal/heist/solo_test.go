package heist

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

func TestSoloCreateStartPlay(t *testing.T) {
	tb, c := soloTable(t)
	st := next(t, c, "state_sync")
	if st["solo"] != true || st["captain"] != int64(7) || st["min_players"] != 1 || st["phase"] != PhaseLobby || st["role"] != "player" {
		t.Fatalf("solo lobby state %v", st)
	}
	if _, err := tb.hub.CreateSolo(client(8, true), nil, time.Now()); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host create_solo: %v", err)
	}
	if err := tb.hub.Configure(c, WinTime, int64(TimeLimits[0])); err != nil {
		t.Fatalf("owner configure: %v", err)
	}
	if err := tb.hub.SetSubject(c, "math"); err != nil {
		t.Fatalf("owner subject: %v", err)
	}
	if err := tb.hub.Start(c); err != nil {
		t.Fatalf("owner start alone: %v", err)
	}
	tb.correct(t, c)
	// A steal chest has no rival in solo: it turns into plain gold.
	tb.force(t, 7, Chest{ChestSteal, 20, UnitPercent})
	if err := tb.hub.SelectChest(c, 0); err != nil {
		t.Fatalf("solo chest: %v", err)
	}
	if res := next(t, c, "chest_result"); res["type"] != ChestAddGold {
		t.Fatalf("solo steal chest result %v", res)
	}
	if g := tb.gold(t, 7).Gold; g <= 0 {
		t.Fatalf("gold after chest = %d", g)
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
	mate := classroomClient(9, 3)
	r, err := tb.hub.EnterClassroom(mate, nil, time.Now())
	if err != nil || r.Pin == tb.pin {
		t.Fatalf("classroom player landed in solo room: %v", err)
	}
}

func TestSoloResumeEndNoWinBonus(t *testing.T) {
	tb, c := soloTable(t)
	if err := tb.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	tb.correct(t, c)
	tb.hub.Detach(c)

	again := client(7, false)
	if !tb.hub.Resume(again) {
		t.Fatal("solo owner could not resume")
	}
	if st := next(t, again, "state_sync"); st["phase"] != PhasePlaying || st["solo"] != true {
		t.Fatalf("resumed state %v", st)
	}
	earned := func() int {
		v, _ := tb.hub.Inspect(tb.pin, func(r *Room) any { return r.byID[7].earned })
		return v.(int)
	}()
	if earned <= 0 {
		t.Fatalf("earned = %d", earned)
	}
	if err := tb.hub.End(again); err != nil {
		t.Fatalf("owner end: %v", err)
	}
	you := next(t, again, "podium_result")["you"].(Message)
	if you["won"] != false || you["points"] != Award(earned, false) {
		t.Fatalf("solo result %v (want no win bonus)", you)
	}
	results := tb.hub.TakeResults()
	if len(results) != 1 || results[0].Match.Mode != record.ModeSolo || results[0].Points != Award(earned, false) {
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
	tb.correct(t, c)
	drain(c)
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
	tb := setup(t, 1)
	if err := tb.hub.Start(tb.ps[0]); err != ErrHostOnly {
		t.Fatalf("player start in host room: %v", err)
	}
}
