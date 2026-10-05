// Package minigames implements the authoritative referee shared by the room
// quiz games Market Math, Number & Letter Garden, Explore Indonesia and Mini
// Lab.
//
// Rooms follow the standard invite flow (package lobby): a host creates a
// room, shares the PIN or invite link and starts; a room with one seat is
// solo play. Every seat answers the same question at the same time. The hub
// owns the content, the correct answers, timers, scores and the final point
// award (package points); every result carries the shared match summary
// (package record). Clients only render the state and send answers.
package minigames

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
	Mission    = "room"
	MinPlayers = 1
	MaxPlayers = 4
	Rounds     = 8
	Options    = 4

	// Countdown before the first question.
	Countdown = 3 * time.Second
	// RevealTime shows the correct answer before the next round.
	RevealTime = 3 * time.Second
	// MinAnswer rejects answers faster than a human can read the options.
	MinAnswer = 400 * time.Millisecond
	// IdleRoom and EmptyRoom bound how long rooms live.
	IdleRoom  = 30 * time.Minute
	EmptyRoom = 5 * time.Minute

	ScoreCorrect = 100
	SpeedBonus   = 50

	// PassPercent of correct answers counts as a solo "win".
	PassPercent = 70
)

// MaxPoints is the highest award of one game.
var MaxPoints = points.Cap(Rounds)

// Steps of a playing room.
const (
	StepCountdown = "countdown"
	StepQuestion  = "question"
	StepReveal    = "reveal"
)

var (
	ErrPhase    = lobby.ErrPhase
	ErrNotInRun = errors.New("not_in_room")
	ErrOption   = errors.New("invalid_option")
	ErrAnswered = errors.New("already_answered")
	ErrTooEarly = errors.New("too_early")
)

// Message is a generic event.
type Message = lobby.Message

// Item is one element of a question illustration (a shop item, a flower, a
// province pin, a test tube…). Icon is a key of the client icon map.
type Item struct {
	Icon  string
	Label questions.Text
	Value string
	Color string
	Count int
}

// Visual illustrates a question. Kind picks the client layout.
type Visual struct {
	Kind  string
	Items []Item
	Note  questions.Text
}

// Round is one generated question with its illustration.
type Round struct {
	Question questions.Question
	Visual   Visual
}

// Spec describes one game built on the shared referee.
type Spec struct {
	Key string
	// Prefix starts event ids and match keys (e.g. "mm").
	Prefix string
	// RoundTime is how long players have to answer (younger grades get more).
	RoundTime func(grade int) time.Duration
	// Make builds a server-generated round for a grade.
	Make func(grade int, r *rand.Rand) Round
	// BankSubjects lets admin bank questions distributed to this game join
	// the rotation (one in BankShare rounds when available).
	BankSubjects []string
	BankShare    int
}

// Result is reported to Laravel for each account holder.
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
	score    int
	earned   int
	correct  int
	wrong    int
	choice   int
	answered bool
	gained   int
	history  []bool
	answers  []questions.Answer
	reported bool
}

type game struct {
	step    string
	round   int
	current Round
	grade   int
	bank    *questions.Generator
	rng     *rand.Rand
	seen    map[string]bool
	stepAt  time.Time
	started time.Time
	ended   time.Time
}

type room = lobby.Room[game, player]

// Hub runs every room of one game. Safe for concurrent use.
type Hub struct {
	Spec  Spec
	rooms *lobby.Hub[game, player]
	seed  uint64

	mu      sync.Mutex
	pending []Result
}

// NewHub creates an empty hub for spec.
func NewHub(spec Spec, seed uint64) *Hub {
	h := &Hub{Spec: spec, seed: seed, rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers})}
	h.rooms.OnLeave = h.onLeave
	return h
}

