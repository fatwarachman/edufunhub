package edukart

import (
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"strconv"

	"edufunhub/game/internal/questions"
)

// Race tuning. The referee runs 3 physics steps (Dt) per 50 ms tick.
const (
	// TickMs is the referee tick (20 Hz frames).
	TickMs = 50
	// StepsPerTick physics steps run per tick (3 x 1/60 s = 50 ms).
	StepsPerTick = 3
	// CountdownMs is the time before GO.
	CountdownMs = 3000
	// StartBoostMs is the window before GO in which pressing gas pays a start boost.
	StartBoostMs = 400
	// GatesPerLap is the number of question gates per lap.
	GatesPerLap = 3
	// ZoneLength is the reading zone before every gate (m).
	ZoneLength = 120.0
	// RevealAhead shows the question this far before the zone starts (m).
	RevealAhead = 40.0
	// ZoneSpeed caps the speed inside a question zone (m/s).
	ZoneSpeed = 18.0
	// FinishGraceMs is how long the race goes on after the first human finished.
	FinishGraceMs = 30_000
	// RaceLimitMs is the longest race.
	RaceLimitMs = 10 * 60 * 1000
	// MaxHazards is the most crates lying on the track per room.
	MaxHazards = 24
	// TNTFuseMs is how long a TNT crate rides on a head before it blows.
	TNTFuseMs = 3000
	// TNTShakeHops is how many hops shake a TNT off.
	TNTShakeHops = 4
)

// Item kinds.
const (
	ItemRocket = "rocket"
	ItemTNT    = "tnt"
	ItemNOS    = "nos"
	ItemShield = "shield"
)

// ItemKinds in protocol order.
var ItemKinds = []string{ItemRocket, ItemTNT, ItemNOS, ItemShield}

// Race statuses.
const (
	StatusCountdown = "countdown"
	StatusRacing    = "racing"
	StatusDone      = "done"
)

// botColors give bots a stable paint per bot number.
var botColors = []string{"#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"}

// gateQ is one racer's question for one gate.
type gateQ struct {
	k        int // gate number in the race (lap-1)*3 + gate
	id       string
	at, zone float64
	tf       bool
	lanes    int
	q        questions.Question // humans only
	// botLane is the lane a bot steers to (bots only).
	botLane int
}

// racer is one kart in a race (human or bot).
type racer struct {
	idx       int
	seat      int // room seat, -1 for bots
	uid       int64
	botNo     int
	name      string
	color     string
	character []byte
	veh       Vehicle
	kart      Kart
	fx        int // Fx flags of every step of the current tick

	in       Input
	seq      int
	rateFrom int64 // unix ms of the rate window
	rateN    int
	gasSince int64 // race ms of the current gas press during the countdown (1 = none)

	lastFire int
	item     string
	shield   float64 // seconds left
	tnt      float64 // seconds left
	tntBy    int
	tntHops  int

	finishMs int64
	finished bool
	order    int // finish order (1 = first across the line)
	rank     int
	left     bool
	lap      int

	gen     *questions.Generator
	nextK   int
	q       *gateQ
	taken   map[int]int // fruit index -> lap key it was taken on
	correct int
	wrong   int
	earned  int
	answers []questions.Answer

	skill  float64 // bots: chance to answer right
	offset float64 // bots: preferred lateral line
}

// projectile is a flying rocket.
type projectile struct {
	id       int
	owner    int
	p, d     float64
	juiced   bool
	target   int
	traveled float64
}

// hazard is a crate on the track.
type hazard struct {
	id     int
	kind   string // tnt | nitro
	owner  int
	p, d   float64
	armAt  int64 // the owner is safe until this race ms
	placed int64
}

// event is one race event; private adds owner-only fields at frame time.
type event struct {
	msg     Message
	owner   int
	private func(locale string) Message
}

// race is the authoritative simulation of one room's race.
type race struct {
	track      *Track
	laps       int
	racers     []*racer
	ms         int64
	status     string
	stopped    bool
	firstHuman int64 // ms of the first human finish, -1 = none
	finishers  int
	projs      []*projectile
	hazards    []*hazard
	events     []event
	rng        *rand.Rand
	nextID     *int
	level      int
}

// gateAt returns the unwrapped box row position and kind of gate k.
func (rc *race) gateAt(k int) (at float64, lap, gate int) {
	lap, gate = k/GatesPerLap+1, k%GatesPerLap
	return float64(lap-1)*rc.track.Length + rc.track.Gates[gate], lap, gate
}

func (rc *race) totalGates() int { return rc.laps * min(GatesPerLap, len(rc.track.Gates)) }

