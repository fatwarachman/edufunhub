// Package tugofwar referees Tarik Tambang: two teams pull one rope by
// answering the same quiz question. The first correct answer of a round
// pulls the rope one step toward the answering team; a wrong answer locks
// that player out of the round. A team wins when the rope crosses WinSteps
// on its side, or by rope position after the host's question count.
//
// One player alone plays against a computer team; otherwise the room needs
// an even number of players split into two equal teams by the host. Every
// member of a team earns the same team points; the player with the most
// pulls of each team earns MVPBonus on top.
package tugofwar

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

const (
	GameKey = "tug-of-war"
	Mission = "room"
	// Options is the most answer options shown per question.
	Options = 4
	// WinSteps is how far the rope must move toward one team to win early.
	WinSteps = 5
	// MaxPlayers is the room size (10 vs 10).
	MaxPlayers = 20
	// MVPBonus is paid to the players with the most pulls of their team.
	MVPBonus = 20
	// DefaultQuestions is the question count of a new room.
	DefaultQuestions = 10
	// MaxQuestions is the largest question count a host can pick.
	MaxQuestions = 30

	Countdown       = 3 * time.Second
	RevealTime      = 3 * time.Second
	AnswerTime      = 20 * time.Second
	YoungAnswerTime = 25 * time.Second
	// MinAnswerDelay rejects answers sent before anyone could read the question.
	MinAnswerDelay = 300 * time.Millisecond
	// BotAccuracy is the computer team's chance of a correct answer (percent).
	BotAccuracy = 60
)

// Teams. TeamWatch is the host watching on a big screen without playing.
const (
	TeamRed   = 0
	TeamBlue  = 1
	TeamWatch = 2
)

// Round stages inside the playing phase.
const (
	StageCountdown = "countdown"
	StageQuestion  = "question"
	StageReveal    = "reveal"
)

// QuestionCounts are the question counts a host can pick.
var QuestionCounts = []int{5, 10, 15, 20, 30}

// MaxPoints caps one player's award: every question pulled by the team at
// the highest value, the win bonus, participation and the MVP bonus.
var MaxPoints = points.Cap(MaxQuestions) + MVPBonus

var (
	ErrOption     = errors.New("invalid_option")
	ErrStale      = errors.New("stale_question")
	ErrAnswered   = errors.New("already_answered")
	ErrEarly      = errors.New("too_early")
	ErrTeam       = errors.New("invalid_team")
	ErrOdd        = errors.New("odd_players")
	ErrUnbalanced = errors.New("teams_unbalanced")
	ErrCount      = errors.New("invalid_question_count")
	ErrWatching   = errors.New("watching")
)

type Message = map[string]any

type player struct {
	correct, wrong, pulls, earned, paid int
	mvp                                 bool
	answers                             []questions.Answer
	reported                            bool
}

// bot is the computer team of a solo match.
type bot struct {
	correct, wrong, pulls int
	answered              bool
	at                    time.Time
}

// reveal describes the last resolved question.
type reveal struct {
	number, team, seat   int
	bot                  bool
	name                 string
	correctIndex         int
	prompt, answer, hint questions.Text
}

type game struct {
	// teams is the host's split by account id; it outlives matches.
	teams map[int64]int
	count int

	stage                       string
	round, number, rope         int
	level, grade                int
	question                    questions.Question
	asked, deadline, stageUntil time.Time
	choices                     map[int64]int
	gen                         *questions.Generator
	solo                        bool
	bot                         *bot
	reveal                      *reveal
	winner                      int
	forfeit, stopped            bool
	started, ended              time.Time
	answer                      time.Duration
	rng                         *rand.Rand
	// teamEarned is indexed by team (TeamWatch stays 0).
	teamEarned  [3]int
	shownSecond int64
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
	h := &Hub{rooms: lobby.New[game, player](seed, lobby.Config{Min: 1, Max: MaxPlayers}), seed: seed, paid: map[int64]int{}}
	h.rooms.OnLeave = func(r *room, seat int, now time.Time) {
		h.settle(r, seat, false, now)
		g := &r.Game
		if r.Phase != lobby.PhasePlaying || g.solo {
			return
		}
		team := g.teamOf(r.Seats[seat].ID())
		if team == TeamWatch {
			return
		}
		if teamActive(r, team) == 0 {
			if teamActive(r, 1-team) > 0 {
				g.winner = 1 - team
				g.forfeit = true
				h.end(r, now)
			}
			return
		}
		if g.stage == StageQuestion && everyoneAnswered(r) {
			h.resolve(r, -1, -1, now)
		}
	}
	return h
}

