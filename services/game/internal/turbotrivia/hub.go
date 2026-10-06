package turbotrivia

import (
	"fmt"
	"math/rand/v2"
	"sync"
	"time"
)

// Hub owns the room registry. It never touches room state: rooms run in
// their own goroutines and are reached through Room.do.
type Hub struct {
	cfg Config

	mu      sync.Mutex
	rng     *rand.Rand
	rooms   map[string]*Room
	hosts   map[int64]*Room
	players map[int64]*Room
	pending []Result
	ready   chan struct{}
}

// NewHub creates an empty hub.
func NewHub(cfg Config, seed uint64) *Hub {
	return &Hub{
		cfg: cfg, rng: rand.New(rand.NewPCG(seed, seed^0x7a87c0de)),
		rooms: map[string]*Room{}, hosts: map[int64]*Room{}, players: map[int64]*Room{},
		ready: make(chan struct{}, 1),
	}
}

// Config returns the timings.
func (h *Hub) Config() Config { return h.cfg }

// do runs a command on the room goroutine and waits for its reply. Commands
// to a closed room fail with ErrClosed; a full queue fails with ErrBusy.
func (r *Room) do(cmd command) reply {
	cmd.reply = make(chan reply, 1)
	select {
	case <-r.done:
		return reply{err: ErrClosed}
	default:
	}
	select {
	case r.cmds <- cmd:
	case <-r.done:
		return reply{err: ErrClosed}
	default:
		return reply{err: ErrBusy}
	}
	select {
	case res := <-cmd.reply:
		return res
	case <-r.done:
		return reply{err: ErrClosed}
	}
}

// Create opens a room hosted by c (closing the host's previous room).
func (h *Hub) Create(c *Client, now time.Time) (*Room, error) {
	if !c.Host {
		return nil, ErrHostOnly
	}
	h.mu.Lock()
	prev := h.hosts[c.ID()]
	h.mu.Unlock()
	if prev != nil {
		prev.do(command{kind: "close"})
	}
	h.mu.Lock()
	pin := ""
	for pin == "" || h.rooms[pin] != nil {
		pin = fmt.Sprintf("%06d", 100000+h.rng.IntN(900000))
	}
	r := newRoom(h, pin, c, h.rng.Uint64(), now)
	h.rooms[pin] = r
	h.hosts[c.ID()] = r
	h.mu.Unlock()
	go r.run()
	return r, r.do(command{kind: "attach_host", c: c}).err
}

// Resume reattaches a returning connection to its room (host screen or
// player kart). It reports false when the account has no room.
func (h *Hub) Resume(c *Client) bool {
	r := h.roomOf(c)
	if r == nil {
		return false
	}
	kind := "attach"
	if c.Host {
		kind = "attach_host"
	}
	return r.do(command{kind: kind, c: c}).err == nil
}

// Join seats a player in the room with the given PIN. avatar is the look
// the client sent; the signed token claim wins when present.
func (h *Hub) Join(c *Client, pin string, avatar []byte) error {
	if c.Host {
		return ErrPlayerOnly
	}
	h.mu.Lock()
	r := h.rooms[pin]
	prev := h.players[c.ID()]
	h.mu.Unlock()
	if r == nil {
		return ErrNotFound
	}
	if prev != nil && prev != r {
		prev.do(command{kind: "leave", c: c})
	}
	return r.do(command{kind: "join", c: c, avatar: avatar}).err
}

func (h *Hub) roomOf(c *Client) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.Host {
		return h.hosts[c.ID()]
	}
	return h.players[c.ID()]
}

func (h *Hub) send(c *Client, kind string, cmd command) error {
	r := h.roomOf(c)
	if r == nil {
		return ErrNoRoom
	}
	cmd.kind, cmd.c = kind, c
	return r.do(cmd).err
}

// Leave removes a player (or closes the host's room).
func (h *Hub) Leave(c *Client) error { return h.send(c, "leave", command{}) }

// Start begins or restarts the race (host only).
func (h *Hub) Start(c *Client) error { return h.send(c, "start", command{}) }

// End finishes the race early (host only); karts are ranked by distance.
func (h *Hub) End(c *Client) error { return h.send(c, "end", command{}) }

// Configure sets the number of questions of the next race (host only).
func (h *Hub) Configure(c *Client, questions int) error {
	return h.send(c, "configure", command{value: questions})
}

// SetSubject picks the question subject before the race (host only).
func (h *Hub) SetSubject(c *Client, subject string) error {
	return h.send(c, "subject", command{subject: subject})
}

// Sync re-sends the full state to c.
func (h *Hub) Sync(c *Client) error { return h.send(c, "sync", command{}) }

// Answer submits a choice for question qid. `at` (server reception time) is
// the answer time; client timestamps are never read.
func (h *Hub) Answer(c *Client, qid int64, choice int, at time.Time) error {
	if c.Host {
		return ErrPlayerOnly
	}
	return h.send(c, "answer", command{qid: qid, value: choice, at: at})
}

// UseItem fires an item from the player's inventory.
func (h *Hub) UseItem(c *Client, item string, at time.Time) error {
	if c.Host {
		return ErrPlayerOnly
	}
	return h.send(c, "item", command{item: item, at: at})
}

// Detach marks a connection gone.
func (h *Hub) Detach(c *Client) {
	if r := h.roomOf(c); r != nil {
		r.do(command{kind: "detach", c: c})
	}
}

// Inspect runs fn on the room goroutine (tests and diagnostics).
func (h *Hub) Inspect(pin string, fn func(r *Room) any) (any, error) {
	h.mu.Lock()
	r := h.rooms[pin]
	h.mu.Unlock()
	if r == nil {
		return nil, ErrNotFound
	}
	res := r.do(command{kind: "inspect", fn: fn})
	return res.v, res.err
}

// Counts reports open rooms and seated players.
func (h *Hub) Counts() (rooms, players int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms), len(h.players)
}

// CloseAll shuts every room (graceful shutdown): unfinished races are paid.
func (h *Hub) CloseAll() {
	h.mu.Lock()
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()
	for _, r := range rooms {
		r.do(command{kind: "close"})
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

// Ready signals that results are waiting (TakeResults drains them).
func (h *Hub) Ready() <-chan struct{} { return h.ready }

func (h *Hub) queue(res Result) {
	h.mu.Lock()
	h.pending = append(h.pending, res)
	h.mu.Unlock()
	select {
	case h.ready <- struct{}{}:
	default:
	}
}

func (h *Hub) setPlayer(uid int64, r *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.players[uid] = r
}

func (h *Hub) dropPlayer(uid int64, r *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.players[uid] == r {
		delete(h.players, uid)
	}
}

func (h *Hub) dropRoom(r *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[r.Pin] == r {
		delete(h.rooms, r.Pin)
	}
	if h.hosts[r.hostClaims.Subject] == r {
		delete(h.hosts, r.hostClaims.Subject)
	}
	for uid, room := range h.players {
		if room == r {
			delete(h.players, uid)
		}
	}
}
