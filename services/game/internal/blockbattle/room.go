package blockbattle

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

// Question stages of one player's stream.
const (
	StageQuestion = "QUESTION"
	StageWait     = "WAIT" // reveal or cooldown before the next question
)

// Team results (FORTRESS).
const (
	ReasonMonster = "monster_defeated"
	ReasonTimeUp  = "time_up"
	ReasonBroken  = "wall_broken"
	ReasonStopped = "stopped"
)

// QuestionState is the question one player is answering.
type QuestionState struct {
	ID       int64
	Question questions.Question
	Limit    time.Duration
	Start    time.Time
	Deadline time.Time
	Stage    string
	NextAt   time.Time
}

// Player is one student in a room. Owned by the room goroutine.
type Player struct {
	Claims auth.Claims
	Avatar json.RawMessage
	client *Client
	order  int

	online    bool
	offlineAt time.Time
	left      bool

	field   *Field
	alive   bool
	rank    int // KO rank (BATTLE/WORDS), final rank after the game
	outAt   time.Time
	kos     int
	hitBy   int64
	hitAt   time.Time
	dirty   bool
	fxShown string
	limiter Limiter

	gen    *questions.Generator
	q      QuestionState
	reward bool
	until  time.Time // reward window end

	score    int // FORTRESS contribution
	correct  int
	wrong    int
	paid     int
	earned   int
	answers  []questions.Answer
	reported bool
}

// ID is the account id.
func (p *Player) ID() int64 { return p.Claims.Subject }

// Score is the player's score in the current mode.
func (p *Player) Score() int {
	if p.field != nil {
		return p.field.Score
	}
	return p.score
}

// Lines is the player's cleared lines.
func (p *Player) Lines() int {
	if p.field != nil {
		return p.field.Lines
	}
	return 0
}

type turnState struct {
	uid    int64
	until  time.Time
	piece  Piece
	fallAt time.Time
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
	mode    string
	content string
	action  string
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

	players []*Player
	byID    map[int64]*Player
	joined  int

	phase   string
	mode    string
	minutes int
	content string
	subject string
	grade   int
	rng     *rand.Rand
	nextID  int64

	countUntil time.Time
	started    time.Time
	playStart  time.Time
	endAt      time.Time
	ended      time.Time
	boardsAt   time.Time
	ranking    []*Player

	fort      *Fortress
	fortBag   *Bag
	queue     []int64
	turn      *turnState
	monsterAt time.Time
	teamWon   bool
	reason    string

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
		byID:       map[int64]*Player{},
		phase:      PhaseLobby,
		mode:       ModeBattle,
		minutes:    DefaultMinutes,
		content:    ContentWordsID,
		rng:        rand.New(rand.NewPCG(seed, seed^0xb10cb10c)),
		nextID:     int64(seed%1000) * 1000,
		touched:    now,
		cmds:       make(chan command, h.cfg.Commands),
		done:       make(chan struct{}),
	}
}