func (h *Hub) Join(c auth.Claims, locale string)         { h.rooms.Join(c, locale) }
func (h *Hub) Offline(uid int64)                         { h.rooms.Offline(uid) }
func (h *Hub) SetLocale(uid int64, locale string)        { h.rooms.SetLocale(uid, locale) }
func (h *Hub) Peers(uid int64) []int64                   { return h.rooms.Peers(uid) }
func (h *Hub) Counts() (int, int)                        { return h.rooms.Counts() }
func (h *Hub) RoomsSummary() []lobby.RoomSummary         { return h.rooms.RoomsSummary() }
func (h *Hub) RoomPhase(pin string) (string, bool)       { return h.rooms.PhaseOf(pin) }
func (h *Hub) Presence(uid int64) (lobby.Presence, bool) { return h.rooms.PresenceOf(uid) }
func (h *Hub) HandOver(now time.Time) []int64            { return h.rooms.HandOver(now, lobby.HostGrace) }

func newGame(host int64) game {
	return game{teams: map[int64]int{host: TeamRed}, count: DefaultQuestions, winner: -1}
}

func (g *game) teamOf(uid int64) int {
	if t, ok := g.teams[uid]; ok {
		return t
	}
	return TeamRed
}

// assignTeam puts a newcomer on the smaller team (ties: red); a player who
// already has a team keeps it.
func assignTeam(r *room, uid int64) {
	g := &r.Game
	if g.teams == nil {
		g.teams = map[int64]int{}
	}
	if _, ok := g.teams[uid]; ok {
		return
	}
	var size [3]int
	for _, s := range r.Seats {
		if !s.Left && s.ID() != uid {
			size[g.teamOf(s.ID())]++
		}
	}
	g.teams[uid] = TeamRed
	if size[TeamBlue] < size[TeamRed] {
		g.teams[uid] = TeamBlue
	}
}

// Create opens a room hosted by c (red team).
func (h *Hub) Create(c auth.Claims, now time.Time) (string, []int64) {
	h.prepareDeparture(c.Subject, now)
	return h.rooms.Create(c, now, func(r *room) { r.Game = newGame(c.Subject) })
}

// Enter joins the room with the given PIN; the newcomer lands on the smaller team.
func (h *Hub) Enter(c auth.Claims, pin string, now time.Time) ([]int64, error) {
	if p, ok := h.Presence(c.Subject); ok && p.Pin != pin {
		h.prepareDeparture(c.Subject, now)
	}
	return h.rooms.Enter(c, pin, now, func(r *room) {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		assignTeam(r, c.Subject)
	})
}

// EnterClassroom joins or opens the shared room of the player's classroom.
func (h *Hub) EnterClassroom(c auth.Claims, now time.Time) ([]int64, error) {
	stay := false
	h.rooms.View(c.Subject, func(r *room) { stay = r != nil && c.Classroom > 0 && r.ClassroomID == c.Classroom })
	if !stay {
		h.prepareDeparture(c.Subject, now)
	}
	return h.rooms.EnterClassroom(c, now, func(r *room) { r.Game = newGame(c.Subject) }, func(r *room) {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		assignTeam(r, c.Subject)
	})
}

// resetLobby returns a finished room to its lobby, keeping the team split
// and the question count.
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
	teams := map[int64]int{}
	for _, s := range r.Seats {
		teams[s.ID()] = r.Game.teamOf(s.ID())
	}
	r.Game = game{teams: teams, count: r.Game.count, round: r.Game.round, winner: -1}
}

func (h *Hub) SetAnswerTime(uid int64, seconds int, now time.Time) ([]int64, error) {
	return h.rooms.SetAnswerTime(uid, seconds, now)
}

// SetSubject picks the question subject before the game (host only).
func (h *Hub) SetSubject(uid int64, subject string, now time.Time) ([]int64, error) {
	return h.rooms.SetSubject(uid, subject, questions.NormSubject, now)
}

// SetQuestions picks how many questions a match has (host only).
func (h *Hub) SetQuestions(uid int64, count int, now time.Time) ([]int64, error) {
	return h.rooms.Configure(uid, now, func(r *room) error {
		for _, c := range QuestionCounts {
			if c == count {
				r.Game.count = count
				return nil
			}
		}
		return ErrCount
	})
}

