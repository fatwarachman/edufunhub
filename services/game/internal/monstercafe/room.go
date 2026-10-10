package monstercafe

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"slices"
	"sort"
	"strconv"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

// FeedSize is how many recent actions the state snapshot carries.
const FeedSize = 20

// Player is one student seat (and kitchen) in a room. Owned by the room
// goroutine.
type Player struct {
	Claims auth.Claims
	// Avatar is the portal look (signed token claim, else the join payload).
	Avatar json.RawMessage
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	// Questions: one pending question at a time, for one ingredient.
	gen        *questions.Generator
	asked      int
	questionID string
	question   questions.Question
	ingredient string
	askedAt    time.Time
	cooldown   time.Time

	// Kitchen.
	tray      []string
	plate     []string
	oven      Oven
	dish      *Held
	orders    []*Order
	due       []time.Time // arrival times of the next orders
	made      int         // orders created so far
	orderSeq  int
	ratID     string
	ratIngr   string
	ratAt     time.Time // steal time of the current rat
	nextRat   time.Time
	ratSeq    int
	kitchenAt time.Time

	pies      int
	coins     int
	served    int
	streak    int
	burnt     int
	angry     int
	lastServe time.Time

	correct  int
	wrong    int
	earned   int
	answers  []questions.Answer
	reported bool
	rank     int
}

// ID is the account id.
func (p *Player) ID() int64 { return p.Claims.Subject }

func (p *Player) answered() int { return p.correct + p.wrong }

type reply struct {
	err error
	v   any
}

type command struct {
	kind    string
	c       *Client
	op      string
	arg     string
	index   int
	target  int64
	minutes int
	subject string
	avatar  []byte
	at      time.Time
	fn      func(r *Room) any
	reply   chan reply
}

// Room runs one game in its own goroutine. Only that goroutine touches the
// fields below; other goroutines send commands.
type Room struct {
	hub *Hub
	cfg Config
	Pin string

	host       *Client
	hostClaims auth.Claims
	hostOnline bool

	// solo rooms are private kitchens: the owner is the only player and
	// runs the room (settings, start, end) from the player pad.
	solo  bool
	owner int64

	players []*Player
	byID    map[int64]*Player
	joined  int

	phase   string
	subject string
	minutes int
	started time.Time
	endsAt  time.Time
	ended   time.Time
	grade   int
	rng     *rand.Rand
	actions int64
	feed    []Message
	ranking []*Player

	dirtyBoard bool
	dirtyLobby bool
	flushedAt  time.Time
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
		byID:       map[int64]*Player{},
		phase:      PhaseLobby,
		minutes:    DefaultMinutes,
		rng:        rand.New(rand.NewPCG(seed, seed^0xc0ffee)),
		touched:    now,
		cmds:       make(chan command, h.cfg.Commands),
		done:       make(chan struct{}),
	}
}

