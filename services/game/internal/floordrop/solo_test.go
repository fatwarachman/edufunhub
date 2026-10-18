package floordrop

import (
	"errors"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/record"
)

// soloHarness opens a private room for player 7 (no host screen).
func soloHarness(t *testing.T) (*harness, *Client) {
	t.Helper()
	cfg := fastConfig()
	h := &harness{t: t, hub: NewHub(cfg, 7)}
	t.Cleanup(h.hub.CloseAll)
	c := NewClient(claims(7, 4), false, "id", cfg.Buffer)
	r, err := h.hub.CreateSolo(c, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	h.pin, h.kids = r.Pin, []*Client{c}
	return h, c
}

func TestSoloCreateConfigureStartAlone(t *testing.T) {
	h, c := soloHarness(t)
	st := lastState(c)
	if st["solo"] != true || st["captain"] != int64(7) || st["min_players"] != 1 || st["role"] != "player" || st["phase"] != PhaseLobby {
		t.Fatalf("solo lobby state %v", st)
	}
	host := NewClient(auth.Claims{Subject: 9000, Name: "T", Grade: 4, Game: HostKey}, true, "id", 16)
	if _, err := h.hub.CreateSolo(host, time.Now()); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host create_solo: %v", err)
	}
	if err := h.hub.SetSubject(c, "math"); err != nil {
		t.Fatalf("owner subject: %v", err)
	}
	if err := h.hub.SetSettings(c, Durations[0], 0); err != nil {
		t.Fatalf("owner settings: %v", err)
	}
	if err := h.hub.Start(c); err != nil {
		t.Fatalf("owner start alone: %v", err)
	}
	// One player standing must not end a solo game.
	q := h.waitQuestion(0)
	if got := h.inspect(func(r *Room) any { return r.aliveCount() }); got != 1 || h.phase() != PhaseQuestion {
		t.Fatalf("solo game ended at start: alive %v phase %s", got, h.phase())
	}
	_ = h.hub.Answer(c, q.id, q.answer, time.Now())
	h.waitQuestion(q.number)
	if got := h.inspect(func(r *Room) any { return r.byID[7].correct }); got != 1 {
		t.Fatalf("correct after round 1 = %v", got)
	}
}

func TestSoloIsPrivate(t *testing.T) {
	h, _ := soloHarness(t)
	stranger := NewClient(claims(8, 4), false, "id", 16)
	if err := h.hub.Join(stranger, h.pin); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stranger joined solo room: %v", err)
	}
	if _, ok := h.hub.RoomPhase(h.pin); ok {
		t.Fatal("solo room visible to PIN lookup")
	}
	if _, ok := h.hub.Spectate(h.pin, "id", time.Now()); ok {
		t.Fatal("solo room visible to spectators")
	}
	if pin, phase, host, ok := h.hub.Presence(7); !ok || pin != h.pin || phase != PhaseLobby || host {
		t.Fatalf("presence %q %q %v %v", pin, phase, host, ok)
	}
	// A classroom player never lands in a solo room.
	mate := NewClient(classClaims(9, 3), false, "id", 16)
	if err := h.hub.EnterClassroom(mate, time.Now()); err != nil {
		t.Fatal(err)
	}
	if classPin(t, h.hub, 9) == h.pin {
		t.Fatal("classroom player seated in a solo room")
	}
	again := NewClient(claims(7, 4), false, "id", 16)
	if !h.hub.Resume(again) || lastState(again)["solo"] != true {
		t.Fatal("solo owner could not resume")
	}
}

func TestSoloGameEndsWhenPlayerFallsWithoutWinBonus(t *testing.T) {
	h, c := soloHarness(t)
	if err := h.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	after := h.play(0, true)
	for i := 0; i < Lives; i++ {
		after = h.play(after, false)
	}
	h.waitFor("game over", func(r *Room) bool { return r.phase == PhaseOver })
	earned := h.inspect(func(r *Room) any { return r.byID[7].earned }).(int)
	if earned <= 0 {
		t.Fatalf("earned = %d", earned)
	}
	var you Message
	for _, m := range drain(c) {
		if m["t"] == "podium_result" {
			you = m["you"].(Message)
		}
	}
	if you == nil || you["won"] != false || you["points"] != Award(earned, false) {
		t.Fatalf("solo result %v (want no win bonus)", you)
	}
	res := h.hub.TakeResults()
	if len(res) != 1 || res[0].Match.Mode != record.ModeSolo || res[0].Points != Award(earned, false) || !res[0].Match.Finished {
		t.Fatalf("solo results %+v", res)
	}
	if err := h.hub.Start(c); err != nil {
		t.Fatalf("play again: %v", err)
	}
}

func TestSoloLeaveClosesRoom(t *testing.T) {
	h, c := soloHarness(t)
	if err := h.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	q := h.waitQuestion(0)
	_ = h.hub.Answer(c, q.id, q.answer, time.Now())
	h.waitQuestion(q.number)
	drain(c)
	if err := h.hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	if st := lastState(c); st["phase"] != "NONE" {
		t.Fatalf("after leave %v", st)
	}
	if rooms, players := h.hub.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("after leave: %d rooms %d players", rooms, players)
	}
	if _, _, _, ok := h.hub.Presence(7); ok {
		t.Fatal("solo room still present after leave")
	}
	res := h.hub.TakeResults()
	if len(res) != 1 || res[0].Match.Finished || res[0].Match.Mode != record.ModeSolo {
		t.Fatalf("abandoned solo results %+v", res)
	}
}