// SetTeam moves the player in seat to team (host only, lobby). Only the
// host's own seat may watch (big screen without playing).
func (h *Hub) SetTeam(uid int64, seat, team int, now time.Time) ([]int64, error) {
	return h.rooms.Configure(uid, now, func(r *room) error {
		if team < TeamRed || team > TeamWatch || seat < 0 || seat >= len(r.Seats) || r.Seats[seat].Left {
			return ErrTeam
		}
		if team == TeamWatch && r.Seats[seat].ID() != uid {
			return ErrTeam
		}
		if r.Game.teams == nil {
			r.Game.teams = map[int64]int{}
		}
		r.Game.teams[r.Seats[seat].ID()] = team
		return nil
	})
}

// ShuffleTeams splits the room into two random teams as equal as possible
// (host only, lobby).
func (h *Hub) ShuffleTeams(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Configure(uid, now, func(r *room) error {
		h.seed++
		rng := rand.New(rand.NewPCG(h.seed, h.seed^0x7a6))
		ids := make([]int64, 0, len(r.Seats))
		teams := map[int64]int{}
		for _, s := range r.Seats {
			switch {
			case s.Left:
			case r.Game.teamOf(s.ID()) == TeamWatch:
				teams[s.ID()] = TeamWatch
			default:
				ids = append(ids, s.ID())
			}
		}
		rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
		for i, id := range ids {
			teams[id] = i % 2
		}
		r.Game.teams = teams
		return nil
	})
}

// Start begins (or restarts) the match. One player plays against the
// computer; more players need an even count split into equal teams. A
// watching host does not count.
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		old := r.Game
		teams := map[int64]int{}
		var size [3]int
		var playing []int64
		for _, s := range r.Seats {
			t := old.teamOf(s.ID())
			if t == TeamWatch && s.ID() != r.Host {
				t = TeamRed
			}
			teams[s.ID()] = t
			size[t]++
			if t != TeamWatch {
				playing = append(playing, s.ID())
			}
		}
		solo := len(playing) == 1
		switch {
		case len(playing) == 0:
			return lobby.ErrPlayers
		case solo:
			teams[playing[0]] = TeamRed
		case len(playing)%2 != 0:
			return ErrOdd
		case size[TeamRed] != size[TeamBlue]:
			return ErrUnbalanced
		}
		h.seed++
		grade, level := 99, points.LevelExpert
		for _, s := range r.Seats {
			if teams[s.ID()] != TeamWatch {
				grade = min(grade, s.Claims.Grade)
				level = min(level, points.Level(s.Claims.Level))
			}
		}
		answer := AnswerTime
		if grade <= 2 {
			answer = YoungAnswerTime
		}
		count := old.count
		if count <= 0 {
			count = DefaultQuestions
		}
		gen := questions.NewFor(GameKey, grade, h.seed).For(r.Subject, r.Humans()...).AtLevel(level).InClassroom(r.Classroom())
		r.Game = game{
			teams: teams, count: count, round: old.round, level: level, grade: grade, gen: gen,
			solo: solo, winner: -1, started: now, answer: r.AnswerTime(answer),
			stage: StageCountdown, stageUntil: now.Add(Countdown),
			rng: rand.New(rand.NewPCG(h.seed, h.seed^0x70f)),
		}
		if solo {
			r.Game.bot = &bot{}
		}
		return nil
	})
}

// ask shows the next question to everyone.
func (h *Hub) ask(r *room, now time.Time) {
	g := &r.Game
	g.round++
	g.number++
	g.question = g.gen.Present(g.gen.Choice(), Options)
	g.asked = now
	g.deadline = now.Add(g.answer)
	g.choices = map[int64]int{}
	g.stage = StageQuestion
	if g.bot != nil {
		g.bot.answered = false
		span := int64(g.answer) / 2
		g.bot.at = now.Add(time.Duration(int64(g.answer)*35/100 + g.rng.Int64N(max(span, 1))))
	}
	r.Touch(now)
}

