package portsorter

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
)

var t0 = time.Date(2026, 10, 5, 9, 0, 0, 0, time.UTC)

func newRun(key string) (*Session, time.Time) {
	s := New(auth.Claims{Subject: 7, Name: "Dimas", Grade: 10, Game: GameKey}, "id", t0)
	s.Start(key, t0)
	return s, t0
}

// land returns the earliest legal landing time and the current packet.
func land(s *Session) (time.Time, string, Item) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.roundAt.Add(Fall(s.round)), s.packetID(), s.packet
}

func bins(n int) []Bin {
	out := make([]Bin, n)
	for i := range out {
		out[i] = Bin{Key: string(rune('a' + i)), Name: questions.Text{ID: string(rune('A' + i))}, Color: "#123456"}
	}
	return out
}

func TestBuiltinBankIsValidAndCoversCorePorts(t *testing.T) {
	b := Current()
	if len(b.Sets) < 2 {
		t.Fatalf("builtin bank has %d sets", len(b.Sets))
	}
	basic := b.Pick("ports-basic")
	if len(basic.Bins) != 4 {
		t.Fatalf("basic set bins %d", len(basic.Bins))
	}
	for _, label := range []string{"80", "443", "22", "53", "21", "25", "3306"} {
		if it := basic.lookup(label); it.Level != 0 || it.Hint.ID == "" {
			t.Fatalf("core port %s must be on level 1: %+v", label, it)
		}
	}
	if len(b.Pick("ports-services").Bins) != 6 {
		t.Fatal("services set must use 6 bins")
	}
	if b.Pick("nope").Key != b.Sets[0].Key {
		t.Fatal("unknown key must fall back to the first set")
	}
}

