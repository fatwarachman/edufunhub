// Package snakes implements the authoritative referee for Ular Tangga rooms.
//
// Rooms follow the standard invite flow (package lobby): a host creates a
// room, shares the PIN or invite link, may add pass-and-play seats on their
// own device, and starts. Playing alone is a room with one seat. The hub owns
// dice rolls, questions, correct answers, turns, timers, ladders and snakes;
// clients only render the state and send intents.
package snakes

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

const (
	GameKey    = "snakes-and-ladders"
	Mission    = "room"
	MaxPlayers = 4
	MinPlayers = 1
	Finish     = 100
	Options    = 4
	PinDigits  = lobby.PinDigits

	// RollTime auto-rolls for a player who does not roll in time, so a
	// player who left their phone does not hold up the others.
	RollTime = 10 * time.Second
	// OfflineSkip skips the turn of a disconnected player.
	OfflineSkip = 5 * time.Second
	// AnswerTime is how long the current player has to answer.
	AnswerTime = 30 * time.Second
	// IdleAnswerTime replaces AnswerTime after an automatic roll: the player
	// did not touch the dice, so they are probably away.
	IdleAnswerTime = 10 * time.Second
	// RevealTime shows the correct answer to everyone.
	RevealTime = 2500 * time.Millisecond
	// StepTime and JumpTime pace the token animation clients play.
	StepTime = 300 * time.Millisecond
	JumpTime = 700 * time.Millisecond
	// MinAnswer rejects answers faster than a human can read the options.
	MinAnswer = 400 * time.Millisecond
	// IdleRoom drops rooms nobody touched for this long.
	IdleRoom = 30 * time.Minute
	// EmptyRoom drops rooms whose members are all offline.
	EmptyRoom = 5 * time.Minute

	ScoreCorrect = 100
	ScoreLadder  = 50
	ScoreFinish  = 100

	// FinishBonus is the portal point bonus of the first player to reach
	// square 100.
	FinishBonus = 100

	// MaxAnswered bounds the questions one seat can be paid for; the award
	// cap follows the admin point bounds (see points.Cap).
	MaxAnswered = 30
)

// MaxPoints is the highest award of one game.
var MaxPoints = points.Cap(MaxAnswered) + FinishBonus

// Durations are the game lengths the host can pick, in minutes. 0 plays
// until a player reaches square 100.
var Durations = []int{0, 5, 10, 15, 20, 30}

// Board layout, shared with resources/js/lib/snakes-board.ts.
var (
	Ladders = map[int]int{4: 16, 12: 31, 21: 42, 33: 54, 41: 79, 56: 76, 69: 88, 74: 92}
	Snakes  = map[int]int{28: 10, 37: 17, 48: 26, 62: 44, 75: 53, 84: 63, 95: 72, 98: 78}
)

// Room phases (lobby) and turn steps.
const (
	PhaseNone    = "none"
	PhaseLobby   = lobby.PhaseLobby
	PhasePlaying = lobby.PhasePlaying
	PhaseDone    = lobby.PhaseDone

	StepRoll     = "roll"
	StepQuestion = "question"
	StepReveal   = "reveal"
	StepMove     = "move"
)

var (
	ErrNotFound = lobby.ErrNotFound
	ErrFull     = lobby.ErrFull
	ErrStarted  = lobby.ErrStarted
	ErrNotHost  = lobby.ErrNotHost
	ErrPlayers  = lobby.ErrPlayers
	ErrPhase    = lobby.ErrPhase
	ErrNoRoom   = lobby.ErrNoRoom
	ErrNotTurn  = errors.New("not_your_turn")
	ErrOption   = errors.New("invalid_option")
	ErrTooEarly = errors.New("too_early")
	ErrDuration = errors.New("invalid_duration")
)

// Message is a generic event.
type Message = lobby.Message

// Result is reported to Laravel for each account holder when a game ends,
// or when they leave a game in which they answered at least one question.
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
	Match       *record.Match      `json:"match,omitempty"`
}

