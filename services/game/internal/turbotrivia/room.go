package turbotrivia

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

// Kart is one student in a room. Owned by the room goroutine.
type Kart struct {
	Claims auth.Claims
	Avatar json.RawMessage
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	// Progress is the distance driven in laps (0..Laps).
	Progress float64
	speed    float64
	finished bool
	finishAt time.Time

	nitroUntil   time.Time
	stutterUntil time.Time
	spinUntil    time.Time
	staggerUntil time.Time
	shrinkUntil  time.Time
	shieldUntil  time.Time

	Items []string

	// Current question.
	answered bool
	choice   int

	correct  int
	wrong    int
	earned   int
	used     int
	hits     int
	answers  []questions.Answer
	reported bool
	rank     int
}

// ID is the account id.
func (k *Kart) ID() int64 { return k.Claims.Subject }

// Shielded reports whether the shield is up at now.
func (k *Kart) Shielded(now time.Time) bool { return now.Before(k.shieldUntil) }

// Speed is the kart speed in km/h at now: spin-out and missile stagger stop
// the kart, Nitro beats Engine Stutter, Lightning keeps 60% of the speed.
func (k *Kart) Speed(now time.Time) float64 {
	if k.finished || k.left {
		return 0
	}
	if now.Before(k.spinUntil) || now.Before(k.staggerUntil) {
		return 0
	}
	v := BaseSpeed
	switch {
	case now.Before(k.nitroUntil):
		v = NitroSpeed
	case now.Before(k.stutterUntil):
		v = StutterSpeed
	}
	if now.Before(k.shrinkUntil) {
		v *= ShrinkFactor
	}
	return v
}

// Effects lists the active status effects at now.
func (k *Kart) Effects(now time.Time) []string {
	fx := make([]string, 0, 3)
	for _, e := range []struct {
		name  string
		until time.Time
	}{
		{"NITRO", k.nitroUntil}, {"STUTTER", k.stutterUntil}, {"SPIN", k.spinUntil},
		{"STAGGER", k.staggerUntil}, {"SHRINK", k.shrinkUntil}, {"SHIELD", k.shieldUntil},
	} {
		if now.Before(e.until) {
			fx = append(fx, e.name)
		}
	}
	return fx
}

// Banana is a trap on the track at coordinate X (0..1 of a lap).
type Banana struct {
	ID    int64
	X     float64
	Owner int64
	At    time.Time
}

// Missile homes in on the leader and hits at Impact.
type Missile struct {
	ID     int64
	From   int64
	Target int64
	Start  float64 // shooter progress at launch
	Launch time.Time
	Impact time.Time
}

// QuestionState is the question being answered.
type QuestionState struct {
	ID       int64
	Number   int
	Question questions.Question
	Limit    time.Duration
	Start    time.Time
	Deadline time.Time
	Stage    string
	RevealAt time.Time
}

type reply struct {
	err error
	v   any
}

type command struct {
	kind    string
	c       *Client
	qid     int64
	value   int
	item    string
	subject string
	avatar  []byte
	at      time.Time
	fn      func(r *Room) any
	reply   chan reply
}

// Room runs one race in its own goroutine. Only that goroutine touches the
// fields below; other goroutines send commands.
type Room struct {
	hub *Hub
	cfg Config
	Pin string

	host       *Client
	hostClaims auth.Claims
	hostOnline bool

	karts  []*Kart
	byID   map[int64]*Kart
	joined int

	phase      string
	subject    string
	total      int // questions of the race
	lapKm      float64
	grade      int
	gen        *questions.Generator
	rng        *rand.Rand
	nextID     int64
	q          QuestionState
	asked      int
	countUntil time.Time
	started    time.Time
	ended      time.Time
	firstIn    time.Time
	capAt      time.Time
	lastTick   time.Time
	playerAt   time.Time
	seq        int64

	bananas  []Banana
	missiles []Missile
	feed     []Message
	ranking  []*Kart

	dirtyLobby bool
	touched    time.Time
	emptySince time.Time
	closed     bool

	cmds chan command
	done chan struct{}
}

func newRoom(h *Hub, pin string, host *Client, seed uint64, now time.Time) *Room {
	return &Room{
		hub: h, cfg: h.cfg, Pin: pin,
		hostClaims: host.Claims,
		byID:       map[int64]*Kart{},
		phase:      PhaseLobby,
		total:      DefaultQuestions,
		rng:        rand.New(rand.NewPCG(seed, seed^0x7abb0c47)),
		nextID:     int64(seed%1000) * 1000,
		touched:    now,
		cmds:       make(chan command, h.cfg.Commands),
		done:       make(chan struct{}),
	}
}

// run is the room goroutine: commands and the 20 Hz tick, nothing else
// touches state.
func (r *Room) run() {
	defer close(r.done)
	ticker := time.NewTicker(r.cfg.Tick)
	defer ticker.Stop()
	for !r.closed {
		select {
		case cmd := <-r.cmds:
			r.handle(cmd, time.Now())
		case now := <-ticker.C:
			r.tick(now)
		}
	}
}