func TestSetValidationRejectsBrokenSets(t *testing.T) {
	valid := func() Set {
		return Set{Key: "k", Title: questions.Text{ID: "T"}, Bins: bins(2), Items: []Item{{Label: "x", Bin: 0}, {Label: "y", Bin: 1}}}
	}
	if err := valid().Validate(); err != nil {
		t.Fatalf("valid set: %v", err)
	}
	cases := map[string]func(s *Set){
		"one bin":         func(s *Set) { s.Bins = bins(1) },
		"seven bins":      func(s *Set) { s.Bins = bins(7) },
		"bad colour":      func(s *Set) { s.Bins[0].Color = "red" },
		"dup bin key":     func(s *Set) { s.Bins[1].Key = s.Bins[0].Key },
		"unknown bin":     func(s *Set) { s.Items[1].Bin = 2 },
		"dup label":       func(s *Set) { s.Items[1].Label = "x" },
		"long label":      func(s *Set) { s.Items[0].Label = "1234567890123" },
		"bad level":       func(s *Set) { s.Items[1].Level = MaxLevel + 1 },
		"level 1 one bin": func(s *Set) { s.Items[1].Level = 2 },
		"no title":        func(s *Set) { s.Title.ID = "" },
	}
	for name, mutate := range cases {
		s := valid()
		mutate(&s)
		if err := s.Validate(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestCustomBankDrivesBinsAndAnswers(t *testing.T) {
	defer Use(nil)
	custom := Set{
		Key: "osi", Title: questions.Text{ID: "Layer OSI"},
		Bins: []Bin{
			{Key: "l1", Name: questions.Text{ID: "L1"}, Color: "#111111"},
			{Key: "l2", Name: questions.Text{ID: "L2"}, Color: "#222222"},
			{Key: "l3", Name: questions.Text{ID: "L3"}, Color: "#333333"},
		},
		Items: []Item{{Label: "Hub", Bin: 0}, {Label: "Switch", Bin: 1}, {Label: "Router", Bin: 2}},
	}
	bank, err := NewBank("v2", []Set{custom})
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	s, _ := newRun("")
	st := s.State(t0)
	if st["set"].(Message)["key"] != "osi" || len(st["bins"].([]Message)) != 3 {
		t.Fatalf("custom set not used: %v", st)
	}
	at, id, p := land(s)
	if _, _, err := s.Land(id, 3, at); err != ErrBin {
		t.Fatalf("bin outside a 3-bin set: %v", err)
	}
	msg, _, err := s.Land(id, p.Bin, at)
	if err != nil || msg["feedback"].(Message)["label"] != p.Label {
		t.Fatalf("custom landing: %v %v", msg, err)
	}
}

func TestStartHidesTheAnswerAndCheatSheet(t *testing.T) {
	s, now := newRun("ports-basic")
	st := s.State(now)
	pk := st["packet"].(Message)
	if st["phase"] != PhaseFalling || st["lives"] != Lives || pk["fall_ms"] != Fall(0).Milliseconds() {
		t.Fatalf("start state %v", st)
	}
	if _, ok := pk["bin"]; ok {
		t.Fatal("answer bin leaked to client")
	}
	if _, ok := st["legend"]; ok {
		t.Fatal("cheat sheet shown while packets fall")
	}
	ready := New(auth.Claims{Subject: 1}, "en", t0).State(t0)
	if len(ready["legend"].([]Message)) != len(Current().Sets[0].Items) || len(ready["sets"].([]Message)) != len(Current().Sets) {
		t.Fatalf("ready state needs the cheat sheet and picker: %v", ready)
	}
}

func TestChooseOnlyBetweenRuns(t *testing.T) {
	s := New(auth.Claims{Subject: 1}, "id", t0)
	if st := s.Choose("ports-services", t0); st["set"].(Message)["key"] != "ports-services" {
		t.Fatalf("choose before run: %v", st["set"])
	}
	s.Start("", t0)
	if st := s.Choose("ports-basic", t0); st["set"].(Message)["key"] != "ports-services" {
		t.Fatal("set changed while packets fall")
	}
}

func TestLandingTooEarlyOrStaleIsRefused(t *testing.T) {
	s, now := newRun("ports-basic")
	at, id, p := land(s)
	if _, _, err := s.Land(id, p.Bin, now.Add(time.Second)); err != ErrTooEarly {
		t.Fatalf("early landing: %v", err)
	}
	if _, _, err := s.Land("old", p.Bin, at); err != ErrPacket {
		t.Fatalf("stale packet: %v", err)
	}
	if _, _, err := s.Land(id, 4, at); err != ErrBin {
		t.Fatalf("bad bin: %v", err)
	}
	if _, _, err := s.Land(id, p.Bin, at.Add(-Tolerance)); err != nil {
		t.Fatalf("landing within tolerance: %v", err)
	}
	if _, _, err := s.Land(id, p.Bin, at.Add(time.Second)); err != ErrPacket {
		t.Fatalf("double landing: %v", err)
	}
}

func TestPerfectRunSpeedsUpAndAwardsMax(t *testing.T) {
	for _, key := range []string{"ports-basic", "ports-services"} {
		s, _ := newRun(key)
		var res *Result
		last := time.Hour
		for r := 0; r < Packets; r++ {
			at, id, p := land(s)
			f := Fall(r)
			if f > last {
				t.Fatalf("round %d fell slower", r)
			}
			last = f
			if p.Level > Level(r) {
				t.Fatalf("%s round %d drew locked item %s", key, r, p.Label)
			}
			_, out, err := s.Land(id, p.Bin, at)
			if err != nil {
				t.Fatalf("%s round %d: %v", key, r, err)
			}
			res = out
		}
		want := points.Defaults.Participation + Packets*points.Defaults.PerCorrect + PointsFinish + PointsFlawless
		if res == nil || res.Correct != Packets || res.Points != want || res.GameKey != GameKey || res.Mission != Mission {
			t.Fatalf("%s result %+v want points %d", key, res, want)
		}
		r := s.State(t0)["result"].(Message)
		if r["passed"] != true || r["best_streak"] != Packets || len(r["missed"].([]Message)) != 0 {
			t.Fatalf("final %v", r)
		}
	}
	if Fall(Packets-1) >= Fall(0) {
		t.Fatal("packets must speed up")
	}
}

func TestWrongBinsCostLivesAndListMissedItems(t *testing.T) {
	s, _ := newRun("ports-basic")
	var res *Result
	var msg Message
	for i := 0; i < Lives; i++ {
		at, id, p := land(s)
		msg, res, _ = s.Land(id, (p.Bin+1)%4, at)
		fb := msg["feedback"].(Message)
		if fb["kind"] != FeedbackWrong || fb["answer"] != p.Bin || fb["label"] != p.Label || fb["hint"] == "" {
			t.Fatalf("feedback %v", fb)
		}
	}
	if res == nil || res.Wrong != Lives || res.Points != points.Defaults.Participation {
		t.Fatalf("result %+v", res)
	}
	r := msg["result"].(Message)
	if r["reason"] != "lives" || len(r["missed"].([]Message)) == 0 {
		t.Fatalf("result %v", r)
	}
	if _, _, err := s.Land("x", 0, t0.Add(time.Hour)); err != ErrPhase {
		t.Fatalf("landing after the end: %v", err)
	}
}

func TestSilentPacketIsDroppedByTick(t *testing.T) {
	s, now := newRun("")
	if msg, _ := s.Tick(now.Add(Fall(0))); msg != nil {
		t.Fatal("tick resolved before the grace period")
	}
	msg, _ := s.Tick(now.Add(Fall(0) + MissGrace))
	if msg == nil || msg["feedback"].(Message)["kind"] != FeedbackMissed || msg["lives"] != Lives-1 {
		t.Fatalf("missed packet: %v", msg)
	}
}

func TestPauseShiftsTheFallClock(t *testing.T) {
	s, now := newRun("")
	at, id, p := land(s)
	s.Pause(now.Add(time.Second))
	if _, _, err := s.Land(id, p.Bin, at); err != ErrPhase {
		t.Fatalf("landing while paused: %v", err)
	}
	s.Resume(now.Add(time.Minute + time.Second))
	if _, _, err := s.Land(id, p.Bin, at); err != ErrTooEarly {
		t.Fatalf("pause must push the landing back: %v", err)
	}
	if _, _, err := s.Land(id, p.Bin, at.Add(time.Minute)); err != nil {
		t.Fatalf("landing after resume: %v", err)
	}
}

func TestPacketsUsuallySpawnAboveAWrongBin(t *testing.T) {
	s, _ := newRun("")
	off := 0
	for i := 0; i < 400; i++ {
		s.nextPacket(t0, 0)
		if s.column != s.packet.Bin {
			off++
		}
	}
	if off < 260 {
		t.Fatalf("only %d/400 packets need moving", off)
	}
}

func TestParseReadsTheLaravelPayload(t *testing.T) {
	body := []byte(`{"version":"abc","sets":[{"key":"k","title":{"id":"Judul","en":"Title"},"description":{"id":"","en":""},
		"bins":[{"key":"a","name":{"id":"A","en":"A"},"color":"#ff0000"},{"key":"b","name":{"id":"B","en":"B"},"color":"#00ff00"}],
		"items":[{"label":"1","hint":{"id":"satu","en":"one"},"bin":0,"level":0},{"label":"2","hint":{"id":"","en":""},"bin":1,"level":0}]}]}`)
	b, err := Parse(body)
	if err != nil || b.Version != "abc" || b.Sets[0].Items[0].Hint.Get("en") != "one" {
		t.Fatalf("parse: %+v %v", b, err)
	}
	if _, err := Parse([]byte(`{"version":"x","sets":[]}`)); err == nil {
		t.Fatal("empty bank accepted")
	}
}

func TestMaxPointsMatchesLaravelCap(t *testing.T) {
	if MaxPoints != 3190 {
		t.Fatalf("MaxPoints %d, StoreGameResultRequest expects 3190", MaxPoints)
	}
}
