package classroom

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
)

// Room and pacing limits.
const (
	MaxPlayers    = 200
	TickEvery     = 66 * time.Millisecond
	StateEvery    = time.Second
	MaxInputsPerS = 30
	EmoteGap      = time.Second
	outBuffer     = 128
	// PlaceMemory is how long a left player's spot is kept: reconnecting
	// (minimised tab, flaky network, back from a booth game) puts the avatar
	// back where it was instead of at the door.
	PlaceMemory = 2 * time.Hour
	// placeMemoryMax caps remembered spots per hub (oldest dropped first).
	placeMemoryMax = 20000
)

// spot is a remembered avatar position.
type spot struct {
	X, Z, Facing float64
	at           time.Time
}

type spotKey struct{ classroom, user int64 }

// ErrFull is returned when a room already has MaxPlayers.
var ErrFull = errors.New("classroom full")

// Message is one JSON message to a client.
type Message map[string]any

// Client is the hub's handle on one socket. The server drains Out and closes
// the socket once Done is closed (kick or newer connection).
type Client struct {
	out  chan Message
	done chan struct{}
	once sync.Once
}

// NewClient builds a client handle.
func NewClient() *Client {
	return &Client{out: make(chan Message, outBuffer), done: make(chan struct{})}
}

// Out yields messages to write.
func (c *Client) Out() <-chan Message { return c.out }

// Done is closed when the hub dropped this client.
func (c *Client) Done() <-chan struct{} { return c.done }

// push queues a message without blocking; a full queue drops it (state is
// resent every second, so a slow client only misses frames).
func (c *Client) push(m Message) {
	select {
	case <-c.done:
	case c.out <- m:
	default:
	}
}

func (c *Client) end() { c.once.Do(func() { close(c.done) }) }

// Player is one avatar in a room.
type Player struct {
	ID        int64
	Name      string
	Character json.RawMessage
	X, Z      float64
	Facing    float64
	InX, InZ  float64
	Busy      string
	busyBooth int
	client    *Client
	chat      chatLimiter
	inputAt   time.Time
	inputs    int
	emoteAt   time.Time
}

// Room is one classroom world.
type Room struct {
	ID int64
	// teacherID is the classroom owner from the signed TeacherID claim
	// (0 = unknown). The player with this id is the teacher avatar.
	teacherID int64
	players   map[int64]*Player
	observers map[int64]*Client
	geo       Geometry
	solids    []Box
	stop      chan struct{}
	changed   bool
	lastStep  time.Time
	lastState time.Time
}

// Config tunes a hub. Zero values use defaults.
type Config struct {
	Now  func() time.Time
	Tick time.Duration
	// Manual disables the per-room ticker goroutine (tests call Step).
	Manual bool
	Seed   uint64
	// OnSay receives every delivered proximity `say` message. It is called
	// in its own goroutine, never under the hub lock. Nil = not stored.
	OnSay func(SayEvent)
}

// SayEvent is one proximity direct message (for persistence in Laravel).
type SayEvent struct {
	EventID   string `json:"event_id"`
	Classroom int64  `json:"classroom"`
	From      int64  `json:"from"`
	To        int64  `json:"to"`
	Text      string `json:"text"`
	// At is the server time in unix milliseconds.
	At int64 `json:"at"`
}

// Hub owns every classroom room.
type Hub struct {
	mu    sync.Mutex
	cfg   Config
	rooms map[int64]*Room
	rng   *rand.Rand
	// spots remembers where players stood when they left (see PlaceMemory).
	spots map[spotKey]spot
}

// NewHub builds a hub.
func NewHub(cfg Config) *Hub {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Tick <= 0 {
		cfg.Tick = TickEvery
	}
	return &Hub{cfg: cfg, rooms: map[int64]*Room{}, rng: rand.New(rand.NewPCG(cfg.Seed, cfg.Seed^0xc1a55)), spots: map[spotKey]spot{}}
}