func (rc *race) emit(msg Message) { rc.events = append(rc.events, event{msg: msg, owner: -1}) }

func (rc *race) newID() int {
	*rc.nextID++
	return *rc.nextID
}

// lapOf is the 1-based lap shown for progress p.
func (rc *race) lapOf(p float64) int {
	if p < 0 {
		return 1
	}
	return min(rc.laps, int(math.Floor(p/rc.track.Length))+1)
}

// lapKey is the loop index used for once-per-lap fruit pickups.
func (rc *race) lapKey(p float64) int { return int(math.Floor(p / rc.track.Length)) }

// active reports whether a racer still takes part (not left, not finished).
func (rc *race) active(r *racer) bool { return !r.left && !r.finished }

// tick advances the race by one referee tick (3 physics steps).
func (rc *race) tick() {
	if rc.status == StatusDone {
		return
	}
	rc.ms += TickMs
	if rc.status == StatusCountdown {
		if rc.ms < 0 {
			return
		}
		rc.ms = 0
		rc.status = StatusRacing
		for _, r := range rc.racers {
			// Presses made during the countdown are consumed, not replayed.
			r.kart.LastHop, r.kart.LastTurbo, r.lastFire = r.in.Hop, r.in.Turbo, r.in.Fire
			boost := false
			if r.seat >= 0 {
				boost = r.gasSince <= 0 && r.gasSince >= -StartBoostMs && r.in.Throttle > 0
			} else {
				boost = rc.rng.IntN(5) < 2
			}
			if boost {
				r.kart.Boost, r.kart.BoostPow = 1, 7
				rc.emit(Message{"k": "start_boost", "racer": r.idx})
			}
		}
	}
	for _, r := range rc.racers {
		r.fx = 0
		if r.seat >= 0 && r.in.Fire > r.lastFire {
			r.lastFire = r.in.Fire
			rc.fire(r)
		}
	}
	for s := 0; s < StepsPerTick; s++ {
		rc.step()
	}
	rc.rank()
}

// step runs one physics step for the whole race.
func (rc *race) step() {
	t := rc.track
	for _, r := range rc.racers {
		if r.left {
			continue
		}
		in := rc.inputFor(r)
		rc.zoneCap(r)
		prev := r.kart.P
		Step(&r.kart, in, r.veh, t, Dt)
		r.fx |= r.kart.Fx
		rc.timers(r)
		if r.finished {
			continue
		}
		rc.fruit(r, prev)
		rc.gates(r)
		rc.laps1(r)
	}
	rc.moveRockets()
	rc.touchHazards()
	rc.bump()
}

// inputFor returns the controls applied this step.
func (rc *race) inputFor(r *racer) Input {
	if r.finished {
		in := Autopilot(&r.kart, rc.track, 0)
		in.Throttle = 0.7
		in.Hop, in.Turbo = r.kart.LastHop, r.kart.LastTurbo
		return in
	}
	if r.seat >= 0 {
		return r.in
	}
	return rc.botInput(r)
}

// zoneCap sets the question zone speed limit.
func (rc *race) zoneCap(r *racer) {
	r.kart.ZoneCap = 0
	if r.finished || r.q == nil {
		return
	}
	if r.kart.P >= r.q.zone && r.kart.P < r.q.at {
		r.kart.ZoneCap = ZoneSpeed
	}
}

// timers advances shield and TNT timers.
func (rc *race) timers(r *racer) {
	if r.shield > 0 {
		r.shield = math.Max(0, r.shield-Dt)
	}
	if r.tnt > 0 {
		if r.kart.Hops-r.tntHops >= TNTShakeHops {
			r.tnt = 0
			rc.emit(Message{"k": "tnt_off", "racer": r.idx})
			return
		}
		r.tnt -= Dt
		if r.tnt <= 0 {
			r.tnt = 0
			rc.emit(Message{"k": "boom", "racer": r.idx, "p": r.kart.P, "d": r.kart.D})
			rc.hit(r, r.tntBy, "tnt")
		}
	}
}

// fruit collects stars crossed this step.
func (rc *race) fruit(r *racer, prev float64) {
	if r.kart.Y >= 1.2 {
		return
	}
	key := rc.lapKey(r.kart.P)
	for i, f := range rc.track.Fruits {
		if !rc.track.Crossed(prev, r.kart.P, f.S) || math.Abs(r.kart.D-f.Lateral) >= 1.6 {
			continue
		}
		if k, ok := r.taken[i]; ok && k == key {
			continue
		}
		r.taken[i] = key
		r.kart.Fruit = min(MaxFruit, r.kart.Fruit+1)
	}
}

