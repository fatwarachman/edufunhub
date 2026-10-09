package floordrop

import (
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"sync/atomic"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

// Player is one student seat in a room. Owned by the room goroutine.
type Player struct {
	Claims auth.Claims
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	alive bool
	// lives is how many more wrong answers the floor takes (Lives at start).
	lives    int
	outRound int // round of elimination (0 = still standing)
	outAt    time.Time
	reason   string // wrong, timeout, disconnected, left

	// Current round.
	choice   int
	answered bool
	answerMs int64
	// Submission of the round they dropped in (ranks a shared drop).
	outAnswered bool
	outMs       int64

	rounds   int // questions faced while standing
	correct  int
	totalMs  int64
	earned   int
	answers  []questions.Answer
	reported bool
	rank     int
}

// ID is the account id.
func (p *Player) ID() int64 { return p.Claims.Subject }

// RoundState is the question being played.
type RoundState struct {
	ID         int64
	Number     int
	Question   questions.Question
	Limit      time.Duration
	Start      time.Time
	Deadline   time.Time
	Answered   int
	Tiles      [Options]int
	Eliminated []int64
	// Cracked lists players whose floor cracked this round (lost a life).
	Cracked     []int64
	SuddenDeath bool
}

// gate publishes whether answers are accepted, so connection goroutines
// refuse late answers at reception without waiting for the room.
type gate struct {
	round    atomic.Int64
	deadline atomic.Int64 // unix nanoseconds
	open     atomic.Bool
}

func (g *gate) set(round int64, deadline time.Time) {
	g.round.Store(round)
	g.deadline.Store(deadline.UnixNano())
	g.open.Store(true)
}

func (g *gate) close() { g.open.Store(false) }

// accepts reports whether an answer for round received at `at` may pass.
func (g *gate) accepts(round int64, at time.Time) bool {
	return g.open.Load() && g.round.Load() == round && at.UnixNano() < g.deadline.Load()
}

type reply struct {
	err error
	v   any
}

type command struct {
	kind    string
	c       *Client
	round   int64
	choice  int
	subject string
	minutes int
	limit   int
	at      time.Time
	fn      func(r *Room) any
	reply   chan reply
}

// TickStats reports how precisely the room loop woke up for its timers.
type TickStats struct {
	Ticks   int
	MaxLate time.Duration
	P99Late time.Duration
}

// Room runs one game in its own goroutine. Only that goroutine touches the
// fields below; other goroutines send commands or read the atomic gate.
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

	phase   string
	subject string
	// minutes is the game length chosen by the host; endsAt is when the
	// running game stops asking questions. limit caps the players.
	minutes     int
	limit       int
	endsAt      time.Time
	round       RoundState
	answerLimit time.Duration
	wakeAt      time.Time
	started     time.Time
	ended       time.Time
	grade       int
	gen         *questions.Generator
	rng         *rand.Rand
	nextID      int64
	gate        gate
	ranking     []*Player

	dirtyLobby    bool
	dirtyProgress bool
	flushedAt     time.Time
	touched       time.Time
	emptySince    time.Time
	closed        bool

	cmds chan command
	done chan struct{}

	late  []time.Duration
	ticks int
}

func newRoom(h *Hub, pin string, host *Client, seed uint64, now time.Time) *Room {
	return &Room{
		hub: h, cfg: h.cfg, Pin: pin,
		hostClaims: host.Claims,
		byID:       map[int64]*Player{},
		phase:      PhaseLobby,
		minutes:    DefaultMinutes,
		limit:      MaxPlayers,
		rng:        rand.New(rand.NewPCG(seed, seed^0xf100d209)),
		nextID:     int64(seed%1000) * 1000,
		touched:    now,
		cmds:       make(chan command, h.cfg.Commands),
		done:       make(chan struct{}),
	}
}

// run is the room goroutine: commands and timers, nothing else touches state.
func (r *Room) run() {
	defer close(r.done)
	scheduled := time.Now().Add(r.cfg.Tick)
	timer := time.NewTimer(r.cfg.Tick)
	defer timer.Stop()
	for !r.closed {
		select {
		case cmd := <-r.cmds:
			r.handle(cmd, time.Now())
		case <-timer.C:
			now := time.Now()
			r.measure(now.Sub(scheduled))
			r.tick(now)
		}
		if r.closed {
			return
		}
		now := time.Now()
		next := r.nextWake(now)
		if next.Before(now) {
			next = now
		}
		if !next.Equal(scheduled) {
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			scheduled = next
			timer.Reset(next.Sub(now))
		}
	}
}

