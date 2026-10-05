// Package hub fans chat events out to the open sockets of each user. It holds
// no history: Laravel stores messages and publishes each new one here.
package hub

import (
	"encoding/json"
	"sync"
)

// MaxConnsPerUser bounds sockets per player (tabs and devices).
const MaxConnsPerUser = 8

// BufferSize is how many events a slow client may lag before it is dropped.
const BufferSize = 64

// Client is one open socket.
type Client struct {
	User int64
	Send chan []byte
	// Closed by the hub when the client is dropped (slow or over limit).
	Done chan struct{}
	once sync.Once
	seq  uint64
}

func (c *Client) close() { c.once.Do(func() { close(c.Done) }) }

// Hub routes events by user id.
type Hub struct {
	mu      sync.RWMutex
	clients map[int64]map[*Client]struct{}
	seq     uint64
}

// New creates an empty hub.
func New() *Hub {
	return &Hub{clients: map[int64]map[*Client]struct{}{}}
}

// Register adds a socket for user. The oldest socket is dropped when the
// user is over MaxConnsPerUser.
func (h *Hub) Register(user int64) *Client {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.seq++
	c := &Client{User: user, Send: make(chan []byte, BufferSize), Done: make(chan struct{}), seq: h.seq}
	set := h.clients[user]
	if set == nil {
		set = map[*Client]struct{}{}
		h.clients[user] = set
	}
	if len(set) >= MaxConnsPerUser {
		var oldest *Client
		for old := range set {
			if oldest == nil || old.seq < oldest.seq {
				oldest = old
			}
		}
		delete(set, oldest)
		oldest.close()
	}
	set[c] = struct{}{}
	return c
}

// Unregister removes a socket.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.clients[c.User]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.User)
		}
	}
	c.close()
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
	for _, c := range drop {
		h.Unregister(c)
	}
	return sent
}

// Online reports which of the given users have at least one socket.
func (h *Hub) Online(users []int64) []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]int64, 0, len(users))
	for _, u := range users {
		if len(h.clients[u]) > 0 {
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
