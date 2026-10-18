package blockbattle

import (
	"errors"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/record"
)

// soloHarness opens a private game for player 7 (no host screen, no PIN).
func soloHarness(t *testing.T, cfg Config) (*harness, *Client) {
	t.Helper()
	h := &harness{t: t, hub: NewHub(cfg, 9)}
	t.Cleanup(h.hub.CloseAll)
	c := NewClient(claims(7, 4), false, "id", cfg.Buffer)
	r, err := h.hub.CreateSolo(c, []byte(`{"color":"red"}`), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	h.pin, h.kids = r.Pin, []*Client{c}
	return h, c
}

func TestSoloCreateConfigureStartPlay(t *testing.T) {
	h, c := soloHarness(t, fastConfig())
	st := lastState(c)
	if st["solo"] != true || st["captain"] != int64(7) || st["min_players"] != 1 || st["mode"] != ModeWords || st["phase"] != PhaseLobby {
		t.Fatalf("solo lobby state %v", st)
	}
	host := NewClient(auth.Claims{Subject: 9000, Name: "T", Grade: 4, Game: HostKey}, true, "id", 64)
	if _, err := h.hub.CreateSolo(host, nil, time.Now()); !errors.Is(err, ErrPlayerOnly) {
		t.Fatalf("host create_solo: %v", err)
	}
	if err := h.hub.Configure(c, ModeBattle, 0, ""); !errors.Is(err, ErrConfig) {
		t.Fatalf("solo BATTLE configure: %v", err)
	}
	// Even if the mode were forced, start refuses BATTLE alone.
	h.inspect(func(r *Room) any { r.mode = ModeBattle; return nil })
	if err := h.hub.Start(c); !errors.Is(err, ErrPlayers) {
		t.Fatalf("solo BATTLE start: %v", err)
	}
	if err := h.hub.Configure(c, ModeWords, 3, ContentWordsID); err != nil {
		t.Fatalf("owner configure: %v", err)
	}
	if err := h.hub.SetSubject(c, "math"); err != nil {
		t.Fatalf("owner subject: %v", err)
	}
	if err := h.hub.Start(c); err != nil {
		t.Fatalf("owner start alone: %v", err)
	}
	h.wait("playing", func(r *Room) bool { return r.phase == PhasePlaying })
	qid, answer := h.question(7, 0)
	if err := h.hub.Answer(c, qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	if got := h.inspect(func(r *Room) any { return r.byID[7].correct }).(int); got != 1 {
		t.Fatalf("correct = %d", got)
	}
	// No rival: attacks find no target.
	if got := h.inspect(func(r *Room) any {
		target, lines := r.attack(r.byID[7], 2, "test", time.Now())
		return target == nil && lines == 0
	}).(bool); !got {
		t.Fatal("solo attack found a target")
	}
}

func TestSoloFortressStarts(t *testing.T) {
	h, c := soloHarness(t, fastConfig())
	if err := h.hub.Configure(c, ModeFortress, 0, ""); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.Start(c); err != nil {
		t.Fatalf("solo fortress start: %v", err)
	}
	h.wait("playing", func(r *Room) bool { return r.phase == PhasePlaying })
}

func TestSoloIsPrivate(t *testing.T) {
	h, _ := soloHarness(t, fastConfig())
	stranger := NewClient(claims(8, 4), false, "id", 64)
	if err := h.hub.Join(stranger, h.pin, nil); !errors.Is(err, ErrNotFound) {
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
	mate := NewClient(classClaims(8, 3), false, "id", 64)
	if err := h.hub.EnterClassroom(mate, time.Now(), nil); err != nil {
		t.Fatal(err)
	}
	if classPin(t, h.hub, 8) == h.pin {
		t.Fatal("classroom entry picked the solo room")
	}
}

func TestSoloFinishNoWinBonusResumeAndPlayAgain(t *testing.T) {
	cfg := fastConfig()
	h, c := soloHarness(t, cfg)
	if err := h.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	h.wait("playing", func(r *Room) bool { return r.phase == PhasePlaying })
	qid, answer := h.question(7, 0)
	if err := h.hub.Answer(c, qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	h.hub.Detach(c)
	again := NewClient(claims(7, 4), false, "id", cfg.Buffer)
	if !h.hub.Resume(again) {
		t.Fatal("solo owner could not resume")
	}
	if st := lastState(again); st["solo"] != true || st["phase"] != PhasePlaying {
		t.Fatalf("resumed state %v", st)
	}
	earned := h.inspect(func(r *Room) any { return r.byID[7].earned }).(int)
	if earned <= 0 {
		t.Fatalf("earned = %d", earned)
	}
	if err := h.hub.End(again); err != nil {
		t.Fatalf("owner end: %v", err)
	}
	res := has(drain(again), "podium_result")
	if res == nil {
		t.Fatal("no podium")
	}
	you := res["you"].(Message)
	if you["won"] != false || you["rank"] != 1 || you["points"] != Award(earned, false) {
		t.Fatalf("solo result %v (want no win bonus)", you)
	}
	results := h.hub.TakeResults()
	if len(results) != 1 || results[0].Match.Mode != record.ModeSolo || results[0].Points != Award(earned, false) {
		t.Fatalf("solo results %+v", results)
	}
	if err := h.hub.Start(again); err != nil {
		t.Fatalf("play again: %v", err)
	}
}

func TestSoloLeaveClosesRoom(t *testing.T) {
	h, c := soloHarness(t, fastConfig())
	if err := h.hub.Start(c); err != nil {
		t.Fatal(err)
	}
	h.wait("playing", func(r *Room) bool { return r.phase == PhasePlaying })
	qid, answer := h.question(7, 0)
	_ = h.hub.Answer(c, qid, answer, time.Now())
	drain(c)
	if err := h.hub.Leave(c); err != nil {
		t.Fatal(err)
	}
	if st := lastState(c); st["phase"] != "NONE" || st["role"] != "player" {
		t.Fatalf("after leave %v", st)
	}
	if _, _, _, ok := h.hub.Presence(7); ok {
		t.Fatal("solo room still present after leave")
	}
	if rooms, players := h.hub.Counts(); rooms != 0 || players != 0 {
		t.Fatalf("rooms %d players %d after leave", rooms, players)
	}
	if res := h.hub.TakeResults(); len(res) != 1 || res[0].Match.Mode != record.ModeSolo {
		t.Fatalf("abandoned solo results %+v", res)
	}
}

func TestNonSoloPlayerCannotRun(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	if err := h.hub.Start(h.kids[0]); !errors.Is(err, ErrHostOnly) {
		t.Fatalf("player start in host room: %v", err)
	}
	if st := lastState(h.kids[1]); st["solo"] != false || st["min_players"] != MinBattle {
		t.Fatalf("host room state %v", st)
	}
}
