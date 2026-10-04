// Package crossword implements the authoritative referee for Teka-Teki
// Silang. Rooms follow the standard invite flow (package lobby): a room with
// one seat is solo play; with friends everyone races on the same grid and the
// first to answer a word owns it. The hub owns the answers: clients only see
// letters of solved words and hints.
package crossword

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"strings"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/record"
)

const (
	GameKey    = "crossword"
	MinPlayers = 1
	MaxPlayers = 4
	Hints      = 3

	// GuessGap throttles answers per player (stops brute force).
	GuessGap = 600 * time.Millisecond
	// IdleRoom and EmptyRoom bound how long rooms live.
	IdleRoom  = 30 * time.Minute
	EmptyRoom = 5 * time.Minute

	ScoreWordBase = 100
	ScoreLetter   = 10
	HintCost      = 30

	// LevelBonus is added per word for every level above 1 (longer words).
	LevelBonus = 5
)

// TimeLimit per level.
func TimeLimit(level int) time.Duration {
	return time.Duration(3+3*level) * time.Minute
}

// PointsPerWord is the standard per-correct value plus a bonus that grows
// with the level (10 / 15 / 20 / 25 with the default rules).
func PointsPerWord(level int) int { return points.Question(0) + LevelBonus*(max(1, level)-1) }

// MaxPoints is the award cap of a level.
func MaxPoints(level int) int {
	l, _ := FindLevel(level)
	return points.Cap(l.Words) + LevelBonus*l.Words*(max(1, level)-1)
}

// Mission names the level in game history (level-1 … level-4).
func Mission(level int) string { return fmt.Sprintf("level-%d", level) }

var (
	ErrLevel    = errors.New("invalid_level")
	ErrTimeUp   = errors.New("time_up")
	ErrWord     = errors.New("invalid_word")
	ErrSolved   = errors.New("already_solved")
	ErrLength   = errors.New("wrong_length")
	ErrTooFast  = errors.New("too_fast")
	ErrNoHints  = errors.New("no_hints")
	ErrPhase    = lobby.ErrPhase
	ErrNotHost  = lobby.ErrNotHost
	ErrNotFound = lobby.ErrNotFound
)

// Message is a generic event.
type Message = lobby.Message

// Result is reported to Laravel for each player when a game ends.
type Result struct {
	EventID     string        `json:"event_id"`
	UserID      int64         `json:"user_id"`
	GameKey     string        `json:"game_key"`
	Mission     string        `json:"mission"`
	Grade       int           `json:"grade"`
	Points      int           `json:"points"`
	Correct     int           `json:"correct"`
	Wrong       int           `json:"wrong"`
	Seconds     int           `json:"duration_seconds"`
	CompletedAt string        `json:"completed_at"`
	Answers     []any         `json:"answers"`
	Match       *record.Match `json:"match,omitempty"`
}

type player struct {
	score     int
	solved    int
	wrong     int
	hints     int
	lastGuess time.Time
	reported  bool
}

type game struct {
	draw     bool
	level    int
	puzzle   Puzzle
	solvedBy []int
	revealed map[[2]int]bool
	started  time.Time
	ends     time.Time
	ended    string
	winner   int
}

type room = lobby.Room[game, player]

// Hub runs every crossword room. Safe for concurrent use.
type Hub struct {
	rooms *lobby.Hub[game, player]
	rng   *rand.Rand

	mu      sync.Mutex
	pending []Result
}

// NewHub creates an empty hub.
func NewHub(seed uint64) *Hub {
	h := &Hub{
		rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers}),
		rng:   rand.New(rand.NewPCG(seed, seed^0x51f15e1d)),
	}
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
func (h *Hub) Enter(c auth.Claims, pin string, now time.Time) ([]int64, error) {
	return h.rooms.Enter(c, pin, now)
}

// Create opens a room at a level (1–4).
func (h *Hub) Create(c auth.Claims, level int, now time.Time) ([]int64, error) {
	if _, ok := FindLevel(level); !ok {
		return nil, ErrLevel
	}
	_, ids := h.rooms.Create(c, now, func(r *room) { r.Game = game{level: level, winner: -1} })
	return ids, nil
}

// SetLevel changes the room level before the game starts (host only).
func (h *Hub) SetLevel(uid int64, level int, now time.Time) ([]int64, error) {
	if _, ok := FindLevel(level); !ok {
		return nil, ErrLevel
	}
	return h.rooms.Act(uid, now, func(r *room) error {
		if r.Host != uid {
			return ErrNotHost
		}
		if r.Phase == lobby.PhasePlaying {
			return ErrPhase
		}
		r.Game.level = level
		r.Touch(now)
		return nil
	})
}

// Start generates the puzzle and starts the clock.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		level := max(1, r.Game.level)
		l, _ := FindLevel(level)
		p := Generate(l, h.rng)
		solved := make([]int, len(p.Words))
		for i := range solved {
			solved[i] = -1
		}
		r.Game = game{level: level, puzzle: p, solvedBy: solved, revealed: map[[2]int]bool{}, started: now, ends: now.Add(TimeLimit(level)), winner: -1}
		for _, s := range r.Seats {
			s.Data = player{hints: Hints}
		}
		return nil
	})
}

