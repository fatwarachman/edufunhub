// Package pingpong referees quiz rallies: each return of the ball is a
// multiple choice question from the shared question bank. Clients submit
// only the displayed option index; the correct answer stays on the server
// until the question is resolved.
package pingpong

import (
	"encoding/json"
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

const GameKey = "ping-pong"
const Mission = "room"
const Target = 5
const MaxRounds = 60
const AnswerTime = 15 * time.Second

// Options is the most answer options shown per question.
const Options = 4

var MaxPoints = points.Cap(MaxRounds)
var ErrOption = errors.New("invalid_option")
var ErrStale = errors.New("stale_question")
var ErrTurn = errors.New("not_your_turn")

type Message = map[string]any

type player struct {
	correct, wrong, earned, paid int
	answers                      []questions.Answer
	reported                     bool
}

// feedback describes the previous, already resolved question.
type feedback struct {
	round, seat          int
	correct              bool
	prompt, answer, hint questions.Text
}
type game struct {
	round, turn, rally, winner, level, grade int
	question                                 questions.Question
	gen                                      *questions.Generator
	// firstRound is the round id that opened this match; round ids stay
	// monotonic across rematches, so the visible turn number is relative.
	firstRound                      int
	goals                           [2]int
	bot                             bool
	botData                         player
	feedback                        *feedback
	stopped                         bool
	started, ended, deadline, botAt time.Time
	answer                          time.Duration
	rng                             *rand.Rand
}
type room = lobby.Room[game, player]
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
type Hub struct {
	rooms   *lobby.Hub[game, player]
	seed    uint64
	mu      sync.Mutex
	pending []Result
	paid    map[int64]int
}

func NewHub(seed uint64) *Hub {
	h := &Hub{rooms: lobby.New[game, player](seed, lobby.Config{Min: 1, Max: 2, Local: false}), seed: seed, paid: map[int64]int{}}
	h.rooms.OnLeave = func(r *room, seat int, now time.Time) {
		h.settle(r, seat, false, now)
		if r.Active() > 0 {
			r.Game.winner = 1 - seat
			h.end(r, now, true)
		}
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
func (h *Hub) Create(c auth.Claims, now time.Time) (string, []int64) {
	h.prepareDeparture(c.Subject, now)
	return h.rooms.Create(c, now, func(r *room) { r.Game.winner = -1 })
}
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
	r.Game = game{round: r.Game.round, winner: -1}
}
func (h *Hub) SetAnswerTime(uid int64, seconds int, now time.Time) ([]int64, error) {
	return h.rooms.SetAnswerTime(uid, seconds, now)
}

// SetSubject picks the question subject before the game (host only; "" or
// "mix" = every subject).
func (h *Hub) SetSubject(uid int64, subject string, now time.Time) ([]int64, error) {
	return h.rooms.SetSubject(uid, subject, questions.NormSubject, now)
}

// Start begins (or restarts) the match. Questions follow the lowest grade
// and level among the human seats.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		h.seed++
		previousRound := r.Game.round
		grade, level := r.Seats[0].Claims.Grade, points.Level(r.Seats[0].Claims.Level)
		for _, s := range r.Seats {
			grade = min(grade, s.Claims.Grade)
			level = min(level, points.Level(s.Claims.Level))
		}
		gen := questions.NewFor(GameKey, grade, h.seed).For(r.Subject, r.Humans()...).AtLevel(level)
		r.Game = game{round: previousRound, firstRound: previousRound + 1, winner: -1, bot: len(r.Seats) == 1, level: level, grade: grade, gen: gen, started: now, answer: r.AnswerTime(AnswerTime), rng: rand.New(rand.NewPCG(h.seed, h.seed^0x9913))}
		begin(r, now)
		return nil
	})
}
func begin(r *room, now time.Time) {
	g := &r.Game
	g.round++
	g.question = questions.Trim(g.gen.Choice(), Options, g.gen.Rand)
	g.deadline = now.Add(g.answer)
	g.botAt = now.Add(time.Duration(1000+g.rng.IntN(1001)) * time.Millisecond)
	r.Touch(now)
}