// Answer judges the displayed option (0-based) picked for the current round.
func (h *Hub) Answer(uid int64, round, option int, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		g := &r.Game
		if r.Phase != lobby.PhasePlaying {
			return lobby.ErrPhase
		}
		if g.stage != StageQuestion || round != g.round {
			return ErrStale
		}
		i := r.SeatIndex(uid)
		if i < 0 {
			return lobby.ErrNoRoom
		}
		if g.teamOf(uid) == TeamWatch {
			return ErrWatching
		}
		if _, done := g.choices[uid]; done {
			return ErrAnswered
		}
		if option < 0 || option >= len(g.question.Options) {
			return ErrOption
		}
		if now.Before(g.asked.Add(MinAnswerDelay)) {
			return ErrEarly
		}
		if !now.Before(g.deadline) {
			h.resolve(r, -1, -1, now)
			return nil
		}
		g.choices[uid] = option
		q := g.question
		correct := option == q.Answer
		p := &r.Seats[i].Data
		if q.FromBank {
			p.answers = append(p.answers, questions.Answer{Key: q.Key, Correct: correct, Choice: q.Original(option)})
		}
		if correct {
			p.correct++
			p.pulls++
			p.earned += q.Worth()
			team := g.teamOf(uid)
			g.teamEarned[team] += q.Worth()
			h.resolve(r, team, i, now)
			return nil
		}
		p.wrong++
		r.Touch(now)
		if everyoneAnswered(r) {
			h.resolve(r, -1, -1, now)
		}
		return nil
	})
}

// everyoneAnswered reports whether no one can still answer this round.
func everyoneAnswered(r *room) bool {
	g := &r.Game
	if g.bot != nil && !g.bot.answered {
		return false
	}
	for _, s := range r.Seats {
		if s.Left || g.teamOf(s.ID()) == TeamWatch {
			continue
		}
		if _, ok := g.choices[s.ID()]; !ok {
			return false
		}
	}
	return true
}

func teamActive(r *room, team int) int {
	n := 0
	for _, s := range r.Seats {
		if !s.Left && r.Game.teamOf(s.ID()) == team {
			n++
		}
	}
	return n
}

// resolve closes the round: team >= 0 pulls the rope one step (seat -2 is
// the computer), team -1 means nobody answered correctly.
func (h *Hub) resolve(r *room, team, seat int, now time.Time) {
	g := &r.Game
	q := g.question
	rv := &reveal{number: g.number, team: team, seat: seat, correctIndex: q.Answer, prompt: q.Prompt, answer: q.Options[q.Answer], hint: q.Hint}
	switch {
	case seat == -2:
		rv.bot = true
	case seat >= 0:
		rv.name = r.Seats[seat].Claims.Name
	}
	switch team {
	case TeamRed:
		g.rope--
	case TeamBlue:
		g.rope++
	}
	g.reveal = rv
	g.stage = StageReveal
	g.stageUntil = now.Add(RevealTime)
	r.Touch(now)
	if g.rope <= -WinSteps || g.rope >= WinSteps || g.number >= g.count {
		h.end(r, now)
	}
}

// botAnswer lets the computer team answer the current question.
func (h *Hub) botAnswer(r *room, now time.Time) {
	g := &r.Game
	g.bot.answered = true
	if g.rng.IntN(100) < BotAccuracy {
		g.bot.correct++
		g.bot.pulls++
		h.resolve(r, TeamBlue, -2, now)
		return
	}
	g.bot.wrong++
	r.Touch(now)
	if everyoneAnswered(r) {
		h.resolve(r, -1, -1, now)
	}
}

// Tick advances countdowns, deadlines, the computer and reveal pauses.
func (h *Hub) Tick(now time.Time) []int64 {
	return h.rooms.Tick(func(r *room) {
		g := &r.Game
		switch g.stage {
		case StageCountdown:
			if !now.Before(g.stageUntil) {
				h.ask(r, now)
				return
			}
		case StageQuestion:
			if g.bot != nil && !g.bot.answered && !now.Before(g.bot.at) && now.Before(g.deadline) {
				h.botAnswer(r, now)
				if g.stage != StageQuestion {
					return
				}
			}
			if !now.Before(g.deadline) {
				h.resolve(r, -1, -1, now)
				return
			}
		case StageReveal:
			if !now.Before(g.stageUntil) {
				h.ask(r, now)
				return
			}
		}
		if s := g.second(now); s != g.shownSecond {
			g.shownSecond = s
			r.Seq++
		}
	})
}

// until is the end of the current stage.
func (g *game) until() time.Time {
	if g.stage == StageQuestion {
		return g.deadline
	}
	return g.stageUntil
}

// second is the whole second shown by clients' timers; a new one triggers a push.
func (g *game) second(now time.Time) int64 {
	left := g.until().Sub(now).Milliseconds()
	if left <= 0 {
		return 0
	}
	return (left + 999) / 1000
}

func (h *Hub) Stop(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Stop(uid, now, func(r *room) { r.Game.stopped = true; h.end(r, now) })
}