// Join, SetLocale, Offline, Peers, Counts, Leave and Enter follow the lobby.
func (h *Hub) Join(c auth.Claims, locale string)      { h.rooms.Join(c, locale) }
func (h *Hub) SetLocale(uid int64, l string)          { h.rooms.SetLocale(uid, l) }
func (h *Hub) Offline(uid int64)                      { h.rooms.Offline(uid) }
func (h *Hub) Peers(uid int64) []int64                { return h.rooms.Peers(uid) }
func (h *Hub) Counts() (int, int)                     { return h.rooms.Counts() }
func (h *Hub) Leave(uid int64, now time.Time) []int64 { return h.rooms.Leave(uid, now) }

// Enter joins the room with the given PIN.
func (h *Hub) Enter(c auth.Claims, pin string, now time.Time) ([]int64, error) {
	return h.rooms.Enter(c, pin, now)
}

// Create opens a room hosted by claims.
func (h *Hub) Create(c auth.Claims, now time.Time) []int64 {
	_, ids := h.rooms.Create(c, now, nil)
	return ids
}

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

// Award converts a finished game into portal points: the value of every
// correct answer plus the win bonus and participation, capped.
func Award(earned int, won bool) int {
	return points.Finished(points.Outcome(earned, won, false), MaxPoints)
}

// Start begins (or restarts) the game. Only the host may start.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		grade := r.Seats[0].Claims.Grade
		for _, s := range r.Seats {
			grade = min(grade, s.Claims.Grade)
			s.Data = player{choice: -1}
		}
		h.seed++
		r.Game = game{
			step: StepCountdown, grade: grade, stepAt: now, started: now,
			rng:  rand.New(rand.NewPCG(h.seed, h.seed^0x6a09e667f3bcc909)),
			bank: questions.NewFor(h.Spec.Key, grade, h.seed).For("", r.Humans()...),
			seen: map[string]bool{},
		}
		return nil
	})
}

// next draws the next round: sometimes an admin bank question, otherwise
// server-generated content, never repeating a prompt within one game.
func (h *Hub) next(g *game) Round {
	if h.Spec.BankShare > 0 && g.rng.IntN(h.Spec.BankShare) == 0 {
		if q, ok := g.bank.BankChoice(h.Spec.BankSubjects...); ok {
			return Round{Question: questions.Trim(q, Options, g.rng)}
		}
	}
	var round Round
	for try := 0; try < 12; try++ {
		round = h.Spec.Make(g.grade, g.rng)
		if !g.seen[round.Question.Prompt.ID] {
			break
		}
	}
	g.seen[round.Question.Prompt.ID] = true
	round.Question = questions.Trim(round.Question, Options, g.rng)
	return round
}

func (h *Hub) ask(r *room, now time.Time) {
	g := &r.Game
	g.current = h.next(g)
	g.step, g.stepAt = StepQuestion, now
	for _, s := range r.Seats {
		s.Data.answered, s.Data.choice, s.Data.gained = false, -1, 0
	}
	r.Touch(now)
}

// Answer records uid's choice for the current round.
func (h *Hub) Answer(uid int64, option int, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		g := &r.Game
		if r.Phase != lobby.PhasePlaying || g.step != StepQuestion {
			return ErrPhase
		}
		i := r.SeatIndex(uid)
		if i < 0 {
			return ErrNotInRun
		}
		if option < 0 || option >= len(g.current.Question.Options) {
			return ErrOption
		}
		if now.Sub(g.stepAt) < MinAnswer {
			return ErrTooEarly
		}
		p := &r.Seats[i].Data
		if p.answered {
			return ErrAnswered
		}
		p.answered, p.choice = true, option
		if option == g.current.Question.Answer {
			left := max(0, h.Spec.RoundTime(g.grade)-now.Sub(g.stepAt))
			p.gained = ScoreCorrect + int(int64(SpeedBonus)*int64(left)/int64(h.Spec.RoundTime(g.grade)))
		}
		r.Touch(now)
		if allAnswered(r) {
			reveal(r, now)
		}
		return nil
	})
}

