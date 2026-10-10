// Package duel implements the authoritative referee for Duel Kuis Kelas.
//
// Two players of the same grade band are matched and answer the same
// questions at the same time. When nobody else is waiting, a bot opponent
// joins after BotAfter so the game is always playable. The hub owns the
// questions, correct answers, timers, scores and the final point award; the
// correct answer is only revealed after both players answered or time ran out.
package duel

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/record"
)

const (
	GameKey = "quiz-duel"
	Mission = "duel"
	Rounds  = 5
	Options = 4

	// Countdown before the first question.
	Countdown = 3 * time.Second
	// RoundTime is how long both players have to answer.
	RoundTime = 15 * time.Second
	// RevealGap shows the correct answer before the next round.
	RevealGap = 3 * time.Second
	// MinAnswer rejects answers faster than a human can read the options.
	MinAnswer = 400 * time.Millisecond
	// BotAfter is how long a player waits in the queue before a bot joins.
	BotAfter = 12 * time.Second
	// StaleAfter drops finished or abandoned matches and queue entries.
	StaleAfter = 10 * time.Minute

	ScoreCorrect = 100
	SpeedBonus   = 50

	BotName = "Robo Edu"
)

// MaxPoints is the highest award of one duel.
var MaxPoints = points.Cap(Rounds)

// Phases.
const (
	PhaseIdle      = "idle"
	PhaseQueue     = "queue"
	PhaseCountdown = "countdown"
	PhaseQuestion  = "question"
	PhaseReveal    = "reveal"
	PhaseDone      = "done"
)

// Outcomes.
const (
	OutcomeWin  = "win"
	OutcomeLose = "lose"
	OutcomeDraw = "draw"
)

var (
	ErrPhase    = errors.New("wrong_phase")
	ErrOption   = errors.New("invalid_option")
	ErrAnswered = errors.New("already_answered")
	ErrTooEarly = errors.New("too_early")
)

// Message is a generic event.
type Message map[string]any

// Result is reported to Laravel for each human player when a match ends.
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
	claims   auth.Claims
	bot      bool
	score    int
	earned   int
	correct  int
	wrong    int
	choice   int
	answered bool
	gained   int
	history  []bool
	answers  []questions.Answer
	botAt    time.Time
	botRight bool
}

func (p *player) id() int64 { return p.claims.Subject }

type match struct {
	subject  string
	id       string
	pin      string
	players  [2]*player
	gen      *questions.Generator
	rng      *rand.Rand
	grade    int
	phase    string
	round    int
	question questions.Question
	phaseAt  time.Time
	started  time.Time
	ended    time.Time
	changed  bool
	// roundTime is the answer window (a private room host may change it).
	roundTime time.Duration
}

type waiting struct {
	claims  auth.Claims
	subject string
	since   time.Time
}

// Hub matches players and runs every duel. Safe for concurrent use.
type Hub struct {
	mu      sync.Mutex
	seed    uint64
	queue   []waiting
	matches map[int64]*match
	locales map[int64]string
	online  map[int64]bool
}

// NewHub creates an empty hub.
func NewHub(seed uint64) *Hub {
	return &Hub{seed: seed, matches: map[int64]*match{}, locales: map[int64]string{}, online: map[int64]bool{}}
}

func normLocale(l string) string {
	if l == "en" {
		return "en"
	}
	return "id"
}

// Join marks a player connected and returns their state.
func (h *Hub) Join(claims auth.Claims, locale string, now time.Time) Message {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.locales[claims.Subject] = normLocale(locale)
	h.online[claims.Subject] = true
	for i := range h.queue {
		if h.queue[i].claims.Subject == claims.Subject {
			h.queue[i].claims = claims
		}
	}
	return h.stateLocked(claims.Subject, claims, now)
}

// SetLocale switches the language of question texts for one player.
func (h *Hub) SetLocale(uid int64, locale string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.locales[uid] = normLocale(locale)
}