// run is the room goroutine: commands and the tick, nothing else touches state.
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
		res.err = r.configure(cmd.c, cmd.mode, cmd.value, cmd.content, now)
	case "subject":
		res.err = r.setSubject(cmd.c, cmd.subject, now)
	case "answer":
		res.err = r.answer(cmd.c, cmd.qid, cmd.value, cmd.at, now)
	case "input":
		res.err = r.input(cmd.c, cmd.action, now)
	case "reward":
		res.err = r.claim(cmd.c, cmd.action, now)
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
	p.Claims.Name = c.Claims.Name
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
	if p := r.byID[c.ID()]; p != nil && !p.left {
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
	p := &Player{Claims: c.Claims, Avatar: avatarOf(c.Claims, avatar), client: c, order: r.joined, online: true}
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

func (r *Room) playing() bool { return r.phase == PhaseCountdown || r.phase == PhasePlaying }

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
	if !r.playing() {
		r.remove(p)
		r.dirtyLobby = true
	} else {
		p.left, p.online, p.client = true, false, nil
		p.reward = false
		if r.mode == ModeFortress {
			r.dequeue(p.ID())
			if r.turn != nil && r.turn.uid == p.ID() {
				r.endTurn(now, false)
			}
		} else if p.alive {
			r.knockOut(p, now)
		}
		if r.phase == PhasePlaying && r.active() == 0 {
			r.finish(now, ReasonStopped)
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
	if r.playing() {
		return ErrPhase
	}
	r.subject = questions.NormSubject(subject)
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

func oneOf(v string, list []string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func (r *Room) configure(c *Client, mode string, minutes int, content string, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.playing() {
		return ErrPhase
	}
	if mode == "" && minutes == 0 && content == "" {
		return ErrConfig
	}
	if (mode != "" && !oneOf(mode, Modes)) || (content != "" && !oneOf(content, Contents)) {
		return ErrConfig
	}
	if minutes != 0 {
		valid := false
		for _, d := range Durations {
			valid = valid || d == minutes
		}
		if !valid {
			return ErrConfig
		}
		r.minutes = minutes
	}
	if mode != "" {
		r.mode = mode
	}
	if content != "" {
		r.content = content
	}
	r.dirtyLobby = true
	r.sendState(c, now)
	return nil
}

// MinPlayersFor is the minimum number of players of a mode.
func MinPlayersFor(mode string) int {
	if mode == ModeBattle {
		return MinBattle
	}
	return 1
}

// --- game flow ------------------------------------------------------------

func (r *Room) start(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if r.playing() {
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
	if len(r.players) < MinPlayersFor(r.mode) {
		return ErrPlayers
	}
	grade, level := r.players[0].Claims.Grade, points.Level(r.players[0].Claims.Level)
	for _, p := range r.players {
		grade = min(grade, p.Claims.Grade)
		level = min(level, points.Level(p.Claims.Level))
	}
	r.grade = grade
	for _, p := range r.players {
		*p = Player{Claims: p.Claims, Avatar: p.Avatar, client: p.client, order: p.order, online: true, alive: true}
		p.limiter = Limiter{Max: MaxInputs, Window: time.Second}
		p.gen = questions.NewFor(GameKey, grade, r.rng.Uint64()).For(r.subject, p.ID()).AtLevel(level)
		if r.mode != ModeFortress {
			content := ""
			if r.mode == ModeWords {
				content = r.content
			}
			p.field = NewField(FieldConfig{Cols: Cols, Rows: Rows, Hidden: Hidden, Gravity: r.cfg.Gravity, LockDelay: r.cfg.LockDelay, Content: content},
				rand.New(rand.NewPCG(r.rng.Uint64(), r.rng.Uint64())))
		}
	}
	r.fort, r.fortBag, r.queue, r.turn = nil, nil, nil, nil
	if r.mode == ModeFortress {
		r.fort = NewFortress(r.rng)
		r.fortBag = NewBag(r.rng)
	}
	r.teamWon, r.reason, r.ranking = false, "", nil
	r.started, r.ended, r.playStart = now, time.Time{}, time.Time{}
	r.phase, r.countUntil = PhaseCountdown, now.Add(r.cfg.Countdown)
	r.dirtyLobby = false
	r.broadcastState(now)
	return nil
}

// begin turns the countdown into play: boards spawn and quizzes open.
func (r *Room) begin(now time.Time) {
	r.phase, r.playStart = PhasePlaying, now
	r.endAt = now.Add(time.Duration(r.minutes) * r.cfg.Minute)
	r.monsterAt = now.Add(r.cfg.MonsterInterval(0))
	r.boardsAt = time.Time{}
	for _, p := range r.players {
		if p.field != nil {
			p.field.Start(now)
			p.dirty = true
		}
	}
	r.broadcastState(now)
	for _, p := range r.players {
		r.ask(p, now)
	}
}

func (r *Room) end(c *Client, now time.Time) error {
	if !c.Host {
		return ErrHostOnly
	}
	if !r.playing() {
		return ErrPhase
	}
	r.finish(now, ReasonStopped)
	return nil
}

// alive counts boards still in play (BATTLE/WORDS).
func (r *Room) alive() int {
	n := 0
	for _, p := range r.players {
		if p.alive && !p.left {
			n++
		}
	}
	return n
}

// --- quiz -----------------------------------------------------------------

// ask opens p's next question (only while connected and in play).
func (r *Room) ask(p *Player, now time.Time) {
	if r.phase != PhasePlaying || p.left || !p.online || (r.mode != ModeFortress && !p.alive) {
		p.q.Stage = ""
		return
	}
	r.nextID++
	q := p.gen.Present(p.gen.Choice(), Options)
	limit := r.cfg.AnswerTime(r.grade)
	p.q = QuestionState{ID: r.nextID, Question: q, Limit: limit, Start: now, Deadline: now.Add(limit), Stage: StageQuestion}
	r.notify(p, r.questionMsg(p, now))
}

func (r *Room) questionMsg(p *Player, now time.Time) Message {
	locale := "id"
	if p.client != nil {
		locale = p.client.Locale()
	}
	q := p.q.Question
	opts := make([]string, len(q.Options))
	for i, o := range q.Options {
		opts[i] = o.Get(locale)
	}
	return Message{
		"t": "question", "qid": p.q.ID, "text": q.Prompt.Get(locale), "options": opts,
		"subject": q.Subject, "worth": q.Worth(), "time_limit_ms": p.q.Limit.Milliseconds(),
		"remaining_ms": max(0, p.q.Deadline.Sub(now).Milliseconds()),
	}
}

// answer scores a choice. The answer time is the server reception clock.
func (r *Room) answer(c *Client, qid int64, choice int, at, now time.Time) error {
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if r.phase != PhasePlaying {
		return ErrPhase
	}
	if r.mode != ModeFortress && !p.alive {
		return ErrKnocked
	}
	if p.q.ID == qid && p.q.Stage == StageWait {
		return ErrAnswered
	}
	if p.q.Stage != StageQuestion || qid != p.q.ID || !at.Before(p.q.Deadline) {
		return ErrLocked
	}
	if choice < 0 || choice >= len(p.q.Question.Options) {
		return ErrOption
	}
	if at.Sub(p.q.Start) < r.cfg.MinAnswer {
		return ErrTooEarly
	}
	q := p.q.Question
	right := choice == q.Answer
	if q.FromBank {
		p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: right, Choice: q.Original(choice)})
	}
	r.resolve(p, right, false, now)
	return nil
}

// resolve applies a correct or wrong answer (timeout = wrong) and schedules
// the next question.
func (r *Room) resolve(p *Player, right, timeout bool, now time.Time) {
	locale := "id"
	if p.client != nil {
		locale = p.client.Locale()
	}
	q := p.q.Question
	msg := Message{"t": "answer_result", "qid": p.q.ID, "correct": right, "correct_index": q.Answer}
	if h := q.Hint.Get(locale); h != "" {
		msg["hint"] = h
	}
	if timeout {
		msg["timeout"] = true
	}
	next := r.cfg.RevealTime
	if right {
		p.correct++
		if p.paid < MaxPaid {
			p.paid++
			p.earned += q.Worth()
		}
		switch r.mode {
		case ModeBattle:
			if p.reward {
				r.grant(p, RewardAttack, now)
			}
			p.reward, p.until = true, now.Add(r.cfg.RewardWindow)
			msg["reward_choice"] = true
			msg["reward_ms"] = r.cfg.RewardWindow.Milliseconds()
		case ModeWords:
			p.field.SetNext(p.field.Glyphs.TargetPiece())
			p.dirty = true
		case ModeFortress:
			msg["queue_position"] = r.enqueue(p.ID())
		}
	} else {
		p.wrong++
		switch r.mode {
		case ModeBattle:
			p.field.Penalize(now, r.cfg.PenaltyTime)
			p.field.Expose(now, r.cfg.PenaltyTime)
			p.dirty = true
			msg["penalty_ms"] = r.cfg.PenaltyTime.Milliseconds()
		case ModeWords:
			p.field.Penalize(now, r.cfg.PenaltyTime)
			p.dirty = true
			msg["penalty_ms"] = r.cfg.PenaltyTime.Milliseconds()
		case ModeFortress:
			next = r.cfg.WrongCool
			msg["penalty_ms"] = r.cfg.WrongCool.Milliseconds()
		}
	}
	p.q.Stage, p.q.NextAt = StageWait, now.Add(next)
	r.notify(p, msg)
}

// claim resolves a pending BATTLE reward.
func (r *Room) claim(c *Client, reward string, now time.Time) error {
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if r.phase != PhasePlaying {
		return ErrPhase
	}
	if reward != RewardIPiece && reward != RewardAttack {
		return ErrReward
	}
	if !p.alive && r.mode != ModeFortress {
		return ErrKnocked
	}
	if !p.reward {
		return ErrNoReward
	}
	r.grant(p, reward, now)
	return nil
}

func (r *Room) grant(p *Player, reward string, now time.Time) {
	p.reward = false
	msg := Message{"t": "reward_result", "reward": reward}
	switch reward {
	case RewardIPiece:
		p.field.SetNext(NewPiece('I'))
		p.dirty = true
	case RewardAttack:
		target, lines := r.attack(p, AttackLines, "quiz", now)
		msg["lines"] = lines
		if target != nil {
			msg["target"] = r.ref(target)
		}
	}
	r.notify(p, msg)
}

// pickTarget prefers exposed rivals, else any alive rival (never self).
func (r *Room) pickTarget(from *Player, now time.Time) *Player {
	var exposed, rivals []*Player
	for _, p := range r.players {
		if p == from || !p.alive || p.left || p.field == nil {
			continue
		}
		rivals = append(rivals, p)
		if p.field.Exposed(now) {
			exposed = append(exposed, p)
		}
	}
	pool := exposed
	if len(pool) == 0 {
		pool = rivals
	}
	if len(pool) == 0 {
		return nil
	}
	return pool[r.rng.IntN(len(pool))]
}

// attack queues garbage on a rival (+1 line when the rival is exposed).
func (r *Room) attack(from *Player, lines int, kind string, now time.Time) (*Player, int) {
	target := r.pickTarget(from, now)
	if target == nil || lines <= 0 {
		return nil, 0
	}
	exposed := target.field.Exposed(now)
	if exposed {
		lines += ExposedBonus
	}
	target.field.AddGarbage(lines, from.ID())
	target.hitBy, target.hitAt, target.dirty = from.ID(), now, true
	msg := Message{"t": "attack", "from": r.ref(from), "to": r.ref(target), "lines": lines, "kind": kind, "exposed": exposed}
	if r.host != nil {
		r.host.push(msg)
	}
	r.notify(from, msg)
	r.notify(target, msg)
	return target, lines
}

// --- boards ---------------------------------------------------------------

func (r *Room) input(c *Client, action string, now time.Time) error {
	p := r.byID[c.ID()]
	if p == nil || p.left {
		return ErrNoRoom
	}
	if !ValidAction(action) {
		return ErrInput
	}
	if r.phase != PhasePlaying {
		return ErrPhase
	}
	if r.mode == ModeFortress {
		if r.turn == nil || r.turn.uid != p.ID() {
			return ErrNotTurn
		}
		if p.limiter.Allow(now) {
			r.fortInput(p, action, now)
		}
		return nil
	}
	if !p.alive {
		return ErrKnocked
	}
	moved, res := p.field.Input(action, now)
	if moved {
		p.dirty = true
	}
	if res != nil {
		r.afterLock(p, res, now)
	}
	return nil
}

// afterLock sends line-clear garbage, word explosions and knock-outs.
func (r *Room) afterLock(p *Player, res *LockResult, now time.Time) {
	p.dirty = true
	if r.mode == ModeBattle && res.Send > 0 {
		r.attack(p, res.Send, "line_clear", now)
	}
	for _, m := range res.Matches {
		pts := len(m.Text) * 10 * p.field.Combo
		msg := Message{"t": "word", "user": r.ref(p), "word": m.Text, "points": pts, "combo": p.field.Combo}
		if r.host != nil {
			r.host.push(msg)
		}
		r.notify(p, msg)
	}
	if res.ToppedOut {
		r.knockOut(p, now)
	}
}

// knockOut takes p's board out of play. Rank = boards still alive + 1; the
// KO is credited to the last attacker within KOCredit.
func (r *Room) knockOut(p *Player, now time.Time) {
	if !p.alive {
		return
	}
	p.alive, p.outAt, p.reward = false, now, false
	p.q.Stage = ""
	if p.field != nil {
		p.field.Alive, p.field.Piece = false, nil
	}
	p.rank = r.alive() + 1
	p.dirty = true
	msg := Message{"t": "ko", "user": r.ref(p), "rank": p.rank, "alive": r.alive()}
	if by := r.byID[p.hitBy]; by != nil && by != p && now.Sub(p.hitAt) <= KOCredit {
		by.kos++
		msg["by"] = r.ref(by)
	}
	r.broadcast(func(string) Message { return msg })
	switch {
	case r.mode == ModeBattle && r.alive() <= 1:
		r.finish(now, "")
	case r.mode == ModeWords && r.alive() == 0:
		r.finish(now, "")
	}
}

// --- fortress -------------------------------------------------------------

func (r *Room) enqueue(uid int64) int {
	if r.turn != nil && r.turn.uid == uid {
		return 0
	}
	for i, id := range r.queue {
		if id == uid {
			return i + 1
		}
	}
	r.queue = append(r.queue, uid)
	return len(r.queue)
}

func (r *Room) dequeue(uid int64) {
	kept := r.queue[:0]
	for _, id := range r.queue {
		if id != uid {
			kept = append(kept, id)
		}
	}
	r.queue = kept
}

// nextTurn hands the patch piece to the head of the queue.
func (r *Room) nextTurn(now time.Time) {
	for r.turn == nil && len(r.queue) > 0 {
		uid := r.queue[0]
		r.queue = r.queue[1:]
		p := r.byID[uid]
		if p == nil || p.left || !p.online {
			continue
		}
		piece, ok := r.fort.Board.Spawn(NewPiece(r.fortBag.Next()))
		if !ok {
			continue
		}
		r.turn = &turnState{uid: uid, until: now.Add(r.cfg.TurnTime), piece: piece, fallAt: now.Add(r.cfg.FortressFall)}
		r.notify(p, Message{"t": "your_turn", "until_ms": r.cfg.TurnTime.Milliseconds()})
	}
}

func (r *Room) fortInput(p *Player, action string, now time.Time) {
	b, t := r.fort.Board, r.turn
	switch action {
	case ActLeft:
		t.piece, _ = b.Move(t.piece, -1, 0)
	case ActRight:
		t.piece, _ = b.Move(t.piece, 1, 0)
	case ActRotate:
		t.piece, _ = b.Rotate(t.piece, 1)
	case ActRotateCCW:
		t.piece, _ = b.Rotate(t.piece, -1)
	case ActSoft:
		if q, ok := b.Move(t.piece, 0, 1); ok {
			t.piece, t.fallAt = q, now.Add(r.cfg.FortressFall)
		}
	case ActHard:
		r.endTurn(now, true)
	}
}

// endTurn places the patch piece (place) and frees the board for the next turn.
func (r *Room) endTurn(now time.Time, place bool) {
	t := r.turn
	r.turn = nil
	if t == nil || !place {
		return
	}
	piece, _ := r.fort.Board.Drop(t.piece)
	fresh := r.fort.Place(piece)
	if p := r.byID[t.uid]; p != nil {
		p.score += 10 + 50*len(fresh)
	}
	if r.fort.Defeated() {
		r.finish(now, ReasonMonster)
	}
}

func (r *Room) stepFortress(now time.Time) {
	if t := r.turn; t != nil {
		if !now.Before(t.until) {
			r.endTurn(now, true)
		} else {
			for t == r.turn && !now.Before(t.fallAt) {
				t.fallAt = t.fallAt.Add(r.cfg.FortressFall)
				q, ok := r.fort.Board.Move(t.piece, 0, 1)
				if !ok {
					r.endTurn(now, true)
					break
				}
				t.piece = q
			}
		}
	}
	if r.phase != PhasePlaying {
		return
	}
	r.nextTurn(now)
	if !now.Before(r.monsterAt) {
		r.monsterAt = now.Add(r.cfg.MonsterInterval(now.Sub(r.playStart)))
		col := r.rng.IntN(FortCols)
		destroyed := r.fort.Hit(col, 1+r.rng.IntN(3))
		msg := Message{"t": "monster_hit", "col": col, "destroyed": destroyed, "strength": r.fort.Strength()}
		r.broadcast(func(string) Message { return msg })
		if r.fort.Broken() {
			r.finish(now, ReasonBroken)
		}
	}
}

// --- tick -----------------------------------------------------------------

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
		if !now.Before(r.countUntil) {
			r.begin(now)
		}
		return
	}
	r.step(now)
	if r.closed || r.phase != PhasePlaying {
		return
	}
	r.broadcastTick(now)
}

// Level is the gravity level (1 + elapsed game minutes).
func (r *Room) level(now time.Time) int {
	if r.cfg.Minute <= 0 || r.playStart.IsZero() {
		return 1
	}
	return 1 + int(now.Sub(r.playStart)/r.cfg.Minute)
}

func (r *Room) step(now time.Time) {
	base := max(r.cfg.MinGravity, r.cfg.Gravity-time.Duration(r.level(now)-1)*r.cfg.GravityStep)
	for _, p := range r.players {
		if r.phase != PhasePlaying {
			return
		}
		if p.left {
			continue
		}
		if p.field != nil && p.alive {
			p.field.Base = base
			changed, res := p.field.Step(now)
			if changed {
				p.dirty = true
			}
			if res != nil {
				r.afterLock(p, res, now)
				if r.phase != PhasePlaying {
					return
				}
			}
			fx, _ := p.field.Effects(now)
			if key := fmt.Sprint(fx); key != p.fxShown {
				p.fxShown, p.dirty = key, true
			}
		}
		if p.reward && !now.Before(p.until) {
			r.grant(p, RewardAttack, now)
		}
		switch p.q.Stage {
		case StageQuestion:
			if !now.Before(p.q.Deadline) {
				if p.q.Question.FromBank {
					p.answers = append(p.answers, questions.Answer{Key: p.q.Question.Key, Correct: false})
				}
				r.resolve(p, false, true, now)
			}
		case StageWait:
			if !now.Before(p.q.NextAt) {
				r.ask(p, now)
			}
		case "":
			if p.online && (p.alive || r.mode == ModeFortress) {
				r.ask(p, now)
			}
		}
	}
	if r.mode == ModeFortress {
		r.stepFortress(now)
		if r.phase != PhasePlaying {
			return
		}
	}
	if !now.Before(r.endAt) {
		r.finish(now, ReasonTimeUp)
	}
}

// --- results --------------------------------------------------------------

// rank orders players. BATTLE: alive boards by lines then score, knocked
// out boards by KO order. WORDS: alive by score, then knocked out by score.
// FORTRESS: by contribution. Leavers last.
func (r *Room) rank() []*Player {
	out := append([]*Player(nil), r.players...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.left != b.left {
			return !a.left
		}
		if r.mode != ModeFortress && a.alive != b.alive {
			return a.alive
		}
		switch {
		case r.mode == ModeBattle && a.alive:
			if a.Lines() != b.Lines() {
				return a.Lines() > b.Lines()
			}
		case r.mode == ModeBattle:
			if !a.outAt.Equal(b.outAt) {
				return a.outAt.After(b.outAt)
			}
		}
		if a.Score() != b.Score() {
			return a.Score() > b.Score()
		}
		if a.Lines() != b.Lines() {
			return a.Lines() > b.Lines()
		}
		if a.correct != b.correct {
			return a.correct > b.correct
		}
		return a.order < b.order
	})
	return out
}

