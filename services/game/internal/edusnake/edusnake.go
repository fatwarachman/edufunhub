// Package edusnake referees Main Ular, the "tail cut" quiz snake game.
//
// Every snake starts with a long tail. Answer options are food on the grid:
// eating the correct option cuts the tail, a wrong option or a timeout
// grows it. The first snake whose tail is gone clears the stage and wins.
// Rooms follow the standard invite flow (package lobby); playing alone is a
// room with one seat. Two modes:
//
//   - shared: every snake moves on one grid and races for the same
//     question; the fastest correct bite cuts the tail and loads the next
//     question for everyone.
//   - split: every player has an own grid and own questions (at their
//     grade). A correct bite sends a junk attack (extra tail or obstacle
//     blocks) to the leading opponent.
//
// Go owns movement, collisions, questions, answers, timers and points;
// clients only render the state and send turn intents.
package edusnake

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

const (
	GameKey    = "snake"
	Mission    = "room"
	MinPlayers = 1
	MaxPlayers = 4
	Options    = 4

	ModeShared = "shared"
	ModeSplit  = "split"

	// Grid is the width and height of every board.
	Grid = 24
	// InitialTail is the tail length every snake starts with.
	InitialTail = 15
	// Cut is how many tail segments a correct answer removes.
	Cut = 3
	// Grow is how many tail segments a wrong answer or timeout adds.
	Grow = 4
	// Junk is the extra tail a split-mode attack adds.
	Junk = 2
	// JunkBlocks is the number of obstacle blocks a split-mode attack drops.
	JunkBlocks = 2
	// Lives is how many crashes a snake survives.
	Lives = 3
	// MaxCorrect bounds the questions one seat can be paid for.
	MaxCorrect = 40
)

// MaxPoints is the highest award of one game.
var MaxPoints = points.Cap(MaxCorrect)

// Labels name the answer options (food items) on the grid.
var Labels = []string{"A", "B", "C", "D"}

var (
	ErrDirection = errors.New("invalid_input")
	ErrMode      = errors.New("invalid_config")
)

// Config holds the game timings (tests shorten them).
type Config struct {
	// Step is the time between two snake moves.
	Step time.Duration
	// Countdown freezes every snake when a game starts.
	Countdown time.Duration
	// Answer is the default time per question.
	Answer time.Duration
	// Game is the longest a game can run; the shortest tail then wins.
	Game time.Duration
	// Respawn freezes a snake after it lost a life.
	Respawn time.Duration
	// Obstacle is how long junk blocks stay on a board.
	Obstacle time.Duration
}

// Defaults are the production timings.
var Defaults = Config{
	Step:      180 * time.Millisecond,
	Countdown: 3 * time.Second,
	Answer:    25 * time.Second,
	Game:      5 * time.Minute,
	Respawn:   1500 * time.Millisecond,
	Obstacle:  10 * time.Second,
}

// Point is a grid cell.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

func (p Point) add(d Point) Point { return Point{p.X + d.X, p.Y + d.Y} }

func inside(p Point) bool { return p.X >= 0 && p.Y >= 0 && p.X < Grid && p.Y < Grid }

// Directions accepted from clients.
var Directions = map[string]Point{
	"up":    {0, -1},
	"down":  {0, 1},
	"left":  {-1, 0},
	"right": {1, 0},
}

func dirName(d Point) string {
	for name, v := range Directions {
		if v == d {
			return name
		}
	}
	return "right"
}

// Message is a generic event.
type Message = map[string]any

type food struct {
	option int
	at     Point
}

type obstacle struct {
	at    Point
	until time.Time
}

// board is one grid's question round: the live question and its food.
type board struct {
	gen       *questions.Generator
	q         questions.Question
	round     int
	deadline  time.Time
	foods     []food
	obstacles []obstacle
}

// player is the per seat state.
type player struct {
	body        []Point
	dir         Point
	queue       []Point
	grow        int
	lives       int
	alive       bool
	frozenUntil time.Time
	correct     int
	wrong       int
	earned      int
	paid        int
	answers     []questions.Answer
	reported    bool
	board       *board // split mode only
}

func (p *player) tail() int { return len(p.body) - 1 + p.grow }

type feedback struct {
	seq     int
	seat    int
	correct bool
	timeout bool
	label   string
	prompt  questions.Text
	answer  questions.Text
	hint    questions.Text
	attack  *attack
}