// Answer judges the displayed option (0-based) picked for the current round.
func (h *Hub) Answer(uid int64, round, option int, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		if r.Phase != lobby.PhasePlaying {
			return lobby.ErrPhase
		}
		if round != r.Game.round {
			return ErrStale
		}
		if !r.Controls(uid, r.Game.turn) {
			return ErrTurn
		}
		if option < 0 || option >= len(r.Game.question.Options) {
			return ErrOption
		}
		if !now.Before(r.Game.deadline) {
			h.resolve(r, -1, now)
			return nil
		}
		h.resolve(r, option, now)
		return nil
	})
}

// resolve judges the current question; option -1 is a timeout.
func (h *Hub) resolve(r *room, option int, now time.Time) {
	g := &r.Game
	seat := g.turn
	q := g.question
	correct := option >= 0 && option == q.Answer
	p := &g.botData
	if !g.bot || seat == 0 {
		p = &r.Seats[seat].Data
		if q.FromBank {
			p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: correct, Choice: q.Original(option)})
		}
	}
	g.feedback = &feedback{round: g.round, seat: seat, correct: correct, prompt: q.Prompt, answer: q.Options[q.Answer], hint: q.Hint}
	if correct {
		p.correct++
		p.earned += q.Worth()
		g.rally++
		g.turn = 1 - seat
	} else {
		p.wrong++
		g.goals[1-seat]++
		g.rally = 0
	}
	// Round identifiers stay monotonic across restarts; count answers separately.
	answered := g.botData.correct + g.botData.wrong
	for _, s := range r.Seats {
		answered += s.Data.correct + s.Data.wrong
	}
	if g.goals[0] >= Target || g.goals[1] >= Target || answered >= MaxRounds {
		h.end(r, now, false)
		return
	}
	begin(r, now)
}
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) {
		g := &r.Game
		switch {
		case !now.Before(g.deadline):
			h.resolve(r, -1, now)
		case g.bot && g.turn == 1 && !now.Before(g.botAt):
			h.resolve(r, botPick(g), now)
		default:
			r.Seq++
		}
	})
}