// Offline marks a player disconnected and drops them from the queue.
// An unfinished match keeps running; unanswered rounds count as wrong.
func (h *Hub) Offline(uid int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.online, uid)
	h.dequeueLocked(uid)
}

// Queue looks for an opponent. A finished match is cleared first.
func (h *Hub) Queue(claims auth.Claims, subject string, now time.Time) ([]int64, error) {
	subject = questions.NormSubject(subject)
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.matches[claims.Subject]; ok {
		if m.phase != PhaseDone {
			return nil, ErrPhase
		}
		delete(h.matches, claims.Subject)
	}
	for _, w := range h.queue {
		if w.claims.Subject == claims.Subject {
			return []int64{claims.Subject}, nil
		}
	}
	for i, w := range h.queue {
		if questions.Band(w.claims.Grade) == questions.Band(claims.Grade) && w.subject == subject {
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			m := h.startLocked(w.claims, claims, subject, false, now)
			return []int64{m.players[0].id(), m.players[1].id()}, nil
		}
	}
	h.queue = append(h.queue, waiting{claims: claims, subject: subject, since: now})
	return []int64{claims.Subject}, nil
}

// Busy reports whether uid is in a live (unfinished) match.
func (h *Hub) Busy(uid int64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	m, ok := h.matches[uid]
	return ok && m.phase != PhaseDone
}

// StartPrivate starts a match between two invited friends (room PIN flow).
// Grade bands may differ; questions follow the lower grade.
// roundTime > 0 overrides RoundTime (the host's answer time).
func (h *Hub) StartPrivate(a, b auth.Claims, pin, subject string, roundTime time.Duration, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range []auth.Claims{a, b} {
		if m, ok := h.matches[c.Subject]; ok {
			if m.phase != PhaseDone {
				return nil, ErrPhase
			}
			delete(h.matches, c.Subject)
		}
		h.dequeueLocked(c.Subject)
	}
	m := h.startLocked(a, b, subject, false, now)
	m.pin = pin
	if roundTime > 0 {
		m.roundTime = roundTime
	}
	return m.humanIDs(), nil
}

// Cancel leaves the queue or clears a finished match.
func (h *Hub) Cancel(uid int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.dequeueLocked(uid)
	if m, ok := h.matches[uid]; ok && m.phase == PhaseDone {
		delete(h.matches, uid)
	}
}

func (h *Hub) dequeueLocked(uid int64) {
	for i, w := range h.queue {
		if w.claims.Subject == uid {
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			return
		}
	}
}

func (h *Hub) startLocked(a, b auth.Claims, subject string, bot bool, now time.Time) *match {
	h.seed++
	grade := min(a.Grade, b.Grade)
	level := min(points.Level(a.Level), points.Level(b.Level))
	humans := []int64{a.Subject}
	if !bot {
		humans = append(humans, b.Subject)
	}
	m := &match{
		id:      fmt.Sprintf("%d", now.UnixNano()),
		subject: questions.NormSubject(subject),
		gen:     questions.NewFor(GameKey, grade, h.seed).For(subject, humans...).AtLevel(level),
		rng:     rand.New(rand.NewPCG(h.seed, h.seed^0x5bd1e995)),
		grade:   grade,
		phase:   PhaseCountdown,
		phaseAt: now,
		started: now,

		roundTime: RoundTime,
	}
	m.players[0] = &player{claims: a, choice: -1}
	m.players[1] = &player{claims: b, choice: -1, bot: bot}
	for _, p := range m.players {
		if !p.bot {
			h.matches[p.id()] = m
		}
	}
	return m
}

func botClaims(grade int) auth.Claims {
	return auth.Claims{Subject: 0, Name: BotName, Grade: grade, Game: GameKey}
}