type attack struct {
	from, to int
	kind     string
}

type game struct {
	mode     string
	cfg      Config
	rng      *rand.Rand
	started  time.Time
	ended    time.Time
	deadline time.Time
	nextStep time.Time
	steps    int
	shared   *board
	level    int
	grade    int
	answer   time.Duration
	attacks  int
	winner   int
	reason   string
	stopped  bool
	feedback *feedback
	events   int
}

type room = lobby.Room[game, player]

// Result is reported to Laravel for each account holder when a game ends,
// or when they leave a game in which they earned something.
type Result struct {
	EventID     string             `json:"event_id"`
	UserID      int64              `json:"user_id"`
	GameKey     string             `json:"game_key"`
	Mission     string             `json:"mission"`
	Grade       int                `json:"grade"`
	Points      int                `json:"points"`
	Correct     int                `json:"correct"`
	Wrong       int                `json:"wrong"`
	Seconds     int                `json:"duration_seconds"`
	CompletedAt string             `json:"completed_at"`
	Answers     []questions.Answer `json:"answers"`
	Match       *record.Match      `json:"match"`
}

// Hub runs every Main Ular room.
type Hub struct {
	cfg     Config
	rooms   *lobby.Hub[game, player]
	seed    uint64
	mu      sync.Mutex
	pending []Result
	paid    map[int64]int
}

// NewHub creates a hub; zero timings fall back to Defaults.
func NewHub(cfg Config, seed uint64) *Hub {
	if cfg.Step == 0 {
		cfg = Defaults
	}
	h := &Hub{cfg: cfg, rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers}), seed: seed, paid: map[int64]int{}}
	h.rooms.OnLeave = func(r *room, seat int, now time.Time) {
		r.Seats[seat].Data.alive = false
		h.settle(r, seat, false, now)
		h.checkEnd(r, now)
	}
	return h
}

func (h *Hub) Join(c auth.Claims, locale string)         { h.rooms.Join(c, locale) }
func (h *Hub) Offline(uid int64)                         { h.rooms.Offline(uid) }
func (h *Hub) SetLocale(uid int64, locale string)        { h.rooms.SetLocale(uid, locale) }
func (h *Hub) Peers(uid int64) []int64                   { return h.rooms.Peers(uid) }
func (h *Hub) Counts() (int, int)                        { return h.rooms.Counts() }
func (h *Hub) RoomPhase(pin string) (string, bool)       { return h.rooms.PhaseOf(pin) }
func (h *Hub) Presence(uid int64) (lobby.Presence, bool) { return h.rooms.PresenceOf(uid) }
func (h *Hub) HandOver(now time.Time) []int64            { return h.rooms.HandOver(now, lobby.HostGrace) }

// Create opens a room hosted by c (shared mode by default).
func (h *Hub) Create(c auth.Claims, now time.Time) (string, []int64) {
	h.prepareDeparture(c.Subject, now)
	return h.rooms.Create(c, now, func(r *room) { r.Game = game{mode: ModeShared, winner: -1} })
}

// Enter joins the room with the given PIN.
func (h *Hub) Enter(c auth.Claims, pin string, now time.Time) ([]int64, error) {
	if p, ok := h.Presence(c.Subject); ok && p.Pin != pin {
		h.prepareDeparture(c.Subject, now)
	}
	return h.rooms.Enter(c, pin, now, func(r *room) {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
	})
}

func resetLobby(r *room) {
	kept := r.Seats[:0]
	for _, s := range r.Seats {
		if !s.Left {
			s.Data = player{}
			kept = append(kept, s)
		}
	}
	r.Seats = kept
	r.Phase = lobby.PhaseLobby
	r.Game = game{mode: r.Game.mode, winner: -1}
}

// SetSubject picks the question subject before the game (host only).
func (h *Hub) SetSubject(uid int64, subject string, now time.Time) ([]int64, error) {
	return h.rooms.SetSubject(uid, subject, questions.NormSubject, now)
}

// SetAnswerTime picks the time per question before the game (host only).
func (h *Hub) SetAnswerTime(uid int64, seconds int, now time.Time) ([]int64, error) {
	return h.rooms.SetAnswerTime(uid, seconds, now)
}

