// Package session holds one player's authoritative mission run.
package session

import (
	"fmt"
	"math"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/challenge"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/world"
)

const (
	WalkSpeed     = 4.2
	RunSpeed      = 6.6
	RaiseDuration = 3 * time.Second
	RetryCooldown = 3 * time.Second
	GameKey       = "flag-quest"
)

// Message is a generic server event.
type Message map[string]any

// Result is sent to Laravel after a mission is completed.
type Result struct {
	EventID     string `json:"event_id"`
	UserID      int64  `json:"user_id"`
	GameKey     string `json:"game_key"`
	Mission     string `json:"mission"`
	Grade       int    `json:"grade"`
	Points      int    `json:"points"`
	Correct     int    `json:"correct"`
	Wrong       int    `json:"wrong"`
	Seconds     int    `json:"duration_seconds"`
	CompletedAt string `json:"completed_at"`
}

// Session is safe for concurrent use.
type Session struct {
	mu        sync.Mutex
	Claims    auth.Claims
	Locale    string
	world     *world.World
	mission   world.Mission
	x, y      float64
	lastMove  time.Time
	active    *challenge.Challenge
	settled   bool
	cooldown  map[int]time.Time
	correct   int
	wrong     int
	failures  int
	started   time.Time
	raising   time.Time
	completed bool
	result    *Result
	seed      uint64
	LastSeen  time.Time
}

// New creates a session on the first mission.
func New(claims auth.Claims, locale string, now time.Time) *Session {
	s := &Session{Claims: claims, Locale: normLocale(locale), seed: uint64(now.UnixNano()) ^ uint64(claims.Subject), LastSeen: now}
	_ = s.startMission(world.Missions[0].ID, now)
	return s
}

func normLocale(l string) string {
	if l == "en" {
		return "en"
	}
	return "id"
}

func (s *Session) startMission(id string, now time.Time) error {
	w, err := world.New(id)
	if err != nil {
		return err
	}
	m, _ := world.FindMission(id)
	s.world, s.mission = w, m
	s.x, s.y = w.Spawn.X, w.Spawn.Y
	s.lastMove = now
	s.active = nil
	s.cooldown = map[int]time.Time{}
	s.correct, s.wrong, s.failures = 0, 0, 0
	s.started = now
	s.raising = time.Time{}
	s.completed = false
	s.result = nil
	return nil
}

// SetLocale changes the language of question texts.
func (s *Session) SetLocale(l string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Locale = normLocale(l)
}

// Welcome returns the full snapshot.
func (s *Session) Welcome() Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	missions := make([]Message, 0, len(world.Missions))
	for _, m := range world.Missions {
		missions = append(missions, Message{"id": m.ID, "difficulty": m.Difficulty, "kinds": m.Kinds})
	}
	msg := Message{
		"t": "welcome",
		"player": Message{
			"name": s.Claims.Name, "grade": s.Claims.Grade, "color": s.Claims.Color, "accessory": s.Claims.Accessory,
		},
		"missions": missions,
		"mission":  s.mission.ID,
		"world":    s.world,
		"pos":      Message{"x": s.x, "y": s.y},
		"speeds":   Message{"walk": WalkSpeed, "run": RunSpeed},
		"started":  s.started.UnixMilli(),
		"stats":    s.statsLocked(),
	}
	if s.active != nil {
		msg["challenge"] = s.challengeLocked(nil)
	}
	if s.completed && s.result != nil {
		msg["complete"] = s.completeLocked()
	}
	return msg
}

func (s *Session) statsLocked() Message {
	return Message{"correct": s.correct, "wrong": s.wrong, "failures": s.failures}
}