// Join seats the player (claims.Classroom must be > 0) with a client. A
// previous connection of the same user is dropped and busy is cleared.
func (h *Hub) Join(claims auth.Claims, c *Client) error {
	if claims.Classroom <= 0 {
		return errors.New("no classroom")
	}
	if claims.Observer {
		return h.joinObserver(claims, c)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.cfg.Now()
	room, ok := h.rooms[claims.Classroom]
	if !ok {
		// The first joiner's seats claim sizes the room; later joiners keep
		// it until the room empties (empty rooms are dropped).
		geo := Layout(claims.Booths, claims.Seats)
		room = &Room{ID: claims.Classroom, players: map[int64]*Player{}, observers: map[int64]*Client{}, geo: geo, solids: geo.Solids(), stop: make(chan struct{}), lastStep: now}
	}
	p, existing := room.players[claims.Subject]
	if !existing && len(room.players) >= MaxPlayers {
		return ErrFull
	}
	if !ok {
		h.rooms[room.ID] = room
		if !h.cfg.Manual {
			go h.run(room)
		}
	}
	if claims.TeacherID > 0 {
		room.teacherID = claims.TeacherID
	}
	if len(claims.Booths) > 0 {
		room.geo = Layout(claims.Booths, room.geo.Seats)
		room.solids = room.geo.Solids()
	}
	if existing {
		p.client.end()
		p.client = c
		p.Busy, p.busyBooth, p.InX, p.InZ = "", -1, 0, 0
		p.Name, p.Character = claims.Name, claims.Character
	} else {
		// Facing is atan2(dx, dz): 0 looks toward +z (the students, away
		// from the board), Pi looks toward -z (the board).
		x, z, facing := 0.0, 0.0, math.Pi
		if saved, ok := h.recall(room, claims.Subject, now); ok {
			x, z, facing = saved.X, saved.Z, saved.Facing
		} else if claims.Subject == room.teacherID {
			x, z = room.teacherSeat()
			facing = 0
		} else {
			x, z = h.spawn(room.geo, room.solids)
		}
		p = &Player{ID: claims.Subject, Name: claims.Name, Character: claims.Character, X: x, Z: z, Facing: facing, busyBooth: -1, client: c}
		room.players[p.ID] = p
	}
	room.changed = true
	c.push(h.welcome(room, p))
	room.broadcast(room.roster())
	room.broadcast(room.state())
	room.lastState = now
	return nil
}

func (h *Hub) joinObserver(claims auth.Claims, c *Client) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[claims.Classroom]
	if !ok {
		now := h.cfg.Now()
		geo := Layout(claims.Booths, claims.Seats)
		room = &Room{ID: claims.Classroom, players: map[int64]*Player{}, observers: map[int64]*Client{}, geo: geo, solids: geo.Solids(), stop: make(chan struct{}), lastState: now, lastStep: now}
		h.rooms[room.ID] = room
		if !h.cfg.Manual {
			go h.run(room)
		}
	}
	if claims.TeacherID > 0 {
		room.teacherID = claims.TeacherID
	}
	if old := room.observers[claims.Subject]; old != nil {
		old.end()
	}
	room.observers[claims.Subject] = c
	c.push(h.welcome(room, nil))
	c.push(room.roster())
	c.push(room.state())
	return nil
}

// remember keeps where p stood in room. Caller holds mu.
func (h *Hub) remember(room *Room, p *Player, now time.Time) {
	if len(h.spots) >= placeMemoryMax {
		h.forgetOld(now)
	}
	h.spots[spotKey{room.ID, p.ID}] = spot{X: p.X, Z: p.Z, Facing: p.Facing, at: now}
}

// recall returns (and consumes) a fresh remembered spot, resolved against
// the current layout so a resized room never seats anyone inside a desk or
// outside the walls. Caller holds mu.
func (h *Hub) recall(room *Room, uid int64, now time.Time) (spot, bool) {
	key := spotKey{room.ID, uid}
	saved, ok := h.spots[key]
	delete(h.spots, key)
	if !ok || now.Sub(saved.at) > PlaceMemory {
		return spot{}, false
	}
	if math.IsNaN(saved.X) || math.IsNaN(saved.Z) {
		return spot{}, false
	}
	saved.X, saved.Z = Resolve(saved.X, saved.Z, room.solids, room.geo.Room)
	if Blocked(saved.X, saved.Z, room.solids, room.geo.Room) {
		return spot{}, false
	}
	return saved, true
}