// end finishes the match. Without a forfeit the rope side picks the winner.
func (h *Hub) end(r *room, now time.Time) {
	if r.Phase != lobby.PhasePlaying {
		return
	}
	g := &r.Game
	if !g.forfeit {
		g.winner = -1
		if g.rope < 0 {
			g.winner = TeamRed
		}
		if g.rope > 0 {
			g.winner = TeamBlue
		}
	}
	r.Phase = lobby.PhaseDone
	g.ended = now
	r.Touch(now)
	var best [3]int
	for _, s := range r.Seats {
		if !s.Left {
			t := g.teamOf(s.ID())
			best[t] = max(best[t], s.Data.pulls)
		}
	}
	for _, s := range r.Seats {
		if !s.Left && g.teamOf(s.ID()) != TeamWatch && s.Data.pulls > 0 && s.Data.pulls == best[g.teamOf(s.ID())] {
			s.Data.mvp = true
		}
	}
	for i, s := range r.Seats {
		if !s.Left {
			h.settle(r, i, true, now)
		}
	}
}

// settle pays one seat: finished games pay the team points (same for every
// member) with the win bonus and the MVP bonus; leaving early pays what the
// player achieved.
func (h *Hub) settle(r *room, i int, finished bool, now time.Time) {
	s := r.Seats[i]
	p := &s.Data
	g := &r.Game
	if p.reported || g.started.IsZero() {
		return
	}
	if g.teamOf(s.ID()) == TeamWatch {
		p.reported = true
		return
	}
	award := points.Abandoned(p.earned, p.correct+p.wrong, MaxPoints)
	if finished {
		team := g.teamOf(s.ID())
		achieved := points.Outcome(g.teamEarned[team], g.winner == team, g.winner < 0)
		if p.mvp {
			achieved += MVPBonus
		}
		award = points.Finished(achieved, MaxPoints)
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
		EventID: fmt.Sprintf("tw-%d-room-%d", s.ID(), g.started.UnixNano()), UserID: s.ID(), GameKey: GameKey, Mission: Mission,
		Grade: s.Claims.Grade, Points: award, Correct: p.correct, Wrong: p.wrong, Seconds: int(now.Sub(g.started).Seconds()),
		CompletedAt: record.Stamp(now), Answers: append([]questions.Answer{}, p.answers...), Match: matchOf(r, now),
	})
}

func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	if !g.ended.IsZero() {
		now = g.ended
	}
	players := make([]record.Player, 0, len(r.Seats)+1)
	teams := make([]int, 0, len(r.Seats)+1)
	for _, s := range r.Seats {
		if g.teamOf(s.ID()) == TeamWatch {
			continue
		}
		players = append(players, record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: s.Data.pulls, Correct: s.Data.correct, Wrong: s.Data.wrong})
		teams = append(teams, g.teamOf(s.ID()))
	}
	mode := record.ModeRoom
	if g.bot != nil {
		mode = record.ModeBot
		players = append(players, record.Player{Name: "Bot", Bot: true, Grade: g.grade, Score: g.bot.pulls, Correct: g.bot.correct, Wrong: g.bot.wrong})
		teams = append(teams, TeamBlue)
	}
	record.Rank(players, func(i int) int {
		k := players[i].Score
		if g.winner >= 0 && teams[i] == g.winner {
			k += 1000
		}
		return k
	}, -1)
	return &record.Match{Key: fmt.Sprintf("tw-%s-%d", r.Pin, g.started.UnixNano()), Mode: mode, Pin: r.Pin, Level: g.level, Grade: g.grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now), Finished: r.Phase == lobby.PhaseDone, Players: players}
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