// SetMode picks shared or split before the game (host only).
func (h *Hub) SetMode(uid int64, mode string, now time.Time) ([]int64, error) {
	if mode != ModeShared && mode != ModeSplit {
		return nil, ErrMode
	}
	return h.rooms.Configure(uid, now, func(r *room) error {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		r.Game.mode = mode
		return nil
	})
}

// spawns are the head cells and headings of the shared grid: the head
// starts mid-row facing open space and the tail runs back to the wall,
// then bends along it (see laid). Lanes never cross.
var spawns = []struct{ at, dir Point }{
	{Point{Grid / 2, 3}, Point{1, 0}},
	{Point{Grid/2 - 1, Grid - 4}, Point{-1, 0}},
	{Point{Grid / 2, 9}, Point{1, 0}},
	{Point{Grid/2 - 1, Grid - 10}, Point{-1, 0}},
}

// Start begins (or restarts) the game.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		h.seed++
		grade, level := r.Seats[0].Claims.Grade, points.Level(r.Seats[0].Claims.Level)
		for _, s := range r.Seats {
			grade = min(grade, s.Claims.Grade)
			level = min(level, points.Level(s.Claims.Level))
		}
		mode := r.Game.mode
		if mode == "" {
			mode = ModeShared
		}
		g := game{
			mode: mode, cfg: h.cfg, winner: -1, level: level, grade: grade,
			rng:     rand.New(rand.NewPCG(h.seed, h.seed^0x5a4e)),
			started: now, deadline: now.Add(h.cfg.Countdown + h.cfg.Game),
			nextStep: now.Add(h.cfg.Countdown), answer: r.AnswerTime(h.cfg.Answer),
		}
		r.Game = g
		for i, s := range r.Seats {
			p := &s.Data
			at, dir := spawns[i%len(spawns)].at, spawns[i%len(spawns)].dir
			if mode == ModeSplit {
				at, dir = Point{Grid / 2, Grid / 2}, Point{1, 0}
			}
			*p = player{lives: Lives, alive: true, dir: dir, body: laid(at, dir, InitialTail), frozenUntil: g.nextStep}
			if mode == ModeSplit {
				h.seed++
				p.board = &board{gen: questions.NewFor(GameKey, s.Claims.Grade, h.seed).For(r.Subject, s.ID()).AtLevel(level)}
			}
		}
		if mode == ModeShared {
			h.seed++
			r.Game.shared = &board{gen: questions.NewFor(GameKey, grade, h.seed).For(r.Subject, r.Humans()...).AtLevel(level)}
			nextQuestion(r, r.Game.shared, now)
		} else {
			for _, s := range r.Seats {
				nextQuestion(r, s.Data.board, now)
			}
		}
		return nil
	})
}

// laid builds a snake whose tail runs straight back from the head and,
// at the wall, bends along it towards the middle row, so the whole tail is
// visible and turning away from the wall stays safe.
func laid(head, dir Point, tail int) []Point {
	body := []Point{head}
	step := Point{-dir.X, -dir.Y}
	bend := Point{0, 1}
	if dir.Y != 0 {
		bend = Point{1, 0}
	}
	if (dir.Y == 0 && head.Y >= Grid/2) || (dir.Y != 0 && head.X >= Grid/2) {
		bend = Point{-bend.X, -bend.Y}
	}
	c := head
	for len(body) <= tail {
		n := c.add(step)
		if !inside(n) {
			step = bend
			n = c.add(step)
		}
		c = n
		body = append(body, c)
	}
	return body
}

// respawnBody lays a snake on free cells of board b with room ahead, or
// coils it on one free cell when the board is too crowded.
func respawnBody(r *room, b *board, seat, tail int) ([]Point, Point) {
	taken := map[Point]bool{}
	for _, i := range seatsOn(r, b) {
		if i == seat || !r.Seats[i].Data.alive {
			continue
		}
		for _, c := range r.Seats[i].Data.body {
			taken[c] = true
		}
	}
	for _, f := range b.foods {
		taken[f.at] = true
	}
	for _, o := range b.obstacles {
		taken[o.at] = true
	}
	free := func(c Point) bool { return inside(c) && !taken[c] }
	rng := r.Game.rng
	for range 80 {
		head := Point{2 + rng.IntN(Grid-4), 2 + rng.IntN(Grid-4)}
		dir := Point{1, 0}
		if head.X >= Grid/2 {
			dir = Point{-1, 0}
		}
		body := laid(head, dir, tail)
		ok := true
		seen := map[Point]bool{}
		for _, c := range body {
			if !free(c) || seen[c] {
				ok = false
				break
			}
			seen[c] = true
		}
		for k, c := 1, head; ok && k <= 4; k++ {
			c = c.add(dir)
			ok = free(c) && !seen[c]
		}
		if ok {
			return body, dir
		}
	}
	at := freeCell(r, b, 3)
	dir := Point{1, 0}
	if at.X > Grid/2 {
		dir = Point{-1, 0}
	}
	return stacked(at, tail), dir
}