// forgetOld drops expired spots, then the oldest half if still too many.
// Caller holds mu.
func (h *Hub) forgetOld(now time.Time) {
	for k, v := range h.spots {
		if now.Sub(v.at) > PlaceMemory {
			delete(h.spots, k)
		}
	}
	if len(h.spots) < placeMemoryMax {
		return
	}
	ages := make([]time.Time, 0, len(h.spots))
	for _, v := range h.spots {
		ages = append(ages, v.at)
	}
	sort.Slice(ages, func(i, j int) bool { return ages[i].Before(ages[j]) })
	cut := ages[len(ages)/2]
	for k, v := range h.spots {
		if !v.at.After(cut) {
			delete(h.spots, k)
		}
	}
}

func (h *Hub) spawn(geo Geometry, solids []Box) (float64, float64) {
	for try := 0; try < 20; try++ {
		x := geo.Spawn.X + (h.rng.Float64()*2-1)*SpawnJitterX
		z := geo.Spawn.Z + (h.rng.Float64()*2-1)*SpawnJitterZ
		if x, z = Resolve(x, z, solids, geo.Room); !Blocked(x, z, solids, geo.Room) {
			return x, z
		}
	}
	return Resolve(geo.Spawn.X, geo.Spawn.Z, solids, geo.Room)
}

// teacherSeat is the resolved teacher seat position.
func (r *Room) teacherSeat() (float64, float64) {
	return Resolve(r.geo.TeacherSeat.X, r.geo.TeacherSeat.Z, r.solids, r.geo.Room)
}

func (h *Hub) welcome(room *Room, p *Player) Message {
	tx, tz := room.teacherSeat()
	you := int64(0)
	if p != nil {
		you = p.ID
	}
	spawn := map[string]float64{"x": round2(room.geo.Spawn.X), "z": round2(room.geo.Spawn.Z)}
	if p != nil {
		spawn = map[string]float64{"x": round2(p.X), "z": round2(p.Z)}
	}
	return Message{
		"t": "welcome", "you": you,
		"room":         room.geo.Room,
		"seats":        room.geo.Seats,
		"entry":        room.geo.Spawn,
		"spawn":        spawn,
		"desks":        room.geo.Desks,
		"teacher_desk": room.geo.TeacherDesk,
		"booths":       room.geo.Booths,
		"teacher":      map[string]any{"id": room.teacherID, "x": round2(tx), "z": round2(tz)},
		"tick_ms":      h.cfg.Tick.Milliseconds(),
	}
}

// Leave removes the player if c is still its current connection.
func (h *Hub) Leave(classroom, uid int64, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[classroom]
	if !ok {
		return
	}
	if observer, ok := room.observers[uid]; ok && observer == c {
		delete(room.observers, uid)
		if len(room.players) == 0 && len(room.observers) == 0 {
			delete(h.rooms, room.ID)
			close(room.stop)
		}
		return
	}
	if p, ok := room.players[uid]; ok && p.client == c {
		h.remember(room, p, h.cfg.Now())
		delete(room.players, uid)
		h.afterRemove(room)
	}
}

// afterRemove sends the new roster or drops an empty room. Caller holds mu.
func (h *Hub) afterRemove(room *Room) {
	if len(room.players) == 0 && len(room.observers) == 0 {
		delete(h.rooms, room.ID)
		close(room.stop)
		return
	}
	room.changed = true
	room.broadcast(room.roster())
}

// Kick drops user (0 = everyone) from a classroom with a `kicked` message.
// It returns how many players were kicked.
func (h *Hub) Kick(classroom, user int64) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	// A removed player (or everyone, when the class ends) starts at the door
	// next time.
	for k := range h.spots {
		if k.classroom == classroom && (user == 0 || k.user == user) {
			delete(h.spots, k)
		}
	}
	room, ok := h.rooms[classroom]
	if !ok {
		return 0
	}
	reason := "removed"
	if user == 0 {
		reason = "ended"
	}
	n := 0
	for id, p := range room.players {
		if user != 0 && id != user {
			continue
		}
		p.client.push(Message{"t": "kicked", "reason": reason})
		p.client.end()
		delete(room.players, id)
		n++
	}
	if user == 0 {
		for id, c := range room.observers {
			c.push(Message{"t": "kicked", "reason": reason})
			c.end()
			delete(room.observers, id)
		}
		if n == 0 {
			delete(h.rooms, room.ID)
			close(room.stop)
			return 0
		}
	}
	if n > 0 {
		h.afterRemove(room)
	}
	return n
}

