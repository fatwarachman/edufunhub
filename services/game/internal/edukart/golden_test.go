package edukart

import (
	"encoding/json"
	"flag"
	"math"
	"os"
	"testing"
)

var updateGolden = flag.Bool("update", false, "rewrite testdata/physics_golden.json")

// goldenInput is the scripted input of the parity trace (same formula in
// resources/js/lib/edu-kart/physics.test.mjs reads it from the file).
func goldenInput(i int) Input {
	return Input{
		Seq:      i,
		Steer:    math.Round(math.Sin(float64(i)/23)*100) / 100,
		Throttle: []float64{1, 1, 1, 0, -1, 1}[(i/90)%6],
		Drift:    (i/120)%3 == 1,
		Hop:      i / 120,
		Turbo:    i / 45,
	}
}

type goldenFrame struct {
	In   Input `json:"in"`
	Kart Kart  `json:"kart"`
}

// TestGoldenTrace pins the physics; the TS port replays the same file and
// must match, so client prediction equals the referee.
func TestGoldenTrace(t *testing.T) {
	out := map[string][]goldenFrame{}
	for _, id := range TrackIDs {
		tr := TrackByID(id)
		veh := VehicleByID("drifter")
		k := &Kart{}
		frames := []goldenFrame{}
		for i := 0; i < 900; i++ {
			in := goldenInput(i)
			Step(k, in, veh, tr, Dt)
			if i%15 == 14 {
				frames = append(frames, goldenFrame{In: in, Kart: *k})
			}
		}
		out[id] = frames
	}
	path := "testdata/physics_golden.json"
	if *updateGolden {
		raw, _ := json.Marshal(out)
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("golden missing, run go test -run TestGoldenTrace -update: %v", err)
	}
	var want map[string][]goldenFrame
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	for id, frames := range out {
		for i, f := range frames {
			w := want[id][i].Kart
			if math.Abs(w.P-f.Kart.P) > 1e-6 || math.Abs(w.D-f.Kart.D) > 1e-6 || math.Abs(w.V-f.Kart.V) > 1e-6 {
				t.Fatalf("%s frame %d drifted from golden: %+v vs %+v", id, i, f.Kart, w)
			}
		}
	}
}