func allAnswered(r *room) bool {
	for _, s := range r.Seats {
		if !s.Left && !s.Data.answered {
			return false
		}
	}
	return true
}

// reveal closes the round: unanswered seats count as wrong.
func reveal(r *room, now time.Time) {
	g := &r.Game
	for _, s := range r.Seats {
		if s.Left {
			continue
		}
		p := &s.Data
		right := p.answered && p.choice == g.current.Question.Answer
		if right {
			p.score += p.gained
			p.earned += g.current.Question.Worth()
			p.correct++
		} else {
			p.gained = 0
			p.wrong++
		}
		p.history = append(p.history, right)
		if g.current.Question.FromBank {
			p.answers = append(p.answers, questions.Answer{Key: g.current.Question.Key, Correct: right})
		}
	}
	g.round++
	g.step, g.stepAt = StepReveal, now
	r.Touch(now)
}

// Tick advances every room's timers and returns the players to update.
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) { h.advance(r, now) })
}

func (h *Hub) advance(r *room, now time.Time) {
	g := &r.Game
	elapsed := now.Sub(g.stepAt)
	switch g.step {
	case StepCountdown:
		if elapsed >= Countdown {
			h.ask(r, now)
		}
	case StepQuestion:
		if elapsed >= h.Spec.RoundTime(g.grade) || allAnswered(r) {
			reveal(r, now)
		}
	case StepReveal:
		if elapsed < RevealTime {
			return
		}
		if g.round >= Rounds {
			h.end(r, now)
			return
		}
		h.ask(r, now)
	}
}

// winner returns the seat that won (-1 = none). With friends the unique top
// score wins; solo play "wins" by answering PassPercent correctly.
func winner(r *room) int {
	active := []int{}
	for i, s := range r.Seats {
		if !s.Left {
			active = append(active, i)
		}
	}
	if len(r.Seats) == 1 {
		if len(active) == 1 && r.Seats[0].Data.correct*100 >= PassPercent*Rounds {
			return 0
		}
		return -1
	}
	best, top, tie := -1, -1, false
	for _, i := range active {
		switch score := r.Seats[i].Data.score; {
		case score > top:
			best, top, tie = i, score, false
		case score == top:
			tie = true
		}
	}
	if tie {
		return -1
	}
	return best
}

func (h *Hub) end(r *room, now time.Time) {
	r.Phase = lobby.PhaseDone
	r.Game.ended = now
	r.Touch(now)
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

// onLeave runs under the lobby lock when a seat leaves a playing room.
func (h *Hub) onLeave(r *room, seat int, now time.Time) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	h.settle(r, seat, false, now)
	if r.Active() > 0 && r.Game.step == StepQuestion && allAnswered(r) {
		reveal(r, now)
	}
}

// settle queues the result of one seat once. A seat leaving early is paid
// only after answering points.MinAnswersForAbandon questions.
func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	s := r.Seats[i]
	p := &s.Data
	if s.Local || p.reported || r.Game.started.IsZero() {
		return
	}
	pts := Award(p.earned, winner(r) == i)
	if !finished {
		if p.correct+p.wrong < points.MinAnswersForAbandon {
			return
		}
		pts = points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	}
	p.reported = true
	h.queue(Result{
		EventID:     fmt.Sprintf("%s-%d-room-%d", h.Spec.Prefix, s.ID(), r.Game.started.UnixNano()),
		UserID:      s.ID(),
		GameKey:     h.Spec.Key,
		Mission:     Mission,
		Grade:       s.Claims.Grade,
		Points:      pts,
		Correct:     p.correct,
		Wrong:       p.wrong,
		Seconds:     int(now.Sub(r.Game.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     append([]questions.Answer{}, p.answers...),
		Match:       h.matchOf(r, now),
	})
}

// matchOf summarises the game for the history of every player in it.
func (h *Hub) matchOf(r *room, now time.Time) *record.Match {
	players := make([]record.Player, len(r.Seats))
	for i, s := range r.Seats {
		players[i] = record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: s.Data.score, Correct: s.Data.correct, Wrong: s.Data.wrong}
	}
	record.Rank(players, func(i int) int { return r.Seats[i].Data.score }, -1)
	return &record.Match{
		Key: fmt.Sprintf("%s-%s-%d", h.Spec.Prefix, r.Pin, r.Game.started.UnixNano()), Mode: record.Mode(players), Pin: r.Pin,
		Grade: r.Game.grade, StartedAt: record.Stamp(r.Game.started), EndedAt: record.Stamp(now),
		Finished: r.Phase == lobby.PhaseDone, Players: players,
	}
}