// gates draws, caps and judges the racer's question gates.
func (rc *race) gates(r *racer) {
	if r.nextK >= rc.totalGates() {
		return
	}
	if r.q == nil {
		at, _, _ := rc.gateAt(r.nextK)
		if r.kart.P >= at-ZoneLength-RevealAhead {
			rc.draw(r)
		}
	}
	if r.q != nil && r.kart.P >= r.q.at {
		rc.judge(r)
	}
}

// draw gives the racer its own question for the next gate.
func (rc *race) draw(r *racer) {
	k := r.nextK
	at, lap, gate := rc.gateAt(k)
	g := &gateQ{k: k, id: fmt.Sprintf("%d-%d", lap, gate), at: at, zone: at - ZoneLength, tf: k%2 == 0}
	if r.seat >= 0 {
		if g.tf {
			g.q = r.gen.TrueFalse()
			g.lanes = 2
		} else {
			g.q = r.gen.Present(r.gen.Choice(), 4)
			g.lanes = max(1, len(g.q.Options))
		}
	} else {
		g.lanes = 4
		if g.tf {
			g.lanes = 2
		}
		right := rc.botRight(g)
		g.botLane = right
		if rc.rng.Float64() >= r.skill && g.lanes > 1 {
			g.botLane = (right + 1 + rc.rng.IntN(g.lanes-1)) % g.lanes
		}
	}
	r.q = g
}

// botRight is the lane a bot treats as correct (bots have no real question).
func (rc *race) botRight(g *gateQ) int { return (g.k * 7) % g.lanes }

// rightLane is the box holding the correct answer.
func rightLane(g *gateQ) int {
	if g.tf {
		if g.q.Answer == 1 {
			return 0
		}
		return 1
	}
	return g.q.Answer
}

// judge resolves the gate the racer just drove through.
func (rc *race) judge(r *racer) {
	g := r.q
	r.q = nil
	r.nextK++
	lane := rc.track.LaneAt(g.lanes, r.kart.D)
	var correct bool
	if r.seat >= 0 {
		correct = lane >= 0 && lane == rightLane(g)
		if g.q.FromBank {
			var choice *int
			if lane >= 0 {
				if g.tf {
					choice = g.q.TruthPick(lane == 0)
				} else {
					choice = g.q.Original(lane)
				}
			}
			r.answers = append(r.answers, questions.Answer{Key: g.q.Key, Correct: correct, Choice: choice})
		}
	} else {
		correct = lane >= 0 && lane == rc.botRight(g)
	}
	item := ""
	if correct {
		r.correct++
		if r.seat >= 0 {
			r.earned += g.q.Worth()
		}
		r.kart.Fruit = min(MaxFruit, r.kart.Fruit+2)
		r.kart.Boost = math.Max(r.kart.Boost, 1)
		r.kart.BoostPow = math.Max(r.kart.BoostPow, 6)
		if r.item == "" {
			r.item = rc.drawItem(r)
			item = r.item
		}
	} else {
		// Missing the boxes (off the road) counts as wrong without a penalty.
		r.wrong++
		if lane >= 0 {
			r.kart.Fruit = max(0, r.kart.Fruit-3)
			r.kart.Stun = math.Max(r.kart.Stun, 0.8)
		}
	}
	ev := event{msg: Message{"k": "answer", "racer": r.idx, "gate": g.id, "correct": correct, "choice": lane, "item": item}, owner: r.idx}
	if r.seat >= 0 {
		q := g.q
		tf := g.tf
		ev.private = func(locale string) Message {
			answer := ""
			switch {
			case tf:
				answer = strconv.FormatBool(q.Answer == 1)
			case q.Answer >= 0 && q.Answer < len(q.Options):
				answer = q.Options[q.Answer].Get(locale)
			}
			return Message{"answer": answer, "hint": q.Hint.Get(locale)}
		}
	}
	rc.events = append(rc.events, ev)
}

// drawItem picks a weapon weighted by position: leaders get defence, the
// back of the field gets rockets and NOS.
func (rc *race) drawItem(r *racer) string {
	n := len(rc.racers)
	f := 0.0
	if n > 1 && r.rank > 0 {
		f = float64(r.rank-1) / float64(n-1)
	}
	weights := []float64{1 + 4*f, 3 - 2*f, 1 + 3*f, 3 - 2*f} // rocket, tnt, nos, shield
	sum := 0.0
	for _, w := range weights {
		sum += w
	}
	x := rc.rng.Float64() * sum
	for i, w := range weights {
		if x < w {
			return ItemKinds[i]
		}
		x -= w
	}
	return ItemShield
}