// Answer records a player's choice for the current round.
func (h *Hub) Answer(uid int64, option int, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m, ok := h.matches[uid]
	if !ok || m.phase != PhaseQuestion {
		return nil, ErrPhase
	}
	if option < 0 || option >= len(m.question.Options) {
		return nil, ErrOption
	}
	if now.Sub(m.phaseAt) < MinAnswer {
		return nil, ErrTooEarly
	}
	p := m.playerByID(uid)
	if p.answered {
		return nil, ErrAnswered
	}
	m.record(p, option, now)
	if m.players[0].answered && m.players[1].answered {
		m.reveal(now)
	}
	return m.humanIDs(), nil
}

func (m *match) playerByID(uid int64) *player {
	if m.players[0].id() == uid && !m.players[0].bot {
		return m.players[0]
	}
	return m.players[1]
}

func (m *match) opponent(p *player) *player {
	if m.players[0] == p {
		return m.players[1]
	}
	return m.players[0]
}

func (m *match) humanIDs() []int64 {
	ids := make([]int64, 0, 2)
	for _, p := range m.players {
		if !p.bot {
			ids = append(ids, p.id())
		}
	}
	return ids
}

// record stores a choice and its score. Faster correct answers earn a bonus.
func (m *match) record(p *player, option int, now time.Time) {
	p.answered, p.choice, p.gained = true, option, 0
	if option == m.question.Answer {
		left := max(0, m.roundTime-now.Sub(m.phaseAt))
		p.gained = ScoreCorrect + int(int64(SpeedBonus)*int64(left)/int64(m.roundTime))
		p.score += p.gained
		p.earned += m.question.Worth()
		p.correct++
	} else {
		p.wrong++
	}
}

func (m *match) nextQuestion(now time.Time) {
	m.question = m.gen.Present(m.gen.Choice(), Options)
	m.phase, m.phaseAt = PhaseQuestion, now
	for _, p := range m.players {
		p.answered, p.choice, p.gained = false, -1, 0
		if p.bot {
			p.botAt = now.Add(time.Duration(3000+m.rng.IntN(8000)) * time.Millisecond)
			p.botRight = m.rng.IntN(100) < 60
		}
	}
}

// reveal closes the round: unanswered players count as wrong.
func (m *match) reveal(now time.Time) {
	for _, p := range m.players {
		if !p.answered {
			p.wrong++
			p.gained = 0
		}
		right := p.answered && p.choice == m.question.Answer
		p.history = append(p.history, right)
		if m.question.FromBank && !p.bot {
			p.answers = append(p.answers, questions.Answer{Key: m.question.Key, Correct: right, Choice: m.question.Picked(p.answered, p.choice)})
		}
	}
	m.round++
	m.phase, m.phaseAt = PhaseReveal, now
}

// Tick advances timers for every match and the queue. It returns the users
// whose state changed and the results to report.
func (h *Hub) Tick(now time.Time) ([]int64, []Result) {
	h.mu.Lock()
	defer h.mu.Unlock()
	changed := map[int64]bool{}
	var results []Result

	for i := 0; i < len(h.queue); {
		w := h.queue[i]
		if now.Sub(w.since) >= BotAfter {
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			h.startLocked(w.claims, botClaims(w.claims.Grade), w.subject, true, now)
			changed[w.claims.Subject] = true
			continue
		}
		i++
	}

	seen := map[*match]bool{}
	for _, m := range h.matches {
		if seen[m] {
			continue
		}
		seen[m] = true
		if res := m.advance(now); res != nil || m.changed {
			m.changed = false
			for _, id := range m.humanIDs() {
				changed[id] = true
			}
			results = append(results, res...)
		}
	}

	ids := make([]int64, 0, len(changed))
	for id := range changed {
		ids = append(ids, id)
	}
	return ids, results
}