// Prune drops idle rooms; players of unfinished games are paid for what they
// achieved.
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, IdleRoom, EmptyRoom, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

func localize(v Visual, locale string) Message {
	items := make([]Message, len(v.Items))
	for i, it := range v.Items {
		items[i] = Message{"icon": it.Icon, "label": it.Label.Get(locale), "value": it.Value, "color": it.Color, "count": it.Count}
	}
	return Message{"kind": v.Kind, "items": items, "note": v.Note.Get(locale)}
}

// State returns the snapshot for one player.
func (h *Hub) State(claims auth.Claims, now time.Time) Message {
	msg := Message{
		"t": "mini_state", "game": h.Spec.Key, "phase": "none", "you": -1, "total": Rounds,
		"min_players": MinPlayers, "max_players": MaxPlayers, "local_seats": false,
	}
	h.rooms.View(claims.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(claims.Subject)
		for k, v := range h.rooms.RoomPayload(r, claims.Subject, func(_ int, s *lobby.Seat[player]) Message {
			return Message{"score": s.Data.score, "correct": s.Data.correct, "answered": s.Data.answered, "history": append([]bool{}, s.Data.history...)}
		}) {
			msg[k] = v
		}
		if r.Phase == lobby.PhaseDone {
			w := winner(r)
			msg["winner"] = w
			if i := r.SeatIndex(claims.Subject); i >= 0 {
				p := r.Seats[i].Data
				msg["result"] = Message{"points": Award(p.earned, w == i), "correct": p.correct, "wrong": p.wrong, "score": p.score, "won": w == i}
			}
			return
		}
		if r.Phase != lobby.PhasePlaying {
			return
		}
		msg["step"], msg["round"] = g.step, g.round
		elapsed := now.Sub(g.stepAt)
		switch g.step {
		case StepCountdown:
			msg["countdown_ms"] = max(0, (Countdown - elapsed).Milliseconds())
		case StepQuestion, StepReveal:
			q := g.current.Question
			opts := make([]string, len(q.Options))
			for i, o := range q.Options {
				opts[i] = o.Get(locale)
			}
			choice := -1
			if i := r.SeatIndex(claims.Subject); i >= 0 {
				choice = r.Seats[i].Data.choice
			}
			question := Message{
				"id": fmt.Sprintf("%s-%d", r.Pin, g.round), "subject": q.Subject, "worth": q.Worth(),
				"text": q.Prompt.Get(locale), "options": opts, "choice": choice,
				"visual": localize(g.current.Visual, locale), "round_ms": h.Spec.RoundTime(g.grade).Milliseconds(),
			}
			if g.step == StepQuestion {
				question["remaining_ms"] = max(0, (h.Spec.RoundTime(g.grade) - elapsed).Milliseconds())
			} else {
				gained := 0
				if i := r.SeatIndex(claims.Subject); i >= 0 {
					gained = r.Seats[i].Data.gained
				}
				msg["reveal"] = Message{"answer": q.Answer, "hint": q.Hint.Get(locale), "gained": gained}
			}
			msg["question"] = question
		}
	})
	return msg
}