type player struct {
	position int
	score    int
	earned   int
	correct  int
	wrong    int
	answers  []questions.Answer
	reported bool
	// finished is the 1-based order in which the seat reached square 100.
	finished int
}

type game struct {
	step     string
	turn     int
	dice     int
	from     int
	landing  int
	final    int
	question questions.Question
	choice   int
	right    bool
	winner   int
	forfeit  bool
	timeUp   bool
	stopped  bool
	auto     bool
	// answer is the answer window: the host's choice or AnswerTime.
	answer time.Duration
	// minutes is the game length (0 = until a player finishes); first is
	// the seat that reached square 100 first (-1 = nobody yet).
	minutes  int
	first    int
	finishes int
	// round numbers the dice rolls; it identifies the current question.
	round   int
	gen     *questions.Generator
	grade   int
	subject string
	stepAt  time.Time
	started time.Time
}

type room = lobby.Room[game, player]

// Hub runs every Ular Tangga room. Safe for concurrent use.
type Hub struct {
	rooms *lobby.Hub[game, player]
	rng   *rand.Rand
	seed  uint64

	mu      sync.Mutex
	pending []Result
	// paid remembers the award of players who left a running game, so the
	// server can tell them their points were kept.
	paid map[int64]int
}

// NewHub creates an empty hub.
func NewHub(seed uint64) *Hub {
	h := &Hub{
		rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers, Local: true}),
		rng:   rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)),
		seed:  seed,
		paid:  map[int64]int{},
	}
	h.rooms.OnLeave = h.onLeave
	return h
}

// Destination applies a ladder or snake to a landing square.
func Destination(square int) int {
	if to, ok := Ladders[square]; ok {
		return to
	}
	if to, ok := Snakes[square]; ok {
		return to
	}
	return square
}

// Landing returns the square reached by rolling dice from position;
// overshooting the finish bounces back.
func Landing(position, dice int) int {
	raw := position + dice
	if raw > Finish {
		return 2*Finish - raw
	}
	return raw
}

// Award converts a finished game into portal points: the value of every
// correct answer plus the win bonus. Wrong answers never cost points.
func Award(earned int, won bool) int {
	return points.Finished(points.Outcome(earned, won, false), MaxPoints)
}

// award is the portal points of seat i; the first player to reach square
// 100 also earns FinishBonus.
func award(r *room, i int, finished bool) int {
	g := &r.Game
	p := &r.Seats[i].Data
	bonus := 0
	if g.first == i {
		bonus = FinishBonus
	}
	if !finished && p.finished == 0 {
		return min(points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)+bonus, MaxPoints)
	}
	return min(Award(p.earned, g.winner == i)+bonus, MaxPoints)
}

// SetDuration picks the game length in minutes before the game (host only).
func (h *Hub) SetDuration(uid int64, minutes int, now time.Time) ([]int64, error) {
	return h.rooms.Configure(uid, now, func(r *room) error {
		for _, d := range Durations {
			if d == minutes {
				r.Game.minutes = minutes
				return nil
			}
		}
		return ErrDuration
	})
}

// HandOver moves the host role away from a host disconnected for longer
// than lobby.HostGrace; the game keeps running either way.
func (h *Hub) HandOver(now time.Time) []int64 { return h.rooms.HandOver(now, lobby.HostGrace) }

// RoomPhase reports the phase of the room with the given PIN (PIN lookup).
func (h *Hub) RoomPhase(pin string) (string, bool) { return h.rooms.PhaseOf(pin) }

// Presence reports the room uid is seated in (portal "continue playing").
func (h *Hub) Presence(uid int64) (lobby.Presence, bool) { return h.rooms.PresenceOf(uid) }

// SetSubject picks the question subject before the game (host only).
func (h *Hub) SetSubject(uid int64, subject string, now time.Time) ([]int64, error) {
	return h.rooms.SetSubject(uid, subject, questions.NormSubject, now)
}