// finish ends the game (GAME_OVER), ranks everyone and reports results.
// reason is the FORTRESS team result reason.
func (r *Room) finish(now time.Time, reason string) {
	if r.phase == PhaseOver {
		return
	}
	if r.mode == ModeFortress {
		r.reason = reason
		r.teamWon = reason == ReasonMonster || (reason == ReasonTimeUp && r.fort != nil && r.fort.Strength() > 0)
	}
	r.phase, r.ended = PhaseOver, now
	r.turn, r.queue = nil, nil
	for _, p := range r.players {
		p.reward, p.q.Stage = false, ""
		if p.field != nil {
			p.field.Piece = nil
		}
	}
	r.ranking = r.rank()
	for i, p := range r.ranking {
		p.rank = i + 1
	}
	for _, p := range r.players {
		r.settle(p, true, now)
	}
	ranking := r.podium(now)
	podium := ranking[:min(3, len(ranking))]
	team := r.teamView()
	for _, p := range r.players {
		if p.client == nil {
			continue
		}
		msg := Message{"t": "podium_result", "podium": podium, "ranking": ranking, "you": r.youResult(p)}
		if team != nil {
			msg["team"] = team
		}
		p.client.push(msg)
	}
	if r.host != nil {
		msg := Message{"t": "podium_result", "podium": podium, "ranking": ranking}
		if team != nil {
			msg["team"] = team
		}
		r.host.push(msg)
	}
}