func (r *Room) handle(cmd command, now time.Time) {
	var res reply
	switch cmd.kind {
	case "attach_host":
		res.err = r.attachHost(cmd.c, now)
	case "attach":
		res.err = r.attach(cmd.c, now)
	case "join":
		res.err = r.join(cmd.c, cmd.avatar, now)
	case "leave":
		res.err = r.leave(cmd.c, now)
	case "detach":
		r.detach(cmd.c, now)
	case "start":
		res.err = r.start(cmd.c, now)
	case "end":
		res.err = r.end(cmd.c, now)
	case "configure":
		res.err = r.configure(cmd.c, cmd.value, now)
	case "subject":
		res.err = r.setSubject(cmd.c, cmd.subject, now)
	case "answer":
		res.err = r.answer(cmd.c, cmd.qid, cmd.value, cmd.at, now)
	case "item":
		res.err = r.useItem(cmd.c, cmd.item, cmd.at)
	case "sync":
		r.sendState(cmd.c, now)
	case "inspect":
		res.v = cmd.fn(r)
	case "close":
		r.close(now, "closed")
	}
	if res.err == nil && cmd.kind != "inspect" && cmd.kind != "sync" {
		r.touched = now
	}
	if cmd.reply != nil {
		cmd.reply <- res
	}
}

// --- membership -----------------------------------------------------------

func (r *Room) attachHost(c *Client, now time.Time) error {
	if c.ID() != r.hostClaims.Subject {
		return ErrNotHost
	}
	if r.host != nil && r.host != c {
		r.host.Close()
	}
	r.host, r.hostOnline, r.hostClaims = c, true, c.Claims
	r.sendState(c, now)
	return nil
}

func (r *Room) attach(c *Client, now time.Time) error {
	k := r.byID[c.ID()]
	if k == nil || k.left {
		return ErrNoRoom
	}
	if k.client != nil && k.client != c {
		k.client.Close()
	}
	k.client, k.online, k.offlineAt = c, true, time.Time{}
	k.Claims.Name = c.Claims.Name
	r.dirtyLobby = r.phase == PhaseLobby
	r.sendState(c, now)
	return nil
}

// avatarOf picks the signed token look, else a client look that is a small
// JSON object. Go never interprets it; it is echoed to every screen.
func avatarOf(claims auth.Claims, sent []byte) json.RawMessage {
	if len(claims.Character) > 0 {
		return claims.Character
	}
	if len(sent) == 0 || len(sent) > auth.MaxCharacterBytes {
		return nil
	}
	var obj map[string]any
	if json.Unmarshal(sent, &obj) != nil || obj == nil {
		return nil
	}
	return append(json.RawMessage(nil), sent...)
}

func (r *Room) join(c *Client, avatar []byte, now time.Time) error {
	if k := r.byID[c.ID()]; k != nil && !k.left {
		return r.attach(c, now)
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		return ErrStarted
	}
	if r.active() >= MaxPlayers {
		return ErrFull
	}
	if old := r.byID[c.ID()]; old != nil {
		r.remove(old)
	}
	r.joined++
	k := &Kart{Claims: c.Claims, Avatar: avatarOf(c.Claims, avatar), client: c, order: r.joined, online: true, choice: -1}
	r.karts = append(r.karts, k)
	r.byID[c.ID()] = k
	r.hub.setPlayer(c.ID(), r)
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) active() int {
	n := 0
	for _, k := range r.karts {
		if !k.left {
			n++
		}
	}
	return n
}

func (r *Room) leave(c *Client, now time.Time) error {
	if c.Host {
		if c.ID() != r.hostClaims.Subject {
			return ErrNotHost
		}
		r.close(now, "host_left")
		return nil
	}
	k := r.byID[c.ID()]
	if k == nil || k.left {
		return ErrNoRoom
	}
	r.hub.dropPlayer(k.ID(), r)
	if r.phase == PhaseLobby || r.phase == PhaseOver {
		r.remove(k)
		r.dirtyLobby = true
	} else {
		k.left, k.online, k.client = true, false, nil
		r.event(now, Message{"kind": "left", "by": r.ref(k)})
		if r.racing() == 0 {
			r.finish(now)
		}
	}
	c.push(Message{"t": "state_sync", "phase": "NONE", "role": "player"})
	return nil
}

func (r *Room) remove(k *Kart) {
	delete(r.byID, k.ID())
	kept := r.karts[:0]
	for _, q := range r.karts {
		if q != k {
			kept = append(kept, q)
		}
	}
	r.karts = kept
}

func (r *Room) detach(c *Client, now time.Time) {
	if c.Host {
		if r.host == c {
			r.host, r.hostOnline = nil, false
		}
		return
	}
	if k := r.byID[c.ID()]; k != nil && k.client == c {
		k.client, k.online, k.offlineAt = nil, false, now
		r.dirtyLobby = r.phase == PhaseLobby
	}
}

func (r *Room) setSubject(c *Client, subject string, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		return ErrPhase
	}
	r.subject = questions.NormSubject(subject)
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) configure(c *Client, n int, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		return ErrPhase
	}
	valid := false
	for _, v := range QuestionCounts {
		valid = valid || v == n
	}
	if !valid {
		return ErrConfig
	}
	r.total = n
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

