// Package hub fans chat events out to the open sockets of each user. It holds
// no history: Laravel stores messages and publishes each new one here.
//
// The hub also tracks presence: a user is online while they have at least
// one socket. Sockets may watch a list of user ids and receive
// {"t":"presence","user":id,"online":bool} whenever one of them changes.
package hub

import (
	"encoding/json"
	"sync"
	"time"
)

// MaxConnsPerUser bounds sockets per player (tabs and devices).
const MaxConnsPerUser = 8

// BufferSize is how many events a slow client may lag before it is dropped.
const BufferSize = 64

// MaxWatch caps how many users one socket may watch for presence.
const MaxWatch = 500

// DefaultOfflineGrace keeps a user online briefly after their last socket
// closes, so a page reload does not flash them offline for everyone.
const DefaultOfflineGrace = 8 * time.Second

// Client is one open socket.
type Client struct {
	User int64
	Send chan []byte
	// Closed by the hub when the client is dropped (slow or over limit).
	Done  chan struct{}
	once  sync.Once
	seq   uint64
	watch map[int64]struct{}
}

func (c *Client) close() { c.once.Do(func() { close(c.Done) }) }

// Hub routes events by user id.
type Hub struct {
	mu       sync.RWMutex
	clients  map[int64]map[*Client]struct{}
	watchers map[int64]map[*Client]struct{}
	leaving  map[int64]*time.Timer
	seq      uint64
	grace    time.Duration
}

// New creates an empty hub with the default offline grace.
func New() *Hub { return NewWithGrace(DefaultOfflineGrace) }

// NewWithGrace creates an empty hub; grace 0 reports offline immediately.
func NewWithGrace(grace time.Duration) *Hub {
	return &Hub{
		clients:  map[int64]map[*Client]struct{}{},
		watchers: map[int64]map[*Client]struct{}{},
		leaving:  map[int64]*time.Timer{},
		grace:    grace,
	}
}

// Register adds a socket for user. The oldest socket is dropped when the
// user is over MaxConnsPerUser.
func (h *Hub) Register(user int64) *Client {
	h.mu.Lock()
	h.seq++
	c := &Client{User: user, Send: make(chan []byte, BufferSize), Done: make(chan struct{}), seq: h.seq, watch: map[int64]struct{}{}}
	set := h.clients[user]
	if set == nil {
		set = map[*Client]struct{}{}
		h.clients[user] = set
	}
	cameOnline := len(set) == 0
	if timer, ok := h.leaving[user]; ok {
		timer.Stop()
		delete(h.leaving, user)
		cameOnline = false
	}
	if len(set) >= MaxConnsPerUser {
		var oldest *Client
		for old := range set {
			if oldest == nil || old.seq < oldest.seq {
				oldest = old
			}
		}
		delete(set, oldest)
		h.unwatchLocked(oldest)
		oldest.close()
	}
	set[c] = struct{}{}
	var drop []*Client
	if cameOnline {
		drop = h.announceLocked(user, true)
	}
	h.mu.Unlock()
	h.dropAll(drop)
	return c
}

// Unregister removes a socket. When it was the user's last one, watchers
// learn the user went offline after the grace period.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	var drop []*Client
	if set := h.clients[c.User]; set != nil {
		if _, ok := set[c]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(h.clients, c.User)
				drop = h.leaveLocked(c.User)
			}
		}
	}
	h.unwatchLocked(c)
	h.mu.Unlock()
	c.close()
	h.dropAll(drop)
}

// Watch replaces the users c follows for presence and returns which of them
// are online right now. The list is capped at MaxWatch.
func (h *Hub) Watch(c *Client, users []int64) []int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.unwatchLocked(c)
	online := make([]int64, 0, len(users))
	for _, u := range users {
		if u <= 0 || len(c.watch) >= MaxWatch {
			continue
		}
		if _, dup := c.watch[u]; dup {
			continue
		}
		c.watch[u] = struct{}{}
		set := h.watchers[u]
		if set == nil {
			set = map[*Client]struct{}{}
			h.watchers[u] = set
		}
		set[c] = struct{}{}
		if h.onlineLocked(u) {
			online = append(online, u)
		}
	}
	return online
}

// Enqueue queues an event for one socket; false when its buffer is full.
func (h *Hub) Enqueue(c *Client, event []byte) bool {
	select {
	case c.Send <- event:
		return true
	default:
		return false
	}
}

// Publish sends event to every socket of the given users and returns how
// many sockets received it. Clients whose buffer is full are dropped; they
// resync from Laravel when they reconnect.
func (h *Hub) Publish(users []int64, event json.RawMessage) int {
	h.mu.RLock()
	var drop []*Client
	sent := 0
	for _, u := range users {
		for c := range h.clients[u] {
			select {
			case c.Send <- event:
				sent++
			default:
				drop = append(drop, c)
			}
		}
	}
	h.mu.RUnlock()
	h.dropAll(drop)
	return sent
}

// Online reports which of the given users have at least one socket (or
// closed their last one less than the grace period ago).
func (h *Hub) Online(users []int64) []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]int64, 0, len(users))
	for _, u := range users {
		if h.onlineLocked(u) {
			out = append(out, u)
		}
	}
	return out
}

// OnlineUsers lists every user online right now (sockets open or within
// the offline grace), unordered.
func (h *Hub) OnlineUsers() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]int64, 0, len(h.clients)+len(h.leaving))
	for u := range h.clients {
		out = append(out, u)
	}
	for u := range h.leaving {
		if len(h.clients[u]) == 0 {
			out = append(out, u)
		}
	}
	return out
}

// Stats returns connected users and sockets.
func (h *Hub) Stats() (users, sockets int) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, set := range h.clients {
		users++
		sockets += len(set)
	}
	return users, sockets
}

func (h *Hub) onlineLocked(u int64) bool {
	if len(h.clients[u]) > 0 {
		return true
	}
	_, pending := h.leaving[u]
	return pending
}

// leaveLocked starts the offline grace for user (or announces right away).
func (h *Hub) leaveLocked(user int64) []*Client {
	if h.grace <= 0 {
		return h.announceLocked(user, false)
	}
	var timer *time.Timer
	timer = time.AfterFunc(h.grace, func() {
		h.mu.Lock()
		if h.leaving[user] != timer || len(h.clients[user]) > 0 {
			h.mu.Unlock()
			return
		}
		delete(h.leaving, user)
		drop := h.announceLocked(user, false)
		h.mu.Unlock()
		h.dropAll(drop)
	})
	h.leaving[user] = timer
	return nil
}

// announceLocked tells every watcher of user about a presence change and
// returns the watchers too slow to take it.
func (h *Hub) announceLocked(user int64, online bool) []*Client {
	set := h.watchers[user]
	if len(set) == 0 {
		return nil
	}
	event, _ := json.Marshal(map[string]any{"t": "presence", "user": user, "online": online})
	var drop []*Client
	for c := range set {
		select {
		case c.Send <- event:
		default:
			drop = append(drop, c)
		}
	}
	return drop
}

func (h *Hub) unwatchLocked(c *Client) {
	for u := range c.watch {
		if set := h.watchers[u]; set != nil {
			delete(set, c)
			if len(set) == 0 {
				delete(h.watchers, u)
			}
		}
	}
	c.watch = map[int64]struct{}{}
}

func (h *Hub) dropAll(clients []*Client) {
	for _, c := range clients {
		h.Unregister(c)
	}
}