func (r *Room) teamView() Message {
	if r.mode != ModeFortress || r.phase != PhaseOver {
		return nil
	}
	return Message{"won": r.teamWon, "reason": r.reason}
}

func (r *Room) won(p *Player) bool {
	if p.left {
		return false
	}
	if r.mode == ModeFortress {
		return r.teamWon
	}
	return p.rank == 1
}

// Accuracy is correct / answered in percent (one decimal).
func Accuracy(correct, wrong int) float64 {
	n := correct + wrong
	if n == 0 {
		return 0
	}
	return math.Round(float64(correct)*1000/float64(n)) / 10
}

// aliveMs is how long p's board stayed in play.
func (r *Room) aliveMs(p *Player, now time.Time) int64 {
	if r.playStart.IsZero() {
		return 0
	}
	end := r.ended
	if !p.outAt.IsZero() {
		end = p.outAt
	}
	if end.IsZero() {
		end = now
	}
	return max(0, end.Sub(r.playStart).Milliseconds())
}

func (r *Room) points(p *Player, finished bool) int {
	if !finished || p.left {
		return points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	}
	return Award(p.earned, r.won(p))
}

func (r *Room) podium(now time.Time) []Message {
	out := make([]Message, len(r.ranking))
	for i, p := range r.ranking {
		out[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "rank": p.rank, "character": avatar(p),
			"score": p.Score(), "lines": p.Lines(), "kos": p.kos, "correct": p.correct, "wrong": p.wrong,
			"accuracy": Accuracy(p.correct, p.wrong), "alive_ms": r.aliveMs(p, now), "left": p.left,
		}
	}
	return out
}