// --- race flow ------------------------------------------------------------

func (r *Room) start(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		return ErrPhase
	}
	kept := r.karts[:0]
	for _, k := range r.karts {
		if k.left || !k.online {
			delete(r.byID, k.ID())
			if !k.left {
				r.hub.dropPlayer(k.ID(), r)
			}
			continue
		}
		kept = append(kept, k)
	}
	r.karts = kept
	if len(r.karts) < MinPlayers {
		return ErrPlayers
	}
	grade, level := r.karts[0].Claims.Grade, points.Level(r.karts[0].Claims.Level)
	ids := make([]int64, 0, len(r.karts))
	for _, k := range r.karts {
		grade = min(grade, k.Claims.Grade)
		level = min(level, points.Level(k.Claims.Level))
		ids = append(ids, k.ID())
		*k = Kart{Claims: k.Claims, Avatar: k.Avatar, client: k.client, order: k.order, online: true, choice: -1}
	}
	r.grade = grade
	r.gen = questions.NewFor(GameKey, grade, r.rng.Uint64()).For(r.subject, ids...).AtLevel(level)
	r.lapKm = r.cfg.LapLength(r.total, grade)
	r.q, r.asked = QuestionState{}, 0
	r.bananas, r.missiles, r.feed, r.ranking = nil, nil, nil, nil
	r.started, r.ended, r.firstIn = now, time.Time{}, time.Time{}
	expected := time.Duration(r.total) * (r.cfg.AnswerTime(grade) + r.cfg.RevealTime)
	r.capAt = now.Add(r.cfg.Countdown + time.Duration(float64(expected)*max(1.2, r.cfg.RaceCap)))
	r.phase, r.countUntil = PhaseCountdown, now.Add(r.cfg.Countdown)
	r.lastTick, r.playerAt = now, time.Time{}
	r.dirtyLobby = false
	r.broadcastState(now)
	return nil
}

func (r *Room) end(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseCountdown && r.phase != PhaseRace {
		return ErrPhase
	}
	r.finish(now)
	return nil
}

// racing counts karts still on the track (not finished, not left).
func (r *Room) racing() int {
	n := 0
	for _, k := range r.karts {
		if !k.finished && !k.left {
			n++
		}
	}
	return n
}

// ask opens the next question (stage QUESTION) for every kart still racing.
func (r *Room) ask(now time.Time) {
	r.nextID++
	r.asked++
	q := r.gen.Present(r.gen.Choice(), Options)
	limit := r.cfg.AnswerTime(r.grade)
	r.q = QuestionState{ID: r.nextID, Number: r.asked, Question: q, Limit: limit, Start: now, Deadline: now.Add(limit), Stage: StageQuestion}
	for _, k := range r.karts {
		k.answered, k.choice = false, -1
	}
	r.broadcast(func(locale string) Message {
		return Message{
			"t": "question_start", "qid": r.q.ID, "number": r.q.Number, "total": r.total,
			"time_limit": limit.Milliseconds(), "remaining_ms": limit.Milliseconds(),
			"question": r.questionView(locale), "options": r.optionsView(locale),
		}
	})
}

// answer scores a choice: Nitro + Item Box for a correct one, Engine
// Stutter for a wrong one. The answer time is the server reception clock.
func (r *Room) answer(c *Client, qid int64, choice int, at, now time.Time) error {
	k := r.byID[c.ID()]
	if k == nil || k.left {
		return ErrNoRoom
	}
	if r.phase != PhaseRace || r.q.Stage != StageQuestion || qid != r.q.ID || !at.Before(r.q.Deadline) {
		return ErrLocked
	}
	if k.finished {
		return ErrFinished
	}
	if k.answered {
		return ErrAnswered
	}
	if choice < 0 || choice >= len(r.q.Question.Options) {
		return ErrOption
	}
	if at.Sub(r.q.Start) < r.cfg.MinAnswer {
		return ErrTooEarly
	}
	k.answered, k.choice = true, choice
	q := r.q.Question
	right := choice == q.Answer
	if q.FromBank {
		k.answers = append(k.answers, questions.Answer{Key: q.Key, Correct: right, Choice: q.Original(choice)})
	}
	msg := Message{"t": "answer_result", "qid": qid, "correct": right}
	if right {
		k.correct++
		k.earned += q.Worth()
		left := float64(r.q.Deadline.Sub(at)) / float64(r.q.Limit)
		boost := NitroFor(left)
		k.nitroUntil, k.stutterUntil = now.Add(boost), time.Time{}
		msg["nitro_ms"] = boost.Milliseconds()
		if r.host != nil {
			r.host.push(Message{"t": "race_event", "event": Message{"kind": "nitro", "by": r.ref(k), "ms": boost.Milliseconds()}})
		}
		if item := r.rollItem(k); item != "" {
			k.Items = append(k.Items, item)
			msg["item"] = item
			c.push(Message{"t": "item_gained", "item": item, "items": items(k)})
		}
	} else {
		k.wrong++
		k.stutterUntil = now.Add(StutterTime)
		msg["stutter_ms"] = StutterTime.Milliseconds()
	}
	msg["items"] = items(k)
	c.push(msg)
	if r.allAnswered() {
		r.reveal(now)
	}
	return nil
}