// laps1 counts laps and the finish.
func (rc *race) laps1(r *racer) {
	lap := rc.lapOf(r.kart.P)
	if lap > r.lap {
		r.lap = lap
		if lap > 1 {
			rc.emit(Message{"k": "lap", "racer": r.idx, "lap": lap})
		}
	}
	if r.kart.P >= float64(rc.laps)*rc.track.Length {
		r.finished = true
		r.finishMs = max(1, rc.ms)
		rc.finishers++
		r.order = rc.finishers
		r.rank = rc.finishers
		r.q = nil
		r.kart.ZoneCap = 0
		r.tnt = 0
		if r.seat >= 0 && rc.firstHuman < 0 {
			rc.firstHuman = rc.ms
		}
		rc.emit(Message{"k": "finish", "racer": r.idx, "rank": r.rank, "ms": r.finishMs})
	}
}

// fire uses the racer's item.
func (rc *race) fire(r *racer) {
	if r.item == "" || !rc.active(r) || rc.status != StatusRacing {
		return
	}
	item := r.item
	r.item = ""
	juiced := r.kart.Fruit >= MaxFruit
	rc.emit(Message{"k": "fire", "racer": r.idx, "item": item})
	switch item {
	case ItemRocket:
		rc.projs = append(rc.projs, &projectile{id: rc.newID(), owner: r.idx, p: r.kart.P + 2, d: r.kart.D, juiced: juiced, target: rc.rocketTarget(r)})
	case ItemTNT:
		kind := "tnt"
		if juiced {
			kind = "nitro"
		}
		rc.hazards = append(rc.hazards, &hazard{id: rc.newID(), kind: kind, owner: r.idx, p: r.kart.P - 4, d: r.kart.D, armAt: rc.ms + 2000, placed: rc.ms})
		if len(rc.hazards) > MaxHazards {
			rc.hazards = append([]*hazard{}, rc.hazards[len(rc.hazards)-MaxHazards:]...)
		}
	case ItemNOS:
		dur := 2.5
		if juiced {
			dur = 3.5
		}
		r.kart.Boost = math.Max(r.kart.Boost, dur)
		r.kart.BoostPow = math.Max(r.kart.BoostPow, 9)
	case ItemShield:
		r.shield = 5
		if juiced {
			r.shield = 8
		}
	}
}

// rocketTarget is the nearest active racer ahead within 300 m (-1 = none).
func (rc *race) rocketTarget(r *racer) int {
	best, bestGap := -1, 300.0
	for _, o := range rc.racers {
		if o == r || !rc.active(o) {
			continue
		}
		gap := o.kart.P - r.kart.P
		if gap > 0 && gap <= bestGap {
			best, bestGap = o.idx, gap
		}
	}
	return best
}

// moveRockets flies, homes and detonates rockets.
func (rc *race) moveRockets() {
	kept := rc.projs[:0]
	for _, pr := range rc.projs {
		speed := 40.0
		if pr.juiced {
			speed = 52
		}
		if pr.target >= 0 && !rc.active(rc.racers[pr.target]) {
			pr.target = -1
		}
		dist := speed * Dt
		pr.p += dist
		pr.traveled += dist
		if pr.target >= 0 {
			td := rc.racers[pr.target].kart.D
			pr.d += clamp(td-pr.d, -12*Dt, 12*Dt)
		}
		hit := -1
		for _, o := range rc.racers {
			if o.idx == pr.owner || !rc.active(o) || o.kart.Y > 2.5 {
				continue
			}
			if math.Abs(rc.track.Ahead(pr.p, o.kart.P)) < 1.5 && math.Abs(o.kart.D-pr.d) < 1.6 {
				hit = o.idx
				break
			}
		}
		if hit >= 0 {
			v := rc.racers[hit]
			rc.emit(Message{"k": "boom", "racer": hit, "p": pr.p, "d": pr.d})
			rc.hit(v, pr.owner, "rocket")
			continue
		}
		limit := 250.0
		if pr.target >= 0 {
			limit = 450
		}
		if pr.traveled < limit {
			kept = append(kept, pr)
		}
	}
	rc.projs = kept
}