// Inbound is one client message.
type Inbound struct {
	T     string  `json:"t"`
	X     float64 `json:"x"`
	Z     float64 `json:"z"`
	Text  string  `json:"text"`
	Booth int     `json:"booth"`
	E     string  `json:"e"`
	// To is the `say` target user id.
	To int64 `json:"to"`
}

var emotes = map[string]bool{"wave": true, "jump": true, "clap": true}

// Handle applies one client message from uid on connection c.
func (h *Hub) Handle(classroom, uid int64, c *Client, in Inbound) {
	var said *SayEvent
	h.mu.Lock()
	defer func() {
		h.mu.Unlock()
		if said != nil && h.cfg.OnSay != nil {
			go h.cfg.OnSay(*said)
		}
	}()
	room, ok := h.rooms[classroom]
	if !ok {
		return
	}
	if _, observer := room.observers[uid]; observer {
		return
	}
	p, ok := room.players[uid]
	if !ok || p.client != c {
		return
	}
	now := h.cfg.Now()
	switch in.T {
	case "input":
		if now.Sub(p.inputAt) >= time.Second {
			p.inputAt, p.inputs = now, 0
		}
		p.inputs++
		if p.inputs > MaxInputsPerS {
			return
		}
		p.InX, p.InZ = ClampInput(in.X, in.Z)
	case "chat":
		text := SanitizeChat(in.Text)
		if text == "" {
			return
		}
		if !p.chat.allow(now) {
			c.push(Message{"t": "error", "code": "chat_rate"})
			return
		}
		room.broadcast(Message{"t": "chat", "id": p.ID, "name": p.Name, "text": text, "at": now.UnixMilli()})
	case "say":
		said = h.say(room, p, in, now)
	case "enter":
		if p.ID == room.teacherID {
			c.push(Message{"t": "error", "code": "teacher_no_booth"})
			return
		}
		if !room.geo.Inside(in.Booth, p.X, p.Z) {
			c.push(Message{"t": "error", "code": "too_far"})
			return
		}
		game := room.geo.Booths[in.Booth].Game
		p.Busy, p.busyBooth = game, in.Booth
		room.changed = true
		c.push(Message{"t": "enter", "booth": in.Booth, "game": game})
	case "emote":
		if !emotes[in.E] || (!p.emoteAt.IsZero() && now.Sub(p.emoteAt) < EmoteGap) {
			return
		}
		p.emoteAt = now
		room.broadcast(Message{"t": "emote", "id": p.ID, "e": in.E})
	case "ping":
		c.push(Message{"t": "pong"})
	}
}

// say delivers a proximity direct message to the sender and the target only
// and returns the event to persist (nil when rejected). Caller holds mu.
func (h *Hub) say(room *Room, p *Player, in Inbound, now time.Time) *SayEvent {
	target, online := room.players[in.To]
	if in.To <= 0 || in.To == p.ID || (!online && in.To != room.teacherID) {
		p.client.push(Message{"t": "error", "code": "no_target"})
		return nil
	}
	tx, tz := 0.0, 0.0
	if online {
		tx, tz = target.X, target.Z
	} else {
		tx, tz = room.teacherSeat()
	}
	if math.Hypot(p.X-tx, p.Z-tz) > SayRadius {
		p.client.push(Message{"t": "error", "code": "too_far"})
		return nil
	}
	text := SanitizeChat(in.Text)
	if text == "" {
		return nil
	}
	if !p.chat.allow(now) {
		p.client.push(Message{"t": "error", "code": "chat_rate"})
		return nil
	}
	at := now.UnixMilli()
	msg := Message{"t": "say", "id": p.ID, "to": in.To, "name": p.Name, "text": text, "at": at}
	p.client.push(msg)
	if online {
		target.client.push(msg)
	}
	return &SayEvent{
		EventID:   fmt.Sprintf("cw-%d-%d-%d-%08x", room.ID, p.ID, now.UnixNano(), h.rng.Uint32()),
		Classroom: room.ID, From: p.ID, To: in.To, Text: text, At: at,
	}
}