// botPick answers correctly about 75% of the time; otherwise it picks a
// wrong displayed option.
func botPick(g *game) int {
	n := len(g.question.Options)
	if g.rng.IntN(4) != 0 || n < 2 {
		return g.question.Answer
	}
	return (g.question.Answer + 1 + g.rng.IntN(n-1)) % n
}
func (h *Hub) Stop(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Stop(uid, now, func(r *room) { r.Game.stopped = true; h.end(r, now, false) })
}
func (h *Hub) end(r *room, now time.Time, forfeit bool) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	if !forfeit {
		r.Game.winner = -1
		if r.Game.goals[0] > r.Game.goals[1] {
			r.Game.winner = 0
		}
		if r.Game.goals[1] > r.Game.goals[0] {
			r.Game.winner = 1
		}
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
		award = points.Finished(points.Outcome(p.earned, r.Game.winner == i, r.Game.winner < 0), MaxPoints)
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
	h.pending = append(h.pending, Result{fmt.Sprintf("pp-%d-room-%d", s.ID(), r.Game.started.UnixNano()), s.ID(), GameKey, Mission, s.Claims.Grade, award, p.correct, p.wrong, int(now.Sub(r.Game.started).Seconds()), record.Stamp(now), append([]questions.Answer{}, p.answers...), matchOf(r, now)})
}
func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	if !g.ended.IsZero() {
		now = g.ended
	}
	players := make([]record.Player, 0, 2)
	for i, s := range r.Seats {
		players = append(players, record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: g.goals[i], Correct: s.Data.correct, Wrong: s.Data.wrong})
	}
	mode := record.ModeRoom
	if g.bot {
		mode = record.ModeBot
		players = append(players, record.Player{Name: "Bot", Bot: true, Grade: g.grade, Score: g.goals[1], Correct: g.botData.correct, Wrong: g.botData.wrong})
	}
	record.Rank(players, func(i int) int { return players[i].Score }, g.winner)
	return &record.Match{Key: fmt.Sprintf("pp-%s-%d", r.Pin, g.started.UnixNano()), Mode: mode, Pin: r.Pin, Level: g.level, Grade: g.grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now), Finished: r.Phase == lobby.PhaseDone, Players: players}
}
func (h *Hub) prepareDeparture(uid int64, now time.Time) {
	_, _ = h.rooms.Act(uid, now, func(r *room) error {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		return nil
	})
}
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
func (h *Hub) TakeResults() []Result {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := h.pending
	h.pending = nil
	return out
}
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, 30*time.Minute, 2*time.Minute, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}
func (h *Hub) State(c auth.Claims, now time.Time) Message {
	msg := Message{"t": "pingpong_state", "phase": "lobby", "pin": "", "you": -1, "host": -1, "seq": 0, "players": []Message{}, "min_players": 1, "max_players": 2, "local_seats": false, "answer_seconds": 0, "answer_times": append([]int{}, lobby.AnswerTimes...), "round": 0, "turn_number": 0, "turn": 0, "subject": "mix", "subject_fallback": false, "question": nil, "remaining_ms": int64(0), "goals": [2]int{}, "target": Target, "max_rounds": MaxRounds, "rally": 0, "feedback": nil, "winner": nil, "stopped": false, "result": nil}
	h.rooms.View(c.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(c.Subject)
		for k, v := range h.rooms.RoomPayload(r, c.Subject, func(i int, s *lobby.Seat[player]) Message {
			return Message{"bot": false, "score": g.goals[min(i, 1)], "correct": s.Data.correct, "wrong": s.Data.wrong}
		}) {
			msg[k] = v
		}
		msg["answer_times"] = append([]int{}, lobby.AnswerTimes...)
		players := msg["players"].([]Message)
		// Character bytes belong to claims; clone before returning outside the lock.
		for _, p := range players {
			if raw, ok := p["character"].(json.RawMessage); ok {
				p["character"] = append(json.RawMessage{}, raw...)
			}
		}
		if g.bot && r.Phase != lobby.PhaseLobby {
			players = append(players, Message{"seat": 1, "name": "Bot", "grade": g.grade, "online": true, "left": false, "local": false, "controlled": false, "bot": true, "score": g.goals[1], "correct": g.botData.correct, "wrong": g.botData.wrong})
		}
		msg["players"] = players
		msg["round"], msg["turn"], msg["goals"], msg["rally"], msg["stopped"], msg["level"] = g.round, g.turn, g.goals, g.rally, g.stopped, g.level
		if g.firstRound > 0 && g.round >= g.firstRound {
			msg["turn_number"] = g.round - g.firstRound + 1
		}
		if r.Phase != lobby.PhaseLobby && g.gen != nil {
			q := g.question
			opts := make([]string, len(q.Options))
			for i, o := range q.Options {
				opts[i] = o.Get(locale)
			}
			msg["subject_fallback"] = g.gen.Fallback()
			msg["question"] = Message{"id": fmt.Sprintf("%s-%d", r.Pin, g.round), "text": q.Prompt.Get(locale), "options": opts, "subject": q.Subject, "worth": q.Worth()}
		}
		if r.Phase == lobby.PhasePlaying {
			msg["remaining_ms"] = max(int64(0), g.deadline.Sub(now).Milliseconds())
		}
		if g.feedback != nil {
			f := *g.feedback
			msg["feedback"] = Message{"round": f.round, "seat": f.seat, "correct": f.correct, "goal": !f.correct, "prompt": f.prompt.Get(locale), "answer": f.answer.Get(locale), "hint": f.hint.Get(locale)}
		}
		if r.Phase == lobby.PhaseDone {
			if g.winner >= 0 {
				msg["winner"] = g.winner
			}
			if i := r.SeatIndex(c.Subject); i >= 0 {
				msg["result"] = Message{"points": r.Seats[i].Data.paid}
			}
			msg["match"] = matchOf(r, now)
		}
	})
	return msg
}