// stacked builds a snake whose tail is coiled under its head; the tail
// unfolds as the snake moves.
func stacked(at Point, tail int) []Point {
	body := make([]Point, tail+1)
	for i := range body {
		body[i] = at
	}
	return body
}

// Turn queues a direction change for the player's own snake.
func (h *Hub) Turn(uid int64, dir string, now time.Time) ([]int64, error) {
	d, ok := Directions[dir]
	if !ok {
		return nil, ErrDirection
	}
	return h.rooms.Act(uid, now, func(r *room) error {
		if r.Phase != lobby.PhasePlaying {
			return lobby.ErrPhase
		}
		i := r.SeatIndex(uid)
		if i < 0 {
			return lobby.ErrNoRoom
		}
		p := &r.Seats[i].Data
		if !p.alive {
			return nil
		}
		last := p.dir
		if n := len(p.queue); n > 0 {
			last = p.queue[n-1]
		}
		if d == last || (d.X == -last.X && d.Y == -last.Y) || len(p.queue) >= 2 {
			return nil
		}
		p.queue = append(p.queue, d)
		return nil
	})
}

// Tick advances every playing room; call it often (it steps on time).
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) {
		g := &r.Game
		changed := false
		if !now.Before(g.deadline) {
			h.timeUp(r, now)
			return
		}
		for _, b := range boards(r) {
			kept := b.obstacles[:0]
			for _, o := range b.obstacles {
				if now.Before(o.until) {
					kept = append(kept, o)
				}
			}
			changed = changed || len(kept) != len(b.obstacles)
			b.obstacles = kept
			if !now.Before(g.nextStep) && b.q.Prompt.ID != "" && !now.Before(b.deadline) {
				h.timeout(r, b, now)
				changed = true
				if r.Phase != lobby.PhasePlaying {
					return
				}
			}
		}
		if !now.Before(g.nextStep) {
			for !now.Before(g.nextStep) {
				g.nextStep = g.nextStep.Add(g.cfg.Step)
			}
			h.step(r, now)
			changed = true
		}
		if changed {
			r.Seq++
		}
	})
}

func boards(r *room) []*board {
	if r.Game.mode == ModeShared {
		if r.Game.shared == nil {
			return nil
		}
		return []*board{r.Game.shared}
	}
	out := make([]*board, 0, len(r.Seats))
	for _, s := range r.Seats {
		if s.Data.board != nil && s.Data.alive {
			out = append(out, s.Data.board)
		}
	}
	return out
}

// seatsOn lists the seats playing on board b.
func seatsOn(r *room, b *board) []int {
	out := []int{}
	for i, s := range r.Seats {
		if r.Game.mode == ModeShared || s.Data.board == b {
			out = append(out, i)
		}
	}
	return out
}

// step moves every snake one cell and resolves crashes and bites.
func (h *Hub) step(r *room, now time.Time) {
	g := &r.Game
	g.steps++
	if g.mode == ModeShared {
		h.stepBoard(r, g.shared, seatsOn(r, g.shared), now)
	} else {
		for i, s := range r.Seats {
			if s.Data.board != nil && s.Data.alive {
				h.stepBoard(r, s.Data.board, []int{i}, now)
			}
			if r.Phase != lobby.PhasePlaying {
				return
			}
		}
	}
	h.checkEnd(r, now)
}