// Join marks a player connected. A returning member gets their seat back.
func (h *Hub) Join(claims auth.Claims, locale string) { h.rooms.Join(claims, locale) }

// SetLocale switches the language of question texts for one player.
func (h *Hub) SetLocale(uid int64, locale string) { h.rooms.SetLocale(uid, locale) }

// Offline marks a player disconnected. Their seat is kept so they can return.
func (h *Hub) Offline(uid int64) { h.rooms.Offline(uid) }

// Peers returns the account holders in uid's room (uid included).
func (h *Hub) Peers(uid int64) []int64 { return h.rooms.Peers(uid) }

// Counts reports open rooms and seated players for the server monitor.
func (h *Hub) Counts() (rooms, players int) { return h.rooms.Counts() }

// TakeResults drains results waiting to be reported.
func (h *Hub) TakeResults() []Result {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := h.pending
	h.pending = nil
	return out
}

func (h *Hub) queue(res Result) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pending = append(h.pending, res)
}

// Create opens a new room hosted by claims and returns its PIN.
func (h *Hub) Create(claims auth.Claims, now time.Time) (string, []int64) {
	return h.rooms.Create(claims, now, func(r *room) { r.Game.winner, r.Game.first = -1, -1 })
}

// Enter joins the room with the given PIN.
func (h *Hub) Enter(claims auth.Claims, pin string, now time.Time) ([]int64, error) {
	return h.rooms.Enter(claims, pin, now)
}

// AddLocal adds a pass-and-play seat on the host's device.
func (h *Hub) AddLocal(uid int64, name string, now time.Time) ([]int64, error) {
	return h.rooms.AddLocal(uid, name, now)
}

// RemoveLocal drops a pass-and-play seat before the game starts.
func (h *Hub) RemoveLocal(uid int64, seat int, now time.Time) ([]int64, error) {
	return h.rooms.RemoveLocal(uid, seat, now)
}

// Leave removes a player from their room and returns who must be updated.
// paid is the award kept for a running game the player left (-1 = none).
// A player leaving a running game without points gets 0.
func (h *Hub) Leave(uid int64, now time.Time) (ids []int64, paid int) {
	before, seated := h.rooms.PresenceOf(uid)
	ids = h.rooms.Leave(uid, now)
	h.mu.Lock()
	defer h.mu.Unlock()
	paid, ok := h.paid[uid]
	delete(h.paid, uid)
	switch {
	case ok:
	case seated && before.Phase == PhasePlaying:
		paid = 0
	default:
		paid = -1
	}
	return ids, paid
}

// onLeave runs under the lobby lock when a seat leaves a playing room.
func (h *Hub) onLeave(r *room, seat int, now time.Time) {
	g := &r.Game
	if r.Phase != PhasePlaying {
		return
	}
	h.settle(r, seat, false, now)
	if len(r.Seats) > 1 && r.Active() == 1 {
		for i, s := range r.Seats {
			if !s.Left {
				g.winner, g.forfeit = i, true
				h.end(r, now)
				return
			}
		}
	}
	if r.Active() > 0 && g.turn == seat && g.step != StepMove && !nextTurn(r, now) {
		h.end(r, now)
	}
}

// Start begins (or restarts) the game. Only the host may start.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		grade := r.Seats[0].Claims.Grade
		for _, s := range r.Seats {
			grade = min(grade, s.Claims.Grade)
			s.Data = player{position: 1}
		}
		h.seed++
		gen := questions.NewFor(GameKey, grade, h.seed).For(r.Subject, r.Humans()...)
		r.Game = game{gen: gen, grade: grade, subject: r.Subject, winner: -1, first: -1, minutes: r.Game.minutes, started: now, answer: r.AnswerTime(AnswerTime)}
		beginTurn(r, now)
		return nil
	})
}

func beginTurn(r *room, now time.Time) {
	g := &r.Game
	g.step, g.stepAt, g.dice, g.choice, g.right, g.auto = StepRoll, now, 0, -1, false, false
	r.Touch(now)
}