// Move validates a client-predicted position. Returns a correction when the server disagrees.
func (s *Session) Move(x, y float64, now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastSeen = now
	if math.IsNaN(x) || math.IsNaN(y) || math.IsInf(x, 0) || math.IsInf(y, 0) {
		return Message{"t": "correct", "x": s.x, "y": s.y}
	}
	if s.active != nil || s.completed {
		if world.Distance(x, y, s.x, s.y) > 0.01 {
			return Message{"t": "correct", "x": s.x, "y": s.y}
		}
		return nil
	}
	elapsed := now.Sub(s.lastMove).Seconds()
	s.lastMove = now
	elapsed = math.Min(math.Max(elapsed, 0.05), 0.5)
	maxDist := RunSpeed*elapsed*1.35 + 0.25
	want := world.Distance(x, y, s.x, s.y)
	nx, ny := s.world.Move(s.x, s.y, x-s.x, y-s.y, math.Min(want, maxDist))
	s.x, s.y = nx, ny
	if !s.raising.IsZero() && world.Distance(s.x, s.y, s.world.Flag.X, s.world.Flag.Y) > world.InteractDist+0.4 {
		s.raising = time.Time{}
	}
	if world.Distance(nx, ny, x, y) > 0.08 {
		return Message{"t": "correct", "x": nx, "y": ny}
	}
	return nil
}

// Interact starts the challenge at the nearest station.
func (s *Session) Interact(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != nil || s.completed {
		return nil
	}
	for i := range s.world.Checkpoints {
		cp := &s.world.Checkpoints[i]
		if cp.Cleared || world.Distance(s.x, s.y, cp.X, cp.Y) > world.InteractDist {
			continue
		}
		if until, ok := s.cooldown[cp.ID]; ok && now.Before(until) {
			return Message{"t": "error", "code": "cooldown", "retry_ms": until.Sub(now).Milliseconds()}
		}
		s.seed++
		gen := questions.New(s.Claims.Grade, s.seed)
		s.active = challenge.Start(cp.Kind, cp.ID, s.mission.Difficulty, gen, now)
		s.settled = false
		return s.challengeLocked(nil)
	}
	if world.Distance(s.x, s.y, s.world.Flag.X, s.world.Flag.Y) <= world.InteractDist {
		return s.raiseLocked(now)
	}
	return Message{"t": "error", "code": "nothing_nearby"}
}

// Raise starts raising the flag.
func (s *Session) Raise(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.raiseLocked(now)
}

func (s *Session) raiseLocked(now time.Time) Message {
	if s.completed || s.active != nil {
		return nil
	}
	if world.Distance(s.x, s.y, s.world.Flag.X, s.world.Flag.Y) > world.InteractDist {
		return Message{"t": "error", "code": "too_far"}
	}
	for _, cp := range s.world.Checkpoints {
		if !cp.Cleared {
			return Message{"t": "error", "code": "locked"}
		}
	}
	if s.raising.IsZero() {
		s.raising = now
	}
	return Message{"t": "raise", "started": true, "duration_ms": RaiseDuration.Milliseconds()}
}

// Answer forwards an answer to the running challenge.
func (s *Session) Answer(value string, now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil {
		return Message{"t": "error", "code": "no_challenge"}
	}
	fb, err := s.active.Answer(value, s.Locale, now)
	if err != nil {
		return Message{"t": "error", "code": errCode(err)}
	}
	s.count(fb, now)
	return s.challengeLocked(&fb)
}

// Roll rolls the dice in snakes & ladders.
func (s *Session) Roll(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil {
		return Message{"t": "error", "code": "no_challenge"}
	}
	if _, err := s.active.Roll(now); err != nil {
		return Message{"t": "error", "code": errCode(err)}
	}
	s.settle(now)
	return s.challengeLocked(nil)
}

// Leave closes a finished challenge or abandons a running one (counted as failure).
func (s *Session) Leave(now time.Time) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil {
		return nil
	}
	c := s.active
	s.active = nil
	if c.Phase == challenge.PhaseDone && c.Passed {
		return Message{"t": "gates", "checkpoints": s.world.Checkpoints}
	}
	if c.Phase != challenge.PhaseDone {
		s.failures++
		s.cooldown[c.Checkpoint] = now.Add(RetryCooldown)
	}
	return Message{"t": "gates", "checkpoints": s.world.Checkpoints, "stats": s.statsLocked()}
}

// StartMission switches mission (restarting progress).
func (s *Session) StartMission(id string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.startMission(id, now)
}

