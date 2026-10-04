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

	// RollTime auto-rolls for a player who does not roll in time.
	RollTime = 25 * time.Second
	// OfflineSkip skips the turn of a disconnected player.
	OfflineSkip = 5 * time.Second
	// AnswerTime is how long the current player has to answer.
	AnswerTime = 30 * time.Second
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

	// MaxAnswered bounds the questions one seat can be paid for; the award
	// cap follows the admin point bounds (see points.Cap).
	MaxAnswered = 30
)

// MaxPoints is the highest award of one game.
var MaxPoints = points.Cap(MaxAnswered)

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
	gen      *questions.Generator
	grade    int
	subject  string
	stepAt   time.Time
	started  time.Time
}

type room = lobby.Room[game, player]

// Hub runs every Ular Tangga room. Safe for concurrent use.
type Hub struct {
	rooms *lobby.Hub[game, player]
	rng   *rand.Rand
	seed  uint64

	mu      sync.Mutex
	pending []Result
}

// NewHub creates an empty hub.
func NewHub(seed uint64) *Hub {
	h := &Hub{
		rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers, Local: true}),
		rng:   rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)),
		seed:  seed,
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
	return h.rooms.Create(claims, now, func(r *room) { r.Game.winner = -1 })
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
func (h *Hub) Leave(uid int64, now time.Time) []int64 { return h.rooms.Leave(uid, now) }

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
	if r.Active() > 0 && g.turn == seat && g.step != StepMove {
		nextTurn(r, now)
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
		r.Game = game{gen: gen, grade: grade, subject: r.Subject, winner: -1, started: now}
		beginTurn(r, now)
		return nil
	})
}

func beginTurn(r *room, now time.Time) {
	g := &r.Game
	g.step, g.stepAt, g.dice, g.choice, g.right = StepRoll, now, 0, -1, false
	r.Touch(now)
}

// nextTurn passes the dice to the next seat still in the room.
func nextTurn(r *room, now time.Time) {
	g := &r.Game
	for i := 1; i <= len(r.Seats); i++ {
		next := (g.turn + i) % len(r.Seats)
		if !r.Seats[next].Left {
			g.turn = next
			beginTurn(r, now)
			return
		}
	}
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
		h.roll(r, now)
		return nil
	})
}

func (h *Hub) roll(r *room, now time.Time) {
	g := &r.Game
	p := &r.Seats[g.turn].Data
	g.dice = 1 + h.rng.IntN(6)
	g.from = p.position
	g.landing = Landing(p.position, g.dice)
	g.final = Destination(g.landing)
	g.question = questions.Trim(g.gen.Choice(), Options, g.gen.Rand)
	g.step, g.stepAt = StepQuestion, now
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
		case s.Left || (!h.rooms.Online(r, g.turn) && elapsed >= OfflineSkip):
			nextTurn(r, now)
		case elapsed >= RollTime:
			h.roll(r, now)
		}
	case StepQuestion:
		if elapsed >= AnswerTime || (!h.rooms.Online(r, g.turn) && elapsed >= OfflineSkip) {
			judge(r, -1, now)
		}
	case StepReveal:
		if elapsed < RevealTime {
			return
		}
		if !g.right {
			nextTurn(r, now)
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
			g.winner = g.turn
			h.end(r, now)
		case g.dice == 6 && !s.Left:
			beginTurn(r, now)
		default:
			nextTurn(r, now)
		}
	}
}

// end finishes the game and queues the result of every seat still playing.
func (h *Hub) end(r *room, now time.Time) {
	r.Phase = PhaseDone
	r.Touch(now)
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

// settle queues the result of one seat once. Pass-and-play seats have no
// account. A seat leaving early is paid only after answering a question.
func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	s := r.Seats[i]
	p := &s.Data
	if s.Local || p.reported || r.Game.started.IsZero() {
		return
	}
	pts := Award(p.earned, r.Game.winner == i)
	if !finished {
		if p.correct+p.wrong < points.MinAnswersForAbandon {
			return
		}
		pts = points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	}
	p.reported = true
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
	record.Rank(players, func(i int) int { return r.Seats[i].Data.position*10000 + r.Seats[i].Data.score }, g.winner)
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
	}
	h.rooms.View(claims.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(claims.Subject)
		for k, v := range h.rooms.RoomPayload(r, claims.Subject, func(_ int, s *lobby.Seat[player]) Message {
			return Message{"position": max(1, s.Data.position), "score": s.Data.score, "correct": s.Data.correct, "wrong": s.Data.wrong}
		}) {
			msg[k] = v
		}
		if r.Phase == PhaseDone {
			msg["winner"] = g.winner
			msg["reason"] = "finish"
			if g.forfeit {
				msg["reason"] = "forfeit"
			}
			if i := r.SeatIndex(claims.Subject); i >= 0 {
				msg["points"] = Award(r.Seats[i].Data.earned, g.winner == i)
			}
		}
		if r.Phase != PhasePlaying {
			return
		}
		msg["turn"], msg["step"], msg["dice"] = g.turn, g.step, g.dice
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
				"id": fmt.Sprintf("%s-%d", r.Pin, r.Seq), "subject": g.question.Subject, "worth": g.question.Worth(),
				"text": g.question.Prompt.Get(locale), "options": opts, "target": g.landing,
			}
			if g.step == StepQuestion {
				q["remaining_ms"] = max(0, (AnswerTime - elapsed).Milliseconds())
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