// playing reports whether seat i still takes turns.
func playing(r *room, i int) bool {
	s := r.Seats[i]
	return !s.Left && s.Data.finished == 0
}

// nextTurn passes the dice to the next seat still racing. It returns false
// when nobody is left to play (everyone left or finished).
func nextTurn(r *room, now time.Time) bool {
	g := &r.Game
	for i := 1; i <= len(r.Seats); i++ {
		next := (g.turn + i) % len(r.Seats)
		if playing(r, next) {
			g.turn = next
			beginTurn(r, now)
			return true
		}
	}
	return false
}

// answerTime is the answer window of the current question.
func answerTime(g *game) time.Duration {
	if g.auto {
		return min(IdleAnswerTime, g.answer)
	}
	return g.answer
}

// SetAnswerTime picks the answer time per question (host, before start).
func (h *Hub) SetAnswerTime(uid int64, seconds int, now time.Time) ([]int64, error) {
	return h.rooms.SetAnswerTime(uid, seconds, now)
}

// Stop ends the running game for everyone (host only): the leader wins and
// every player still in the room is paid for what they achieved.
func (h *Hub) Stop(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Stop(uid, now, func(r *room) {
		r.Game.stopped = true
		h.end(r, now)
	})
}

// timeLeft is the remaining game time of a timed game.
func timeLeft(g *game, now time.Time) time.Duration {
	return max(0, time.Duration(g.minutes)*time.Minute-now.Sub(g.started))
}

func turnCheck(r *room, uid int64, step string) error {
	if r.Phase != PhasePlaying || r.Game.step != step {
		return ErrPhase
	}
	if !r.Controls(uid, r.Game.turn) {
		return ErrNotTurn
	}
	return nil
}

// Roll throws the dice for the seat whose turn it is: the player's own seat,
// or a pass-and-play seat on the host's device.
func (h *Hub) Roll(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		if err := turnCheck(r, uid, StepRoll); err != nil {
			return err
		}
		h.roll(r, now, false)
		return nil
	})
}

func (h *Hub) roll(r *room, now time.Time, auto bool) {
	g := &r.Game
	p := &r.Seats[g.turn].Data
	g.dice = 1 + h.rng.IntN(6)
	g.from = p.position
	g.landing = Landing(p.position, g.dice)
	g.final = Destination(g.landing)
	g.question = questions.Trim(g.gen.Choice(), Options, g.gen.Rand)
	g.round++
	g.step, g.stepAt, g.auto = StepQuestion, now, auto
	r.Touch(now)
}

// Answer judges the current seat's answer.
func (h *Hub) Answer(uid int64, option int, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		if err := turnCheck(r, uid, StepQuestion); err != nil {
			return err
		}
		if option < 0 || option >= len(r.Game.question.Options) {
			return ErrOption
		}
		if now.Sub(r.Game.stepAt) < MinAnswer {
			return ErrTooEarly
		}
		judge(r, option, now)
		return nil
	})
}

func judge(r *room, option int, now time.Time) {
	g := &r.Game
	s := r.Seats[g.turn]
	p := &s.Data
	g.choice, g.right = option, option == g.question.Answer
	if g.right {
		p.score += ScoreCorrect
		p.earned += g.question.Worth()
		p.correct++
	} else {
		p.wrong++
	}
	if g.question.FromBank && !s.Local {
		p.answers = append(p.answers, questions.Answer{Key: g.question.Key, Correct: g.right})
	}
	g.step, g.stepAt = StepReveal, now
	r.Touch(now)
}

// moveDuration is how long clients need to animate the current move.
func moveDuration(g *game) time.Duration {
	d := time.Duration(g.dice)*StepTime + StepTime
	if g.final != g.landing {
		d += JumpTime
	}
	return d
}

// Tick advances every room's timers and returns the players to update.
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) { h.advance(r, now) })
}

