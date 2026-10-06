// Package lobby is the standard invite system for multiplayer games.
//
// Every multiplayer game uses the same flow: a host creates a room and gets
// a 6 digit PIN, shares the PIN or an invite link
// (/games/{game}/join/{pin}), friends join, and only the host starts. The
// host may also add pass-and-play seats that are controlled from the host's
// device. Games keep their own state in Room.Game (type S) and per seat data
// in Seat.Data (type P); the hub owns membership, host handover, presence and
// cleanup.
package lobby

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"edufunhub/game/internal/auth"
)

// PinDigits is the length of every room PIN.
const PinDigits = 6

// Room phases.
const (
	PhaseLobby   = "lobby"
	PhasePlaying = "playing"
	PhaseDone    = "done"
)

// Errors share their codes with the client (snakes.online.errors.*, room.errors.*).
var (
	ErrNotFound   = errors.New("room_not_found")
	ErrFull       = errors.New("room_full")
	ErrStarted    = errors.New("room_started")
	ErrNotHost    = errors.New("not_host")
	ErrPlayers    = errors.New("not_enough_players")
	ErrPhase      = errors.New("wrong_phase")
	ErrNoRoom     = errors.New("not_in_room")
	ErrLocalLimit = errors.New("local_limit")
	ErrNotLocal   = errors.New("not_local")
)

// Config bounds a game's rooms.
type Config struct {
	Min int
	Max int
	// Local allows pass-and-play seats controlled by the host's device.
	Local bool
}

// Seat is one player in a room.
type Seat[P any] struct {
	Claims auth.Claims
	// Local seats belong to the device of Owner (the host who added them)
	// and have negative ids.
	Local bool
	Owner int64
	Left  bool
	Data  P
}

// ID is the user id (negative for local seats).
func (s *Seat[P]) ID() int64 { return s.Claims.Subject }

// Room is a lobby room with game state S and per seat data P.
type Room[S, P any] struct {
	Pin     string
	Host    int64
	Seats   []*Seat[P]
	Phase   string
	Seq     int
	Touched time.Time
	// Subject is the host's question subject ("" = mix of all subjects).
	Subject string
	Game    S
}

// Active counts seats still in the room.
func (r *Room[S, P]) Active() int {
	n := 0
	for _, s := range r.Seats {
		if !s.Left {
			n++
		}
	}
	return n
}

// Humans lists account holders still in the room.
func (r *Room[S, P]) Humans() []int64 {
	ids := make([]int64, 0, len(r.Seats))
	for _, s := range r.Seats {
		if !s.Left && !s.Local {
			ids = append(ids, s.ID())
		}
	}
	return ids
}

// SeatIndex returns uid's own seat index or -1.
func (r *Room[S, P]) SeatIndex(uid int64) int {
	for i, s := range r.Seats {
		if s.ID() == uid && !s.Left {
			return i
		}
	}
	return -1
}

// Controls reports whether uid may act for seat i: their own seat, or a
// local seat on their device. Local seats stay with the device that added
// them, also after the host role moved to another player.
func (r *Room[S, P]) Controls(uid int64, i int) bool {
	if i < 0 || i >= len(r.Seats) || r.Seats[i].Left {
		return false
	}
	s := r.Seats[i]
	return s.ID() == uid || (s.Local && s.Owner == uid)
}

// Touch marks a change: clients get a new state and the room stays alive.
func (r *Room[S, P]) Touch(now time.Time) {
	r.Seq++
	r.Touched = now
}

// Hub runs every room of one game. Safe for concurrent use.
type Hub[S, P any] struct {
	mu       sync.Mutex
	cfg      Config
	rng      *rand.Rand
	rooms    map[string]*Room[S, P]
	members  map[int64]string
	locales  map[int64]string
	online   map[int64]bool
	away     map[string]time.Time
	localSeq int64

	// OnLeave runs (under the hub lock) when a seat leaves a playing room,
	// before host handover and cleanup.
	OnLeave func(r *Room[S, P], seat int, now time.Time)
}

// New creates a hub.
func New[S, P any](seed uint64, cfg Config) *Hub[S, P] {
	return &Hub[S, P]{
		cfg:     cfg,
		rng:     rand.New(rand.NewPCG(seed, seed^0x2545f4914f6cdd1d)),
		rooms:   map[string]*Room[S, P]{},
		members: map[int64]string{},
		locales: map[int64]string{},
		online:  map[int64]bool{},
		away:    map[string]time.Time{},
	}
}

