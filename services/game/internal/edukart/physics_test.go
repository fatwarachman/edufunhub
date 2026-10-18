package edukart

import (
	"math"
	"testing"
)

// autopilot steers a kart along the centre line (used by tests and bots).
func autopilot(k *Kart, t *Track, target float64) Input {
	look := k.P + 12
	want := t.Curvature(look) * 6
	steer := clamp(want*2-(k.D-target)*0.18-k.Psi*1.6, -1, 1)
	return Input{Steer: steer, Throttle: 1}
}

func TestTracksLoad(t *testing.T) {
	for _, id := range TrackIDs {
		tr := TrackByID(id)
		if tr == nil {
			t.Fatalf("%s missing", id)
		}
		if tr.Length < 1000 || tr.Length > 2000 {
			t.Errorf("%s length %.0f", id, tr.Length)
		}
		if len(tr.Gates) != 3 {
			t.Errorf("%s gates %v", id, tr.Gates)
		}
		x, _, z := tr.World(0, 0)
		x2, _, z2 := tr.World(tr.Length, 0)
		if math.Hypot(x-x2, z-z2) > 0.01 {
			t.Errorf("%s not closed", id)
		}
	}
}

func TestAutopilotLapsEveryTrack(t *testing.T) {
	for _, id := range TrackIDs {
		tr := TrackByID(id)
		veh := VehicleByID("classic")
		k := &Kart{}
		walls := 0
		steps := 0
		for k.P < tr.Length && steps < 60*200 {
			Step(k, autopilot(k, tr, 0), veh, tr, Dt)
			if k.Fx&FxWall != 0 {
				walls++
			}
			steps++
		}
		secs := float64(steps) * Dt
		if k.P < tr.Length {
			t.Fatalf("%s: autopilot stuck at %.0f/%.0f", id, k.P, tr.Length)
		}
		if walls > 0 {
			t.Errorf("%s: autopilot hit the wall %d times", id, walls)
		}
		t.Logf("%s: lap %.1fs (%.0fm), max |d| ok", id, secs, tr.Length)
		if secs > 110 {
			t.Errorf("%s lap too slow: %.1fs", id, secs)
		}
	}
}

func TestDriftTurbo(t *testing.T) {
	tr := TrackByID("forest")
	veh := VehicleByID("classic")
	k := &Kart{V: 20, D: -8}
	in := Input{Steer: 1, Throttle: 1, Drift: true, Hop: 1}
	for i := 0; i < 42; i++ { // 0.7 s of drifting: charge ~0.78, inside the window
		Step(k, in, veh, tr, Dt)
	}
	if !k.Drifting {
		t.Fatalf("not drifting: %+v", k)
	}
	in.Turbo = 1
	Step(k, in, veh, tr, Dt)
	if k.Stage != 1 || k.Boost <= 0 || k.Fx&FxTurbo == 0 {
		t.Fatalf("turbo did not fire: %+v", k)
	}
	// Too early press backfires.
	in.Turbo = 2
	Step(k, in, veh, tr, Dt)
	if k.Fx&FxBackfire == 0 || k.Stage != 1 {
		t.Fatalf("early press should backfire: %+v", k)
	}
}

func TestStepStaysFinite(t *testing.T) {
	tr := TrackByID("mandalika")
	veh := VehicleByID("hover")
	k := &Kart{}
	for i := 0; i < 60*120; i++ {
		in := Input{Steer: math.Sin(float64(i) / 37), Throttle: 1, Drift: i%300 < 120, Hop: i / 300, Turbo: i / 50}
		Step(k, in, veh, tr, Dt)
		for _, v := range []float64{k.P, k.D, k.Psi, k.V, k.Y} {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				t.Fatalf("non finite at %d: %+v", i, k)
			}
		}
		if math.Abs(k.D) > tr.HalfWidth+WallMargin+1e-9 {
			t.Fatalf("left the barrier: %+v", k)
		}
	}
}

func TestBadInputClamped(t *testing.T) {
	in := Input{Steer: math.NaN(), Throttle: math.Inf(1)}.Clean()
	if in.Steer != 0 || in.Throttle != 0 {
		t.Fatalf("clean: %+v", in)
	}
}

// A kart pressed against the barrier on a bend (seen live: pinned at
// 0.5 m/s on the forest track) must drive away with full throttle.
func TestKartNeverPinnedAtBarrier(t *testing.T) {
	for _, id := range TrackIDs {
		tr := TrackByID(id)
		for _, side := range []float64{-1, 1} {
			for s := 0.0; s < tr.Length; s += 37 {
				k := &Kart{P: s, D: side * (tr.HalfWidth + WallMargin), Psi: side * 0.001}
				for i := 0; i < 180; i++ {
					Step(k, Input{Throttle: 1}, VehicleByID("classic"), tr, Dt)
				}
				if k.V < 8 {
					t.Fatalf("%s side %v s=%.0f: pinned at v=%.2f d=%.2f", id, side, s, k.V, k.D)
				}
			}
		}
	}
}