// Step advances every room to now (used by tests with Manual hubs).
func (h *Hub) Step() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.cfg.Now()
	for _, room := range h.rooms {
		h.stepRoom(room, now)
	}
}

func (h *Hub) run(room *Room) {
	t := time.NewTicker(h.cfg.Tick)
	defer t.Stop()
	for {
		select {
		case <-room.stop:
			return
		case <-t.C:
			h.mu.Lock()
			if h.rooms[room.ID] == room {
				h.stepRoom(room, h.cfg.Now())
			}
			h.mu.Unlock()
		}
	}
}

// stepRoom integrates movement, clears stale busy flags and broadcasts state
// when something changed or every StateEvery. Caller holds mu.
func (h *Hub) stepRoom(room *Room, now time.Time) {
	dt := now.Sub(room.lastStep).Seconds()
	room.lastStep = now
	if dt > 0.25 {
		dt = 0.25
	}
	for _, p := range room.players {
		if p.InX != 0 || p.InZ != 0 {
			x, z := Advance(p.X, p.Z, p.InX, p.InZ, dt, room.solids, room.geo.Room)
			facing := math.Atan2(p.InX, p.InZ)
			if x != p.X || z != p.Z || facing != p.Facing {
				p.X, p.Z, p.Facing = x, z, facing
				room.changed = true
			}
		}
		if p.Busy != "" && !room.geo.Inside(p.busyBooth, p.X, p.Z) {
			p.Busy, p.busyBooth = "", -1
			room.changed = true
		}
	}
	if room.changed || now.Sub(room.lastState) >= StateEvery {
		room.broadcast(room.state())
		room.changed = false
		room.lastState = now
	}
}

func (r *Room) sorted() []*Player {
	out := make([]*Player, 0, len(r.players))
	for _, p := range r.players {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (r *Room) roster() Message {
	list := []map[string]any{}
	for _, p := range r.sorted() {
		var look any
		if len(p.Character) > 0 {
			look = p.Character
		}
		entry := map[string]any{"id": p.ID, "name": p.Name, "character": look}
		if p.ID == r.teacherID {
			entry["teacher"] = true
		}
		list = append(list, entry)
	}
	return Message{"t": "roster", "players": list}
}

func (r *Room) state() Message {
	list := [][]any{}
	for _, p := range r.sorted() {
		list = append(list, []any{p.ID, round2(p.X), round2(p.Z), round2(p.Facing), p.Busy})
	}
	return Message{"t": "state", "p": list}
}

func (r *Room) broadcast(m Message) {
	for _, p := range r.players {
		p.client.push(m)
	}
	for _, c := range r.observers {
		c.push(m)
	}
}

// Snapshot is a copy of a player's position (tests and diagnostics).
type Snapshot struct {
	X, Z float64
	Busy string
}

// Player returns a copy of a player's position.
func (h *Hub) Player(classroom, uid int64) (Snapshot, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[classroom]; ok {
		if p, ok := room.players[uid]; ok {
			return Snapshot{X: p.X, Z: p.Z, Busy: p.Busy}, true
		}
	}
	return Snapshot{}, false
}

// Place teleports a player (tests only; resolves collisions).
func (h *Hub) Place(classroom, uid int64, x, z float64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[classroom]; ok {
		if p, ok := room.players[uid]; ok {
			p.X, p.Z = Resolve(x, z, room.solids, room.geo.Room)
			room.changed = true
		}
	}
}

// Geometry returns a room's layout (tests and diagnostics).
func (h *Hub) Geometry(classroom int64) (Geometry, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[classroom]; ok {
		return room.geo, true
	}
	return Geometry{}, false
}

// Rooms returns the number of live rooms.
func (h *Hub) Rooms() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms)
}