// Tick advances timers. It may return an event and a result to report.
func (s *Session) Tick(now time.Time) (Message, *Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != nil {
		if fb, fired := s.active.Tick(s.Locale, now); fired {
			s.count(fb, now)
			return s.challengeLocked(&fb), nil
		}
		return nil, nil
	}
	if !s.raising.IsZero() && !s.completed && now.Sub(s.raising) >= RaiseDuration {
		s.completed = true
		elapsed := int(now.Sub(s.started).Seconds())
		points := s.mission.Difficulty*40 + s.correct*5
		if s.failures == 0 {
			points += 30
		}
		points = min(points, 250)
		s.result = &Result{
			EventID: fmt.Sprintf("fq-%d-%s-%d", s.Claims.Subject, s.mission.ID, s.started.UnixNano()),
			UserID:  s.Claims.Subject, GameKey: GameKey, Mission: s.mission.ID, Grade: s.Claims.Grade,
			Points: points, Correct: s.correct, Wrong: s.wrong, Seconds: elapsed,
			CompletedAt: now.UTC().Format(time.RFC3339),
		}
		return s.completeLocked(), s.result
	}
	return nil, nil
}

func (s *Session) completeLocked() Message {
	return Message{"t": "complete", "mission": s.mission.ID, "points": s.result.Points, "correct": s.result.Correct, "wrong": s.result.Wrong, "seconds": s.result.Seconds, "flawless": s.failures == 0}
}

func (s *Session) count(fb challenge.Feedback, now time.Time) {
	if fb.Correct {
		s.correct++
	} else if fb.Answer != "" {
		s.wrong++
	}
	s.settle(now)
}

// settle applies the outcome of a finished challenge exactly once.
func (s *Session) settle(now time.Time) {
	c := s.active
	if c == nil || c.Phase != challenge.PhaseDone || s.settled {
		return
	}
	s.settled = true
	if c.Passed {
		s.world.Checkpoints[c.Checkpoint].Cleared = true
		return
	}
	s.failures++
	s.cooldown[c.Checkpoint] = now.Add(RetryCooldown)
}

func (s *Session) challengeLocked(fb *challenge.Feedback) Message {
	c := s.active
	q := c.Question()
	now := time.Now()
	msg := Message{
		"t": "challenge", "checkpoint": c.Checkpoint, "kind": c.Kind, "phase": c.Phase,
		"step": c.Step, "total": c.Rules.Total, "needed": c.Rules.Needed,
		"correct": c.Correct, "wrong": c.Wrong, "passed": c.Passed,
	}
	if c.Kind == challenge.SnakesLadders {
		jumps := make([][2]int, 0, len(challenge.Jumps))
		for from, to := range challenge.Jumps {
			jumps = append(jumps, [2]int{from, to})
		}
		msg["board"] = Message{
			"size": challenge.BoardSize, "cols": challenge.BoardCols, "jumps": jumps, "position": c.Position,
			"turns": c.Turns, "max_turns": c.Rules.MaxTurns, "last_roll": c.LastRoll, "last_jump": c.LastJump,
			"pending_roll": c.PendingRoll, "move_from": c.MoveFrom, "move_landing": c.MoveLanding,
		}
	}
	if !c.Deadline.IsZero() {
		msg["deadline_ms"] = max(c.Deadline.Sub(now).Milliseconds(), 0)
	}
	if !c.Ends.IsZero() {
		msg["ends_ms"] = max(c.Ends.Sub(now).Milliseconds(), 0)
	}
	if c.Phase == challenge.PhaseQuestion {
		options := make([]string, len(q.Options))
		for i, o := range q.Options {
			options[i] = o.Get(s.Locale)
		}
		msg["question"] = Message{"prompt": q.Prompt.Get(s.Locale), "subject": q.Subject, "options": options}
	}
	if fb != nil {
		msg["feedback"] = fb
	}
	if c.Phase == challenge.PhaseDone {
		msg["checkpoints"] = s.world.Checkpoints
	}
	return msg
}

func errCode(err error) string {
	switch err {
	case challenge.ErrBadAnswer:
		return "bad_answer"
	case challenge.ErrWrongPhase:
		return "wrong_phase"
	default:
		return "error"
	}
}

// Position returns the authoritative position (tests).
func (s *Session) Position() (float64, float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.x, s.y
}

// World exposes the map (tests).
func (s *Session) World() *world.World { return s.world }

// Teleport is a test helper.
func (s *Session) Teleport(x, y float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.x, s.y = x, y
}

// ActiveChallenge exposes the running challenge (tests).
func (s *Session) ActiveChallenge() *challenge.Challenge { return s.active }
