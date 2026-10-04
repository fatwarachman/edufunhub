package questions

import "sync"

// Subjects players can pick before a game. Mix ("" or "mix") draws from all.
var Subjects = []string{"math", "science", "language", "social", "english", "civics"}

// Mix is the explicit "all subjects" choice sent by clients.
const Mix = "mix"

// NormSubject returns a known subject or "" for the mix.
func NormSubject(s string) string {
	for _, known := range Subjects {
		if s == known {
			return s
		}
	}
	return ""
}

// historyCap bounds the remembered questions per player.
const historyCap = 400

// seenLog remembers, per player, when each bank question was last shown so a
// new game starts with questions the player has not seen recently.
type seenLog struct {
	mu    sync.Mutex
	clock int64
	users map[int64]map[string]int64
}

// History is the process-wide question history.
var History = &seenLog{users: map[int64]map[string]int64{}}

// LastSeen returns the most recent tick any of the players saw key (0 = never).
func (h *seenLog) LastSeen(players []int64, key string) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	var last int64
	for _, uid := range players {
		if t := h.users[uid][key]; t > last {
			last = t
		}
	}
	return last
}

// Mark records that the players were shown key.
func (h *seenLog) Mark(players []int64, key string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clock++
	for _, uid := range players {
		if uid <= 0 {
			continue
		}
		seen := h.users[uid]
		if seen == nil {
			seen = map[string]int64{}
			h.users[uid] = seen
		}
		seen[key] = h.clock
		if len(seen) > historyCap {
			oldest, oldestAt := "", h.clock
			for k, t := range seen {
				if t < oldestAt {
					oldest, oldestAt = k, t
				}
			}
			delete(seen, oldest)
		}
	}
}

// Reset clears the history (tests).
func (h *seenLog) Reset() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.users = map[int64]map[string]int64{}
	h.clock = 0
}