func (h *Hub) stepBoard(r *room, b *board, seats []int, now time.Time) {
	type move struct {
		seat int
		head Point
	}
	moves := []move{}
	for _, i := range seats {
		p := &r.Seats[i].Data
		if !p.alive || r.Seats[i].Left || now.Before(p.frozenUntil) {
			continue
		}
		if len(p.queue) > 0 {
			p.dir, p.queue = p.queue[0], p.queue[1:]
		}
		moves = append(moves, move{i, p.body[0].add(p.dir)})
	}
	crashed := map[int]bool{}
	for _, m := range moves {
		if !inside(m.head) {
			crashed[m.seat] = true
			continue
		}
		for _, o := range b.obstacles {
			if o.at == m.head {
				crashed[m.seat] = true
			}
		}
		for _, j := range seats {
			q := &r.Seats[j].Data
			if !q.alive || r.Seats[j].Left {
				continue
			}
			body := q.body
			// The own tail end moves away this step unless the snake grows.
			if j == m.seat && q.grow == 0 {
				body = body[:len(body)-1]
			}
			for k, c := range body {
				if c == m.head && !(j == m.seat && k == 0) {
					crashed[m.seat] = true
				}
			}
		}
		for _, o := range moves {
			if o.seat != m.seat && o.head == m.head {
				crashed[m.seat] = true
			}
		}
	}
	for _, m := range moves {
		p := &r.Seats[m.seat].Data
		if crashed[m.seat] {
			h.crash(r, b, m.seat, now)
			continue
		}
		p.body = append([]Point{m.head}, p.body...)
		if p.grow > 0 {
			p.grow--
		} else {
			p.body = p.body[:len(p.body)-1]
		}
	}
	for _, m := range moves {
		if crashed[m.seat] {
			continue
		}
		head := r.Seats[m.seat].Data.body[0]
		for k, f := range b.foods {
			if f.at == head {
				b.foods = append(b.foods[:k], b.foods[k+1:]...)
				h.bite(r, b, m.seat, f, now)
				break
			}
		}
		if r.Phase != lobby.PhasePlaying {
			return
		}
	}
}

// crash costs a life; the snake respawns frozen on a free cell, or is out.
func (h *Hub) crash(r *room, b *board, seat int, now time.Time) {
	p := &r.Seats[seat].Data
	p.lives--
	p.queue = nil
	h.event(r, &feedback{seat: seat, label: "crash"})
	if p.lives <= 0 {
		p.alive = false
		p.body = p.body[:1]
		return
	}
	tail := p.tail()
	p.body, p.dir = respawnBody(r, b, seat, len(p.body)-1)
	p.grow = tail - (len(p.body) - 1)
	p.frozenUntil = now.Add(r.Game.cfg.Respawn)
}

// bite resolves an eaten answer option.
func (h *Hub) bite(r *room, b *board, seat int, f food, now time.Time) {
	p := &r.Seats[seat].Data
	q := b.q
	correct := f.option == q.Answer
	if q.FromBank {
		p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: correct, Choice: q.Original(f.option)})
	}
	fb := &feedback{seat: seat, correct: correct, label: Labels[f.option], prompt: q.Prompt, answer: q.Options[q.Answer], hint: q.Hint}
	if !correct {
		p.wrong++
		p.grow += Grow
		h.event(r, fb)
		return
	}
	p.correct++
	if p.correct <= MaxCorrect {
		p.earned += q.Worth()
	}
	cut(p, Cut)
	if p.tail() <= 0 {
		h.event(r, fb)
		r.Game.winner = seat
		r.Game.reason = "cleared"
		h.end(r, now)
		return
	}
	if r.Game.mode == ModeSplit {
		fb.attack = h.junk(r, seat, now)
	}
	h.event(r, fb)
	nextQuestion(r, b, now)
}

func cut(p *player, n int) {
	take := min(n, p.grow)
	p.grow -= take
	n -= take
	keep := max(1, len(p.body)-n)
	p.body = p.body[:keep]
}

// junk sends a split-mode attack to the leading opponent (shortest tail).
func (h *Hub) junk(r *room, from int, now time.Time) *attack {
	target := -1
	for i, s := range r.Seats {
		if i == from || !s.Data.alive || s.Left || s.Data.board == nil {
			continue
		}
		if target < 0 || s.Data.tail() < r.Seats[target].Data.tail() {
			target = i
		}
	}
	if target < 0 {
		return nil
	}
	g := &r.Game
	g.attacks++
	t := &r.Seats[target].Data
	if g.attacks%2 == 1 {
		t.grow += Junk
		return &attack{from: from, to: target, kind: "tail"}
	}
	for range JunkBlocks {
		t.board.obstacles = append(t.board.obstacles, obstacle{at: freeCell(r, t.board, 2), until: now.Add(g.cfg.Obstacle)})
	}
	return &attack{from: from, to: target, kind: "block"}
}