func (r *Room) measure(late time.Duration) {
	r.ticks++
	if len(r.late) < 4096 {
		r.late = append(r.late, max(0, late))
	} else {
		r.late[r.ticks%4096] = max(0, late)
	}
}

// stats summarises the wake-up lateness of the room loop.
func (r *Room) stats() TickStats {
	s := TickStats{Ticks: r.ticks}
	if len(r.late) == 0 {
		return s
	}
	sorted := append([]time.Duration(nil), r.late...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	s.MaxLate = sorted[len(sorted)-1]
	s.P99Late = sorted[(len(sorted)*99)/100]
	return s
}

// nextWake is the earliest of the phase deadline, a pending broadcast flush
// and the regular housekeeping tick.
func (r *Room) nextWake(now time.Time) time.Time {
	next := now.Add(r.cfg.Tick)
	if !r.wakeAt.IsZero() && r.wakeAt.Before(next) {
		next = r.wakeAt
	}
	if r.dirtyLobby || r.dirtyProgress {
		flush := max(r.flushedAt.Add(r.cfg.Progress).UnixNano(), now.UnixNano())
		if flush < next.UnixNano() {
			next = time.Unix(0, flush)
		}
	}
	return next
}

func (r *Room) handle(cmd command, now time.Time) {
	var res reply
	switch cmd.kind {
	case "attach_host":
		res.err = r.attachHost(cmd.c, now)
	case "attach":
		res.err = r.attach(cmd.c, now)
	case "join":
		res.err = r.join(cmd.c, now)
	case "leave":
		res.err = r.leave(cmd.c, now)
	case "detach":
		r.detach(cmd.c, now)
	case "start":
		res.err = r.start(cmd.c, now)
	case "subject":
		res.err = r.setSubject(cmd.c, cmd.subject, now)
	case "settings":
		res.err = r.setSettings(cmd.c, cmd.minutes, cmd.limit, now)
	case "answer":
		res.err = r.answer(cmd.c, cmd.round, cmd.choice, cmd.at, now)
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
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if p.client != nil && p.client != c {
		p.client.Close()
	}
	p.client, p.online, p.offlineAt = c, true, time.Time{}
	p.Claims.Name, p.Claims.Character = c.Claims.Name, c.Claims.Character
	r.dirtyLobby = r.phase == PhaseLobby
	r.sendState(c, now)
	return nil
}

func (r *Room) join(c *Client, now time.Time) error {
	if p := r.byID[c.ID()]; p != nil && !p.left {
		return r.attach(c, now)
	}
	if r.phase != PhaseLobby {
		return ErrStarted
	}
	if r.active() >= r.limit {
		return ErrFull
	}
	r.joined++
	p := &Player{Claims: c.Claims, client: c, order: r.joined, online: true, alive: true, lives: Lives, choice: -1}
	r.players = append(r.players, p)
	r.byID[c.ID()] = p
	r.hub.setPlayer(c.ID(), r)
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
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
		p.left, p.online, p.client = true, false, nil
		if p.alive {
			r.eliminate([]*Player{p}, "left", now)
		}
	}
	c.push(Message{"t": "state_sync", "phase": "NONE", "role": "player"})
	return nil
}

func (r *Room) remove(p *Player) {
	delete(r.byID, p.ID())
	kept := r.players[:0]
	for _, q := range r.players {
		if q != p {
			kept = append(kept, q)
		}
	}
	r.players = kept
}

func (r *Room) detach(c *Client, now time.Time) {
	if c.Host {
		if r.host == c {
			r.host, r.hostOnline = nil, false
		}
		return
	}
	if p := r.byID[c.ID()]; p != nil && p.client == c {
		p.client, p.online, p.offlineAt = nil, false, now
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

// setSettings changes the game length (minutes) and the player limit
// before the game (host only). A limit below the players already in the
// room is refused.
func (r *Room) setSettings(c *Client, minutes, limit int, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		return ErrPhase
	}
	if minutes != 0 {
		if !validDuration(minutes) {
			return ErrDuration
		}
		r.minutes = minutes
	}
	if limit != 0 {
		if !validLimit(limit) || limit < r.active() {
			return ErrLimit
		}
		r.limit = limit
	}
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

// --- game flow ------------------------------------------------------------

func (r *Room) start(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
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
	grade, level := r.players[0].Claims.Grade, points.Level(r.players[0].Claims.Level)
	ids := make([]int64, 0, len(r.players))
	for _, p := range r.players {
		grade = min(grade, p.Claims.Grade)
		ids = append(ids, p.ID())
		*p = Player{Claims: p.Claims, client: p.client, order: p.order, online: true, alive: true, lives: Lives, choice: -1}
		level = min(level, points.Level(p.Claims.Level))
	}
	r.grade = grade
	r.gen = questions.NewFor(GameKey, grade, r.rng.Uint64()).For(r.subject, ids...).AtLevel(level)
	r.answerLimit = r.cfg.FirstLimit(grade)
	r.round = RoundState{}
	r.ranking = nil
	r.started, r.ended = now, time.Time{}
	r.endsAt = now.Add(r.cfg.ReadyTime + time.Duration(r.minutes)*r.cfg.Minute)
	// Round 0 summary is the "get ready" screen before the first question.
	r.phase, r.wakeAt = PhaseSummary, now.Add(r.cfg.ReadyTime)
	r.dirtyLobby = false
	r.broadcastState(now)
	return nil
}

func (r *Room) alive() []*Player {
	out := make([]*Player, 0, len(r.players))
	for _, p := range r.players {
		if p.alive {
			out = append(out, p)
		}
	}
	return out
}

// answeredAlive counts players still standing who answered this round.
func (r *Room) answeredAlive() int {
	n := 0
	for _, p := range r.players {
		if p.alive && p.answered {
			n++
		}
	}
	return n
}

func (r *Room) aliveCount() int {
	n := 0
	for _, p := range r.players {
		if p.alive {
			n++
		}
	}
	return n
}

// ask starts the next question (QUESTION_ACTIVE).
func (r *Room) ask(now time.Time) {
	if r.round.Number > 0 {
		r.answerLimit = r.cfg.NextLimit(r.answerLimit)
	}
	r.nextID++
	q := r.gen.Present(r.gen.Choice(), Options)
	r.round = RoundState{ID: r.nextID, Number: r.round.Number + 1, Question: q, Limit: r.answerLimit, Start: now, Deadline: now.Add(r.answerLimit)}
	for _, p := range r.players {
		p.choice, p.answered, p.answerMs = -1, false, 0
	}
	r.phase, r.wakeAt = PhaseQuestion, r.round.Deadline
	r.gate.set(r.round.ID, r.round.Deadline)
	alive := r.aliveCount()
	r.broadcast(func(locale string) Message {
		return Message{
			"t": "question_start", "round_id": r.round.ID, "round": r.round.Number,
			"time_limit": r.answerLimit.Milliseconds(), "remaining_ms": r.answerLimit.Milliseconds(),
			"question": r.questionView(locale), "options": r.optionsView(locale), "alive": alive,
			"ends_ms": max(0, r.endsAt.Sub(now).Milliseconds()),
		}
	})
}

func (r *Room) answer(c *Client, round int64, choice int, at, now time.Time) error {
	if c.Host {
		return ErrPlayerOnly
	}
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if r.phase != PhaseQuestion || round != r.round.ID || !at.Before(r.round.Deadline) {
		return ErrLocked
	}
	if !p.alive {
		return ErrEliminated
	}
	if choice < 0 || choice >= len(r.round.Question.Options) {
		return ErrOption
	}
	if at.Sub(r.round.Start) < r.cfg.MinAnswer {
		return ErrTooEarly
	}
	if p.answered {
		return ErrAnswered
	}
	p.answered, p.choice, p.answerMs = true, choice, at.Sub(r.round.Start).Milliseconds()
	r.round.Answered = r.answeredAlive()
	c.push(Message{"t": "answer_ack", "round_id": round, "choice": choice})
	r.dirtyProgress = true
	if r.round.Answered >= r.aliveCount() {
		r.lock(now)
	}
	return nil
}

// lock freezes answers (LOCK_ANSWERS) and shows where everyone stands.
func (r *Room) lock(now time.Time) {
	r.gate.close()
	r.flushProgress(now)
	r.phase, r.wakeAt = PhaseLock, now.Add(r.cfg.LockTime)
	choices := map[string]int{}
	var tiles [Options]int
	for _, p := range r.players {
		if p.alive && p.answered {
			choices[fmt.Sprint(p.ID())] = p.choice
			tiles[p.choice]++
		}
	}
	r.round.Tiles = tiles
	msg := Message{"t": "lock_answers", "round_id": r.round.ID, "choices": choices, "tiles": tiles[:len(r.round.Question.Options)]}
	r.broadcast(func(string) Message { return msg })
}

// drop resolves the round (REVEAL_DROP): every standing player who
// answered wrong or not at all cracks their floor and loses a life; a floor
// with no lives left breaks and the player falls out. When the last players
// standing all fall in the same round, the fastest submission ranks first.
func (r *Room) drop(now time.Time) {
	q := r.round.Question
	standing := r.alive()
	var fallen, cracked []*Player
	survivors := 0
	for _, p := range standing {
		p.rounds++
		if p.answered {
			p.totalMs += p.answerMs
		} else {
			p.totalMs += r.round.Limit.Milliseconds()
		}
		right := p.answered && p.choice == q.Answer
		if q.FromBank {
			p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: right, Choice: q.Picked(p.answered, p.choice)})
		}
		if right {
			p.correct++
			p.earned += q.Worth()
			survivors++
			continue
		}
		p.lives = max(0, p.lives-1)
		if p.lives > 0 {
			cracked = append(cracked, p)
			survivors++
		} else {
			fallen = append(fallen, p)
		}
	}
	r.round.SuddenDeath = survivors == 0 && len(standing) > 0
	r.eliminateQuiet(fallen, now)
	ids := make([]int64, len(fallen))
	for i, p := range fallen {
		ids[i] = p.ID()
	}
	r.round.Eliminated = ids
	crackedIDs := make([]int64, len(cracked))
	for i, p := range cracked {
		crackedIDs[i] = p.ID()
	}
	r.round.Cracked = crackedIDs
	r.phase, r.wakeAt = PhaseReveal, now.Add(r.cfg.RevealTime)
	msg := Message{
		"t": "tile_drop", "round_id": r.round.ID, "round": r.round.Number, "correct_index": q.Answer,
		"eliminated_user_ids": ids, "cracked_user_ids": crackedIDs, "lives": r.livesView(),
		"survivors": r.aliveCount(), "sudden_death": r.round.SuddenDeath,
		"tiles": append([]int(nil), r.round.Tiles[:len(q.Options)]...),
	}
	r.broadcast(func(locale string) Message {
		out := Message{"hint": q.Hint.Get(locale)}
		for k, v := range msg {
			out[k] = v
		}
		return out
	})
}

// livesView maps every player (by id) to their remaining lives.
func (r *Room) livesView() map[string]int {
	out := make(map[string]int, len(r.players))
	for _, p := range r.players {
		out[fmt.Sprint(p.ID())] = p.lives
	}
	return out
}

// timeUp reports whether the host's game length is over.
func (r *Room) timeUp(now time.Time) bool {
	return !r.endsAt.IsZero() && !now.Before(r.endsAt)
}

func (r *Room) eliminateQuiet(fallen []*Player, now time.Time) {
	for _, p := range fallen {
		p.alive, p.outRound, p.outAt = false, max(1, r.round.Number), now
		p.outAnswered, p.outMs = p.answered, p.answerMs
		switch {
		case p.left:
			p.reason = "left"
		case !p.online:
			p.reason = "disconnected"
		case p.answered:
			p.reason = "wrong"
		default:
			p.reason = "timeout"
		}
	}
}

// eliminate drops players outside the round resolution (disconnect, leave)
// and ends the game when at most one player is left standing.
func (r *Room) eliminate(fallen []*Player, reason string, now time.Time) {
	if len(fallen) == 0 || r.phase == PhaseLobby || r.phase == PhaseOver {
		return
	}
	ids := make([]int64, 0, len(fallen))
	for _, p := range fallen {
		if !p.alive {
			continue
		}
		p.alive, p.outRound, p.outAt, p.reason = false, max(1, r.round.Number), now, reason
		p.outAnswered, p.outMs, p.lives = false, 0, 0
		ids = append(ids, p.ID())
	}
	if len(ids) == 0 {
		return
	}
	msg := Message{"t": "player_eliminated", "user_ids": ids, "reason": reason, "survivors": r.aliveCount()}
	r.broadcast(func(string) Message { return msg })
	switch alive := r.aliveCount(); {
	case alive <= 1 && (r.phase == PhaseQuestion || r.phase == PhaseSummary):
		r.gate.close()
		r.finish(now)
	case r.phase == PhaseQuestion && alive > 0 && r.answeredAlive() >= alive:
		r.round.Answered = r.answeredAlive()
		r.lock(now)
	}
}

func (r *Room) summary(now time.Time) {
	r.phase, r.wakeAt = PhaseSummary, now.Add(r.cfg.SummaryTime)
	next := r.cfg.NextLimit(r.answerLimit)
	msg := Message{"t": "round_summary", "round": r.round.Number, "survivors": r.aliveCount(), "next_time_limit": next.Milliseconds(), "ends_ms": max(0, r.endsAt.Sub(now).Milliseconds())}
	r.broadcast(func(string) Message { return msg })
}

// finish ends the game (GAME_OVER), ranks everyone and reports results.
func (r *Room) finish(now time.Time) {
	r.phase, r.wakeAt, r.ended = PhaseOver, time.Time{}, now
	r.gate.close()
	r.ranking = rank(r.players)
	for i, p := range r.ranking {
		p.rank = i + 1
	}
	for _, p := range r.players {
		r.settle(p, true, now)
	}
	podium := r.podium(now)
	for _, p := range r.players {
		if p.client == nil {
			continue
		}
		msg := Message{"t": "podium_result", "podium": podium[:min(3, len(podium))], "ranking": podium, "you": r.youResult(p, now)}
		p.client.push(msg)
	}
	if r.host != nil {
		r.host.push(Message{"t": "podium_result", "podium": podium[:min(3, len(podium))], "ranking": podium})
	}
}

// rank orders players: still standing first (more correct, then faster
// total), then by the round they dropped in (later is better), then by their
// submission in that round (answered before not answered, faster first).
func rank(players []*Player) []*Player {
	out := append([]*Player(nil), players...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.alive != b.alive {
			return a.alive
		}
		if a.alive {
			if a.correct != b.correct {
				return a.correct > b.correct
			}
			if a.lives != b.lives {
				return a.lives > b.lives
			}
			if a.totalMs != b.totalMs {
				return a.totalMs < b.totalMs
			}
			return a.order < b.order
		}
		if a.outRound != b.outRound {
			return a.outRound > b.outRound
		}
		if a.left != b.left {
			return !a.left
		}
		if a.outAnswered != b.outAnswered {
			return a.outAnswered
		}
		if a.outAnswered && a.outMs != b.outMs {
			return a.outMs < b.outMs
		}
		if a.correct != b.correct {
			return a.correct > b.correct
		}
		return a.order < b.order
	})
	return out
}