func (r *Room) allAnswered() bool {
	for _, k := range r.karts {
		if !k.finished && !k.left && k.online && !k.answered {
			return false
		}
	}
	return true
}

// reveal closes the question and shows the correct answer (stage REVEAL).
func (r *Room) reveal(now time.Time) {
	r.q.Stage, r.q.RevealAt = StageReveal, now.Add(r.cfg.RevealTime)
	q := r.q.Question
	for _, k := range r.karts {
		if !k.finished && !k.left && !k.answered {
			k.wrong++
			if q.FromBank {
				k.answers = append(k.answers, questions.Answer{Key: q.Key, Correct: false})
			}
		}
	}
	r.broadcast(func(locale string) Message {
		return Message{"t": "question_end", "qid": r.q.ID, "correct_index": q.Answer, "hint": q.Hint.Get(locale), "answered": r.answeredCount()}
	})
}

func (r *Room) answeredCount() int {
	n := 0
	for _, k := range r.karts {
		if k.answered {
			n++
		}
	}
	return n
}

// rollItem draws an item box for k (none when the inventory is full). Karts
// in the top three never roll Missile or Lightning; the back of the field
// rolls them more often.
func (r *Room) rollItem(k *Kart) string {
	if len(k.Items) >= MaxItems {
		return ""
	}
	pos, n := r.position(k), max(1, r.racing())
	weights := ItemWeights(pos, n)
	total := 0
	for _, w := range weights {
		total += w
	}
	roll := r.rng.IntN(total)
	for i, w := range weights {
		if roll < w {
			return Items[i]
		}
		roll -= w
	}
	return ItemShield
}

// ItemWeights are the Item Box odds (Banana, Missile, Lightning, Shield)
// for race position pos among n racing karts. The front karts (top three,
// but never the last kart) cannot roll attacks; the further back, the
// likelier Missile and Lightning become.
func ItemWeights(pos, n int) [4]int {
	front := min(3, n-1)
	if pos <= front {
		return [4]int{55, 0, 0, 45}
	}
	// back is 0 just behind the front group and 100 for the last kart.
	back := 100
	if span := n - front; span > 1 {
		back = (pos - front - 1) * 100 / (span - 1)
	}
	return [4]int{35 - back/5, 25 + back/5, 15 + back/10, 25 - back/10}
}

// position is k's live race position (1 = leader).
func (r *Room) position(k *Kart) int {
	for i, q := range rank(r.karts) {
		if q == k {
			return i + 1
		}
	}
	return len(r.karts)
}

// useItem fires an item from the inventory.
func (r *Room) useItem(c *Client, item string, now time.Time) error {
	k := r.byID[c.ID()]
	if k == nil || k.left {
		return ErrNoRoom
	}
	if r.phase != PhaseRace {
		return ErrPhase
	}
	if k.finished {
		return ErrFinished
	}
	valid := false
	for _, it := range Items {
		valid = valid || it == item
	}
	if !valid {
		return ErrItem
	}
	slot := -1
	for i, it := range k.Items {
		if it == item {
			slot = i
			break
		}
	}
	if slot < 0 {
		return ErrNoItem
	}
	ev := Message{"kind": "item", "item": item, "by": r.ref(k)}
	switch item {
	case ItemBanana:
		r.nextID++
		x := math.Mod(k.Progress-BananaBehind+Laps, 1)
		r.bananas = append(r.bananas, Banana{ID: r.nextID, X: x, Owner: k.ID(), At: now})
		if len(r.bananas) > MaxBananas {
			r.bananas = r.bananas[len(r.bananas)-MaxBananas:]
		}
		ev["x"] = x
	case ItemMissile:
		target := r.leaderExcept(k)
		if target == nil {
			return ErrNoTarget
		}
		r.nextID++
		r.missiles = append(r.missiles, Missile{ID: r.nextID, From: k.ID(), Target: target.ID(), Start: k.Progress, Launch: now, Impact: now.Add(r.cfg.MissileFlight)})
		ev["target"] = r.ref(target)
	case ItemLightning:
		struck, immune := []Message{}, []Message{}
		for _, q := range r.karts {
			if q == k || q.finished || q.left {
				continue
			}
			if q.Shielded(now) {
				immune = append(immune, r.ref(q))
				continue
			}
			q.shrinkUntil = now.Add(ShrinkTime)
			q.hits++
			struck = append(struck, r.ref(q))
			r.notify(q, Message{"t": "hit", "item": ItemLightning, "by": r.ref(k), "ms": ShrinkTime.Milliseconds()})
		}
		ev["struck"], ev["immune"] = struck, immune
	case ItemShield:
		k.shieldUntil = now.Add(ShieldTime)
	}
	k.Items = append(k.Items[:slot:slot], k.Items[slot+1:]...)
	k.used++
	c.push(Message{"t": "item_used", "item": item, "items": items(k)})
	r.event(now, ev)
	return nil
}

// leaderExcept is the best placed racing kart other than k.
func (r *Room) leaderExcept(k *Kart) *Kart {
	for _, q := range rank(r.karts) {
		if q != k && !q.finished && !q.left {
			return q
		}
	}
	return nil
}

