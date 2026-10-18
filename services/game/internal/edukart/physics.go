package edukart

import "math"

// Physics constants shared with the client predictor
// (resources/js/lib/edu-kart/physics.ts). Change both together.
const (
	// Dt is the fixed physics step (60 Hz); the server runs 3 steps per tick.
	Dt = 1.0 / 60
	// Gravity for hops and ramp jumps (m/s²).
	Gravity = 22.0
	// WallMargin is the grass shoulder (m) beyond the road edge before the barrier.
	WallMargin = 2.5
	// OffroadTop is the top speed on grass (m/s).
	OffroadTop = 13.0
	// FruitSpeed is the extra top speed per held fruit (m/s).
	FruitSpeed = 0.12
	// MaxFruit is the most fruit a kart holds; at MaxFruit items are "juiced".
	MaxFruit = 10
	// MaxPsi is the most the kart may point away from the road direction.
	MaxPsi = 1.2
	// HopSpeed is the vertical speed of a hop (drift button press).
	HopSpeed = 3.2
	// ChargeTime is how long one turbo meter fill takes while drifting (s).
	ChargeTime = 0.9
	// TurboWindow is the meter value from which a turbo press boosts.
	TurboWindow = 0.7
	// Overheat is the meter value at which the engine backfires.
	Overheat = 1.35
	// DriftSpinOut is how long a single drift may last before a spin out (s).
	DriftSpinOut = 5.0
	// MinDriftSpeed is the slowest speed that keeps a power slide going.
	MinDriftSpeed = 7.0
	// LandingAir is the minimum hang time that pays a landing turbo (s).
	LandingAir = 0.45
	// WallHitSpeed is the sideways speed (m/s) from which touching the
	// barrier counts as a crash; slower contact just scrapes along it.
	WallHitSpeed = 2.0
)

// TurboPower is the extra speed of the 1st, 2nd and 3rd drift turbo (m/s).
var TurboPower = [3]float64{6, 7, 9}

// Vehicle is a selectable kart. Class decides the stats, like CTR's
// balanced / speed / acceleration / turning karts.
type Vehicle struct {
	ID    string  `json:"id"`
	Class string  `json:"class"`
	Top   float64 `json:"top"`
	Accel float64 `json:"accel"`
	Turn  float64 `json:"turn"`
}

// Class stats: top speed (m/s), acceleration (m/s²), turn rate (rad/s).
var classStats = map[string][3]float64{
	"balanced": {26, 13, 1.9},
	"speed":    {27.5, 11, 1.65},
	"accel":    {25, 16, 1.9},
	"turn":     {25, 13, 2.25},
}

// VehicleIDs in menu order.
var VehicleIDs = []string{"classic", "formula", "buggy", "hover", "monster", "bajaj", "drifter", "rocket"}

var vehicleClass = map[string]string{
	"classic": "balanced",
	"formula": "speed",
	"buggy":   "accel",
	"hover":   "turn",
	"monster": "speed",
	"bajaj":   "accel",
	"drifter": "turn",
	"rocket":  "balanced",
}

// VehicleByID returns the vehicle (the classic kart when unknown).
func VehicleByID(id string) Vehicle {
	class, ok := vehicleClass[id]
	if !ok {
		id, class = "classic", "balanced"
	}
	s := classStats[class]
	return Vehicle{ID: id, Class: class, Top: s[0], Accel: s[1], Turn: s[2]}
}

// Input is one player's controls. Counters (Hop, Turbo, Fire) only grow, so
// a lost or merged packet never loses a press.
type Input struct {
	Seq      int     `json:"seq"`
	Steer    float64 `json:"steer"`    // -1 left .. 1 right
	Throttle float64 `json:"throttle"` // -1 brake/reverse .. 1 gas
	Drift    bool    `json:"drift"`    // power slide button held
	Hop      int     `json:"hop"`      // drift button presses
	Turbo    int     `json:"turbo"`    // turbo button presses
	Fire     int     `json:"fire"`     // item button presses
}

// Clean clamps an input from the wire.
func (in Input) Clean() Input {
	in.Steer = clamp(finite(in.Steer), -1, 1)
	in.Throttle = clamp(finite(in.Throttle), -1, 1)
	return in
}