// timeout ends an unanswered question: every snake on the board grows.
func (h *Hub) timeout(r *room, b *board, now time.Time) {
	for _, i := range seatsOn(r, b) {
		p := &r.Seats[i].Data
		if !p.alive || r.Seats[i].Left {
			continue
		}
		p.wrong++
		p.grow += Grow
		if b.q.FromBank {
			p.answers = append(p.answers, questions.Answer{Key: b.q.Key, Correct: false})
		}
	}
	seat := -1
	if r.Game.mode == ModeSplit {
		if s := seatsOn(r, b); len(s) == 1 {
			seat = s[0]
		}
	}
	h.event(r, &feedback{seat: seat, timeout: true, prompt: b.q.Prompt, answer: b.q.Options[b.q.Answer], hint: b.q.Hint})
	nextQuestion(r, b, now)
}

func (h *Hub) event(r *room, f *feedback) {
	r.Game.events++
	f.seq = r.Game.events
	r.Game.feedback = f
}

// nextQuestion loads a new question and scatters its options as food.
func nextQuestion(r *room, b *board, now time.Time) {
	b.round++
	b.q = questions.Trim(b.gen.Choice(), Options, r.Game.rng)
	b.deadline = now.Add(r.Game.answer)
	if now.Before(r.Game.nextStep) {
		b.deadline = r.Game.nextStep.Add(r.Game.answer)
	}
	b.foods = b.foods[:0]
	for i := range b.q.Options {
		b.foods = append(b.foods, food{option: i, at: freeCell(r, b, 3)})
	}
}

// freeCell picks a random empty cell of board b, preferring cells at least
// gap cells away from every snake head.
func freeCell(r *room, b *board, gap int) Point {
	taken := map[Point]bool{}
	heads := []Point{}
	for _, i := range seatsOn(r, b) {
		p := &r.Seats[i].Data
		if !p.alive {
			continue
		}
		heads = append(heads, p.body[0])
		for _, c := range p.body {
			taken[c] = true
		}
	}
	for _, f := range b.foods {
		taken[f.at] = true
	}
	for _, o := range b.obstacles {
		taken[o.at] = true
	}
	far := func(c Point) bool {
		for _, hd := range heads {
			if abs(hd.X-c.X)+abs(hd.Y-c.Y) < gap {
				return false
			}
			// Keep the lane straight ahead clear so nobody eats by accident.
			if (hd.X == c.X && abs(hd.Y-c.Y) <= 2*gap) || (hd.Y == c.Y && abs(hd.X-c.X) <= 2*gap) {
				return false
			}
		}
		return true
	}
	rng := r.Game.rng
	for try := range 400 {
		c := Point{1 + rng.IntN(Grid-2), 1 + rng.IntN(Grid-2)}
		if !taken[c] && (try > 200 || far(c)) {
			return c
		}
	}
	for y := 1; y < Grid-1; y++ {
		for x := 1; x < Grid-1; x++ {
			if c := (Point{x, y}); !taken[c] {
				return c
			}
		}
	}
	return Point{Grid / 2, Grid / 2}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

// checkEnd ends the game when nobody (solo) or only one snake is left.
func (h *Hub) checkEnd(r *room, now time.Time) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	alive := []int{}
	active := 0
	for i, s := range r.Seats {
		if !s.Left {
			active++
		}
		if s.Data.alive && !s.Left {
			alive = append(alive, i)
		}
	}
	switch {
	case len(alive) == 0:
		r.Game.winner, r.Game.reason = -1, "out"
		h.end(r, now)
	case len(r.Seats) > 1 && len(alive) == 1:
		r.Game.winner, r.Game.reason = alive[0], "last"
		h.end(r, now)
	}
}

// timeUp ends the game at the time limit: the shortest living tail wins.
func (h *Hub) timeUp(r *room, now time.Time) {
	best := -1
	for i, s := range r.Seats {
		p := &s.Data
		if !p.alive || s.Left {
			continue
		}
		if best < 0 || p.tail() < r.Seats[best].Data.tail() ||
			(p.tail() == r.Seats[best].Data.tail() && p.correct > r.Seats[best].Data.correct) {
			best = i
		}
	}
	r.Game.winner, r.Game.reason = best, "time"
	h.end(r, now)
}