// HostGrace is how long a host may stay disconnected before the host role
// moves to a connected player, so the room can still be started, restarted
// and configured.
const HostGrace = 10 * time.Second

// Config returns the room bounds.
func (h *Hub[S, P]) Config() Config { return h.cfg }

func normLocale(l string) string {
	if l == "en" {
		return "en"
	}
	return "id"
}

// Join marks a player connected; a returning member keeps their seat.
func (h *Hub[S, P]) Join(claims auth.Claims, locale string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.locales[claims.Subject] = normLocale(locale)
	h.online[claims.Subject] = true
	if r := h.roomOf(claims.Subject); r != nil {
		if i := r.SeatIndex(claims.Subject); i >= 0 {
			r.Seats[i].Claims = claims
		}
	}
}

// SetLocale changes a player's language.
func (h *Hub[S, P]) SetLocale(uid int64, locale string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.locales[uid] = normLocale(locale)
}

// Offline marks a player disconnected; their seat is kept.
func (h *Hub[S, P]) Offline(uid int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.online, uid)
}

// Locale returns uid's language. Call with the lock held (inside callbacks).
func (h *Hub[S, P]) Locale(uid int64) string {
	if l, ok := h.locales[uid]; ok {
		return l
	}
	return "id"
}

// Online reports presence. Local seats are online while their device is.
// Call with the lock held (inside callbacks).
func (h *Hub[S, P]) Online(r *Room[S, P], i int) bool {
	s := r.Seats[i]
	if s.Local {
		return h.online[s.Owner]
	}
	return h.online[s.ID()]
}

func (h *Hub[S, P]) roomOf(uid int64) *Room[S, P] {
	pin, ok := h.members[uid]
	if !ok {
		return nil
	}
	return h.rooms[pin]
}

func (h *Hub[S, P]) newPin() string {
	for {
		pin := fmt.Sprintf("%06d", 100000+h.rng.IntN(900000))
		if _, taken := h.rooms[pin]; !taken {
			return pin
		}
	}
}

// Create opens a room hosted by claims. init sets up the game state.
func (h *Hub[S, P]) Create(claims auth.Claims, now time.Time, init func(r *Room[S, P])) (string, []int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	affected := h.leaveLocked(claims.Subject, now)
	pin := h.newPin()
	r := &Room[S, P]{Pin: pin, Host: claims.Subject, Phase: PhaseLobby, Touched: now, Seats: []*Seat[P]{{Claims: claims}}}
	if init != nil {
		init(r)
	}
	h.rooms[pin] = r
	h.members[claims.Subject] = pin
	return pin, append(affected, claims.Subject)
}

// Enter joins the room with the given PIN.
func (h *Hub[S, P]) Enter(claims auth.Claims, pin string, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[pin]
	if !ok {
		return nil, ErrNotFound
	}
	if r.SeatIndex(claims.Subject) >= 0 {
		return r.Humans(), nil
	}
	if r.Phase == PhasePlaying {
		return nil, ErrStarted
	}
	if r.Active() >= h.cfg.Max {
		return nil, ErrFull
	}
	affected := h.leaveLocked(claims.Subject, now)
	r.Seats = append(r.Seats, &Seat[P]{Claims: claims})
	r.Touch(now)
	h.members[claims.Subject] = pin
	return append(affected, r.Humans()...), nil
}

// AddLocal adds a pass-and-play seat on the host's device.
func (h *Hub[S, P]) AddLocal(uid int64, name string, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if !h.cfg.Local {
		return nil, ErrLocalLimit
	}
	if r.Host != uid {
		return nil, ErrNotHost
	}
	if r.Phase == PhasePlaying {
		return nil, ErrPhase
	}
	if r.Active() >= h.cfg.Max {
		return nil, ErrFull
	}
	host := r.Seats[r.SeatIndex(uid)].Claims
	h.localSeq++
	r.Seats = append(r.Seats, &Seat[P]{
		Claims: auth.Claims{Subject: -h.localSeq, Name: name, Grade: host.Grade, Game: host.Game},
		Local:  true,
		Owner:  uid,
	})
	r.Touch(now)
	return r.Humans(), nil
}

// RemoveLocal drops a pass-and-play seat before the game starts.
func (h *Hub[S, P]) RemoveLocal(uid int64, seat int, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if r.Host != uid {
		return nil, ErrNotHost
	}
	if r.Phase == PhasePlaying {
		return nil, ErrPhase
	}
	if seat < 0 || seat >= len(r.Seats) || !r.Seats[seat].Local {
		return nil, ErrNotLocal
	}
	r.Seats = append(r.Seats[:seat], r.Seats[seat+1:]...)
	r.Touch(now)
	return r.Humans(), nil
}

