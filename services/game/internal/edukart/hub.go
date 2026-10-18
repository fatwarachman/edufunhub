// Package edukart referees EduKart (Balap Kuis 3D): a Crash Team Racing
// style kart race where every racer answers its own question at each gate
// by driving through an answer box. Physics (physics.go, track.go) is shared
// 1:1 with the client predictor; this file holds the room layer.
package edukart

import (
	"encoding/json"
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
	GameKey    = "edu-kart"
	Mission    = "room"
	MinPlayers = 1
	MaxPlayers = 8
	MaxRacers  = 8
	MaxLaps    = 5
	// DefaultLaps is the lap count of a new room.
	DefaultLaps = 3
	// DefaultTrack is the circuit of a new room.
	DefaultTrack = "forest"
	// DefaultVehicle is every seat's kart until the player picks one.
	DefaultVehicle = "classic"
	// MaxInputsPerSecond bounds accepted input messages per player.
	MaxInputsPerSecond = 60
	// StateType is the room state message type.
	StateType = "edukart_state"
)

// LapChoices are the lap counts a host may pick.
var LapChoices = []int{2, 3, 5}

// MaxPoints is the most one race pays (MaxLaps x 3 gates).
var MaxPoints = points.Cap(MaxLaps * GatesPerLap)

var (
	ErrTrack   = errors.New("invalid_track")
	ErrVehicle = errors.New("invalid_vehicle")
	ErrLaps    = errors.New("invalid_laps")
)

// Message is a JSON object sent to clients.
type Message = map[string]any

// rawTracks keeps the embedded track files byte for byte (edukart_track).
var rawTracks = func() map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, id := range TrackIDs {
		raw, err := trackFiles.ReadFile("tracks/" + id + ".json")
		if err != nil {
			panic(err)
		}
		out[id] = json.RawMessage(raw)
	}
	return out
}()

// TrackRaw returns the embedded JSON of a track (nil when unknown).
func TrackRaw(id string) json.RawMessage { return rawTracks[id] }

type player struct {
	paid     int
	reported bool
}

type game struct {
	track    string
	laps     int
	bots     bool
	vehicles map[int64]string
	race     *race
	// events are the race events of the latest tick (broadcast once).
	events         []event
	started, ended time.Time
	level, grade   int
	nextID         int
}

type room = lobby.Room[game, player]

// Result is one player's race result for Laravel.
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

// Hub runs every EduKart room. Safe for concurrent use.
type Hub struct {
	rooms   *lobby.Hub[game, player]
	seed    uint64
	mu      sync.Mutex
	pending []Result
	paid    map[int64]int
}

// NewHub creates a hub.
func NewHub(seed uint64) *Hub {
	h := &Hub{rooms: lobby.New[game, player](seed, lobby.Config{Min: MinPlayers, Max: MaxPlayers}), seed: seed, paid: map[int64]int{}}
	h.rooms.OnLeave = func(r *room, seat int, now time.Time) {
		if rc := r.Game.race; rc != nil {
			if x := racerOfSeat(rc, seat); x != nil {
				x.left = true
				x.q = nil
				x.tnt = 0
			}
		}
		h.settle(r, seat, false, now)
		h.checkEnd(r, now)
	}
	return h
}

func (h *Hub) Offline(uid int64)                         { h.rooms.Offline(uid) }
func (h *Hub) SetLocale(uid int64, locale string)        { h.rooms.SetLocale(uid, locale) }
func (h *Hub) Peers(uid int64) []int64                   { return h.rooms.Peers(uid) }
func (h *Hub) Counts() (int, int)                        { return h.rooms.Counts() }
func (h *Hub) RoomsSummary() []lobby.RoomSummary         { return h.rooms.RoomsSummary() }
func (h *Hub) RoomPhase(pin string) (string, bool)       { return h.rooms.PhaseOf(pin) }
func (h *Hub) Presence(uid int64) (lobby.Presence, bool) { return h.rooms.PresenceOf(uid) }
func (h *Hub) HandOver(now time.Time) []int64            { return h.rooms.HandOver(now, lobby.HostGrace) }