// Stop ends the running game for everyone (host only).
func (h *Hub) Stop(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Stop(uid, now, func(r *room) {
		r.Game.stopped = true
		r.Game.winner, r.Game.reason = -1, "stopped"
		h.end(r, now)
	})
}

func (h *Hub) end(r *room, now time.Time) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	r.Phase = lobby.PhaseDone
	r.Game.ended = now
	r.Touch(now)
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	s := r.Seats[i]
	p := &s.Data
	if p.reported || r.Game.started.IsZero() {
		return
	}
	award := points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	if finished {
		award = points.Finished(points.Outcome(p.earned, r.Game.winner == i, false), MaxPoints)
	}
	p.reported = true
	p.paid = award
	h.mu.Lock()
	defer h.mu.Unlock()
	if !finished {
		h.paid[s.ID()] = award
	}
	if !finished && award == 0 {
		return
	}
	h.pending = append(h.pending, Result{
		EventID: fmt.Sprintf("sn-%d-room-%d", s.ID(), r.Game.started.UnixNano()), UserID: s.ID(),
		GameKey: GameKey, Mission: Mission, Grade: s.Claims.Grade, Points: award,
		Correct: p.correct, Wrong: p.wrong, Seconds: int(now.Sub(r.Game.started).Seconds()),
		CompletedAt: record.Stamp(now), Answers: append([]questions.Answer{}, p.answers...), Match: matchOf(r, now),
	})
}

// standing orders seats: winner, then still alive, then shortest tail.
func standing(r *room) []int {
	order := make([]int, len(r.Seats))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool {
		x, y := r.Seats[order[a]], r.Seats[order[b]]
		if (order[a] == r.Game.winner) != (order[b] == r.Game.winner) {
			return order[a] == r.Game.winner
		}
		if x.Data.alive != y.Data.alive {
			return x.Data.alive
		}
		return x.Data.tail() < y.Data.tail()
	})
	return order
}

func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	if !g.ended.IsZero() {
		now = g.ended
	}
	players := make([]record.Player, 0, len(r.Seats))
	for _, s := range r.Seats {
		players = append(players, record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: s.Data.earned, Correct: s.Data.correct, Wrong: s.Data.wrong})
	}
	rank := map[int]int{}
	for pos, i := range standing(r) {
		rank[i] = len(players) - pos
	}
	record.Rank(players, func(i int) int { return rank[i] }, g.winner)
	return &record.Match{Key: fmt.Sprintf("sn-%s-%d", r.Pin, g.started.UnixNano()), Mode: record.Mode(players), Pin: r.Pin, Level: g.level, Grade: g.grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now), Finished: r.Phase == lobby.PhaseDone, Players: players}
}

func (h *Hub) prepareDeparture(uid int64, now time.Time) {
	_, _ = h.rooms.Act(uid, now, func(r *room) error {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		return nil
	})
}

// Leave takes uid out of their room; paid is -1 when nothing was settled.
func (h *Hub) Leave(uid int64, now time.Time) ([]int64, int) {
	h.prepareDeparture(uid, now)
	ids := h.rooms.Leave(uid, now)
	h.mu.Lock()
	defer h.mu.Unlock()
	paid, ok := h.paid[uid]
	delete(h.paid, uid)
	if !ok {
		paid = -1
	}
	return ids, paid
}

// TakeResults drains the results waiting for Laravel.
func (h *Hub) TakeResults() []Result {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := h.pending
	h.pending = nil
	return out
}

// Prune drops idle rooms, paying what players already earned.
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, 30*time.Minute, 2*time.Minute, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

func points2(ps []Point) [][2]int {
	out := make([][2]int, len(ps))
	for i, p := range ps {
		out[i] = [2]int{p.X, p.Y}
	}
	return out
}