// CloseClassroom closes every room of classroom id; unfinished games pay
// what players achieved.
func (h *Hub) CloseClassroom(id int64, now time.Time) []int64 {
	return h.rooms.CloseClassroom(id, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, 30*time.Minute, 2*time.Minute, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

func botName(locale string) string {
	if locale == "en" {
		return "Computer"
	}
	return "Komputer"
}

// State is the snapshot sent to one client (a detached copy).
func (h *Hub) State(c auth.Claims, now time.Time) Message {
	msg := Message{
		"t": "tugofwar_state", "phase": "lobby", "pin": "", "you": -1, "host": -1, "seq": 0, "players": []Message{},
		"min_players": 1, "max_players": MaxPlayers, "local_seats": false, "answer_seconds": 0,
		"answer_times": append([]int{}, lobby.AnswerTimes...), "subject": "mix", "subject_fallback": false,
		"question_count": DefaultQuestions, "question_counts": append([]int{}, QuestionCounts...), "win_steps": WinSteps,
		"stage": nil, "round": 0, "number": 0, "rope": 0, "remaining_ms": int64(0), "question": nil,
		"your_choice": nil, "reveal": nil, "teams": []Message{}, "winner": nil, "forfeit": false,
		"stopped": false, "solo": false, "result": nil,
	}
	h.rooms.ViewFor(c, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		locale := h.rooms.Locale(c.Subject)
		for k, v := range h.rooms.RoomPayload(r, c.Subject, func(i int, s *lobby.Seat[player]) Message {
			_, answered := g.choices[s.ID()]
			return Message{"team": g.teamOf(s.ID()), "bot": false, "pulls": s.Data.pulls, "correct": s.Data.correct, "wrong": s.Data.wrong, "answered": answered && r.Phase == lobby.PhasePlaying, "mvp": s.Data.mvp}
		}) {
			msg[k] = v
		}
		msg["answer_times"] = append([]int{}, lobby.AnswerTimes...)
		players := msg["players"].([]Message)
		for _, p := range players {
			if raw, ok := p["character"].(json.RawMessage); ok {
				p["character"] = append(json.RawMessage{}, raw...)
			}
		}
		if g.bot != nil && r.Phase != lobby.PhaseLobby {
			players = append(players, Message{"seat": len(r.Seats), "name": botName(locale), "grade": g.grade, "online": true, "left": false, "local": false, "controlled": false, "bot": true, "team": TeamBlue, "pulls": g.bot.pulls, "correct": g.bot.correct, "wrong": g.bot.wrong, "answered": g.bot.answered && g.stage == StageQuestion, "mvp": false})
		}
		msg["players"] = players
		msg["question_count"] = g.count
		msg["round"], msg["number"], msg["rope"], msg["stopped"], msg["forfeit"], msg["solo"], msg["level"] = g.round, g.number, g.rope, g.stopped, g.forfeit, g.solo, g.level
		var size, pulls [3]int
		for _, s := range r.Seats {
			if !s.Left {
				t := g.teamOf(s.ID())
				size[t]++
				pulls[t] += s.Data.pulls
			}
		}
		if g.bot != nil {
			size[TeamBlue]++
			pulls[TeamBlue] += g.bot.pulls
		}
		msg["teams"] = []Message{
			{"team": TeamRed, "size": size[TeamRed], "pulls": pulls[TeamRed], "points": g.teamEarned[TeamRed]},
			{"team": TeamBlue, "size": size[TeamBlue], "pulls": pulls[TeamBlue], "points": g.teamEarned[TeamBlue]},
		}
		if r.Phase == lobby.PhasePlaying {
			msg["stage"] = g.stage
			msg["remaining_ms"] = max(int64(0), g.until().Sub(now).Milliseconds())
		}
		if r.Phase != lobby.PhaseLobby && g.gen != nil && g.number > 0 {
			q := g.question
			opts := make([]string, len(q.Options))
			for i, o := range q.Options {
				opts[i] = o.Get(locale)
			}
			msg["subject_fallback"] = g.gen.Fallback()
			msg["question"] = Message{"id": fmt.Sprintf("%s-%d", r.Pin, g.round), "number": g.number, "text": q.Prompt.Get(locale), "media": q.Media(), "options": opts, "option_media": q.OptionMedia(), "subject": q.Subject, "worth": q.Worth()}
			if choice, ok := g.choices[c.Subject]; ok {
				msg["your_choice"] = choice
			}
		}
		if rv := g.reveal; rv != nil {
			name := rv.name
			if rv.bot {
				name = botName(locale)
			}
			msg["reveal"] = Message{"number": rv.number, "team": rv.team, "seat": rv.seat, "bot": rv.bot, "name": name, "correct_index": rv.correctIndex, "prompt": rv.prompt.Get(locale), "answer": rv.answer.Get(locale), "hint": rv.hint.Get(locale)}
		}
		if r.Phase == lobby.PhaseDone {
			if g.winner >= 0 {
				msg["winner"] = g.winner
			}
			if i := r.SeatIndex(c.Subject); i >= 0 {
				d := r.Seats[i].Data
				msg["result"] = Message{"watching": g.teamOf(c.Subject) == TeamWatch, "points": d.paid, "mvp": d.mvp, "team": g.teamOf(c.Subject), "team_points": g.teamEarned[g.teamOf(c.Subject)], "won": g.winner == g.teamOf(c.Subject)}
			}
			msg["match"] = matchOf(r, now)
		}
	})
	return msg
}
