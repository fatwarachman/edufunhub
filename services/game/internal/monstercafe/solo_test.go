package monstercafe

import (
	"testing"
	"time"

	"edufunhub/game/internal/record"
)

// soloTable opens a private kitchen for player 7 (no host screen).
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
	if st["solo"] != true || st["owner"] != int64(7) || st["phase"] != PhaseLobby || st["you"] != int64(7) {
		t.Fatalf("solo lobby state %v", st)
	}
	if _, err := tb.hub.CreateSolo(client(8, true), nil, time.Now()); err != ErrPlayerOnly {
		t.Fatalf("host create_solo: %v", err)
	}
	if err := tb.hub.Configure(c, 3); err != nil {
		t.Fatalf("owner configure: %v", err)
	}
	if err := tb.hub.SetSubject(c, "math"); err != nil {
		t.Fatalf("owner subject: %v", err)
	}
	if err := tb.hub.Start(c); err != nil {
		t.Fatalf("owner start: %v", err)
	}
	k := next(t, c, "kitchen_sync")
	if orders, _ := k["orders"].([]Message); len(orders) == 0 {
		t.Fatalf("no orders in solo kitchen: %v", k["orders"])
	}
	tb.earn(t, c, Bun)
	if got := tb.with(t, 7, func(r *Room, p *Player) any { return len(p.tray) }); got != 1 {
		t.Fatalf("tray after correct answer = %v", got)
	}
	tb.with(t, 7, func(r *Room, p *Player) any { p.pies = 1; return nil })
	if err := tb.hub.Act(c, OpPie, "", 0); err != ErrNoTarget {
		t.Fatalf("solo pie: %v", err)
	}
}

func TestSoloIsPrivate(t *testing.T) {
	tb, _ := soloTable(t)
	if err := tb.hub.Join(client(8, false), tb.pin, nil); err != ErrFull {
		t.Fatalf("stranger joined solo room: %v", err)
	}
	if _, ok := tb.hub.RoomPhase(tb.pin); ok {
		t.Fatal("solo room visible to PIN lookup")
	}
	if pin, phase, host, ok := tb.hub.Presence(7); !ok || pin != tb.pin || phase != PhaseLobby || host {
		t.Fatalf("presence %q %q %v %v", pin, phase, host, ok)
	}
}

func TestSoloResumePlayAgainNoWinBonus(t *testing.T) {
	tb, c := soloTable(t)
	if err := tb.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	tb.earn(t, c, Bun)
	tb.hub.Detach(c)

	again := client(7, false)
	if !tb.hub.Resume(again) {
		t.Fatal("solo owner could not resume")
	}
	if st := next(t, again, "state_sync"); st["phase"] != PhasePlaying || st["solo"] != true {
		t.Fatalf("resumed state %v", st)
	}
	next(t, again, "kitchen_sync")

	earned := tb.with(t, 7, func(r *Room, p *Player) any { return p.earned }).(int)
	if earned <= 0 {
		t.Fatalf("earned = %d", earned)
	}
	if err := tb.hub.End(again); err != nil {
		t.Fatalf("owner end: %v", err)
	}
	res := next(t, again, "podium_result")
	you := res["you"].(Message)
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
	if st := next(t, again, "state_sync"); st["phase"] != PhasePlaying {
		t.Fatalf("play again state %v", st)
	}
}

func TestSoloLeaveClosesRoom(t *testing.T) {
	tb, c := soloTable(t)
	if err := tb.hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	if _, _, _, ok := tb.hub.Presence(7); ok {
		t.Fatal("solo room still present after leave")
	}
	if rooms, _ := tb.hub.Counts(); rooms != 0 {
		t.Fatalf("rooms after leave = %d", rooms)
	}
}

func TestNonSoloPlayerCannotRun(t *testing.T) {
	tb := setup(t, 1)
	if err := tb.hub.Start(tb.ps[0]); err != ErrHostOnly {
		t.Fatalf("player start in host room: %v", err)
	}
	if err := tb.hub.Configure(tb.ps[0], 3); err != ErrHostOnly {
		t.Fatalf("player configure in host room: %v", err)
	}
}