// --- tick -----------------------------------------------------------------

// tick is the 20 Hz authoritative step: phases, physics, collisions,
// missile impacts and the broadcast to the projector.
func (r *Room) tick(now time.Time) {
	r.housekeep(now)
	if r.closed {
		return
	}
	switch r.phase {
	case PhaseLobby, PhaseOver:
		if r.dirtyLobby {
			r.dirtyLobby = false
			r.broadcastState(now)
		}
		return
	case PhaseCountdown:
		if now.Before(r.countUntil) {
			return
		}
		r.phase, r.lastTick = PhaseRace, now
		r.broadcastState(now)
		r.ask(now)
		return
	}
	r.step(now)
	if r.closed || r.phase != PhaseRace {
		return
	}
	switch r.q.Stage {
	case StageQuestion:
		if !now.Before(r.q.Deadline) {
			r.reveal(now)
		}
	case StageReveal:
		if !now.Before(r.q.RevealAt) {
			if r.asked < r.total && r.racing() > 0 {
				r.ask(now)
			} else {
				r.q.Stage = StageDone
			}
		}
	}
	r.broadcastTick(now)
}

// step moves every kart and resolves hazards between lastTick and now.
func (r *Room) step(now time.Time) {
	dt := now.Sub(r.lastTick)
	r.lastTick = now
	if dt <= 0 {
		return
	}
	dt = min(dt, 250*time.Millisecond)
	for _, k := range r.karts {
		k.speed = k.Speed(now)
		if k.speed == 0 {
			continue
		}
		before := k.Progress
		k.Progress = min(Laps, k.Progress+k.speed*dt.Hours()/r.lapKm)
		r.collide(k, before, now)
		if k.Progress >= Laps && !k.finished {
			k.finished, k.finishAt, k.speed = true, now, 0
			if r.firstIn.IsZero() {
				r.firstIn = now
			}
			r.event(now, Message{"kind": "finish", "by": r.ref(k), "place": r.finishedCount()})
			r.notify(k, Message{"t": "finished", "place": r.finishedCount()})
		}
	}
	r.impacts(now)
	r.expireBananas(now)
	switch {
	case r.racing() == 0:
		r.finish(now)
	case !r.firstIn.IsZero() && now.Sub(r.firstIn) >= r.cfg.FinalWindow:
		r.finish(now)
	case now.After(r.capAt):
		r.finish(now)
	}
}

func (r *Room) finishedCount() int {
	n := 0
	for _, k := range r.karts {
		if k.finished {
			n++
		}
	}
	return n
}

// Crossed reports whether a kart moving from before to after (in laps)
// drives over track coordinate x (0..1), and where (in laps).
func Crossed(before, after, x float64) (float64, bool) {
	if after <= before {
		return 0, false
	}
	for lap := math.Floor(before); lap <= math.Floor(after); lap++ {
		if p := lap + x; p > before && p <= after {
			return p, true
		}
	}
	return 0, false
}

// collide spins out k on the first banana it drove over this tick (a
// shield destroys the banana instead). The owner never slips on its own.
func (r *Room) collide(k *Kart, before float64, now time.Time) {
	for i, b := range r.bananas {
		at, hit := Crossed(before, k.Progress, b.X)
		if b.Owner == k.ID() || !hit {
			continue
		}
		r.bananas = append(r.bananas[:i:i], r.bananas[i+1:]...)
		owner := r.byID[b.Owner]
		ev := Message{"kind": "banana_hit", "target": r.ref(k), "x": b.X}
		if owner != nil {
			ev["by"] = r.ref(owner)
		}
		if k.Shielded(now) {
			k.shieldUntil = time.Time{}
			ev["blocked"] = true
			r.notify(k, Message{"t": "hit", "item": ItemBanana, "blocked": true})
		} else {
			// Stop where the banana lies.
			k.Progress = at
			k.spinUntil, k.nitroUntil = now.Add(SpinTime), time.Time{}
			k.hits++
			r.notify(k, Message{"t": "hit", "item": ItemBanana, "ms": SpinTime.Milliseconds()})
		}
		r.event(now, ev)
		return
	}
}

// impacts steers every missile to the current leader (homing) and lands
// the missiles whose flight ended.
func (r *Room) impacts(now time.Time) {
	kept := r.missiles[:0]
	for _, m := range r.missiles {
		if from := r.byID[m.From]; from != nil {
			if lead := r.leaderExcept(from); lead != nil {
				m.Target = lead.ID()
			}
		}
		if now.Before(m.Impact) {
			kept = append(kept, m)
			continue
		}
		target, from := r.byID[m.Target], r.byID[m.From]
		if target == nil || target.finished || target.left {
			continue
		}
		ev := Message{"kind": "missile_hit", "target": r.ref(target)}
		if from != nil {
			ev["by"] = r.ref(from)
		}
		if target.Shielded(now) {
			target.shieldUntil = time.Time{}
			ev["blocked"] = true
			r.notify(target, Message{"t": "hit", "item": ItemMissile, "blocked": true})
		} else {
			target.staggerUntil, target.nitroUntil = now.Add(StaggerTime), time.Time{}
			target.hits++
			r.notify(target, Message{"t": "hit", "item": ItemMissile, "ms": StaggerTime.Milliseconds()})
		}
		r.event(now, ev)
	}
	r.missiles = kept
}