func (r *Room) youResult(p *Player) Message {
	return Message{
		"rank": p.rank, "won": r.won(p), "points": r.points(p, true), "score": p.Score(),
		"correct": p.correct, "wrong": p.wrong, "accuracy": Accuracy(p.correct, p.wrong),
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
		Correct:     p.correct,
		Wrong:       p.wrong,
		Seconds:     int(now.Sub(r.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, p.answers...),
		Match:       r.match(finished, now),
	})
}

// match summarises the game for every player's history. Level = minutes.
func (r *Room) match(finished bool, now time.Time) *record.Match {
	order := r.ranking
	if order == nil {
		order = r.rank()
	}
	players := make([]record.Player, len(order))
	for i, p := range order {
		acc := Accuracy(p.correct, p.wrong)
		players[i] = record.Player{
			UserID: p.ID(), Name: p.Claims.Name, Grade: p.Claims.Grade, Left: p.left,
			Score: p.Score(), Correct: p.correct, Wrong: p.wrong, Rank: i + 1,
			SurvivalMs: r.aliveMs(p, now), Accuracy: &acc,
		}
	}
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", Prefix, r.Pin, r.started.UnixNano()), Mode: record.ModeRoom, Pin: r.Pin,
		Level: r.minutes, Grade: r.grade, StartedAt: record.Stamp(r.started), EndedAt: record.Stamp(now),
		Finished: finished, Players: players,
	}
}