func (r *Room) survival(p *Player, now time.Time) time.Duration {
	end := r.ended
	if !p.alive && !p.outAt.IsZero() {
		end = p.outAt
	}
	if end.IsZero() {
		end = now
	}
	return max(0, end.Sub(r.started))
}

func accuracy(p *Player) float64 {
	if p.rounds == 0 {
		return 0
	}
	return math.Round(float64(p.correct)*1000/float64(p.rounds)) / 10
}

func (r *Room) points(p *Player, finished bool) int {
	if !finished || p.left {
		return points.Abandoned(p.earned, p.rounds, MaxPoints)
	}
	return Award(p.earned, p.rank == 1)
}

func (r *Room) podium(now time.Time) []Message {
	out := make([]Message, len(r.ranking))
	for i, p := range r.ranking {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "rank": p.rank, "character": character(p.Claims),
			"survival_ms": r.survival(p, now).Milliseconds(), "accuracy": accuracy(p),
			"correct": p.correct, "rounds": p.rounds, "out_round": p.outRound, "reason": p.reason, "lives": p.lives,
		}
	}
	return out
}

func (r *Room) youResult(p *Player, now time.Time) Message {
	return Message{
		"user_id": p.ID(), "rank": p.rank, "won": p.rank == 1, "points": r.points(p, true),
		"survival_ms": r.survival(p, now).Milliseconds(), "accuracy": accuracy(p),
		"correct": p.correct, "rounds": p.rounds,
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
	wrong := p.rounds - p.correct
	r.hub.queue(Result{
		EventID:     fmt.Sprintf("%s-%d-room-%d", Prefix, p.ID(), r.started.UnixNano()),
		UserID:      p.ID(),
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       p.Claims.Grade,
		Points:      pts,
		Correct:     p.correct,
		Wrong:       wrong,
		Seconds:     int(now.Sub(r.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, p.answers...),
		Match:       r.match(finished, now),
	})
}

// match summarises the game for every player's history.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		order = rank(r.players)
	}
	players := make([]record.Player, len(order))
	for i, p := range order {
		acc := accuracy(p)
		players[i] = record.Player{
			UserID: p.ID(), Name: p.Claims.Name, Grade: p.Claims.Grade, Left: p.left,
			Score: p.outRound, Correct: p.correct, Wrong: p.rounds - p.correct, Rank: i + 1,
			SurvivalMs: r.survival(p, now).Milliseconds(), Accuracy: &acc,
		}
		if p.alive {
			players[i].Score = r.round.Number
		}
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: record.ModeRoom, Pin: r.Pin,
		Level: r.round.Number, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
}

// close shuts the room: unfinished games pay what players achieved.
func (r *Room) close(now time.Time, reason string) {
	if r.closed {
		return
	}
	if r.phase != PhaseLobby && r.phase != PhaseOver {
		r.ranking = rank(r.players)
		for _, p := range r.players {
			r.settle(p, false, now)
		}
	}
	r.gate.close()
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
	r.closed = true
}

// --- timers ---------------------------------------------------------------

func (r *Room) tick(now time.Time) {
	r.housekeep(now)
	if r.closed {
		return
	}
	if !r.wakeAt.IsZero() && !now.Before(r.wakeAt) {
		switch r.phase {
		case PhaseQuestion:
			r.lock(now)
		case PhaseLock:
			r.drop(now)
		case PhaseReveal:
			if r.aliveCount() <= 1 || r.round.Number >= MaxRounds || r.timeUp(now) {
				r.finish(now)
			} else {
				r.summary(now)
			}
		case PhaseSummary:
			r.ask(now)
		}
	}
	if now.Sub(r.flushedAt) >= r.cfg.Progress {
		if r.dirtyProgress {
			r.flushProgress(now)
		}
		if r.dirtyLobby {
			r.dirtyLobby = false
			r.flushedAt = now
			r.broadcastState(now)
		}
	}
}

// housekeep eliminates players offline beyond the reconnect window, drops
// lobby ghosts and closes idle or abandoned rooms.
func (r *Room) housekeep(now time.Time) {
	var gone []*Player
	for _, p := range r.players {
		if p.online || p.left || p.offlineAt.IsZero() {
			continue
		}
		switch {
		case r.phase == PhaseLobby && now.Sub(p.offlineAt) >= r.cfg.LobbyDrop:
			r.hub.dropPlayer(p.ID(), r)
			r.remove(p)
			r.dirtyLobby = true
		case r.phase != PhaseLobby && r.phase != PhaseOver && p.alive && now.Sub(p.offlineAt) >= r.cfg.Grace:
			gone = append(gone, p)
		}
	}
	r.eliminate(gone, "disconnected", now)

	anyone := r.hostOnline
	for _, p := range r.players {
		anyone = anyone || p.online
	}
	if anyone {
		r.emptySince = time.Time{}
	} else if r.emptySince.IsZero() {
		r.emptySince = now
	}
	playing := r.phase != PhaseLobby && r.phase != PhaseOver
	if (!playing && now.Sub(r.touched) >= r.cfg.Idle) || (!r.emptySince.IsZero() && now.Sub(r.emptySince) >= r.cfg.Empty) {
		r.close(now, "idle")
	}
}

func (r *Room) flushProgress(now time.Time) {
	r.dirtyProgress = false
	r.flushedAt = now
	if r.phase != PhaseQuestion {
		return
	}
	r.round.Answered = r.answeredAlive()
	msg := Message{"t": "answer_progress", "round_id": r.round.ID, "answered": r.round.Answered, "alive": r.aliveCount()}
	r.broadcast(func(string) Message { return msg })
}

// --- views ----------------------------------------------------------------

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
	for _, p := range r.players {
		if p.client != nil {
			p.client.push(get(p.client.Locale()))
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

func character(c auth.Claims) any {
	if len(c.Character) == 0 {
		return nil
	}
	return c.Character
}

func (r *Room) questionView(locale string) Message {
	q := r.round.Question
	return Message{"text": q.Prompt.Get(locale), "subject": q.Subject, "worth": q.Worth()}
}

func (r *Room) optionsView(locale string) []string {
	opts := make([]string, len(r.round.Question.Options))
	for i, o := range r.round.Question.Options {
		opts[i] = o.Get(locale)
	}
	return opts
}

// revealed reports whether answer positions may be shown (after the lock).
func (r *Room) revealed() bool {
	return r.phase == PhaseLock || r.phase == PhaseReveal || r.phase == PhaseSummary || r.phase == PhaseOver
}

// sendState pushes the full snapshot (state_sync) to one client.
func (r *Room) sendState(c *Client, now time.Time) {
	locale := c.Locale()
	role := "player"
	if c.Host {
		role = "host"
	}
	players := make([]Message, len(r.players))
	answered := 0
	for i, p := range r.players {
		view := Message{
			"user_id": p.ID(), "name": p.Claims.Name, "grade": p.Claims.Grade, "character": character(p.Claims),
			"online": p.online, "alive": p.alive, "out_round": p.outRound, "reason": p.reason, "left": p.left,
			"lives": p.lives,
		}
		if r.revealed() && p.answered {
			view["choice"] = p.choice
		}
		if p.answered && p.alive {
			answered++
		}
		players[i] = view
	}
	msg := Message{
		"t": "state_sync", "pin": r.Pin, "phase": r.phase, "role": role, "subject": subjectOrMix(r.subject),
		"host":    Message{"user_id": r.hostClaims.Subject, "name": r.hostClaims.Name, "online": r.hostOnline},
		"players": players, "alive": r.aliveCount(), "answered": answered,
		"min_players": MinPlayers, "max_players": r.limit, "max_rounds": MaxRounds,
		"round": r.round.Number, "lives_max": Lives,
		"minutes": r.minutes, "durations": Durations, "player_limits": PlayerLimits,
	}
	if !r.endsAt.IsZero() && r.phase != PhaseLobby && r.phase != PhaseOver {
		msg["ends_ms"] = max(0, r.endsAt.Sub(now).Milliseconds())
	}
	if !c.Host {
		if p := r.byID[c.ID()]; p != nil {
			you := Message{"user_id": p.ID(), "alive": p.alive, "out_round": p.outRound, "reason": p.reason, "answered": p.answered, "lives": p.lives}
			if p.answered {
				you["choice"] = p.choice
			}
			msg["you"] = you
		}
	}
	switch r.phase {
	case PhaseSummary:
		if r.round.Number == 0 {
			msg["ready_ms"] = max(0, r.wakeAt.Sub(now).Milliseconds())
		} else {
			msg["next_time_limit"] = r.cfg.NextLimit(r.answerLimit).Milliseconds()
		}
	case PhaseQuestion, PhaseLock, PhaseReveal:
		msg["round_id"] = r.round.ID
		msg["time_limit"] = r.round.Limit.Milliseconds()
		msg["remaining_ms"] = max(0, r.round.Deadline.Sub(now).Milliseconds())
		msg["question"] = r.questionView(locale)
		msg["options"] = r.optionsView(locale)
		if r.phase != PhaseQuestion {
			msg["tiles"] = append([]int(nil), r.round.Tiles[:len(r.round.Question.Options)]...)
		}
		if r.phase == PhaseReveal {
			msg["correct_index"] = r.round.Question.Answer
			msg["eliminated_user_ids"] = r.round.Eliminated
			msg["cracked_user_ids"] = r.round.Cracked
			msg["sudden_death"] = r.round.SuddenDeath
		}
	case PhaseOver:
		podium := r.podium(now)
		msg["podium"] = podium[:min(3, len(podium))]
		msg["ranking"] = podium
		if p := r.byID[c.ID()]; p != nil && !c.Host {
			msg["result"] = r.youResult(p, now)
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
