package heist

import (
	"encoding/json"
	"fmt"
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
const FeedSize = 15

// Player is one student seat in a room. Owned by the room goroutine; gold
// and shields live in the room Ledger.
type Player struct {
	Claims auth.Claims
	// Avatar is the portal look (signed token claim, else the join payload).
	Avatar json.RawMessage
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	gen        *questions.Generator
	stage      string
	asked      int
	questionID string
	question   questions.Question
	askedAt    time.Time
	until      time.Time // cooldown end or target deadline
	chests     [Chests]Chest
	pending    Chest

	correct  int
	wrong    int
	earned   int
	opened   int
	steals   int
	swaps    int
	blocked  int
	answers  []questions.Answer
	reported bool
	rank     int
	gold     int64 // final balance, frozen at game over
}

// ID is the account id.
func (p *Player) ID() int64 { return p.Claims.Subject }

type reply struct {
	err error
	v   any
}

type command struct {
	kind     string
	c        *Client
	question string
	index    int
	target   int64
	win      string
	value    int64
	subject  string
	avatar   []byte
	at       time.Time
	fn       func(r *Room) any
	reply    chan reply
}

// Room runs one game in its own goroutine. Only that goroutine touches the
// fields below (the Ledger has its own lock); other goroutines send commands.
type Room struct {
	hub *Hub
	cfg Config
	Pin string

	host       *Client
	hostClaims auth.Claims
	hostOnline bool

	players []*Player
	byID    map[int64]*Player
	joined  int

	ledger  *Ledger
	phase   string
	subject string
	win     string
	minutes int
	target  int64
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
		ledger:     NewLedger(),
		phase:      PhaseLobby,
		win:        WinTime, minutes: DefaultMinutes, target: DefaultGold,
		rng:     rand.New(rand.NewPCG(seed, seed^0x4e15c0de)),
		touched: now,
		cmds:    make(chan command, h.cfg.Commands),
		done:    make(chan struct{}),
	}
}

// Ledger exposes the room's gold book (tests and diagnostics, read via Inspect).
func (r *Room) Ledger() *Ledger { return r.ledger }

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
	// Fail commands that raced with the close instead of leaving callers
	// waiting (do also watches done).
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
		res.err = r.configure(cmd.c, cmd.win, cmd.value, now)
	case "subject":
		res.err = r.setSubject(cmd.c, cmd.subject, now)
	case "answer":
		res.err = r.answer(cmd.c, cmd.question, cmd.index, cmd.at, now)
	case "chest":
		res.err = r.selectChest(cmd.c, cmd.index, now)
	case "target":
		res.err = r.executeTarget(cmd.c, cmd.target, now)
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
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		// Self-paced: late joiners enter the running game at 0 gold.
		if r.active() >= MaxPlayers {
			return ErrFull
		}
		p := r.seat(c, avatar)
		r.ledger.Open(p.ID())
		r.prepare(p, now)
		r.dirtyBoard = true
		r.sendState(c, now)
		return nil
	}
	if r.active() >= MaxPlayers {
		return ErrFull
	}
	r.seat(c, avatar)
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
	c.push(Message{"t": "state_sync", "phase": "NONE", "role": "player"})
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