// close shuts the room: unfinished games pay what players achieved.
func (r *Room) close(now time.Time, reason string) {
	if r.closed {
		return
	}
	if r.playing() {
		r.ranking = r.rank()
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
	r.closed = true
}

// housekeep drops lobby ghosts and closes idle or abandoned rooms.
func (r *Room) housekeep(now time.Time) {
	for _, p := range append([]*Player(nil), r.players...) {
		if p.online || p.left || p.offlineAt.IsZero() {
			continue
		}
		if !r.playing() && now.Sub(p.offlineAt) >= r.cfg.LobbyDrop {
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
	if (!r.playing() && now.Sub(r.touched) >= r.cfg.Idle) || (!r.emptySince.IsZero() && now.Sub(r.emptySince) >= r.cfg.Empty) {
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

// ref identifies a player in events.
func (r *Room) ref(p *Player) Message {
	return Message{"id": p.ID(), "name": p.Claims.Name}
}

func (r *Room) notify(p *Player, msg Message) {
	if p.client != nil {
		p.client.push(msg)
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

// remaining is the play time left.
func (r *Room) remaining(now time.Time) int64 {
	if r.phase != PhasePlaying {
		return 0
	}
	return max(0, r.endAt.Sub(now).Milliseconds())
}

// pieceView lists the visible cells (and glyphs) of a piece; cells in the
// hidden spawn rows are left out.
func pieceView(p *Piece, hidden int, glyphs bool) Message {
	if p == nil {
		return nil
	}
	cells := [][]int{}
	marks := []string{}
	for i, c := range p.Cells() {
		y := c[1] - hidden
		if y < 0 {
			continue
		}
		cells = append(cells, []int{c[0], y})
		marks = append(marks, string(p.Glyphs[i]))
	}
	out := Message{"type": string(p.Type), "cells": cells}
	if glyphs {
		out["glyphs"] = marks
	}
	return out
}

func cellsOf(p *Piece, hidden int) [][]int {
	cells := [][]int{}
	if p == nil {
		return cells
	}
	for _, c := range p.Cells() {
		if y := c[1] - hidden; y >= 0 {
			cells = append(cells, []int{c[0], y})
		}
	}
	return cells
}

// boardMsg is the personal board of p (phone).
func (r *Room) boardMsg(p *Player, now time.Time) Message {
	f := p.field
	glyphs := f.Glyphs != nil
	fx, fxMs := f.Effects(now)
	next := make([]Message, 0, len(f.Queue))
	for _, q := range f.Queue {
		n := Message{"type": string(q.Type)}
		if glyphs {
			g := make([]string, 4)
			for i, c := range q.Glyphs {
				g[i] = string(c)
			}
			n["glyphs"] = g
		}
		next = append(next, n)
	}
	msg := Message{
		"t": "board", "cells": f.Board.Visible(nil), "piece": pieceView(f.Piece, f.Board.Hidden, glyphs),
		"ghost": cellsOf(f.Ghost(), f.Board.Hidden), "next": next, "pending": f.PendingLines(),
		"lines": f.Lines, "score": f.Score, "combo": f.Combo, "level": r.level(now),
		"gravity_ms": f.Gravity(now).Milliseconds(), "fx": fx, "fx_ms": fxMs,
		"alive": p.alive, "rank": p.rank,
	}
	if f.Piece == nil {
		msg["piece"] = nil
	}
	if glyphs {
		msg["glyphs"] = f.Board.VisibleGlyphs(nil)
		msg["target"] = Message{"kind": f.Glyphs.Kind(), "text": f.Glyphs.Text()}
	}
	return msg
}

// boardsView is the compact list of every board (projector).
func (r *Room) boardsView(now time.Time) []Message {
	out := make([]Message, 0, len(r.players))
	for _, p := range r.players {
		if p.field == nil {
			continue
		}
		fx, _ := p.field.Effects(now)
		b := Message{
			"id": p.ID(), "c": p.field.Board.Visible(p.field.Piece), "alive": p.alive, "rank": p.rank,
			"lines": p.field.Lines, "score": p.field.Score, "pending": p.field.PendingLines(), "fx": fx, "kos": p.kos,
		}
		if p.field.Glyphs != nil {
			b["g"] = p.field.Board.VisibleGlyphs(p.field.Piece)
		}
		out = append(out, b)
	}
	return out
}

func (r *Room) fortressMsg(now time.Time) Message {
	f := r.fort
	queue := make([]Message, 0, len(r.queue))
	for _, id := range r.queue {
		if p := r.byID[id]; p != nil {
			queue = append(queue, r.ref(p))
		}
	}
	var turn any
	if t := r.turn; t != nil {
		ghost, _ := f.Board.Drop(t.piece)
		user := Message{"id": t.uid, "name": ""}
		if p := r.byID[t.uid]; p != nil {
			user = r.ref(p)
		}
		turn = Message{
			"user": user, "until_ms": max(0, t.until.Sub(now).Milliseconds()),
			"piece": Message{"type": string(t.piece.Type), "cells": cellsOf(&t.piece, 0)}, "ghost": cellsOf(&ghost, 0),
		}
	}
	nextHit := int64(0)
	if r.phase == PhasePlaying {
		nextHit = max(0, r.monsterAt.Sub(now).Milliseconds())
	}
	return Message{
		"t": "fortress", "cols": FortCols, "rows": FortRows, "cells": f.Board.Visible(nil), "armored": f.ArmoredRows(),
		"strength": f.Strength(), "max_strength": MaxStrength(),
		"monster": Message{"hp": f.MonsterHP, "max": MonsterHP, "next_hit_ms": nextHit},
		"queue":   queue, "turn": turn, "remaining_ms": r.remaining(now),
	}
}

// broadcastTick sends changed personal boards every tick and, throttled,
// the projector boards or the fortress wall.
func (r *Room) broadcastTick(now time.Time) {
	for _, p := range r.players {
		if p.dirty && p.field != nil {
			p.dirty = false
			r.notify(p, r.boardMsg(p, now))
		}
	}
	if now.Sub(r.boardsAt) < r.cfg.BoardsTick {
		return
	}
	r.boardsAt = now
	if r.mode == ModeFortress {
		msg := r.fortressMsg(now)
		r.broadcast(func(string) Message { return msg })
		return
	}
	if r.host != nil {
		r.host.push(Message{"t": "boards", "remaining_ms": r.remaining(now), "alive": r.alive(), "boards": r.boardsView(now)})
	}
}

// sendState pushes the full snapshot (state_sync) to one client; a player
// in play also gets the board and the open question again.
func (r *Room) sendState(c *Client, now time.Time) {
	role := "player"
	if c.Host {
		role = "host"
	}
	roster := make([]Message, len(r.players))
	for i, p := range r.players {
		roster[i] = Message{
			"user_id": p.ID(), "name": p.Claims.Name, "grade": p.Claims.Grade, "character": avatar(p),
			"online": p.online, "left": p.left, "order": p.order,
		}
	}
	msg := Message{
		"t": "state_sync", "pin": r.Pin, "phase": r.phase, "role": role,
		"mode": r.mode, "minutes": r.minutes, "content": r.content,
		"modes": Modes, "durations": Durations, "contents": Contents, "subject": subjectOrMix(r.subject),
		"host":    Message{"user_id": r.hostClaims.Subject, "name": r.hostClaims.Name, "online": r.hostOnline},
		"players": roster, "min_players": MinPlayersFor(r.mode), "max_players": MaxPlayers,
	}
	if r.phase == PhaseCountdown {
		msg["countdown_ms"] = max(0, r.countUntil.Sub(now).Milliseconds())
	}
	if r.phase == PhasePlaying {
		msg["remaining_ms"] = r.remaining(now)
	}
	if r.phase == PhasePlaying || r.phase == PhaseOver {
		if r.mode == ModeFortress && r.fort != nil {
			msg["fortress"] = r.fortressMsg(now)
		} else if r.mode != ModeFortress {
			msg["boards"] = r.boardsView(now)
		}
	}
	var you *Player
	if !c.Host {
		if p := r.byID[c.ID()]; p != nil {
			you = p
			msg["you"] = Message{"user_id": p.ID(), "alive": p.alive, "rank": p.rank}
		}
	}
	if r.phase == PhaseOver && r.ranking != nil {
		ranking := r.podium(now)
		msg["podium"] = ranking[:min(3, len(ranking))]
		msg["ranking"] = ranking
		if you != nil {
			msg["result"] = r.youResult(you)
		}
		if team := r.teamView(); team != nil {
			msg["team"] = team
		}
	}
	c.push(msg)
	if you == nil || r.phase != PhasePlaying {
		return
	}
	if you.field != nil {
		you.dirty = false
		c.push(r.boardMsg(you, now))
	}
	if you.q.Stage == StageQuestion {
		c.push(r.questionMsg(you, now))
	}
	if r.turn != nil && r.turn.uid == you.ID() {
		c.push(Message{"t": "your_turn", "until_ms": max(0, r.turn.until.Sub(now).Milliseconds())})
	}
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