// touchHazards checks racers driving into crates.
func (rc *race) touchHazards() {
	kept := rc.hazards[:0]
	for _, hz := range rc.hazards {
		used := false
		for _, o := range rc.racers {
			if !rc.active(o) || o.kart.Y >= 1.0 || (o.idx == hz.owner && rc.ms < hz.armAt) {
				continue
			}
			if math.Abs(rc.track.Ahead(hz.p, o.kart.P)) >= 1.2 || math.Abs(o.kart.D-hz.d) >= 1.4 {
				continue
			}
			used = true
			if hz.kind == "nitro" {
				rc.emit(Message{"k": "boom", "racer": o.idx, "p": hz.p, "d": hz.d})
				rc.hit(o, hz.owner, "nitro")
				break
			}
			if o.shield > 0 {
				o.shield = 0
				rc.emit(Message{"k": "hit", "racer": o.idx, "by": hz.owner, "cause": "tnt", "blocked": true})
				break
			}
			if o.tnt <= 0 {
				o.tnt = TNTFuseMs / 1000.0
				o.tntBy = hz.owner
				o.tntHops = o.kart.Hops
				rc.emit(Message{"k": "tnt_on", "racer": o.idx})
			}
			break
		}
		if !used {
			kept = append(kept, hz)
		}
	}
	rc.hazards = kept
}

// hit applies an attack (a shield blocks it once).
func (rc *race) hit(v *racer, by int, cause string) {
	if v.shield > 0 {
		v.shield = 0
		rc.emit(Message{"k": "hit", "racer": v.idx, "by": by, "cause": cause, "blocked": true})
		return
	}
	v.kart.Stun = math.Max(v.kart.Stun, 1.6)
	v.kart.Fruit = max(0, v.kart.Fruit-3)
	v.kart.V *= 0.4
	rc.emit(Message{"k": "hit", "racer": v.idx, "by": by, "cause": cause, "blocked": false})
}

// bump pushes grounded karts that overlap apart sideways.
func (rc *race) bump() {
	limit := rc.track.HalfWidth + WallMargin
	for i, a := range rc.racers {
		if a.left || a.kart.Y > 0 {
			continue
		}
		for _, b := range rc.racers[i+1:] {
			if b.left || b.kart.Y > 0 {
				continue
			}
			if math.Abs(rc.track.Ahead(a.kart.P, b.kart.P)) >= 1.6 {
				continue
			}
			dd := b.kart.D - a.kart.D
			if math.Abs(dd) >= 1.4 {
				continue
			}
			push := (1.4 - math.Abs(dd)) / 2
			side := 1.0
			if dd < 0 {
				side = -1
			}
			a.kart.D = clamp(a.kart.D-side*push, -limit, limit)
			b.kart.D = clamp(b.kart.D+side*push, -limit, limit)
		}
	}
}

// bestHuman is the progress of the leading active human (ok=false when none).
func (rc *race) bestHuman() (float64, bool) {
	best, ok := 0.0, false
	for _, r := range rc.racers {
		if r.seat >= 0 && !r.left && (!ok || r.kart.P > best) {
			best, ok = r.kart.P, true
		}
	}
	return best, ok
}

// botInput drives a bot: autopilot to its lane, light rubber band, items.
func (rc *race) botInput(r *racer) Input {
	target := r.offset
	if r.q != nil && r.kart.P >= r.q.zone-30 {
		lanes, _ := rc.track.AnswerLanes(r.q.lanes)
		target = lanes[r.q.botLane]
	}
	in := Autopilot(&r.kart, rc.track, target)
	in.Hop, in.Turbo = r.kart.LastHop, r.kart.LastTurbo
	if r.tnt > 0 && rc.rng.IntN(8) == 0 {
		in.Hop = r.kart.LastHop + 1
	}
	if best, ok := rc.bestHuman(); ok {
		switch {
		case r.kart.P-best > 60:
			in.Throttle = 0.85
		case best-r.kart.P > 80 && r.kart.Boost <= 0:
			r.kart.Boost, r.kart.BoostPow = 0.25, 1.5
		}
	}
	if r.item != "" && rc.status == StatusRacing && rc.rng.IntN(60) == 0 {
		if r.item != ItemRocket || rc.rocketTarget(r) >= 0 {
			rc.fire(r)
		}
	}
	return in
}

// standings orders racers: finished by time, then progress, leavers last.
func (rc *race) standings() []int {
	order := make([]int, len(rc.racers))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(x, y int) bool {
		a, b := rc.racers[order[x]], rc.racers[order[y]]
		if a.left != b.left {
			return !a.left
		}
		if a.finished != b.finished {
			return a.finished
		}
		if a.finished {
			return a.order < b.order
		}
		return a.kart.P > b.kart.P
	})
	return order
}

// rank refreshes live positions.
func (rc *race) rank() {
	for pos, i := range rc.standings() {
		rc.racers[i].rank = pos + 1
	}
}
