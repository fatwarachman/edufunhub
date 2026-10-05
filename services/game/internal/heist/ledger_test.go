package heist

import (
	"math/rand/v2"
	"sync"
	"testing"
)

func TestLedgerStealAndShield(t *testing.T) {
	l := NewLedger()
	l.Reset([]int64{1, 2})
	l.Add(2, 1000)

	tr, ok := l.Steal(1, 2, 25)
	if !ok || tr.Blocked || tr.Amount != 250 || tr.AttackerGold != 250 || tr.TargetGold != 750 {
		t.Fatalf("steal: %+v %v", tr, ok)
	}
	l.Arm(2)
	tr, _ = l.Steal(1, 2, 25)
	if !tr.Blocked || tr.Amount != 0 || l.Gold(2) != 750 {
		t.Fatalf("shield did not block: %+v", tr)
	}
	if a, _ := l.Get(2); a.Shield {
		t.Fatal("shield did not break")
	}
	tr, _ = l.Swap(1, 2)
	if tr.Blocked || l.Gold(1) != 750 || l.Gold(2) != 250 || tr.Amount != 500 {
		t.Fatalf("swap: %+v gold %d/%d", tr, l.Gold(1), l.Gold(2))
	}
	if _, ok := l.Steal(1, 1, 10); ok {
		t.Fatal("self steal accepted")
	}
	if _, ok := l.Steal(1, 99, 10); ok {
		t.Fatal("unknown target accepted")
	}
	if _, ok := l.Steal(1, 2, 150); ok {
		t.Fatal("steal above 100% accepted")
	}
}

func TestLedgerBounds(t *testing.T) {
	l := NewLedger()
	l.Reset([]int64{1})
	if gold, applied, _ := l.Add(1, -50); gold != 0 || applied != 0 {
		t.Fatalf("negative balance: %d %d", gold, applied)
	}
	if gold, applied, _ := l.AddPercent(1, 10, PercentFloor(10)); gold != 20 || applied != 20 {
		t.Fatalf("percent floor: %d %d", gold, applied)
	}
	if gold, applied, _ := l.LosePercent(1, 50); gold != 10 || applied != -10 {
		t.Fatalf("bomb: %d %d", gold, applied)
	}
	l.Add(1, MaxGold*2)
	if l.Gold(1) != MaxGold {
		t.Fatalf("cap: %d", l.Gold(1))
	}
}

// TestLedgerConcurrentTransfers hammers steals and swaps between many
// accounts from many goroutines: the total never changes (transfers neither
// create nor destroy gold) and no balance is ever negative.
func TestLedgerConcurrentTransfers(t *testing.T) {
	const accounts, workers, ops = 20, 32, 4000
	l := NewLedger()
	ids := make([]int64, accounts)
	for i := range ids {
		ids[i] = int64(i + 1)
	}
	l.Reset(ids)
	for _, id := range ids {
		l.Add(id, 1000)
	}
	total := l.Total()
	var wg sync.WaitGroup
	for w := range workers {
		wg.Add(1)
		go func(seed uint64) {
			defer wg.Done()
			r := rand.New(rand.NewPCG(seed, seed))
			for range ops {
				a, b := ids[r.IntN(accounts)], ids[r.IntN(accounts)]
				switch r.IntN(4) {
				case 0:
					l.Swap(a, b)
				case 1:
					l.Arm(b)
				default:
					l.Steal(a, b, int64(10+r.IntN(16)))
				}
				if g := l.Gold(a); g < 0 {
					t.Errorf("negative balance %d", g)
				}
			}
		}(uint64(w + 1))
	}
	wg.Wait()
	if got := l.Total(); got != total {
		t.Fatalf("gold created or destroyed: %d -> %d", total, got)
	}
	for id, a := range l.Snapshot() {
		if a.Gold < 0 {
			t.Fatalf("account %d negative: %d", id, a.Gold)
		}
	}
}

// TestDoubleSpendSameVictim: many attackers steal 25% of one victim at the
// same time. Each steal reads the victim's balance inside the lock, so the
// victim keeps exactly 0.75^n of the gold (rounded per step), never less.
func TestDoubleSpendSameVictim(t *testing.T) {
	l := NewLedger()
	ids := []int64{1, 2, 3, 4, 5, 6, 7, 8, 9}
	l.Reset(ids)
	l.Add(1, 100000)
	var wg sync.WaitGroup
	for _, a := range ids[1:] {
		wg.Add(1)
		go func(a int64) {
			defer wg.Done()
			l.Steal(a, 1, 25)
		}(a)
	}
	wg.Wait()
	want := int64(100000)
	for range 8 {
		want -= want * 25 / 100
	}
	if got := l.Gold(1); got != want {
		t.Fatalf("victim keeps %d, want %d", got, want)
	}
	if l.Total() != 100000 {
		t.Fatalf("total changed: %d", l.Total())
	}
}

func TestOddsAndRoll(t *testing.T) {
	if oddsTotal != 100 {
		t.Fatalf("odds sum %d, want 100", oddsTotal)
	}
	r := rand.New(rand.NewPCG(7, 7))
	counts := map[string]int{}
	const n = 200000
	for range n {
		c := Roll(r, true)
		counts[c.Type]++
		switch c.Type {
		case ChestLoseGold, ChestSteal:
			if c.Value < 10 || c.Value > 25 {
				t.Fatalf("%s value %d outside 10-25%%", c.Type, c.Value)
			}
		case ChestBankrupt:
			if c.Value != 50 {
				t.Fatalf("bomb value %d", c.Value)
			}
		}
	}
	share := func(k string) float64 { return float64(counts[k]) * 100 / n }
	for k, want := range map[string]float64{ChestAddGold: 50, ChestLoseGold: 14, ChestShield: 10, ChestSteal: 15, ChestSwap: 7, ChestBankrupt: 4} {
		if got := share(k); got < want-1 || got > want+1 {
			t.Errorf("%s share %.2f%%, want ~%.0f%%", k, got, want)
		}
	}
	if share(ChestBankrupt) >= share(ChestShield) {
		t.Error("bankrupt bomb must be rare")
	}
	for range 2000 {
		if Roll(r, false).RequiresTarget() {
			t.Fatal("steal/swap rolled without rivals")
		}
	}
}