func (r *Room) expireBananas(now time.Time) {
	kept := r.bananas[:0]
	for _, b := range r.bananas {
		if now.Sub(b.At) < r.cfg.BananaLife {
			kept = append(kept, b)
		}
	}
	r.bananas = kept
}

// --- results --------------------------------------------------------------

// rank orders karts: finishers by finish time, then by distance, leavers last.
func rank(karts []*Kart) []*Kart {
	out := append([]*Kart(nil), karts...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.left != b.left {
			return !a.left
		}
		if a.finished != b.finished {
			return a.finished
		}
		if a.finished && !a.finishAt.Equal(b.finishAt) {
			return a.finishAt.Before(b.finishAt)
		}
		if a.Progress != b.Progress {
			return a.Progress > b.Progress
		}
		if a.correct != b.correct {
			return a.correct > b.correct
		}
		return a.order < b.order
	})
	return out
}

// finish ends the race (GAME_OVER), ranks everyone and reports results.
func (r *Room) finish(now time.Time) {
	if r.phase == PhaseOver {
		return
	}
	r.phase, r.ended = PhaseOver, now
	r.q.Stage = StageDone
	r.missiles = nil
	r.ranking = rank(r.karts)
	for i, k := range r.ranking {
		k.rank = i + 1
	}
	for _, k := range r.karts {
		r.settle(k, true, now)
	}
	podium := r.podium(now)
	for _, k := range r.karts {
		if k.client == nil {
			continue
		}
		k.client.push(Message{"t": "podium_result", "podium": podium[:min(3, len(podium))], "ranking": podium, "you": r.youResult(k, now)})
	}
	if r.host != nil {
		r.host.push(Message{"t": "podium_result", "podium": podium[:min(3, len(podium))], "ranking": podium})
	}
}

func accuracy(k *Kart) float64 {
	n := k.correct + k.wrong
	if n == 0 {
		return 0
	}
	return math.Round(float64(k.correct)*1000/float64(n)) / 10
}

func (r *Room) raceMs(k *Kart, now time.Time) int64 {
	end := r.ended
	if k.finished {
		end = k.finishAt
	}
	if end.IsZero() {
		end = now
	}
	return max(0, end.Sub(r.started.Add(r.cfg.Countdown)).Milliseconds())
}

func (r *Room) points(k *Kart, finished bool) int {
	if !finished || k.left {
		return points.Abandoned(k.earned, k.correct+k.wrong, MaxPoints)
	}
	return Award(k.earned, k.rank == 1)
}

func (r *Room) podium(now time.Time) []Message {
	out := make([]Message, len(r.ranking))
	for i, k := range r.ranking {
		out[i] = Message{
			"user_id": k.ID(), "name": k.Claims.Name, "rank": k.rank, "character": avatar(k),
			"finished": k.finished, "race_ms": r.raceMs(k, now), "progress": round(k.Progress, 3),
			"correct": k.correct, "wrong": k.wrong, "accuracy": accuracy(k), "items_used": k.used, "hits": k.hits,
			"left": k.left,
		}
	}
	return out
}

func (r *Room) youResult(k *Kart, now time.Time) Message {
	return Message{
		"user_id": k.ID(), "rank": k.rank, "won": k.rank == 1, "points": r.points(k, true),
		"finished": k.finished, "race_ms": r.raceMs(k, now), "correct": k.correct, "wrong": k.wrong,
		"accuracy": accuracy(k), "total": len(r.karts),
	}
}

// settle queues the result of one kart once.
func (r *Room) settle(k *Kart, finished bool, now time.Time) {
	if k.reported || r.started.IsZero() {
		return
	}
	pts := r.points(k, finished)
	if (!finished || k.left) && pts == 0 {
		return
	}
	k.reported = true
	r.hub.queue(Result{
		EventID:     fmt.Sprintf("%s-%d-room-%d", Prefix, k.ID(), r.started.UnixNano()),
		UserID:      k.ID(),
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       k.Claims.Grade,
		Points:      pts,
		Correct:     k.correct,
		Wrong:       k.wrong,
		Seconds:     int(now.Sub(r.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, k.answers...),
		Match:       r.match(finished, now),
	})
}

// match summarises the race for every player's history. Score is the
// distance driven in percent of the race.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		order = rank(r.karts)
	}
	players := make([]record.Player, len(order))
	for i, k := range order {
		acc := accuracy(k)
		players[i] = record.Player{
			UserID: k.ID(), Name: k.Claims.Name, Grade: k.Claims.Grade, Left: k.left,
			Score: int(math.Round(k.Progress * 100 / Laps)), Correct: k.correct, Wrong: k.wrong, Rank: i + 1,
			SurvivalMs: r.raceMs(k, now), Accuracy: &acc,
		}
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: record.ModeRoom, Pin: r.Pin,
		Level: r.asked, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
}

