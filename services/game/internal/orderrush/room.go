package orderrush

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

// FeedSize is how many recent power-up actions the state snapshot carries.
const FeedSize = 15

// Player is one student seat in a room. Owned by the room goroutine;
// scores, streaks and power-ups live in the room Scoreboard.
type Player struct {
	Claims auth.Claims
	// Avatar is the portal look (signed token claim, else the join payload).
	Avatar json.RawMessage
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	set        Set
	question   SequenceQuestion
	asked      int
	askedAt    time.Time
	lastSubmit time.Time
	tries      int // wrong submissions on the current module

	solved     int
	wrong      int
	earned     int
	solveMs    int64
	finishedAt time.Time
	stats      map[string]*CategoryStat
	statOrder  []string

	reported bool
	rank     int
	score    int64 // final score, frozen at game over
	best     int
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
	order    []string
	power    string
	target   int64
	mode     string
	value    int
	sets     []string
	avatar   []byte
	at       time.Time
	fn       func(r *Room) any
	reply    chan reply
}

// Room runs one game in its own goroutine. Only that goroutine touches the
// fields below (the Scoreboard has its own lock); others send commands.
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

	board   *Scoreboard
	bank    *Bank
	phase   string
	mode    string
	modules int
	minutes int
	sets    []string
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
		board:      NewScoreboard(),
		bank:       Current(),
		phase:      PhaseLobby,
		mode:       ModeRace, modules: DefaultModules, minutes: DefaultMinutes,
		rng:     rand.New(rand.NewPCG(seed, seed^0x5e9e11ce)),
		touched: now,
		cmds:    make(chan command, h.cfg.Commands),
		done:    make(chan struct{}),
	}
}

// Board exposes the room scoreboard (tests and diagnostics, via Inspect).
func (r *Room) Board() *Scoreboard { return r.board }