func (h *Hub) advance(r *room, now time.Time) {
	g := &r.Game
	s := r.Seats[g.turn]
	p := &s.Data
	elapsed := now.Sub(g.stepAt)
	switch g.step {
	case StepRoll:
		switch {
		case g.minutes > 0 && timeLeft(g, now) == 0:
			g.timeUp = true
			h.end(r, now)
		case !playing(r, g.turn) || (!h.rooms.Online(r, g.turn) && elapsed >= OfflineSkip):
			if !nextTurn(r, now) {
				h.end(r, now)
			}
		case elapsed >= RollTime:
			h.roll(r, now, true)
		}
	case StepQuestion:
		if elapsed >= answerTime(g) || (!h.rooms.Online(r, g.turn) && elapsed >= OfflineSkip) {
			judge(r, -1, now)
		}
	case StepReveal:
		if elapsed < RevealTime {
			return
		}
		if !g.right {
			if !nextTurn(r, now) {
				h.end(r, now)
			}
			return
		}
		p.position = g.final
		if _, ladder := Ladders[g.landing]; ladder {
			p.score += ScoreLadder
		}
		g.step, g.stepAt = StepMove, now
		r.Touch(now)
	case StepMove:
		if elapsed < moveDuration(g) {
			return
		}
		switch {
		case p.position == Finish:
			p.score += ScoreFinish
			g.finishes++
			p.finished = g.finishes
			if g.first < 0 {
				g.first = g.turn
			}
			if g.minutes == 0 || !nextTurn(r, now) {
				h.end(r, now)
			}
		case g.dice == 6 && !s.Left:
			beginTurn(r, now)
		default:
			if !nextTurn(r, now) {
				h.end(r, now)
			}
		}
	}
}

// leader is the seat ranked first when the game ends: the first finisher,
// else the furthest seat still in the room (higher score breaks ties).
func leader(r *room) int {
	if r.Game.first >= 0 {
		return r.Game.first
	}
	best := -1
	for i, s := range r.Seats {
		if s.Left {
			continue
		}
		if best < 0 || s.Data.position > r.Seats[best].Data.position ||
			(s.Data.position == r.Seats[best].Data.position && s.Data.score > r.Seats[best].Data.score) {
			best = i
		}
	}
	return best
}

// end finishes the game and queues the result of every seat still playing.
func (h *Hub) end(r *room, now time.Time) {
	if r.Phase != PhasePlaying {
		return
	}
	if !r.Game.forfeit {
		r.Game.winner = leader(r)
	}
	r.Phase = PhaseDone
	r.Touch(now)
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

// settle queues the result of one seat once. Pass-and-play seats have no
// account. A seat leaving early keeps what it achieved (see
// points.Abandoned); a seat that already reached square 100 is paid in full.
func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	s := r.Seats[i]
	p := &s.Data
	if s.Local || p.reported || r.Game.started.IsZero() {
		return
	}
	pts := award(r, i, finished)
	if !finished && p.finished == 0 && pts == 0 {
		return
	}
	p.reported = true
	if !finished {
		h.mu.Lock()
		h.paid[s.ID()] = pts
		h.mu.Unlock()
	}
	h.queue(Result{
		EventID:     fmt.Sprintf("sl-%d-room-%d", s.ID(), r.Game.started.UnixNano()),
		UserID:      s.ID(),
		GameKey:     GameKey,
		Mission:     Mission,
		Grade:       s.Claims.Grade,
		Points:      pts,
		Correct:     p.correct,
		Wrong:       p.wrong,
		Seconds:     int(now.Sub(r.Game.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, p.answers...),
		Match:       matchOf(r, now),
	})
}

// matchOf summarises the game for the history of every player in it.
func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	players := make([]record.Player, len(r.Seats))
	for i, s := range r.Seats {
		players[i] = record.Player{Name: s.Claims.Name, Grade: s.Claims.Grade, Local: s.Local, Left: s.Left, Score: s.Data.score, Correct: s.Data.correct, Wrong: s.Data.wrong}
		if !s.Local {
			players[i].UserID = s.ID()
		}
	}
	record.Rank(players, func(i int) int {
		d := r.Seats[i].Data
		if d.finished > 0 {
			return 1_000_000_000 - d.finished
		}
		return d.position*10000 + d.score
	}, g.winner)
	return &record.Match{
		Key: fmt.Sprintf("sl-%s-%d", r.Pin, g.started.UnixNano()), Mode: record.Mode(players), Pin: r.Pin,
		Grade: g.grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now),
		Finished: r.Phase == PhaseDone, Players: players,
	}
}