// close shuts the room: unfinished races pay what players achieved.
func (r *Room) close(now time.Time, reason string) {
	if r.closed {
		return
	}
	if r.phase == PhaseRace || r.phase == PhaseCountdown {
		r.ranking = rank(r.karts)
		for _, k := range r.karts {
			r.settle(k, false, now)
		}
	}
	msg := Message{"t": "state_sync", "phase": "NONE", "closed": reason}
	for _, k := range r.karts {
		r.hub.dropPlayer(k.ID(), r)
		if k.client != nil {
			k.client.push(msg)
		}
	}
	if r.host != nil {
		r.host.push(msg)
	}
	r.hub.dropRoom(r)
	r.closed = true
}

// housekeep drops lobby ghosts and closes idle or abandoned rooms.
func (r *Room) housekeep(now time.Time) {
	for _, k := range append([]*Kart(nil), r.karts...) {
		if k.online || k.left || k.offlineAt.IsZero() {
			continue
		}
		if (r.phase == PhaseLobby || r.phase == PhaseOver) && now.Sub(k.offlineAt) >= r.cfg.LobbyDrop {
			r.hub.dropPlayer(k.ID(), r)
			r.remove(k)
			r.dirtyLobby = true
		}
	}
	anyone := r.hostOnline
	for _, k := range r.karts {
		anyone = anyone || k.online
	}
	if anyone {
		r.emptySince = time.Time{}
	} else if r.emptySince.IsZero() {
		r.emptySince = now
	}
	playing := r.phase == PhaseRace || r.phase == PhaseCountdown
	if (!playing && now.Sub(r.touched) >= r.cfg.Idle) || (!r.emptySince.IsZero() && now.Sub(r.emptySince) >= r.cfg.Empty) {
		r.close(now, "idle")
	}
}

// --- views ----------------------------------------------------------------

func round(v float64, digits int) float64 {
	p := math.Pow(10, float64(digits))
	return math.Round(v*p) / p
}

func avatar(k *Kart) any {
	if len(k.Avatar) == 0 {
		return nil
	}
	return k.Avatar
}

// ref identifies a kart in feed events.
func (r *Room) ref(k *Kart) Message {
	return Message{"id": k.ID(), "name": k.Claims.Name}
}

// event appends a race event to the ticker feed and broadcasts it. Item
// effects go out as item_triggered (the projector animates them), other
// events (finish, left) as race_event. ev is never mutated afterwards.
func (r *Room) event(now time.Time, ev Message) {
	ev["at_ms"] = max(0, now.Sub(r.started).Milliseconds())
	r.feed = append(r.feed, ev)
	if len(r.feed) > 12 {
		r.feed = append([]Message(nil), r.feed[len(r.feed)-12:]...)
	}
	kind := "race_event"
	switch ev["kind"] {
	case "item", "banana_hit", "missile_hit":
		kind = "item_triggered"
	}
	msg := Message{"t": kind, "event": ev}
	r.broadcast(func(string) Message { return msg })
}

// items copies the inventory: queued messages must never share the slice
// the room goroutine keeps appending to.
func items(k *Kart) []string { return append([]string{}, k.Items...) }

func (r *Room) notify(k *Kart, msg Message) {
	if k.client != nil {
		k.client.push(msg)
	}
}

// broadcast sends one message per locale to the host and every connected
// player. Messages are built once per locale and never mutated afterwards.
func (r *Room) broadcast(build func(locale string) Message) {
	cache := map[string]Message{}
	get := func(l string) Message {
		if m, ok := cache[l]; ok {
			return m
		}
		m := build(l)
		cache[l] = m
		return m
	}
	if r.host != nil {
		r.host.push(get(r.host.Locale()))
	}
	for _, k := range r.karts {
		if k.client != nil {
			k.client.push(get(k.client.Locale()))
		}
	}
}

func (r *Room) broadcastState(now time.Time) {
	if r.host != nil {
		r.sendState(r.host, now)
	}
	for _, k := range r.karts {
		if k.client != nil {
			r.sendState(k.client, now)
		}
	}
}

// kartsView is the compact per-tick kart list (projector).
func (r *Room) kartsView(now time.Time) []Message {
	order := rank(r.karts)
	out := make([]Message, 0, len(order))
	for i, k := range order {
		out = append(out, Message{
			"id": k.ID(), "p": round(k.Progress, 4), "v": int(math.Round(k.Speed(now))),
			"fx": k.Effects(now), "rank": i + 1, "fin": k.finished, "left": k.left, "on": k.online,
			"items": len(k.Items), "ans": k.answered,
		})
	}
	return out
}

func (r *Room) hazardsView(now time.Time) (bananas, missiles []Message) {
	bananas = make([]Message, len(r.bananas))
	for i, b := range r.bananas {
		bananas[i] = Message{"id": b.ID, "x": round(b.X, 4)}
	}
	missiles = make([]Message, 0, len(r.missiles))
	for _, m := range r.missiles {
		target := r.byID[m.Target]
		if target == nil {
			continue
		}
		k := float64(now.Sub(m.Launch)) / float64(m.Impact.Sub(m.Launch))
		missiles = append(missiles, Message{"id": m.ID, "from": m.From, "target": m.Target, "p": round(m.Start+(target.Progress-m.Start)*max(0, min(1, k)), 4)})
	}
	return bananas, missiles
}