func boardView(r *room, b *board, locale string, now time.Time) Message {
	foods := make([]Message, 0, len(b.foods))
	for _, f := range b.foods {
		foods = append(foods, Message{"label": Labels[f.option], "x": f.at.X, "y": f.at.Y})
	}
	blocks := make([][2]int, 0, len(b.obstacles))
	for _, o := range b.obstacles {
		blocks = append(blocks, [2]int{o.at.X, o.at.Y})
	}
	snakes := []Message{}
	for _, i := range seatsOn(r, b) {
		p := &r.Seats[i].Data
		snakes = append(snakes, Message{"seat": i, "body": points2(p.body), "dir": dirName(p.dir), "alive": p.alive && !r.Seats[i].Left, "frozen": now.Before(p.frozenUntil)})
	}
	opts := make([]string, len(b.q.Options))
	for i, o := range b.q.Options {
		opts[i] = o.Get(locale)
	}
	var question any
	if b.q.Prompt.ID != "" {
		question = Message{
			"id": fmt.Sprintf("%s-%p-%d", r.Pin, b, b.round), "text": b.q.Prompt.Get(locale), "options": opts,
			"labels": Labels[:len(opts)], "subject": b.q.Subject, "worth": b.q.Worth(),
			"remaining_ms": max(int64(0), b.deadline.Sub(now).Milliseconds()),
		}
	}
	return Message{"snakes": snakes, "foods": foods, "blocks": blocks, "question": question}
}

// State builds the snapshot sent to one player.
func (h *Hub) State(c auth.Claims, now time.Time) Message {
	msg := Message{
		"t": "snake_state", "phase": "lobby", "pin": "", "you": -1, "host": -1, "seq": 0, "players": []Message{},
		"min_players": MinPlayers, "max_players": MaxPlayers, "local_seats": false, "answer_seconds": 0,
		"answer_times": append([]int{}, lobby.AnswerTimes...), "subject": "mix", "subject_fallback": false,
		"mode": ModeShared, "grid": Grid, "initial_tail": InitialTail, "lives": Lives,
		"cut": Cut, "grow": Grow, "board": nil, "boards": []Message{}, "countdown_ms": int64(0),
		"remaining_ms": int64(0), "feedback": nil, "winner": nil, "reason": "", "stopped": false, "result": nil,
	}
	h.rooms.View(c.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(c.Subject)
		for k, v := range h.rooms.RoomPayload(r, c.Subject, func(i int, s *lobby.Seat[player]) Message {
			p := &s.Data
			return Message{"alive": p.alive, "lives": p.lives, "tail": max(0, p.tail()), "correct": p.correct, "wrong": p.wrong, "score": p.earned}
		}) {
			msg[k] = v
		}
		msg["answer_times"] = append([]int{}, lobby.AnswerTimes...)
		if g.mode != "" {
			msg["mode"] = g.mode
		}
		msg["stopped"] = g.stopped
		msg["reason"] = g.reason
		if r.Phase == lobby.PhaseLobby {
			return
		}
		you := r.SeatIndex(c.Subject)
		if g.mode == ModeShared && g.shared != nil {
			msg["board"] = boardView(r, g.shared, locale, now)
			msg["subject_fallback"] = g.shared.gen.Fallback()
		} else {
			boards := []Message{}
			for i, s := range r.Seats {
				if s.Data.board == nil {
					continue
				}
				v := boardView(r, s.Data.board, locale, now)
				v["seat"] = i
				if i == you {
					msg["board"] = v
					msg["subject_fallback"] = s.Data.board.gen.Fallback()
				} else {
					delete(v, "question")
					boards = append(boards, v)
				}
			}
			msg["boards"] = boards
		}
		if r.Phase == lobby.PhasePlaying {
			msg["countdown_ms"] = max(int64(0), g.started.Add(g.cfg.Countdown).Sub(now).Milliseconds())
			msg["remaining_ms"] = max(int64(0), g.deadline.Sub(now).Milliseconds())
		}
		if f := g.feedback; f != nil {
			fb := Message{"seq": f.seq, "seat": f.seat, "correct": f.correct, "timeout": f.timeout, "label": f.label,
				"prompt": f.prompt.Get(locale), "answer": f.answer.Get(locale), "hint": f.hint.Get(locale)}
			if f.attack != nil {
				fb["attack"] = Message{"from": f.attack.from, "to": f.attack.to, "kind": f.attack.kind}
			}
			msg["feedback"] = fb
		}
		if r.Phase == lobby.PhaseDone {
			if g.winner >= 0 {
				msg["winner"] = g.winner
			}
			if you >= 0 {
				msg["result"] = Message{"points": r.Seats[you].Data.paid}
			}
			msg["match"] = matchOf(r, now)
		}
	})
	return msg
}