// Prune drops idle rooms and rooms whose members are all offline; players of
// unfinished games are paid for what they achieved.
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, IdleRoom, EmptyRoom, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

// State returns the snapshot for one player.
func (h *Hub) State(claims auth.Claims, now time.Time) Message {
	msg := Message{
		"t": "snakes_state", "phase": PhaseNone, "you": -1,
		"min_players": MinPlayers, "max_players": MaxPlayers, "local_seats": true,
		"durations": Durations, "finish_bonus": FinishBonus,
		"roll_ms": RollTime.Milliseconds(),
	}
	h.rooms.View(claims.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(claims.Subject)
		for k, v := range h.rooms.RoomPayload(r, claims.Subject, func(_ int, s *lobby.Seat[player]) Message {
			return Message{"position": max(1, s.Data.position), "score": s.Data.score, "correct": s.Data.correct, "wrong": s.Data.wrong, "finished": s.Data.finished}
		}) {
			msg[k] = v
		}
		msg["minutes"] = g.minutes
		if r.Phase != PhaseLobby {
			msg["first"] = g.first
		}
		if r.Phase == PhaseDone {
			msg["winner"] = g.winner
			msg["reason"] = "finish"
			switch {
			case g.forfeit:
				msg["reason"] = "forfeit"
			case g.timeUp:
				msg["reason"] = "time"
			case g.stopped:
				msg["reason"] = "stopped"
			}
			if i := r.SeatIndex(claims.Subject); i >= 0 {
				msg["points"] = award(r, i, true)
				msg["finish_bonus_won"] = g.first == i
			}
		}
		if r.Phase != PhasePlaying {
			return
		}
		msg["turn"], msg["step"], msg["dice"] = g.turn, g.step, g.dice
		msg["auto_roll"] = g.auto
		if g.minutes > 0 {
			msg["time_left_ms"] = timeLeft(g, now).Milliseconds()
		}
		msg["subject_fallback"] = g.gen != nil && g.gen.Fallback()
		elapsed := now.Sub(g.stepAt)
		switch g.step {
		case StepRoll:
			msg["remaining_ms"] = max(0, (RollTime - elapsed).Milliseconds())
		case StepQuestion, StepReveal:
			opts := make([]string, len(g.question.Options))
			for i, o := range g.question.Options {
				opts[i] = o.Get(locale)
			}
			q := Message{
				"id": fmt.Sprintf("%s-%d", r.Pin, g.round), "subject": g.question.Subject, "worth": g.question.Worth(),
				"text": g.question.Prompt.Get(locale), "options": opts, "target": g.landing,
			}
			if g.step == StepQuestion {
				q["remaining_ms"] = max(0, (answerTime(g) - elapsed).Milliseconds())
			} else {
				msg["reveal"] = Message{
					"answer": g.question.Answer, "choice": g.choice, "correct": g.right,
					"hint": g.question.Hint.Get(locale),
				}
			}
			msg["question"] = q
		case StepMove:
			kind := ""
			if _, ok := Ladders[g.landing]; ok {
				kind = "ladder"
			} else if _, ok := Snakes[g.landing]; ok {
				kind = "snake"
			}
			msg["move"] = Message{
				"seat": g.turn, "from": g.from, "dice": g.dice, "landing": g.landing,
				"final": g.final, "kind": kind, "id": r.Seq,
			}
		}
	})
	return msg
}