// broadcastTick sends the 20 Hz TICK to the projector and, throttled, the
// personal kart status (speed, effects, position, items) to each phone.
func (r *Room) broadcastTick(now time.Time) {
	r.seq++
	if r.host != nil {
		bananas, missiles := r.hazardsView(now)
		r.host.push(Message{
			"t": "tick", "seq": r.seq, "race_ms": max(0, now.Sub(r.started.Add(r.cfg.Countdown)).Milliseconds()),
			"karts": r.kartsView(now), "bananas": bananas, "missiles": missiles,
			"answered": r.answeredCount(), "racing": r.racing(), "remaining_ms": r.remaining(now),
		})
	}
	if now.Sub(r.playerAt) < r.cfg.PlayerTick {
		return
	}
	r.playerAt = now
	order := rank(r.karts)
	for i, k := range order {
		if k.client == nil {
			continue
		}
		k.client.push(Message{
			"t": "kart", "seq": r.seq, "speed": int(math.Round(k.Speed(now))), "fx": k.Effects(now),
			"rank": i + 1, "of": len(order), "progress": round(k.Progress, 4), "lap": min(Laps, int(k.Progress)+1),
			"items": items(k), "finished": k.finished, "remaining_ms": r.remaining(now),
		})
	}
}

// remaining is the answer time left of the open question.
func (r *Room) remaining(now time.Time) int64 {
	if r.q.Stage != StageQuestion {
		return 0
	}
	return max(0, r.q.Deadline.Sub(now).Milliseconds())
}

func (r *Room) questionView(locale string) Message {
	q := r.q.Question
	return Message{"text": q.Prompt.Get(locale), "subject": q.Subject, "worth": q.Worth()}
}

func (r *Room) optionsView(locale string) []string {
	opts := make([]string, len(r.q.Question.Options))
	for i, o := range r.q.Question.Options {
		opts[i] = o.Get(locale)
	}
	return opts
}

// sendState pushes the full snapshot (state_sync) to one client.
func (r *Room) sendState(c *Client, now time.Time) {
	locale := c.Locale()
	role := "player"
	if c.Host {
		role = "host"
	}
	roster := make([]Message, len(r.karts))
	for i, k := range r.karts {
		roster[i] = Message{
			"user_id": k.ID(), "name": k.Claims.Name, "grade": k.Claims.Grade, "character": avatar(k),
			"online": k.online, "left": k.left, "order": k.order,
		}
	}
	msg := Message{
		"t": "state_sync", "pin": r.Pin, "phase": r.phase, "role": role, "subject": subjectOrMix(r.subject),
		"host":    Message{"user_id": r.hostClaims.Subject, "name": r.hostClaims.Name, "online": r.hostOnline},
		"players": roster, "min_players": MinPlayers, "max_players": MaxPlayers,
		"laps": Laps, "total": r.total, "question_counts": QuestionCounts, "asked": r.asked,
		"feed": append([]Message{}, r.feed...),
	}
	if r.phase == PhaseCountdown {
		msg["countdown_ms"] = max(0, r.countUntil.Sub(now).Milliseconds())
	}
	if r.phase == PhaseRace || r.phase == PhaseOver {
		bananas, missiles := r.hazardsView(now)
		msg["karts"], msg["bananas"], msg["missiles"] = r.kartsView(now), bananas, missiles
	}
	if r.phase == PhaseRace && r.q.ID != 0 {
		quiz := Message{
			"qid": r.q.ID, "number": r.q.Number, "stage": r.q.Stage, "time_limit": r.q.Limit.Milliseconds(),
			"remaining_ms": r.remaining(now), "question": r.questionView(locale), "options": r.optionsView(locale),
		}
		if r.q.Stage != StageQuestion {
			quiz["correct_index"] = r.q.Question.Answer
			quiz["hint"] = r.q.Question.Hint.Get(locale)
		}
		msg["quiz"] = quiz
	}
	if !c.Host {
		if k := r.byID[c.ID()]; k != nil {
			you := Message{
				"user_id": k.ID(), "items": items(k), "answered": k.answered, "finished": k.finished,
				"speed": int(math.Round(k.Speed(now))), "fx": k.Effects(now), "rank": r.position(k), "progress": round(k.Progress, 4),
			}
			if k.answered {
				you["choice"] = k.choice
			}
			msg["you"] = you
		}
	}
	if r.phase == PhaseOver {
		podium := r.podium(now)
		msg["podium"] = podium[:min(3, len(podium))]
		msg["ranking"] = podium
		if k := r.byID[c.ID()]; k != nil && !c.Host {
			msg["result"] = r.youResult(k, now)
		}
	}
	c.push(msg)
}

func subjectOrMix(s string) string {
	if s == "" {
		return "mix"
	}
	return s
}

// ParsePlayerID reads a player id sent as a JSON number or string.
func ParsePlayerID(raw json.RawMessage) (int64, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, false
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n, true
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if _, err := fmt.Sscan(s, &n); err == nil {
			return n, true
		}
	}
	return -1, true
}