func (r *Room) configure(c *Client, win string, value int64, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase == PhasePlaying {
		return ErrPhase
	}
	switch win {
	case WinTime:
		if !slices.Contains(TimeLimits, int(value)) {
			return ErrConfig
		}
		r.win, r.minutes = win, int(value)
	case WinGold:
		if !slices.Contains(GoldTargets, value) {
			return ErrConfig
		}
		r.win, r.target = win, value
	default:
		return ErrConfig
	}
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func (r *Room) setSubject(c *Client, subject string, now time.Time) error {
	if !c.Host {
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
	if !c.Host {
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
	ids := make([]int64, len(r.players))
	r.grade = r.players[0].Claims.Grade
	for i, p := range r.players {
		ids[i] = p.ID()
		r.grade = min(r.grade, p.Claims.Grade)
		*p = Player{Claims: p.Claims, Avatar: p.Avatar, client: p.client, order: p.order, online: true}
	}
	r.ledger.Reset(ids)
	r.feed, r.ranking, r.actions = nil, nil, 0
	r.started, r.ended = now, time.Time{}
	if r.win == WinTime {
		r.endsAt = now.Add(time.Duration(r.minutes) * time.Minute)
	} else {
		r.endsAt = now.Add(r.cfg.GoldCap)
	}
	r.phase = PhasePlaying
	for _, p := range r.players {
		r.prepare(p, now)
	}
	r.dirtyLobby, r.dirtyBoard = false, false
	r.broadcastState(now)
	return nil
}

// prepare gives a player their own question stream at their own grade.
func (r *Room) prepare(p *Player, now time.Time) {
	p.gen = questions.NewFor(GameKey, p.Claims.Grade, r.rng.Uint64()).For(r.subject, p.ID()).AtLevel(p.Claims.Level)
	r.ask(p, now)
}

// ask sends the player's next question (stage QUESTION).
func (r *Room) ask(p *Player, now time.Time) {
	p.asked++
	p.question = p.gen.Present(p.gen.Choice(), Options)
	p.questionID = fmt.Sprintf("%d-%d", p.ID(), p.asked)
	p.askedAt, p.until, p.stage = now, time.Time{}, StageQuestion
	p.chests, p.pending = [Chests]Chest{}, Chest{}
	if p.client != nil {
		p.client.push(Message{"t": "question", "question": r.questionView(p, p.client.Locale())})
		r.sendYou(p, now)
	}
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

func (r *Room) answer(c *Client, questionID string, choice int, at, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	if p.stage != StageQuestion {
		return ErrStage
	}
	if questionID != p.questionID {
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
	msg := Message{"t": "answer_result", "question_id": questionID, "correct": right, "choice": choice, "correct_index": q.Answer, "hint": q.Hint.Get(c.Locale())}
	if right {
		p.correct++
		if p.correct <= MaxScoredAnswers {
			p.earned += q.Worth()
		}
		p.stage = StageChest
		p.chests = RollChests(r.rng, r.rivals(p) > 0)
	} else {
		p.wrong++
		p.stage, p.until = StageCooldown, now.Add(r.cfg.Cooldown)
		msg["cooldown_ms"] = r.cfg.Cooldown.Milliseconds()
	}
	c.push(msg)
	r.sendYou(p, now)
	r.dirtyBoard = true
	return nil
}

// rivals counts players p may target.
func (r *Room) rivals(p *Player) int {
	n := 0
	for _, q := range r.players {
		if q != p && !q.left {
			n++
		}
	}
	return n
}

func (r *Room) selectChest(c *Client, index int, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	if p.stage != StageChest {
		return ErrStage
	}
	if index < 0 || index >= Chests {
		return ErrChest
	}
	chest := p.chests[index]
	if chest.RequiresTarget() && r.rivals(p) == 0 {
		chest = noTarget
		p.chests[index] = chest
	}
	p.opened++
	reveal := make([]Message, Chests)
	for i, ch := range p.chests {
		reveal[i] = ch.view()
	}
	result := chest.view()
	result["t"], result["chest_index"], result["chests"] = "chest_result", index, reveal

	if chest.RequiresTarget() {
		p.stage, p.pending, p.until = StageTarget, chest, now.Add(r.cfg.TargetTime)
		result["target_ms"] = r.cfg.TargetTime.Milliseconds()
		result["gold"], result["delta"] = r.ledger.Gold(p.ID()), int64(0)
		c.push(result)
		r.sendYou(p, now)
		return nil
	}

	var gold, delta int64
	switch chest.Type {
	case ChestAddGold:
		if chest.Unit == UnitPercent {
			gold, delta, _ = r.ledger.AddPercent(p.ID(), chest.Value, PercentFloor(chest.Value))
		} else {
			gold, delta, _ = r.ledger.Add(p.ID(), chest.Value)
		}
	case ChestLoseGold, ChestBankrupt:
		gold, delta, _ = r.ledger.LosePercent(p.ID(), chest.Value)
	case ChestShield:
		r.ledger.Arm(p.ID())
		gold = r.ledger.Gold(p.ID())
	}
	result["gold"], result["delta"] = gold, delta
	c.push(result)
	r.balance(p, gold, delta, chest.Type)
	r.record(now, Message{"source_player": r.ref(p), "action": chest.Type, "amount": delta, "value": chest.Value, "unit": chest.Unit})
	r.ask(p, now)
	r.checkTarget(now)
	return nil
}

func (r *Room) executeTarget(c *Client, targetID int64, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	if p.stage != StageTarget {
		return ErrStage
	}
	t := r.byID[targetID]
	if t == nil || t == p || t.left {
		return ErrTarget
	}
	chest := p.pending
	var tr Transfer
	var ok bool
	if chest.Type == ChestSwap {
		tr, ok = r.ledger.Swap(p.ID(), t.ID())
	} else {
		tr, ok = r.ledger.Steal(p.ID(), t.ID(), chest.Value)
	}
	if !ok {
		return ErrTarget
	}
	action := chest.Type
	if tr.Blocked {
		action = "BLOCKED"
		t.blocked++
	} else if chest.Type == ChestSwap {
		p.swaps++
	} else {
		p.steals++
	}
	targetDelta := -tr.Amount
	if tr.Blocked {
		targetDelta = 0
	}
	r.balance(p, tr.AttackerGold, tr.Amount, action)
	r.balance(t, tr.TargetGold, targetDelta, action)
	r.record(now, Message{
		"source_player": r.ref(p), "target_player": r.ref(t), "action": action, "attempt": chest.Type,
		"amount": tr.Amount, "value": chest.Value, "unit": chest.Unit, "blocked": tr.Blocked,
	})
	r.ask(p, now)
	r.checkTarget(now)
	return nil
}

// balance tells the owner and the host about a balance change.
func (r *Room) balance(p *Player, gold, delta int64, reason string) {
	acc, _ := r.ledger.Get(p.ID())
	msg := Message{"t": "balance_update", "player_id": p.ID(), "gold": gold, "delta": delta, "reason": reason}
	if p.client != nil {
		own := Message{"has_shield": acc.Shield}
		for k, v := range msg {
			own[k] = v
		}
		p.client.push(own)
	}
	if r.host != nil {
		r.host.push(msg)
	}
	r.dirtyBoard = true
}

// record adds an action to the feed and broadcasts it: to the host always,
// to players when they are involved or when it is a heist or a bomb.
func (r *Room) record(now time.Time, action Message) {
	r.actions++
	action["t"], action["id"], action["at"] = "action_broadcast", r.actions, now.UnixMilli()
	r.feed = append(r.feed, action)
	if len(r.feed) > FeedSize {
		r.feed = r.feed[len(r.feed)-FeedSize:]
	}
	if r.host != nil {
		r.host.push(action)
	}
	kind, _ := action["action"].(string)
	public := kind == ChestSteal || kind == ChestSwap || kind == "BLOCKED" || kind == ChestBankrupt
	src, _ := action["source_player"].(Message)
	dst, _ := action["target_player"].(Message)
	for _, p := range r.players {
		if p.client == nil {
			continue
		}
		involved := (src != nil && src["user_id"] == p.ID()) || (dst != nil && dst["user_id"] == p.ID())
		if public || involved {
			p.client.push(action)
		}
	}
}

func (r *Room) ref(p *Player) Message {
	return Message{"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p)}
}

// checkTarget ends a gold target game once somebody reaches the goal.
func (r *Room) checkTarget(now time.Time) {
	if r.phase != PhasePlaying || r.win != WinGold {
		return
	}
	for _, a := range r.ledger.Snapshot() {
		if a.Gold >= r.target {
			r.finish(now)
			return
		}
	}
}

func (r *Room) end(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhasePlaying {
		return ErrPhase
	}
	r.finish(now)
	return nil
}

// finish locks the room (GAME_OVER), ranks by gold and reports results.
func (r *Room) finish(now time.Time) {
	if r.phase != PhasePlaying {
		return
	}
	r.phase, r.ended = PhaseOver, now
	book := r.ledger.Snapshot()
	for _, p := range r.players {
		p.gold = book[p.ID()].Gold
		p.stage, p.pending, p.until = "", Chest{}, time.Time{}
	}
	r.ranking = rank(r.players)
	for i, p := range r.ranking {
		p.rank = i + 1
	}
	for _, p := range r.players {
		r.settle(p, true, now)
	}
	r.dirtyBoard, r.dirtyLobby = false, false
	podium := r.podium()
	top := podium[:min(3, len(podium))]
	for _, p := range r.players {
		if p.client != nil {
			p.client.push(Message{"t": "podium_result", "podium": top, "ranking": podium, "you": r.youResult(p)})
		}
	}
	if r.host != nil {
		r.host.push(Message{"t": "podium_result", "podium": top, "ranking": podium})
	}
}

// rank orders players: still in the room first, then more gold, more
// correct answers, then join order.
func rank(players []*Player) []*Player {
	out := append([]*Player(nil), players...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.left != b.left {
			return !a.left
		}
		if a.gold != b.gold {
			return a.gold > b.gold
		}
		if a.correct != b.correct {
			return a.correct > b.correct
		}
		return a.order < b.order
	})
	return out
}

func (r *Room) points(p *Player, finished bool) int {
	if !finished || p.left {
		return points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	}
	return Award(p.earned, p.rank == 1)
}

func (r *Room) podium() []Message {
	out := make([]Message, len(r.ranking))
	for i, p := range r.ranking {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "rank": p.rank,
			"gold": p.gold, "correct": p.correct, "wrong": p.wrong, "steals": p.steals, "swaps": p.swaps,
			"left": p.left,
		}
	}
	return out
}

func (r *Room) youResult(p *Player) Message {
	return Message{
		"user_id": p.ID(), "rank": p.rank, "won": p.rank == 1, "points": r.points(p, true),
		"gold": p.gold, "correct": p.correct, "wrong": p.wrong, "steals": p.steals, "swaps": p.swaps,
	}
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

// match summarises the game for every player's history. Score is the gold.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		book := r.ledger.Snapshot()
		for _, p := range r.players {
			p.gold = book[p.ID()].Gold
		}
		order = rank(r.players)
	}
	players := make([]record.Player, len(order))
	for i, p := range order {
		players[i] = record.Player{
			UserID: p.ID(), Name: p.Claims.Name, Grade: p.Claims.Grade, Left: p.left,
			Score: int(p.gold), Correct: min(p.correct, 500), Wrong: min(p.wrong, 500), Rank: i + 1,
		}
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: record.ModeRoom, Pin: r.Pin,
		Level: 0, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
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
	msg := Message{"t": "state_sync", "phase": "NONE", "closed": reason}
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
			if p.left || p.until.IsZero() || now.Before(p.until) {
				continue
			}
			switch p.stage {
			case StageCooldown:
				r.ask(p, now)
			case StageTarget:
				if p.client != nil {
					p.client.push(Message{"t": "heist_expired", "type": p.pending.Type})
				}
				r.ask(p, now)
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
			board := r.leaderboard()
			r.broadcast(Message{"t": "leaderboard_sync", "leaderboard": board, "remaining_ms": max(0, r.endsAt.Sub(now).Milliseconds())})
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
		if p.client != nil {
			p.client.push(msg)
		}
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

// leaderboard ranks the live balances. Shields stay private to their owner.
func (r *Room) leaderboard() []Message {
	book := r.ledger.Snapshot()
	order := append([]*Player(nil), r.players...)
	sort.SliceStable(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if a.left != b.left {
			return !a.left
		}
		if ga, gb := book[a.ID()].Gold, book[b.ID()].Gold; ga != gb {
			return ga > gb
		}
		return a.order < b.order
	})
	out := make([]Message, len(order))
	for i, p := range order {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "gold": book[p.ID()].Gold,
			"rank": i + 1, "online": p.online, "left": p.left, "correct": p.correct,
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
	return Message{"id": p.questionID, "number": p.asked, "text": q.Prompt.Get(locale), "media": q.Media(), "subject": q.Subject, "options": opts}
}

// you is the private state of one player.
func (r *Room) you(p *Player, now time.Time) Message {
	acc, _ := r.ledger.Get(p.ID())
	gold := acc.Gold
	if r.phase == PhaseOver {
		gold = p.gold
	}
	you := Message{
		"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "gold": gold, "has_shield": acc.Shield && r.phase == PhasePlaying,
		"stage": p.stage, "correct": p.correct, "wrong": p.wrong, "steals": p.steals, "swaps": p.swaps,
	}
	switch p.stage {
	case StageQuestion:
		if p.client != nil {
			you["question"] = r.questionView(p, p.client.Locale())
		}
	case StageCooldown:
		you["cooldown_ms"] = max(0, p.until.Sub(now).Milliseconds())
	case StageTarget:
		you["pending"] = p.pending.view()
		you["target_ms"] = max(0, p.until.Sub(now).Milliseconds())
	}
	return you
}

func (r *Room) sendYou(p *Player, now time.Time) {
	if p.client != nil {
		p.client.push(Message{"t": "player_sync", "you": r.you(p, now)})
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
		"host":    Message{"user_id": r.hostClaims.Subject, "name": r.hostClaims.Name, "online": r.hostOnline},
		"players": roster, "min_players": MinPlayers, "max_players": MaxPlayers,
		"win": r.win, "minutes": r.minutes, "target_gold": r.target,
		"time_limits": TimeLimits, "gold_targets": GoldTargets,
		"cooldown_ms": r.cfg.Cooldown.Milliseconds(),
	}
	if r.phase == PhasePlaying {
		msg["remaining_ms"] = max(0, r.endsAt.Sub(now).Milliseconds())
		msg["leaderboard"] = r.leaderboard()
		msg["feed"] = slices.Clone(r.feed)
	}
	if r.phase == PhaseOver {
		podium := r.podium()
		msg["podium"] = podium[:min(3, len(podium))]
		msg["ranking"] = podium
	}
	if !c.Host {
		if p := r.byID[c.ID()]; p != nil && !p.left {
			msg["you"] = r.you(p, now)
			if r.phase == PhaseOver {
				msg["result"] = r.youResult(p)
			}
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

// ParsePlayerID reads the optional join `player_id` (string or number).
func ParsePlayerID(raw json.RawMessage) (int64, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, false
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		id, err := strconv.ParseInt(s, 10, 64)
		return id, err == nil
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n, true
	}
	return -1, true
}