// Kart is the physical state of one racer in track space: P is the
// unwrapped progress along the centreline (m), D the lateral offset (m,
// right positive), Psi the yaw relative to the road (rad, right positive).
type Kart struct {
	P         float64 `json:"p"`
	D         float64 `json:"d"`
	Psi       float64 `json:"psi"`
	V         float64 `json:"v"`
	Y         float64 `json:"y"`
	VY        float64 `json:"vy"`
	Air       float64 `json:"air"`
	Drifting  bool    `json:"drifting"`
	DriftDir  float64 `json:"drift_dir"`
	DriftTime float64 `json:"drift_time"`
	Charge    float64 `json:"charge"`
	Stage     int     `json:"stage"`
	Boost     float64 `json:"boost"`
	BoostPow  float64 `json:"boost_pow"`
	Stun      float64 `json:"stun"`
	Fruit     int     `json:"fruit"`
	// ZoneCap is the speed limit inside a question zone (0 = none). Set by the race.
	ZoneCap float64 `json:"zone_cap"`
	// LastHop / LastTurbo are the input counters already consumed.
	LastHop   int `json:"last_hop"`
	LastTurbo int `json:"last_turbo"`
	// Hops counts hops since the last reset (TNT shake off). Set by the race.
	Hops int `json:"hops"`
	// Fx is a bit set of one-shot effects of the last step (FxTurbo...).
	Fx int `json:"fx"`
}

// One-shot effect flags (Kart.Fx), cleared at the start of every step.
const (
	FxTurbo    = 1 << iota // drift turbo fired
	FxBackfire             // turbo missed / overheated
	FxSpinOut              // drifted too long
	FxWall                 // hit the barrier
	FxLand                 // landing turbo
	FxPad                  // speed pad
	FxJump                 // ramp launch
	FxHop                  // hop
)

