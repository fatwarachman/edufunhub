package edukart

import "math"

// Autopilot steers a kart along the road towards lateral offset target
// with full throttle. Bots and finished karts use it; it mirrors the test
// helper in physics_test.go.
func Autopilot(k *Kart, t *Track, target float64) Input {
	look := k.P + 12
	want := t.Curvature(look) * 6
	steer := clamp(want*2-(k.D-target)*0.18-k.Psi*1.6, -1, 1)
	if math.IsNaN(steer) {
		steer = 0
	}
	return Input{Steer: steer, Throttle: 1}
}