// advance moves one match forward in time.
func (m *match) advance(now time.Time) []Result {
	switch m.phase {
	case PhaseCountdown:
		if now.Sub(m.phaseAt) >= Countdown {
			m.nextQuestion(now)
			m.changed = true
		}
	case PhaseQuestion:
		for _, p := range m.players {
			if p.bot && !p.answered && !now.Before(p.botAt) {
				choice := m.question.Answer
				if !p.botRight {
					choice = (m.question.Answer + 1 + m.rng.IntN(len(m.question.Options)-1)) % len(m.question.Options)
				}
				m.record(p, choice, now)
				m.changed = true
			}
		}
		if (m.players[0].answered && m.players[1].answered) || now.Sub(m.phaseAt) >= m.roundTime {
			m.reveal(now)
			m.changed = true
		}
	case PhaseReveal:
		if now.Sub(m.phaseAt) >= RevealGap {
			m.changed = true
			if m.round >= Rounds {
				return m.finish(now)
			}
			m.nextQuestion(now)
		}
	}
	return nil
}

func (m *match) outcome(p *player) string {
	o := m.opponent(p)
	switch {
	case p.score > o.score:
		return OutcomeWin
	case p.score < o.score:
		return OutcomeLose
	default:
		return OutcomeDraw
	}
}

// Award converts a duel into portal points: the value of every correct
// answer plus the win bonus. A draw adds the draw bonus (0 by default) and a
// wrong answer never costs points.
func Award(earned int, outcome string) int {
	return points.Finished(points.Outcome(earned, outcome == OutcomeWin, outcome == OutcomeDraw), MaxPoints)
}

func (m *match) finish(now time.Time) []Result {
	m.phase, m.phaseAt, m.ended = PhaseDone, now, now
	summary := m.summary(now)
	results := make([]Result, 0, 2)
	for _, p := range m.players {
		if p.bot {
			continue
		}
		results = append(results, Result{
			EventID:     fmt.Sprintf("qd-%d-duel-%s", p.id(), m.id),
			UserID:      p.id(),
			GameKey:     GameKey,
			Mission:     Mission,
			Grade:       p.claims.Grade,
			Points:      Award(p.earned, m.outcome(p)),
			Correct:     p.correct,
			Wrong:       p.wrong,
			Seconds:     int(now.Sub(m.started).Seconds()),
			CompletedAt: now.UTC().Format(time.RFC3339),
			Answers:     append([]questions.Answer{}, p.answers...),
			Match:       summary,
		})
	}
	return results
}

// summary describes the match for the history of both players.
func (m *match) summary(now time.Time) *record.Match {
	players := make([]record.Player, 2)
	for i, p := range m.players {
		players[i] = record.Player{Name: p.claims.Name, Grade: p.claims.Grade, Bot: p.bot, Score: p.score, Correct: p.correct, Wrong: p.wrong}
		if !p.bot {
			players[i].UserID = p.id()
		}
	}
	record.Rank(players, func(i int) int { return players[i].Score }, -1)
	mode := record.ModeRandom
	switch {
	case m.players[1].bot:
		mode = record.ModeBot
	case m.pin != "":
		mode = record.ModeRoom
	}
	return &record.Match{
		Key: "qd-" + m.id, Mode: mode, Pin: m.pin, Grade: m.grade,
		StartedAt: record.Stamp(m.started), EndedAt: record.Stamp(now), Finished: true, Players: players,
	}
}

// Prune drops stale queue entries and finished or abandoned matches.
func (h *Hub) Prune(now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for uid, m := range h.matches {
		idle := m.phase == PhaseDone && now.Sub(m.ended) > StaleAfter
		abandoned := !h.online[uid] && now.Sub(m.started) > StaleAfter
		if idle || abandoned {
			delete(h.matches, uid)
		}
	}
	for uid := range h.locales {
		if _, inMatch := h.matches[uid]; !inMatch && !h.online[uid] {
			delete(h.locales, uid)
		}
	}
}

// Peers returns the human players sharing uid's match (uid included).
func (h *Hub) Peers(uid int64) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.matches[uid]; ok {
		return m.humanIDs()
	}
	return nil
}

// Presence reports a running match of uid (portal "continue playing").
func (h *Hub) Presence(uid int64) (pin string, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m, found := h.matches[uid]
	if !found || m.phase == PhaseDone {
		return "", false
	}
	return m.pin, true
}