func finite(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return v
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func sign(v float64) float64 {
	if v < 0 {
		return -1
	}
	return 1
}

// TopSpeed is the current speed limit of the kart.
func (k *Kart) TopSpeed(veh Vehicle, t *Track) float64 {
	top := veh.Top + FruitSpeed*float64(k.Fruit)
	if k.Y <= 0 && math.Abs(k.D) > t.HalfWidth {
		top = math.Min(top, OffroadTop)
	}
	if k.Boost > 0 {
		top += k.BoostPow
	}
	if k.ZoneCap > 0 {
		cap := k.ZoneCap
		if k.Boost > 0 {
			cap += 4
		}
		top = math.Min(top, cap)
	}
	return top
}

// Step advances the kart by dt seconds. It is deterministic: the client
// replays the same function for prediction.
func Step(k *Kart, in Input, veh Vehicle, t *Track, dt float64) {
	in = in.Clean()
	k.Fx = 0
	hops := in.Hop > k.LastHop
	turbo := in.Turbo > k.LastTurbo
	if in.Hop > k.LastHop {
		k.Hops += in.Hop - k.LastHop
		k.LastHop = in.Hop
	}
	if in.Turbo > k.LastTurbo {
		k.LastTurbo = in.Turbo
	}
	stunned := k.Stun > 0
	if stunned {
		k.Stun = math.Max(0, k.Stun-dt)
		in.Steer, in.Throttle, in.Drift = 0, 0, false
		hops, turbo = false, false
		k.V *= math.Exp(-3 * dt)
	}
	grounded := k.Y <= 0 && k.VY <= 0

	// Hop.
	if hops && grounded {
		k.VY = HopSpeed
		k.Fx |= FxHop
		grounded = false
	}

	// Longitudinal speed.
	top := k.TopSpeed(veh, t)
	if !stunned {
		switch {
		case in.Throttle > 0:
			if k.V < top {
				gain := veh.Accel * in.Throttle
				if k.Boost > 0 {
					gain = math.Max(gain, veh.Accel*2.5)
				}
				k.V = math.Min(top, k.V+gain*dt)
			} else {
				k.V = math.Max(top, k.V-18*dt)
			}
		case in.Throttle < 0:
			if k.V > 0 {
				k.V = math.Max(0, k.V+30*in.Throttle*dt)
			} else {
				k.V = math.Max(-6, k.V+veh.Accel*0.5*in.Throttle*dt)
			}
		default:
			if k.Boost > 0 && k.V < top {
				k.V = math.Min(top, k.V+veh.Accel*2.5*dt)
			} else if k.V > 0 {
				k.V = math.Max(0, k.V-6*dt)
			} else {
				k.V = math.Min(0, k.V+6*dt)
			}
		}
		if k.V > top && in.Throttle <= 0 {
			k.V = math.Max(top, k.V-18*dt)
		}
	}

	// Power slide.
	if k.Drifting && (!in.Drift || k.V < MinDriftSpeed || stunned) {
		k.Drifting = false
		k.Charge, k.Stage, k.DriftTime = 0, 0, 0
	}
	if !k.Drifting && in.Drift && !stunned && math.Abs(in.Steer) > 0.25 && k.V > 9 {
		k.Drifting = true
		k.DriftDir = sign(in.Steer)
		k.DriftTime, k.Charge, k.Stage = 0, 0, 0
	}
	if k.Drifting {
		k.DriftTime += dt
		k.Charge += dt / ChargeTime
		if turbo {
			if k.Charge >= TurboWindow && k.Stage < 3 {
				k.Stage++
				k.Boost = math.Max(k.Boost, 0.9+0.25*float64(k.Stage-1))
				k.BoostPow = math.Max(k.BoostPow, TurboPower[k.Stage-1])
				k.Fx |= FxTurbo
			} else {
				k.Fx |= FxBackfire
			}
			k.Charge = 0
		} else if k.Charge >= Overheat {
			k.Charge = 0
			k.Fx |= FxBackfire
		}
		if k.DriftTime >= DriftSpinOut {
			k.Drifting = false
			k.Charge, k.Stage, k.DriftTime = 0, 0, 0
			k.Stun = 0.9
			k.Fx |= FxSpinOut
		}
	}

	// Yaw.
	grip := clamp(math.Abs(k.V)/6, 0, 1)
	var yaw float64
	if k.Drifting {
		yaw = k.DriftDir * veh.Turn * (1 + 0.45*in.Steer*k.DriftDir)
	} else {
		dir := 1.0
		if k.V < 0 {
			dir = -1
		}
		yaw = in.Steer * veh.Turn * grip * dir
		yaw -= k.Psi * 1.2 * (1 - math.Abs(in.Steer)) * grip
	}
	kappa := t.Curvature(k.P)
	den := math.Max(0.3, 1-kappa*k.D)
	dp := k.V * math.Cos(k.Psi) / den
	k.Psi = clamp(k.Psi+(yaw-kappa*dp)*dt, -MaxPsi, MaxPsi)

	// Move.
	prev := k.P
	k.D += k.V * math.Sin(k.Psi) * dt
	k.P += dp * dt

	// Barrier: a real hit (driving into it) bounces and slows; scraping
	// along it (road curvature pushing the kart out) only aligns the kart
	// with the road, so the kart can never get pinned at a crawl.
	limit := t.HalfWidth + WallMargin
	if math.Abs(k.D) > limit {
		side := sign(k.D)
		k.D = side * limit
		if k.Psi*side > 0 {
			if math.Abs(k.V*math.Sin(k.Psi)) > WallHitSpeed {
				k.Psi = -k.Psi * 0.3
				k.V *= 0.7
				k.Fx |= FxWall
				if k.Drifting {
					k.Drifting = false
					k.Charge, k.Stage, k.DriftTime = 0, 0, 0
				}
			} else {
				k.Psi = -side * 0.02
			}
		}
	}

	// Ramps and speed pads (ground only).
	if k.Y <= 0 && k.VY <= 0 {
		for _, r := range t.Ramps {
			if k.V > 8 && crossed(t, prev, k.P, r.S) {
				k.VY = Gravity * r.Air / 2
				k.Fx |= FxJump
			}
		}
		s := t.Wrap(k.P)
		for _, pad := range t.Pads {
			if t.Wrap(s-pad.S) < pad.Len && math.Abs(k.D-pad.Lateral) < pad.Width/2 {
				if k.Boost < 1 {
					k.Fx |= FxPad
				}
				k.Boost = math.Max(k.Boost, 1)
				k.BoostPow = math.Max(k.BoostPow, 8)
			}
		}
	}

	// Vertical.
	if k.Y > 0 || k.VY > 0 {
		k.VY -= Gravity * dt
		k.Y += k.VY * dt
		k.Air += dt
		if k.Y <= 0 {
			k.Y, k.VY = 0, 0
			if k.Air >= LandingAir && !stunned {
				k.Boost = math.Max(k.Boost, 0.4+0.6*k.Air)
				k.BoostPow = math.Max(k.BoostPow, 6)
				k.Fx |= FxLand
			}
			k.Air = 0
		}
	}

	// Boost timer.
	if k.Boost > 0 {
		k.Boost -= dt
		if k.Boost <= 0 {
			k.Boost, k.BoostPow = 0, 0
		}
	}
}

// crossed reports whether moving forward from a to b (unwrapped) passed the
// track position s.
func crossed(t *Track, a, b, s float64) bool {
	if b <= a {
		return false
	}
	ahead := t.Wrap(s - a)
	return ahead > 0 && ahead <= b-a
}

// Crossed is the exported form used by the race (gates, zones, fruit).
func (t *Track) Crossed(a, b, s float64) bool { return crossed(t, a, b, s) }