// Join marks a player connected. A new connection restarts the input
// sequence, so a reloaded client counting from 1 is not ignored.
func (h *Hub) Join(c auth.Claims, locale string) {
	h.rooms.Join(c, locale)
	h.rooms.View(c.Subject, func(r *room) {
		if r == nil {
			return
		}
		if x := racerOfUser(r, c.Subject); x != nil {
			x.seq = 0
		}
	})
}

func newGame(r *room) {
	r.Game = game{track: DefaultTrack, laps: DefaultLaps, bots: true, vehicles: map[int64]string{}}
}

// Create opens a room hosted by c.
func (h *Hub) Create(c auth.Claims, now time.Time) (string, []int64) {
	h.prepareDeparture(c.Subject, now)
	return h.rooms.Create(c, now, newGame)
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

// EnterClassroom joins or opens the shared room of the player's classroom.
func (h *Hub) EnterClassroom(c auth.Claims, now time.Time) ([]int64, error) {
	stay := false
	h.rooms.View(c.Subject, func(r *room) { stay = r != nil && c.Classroom > 0 && r.ClassroomID == c.Classroom })
	if !stay {
		h.prepareDeparture(c.Subject, now)
	}
	return h.rooms.EnterClassroom(c, now, newGame, func(r *room) {
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
	g := r.Game
	r.Game = game{track: g.track, laps: g.laps, bots: g.bots, vehicles: g.vehicles, nextID: g.nextID}
	if r.Game.vehicles == nil {
		r.Game.vehicles = map[int64]string{}
	}
}

// SetSubject picks the question subject before the race (host only).
func (h *Hub) SetSubject(uid int64, subject string, now time.Time) ([]int64, error) {
	return h.rooms.SetSubject(uid, subject, questions.NormSubject, now)
}

// Settings changes track, laps and bots (host, lobby). trackChanged tells the
// server to resend edukart_track to the room.
type Settings struct {
	Track *string `json:"track"`
	Laps  *int    `json:"laps"`
	Bots  *bool   `json:"bots"`
}

// Configure applies Settings.
func (h *Hub) Configure(uid int64, in Settings, now time.Time) (ids []int64, trackChanged bool, err error) {
	ids, err = h.rooms.Configure(uid, now, func(r *room) error {
		if r.Phase == lobby.PhaseDone {
			resetLobby(r)
		}
		g := &r.Game
		if in.Track != nil && TrackByID(*in.Track) == nil {
			return ErrTrack
		}
		if in.Laps != nil && !validLaps(*in.Laps) {
			return ErrLaps
		}
		if in.Track != nil && *in.Track != g.track {
			g.track = *in.Track
			trackChanged = true
		}
		if in.Laps != nil {
			g.laps = *in.Laps
		}
		if in.Bots != nil {
			g.bots = *in.Bots
		}
		return nil
	})
	if err != nil {
		trackChanged = false
	}
	return ids, trackChanged, err
}

func validLaps(n int) bool {
	for _, l := range LapChoices {
		if l == n {
			return true
		}
	}
	return false
}

func validVehicle(id string) bool {
	for _, v := range VehicleIDs {
		if v == id {
			return true
		}
	}
	return false
}

// SetVehicle picks the player's kart (any seat, outside a race).
func (h *Hub) SetVehicle(uid int64, vehicle string, now time.Time) ([]int64, error) {
	return h.rooms.Act(uid, now, func(r *room) error {
		if r.Phase == lobby.PhasePlaying {
			return lobby.ErrPhase
		}
		if !validVehicle(vehicle) {
			return ErrVehicle
		}
		if r.SeatIndex(uid) < 0 {
			return lobby.ErrNoRoom
		}
		if r.Game.vehicles == nil {
			r.Game.vehicles = map[int64]string{}
		}
		r.Game.vehicles[uid] = vehicle
		r.Touch(now)
		return nil
	})
}

func (g *game) vehicleOf(uid int64) string {
	if v, ok := g.vehicles[uid]; ok && validVehicle(v) {
		return v
	}
	return DefaultVehicle
}

// humanColors paint human karts by seat when the avatar has no colour.
var humanColors = []string{"#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04"}

// Start builds the grid and begins the countdown (host only).
func (h *Hub) Start(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Start(uid, now, func(r *room) error {
		h.seed++
		g := &r.Game
		if TrackByID(g.track) == nil {
			g.track = DefaultTrack
		}
		if !validLaps(g.laps) {
			g.laps = DefaultLaps
		}
		grade, level := r.Seats[0].Claims.Grade, points.Level(r.Seats[0].Claims.Level)
		for _, s := range r.Seats {
			grade = min(grade, s.Claims.Grade)
			level = min(level, points.Level(s.Claims.Level))
		}
		rng := rand.New(rand.NewPCG(h.seed, h.seed^0xed0ca7))
		rc := &race{track: TrackByID(g.track), laps: g.laps, ms: -CountdownMs, status: StatusCountdown, firstHuman: -1, rng: rng, nextID: &g.nextID, level: level}
		for i, s := range r.Seats {
			color := s.Claims.Color
			if color == "" {
				color = humanColors[i%len(humanColors)]
			}
			gen := questions.NewFor(GameKey, s.Claims.Grade, h.seed+uint64(i)*7919).For(r.Subject, s.ID()).AtLevel(points.Level(s.Claims.Level)).InClassroom(r.Classroom())
			rc.racers = append(rc.racers, &racer{seat: i, uid: s.ID(), name: s.Claims.Name, color: color, character: append([]byte(nil), s.Claims.Character...), veh: VehicleByID(g.vehicleOf(s.ID())), gen: gen})
		}
		if g.bots {
			for n := 1; len(rc.racers) < MaxRacers; n++ {
				rc.racers = append(rc.racers, &racer{seat: -1, botNo: n, name: fmt.Sprintf("Bot %d", n), color: botColors[(n-1)%len(botColors)], veh: VehicleByID(VehicleIDs[n%len(VehicleIDs)]), skill: 0.55 + 0.2*rng.Float64(), offset: (rng.Float64()*2 - 1) * 2})
			}
		}
		for i, x := range rc.racers {
			x.idx = i
			x.gasSince = 1
			x.taken = map[int]int{}
			x.lap = 1
			row, col := i/2, i%2
			x.kart = Kart{P: -float64(row*7 + 4), D: -3.5}
			if col == 1 {
				x.kart.D = 3.5
			}
		}
		rc.rank()
		*g = game{track: g.track, laps: g.laps, bots: g.bots, vehicles: g.vehicles, nextID: g.nextID, race: rc, started: now, level: level, grade: grade}
		rc.nextID = &g.nextID
		return nil
	})
}

func racerOfSeat(rc *race, seat int) *racer {
	for _, x := range rc.racers {
		if x.seat == seat {
			return x
		}
	}
	return nil
}

func racerOfUser(r *room, uid int64) *racer {
	if r.Game.race == nil {
		return nil
	}
	i := r.SeatIndex(uid)
	if i < 0 {
		return nil
	}
	return racerOfSeat(r.Game.race, i)
}

// Input stores the latest controls of uid. Stale (seq <= last) and
// excess (> MaxInputsPerSecond) messages are dropped silently.
func (h *Hub) Input(uid int64, in Input, now time.Time) error {
	_, err := h.rooms.Act(uid, now, func(r *room) error {
		x := racerOfUser(r, uid)
		if r.Phase != lobby.PhasePlaying || x == nil || x.left {
			return nil
		}
		if in.Seq <= x.seq {
			return nil
		}
		ms := now.UnixMilli()
		if ms-x.rateFrom >= 1000 {
			x.rateFrom, x.rateN = ms, 0
		}
		if x.rateN >= MaxInputsPerSecond {
			return nil
		}
		x.rateN++
		in = in.Clean()
		prev := x.in
		rc := r.Game.race
		// Counters only grow; while racing by at most a few presses per
		// message (the countdown lets a reconnected client catch up).
		in.Hop, in.Turbo, in.Fire = max(in.Hop, prev.Hop), max(in.Turbo, prev.Turbo), max(in.Fire, prev.Fire)
		if rc.status != StatusCountdown {
			in.Hop, in.Turbo, in.Fire = min(in.Hop, prev.Hop+3), min(in.Turbo, prev.Turbo+3), min(in.Fire, prev.Fire+3)
		}
		if rc.status == StatusCountdown {
			if in.Throttle > 0 && prev.Throttle <= 0 {
				x.gasSince = rc.ms
			} else if in.Throttle <= 0 {
				x.gasSince = 1
			}
		}
		x.seq = in.Seq
		x.in = in
		return nil
	})
	return err
}

// Tick advances every race by one 50 ms tick. state lists players whose
// room state changed (phase change, end); frames lists the humans that get
// a race frame for this tick.
func (h *Hub) Tick(now time.Time) (state, frames []int64) {
	state = h.rooms.Tick(func(r *room) {
		g := &r.Game
		rc := g.race
		if rc == nil {
			return
		}
		before := rc.status
		rc.events = rc.events[:0]
		rc.tick()
		g.events = append([]event(nil), rc.events...)
		if rc.status != before {
			r.Touch(now)
		}
		r.Touched = now
		frames = append(frames, r.Humans()...)
		h.checkEnd(r, now)
	})
	return state, frames
}

// checkEnd finishes the race when its end condition holds.
func (h *Hub) checkEnd(r *room, now time.Time) {
	rc := r.Game.race
	if r.Phase != lobby.PhasePlaying || rc == nil || rc.status == StatusCountdown {
		return
	}
	humans, done := 0, 0
	for _, x := range rc.racers {
		if x.seat >= 0 && !x.left {
			humans++
			if x.finished {
				done++
			}
		}
	}
	switch {
	case humans > 0 && done == humans:
	case rc.firstHuman >= 0 && rc.ms-rc.firstHuman >= FinishGraceMs:
	case rc.ms >= RaceLimitMs:
	default:
		return
	}
	h.end(r, now)
}

// Stop ends the race for everyone (host only).
func (h *Hub) Stop(uid int64, now time.Time) ([]int64, error) {
	return h.rooms.Stop(uid, now, func(r *room) {
		if r.Game.race != nil {
			r.Game.race.stopped = true
		}
		h.end(r, now)
	})
}

func (h *Hub) end(r *room, now time.Time) {
	rc := r.Game.race
	if r.Phase != lobby.PhasePlaying || rc == nil {
		return
	}
	rc.status = StatusDone
	rc.projs, rc.hazards = nil, nil
	rc.rank()
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
	rc := r.Game.race
	if p.reported || r.Game.started.IsZero() || rc == nil {
		return
	}
	x := racerOfSeat(rc, i)
	if x == nil {
		return
	}
	award := points.Abandoned(x.earned, x.correct+x.wrong, MaxPoints)
	if finished {
		won := x.rank == 1 && len(rc.racers) > 1
		award = points.Finished(points.Outcome(x.earned, won, false), MaxPoints)
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
		EventID: fmt.Sprintf("ek-%d-room-%d", s.ID(), r.Game.started.UnixNano()), UserID: s.ID(),
		GameKey: GameKey, Mission: Mission, Grade: s.Claims.Grade, Points: award,
		Correct: x.correct, Wrong: x.wrong, Seconds: int(now.Sub(r.Game.started).Seconds()),
		CompletedAt: record.Stamp(now), Answers: append([]questions.Answer{}, x.answers...), Match: matchOf(r, now),
	})
}

func matchOf(r *room, now time.Time) *record.Match {
	g := &r.Game
	rc := g.race
	if !g.ended.IsZero() {
		now = g.ended
	}
	players := make([]record.Player, 0, len(rc.racers))
	bots := false
	for _, x := range rc.racers {
		if x.seat < 0 {
			bots = true
			players = append(players, record.Player{Name: x.name, Bot: true, Grade: g.grade, Score: x.correct, Correct: x.correct, Wrong: x.wrong})
			continue
		}
		s := r.Seats[x.seat]
		players = append(players, record.Player{UserID: s.ID(), Name: s.Claims.Name, Grade: s.Claims.Grade, Left: s.Left, Score: x.earned, Correct: x.correct, Wrong: x.wrong})
	}
	pos := map[int]int{}
	for p, i := range rc.standings() {
		pos[i] = len(players) - p
	}
	record.Rank(players, func(i int) int { return pos[i] }, -1)
	mode := record.Mode(players)
	if bots {
		mode = record.ModeBot
	}
	return &record.Match{Key: fmt.Sprintf("ek-%s-%d", r.Pin, g.started.UnixNano()), Mode: mode, Pin: r.Pin, Level: g.level, Grade: g.grade, StartedAt: record.Stamp(g.started), EndedAt: record.Stamp(now), Finished: r.Phase == lobby.PhaseDone, Players: players}
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

// CloseClassroom closes every room of classroom id, paying unfinished races
// like Prune; returns the account holders who were seated.
func (h *Hub) CloseClassroom(id int64, now time.Time) []int64 {
	return h.rooms.CloseClassroom(id, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

// Prune drops idle rooms, paying what players already earned.
func (h *Hub) Prune(now time.Time) {
	h.rooms.Prune(now, 30*time.Minute, 2*time.Minute, func(r *room) {
		for i := range r.Seats {
			h.settle(r, i, false, now)
		}
	})
}

// TrackMessage is the edukart_track message for uid's room (default track
// when not seated).
func (h *Hub) TrackMessage(c auth.Claims) Message {
	id := DefaultTrack
	h.rooms.ViewFor(c, func(r *room) {
		if r != nil && TrackByID(r.Game.track) != nil {
			id = r.Game.track
		}
	})
	return Message{"t": "edukart_track", "track": TrackRaw(id)}
}

// racerFrame is one racer in a `race` frame (all Kart fields + race fields).
type racerFrame struct {
	Kart
	Racer    int    `json:"racer"`
	Lap      int    `json:"lap"`
	Item     string `json:"item"`
	Juiced   bool   `json:"juiced"`
	ShieldMs int64  `json:"shield_ms"`
	TntMs    int64  `json:"tnt_ms"`
	FinishMs int64  `json:"finish_ms"`
	Rank     int    `json:"rank"`
	LastFire int    `json:"last_fire"`
}

// Frame is the `race` message for one viewer (nil when not in a race).
func (h *Hub) Frame(c auth.Claims, now time.Time) Message {
	var msg Message
	h.rooms.ViewFor(c, func(r *room) {
		if r == nil || r.Game.race == nil || r.Phase == lobby.PhaseLobby {
			return
		}
		rc := r.Game.race
		locale := h.rooms.Locale(c.Subject)
		me := racerOfUser(r, c.Subject)
		you, ack := -1, 0
		if me != nil {
			you, ack = me.idx, me.seq
		}
		racers := make([]racerFrame, 0, len(rc.racers))
		for _, x := range rc.racers {
			lf := x.lastFire
			if x.seat < 0 {
				lf = 0
			}
			kart := x.kart
			kart.Fx |= x.fx
			racers = append(racers, racerFrame{Kart: kart, Racer: x.idx, Lap: x.lap, Item: x.item, Juiced: x.kart.Fruit >= MaxFruit,
				ShieldMs: int64(x.shield * 1000), TntMs: int64(x.tnt * 1000), FinishMs: x.finishMs, Rank: x.rank, LastFire: lf})
		}
		projs := make([]Message, 0, len(rc.projs))
		for _, p := range rc.projs {
			projs = append(projs, Message{"id": p.id, "kind": "rocket", "owner": p.owner, "p": p.p, "d": p.d, "y": 0.6, "juiced": p.juiced})
		}
		hazards := make([]Message, 0, len(rc.hazards))
		for _, hz := range rc.hazards {
			hazards = append(hazards, Message{"id": hz.id, "kind": hz.kind, "owner": hz.owner, "p": hz.p, "d": hz.d})
		}
		var question any
		taken := []int{}
		if me != nil {
			if g := me.q; g != nil && !me.finished && me.kart.P >= g.zone-RevealAhead {
				question = questionView(g, locale)
			}
			key := rc.lapKey(me.kart.P)
			for i, k := range me.taken {
				if k == key {
					taken = append(taken, i)
				}
			}
			sort.Ints(taken)
		}
		events := make([]Message, 0, len(r.Game.events))
		for _, ev := range r.Game.events {
			m := Message{}
			for k, v := range ev.msg {
				m[k] = v
			}
			if me != nil && ev.owner == me.idx && ev.private != nil {
				for k, v := range ev.private(locale) {
					m[k] = v
				}
			}
			events = append(events, m)
		}
		msg = Message{"t": "race", "ms": rc.ms, "you": you, "ack": ack, "racers": racers, "projectiles": projs, "hazards": hazards, "question": question, "taken": taken, "events": events}
	})
	return msg
}

func questionView(g *gateQ, locale string) Message {
	q := g.q
	kind := "choice"
	var opts []string
	var optMedia any
	if g.tf {
		kind = "tf"
		opts = []string{"true", "false"}
	} else {
		opts = make([]string, len(q.Options))
		for i, o := range q.Options {
			opts[i] = o.Get(locale)
		}
		optMedia = q.OptionMedia()
	}
	return Message{"id": g.id, "at": g.at, "zone": g.zone, "kind": kind, "text": q.Prompt.Get(locale), "media": q.Media(), "options": opts, "option_media": optMedia, "subject": q.Subject, "worth": q.Worth()}
}

// State builds the edukart_state snapshot for one player.
func (h *Hub) State(c auth.Claims, now time.Time) Message {
	msg := Message{
		"t": StateType, "phase": lobby.PhaseLobby, "pin": "", "you": -1, "host": -1, "seq": 0, "players": []Message{},
		"min_players": MinPlayers, "max_players": MaxPlayers, "local_seats": false, "answer_seconds": 0,
		"answer_times": append([]int{}, lobby.AnswerTimes...), "subject": "mix", "subject_fallback": false, "classroom": int64(0),
		"track": DefaultTrack, "laps": DefaultLaps, "bots": true, "race": nil,
		"tracks": append([]string{}, TrackIDs...), "lap_choices": append([]int{}, LapChoices...), "vehicles": append([]string{}, VehicleIDs...),
	}
	h.rooms.ViewFor(c, func(r *room) {
		if r == nil {
			return
		}
		g := &r.Game
		for k, v := range h.rooms.RoomPayload(r, c.Subject, func(i int, s *lobby.Seat[player]) Message {
			return Message{"vehicle": g.vehicleOf(s.ID())}
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
		msg["track"], msg["laps"], msg["bots"] = g.track, g.laps, g.bots
		rc := g.race
		if rc == nil || r.Phase == lobby.PhaseLobby {
			return
		}
		fallback := false
		infos := make([]Message, 0, len(rc.racers))
		for _, x := range rc.racers {
			var character any
			if len(x.character) > 0 {
				character = json.RawMessage(append([]byte(nil), x.character...))
			}
			left := x.left
			if x.seat >= 0 && x.gen != nil {
				fallback = fallback || x.gen.Fallback()
			}
			infos = append(infos, Message{"racer": x.idx, "seat": x.seat, "bot": x.seat < 0, "bot_no": x.botNo, "name": x.name, "vehicle": x.veh.ID, "character": character, "color": x.color, "left": left, "correct": x.correct, "wrong": x.wrong, "finish_ms": x.finishMs, "rank": x.rank})
		}
		msg["subject_fallback"] = fallback
		race := Message{"status": rc.status, "racers": infos, "standings": rc.standings(), "stopped": rc.stopped, "result": nil}
		if r.Phase == lobby.PhaseDone {
			if i := r.SeatIndex(c.Subject); i >= 0 && r.Seats[i].Data.reported {
				race["result"] = Message{"points": r.Seats[i].Data.paid}
			}
			race["match"] = matchOf(r, now)
		}
		msg["race"] = race
	})
	return msg
}