// Leave removes uid from their room and returns who must be updated.
func (h *Hub[S, P]) Leave(uid int64, now time.Time) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append(h.leaveLocked(uid, now), uid)
}

func (h *Hub[S, P]) leaveLocked(uid int64, now time.Time) []int64 {
	r := h.roomOf(uid)
	delete(h.members, uid)
	if r == nil {
		return nil
	}
	index := r.SeatIndex(uid)
	if index < 0 {
		return r.Humans()
	}
	hosting := r.Host == uid
	leaving := []int{index}
	for i, s := range r.Seats {
		if s.Local && !s.Left && s.Owner == uid {
			leaving = append(leaving, i)
		}
	}
	if r.Phase == PhasePlaying {
		for _, i := range leaving {
			r.Seats[i].Left = true
		}
		if h.OnLeave != nil {
			for _, i := range leaving {
				h.OnLeave(r, i, now)
			}
		}
	} else {
		kept := r.Seats[:0]
		for i, s := range r.Seats {
			drop := false
			for _, j := range leaving {
				drop = drop || i == j
			}
			if !drop {
				kept = append(kept, s)
			}
		}
		r.Seats = kept
	}
	r.Touch(now)
	humans := r.Humans()
	if len(humans) == 0 {
		delete(h.rooms, r.Pin)
		delete(h.away, r.Pin)
		return nil
	}
	if hosting {
		r.Host = h.successor(r, humans)
		delete(h.away, r.Pin)
	}
	return humans
}

// successor picks the next host: the first connected account holder, else
// the first one still in the room.
func (h *Hub[S, P]) successor(r *Room[S, P], humans []int64) int64 {
	for _, id := range humans {
		if id != r.Host && h.online[id] {
			return id
		}
	}
	for _, id := range humans {
		if id != r.Host {
			return id
		}
	}
	return humans[0]
}

// HandOver moves the host role of every room whose host has been
// disconnected for at least grace to a connected player. The game itself
// never stops because the host dropped; this keeps start, restart and the
// settings usable. Returns the players to update.
func (h *Hub[S, P]) HandOver(now time.Time, grace time.Duration) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	var ids []int64
	for pin, r := range h.rooms {
		if h.online[r.Host] {
			delete(h.away, pin)
			continue
		}
		since, ok := h.away[pin]
		if !ok {
			h.away[pin] = now
			continue
		}
		if now.Sub(since) < grace {
			continue
		}
		humans := r.Humans()
		next := h.successor(r, humans)
		if next == r.Host || !h.online[next] {
			continue
		}
		r.Host = next
		r.Touch(now)
		delete(h.away, pin)
		ids = append(ids, humans...)
	}
	for pin := range h.away {
		if _, ok := h.rooms[pin]; !ok {
			delete(h.away, pin)
		}
	}
	return ids
}

// Presence describes the room uid is seated in (for "continue playing").
type Presence struct {
	Pin   string
	Phase string
	Host  bool
}

// PresenceOf returns uid's room, if any.
func (h *Hub[S, P]) PresenceOf(uid int64) (Presence, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil || r.SeatIndex(uid) < 0 {
		return Presence{}, false
	}
	return Presence{Pin: r.Pin, Phase: r.Phase, Host: r.Host == uid}, true
}

// Start begins or restarts the game. Only the host may start. start runs
// under the lock after left seats are removed and the player count checked.
func (h *Hub[S, P]) Start(uid int64, now time.Time, start func(r *Room[S, P]) error) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if r.Host != uid {
		return nil, ErrNotHost
	}
	if r.Phase == PhasePlaying {
		return nil, ErrPhase
	}
	kept := r.Seats[:0]
	for _, s := range r.Seats {
		if !s.Left {
			var zero P
			s.Data = zero
			kept = append(kept, s)
		}
	}
	r.Seats = kept
	if len(r.Seats) < h.cfg.Min {
		return nil, ErrPlayers
	}
	if err := start(r); err != nil {
		return nil, err
	}
	r.Phase = PhasePlaying
	r.Touch(now)
	return r.Humans(), nil
}

// SetSubject changes the question subject before the game starts (host only).
// norm maps the client value to a known subject ("" = mix).
func (h *Hub[S, P]) SetSubject(uid int64, subject string, norm func(string) string, now time.Time) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if r.Host != uid {
		return nil, ErrNotHost
	}
	if r.Phase == PhasePlaying {
		return nil, ErrPhase
	}
	r.Subject = norm(subject)
	r.Touch(now)
	return r.Humans(), nil
}

