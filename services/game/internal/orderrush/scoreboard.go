package orderrush

import (
	"math/rand/v2"
	"sync"
	"time"
)

// Account is one player's competitive state.
type Account struct {
	Score     int64
	Streak    int
	Best      int
	Shield    bool
	Inventory []string
	// FrozenUntil blocks submissions; TangledUntil scrambles the pool.
	FrozenUntil  time.Time
	TangledUntil time.Time
}

// Attack is the outcome of a sabotage power-up.
type Attack struct {
	Type     string
	Blocked  bool
	Duration time.Duration
	// Remaining is the attacker's inventory after the use.
	Remaining []string
}

// Scoreboard keeps scores, streaks, shields, inventories and sabotage
// effects behind one mutex. Every operation that reads and changes two
// accounts (a power-up against a rival) does so in one critical section, so
// two simultaneous attacks can never both pass one shield, and a power-up
// can never be spent twice.
type Scoreboard struct {
	mu       sync.Mutex
	accounts map[int64]*Account
}

// NewScoreboard creates an empty scoreboard.
func NewScoreboard() *Scoreboard { return &Scoreboard{accounts: map[int64]*Account{}} }

// Reset starts a new game for the given players.
func (s *Scoreboard) Reset(ids []int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.accounts = make(map[int64]*Account, len(ids))
	for _, id := range ids {
		s.accounts[id] = &Account{}
	}
}

// Open adds a player (late joiner) with an empty account.
func (s *Scoreboard) Open(id int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.accounts[id] == nil {
		s.accounts[id] = &Account{}
	}
}

// Get returns a copy of one account.
func (s *Scoreboard) Get(id int64) (Account, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.accounts[id]
	if a == nil {
		return Account{}, false
	}
	return clone(a), true
}

// Snapshot returns a copy of every account.
func (s *Scoreboard) Snapshot() map[int64]Account {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[int64]Account, len(s.accounts))
	for id, a := range s.accounts {
		out[id] = clone(a)
	}
	return out
}

func clone(a *Account) Account {
	c := *a
	c.Inventory = append([]string(nil), a.Inventory...)
	return c
}

// Frozen reports whether the player's input is blocked at now.
func (s *Scoreboard) Frozen(id int64, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.accounts[id]
	return a != nil && now.Before(a.FrozenUntil)
}

// Correct adds a solved module: score, streak and, every ComboEvery in a
// row, a random power-up (when the inventory has room). It returns the
// updated account and the granted power-up ("" when none).
func (s *Scoreboard) Correct(id int64, earned int64, rng *rand.Rand) (Account, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.accounts[id]
	if a == nil {
		return Account{}, ""
	}
	a.Score += earned
	a.Streak++
	a.Best = max(a.Best, a.Streak)
	granted := ""
	if a.Streak%ComboEvery == 0 && len(a.Inventory) < MaxInventory {
		granted = PowerUps[rng.IntN(len(PowerUps))]
		a.Inventory = append(a.Inventory, granted)
	}
	return clone(a), granted
}

// Wrong breaks the streak.
func (s *Scoreboard) Wrong(id int64) Account {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.accounts[id]
	if a == nil {
		return Account{}
	}
	a.Streak = 0
	return clone(a)
}

// take removes one power-up of the given type from a's inventory.
func take(a *Account, kind string) bool {
	for i, p := range a.Inventory {
		if p == kind {
			a.Inventory = append(a.Inventory[:i:i], a.Inventory[i+1:]...)
			return true
		}
	}
	return false
}

// ArmShield spends a SHIELD power-up of id.
func (s *Scoreboard) ArmShield(id int64) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.accounts[id]
	if a == nil {
		return Account{}, ErrNoRoom
	}
	if a.Shield {
		return clone(a), ErrShieldReady
	}
	if !take(a, PowerShield) {
		return clone(a), ErrNoPowerUp
	}
	a.Shield = true
	return clone(a), nil
}

// Sabotage spends a TANGLE or FREEZE power-up of attacker against target.
// A shield on the target absorbs the attack and breaks; otherwise the effect
// runs until now + duration (a running effect of the same type is extended,
// not stacked).
func (s *Scoreboard) Sabotage(attacker, target int64, kind string, duration time.Duration, now time.Time) (Attack, error) {
	if kind != PowerTangle && kind != PowerFreeze {
		return Attack{}, ErrPowerUp
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	a, t := s.accounts[attacker], s.accounts[target]
	if a == nil || t == nil || attacker == target {
		return Attack{}, ErrTarget
	}
	if !take(a, kind) {
		return Attack{}, ErrNoPowerUp
	}
	res := Attack{Type: kind, Duration: duration}
	if t.Shield {
		t.Shield = false
		res.Blocked = true
	} else {
		until := now.Add(duration)
		if kind == PowerFreeze {
			t.FrozenUntil = maxTime(t.FrozenUntil, until)
		} else {
			t.TangledUntil = maxTime(t.TangledUntil, until)
		}
	}
	res.Remaining = append([]string(nil), a.Inventory...)
	return res, nil
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// SpeedScore returns the extra score for solving a module in d: SpeedBonus
// at 0 s falling linearly to 0 at SpeedWindow.
func SpeedScore(d time.Duration) int64 {
	if d < 0 {
		d = 0
	}
	if d >= SpeedWindow {
		return 0
	}
	return int64(SpeedBonus) * int64(SpeedWindow-d) / int64(SpeedWindow)
}