// QuestionFor returns a player's current module including its answer
// (tests and diagnostics, via Inspect; never sent to clients).
func (r *Room) QuestionFor(id int64) SequenceQuestion {
	if p := r.byID[id]; p != nil {
		return p.question
	}
	return SequenceQuestion{}
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
		res.err = r.configure(cmd.c, cmd.mode, cmd.value, cmd.sets, now)
	case "submit":
		res.err = r.submit(cmd.c, cmd.question, cmd.order, cmd.at, now)
	case "powerup":
		res.err = r.usePowerUp(cmd.c, cmd.power, cmd.target, cmd.at, now)
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
	if r.active() >= MaxPlayers {
		return ErrFull
	}
	p := r.seat(c, avatar)
	if r.phase == PhaseActive {
		// Late joiners start the running race from module 1 at 0 points.
		r.board.Open(p.ID())
		r.ask(p, now)
		r.dirtyBoard = true
	} else {
		r.dirtyLobby = true
	}
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
		if r.phase == PhaseActive {
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

func (r *Room) configure(c *Client, mode string, value int, sets []string, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase == PhaseActive {
		return ErrPhase
	}
	switch mode {
	case ModeRace:
		if !slices.Contains(RaceTargets, value) {
			return ErrConfig
		}
	case ModeTimeAttack:
		if !slices.Contains(TimeLimits, value) {
			return ErrConfig
		}
	default:
		return ErrConfig
	}
	bank := Current()
	clean := make([]string, 0, len(sets))
	for _, k := range sets {
		if len(clean) >= len(bank.Sets) {
			break
		}
		if _, ok := bank.Get(k); !ok {
			return ErrConfig
		}
		if !slices.Contains(clean, k) {
			clean = append(clean, k)
		}
	}
	r.mode = mode
	if mode == ModeRace {
		r.modules = value
	} else {
		r.minutes = value
	}
	r.sets, r.bank = clean, bank
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

// --- game flow ------------------------------------------------------------

func (r *Room) start(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase == PhaseActive {
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
	r.bank = Current()
	ids := make([]int64, len(r.players))
	r.grade = r.players[0].Claims.Grade
	for i, p := range r.players {
		ids[i] = p.ID()
		r.grade = min(r.grade, p.Claims.Grade)
		*p = Player{Claims: p.Claims, Avatar: p.Avatar, client: p.client, order: p.order, online: true}
	}
	r.board.Reset(ids)
	r.feed, r.ranking, r.actions = nil, nil, 0
	r.started, r.ended = now, time.Time{}
	if r.mode == ModeTimeAttack {
		r.endsAt = now.Add(time.Duration(r.minutes) * time.Minute)
	} else {
		r.endsAt = now.Add(r.cfg.RaceCap)
	}
	r.phase = PhaseActive
	for _, p := range r.players {
		r.ask(p, now)
	}
	r.dirtyLobby, r.dirtyBoard = false, false
	r.broadcastState(now)
	return nil
}

// ask deals the player's next module.
func (r *Room) ask(p *Player, now time.Time) {
	p.set = pickSet(r.bank, r.sets, p.set.Key, r.rng)
	p.asked++
	locale := "id"
	if p.client != nil {
		locale = p.client.Locale()
	}
	p.question = p.set.Deal(fmt.Sprintf("%d-%d", p.ID(), p.asked), locale, r.rng)
	p.askedAt, p.tries = now, 0
}

func (r *Room) player(c *Client) (*Player, error) {
	if c.Host {
		return nil, ErrPlayerOnly
	}
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return nil, ErrNoRoom
	}
	if r.phase != PhaseActive {
		return nil, ErrPhase
	}
	return p, nil
}

func (p *Player) stat(q SequenceQuestion) *CategoryStat {
	if p.stats == nil {
		p.stats = map[string]*CategoryStat{}
	}
	s := p.stats[q.Set]
	if s == nil {
		s = &CategoryStat{Set: q.Set, Category: q.Category}
		p.stats[q.Set] = s
		p.statOrder = append(p.statOrder, q.Set)
	}
	return s
}

// submit validates one order. A malformed order (wrong length, unknown or
// repeated ids) is rejected without counting; a well-formed wrong order
// breaks the streak and reports the first wrong slot; a correct order
// scores and deals the next module.
func (r *Room) submit(c *Client, questionID string, order []string, at, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	if questionID != p.question.ID {
		return ErrStale
	}
	if r.board.Frozen(p.ID(), at) {
		return ErrFrozen
	}
	if at.Sub(p.askedAt) < r.cfg.MinSubmit || (!p.lastSubmit.IsZero() && at.Sub(p.lastSubmit) < r.cfg.Retry) {
		return ErrTooFast
	}
	if !WellFormed(order, p.question.CorrectOrder) {
		return ErrOrder
	}
	p.lastSubmit = at
	q := p.question
	slot := q.Check(order)
	st := p.stat(q)
	st.Attempts++
	elapsed := at.Sub(p.askedAt)
	msg := Message{
		"t": "sequence_validated", "question_id": q.ID, "category": q.Category, "kind": q.Kind,
		"total_slots": q.TotalSlots, "ends": len(q.Ends), "duration_ms": elapsed.Milliseconds(),
	}
	if slot >= 0 {
		p.wrong++
		p.tries++
		st.Wrong++
		if st.SlotErrors == nil {
			st.SlotErrors = make([]int, q.TotalSlots)
		}
		if slot < len(st.SlotErrors) {
			st.SlotErrors[slot]++
		}
		acc := r.board.Wrong(p.ID())
		msg["is_correct"], msg["error_slot_index"], msg["earned_score"] = false, slot, 0
		msg["streak"], msg["score"], msg["step"] = acc.Streak, acc.Score, p.solved
		c.push(msg)
		r.dirtyBoard = true
		return nil
	}

	bonus := SpeedScore(elapsed)
	earned := int64(BaseScore) + bonus
	acc, granted := r.board.Correct(p.ID(), earned, r.rng)
	p.solved++
	p.solveMs += elapsed.Milliseconds()
	p.best = acc.Best
	st.Solved++
	st.TotalMs += elapsed.Milliseconds()
	if p.solved <= MaxScoredModules {
		p.earned += points.Worth(0, p.Claims.Level)
	}
	msg["is_correct"], msg["error_slot_index"], msg["earned_score"] = true, -1, earned
	msg["speed_bonus"], msg["streak"], msg["score"], msg["step"] = bonus, acc.Streak, acc.Score, p.solved
	msg["inventory"] = acc.Inventory
	if granted != "" {
		msg["powerup_granted"] = granted
	}
	r.dirtyBoard = true

	if r.mode == ModeRace && p.solved >= r.modules {
		p.finishedAt = now
		c.push(msg)
		r.finish(now)
		return nil
	}
	r.ask(p, now)
	msg["next_question"] = p.question
	c.push(msg)
	return nil
}

// leaderRival picks the best placed rival of p (auto target).
func (r *Room) leaderRival(p *Player) *Player {
	book := r.board.Snapshot()
	var best *Player
	for _, q := range r.players {
		if q == p || q.left {
			continue
		}
		if best == nil || book[q.ID()].Score > book[best.ID()].Score {
			best = q
		}
	}
	return best
}

func (r *Room) usePowerUp(c *Client, kind string, targetID int64, at, now time.Time) error {
	p, err := r.player(c)
	if err != nil {
		return err
	}
	switch kind {
	case PowerShield:
		acc, err := r.board.ArmShield(p.ID())
		if err != nil {
			return err
		}
		c.push(Message{"t": "powerup_result", "type": kind, "blocked": false, "inventory": acc.Inventory, "shield": true})
		r.record(now, Message{"source_player": r.ref(p), "type": kind})
		return nil
	case PowerTangle, PowerFreeze:
	default:
		return ErrPowerUp
	}
	var target *Player
	if targetID == 0 {
		target = r.leaderRival(p)
	} else {
		target = r.byID[targetID]
	}
	if target == nil || target == p || target.left {
		return ErrTarget
	}
	duration := r.cfg.Tangle
	if kind == PowerFreeze {
		duration = r.cfg.Freeze
	}
	res, err := r.board.Sabotage(p.ID(), target.ID(), kind, duration, at)
	if err != nil {
		return err
	}
	c.push(Message{
		"t": "powerup_result", "type": kind, "blocked": res.Blocked, "inventory": res.Remaining,
		"target_player": r.ref(target),
	})
	if target.client != nil {
		hit := Message{
			"t": "sabotage_received", "attacker_name": p.Claims.Name, "attacker": r.ref(p),
			"type": kind, "duration_ms": duration.Milliseconds(), "blocked": res.Blocked,
		}
		if res.Blocked {
			hit["duration_ms"] = 0
		}
		target.client.push(hit)
	}
	r.record(now, Message{"source_player": r.ref(p), "target_player": r.ref(target), "type": kind, "blocked": res.Blocked})
	r.dirtyBoard = true
	return nil
}

// record adds a power-up action to the feed: the host marquee gets every
// action, players only the ones they are part of.
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
	src, _ := action["source_player"].(Message)
	dst, _ := action["target_player"].(Message)
	for _, p := range r.players {
		if p.client == nil {
			continue
		}
		if (src != nil && src["user_id"] == p.ID()) || (dst != nil && dst["user_id"] == p.ID()) {
			p.client.push(action)
		}
	}
}

func (r *Room) ref(p *Player) Message {
	return Message{"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p)}
}

func (r *Room) end(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseActive {
		return ErrPhase
	}
	r.finish(now)
	return nil
}

// finish locks the room (GAME_OVER), ranks players and reports results.
func (r *Room) finish(now time.Time) {
	if r.phase != PhaseActive {
		return
	}
	r.phase, r.ended = PhaseOver, now
	book := r.board.Snapshot()
	for _, p := range r.players {
		p.score = book[p.ID()].Score
		p.best = max(p.best, book[p.ID()].Best)
	}
	r.ranking = r.rank(r.players)
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

// rank orders players: still in the room first; a race by finish time,
// modules solved then score; a time attack by score then modules; then
// join order.
func (r *Room) rank(players []*Player) []*Player {
	out := append([]*Player(nil), players...)
	race := r.mode == ModeRace
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.left != b.left {
			return !a.left
		}
		if race {
			af, bf := !a.finishedAt.IsZero(), !b.finishedAt.IsZero()
			if af != bf {
				return af
			}
			if af && !a.finishedAt.Equal(b.finishedAt) {
				return a.finishedAt.Before(b.finishedAt)
			}
			if a.solved != b.solved {
				return a.solved > b.solved
			}
		}
		if a.score != b.score {
			return a.score > b.score
		}
		if a.solved != b.solved {
			return a.solved > b.solved
		}
		return a.order < b.order
	})
	return out
}

func accuracy(p *Player) float64 {
	total := p.solved + p.wrong
	if total == 0 {
		return 0
	}
	return float64(int(float64(p.solved)*1000/float64(total))) / 10
}

func avgMs(p *Player) int64 {
	if p.solved == 0 {
		return 0
	}
	return p.solveMs / int64(p.solved)
}

func (r *Room) points(p *Player, finished bool) int {
	if !finished || p.left {
		return points.Abandoned(p.earned, p.solved+p.wrong, MaxPoints)
	}
	return Award(p.earned, p.rank == 1)
}

func (r *Room) podium() []Message {
	out := make([]Message, len(r.ranking))
	for i, p := range r.ranking {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "rank": p.rank,
			"score": p.score, "step": p.solved, "wrong": p.wrong, "accuracy": accuracy(p),
			"avg_ms": avgMs(p), "best_streak": p.best, "finished": !p.finishedAt.IsZero(), "left": p.left,
		}
	}
	return out
}

func (r *Room) youResult(p *Player) Message {
	return Message{
		"user_id": p.ID(), "rank": p.rank, "won": p.rank == 1, "points": r.points(p, true),
		"score": p.score, "step": p.solved, "wrong": p.wrong, "accuracy": accuracy(p),
		"avg_ms": avgMs(p), "best_streak": p.best,
	}
}

// settle queues the result of one player once.
func (r *Room) settle(p *Player, finished bool, now time.Time) {
	if p.reported || r.started.IsZero() {
		return
	}
	if !finished || p.left {
		p.score = r.liveScore(p)
	}
	pts := r.points(p, finished)
	if (!finished || p.left) && pts == 0 {
		return
	}
	p.reported = true
	stats := make([]CategoryStat, 0, len(p.statOrder))
	for _, k := range p.statOrder {
		s := *p.stats[k]
		s.SlotErrors = append([]int{}, s.SlotErrors...)
		stats = append(stats, s)
	}
	r.hub.queue(Result{
		EventID:     fmt.Sprintf("%s-%d-room-%d", Prefix, p.ID(), r.started.UnixNano()),
		UserID:      p.ID(),
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       p.Claims.Grade,
		Points:      pts,
		Correct:     min(p.solved, 500),
		Wrong:       min(p.wrong, 500),
		Seconds:     int(now.Sub(r.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     []questions.Answer{},
		Match:       r.match(finished, now),
		Sequences:   stats,
	})
}

func (r *Room) liveScore(p *Player) int64 {
	acc, _ := r.board.Get(p.ID())
	return acc.Score
}

// match summarises the game for every player's history. Score is the
// race score; accuracy is solved / submitted orders.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		book := r.board.Snapshot()
		for _, p := range r.players {
			p.score = book[p.ID()].Score
		}
		order = r.rank(r.players)
	}
	players := make([]record.Player, len(order))
	for i, p := range order {
		acc := accuracy(p)
		players[i] = record.Player{
			UserID: p.ID(), Name: p.Claims.Name, Grade: p.Claims.Grade, Left: p.left,
			Score: int(p.score), Correct: min(p.solved, 500), Wrong: min(p.wrong, 500), Rank: i + 1,
			Accuracy: &acc,
		}
	}
	level := r.modules
	if r.mode == ModeTimeAttack {
		level = r.minutes
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: record.ModeRoom, Pin: r.Pin,
		Level: level, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
}

// close shuts the room: unfinished games pay what players achieved.
func (r *Room) close(now time.Time, reason string) {
	if r.closed {
		return
	}
	if r.phase == PhaseActive {
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
	if r.phase == PhaseActive && !now.Before(r.endsAt) {
		r.finish(now)
		return
	}
	if now.Sub(r.flushedAt) >= r.cfg.Board {
		if r.dirtyLobby && r.phase != PhaseActive {
			r.dirtyLobby, r.flushedAt = false, now
			r.broadcastState(now)
		}
		if r.dirtyBoard && r.phase == PhaseActive {
			r.dirtyBoard, r.dirtyLobby, r.flushedAt = false, false, now
			r.broadcast(Message{"t": "race_progress_broadcast", "leaderboard": r.leaderboard(), "remaining_ms": max(0, r.endsAt.Sub(now).Milliseconds())})
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
	if (r.phase != PhaseActive && now.Sub(r.touched) >= r.cfg.Idle) || (!r.emptySince.IsZero() && now.Sub(r.emptySince) >= r.cfg.Empty) {
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

// leaderboard ranks live progress. Shields and inventories stay private.
func (r *Room) leaderboard() []Message {
	book := r.board.Snapshot()
	order := append([]*Player(nil), r.players...)
	race := r.mode == ModeRace
	sort.SliceStable(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if a.left != b.left {
			return !a.left
		}
		if race && a.solved != b.solved {
			return a.solved > b.solved
		}
		if sa, sb := book[a.ID()].Score, book[b.ID()].Score; sa != sb {
			return sa > sb
		}
		return a.order < b.order
	})
	out := make([]Message, len(order))
	for i, p := range order {
		acc := book[p.ID()]
		out[i] = Message{
			"id": strconv.FormatInt(p.ID(), 10), "user_id": p.ID(), "username": p.Claims.Name, "name": p.Claims.Name,
			"avatar": avatar(p), "character": avatar(p), "score": acc.Score, "step": p.solved, "streak": acc.Streak,
			"rank": i + 1, "online": p.online, "left": p.left,
		}
	}
	return out
}

// you is the private state of one player.
func (r *Room) you(p *Player, now time.Time) Message {
	acc, _ := r.board.Get(p.ID())
	score := acc.Score
	if r.phase == PhaseOver {
		score = p.score
	}
	you := Message{
		"user_id": p.ID(), "name": p.Claims.Name, "character": avatar(p), "score": score, "streak": acc.Streak,
		"step": p.solved, "wrong": p.wrong, "shield": acc.Shield && r.phase == PhaseActive,
		"inventory": acc.Inventory,
	}
	if acc.Inventory == nil {
		you["inventory"] = []string{}
	}
	if r.phase == PhaseActive {
		if p.client != nil {
			you["question"] = p.question.Relabel(p.set, p.client.Locale())
		}
		if left := acc.FrozenUntil.Sub(now); left > 0 {
			you["frozen_ms"] = left.Milliseconds()
		}
		if left := acc.TangledUntil.Sub(now); left > 0 {
			you["tangled_ms"] = left.Milliseconds()
		}
	}
	return you
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
	sets := r.sets
	if sets == nil {
		sets = []string{}
	}
	msg := Message{
		"t": "state_sync", "pin": r.Pin, "phase": r.phase, "role": role,
		"host":    Message{"user_id": r.hostClaims.Subject, "name": r.hostClaims.Name, "online": r.hostOnline},
		"players": roster, "min_players": MinPlayers, "max_players": MaxPlayers,
		"mode": r.mode, "modules": r.modules, "minutes": r.minutes, "sets": sets,
		"catalog": Current().Catalog(c.Locale()), "race_targets": RaceTargets, "time_limits": TimeLimits,
		"combo_every": ComboEvery,
	}
	if r.phase == PhaseActive {
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

// ParsePlayerID reads an optional player id (string or number).
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
		if err != nil {
			return -1, true
		}
		return id, true
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n, true
	}
	return -1, true
}