// run is the room goroutine: commands and timers, nothing else touches state.
func (r *Room) run() {
	defer close(r.done)
	timer := time.NewTicker(r.cfg.Tick)
	defer timer.Stop()
	for !r.closed {
		select {
		case cmd := <-r.cmds:
			r.handle(cmd, time.Now())
		case now := <-timer.C:
			r.tick(now)
		}
	}
	for {
		select {
		case cmd := <-r.cmds:
			if cmd.reply != nil {
				cmd.reply <- reply{err: ErrClosed}
			}
		default:
			return
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
	case "config":
		res.err = r.configure(cmd.c, cmd.minutes, now)
	case "subject":
		res.err = r.setSubject(cmd.c, cmd.subject, now)
	case "answer":
		res.err = r.answer(cmd.c, cmd.arg, cmd.index, cmd.at, now)
	case "act":
		res.err = r.act(cmd.c, cmd.op, cmd.arg, cmd.target, now)
	case "sync":
		r.sendState(cmd.c, now)
		if p := r.byID[cmd.c.ID()]; p != nil && !cmd.c.Host && r.phase == PhasePlaying {
			r.sendKitchen(p, now)
		}
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
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) attach(c *Client, now time.Time) error {
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if p.client != nil && p.client != c {
		p.client.Close()
	}
	p.client, p.online, p.offlineAt = c, true, time.Time{}
	p.Claims.Name = c.Claims.Name
	if len(c.Claims.Character) > 0 {
		p.Avatar = c.Claims.Character
	}
	r.dirtyLobby, r.dirtyBoard = true, true
	r.sendState(c, now)
	if r.phase == PhasePlaying {
		r.sendKitchen(p, now)
	}
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
	if p := r.byID[c.ID()]; p != nil && !p.left {
		return r.attach(c, now)
	}
	if r.solo && c.ID() != r.owner {
		return ErrFull
	}
	if r.active() >= MaxPlayers {
		return ErrFull
	}
	p := r.seat(c, avatar)
	if r.phase == PhasePlaying {
		// Self-paced: late joiners open their kitchen at 0 coins.
		r.prepare(p, now)
		r.dirtyBoard = true
		r.sendState(c, now)
		r.sendKitchen(p, now)
		return nil
	}
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) seat(c *Client, avatar []byte) *Player {
	if old := r.byID[c.ID()]; old != nil {
		r.remove(old)
	}
	r.joined++
	p := &Player{Claims: c.Claims, Avatar: avatarOf(c.Claims, avatar), client: c, order: r.joined, online: true}
	r.players = append(r.players, p)
	r.byID[c.ID()] = p
	r.hub.setPlayer(c.ID(), r)
	return p
}

func (r *Room) active() int {
	n := 0
	for _, p := range r.players {
		if !p.left {
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
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if r.solo {
		// Leaving a solo kitchen closes it; an unfinished game pays what was
		// achieved (points.Abandoned), like leaving any room early.
		r.close(now, "left")
		c.push(Message{"t": "state_sync", "phase": PhaseNone, "role": "player"})
		return nil
	}
	r.hub.dropPlayer(p.ID(), r)
	if r.phase == PhaseLobby {
		r.remove(p)
		r.dirtyLobby = true
	} else {
		if r.phase == PhasePlaying {
			r.settle(p, false, now)
		}
		p.left, p.online, p.client = true, false, nil
		r.dirtyBoard, r.dirtyLobby = true, true
	}
	c.push(Message{"t": "state_sync", "phase": PhaseNone, "role": "player"})
	return nil
}

func (r *Room) remove(p *Player) {
	delete(r.byID, p.ID())
	r.players = slices.DeleteFunc(r.players, func(q *Player) bool { return q == p })
}

func (r *Room) detach(c *Client, now time.Time) {
	if c.Host {
		if r.host == c {
			r.host, r.hostOnline = nil, false
			r.dirtyLobby = true
		}
		return
	}
	if p := r.byID[c.ID()]; p != nil && p.client == c {
		p.client, p.online, p.offlineAt = nil, false, now
		r.dirtyLobby, r.dirtyBoard = true, true
	}
}

// --- host settings --------------------------------------------------------

func (r *Room) configure(c *Client, minutes int, now time.Time) error {
	if !r.canRun(c) {
		return ErrHostOnly
	}
	if r.phase == PhasePlaying {
		return ErrPhase
	}
	if !slices.Contains(Minutes, minutes) {
		return ErrConfig
	}
	r.minutes = minutes
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) setSubject(c *Client, subject string, now time.Time) error {
	if !r.canRun(c) {
		return ErrHostOnly
	}
	if r.phase == PhasePlaying {
		return ErrPhase
	}
	r.subject = questions.NormSubject(subject)
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

// --- game flow ------------------------------------------------------------

func (r *Room) start(c *Client, now time.Time) error {
	if !r.canRun(c) {
		return ErrHostOnly
	}
	if r.phase == PhasePlaying {
		return ErrPhase
	}
	kept := r.players[:0]
	for _, p := range r.players {
		if p.left || !p.online {
			delete(r.byID, p.ID())
			if !p.left {
				r.hub.dropPlayer(p.ID(), r)
			}
			continue
		}
		kept = append(kept, p)
	}
	r.players = kept
	if len(r.players) < MinPlayers {
		return ErrPlayers
	}
	r.grade = r.players[0].Claims.Grade
	for _, p := range r.players {
		r.grade = min(r.grade, p.Claims.Grade)
	}
	for _, p := range r.players {
		*p = Player{Claims: p.Claims, Avatar: p.Avatar, client: p.client, order: p.order, online: true}
	}
	r.feed, r.ranking, r.actions = nil, nil, 0
	r.started, r.ended = now, time.Time{}
	r.endsAt = now.Add(time.Duration(r.minutes) * time.Minute)
	r.phase = PhasePlaying
	for _, p := range r.players {
		r.prepare(p, now)
	}
	r.dirtyLobby, r.dirtyBoard = false, false
	r.broadcastState(now)
	for _, p := range r.players {
		r.sendKitchen(p, now)
	}
	return nil
}

// prepare opens a player's kitchen: own question stream at the table's
// lowest grade, two monsters arriving now and the first rat scheduled.
func (r *Room) prepare(p *Player, now time.Time) {
	p.gen = questions.NewFor(GameKey, r.grade, r.rng.Uint64()).For(r.subject, p.ID()).AtLevel(p.Claims.Level)
	p.oven = Oven{State: OvenEmpty}
	p.due = []time.Time{now, now}
	p.nextRat = now.Add(r.ratDelay())
	r.arrive(p, now)
}

func (r *Room) ratDelay() time.Duration {
	span := r.cfg.RatMax - r.cfg.RatMin
	if span <= 0 {
		return r.cfg.RatMin
	}
	return r.cfg.RatMin + time.Duration(r.rng.Int64N(int64(span)+1))
}

// arrive seats the monsters whose arrival time has come (max MaxOrders).
func (r *Room) arrive(p *Player, now time.Time) bool {
	changed := false
	for len(p.orders) < MaxOrders && len(p.due) > 0 && !now.Before(p.due[0]) {
		p.due = p.due[1:]
		p.orders = append(p.orders, r.newOrder(p, now))
		changed = true
	}
	return changed
}

func (r *Room) newOrder(p *Player, now time.Time) *Order {
	extras := 1
	switch {
	case p.made < 2:
	case now.Sub(r.started) >= r.cfg.Harder:
		extras = 1 + r.rng.IntN(3)
	default:
		extras = 1 + r.rng.IntN(2)
	}
	p.made++
	p.orderSeq++
	dish := DishBurger
	if r.rng.IntN(2) == 1 {
		dish = DishPizza
	}
	recipe := NewRecipe(r.rng, dish, extras)
	total := r.cfg.PatienceBase + r.cfg.PatienceItem*time.Duration(len(recipe))
	if r.grade <= EasyGrade {
		total = total * EasyPatience / 100
	}
	return &Order{
		ID: fmt.Sprintf("o%d-%d", p.ID(), p.orderSeq), Monster: Monsters[r.rng.IntN(len(Monsters))],
		Dish: dish, Recipe: recipe, Total: total, Deadline: now.Add(total),
	}
}

// dropOrder removes an order and schedules the next monster.
func (r *Room) dropOrder(p *Player, o *Order, now time.Time) {
	p.orders = slices.DeleteFunc(p.orders, func(q *Order) bool { return q == o })
	p.due = append(p.due, now.Add(r.cfg.NewOrder))
}

func (r *Room) player(c *Client) (*Player, error) {
	if c.Host {
		return nil, ErrPlayerOnly
	}
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return nil, ErrNoRoom
	}
	if r.phase != PhasePlaying {
		return nil, ErrPhase
	}
	return p, nil
}

// --- questions -------------------------------------------------------------

func (r *Room) requestIngredient(p *Player, ingredient string, now time.Time) error {
	if !ValidIngredient(ingredient) {
		return ErrIngredient
	}
	if now.Before(p.cooldown) {
		return ErrCooldown
	}
	if len(p.tray) >= MaxTray {
		return ErrTrayFull
	}
	p.asked++
	p.question = p.gen.Present(p.gen.Choice(), Options)
	p.questionID = fmt.Sprintf("%d-%d", p.ID(), p.asked)
	p.ingredient, p.askedAt = ingredient, now
	if p.client != nil {
		p.client.push(Message{"t": "question", "question": r.questionView(p, p.client.Locale())})
	}
	return nil
}

func (r *Room) answer(c *Client, questionID string, choice int, at, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	if p.questionID == "" || questionID != p.questionID {
		return ErrStale
	}
	if choice < 0 || choice >= len(p.question.Options) {
		return ErrOption
	}
	if at.Sub(p.askedAt) < r.cfg.MinAnswer {
		return ErrTooEarly
	}
	q := p.question
	right := choice == q.Answer
	if q.FromBank {
		p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: right, Choice: q.Original(choice)})
	}
	msg := Message{"t": "answer_result", "question_id": questionID, "correct": right, "choice": choice, "correct_index": q.Answer}
	if hint := q.Hint.Get(c.Locale()); hint != "" {
		msg["hint"] = hint
	}
	if right {
		p.correct++
		if p.correct <= MaxScoredAnswers {
			p.earned += q.Worth()
		}
		if len(p.tray) < MaxTray {
			p.tray = append(p.tray, p.ingredient)
			msg["ingredient"] = p.ingredient
		}
	} else {
		p.wrong++
		p.cooldown = now.Add(r.cfg.Cooldown)
		msg["cooldown_ms"] = r.cfg.Cooldown.Milliseconds()
	}
	p.questionID, p.question, p.ingredient = "", questions.Question{}, ""
	c.push(msg)
	r.sendKitchen(p, now)
	r.dirtyBoard = true
	return nil
}

// --- kitchen ---------------------------------------------------------------

func (r *Room) act(c *Client, op, arg string, target int64, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	switch op {
	case OpRequest:
		err = r.requestIngredient(p, arg, now)
	case OpPlateAdd:
		err = r.plateAdd(p, arg)
	case OpPlateClear:
		err = r.plateClear(p)
	case OpCook:
		err = r.cook(p, now)
	case OpTakeOut:
		err = r.takeOut(p)
	case OpServe:
		err = r.serve(p, arg, now)
	case OpDiscard:
		err = r.discard(p)
	case OpShoo:
		err = r.shoo(p, arg, now)
	case OpPie:
		err = r.throwPie(p, target, now)
	default:
		err = ErrUnknownType
	}
	if err != nil {
		return err
	}
	r.sendKitchen(p, now)
	return nil
}

func (r *Room) plateAdd(p *Player, ingredient string) error {
	if !ValidIngredient(ingredient) {
		return ErrIngredient
	}
	if len(p.plate) >= MaxPlate {
		return ErrPlateFull
	}
	tray, ok := removeOne(p.tray, ingredient)
	if !ok {
		return ErrNoIngr
	}
	p.tray = tray
	p.plate = append(p.plate, ingredient)
	return nil
}

func (r *Room) plateClear(p *Player) error {
	if len(p.plate) == 0 {
		return ErrPlateEmpty
	}
	if len(p.tray)+len(p.plate) > MaxTray {
		return ErrTrayFull
	}
	p.tray = append(p.tray, p.plate...)
	p.plate = nil
	return nil
}

func (r *Room) cook(p *Player, now time.Time) error {
	if p.oven.State != OvenEmpty || p.dish != nil {
		return ErrOvenBusy
	}
	if len(p.plate) == 0 {
		return ErrPlateEmpty
	}
	ready := now.Add(r.cfg.Cook)
	p.oven = Oven{State: OvenCooking, Dish: DishOf(p.plate), Items: p.plate, ReadyAt: ready, BurnAt: ready.Add(r.cfg.BurnAfter)}
	p.plate = nil
	return nil
}

func (r *Room) takeOut(p *Player) error {
	switch p.oven.State {
	case OvenReady:
		p.dish = &Held{Dish: p.oven.Dish, Items: p.oven.Items}
		p.oven = Oven{State: OvenEmpty}
		return nil
	case OvenCooking:
		return ErrOvenBusy
	}
	return ErrOvenEmpty
}

func (r *Room) discard(p *Player) error {
	switch {
	case p.dish != nil:
		p.dish = nil
	case p.oven.State == OvenBurnt:
		p.oven = Oven{State: OvenEmpty}
	default:
		return ErrNoDish
	}
	return nil
}

func (r *Room) serve(p *Player, orderID string, now time.Time) error {
	if p.dish == nil {
		return ErrNoDish
	}
	i := slices.IndexFunc(p.orders, func(o *Order) bool { return o.ID == orderID })
	if i < 0 {
		return ErrOrder
	}
	o, dish := p.orders[i], p.dish
	p.dish = nil
	if dish.Dish != o.Dish || !SameItems(dish.Items, o.Recipe) {
		p.streak = 0
		o.Deadline = o.Deadline.Add(-o.Total * WrongDishPenalty / 100)
		r.push(p, Message{"t": "order_failed", "order_id": o.ID, "monster": o.Monster, "reason": FailWrong})
		return nil
	}
	tip := Tip(o.Deadline.Sub(now), o.Total)
	coins := BaseCoins + tip
	p.coins += coins
	p.served++
	p.streak++
	p.lastServe = now
	granted := false
	if p.streak%PieStreak == 0 && p.pies < MaxPies {
		p.pies++
		granted = true
	}
	r.dropOrder(p, o, now)
	r.push(p, Message{
		"t": "order_served", "order_id": o.ID, "monster": o.Monster, "dish": o.Dish,
		"coins": coins, "tip": tip, "score": p.coins, "pie_granted": granted,
	})
	r.record(now, KindServed, p, nil, Message{"dish": o.Dish, "coins": coins})
	r.dirtyBoard = true
	return nil
}

func (r *Room) shoo(p *Player, ratID string, now time.Time) error {
	if p.ratID == "" || ratID != p.ratID {
		return ErrRat
	}
	r.push(p, Message{"t": "rat_result", "rat_id": p.ratID, "shooed": true, "ingredient": p.ratIngr})
	p.ratID, p.ratIngr, p.ratAt = "", "", time.Time{}
	p.nextRat = now.Add(r.ratDelay())
	return nil
}

func (r *Room) throwPie(p *Player, targetID int64, now time.Time) error {
	if p.pies <= 0 {
		return ErrNoPie
	}
	var t *Player
	if targetID == 0 {
		for _, q := range r.order() {
			if q != p && !q.left {
				t = q
				break
			}
		}
		if t == nil {
			return ErrNoTarget
		}
	} else {
		t = r.byID[targetID]
		if t == nil || t == p || t.left {
			return ErrTarget
		}
	}
	p.pies--
	r.push(t, Message{"t": "pie_hit", "attacker": r.ref(p), "duration_ms": r.cfg.Pie.Milliseconds()})
	r.push(p, Message{"t": "pie_result", "target": Message{"user_id": t.ID(), "name": t.Claims.Name}})
	r.record(now, KindPie, p, t, nil)
	return nil
}

// push sends to a player's device when connected.
func (r *Room) push(p *Player, msg Message) {
	if p.client != nil {
		p.client.push(msg)
	}
}

// record adds an action to the feed and broadcasts it: to the host always,
// to players only when they are involved.
func (r *Room) record(now time.Time, kind string, p, target *Player, extra Message) {
	r.actions++
	action := Message{"t": "action_broadcast", "id": r.actions, "at": now.UnixMilli(), "kind": kind, "player": r.ref(p)}
	if target != nil {
		action["target"] = r.ref(target)
	}
	for k, v := range extra {
		action[k] = v
	}
	r.feed = append(r.feed, action)
	if len(r.feed) > FeedSize {
		r.feed = r.feed[len(r.feed)-FeedSize:]
	}
	if r.host != nil {
		r.host.push(action)
	}
	r.push(p, action)
	if target != nil {
		r.push(target, action)
	}
}

func (r *Room) ref(p *Player) Message {
	return Message{"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p)}
}

// --- kitchen timers ---------------------------------------------------------

// step advances one kitchen's timers and reports whether it changed.
func (r *Room) step(p *Player, now time.Time) bool {
	changed := false
	if p.oven.State == OvenCooking && !now.Before(p.oven.ReadyAt) {
		p.oven.State, changed = OvenReady, true
	}
	if p.oven.State == OvenReady && !now.Before(p.oven.BurnAt) {
		p.oven.State, changed = OvenBurnt, true
		p.burnt++
		r.push(p, Message{"t": "burnt", "dish": p.oven.Dish})
		r.record(now, KindBurnt, p, nil, Message{"dish": p.oven.Dish})
	}
	for _, o := range slices.Clone(p.orders) {
		if now.Before(o.Deadline) {
			continue
		}
		p.streak = 0
		p.angry++
		r.dropOrder(p, o, now)
		r.push(p, Message{"t": "order_failed", "order_id": o.ID, "monster": o.Monster, "reason": FailAngry})
		r.record(now, KindAngry, p, nil, Message{"dish": o.Dish})
		changed = true
	}
	if r.arrive(p, now) {
		changed = true
	}
	switch {
	case p.ratID != "" && !now.Before(p.ratAt):
		stolen := ""
		if tray, ok := removeOne(p.tray, p.ratIngr); ok {
			p.tray, stolen = tray, p.ratIngr
		}
		r.push(p, Message{"t": "rat_result", "rat_id": p.ratID, "shooed": false, "ingredient": stolen})
		if stolen != "" {
			r.record(now, KindRat, p, nil, nil)
		}
		p.ratID, p.ratIngr, p.ratAt = "", "", time.Time{}
		p.nextRat = now.Add(r.ratDelay())
		changed = true
	case p.ratID == "" && !now.Before(p.nextRat):
		if len(p.tray) == 0 {
			p.nextRat = now.Add(r.ratDelay())
			break
		}
		p.ratSeq++
		p.ratID = fmt.Sprintf("r%d-%d", p.ID(), p.ratSeq)
		p.ratIngr = p.tray[r.rng.IntN(len(p.tray))]
		p.ratAt = now.Add(r.cfg.RatSteal)
		r.push(p, Message{"t": "rat_appear", "rat_id": p.ratID, "ingredient": p.ratIngr, "steal_ms": r.cfg.RatSteal.Milliseconds()})
		changed = true
	}
	return changed
}

// --- end of game ------------------------------------------------------------

func (r *Room) end(c *Client, now time.Time) error {
	if !r.canRun(c) {
		return ErrHostOnly
	}
	if r.phase != PhasePlaying {
		return ErrPhase
	}
	r.finish(now)
	return nil
}

// finish locks the room (GAME_OVER), ranks by coins and reports results.
func (r *Room) finish(now time.Time) {
	if r.phase != PhasePlaying {
		return
	}
	r.phase, r.ended = PhaseOver, now
	r.ranking = r.order()
	for i, p := range r.ranking {
		p.rank = i + 1
	}
	for _, p := range r.players {
		r.settle(p, true, now)
	}
	r.dirtyBoard, r.dirtyLobby = false, false
	for _, p := range r.players {
		if p.client != nil {
			p.client.push(r.podiumResult(p))
		}
	}
	if r.host != nil {
		r.host.push(r.podiumResult(nil))
	}
}

// order ranks players: still in the room first, then more coins, more
// serves, the earlier last serve, then join order.
func (r *Room) order() []*Player {
	out := append([]*Player(nil), r.players...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.left != b.left {
			return !a.left
		}
		if a.coins != b.coins {
			return a.coins > b.coins
		}
		if a.served != b.served {
			return a.served > b.served
		}
		if !a.lastServe.Equal(b.lastServe) {
			return a.lastServe.Before(b.lastServe)
		}
		return a.order < b.order
	})
	return out
}

func (r *Room) points(p *Player, finished bool) int {
	if !finished || p.left {
		return points.Abandoned(p.earned, p.answered(), MaxPoints)
	}
	return Award(p.earned, r.won(p))
}

// won reports the win bonus: rank 1 of a shared room (never in solo).
func (r *Room) won(p *Player) bool {
	return p.rank == 1 && !p.left && !r.solo
}

// canRun reports whether c may change settings, start or end the game: the
// host screen, or the owner of a solo kitchen.
func (r *Room) canRun(c *Client) bool {
	if c.Host {
		return true
	}
	return r.solo && c.ID() == r.owner
}

// Accuracy is correct / answered in percent (one decimal).
func Accuracy(correct, answered int) float64 {
	if answered == 0 {
		return 0
	}
	return math.Round(float64(correct)*1000/float64(answered)) / 10
}

func (r *Room) rankingView() []Message {
	out := make([]Message, len(r.ranking))
	for i, p := range r.ranking {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "rank": p.rank,
			"coins": p.coins, "served": p.served, "burnt": p.burnt, "angry": p.angry,
			"correct": p.correct, "answered": p.answered(), "accuracy": Accuracy(p.correct, p.answered()),
			"points": r.points(p, true), "left": p.left,
		}
	}
	return out
}

func (r *Room) youResult(p *Player) Message {
	return Message{
		"user_id": p.ID(), "rank": p.rank, "won": r.won(p), "points": r.points(p, true),
		"coins": p.coins, "served": p.served, "correct": p.correct, "answered": p.answered(),
	}
}

// podiumResult is the podium_result payload (you only for a player).
func (r *Room) podiumResult(p *Player) Message {
	ranking := r.rankingView()
	msg := Message{"t": "podium_result", "podium": ranking[:min(3, len(ranking))], "ranking": ranking}
	if p != nil {
		msg["you"] = r.youResult(p)
	}
	return msg
}

// settle queues the result of one player once.
func (r *Room) settle(p *Player, finished bool, now time.Time) {
	if p.reported || r.started.IsZero() {
		return
	}
	pts := r.points(p, finished)
	if (!finished || p.left) && pts == 0 {
		return
	}
	p.reported = true
	r.hub.queue(Result{
		EventID:     fmt.Sprintf("%s-%d-room-%d", Prefix, p.ID(), r.started.UnixNano()),
		UserID:      p.ID(),
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       p.Claims.Grade,
		Points:      pts,
		Correct:     min(p.correct, 500),
		Wrong:       min(p.wrong, 500),
		Seconds:     int(now.Sub(r.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     tail(p.answers, 100),
		Match:       r.match(finished, now),
	})
}

func tail(a []questions.Answer, n int) []questions.Answer {
	if len(a) > n {
		a = a[len(a)-n:]
	}
	return append([]questions.Answer{}, a...)
}

// match summarises the game for every player's history. Score is the coins,
// level the game length in minutes.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		order = r.order()
	}
	players := make([]record.Player, len(order))
	for i, p := range order {
		acc := Accuracy(p.correct, p.answered())
		players[i] = record.Player{
			UserID: p.ID(), Name: p.Claims.Name, Grade: p.Claims.Grade, Left: p.left,
			Score: p.coins, Correct: min(p.correct, 500), Wrong: min(p.wrong, 500), Rank: i + 1, Accuracy: &acc,
		}
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: r.mode(), Pin: r.Pin,
		Level: r.minutes, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
}

func (r *Room) mode() string {
	if r.solo {
		return record.ModeSolo
	}
	return record.ModeRoom
}

// close shuts the room: unfinished games pay what players achieved.
func (r *Room) close(now time.Time, reason string) {
	if r.closed {
		return
	}
	if r.phase == PhasePlaying {
		for _, p := range r.players {
			r.settle(p, false, now)
		}
	}
	msg := Message{"t": "state_sync", "phase": PhaseNone, "closed": reason}
	for _, p := range r.players {
		r.hub.dropPlayer(p.ID(), r)
		if p.client != nil {
			p.client.push(msg)
		}
	}
	if r.host != nil {
		r.host.push(msg)
	}
	r.hub.dropRoom(r)
	r.players, r.byID, r.feed = nil, nil, nil
	r.closed = true
}

// --- timers ---------------------------------------------------------------

func (r *Room) tick(now time.Time) {
	r.housekeep(now)
	if r.closed {
		return
	}
	if r.phase == PhasePlaying {
		if !now.Before(r.endsAt) {
			r.finish(now)
			return
		}
		for _, p := range r.players {
			if p.left {
				continue
			}
			if r.step(p, now) || now.Sub(p.kitchenAt) >= r.cfg.Kitchen {
				r.sendKitchen(p, now)
			}
		}
	}
	if now.Sub(r.flushedAt) >= r.cfg.Board {
		if r.dirtyLobby && r.phase != PhasePlaying {
			r.dirtyLobby, r.flushedAt = false, now
			r.broadcastState(now)
		}
		if r.dirtyBoard && r.phase == PhasePlaying {
			r.dirtyBoard, r.dirtyLobby, r.flushedAt = false, false, now
			r.broadcast(Message{"t": "leaderboard_sync", "leaderboard": r.leaderboard(), "remaining_ms": max(0, r.endsAt.Sub(now).Milliseconds())})
		}
	}
}

// housekeep drops lobby ghosts and closes idle or abandoned rooms.
func (r *Room) housekeep(now time.Time) {
	for _, p := range slices.Clone(r.players) {
		if r.phase == PhaseLobby && !p.online && !p.offlineAt.IsZero() && now.Sub(p.offlineAt) >= r.cfg.LobbyDrop {
			r.hub.dropPlayer(p.ID(), r)
			r.remove(p)
			r.dirtyLobby = true
		}
	}
	anyone := r.hostOnline
	for _, p := range r.players {
		anyone = anyone || p.online
	}
	if anyone {
		r.emptySince = time.Time{}
	} else if r.emptySince.IsZero() {
		r.emptySince = now
	}
	if (r.phase != PhasePlaying && now.Sub(r.touched) >= r.cfg.Idle) || (!r.emptySince.IsZero() && now.Sub(r.emptySince) >= r.cfg.Empty) {
		r.close(now, "idle")
	}
}

// --- views ----------------------------------------------------------------

func avatar(p *Player) any {
	if len(p.Avatar) == 0 {
		return nil
	}
	return p.Avatar
}

// broadcast sends one immutable message to the host and every player.
func (r *Room) broadcast(msg Message) {
	if r.host != nil {
		r.host.push(msg)
	}
	for _, p := range r.players {
		r.push(p, msg)
	}
}

func (r *Room) broadcastState(now time.Time) {
	if r.host != nil {
		r.sendState(r.host, now)
	}
	for _, p := range r.players {
		if p.client != nil {
			r.sendState(p.client, now)
		}
	}
}

// leaderboard ranks the live coins.
func (r *Room) leaderboard() []Message {
	order := r.order()
	out := make([]Message, len(order))
	for i, p := range order {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "coins": p.coins,
			"served": p.served, "rank": i + 1, "online": p.online, "left": p.left,
		}
	}
	return out
}

func (r *Room) questionView(p *Player, locale string) Message {
	q := p.question
	opts := make([]string, len(q.Options))
	for i, o := range q.Options {
		opts[i] = o.Get(locale)
	}
	return Message{
		"question_id": p.questionID, "ingredient": p.ingredient, "number": p.asked,
		"text": q.Prompt.Get(locale), "media": q.Media(), "subject": q.Subject, "options": opts,
	}
}

// kitchen is the private snapshot of one player (all *_ms remaining).
func (r *Room) kitchen(p *Player, now time.Time) Message {
	remaining := func(t time.Time) int64 { return max(0, t.Sub(now).Milliseconds()) }
	orders := make([]Message, len(p.orders))
	for i, o := range p.orders {
		left := max(0, o.Deadline.Sub(now))
		orders[i] = Message{
			"id": o.ID, "monster": o.Monster, "dish": o.Dish, "recipe": list(o.Recipe),
			"patience_ms": left.Milliseconds(), "patience_total_ms": o.Total.Milliseconds(), "mood": MoodOf(left, o.Total),
		}
	}
	oven := Message{"state": p.oven.State, "dish": p.oven.Dish, "items": list(p.oven.Items), "ready_in_ms": int64(0), "burn_in_ms": int64(0)}
	switch p.oven.State {
	case OvenCooking:
		oven["ready_in_ms"], oven["burn_in_ms"] = remaining(p.oven.ReadyAt), remaining(p.oven.BurnAt)
	case OvenReady:
		oven["burn_in_ms"] = remaining(p.oven.BurnAt)
	case "":
		oven["state"] = OvenEmpty
	}
	k := Message{
		"t": "kitchen_sync", "orders": orders, "tray": list(p.tray), "plate": list(p.plate), "oven": oven,
		"dish": nil, "question": nil, "rat": nil, "cooldown_ms": remaining(p.cooldown),
		"pies": p.pies, "score": p.coins, "served": p.served, "streak": p.streak,
		"correct": p.correct, "answered": p.answered(), "rank": r.rankOf(p), "of": r.active(),
	}
	if p.dish != nil {
		k["dish"] = Message{"dish": p.dish.Dish, "items": list(p.dish.Items)}
	}
	if p.questionID != "" && p.client != nil {
		k["question"] = r.questionView(p, p.client.Locale())
	}
	if p.ratID != "" {
		k["rat"] = Message{"rat_id": p.ratID, "ingredient": p.ratIngr, "steal_in_ms": remaining(p.ratAt)}
	}
	return k
}

func (r *Room) rankOf(p *Player) int {
	for i, q := range r.order() {
		if q == p {
			return i + 1
		}
	}
	return 0
}

func (r *Room) sendKitchen(p *Player, now time.Time) {
	p.kitchenAt = now
	if p.client != nil {
		p.client.push(r.kitchen(p, now))
	}
}

// sendState pushes the full snapshot (state_sync) to one client.
func (r *Room) sendState(c *Client, now time.Time) {
	role := "player"
	if c.Host {
		role = "host"
	}
	roster := make([]Message, 0, len(r.players))
	for _, p := range r.players {
		roster = append(roster, Message{
			"user_id": p.ID(), "name": p.Claims.Name, "grade": p.Claims.Grade, "character": avatar(p),
			"online": p.online, "left": p.left,
		})
	}
	msg := Message{
		"t": "state_sync", "pin": r.Pin, "phase": r.phase, "role": role, "subject": subjectOrMix(r.subject),
		"host_name": r.hostClaims.Name, "host_online": r.hostOnline,
		"roster": roster, "min_players": MinPlayers, "max_players": MaxPlayers,
		"minutes": r.minutes, "minutes_options": Minutes,
		"solo": r.solo, "owner": r.owner,
		"leaderboard": []Message{}, "feed": []Message{},
	}
	if r.phase == PhasePlaying {
		msg["remaining_ms"] = max(0, r.endsAt.Sub(now).Milliseconds())
		msg["leaderboard"] = r.leaderboard()
		msg["feed"] = slices.Clone(r.feed)
	}
	var you *Player
	if !c.Host {
		if p := r.byID[c.ID()]; p != nil && !p.left {
			msg["you"] = p.ID()
			you = p
		}
	}
	if r.phase == PhaseOver {
		msg["leaderboard"] = r.leaderboard()
		podium := r.podiumResult(you)
		delete(podium, "t")
		msg["podium"] = podium
	}
	c.push(msg)
}

func subjectOrMix(s string) string {
	if s == "" {
		return "mix"
	}
	return s
}

// AnswerOf returns the correct option of uid's pending question, -1 when
// none (tests and diagnostics, run through Hub.Inspect).
func AnswerOf(r *Room, uid int64) int {
	p := r.byID[uid]
	if p == nil || p.questionID == "" {
		return -1
	}
	return p.question.Answer
}

// ParsePlayerID reads the optional join `player_id` (string or number).
func ParsePlayerID(raw json.RawMessage) (int64, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, false
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if s == "" {
			return 0, false
		}
		id, err := strconv.ParseInt(s, 10, 64)
		return id, err == nil
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n, true
	}
	return -1, true
}