// Configure changes a game setting before the game starts (host only).
func (h *Hub[S, P]) Configure(uid int64, now time.Time, fn func(r *Room[S, P]) error) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if r.Host != uid {
		return nil, ErrNotHost
	}
	if r.Phase == PhasePlaying {
		return nil, ErrPhase
	}
	if err := fn(r); err != nil {
		return nil, err
	}
	r.Touch(now)
	return r.Humans(), nil
}

// Act runs a game action on uid's room under the lock.
func (h *Hub[S, P]) Act(uid int64, now time.Time, act func(r *Room[S, P]) error) ([]int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil, ErrNoRoom
	}
	if err := act(r); err != nil {
		return nil, err
	}
	r.Touched = now
	return r.Humans(), nil
}

// Tick advances every playing room and returns players whose state changed.
func (h *Hub[S, P]) Tick(advance func(r *Room[S, P])) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	var ids []int64
	for _, r := range h.rooms {
		if r.Phase != PhasePlaying {
			continue
		}
		before := r.Seq
		advance(r)
		if r.Seq != before {
			ids = append(ids, r.Humans()...)
		}
	}
	return ids
}

// Prune drops rooms untouched for idle, or with every member offline for
// empty. drop runs first for rooms that were still playing.
func (h *Hub[S, P]) Prune(now time.Time, idle, empty time.Duration, drop func(r *Room[S, P])) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for pin, r := range h.rooms {
		anyone := false
		for _, id := range r.Humans() {
			anyone = anyone || h.online[id]
		}
		if now.Sub(r.Touched) <= idle && (anyone || now.Sub(r.Touched) <= empty) {
			continue
		}
		if r.Phase == PhasePlaying && drop != nil {
			drop(r)
		}
		for _, id := range r.Humans() {
			if h.members[id] == pin {
				delete(h.members, id)
			}
		}
		delete(h.rooms, pin)
	}
	for uid := range h.locales {
		if _, member := h.members[uid]; !member && !h.online[uid] {
			delete(h.locales, uid)
		}
	}
}

// Peers lists the account holders in uid's room (uid included).
func (h *Hub[S, P]) Peers(uid int64) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r := h.roomOf(uid); r != nil {
		return r.Humans()
	}
	return nil
}

// Counts reports open rooms and seated account holders.
func (h *Hub[S, P]) Counts() (rooms, players int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms), len(h.members)
}

// View calls fn with uid's room (nil when none) under the lock.
func (h *Hub[S, P]) View(uid int64, fn func(r *Room[S, P])) {
	h.mu.Lock()
	defer h.mu.Unlock()
	fn(h.roomOf(uid))
}

// Dissolve closes uid's room (e.g. after a private duel starts elsewhere).
func (h *Hub[S, P]) Dissolve(uid int64) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.roomOf(uid)
	if r == nil {
		return nil
	}
	ids := r.Humans()
	for _, id := range ids {
		delete(h.members, id)
	}
	delete(h.rooms, r.Pin)
	return ids
}

// Message is a JSON object.
type Message = map[string]any

// RoomPayload is the standard room description every multiplayer state
// carries: pin, host seat, viewer seat and the seat list.
func (h *Hub[S, P]) RoomPayload(r *Room[S, P], viewer int64, extra func(i int, s *Seat[P]) Message) Message {
	players := make([]Message, 0, len(r.Seats))
	you, host := -1, -1
	for i, s := range r.Seats {
		if s.ID() == viewer && !s.Left {
			you = i
		}
		if s.ID() == r.Host && !s.Left {
			host = i
		}
		p := Message{
			"seat": i, "name": s.Claims.Name, "grade": s.Claims.Grade,
			"online": h.Online(r, i), "left": s.Left, "local": s.Local,
			"controlled": r.Controls(viewer, i),
		}
		if len(s.Claims.Character) > 0 {
			p["character"] = s.Claims.Character
		}
		if !s.Local && s.ID() > 0 {
			p["user_id"] = s.ID()
		}
		if extra != nil {
			for k, v := range extra(i, s) {
				p[k] = v
			}
		}
		players = append(players, p)
	}
	return Message{
		"pin": r.Pin, "seq": r.Seq, "phase": r.Phase, "host": host, "you": you, "subject": subjectOrMix(r.Subject),
		"players": players, "min_players": h.cfg.Min, "max_players": h.cfg.Max,
		"local_seats": h.cfg.Local,
	}
}

func subjectOrMix(s string) string {
	if s == "" {
		return "mix"
	}
	return s
}