func normalize(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if r >= 'A' && r <= 'Z' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Guess checks an answer for one word.
func (h *Hub) Guess(uid int64, word int, answer string, now time.Time) ([]int64, bool, error) {
	right := false
	ids, err := h.rooms.Act(uid, now, func(r *room) error {
		g := &r.Game
		if r.Phase != lobby.PhasePlaying {
			return ErrPhase
		}
		if !now.Before(g.ends) {
			// The ticker ends the game and reveals every answer to the room.
			return ErrTimeUp
		}
		if word < 0 || word >= len(g.puzzle.Words) {
			return ErrWord
		}
		if g.solvedBy[word] >= 0 {
			return ErrSolved
		}
		seat := r.SeatIndex(uid)
		p := &r.Seats[seat].Data
		w := g.puzzle.Words[word]
		answer = normalize(answer)
		if len(answer) != len(w.Answer) {
			return ErrLength
		}
		if now.Sub(p.lastGuess) < GuessGap {
			return ErrTooFast
		}
		p.lastGuess = now
		if answer != w.Answer {
			p.wrong++
			r.Touch(now)
			return nil
		}
		right = true
		g.solvedBy[word] = seat
		p.solved++
		p.score += ScoreWordBase + ScoreLetter*len(w.Answer)
		r.Touch(now)
		if solvedAll(g) {
			h.end(r, "solved", now)
		}
		return nil
	})
	return ids, right, err
}

// Hint reveals one hidden letter of a word to everyone.
func (h *Hub) Hint(uid int64, word int, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		g := &r.Game
		if r.Phase != lobby.PhasePlaying {
			return ErrPhase
		}
		if !now.Before(g.ends) {
			// The ticker ends the game and reveals every answer to the room.
			return ErrTimeUp
		}
		if word < 0 || word >= len(g.puzzle.Words) {
			return ErrWord
		}
		if g.solvedBy[word] >= 0 {
			return ErrSolved
		}
		p := &r.Seats[r.SeatIndex(uid)].Data
		if p.hints <= 0 {
			return ErrNoHints
		}
		var hidden [][2]int
		for _, cell := range g.puzzle.Words[word].Cells() {
			if !g.visible(cell) {
				hidden = append(hidden, cell)
			}
		}
		if len(hidden) == 0 {
			return ErrSolved
		}
		g.revealed[hidden[h.rng.IntN(len(hidden))]] = true
		p.hints--
		p.score = max(0, p.score-HintCost)
		r.Touch(now)
		return nil
	})
}

func solvedAll(g *game) bool {
	for _, s := range g.solvedBy {
		if s < 0 {
			return false
		}
	}
	return true
}

// visible reports whether a cell's letter may be shown.
func (g *game) visible(cell [2]int) bool {
	if g.revealed[cell] {
		return true
	}
	for i, w := range g.puzzle.Words {
		if g.solvedBy[i] < 0 {
			continue
		}
		for _, c := range w.Cells() {
			if c == cell {
				return true
			}
		}
	}
	return false
}

// Tick ends rooms whose time ran out.
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) {
		if !now.Before(r.Game.ends) {
			h.end(r, "time", now)
		}
	})
}

func (h *Hub) onLeave(r *room, seat int, now time.Time) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	h.settle(r, seat, false, now)
	if r.Active() == 0 {
		r.Phase = lobby.PhaseDone
	}
}

// end finishes the game and pays everyone still in the room.
func (h *Hub) end(r *room, reason string, now time.Time) {
	g := &r.Game
	r.Phase = lobby.PhaseDone
	g.ended = reason
	best, bestScore, tied := -1, -1, false
	for i, s := range r.Seats {
		switch {
		case s.Left:
		case s.Data.score > bestScore:
			best, bestScore, tied = i, s.Data.score, false
		case s.Data.score == bestScore:
			tied = true
		}
	}
	g.draw = r.Active() > 1 && tied
	if r.Active() > 1 && !tied {
		g.winner = best
	}
	r.Touch(now)
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

// Award converts a finished game into portal points: every solved word
// plus the win bonus. A draw adds the draw bonus (0 by default) and a wrong
// guess never costs points.
func Award(level, solved int, won, draw bool) int {
	return points.Finished(points.Outcome(solved*PointsPerWord(level), won, draw), MaxPoints(level))
}

func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	g := &r.Game
	s := r.Seats[i]
	p := &s.Data
	if s.Local || p.reported || g.started.IsZero() {
		return
	}
	pts := Award(g.level, p.solved, g.winner == i, g.draw)
	if !finished {
		if p.solved+p.wrong < points.MinAnswersForAbandon {
			return
		}
		pts = points.Abandoned(p.solved*PointsPerWord(g.level), p.solved+p.wrong, MaxPoints(g.level))
	}
	p.reported = true
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pending = append(h.pending, Result{
		EventID:     fmt.Sprintf("cw-%d-level-%d", s.ID(), g.started.UnixNano()),
		UserID:      s.ID(),
		GameKey:     GameKey,
		Mission:     Mission(g.level),
		Grade:       s.Claims.Grade,
		Points:      pts,
		Correct:     p.solved,
		Wrong:       min(p.wrong, 500),
		Seconds:     int(now.Sub(g.started).Seconds()),
		CompletedAt: now.UTC().Format(time.RFC3339),
		Answers:     []any{},
		Match:       matchOf(r, now),
	})
}

