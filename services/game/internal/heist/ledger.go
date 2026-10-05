package heist

import "sync"

// Account is one player's balance and shield slot.
type Account struct {
	Gold   int64 `json:"gold"`
	Shield bool  `json:"has_shield"`
}

// Transfer is the outcome of a steal or swap.
type Transfer struct {
	// Blocked is true when the target's shield absorbed the attack (the
	// shield breaks, no gold moves).
	Blocked bool
	// Amount is the gold that moved to the attacker (steal) or the
	// attacker's net gain (swap, may be negative).
	Amount int64
	// Gold balances after the transfer.
	AttackerGold int64
	TargetGold   int64
}

// Ledger is the in-memory gold and shield book of one room. Every method
// takes the mutex for the whole read-check-write, so concurrent steals,
// swaps and chest payouts are atomic: balances never go below zero or above
// MaxGold, and transfers never create or destroy gold (except when a
// receiver is capped at MaxGold, where the excess stays with the sender).
type Ledger struct {
	mu       sync.Mutex
	accounts map[int64]*Account
}

// NewLedger creates an empty ledger.
func NewLedger() *Ledger { return &Ledger{accounts: map[int64]*Account{}} }

// Open creates a zero balance account (no-op when it exists).
func (l *Ledger) Open(id int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.accounts[id] == nil {
		l.accounts[id] = &Account{}
	}
}

// Reset zeroes every account and drops the ones not listed.
func (l *Ledger) Reset(ids []int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.accounts = make(map[int64]*Account, len(ids))
	for _, id := range ids {
		l.accounts[id] = &Account{}
	}
}

// Get returns a copy of an account.
func (l *Ledger) Get(id int64) (Account, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.accounts[id]
	if a == nil {
		return Account{}, false
	}
	return *a, true
}

// Gold returns a balance (0 for unknown accounts).
func (l *Ledger) Gold(id int64) int64 {
	a, _ := l.Get(id)
	return a.Gold
}

// Snapshot copies every account.
func (l *Ledger) Snapshot() map[int64]Account {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make(map[int64]Account, len(l.accounts))
	for id, a := range l.accounts {
		out[id] = *a
	}
	return out
}

// Total is the sum of all balances.
func (l *Ledger) Total() int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	var sum int64
	for _, a := range l.accounts {
		sum += a.Gold
	}
	return sum
}

func clampGold(v int64) int64 { return max(0, min(v, MaxGold)) }

// Add changes a balance by delta, bounded to [0, MaxGold]. It returns the
// new balance and the delta actually applied.
func (l *Ledger) Add(id int64, delta int64) (gold, applied int64, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.accounts[id]
	if a == nil {
		return 0, 0, false
	}
	next := clampGold(a.Gold + delta)
	applied, a.Gold = next-a.Gold, next
	return a.Gold, applied, true
}

// AddPercent adds pct percent of the current balance, at least floor gold
// (so a gain chest is never worth nothing at the start of the game).
func (l *Ledger) AddPercent(id int64, pct, floor int64) (gold, applied int64, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.accounts[id]
	if a == nil {
		return 0, 0, false
	}
	gain := max(a.Gold*pct/100, floor)
	next := clampGold(a.Gold + gain)
	applied, a.Gold = next-a.Gold, next
	return a.Gold, applied, true
}

// LosePercent removes pct percent of the current balance (rounded down).
func (l *Ledger) LosePercent(id int64, pct int64) (gold, applied int64, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.accounts[id]
	if a == nil {
		return 0, 0, false
	}
	loss := a.Gold * pct / 100
	a.Gold -= loss
	return a.Gold, -loss, true
}

// Arm activates the shield slot. It reports false when the account is
// unknown; arming an active shield keeps the single slot.
func (l *Ledger) Arm(id int64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.accounts[id]
	if a == nil {
		return false
	}
	a.Shield = true
	return true
}

// Steal moves pct percent of the target's balance to the attacker. A shield
// on the target blocks the attack and breaks.
func (l *Ledger) Steal(attacker, target int64, pct int64) (Transfer, bool) {
	if attacker == target || pct <= 0 || pct > 100 {
		return Transfer{}, false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	a, t := l.accounts[attacker], l.accounts[target]
	if a == nil || t == nil {
		return Transfer{}, false
	}
	if t.Shield {
		t.Shield = false
		return Transfer{Blocked: true, AttackerGold: a.Gold, TargetGold: t.Gold}, true
	}
	amount := min(t.Gold*pct/100, MaxGold-a.Gold)
	t.Gold -= amount
	a.Gold += amount
	return Transfer{Amount: amount, AttackerGold: a.Gold, TargetGold: t.Gold}, true
}

// Swap exchanges both balances. A shield on the target blocks it and breaks.
func (l *Ledger) Swap(attacker, target int64) (Transfer, bool) {
	if attacker == target {
		return Transfer{}, false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	a, t := l.accounts[attacker], l.accounts[target]
	if a == nil || t == nil {
		return Transfer{}, false
	}
	if t.Shield {
		t.Shield = false
		return Transfer{Blocked: true, AttackerGold: a.Gold, TargetGold: t.Gold}, true
	}
	gain := t.Gold - a.Gold
	a.Gold, t.Gold = t.Gold, a.Gold
	return Transfer{Amount: gain, AttackerGold: a.Gold, TargetGold: t.Gold}, true
}