// Counts reports live matches and queued players for the server monitor.
func (h *Hub) Counts() (matches, queued int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := map[*match]bool{}
	for _, m := range h.matches {
		if m.phase != PhaseDone {
			seen[m] = true
		}
	}
	return len(seen), len(h.queue)
}

// State returns the snapshot for one player.
func (h *Hub) State(claims auth.Claims, now time.Time) Message {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.stateLocked(claims.Subject, claims, now)
}

func (h *Hub) stateLocked(uid int64, claims auth.Claims, now time.Time) Message {
	msg := Message{"t": "duel_state", "phase": PhaseIdle, "total": Rounds, "round": 0, "round_ms": RoundTime.Milliseconds()}
	for _, w := range h.queue {
		if w.claims.Subject == uid {
			msg["phase"] = PhaseQueue
			msg["waited_ms"] = now.Sub(w.since).Milliseconds()
			msg["bot_after_ms"] = BotAfter.Milliseconds()
			msg["you"] = Message{"name": claims.Name, "grade": claims.Grade, "character": claims.Character}
			return msg
		}
	}
	m, ok := h.matches[uid]
	if !ok {
		msg["you"] = Message{"name": claims.Name, "grade": claims.Grade, "character": claims.Character}
		return msg
	}
	msg["round_ms"] = m.roundTime.Milliseconds()
	locale := h.locales[uid]
	me := m.playerByID(uid)
	op := m.opponent(me)
	msg["phase"] = m.phase
	msg["round"] = m.round
	msg["match_id"] = m.id
	msg["subject"] = subjectOrMix(m.subject)
	msg["subject_fallback"] = m.gen.Fallback()
	msg["you"] = Message{"name": me.claims.Name, "grade": me.claims.Grade, "character": me.claims.Character, "score": me.score, "correct": me.correct, "history": append([]bool{}, me.history...)}
	msg["opponent"] = Message{
		"name": op.claims.Name, "grade": op.claims.Grade, "character": op.claims.Character, "score": op.score, "correct": op.correct,
		"bot": op.bot, "online": op.bot || h.online[op.id()], "answered": op.answered,
		"history": append([]bool{}, op.history...),
	}
	if !op.bot && op.id() > 0 {
		msg["opponent"].(Message)["user_id"] = op.id()
	}
	switch m.phase {
	case PhaseCountdown:
		msg["countdown_ms"] = max(0, (Countdown - now.Sub(m.phaseAt)).Milliseconds())
	case PhaseQuestion, PhaseReveal:
		opts := make([]string, len(m.question.Options))
		for i, o := range m.question.Options {
			opts[i] = o.Get(locale)
		}
		q := Message{
			"id":      fmt.Sprintf("%s-%d", m.id, m.round),
			"subject": m.question.Subject,
			"worth":   m.question.Worth(),
			"text":    m.question.Prompt.Get(locale),
			"media":   m.question.Media(),
			"options": opts,
			"choice":  me.choice,
		}
		if m.phase == PhaseQuestion {
			q["id"] = fmt.Sprintf("%s-%d", m.id, m.round+1)
			q["remaining_ms"] = max(0, (m.roundTime - now.Sub(m.phaseAt)).Milliseconds())
		} else {
			msg["reveal"] = Message{
				"answer": m.question.Answer, "yours": me.choice, "theirs": op.choice,
				"gained": me.gained, "opponent_gained": op.gained,
				"hint": m.question.Hint.Get(locale),
			}
		}
		msg["question"] = q
	case PhaseDone:
		outcome := m.outcome(me)
		msg["result"] = Message{
			"outcome": outcome, "points": Award(me.correct, outcome),
			"correct": me.correct, "wrong": me.wrong, "score": me.score, "opponent_score": op.score,
		}
	}
	return msg
}

func subjectOrMix(s string) string {
	if s == "" {
		return questions.Mix
	}
	return s
}
