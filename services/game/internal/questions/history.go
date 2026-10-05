package questions

import (
	"regexp"
	"sync"
	"sync/atomic"
)

// BuiltinSubjects are the subjects shipped with the app. Laravel sends the
// current list (built-in plus admin-added) with every bank sync.
var BuiltinSubjects = []string{"math", "science", "language", "social", "english", "civics"}

// Mix is the explicit "all subjects" choice sent by clients.
const Mix = "mix"

// subjectKey mirrors Laravel's Subject::KEY_PATTERN.
var subjectKey = regexp.MustCompile(`^[a-z][a-z0-9-]{1,29}$`)

var subjects atomic.Pointer[map[string]bool]

func init() { UseSubjects(BuiltinSubjects) }

// UseSubjects replaces the subjects players can pick. Invalid keys and "mix"
// are ignored; an empty list keeps the built-in subjects.
func UseSubjects(keys []string) {
	set := map[string]bool{}
	for _, k := range keys {
		if k != Mix && subjectKey.MatchString(k) {
			set[k] = true
		}
	}
	if len(set) == 0 {
		for _, k := range BuiltinSubjects {
			set[k] = true
		}
	}
	subjects.Store(&set)
}

// KnownSubject reports whether key is a subject players can pick now.
func KnownSubject(key string) bool { return (*subjects.Load())[key] }

// NormSubject returns a known subject or "" for the mix.
func NormSubject(s string) string {
	if KnownSubject(s) {
		return s
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