// matchOf summarises the game for the history of every player in it.
func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	players := make([]record.Player, len(r.Seats))
	grade := r.Seats[0].Claims.Grade
	for i, s := range r.Seats {
		grade = min(grade, s.Claims.Grade)
		players[i] = record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: s.Data.score, Correct: s.Data.solved, Wrong: s.Data.wrong}
	}
	record.Rank(players, func(i int) int { return r.Seats[i].Data.score }, -1)
	words := make([]record.Word, len(g.puzzle.Words))
	for i, w := range g.puzzle.Words {
		words[i] = record.Word{Key: w.Key, Solved: g.solvedBy[i] >= 0}
	}
	return &record.Match{
		Key: fmt.Sprintf("cw-%s-%d", r.Pin, g.started.UnixNano()), Mode: record.Mode(players), Pin: r.Pin,
		Level: g.level, Grade: grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now),
		Finished: r.Phase == lobby.PhaseDone, Players: players, Words: words,
	}
}

// TakeResults drains results waiting to be reported.
func (h *Hub) TakeResults() []Result {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := h.pending
	h.pending = nil
	return out
}

// Prune drops idle rooms; unfinished games pay what was achieved.
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, IdleRoom, EmptyRoom, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

// State returns the snapshot for one player. Answers are never sent; only
// letters of solved words and hinted cells.
func (h *Hub) State(c auth.Claims, now time.Time) Message {
	msg := Message{
		"t": "crossword_state", "phase": "none", "you": -1,
		"min_players": MinPlayers, "max_players": MaxPlayers, "local_seats": false,
		"levels": levelList(),
	}
	h.rooms.View(c.Subject, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		for k, v := range h.rooms.RoomPayload(r, c.Subject, func(_ int, s *lobby.Seat[player]) Message {
			return Message{"score": s.Data.score, "solved": s.Data.solved, "wrong": s.Data.wrong, "hints": s.Data.hints}
		}) {
			msg[k] = v
		}
		msg["level"] = max(1, g.level)
		if g.started.IsZero() {
			return
		}
		locale := h.rooms.Locale(c.Subject)
		cells := make([][]any, g.puzzle.Rows)
		for row := range cells {
			cells[row] = make([]any, g.puzzle.Cols)
			for col := range cells[row] {
				if g.puzzle.Letters[row][col] == 0 {
					continue
				}
				cell := Message{}
				if g.visible([2]int{row, col}) {
					cell["letter"] = string(g.puzzle.Letters[row][col])
				}
				cells[row][col] = cell
			}
		}
		words := make([]Message, len(g.puzzle.Words))
		for i, w := range g.puzzle.Words {
			clue := w.ClueID
			if locale == "en" {
				clue = w.ClueEN
			}
			words[i] = Message{
				"index": i, "number": w.Number, "dir": w.Dir, "row": w.Row, "col": w.Col,
				"length": len(w.Answer), "clue": clue, "solved_by": g.solvedBy[i],
			}
		}
		msg["grid"] = Message{"rows": g.puzzle.Rows, "cols": g.puzzle.Cols, "cells": cells}
		msg["words"] = words
		msg["remaining_ms"] = max(0, g.ends.Sub(now).Milliseconds())
		if r.Phase == lobby.PhaseDone {
			msg["reason"] = g.ended
			msg["winner"] = g.winner
			if i := r.SeatIndex(c.Subject); i >= 0 {
				msg["points"] = Award(g.level, r.Seats[i].Data.solved, g.winner == i, g.draw)
			}
			msg["draw"] = g.draw
			if g.ended == "time" {
				msg["unsolved"] = len(g.puzzle.Words) - solvedCount(g)
			}
			answers := make([]string, len(g.puzzle.Words))
			for i, w := range g.puzzle.Words {
				answers[i] = w.Answer
			}
			msg["answers"] = answers
		}
	})
	return msg
}

func levelList() []Message {
	out := make([]Message, len(Levels))
	for i, l := range Levels {
		out[i] = Message{"level": l.Number, "size": l.Size, "words": l.Words, "minutes": int(TimeLimit(l.Number).Minutes())}
	}
	return out
}

// solvedCount counts words already solved.
func solvedCount(g *game) int {
	n := 0
	for _, by := range g.solvedBy {
		if by >= 0 {
			n++
		}
	}
	return n
}
