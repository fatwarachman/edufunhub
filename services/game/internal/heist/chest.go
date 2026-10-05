package heist

import "math/rand/v2"

// Chest outcome types (shared with the client).
const (
	ChestAddGold  = "ADD_GOLD"
	ChestLoseGold = "LOSE_GOLD"
	ChestShield   = "SHIELD"
	ChestSteal    = "STEAL_PERCENT"
	ChestSwap     = "SWAP_GOLD"
	ChestBankrupt = "BANKRUPT_BOMB"
)

// Value units.
const (
	UnitFlat    = "flat"
	UnitPercent = "percent"
)

// BankruptPct is the share of gold a bankrupt bomb destroys.
const BankruptPct = 50

// Chest is the content of one mystery chest. Rolled by the server before
// the player picks; the client only learns it after picking.
type Chest struct {
	Type  string `json:"type"`
	Value int64  `json:"value"`
	Unit  string `json:"unit"`
}

// RequiresTarget reports whether the player must pick a rival next.
func (c Chest) RequiresTarget() bool { return c.Type == ChestSteal || c.Type == ChestSwap }

func (c Chest) view() Message {
	return Message{"type": c.Type, "value": c.Value, "unit": c.Unit, "requires_target": c.RequiresTarget()}
}

// weighted is one row of a probability table (weights are relative).
type weighted struct {
	weight int
	chest  Chest
}

// Odds is the chest table. Weights sum to 100, so each weight reads as a
// percentage. Gains are frequent (50%), setbacks rarer (LOSE 14%, bomb 4%),
// with shields, steals and swaps in between. Expected gold stays positive so
// answering correctly is always worth it.
var Odds = []weighted{
	{12, Chest{ChestAddGold, 50, UnitFlat}},
	{12, Chest{ChestAddGold, 100, UnitFlat}},
	{8, Chest{ChestAddGold, 250, UnitFlat}},
	{8, Chest{ChestAddGold, 10, UnitPercent}},
	{6, Chest{ChestAddGold, 25, UnitPercent}},
	{4, Chest{ChestAddGold, 50, UnitPercent}},
	{4, Chest{ChestLoseGold, 10, UnitPercent}},
	{4, Chest{ChestLoseGold, 15, UnitPercent}},
	{3, Chest{ChestLoseGold, 20, UnitPercent}},
	{3, Chest{ChestLoseGold, 25, UnitPercent}},
	{10, Chest{ChestShield, 1, UnitFlat}},
	{4, Chest{ChestSteal, 10, UnitPercent}},
	{4, Chest{ChestSteal, 15, UnitPercent}},
	{4, Chest{ChestSteal, 20, UnitPercent}},
	{3, Chest{ChestSteal, 25, UnitPercent}},
	{7, Chest{ChestSwap, 100, UnitPercent}},
	{4, Chest{ChestBankrupt, BankruptPct, UnitPercent}},
}

var oddsTotal = func() int {
	n := 0
	for _, w := range Odds {
		n += w.weight
	}
	return n
}()

// noTarget replaces a steal or swap when there is no rival to target.
var noTarget = Chest{ChestAddGold, 100, UnitFlat}

// Roll draws one chest. Without rivals (canTarget false) steals and swaps
// become a flat gold gain so the chest is never a dead end.
func Roll(r *rand.Rand, canTarget bool) Chest {
	n := r.IntN(oddsTotal)
	for _, w := range Odds {
		if n < w.weight {
			if !canTarget && w.chest.RequiresTarget() {
				return noTarget
			}
			return w.chest
		}
		n -= w.weight
	}
	return Odds[len(Odds)-1].chest
}

// RollChests fills the three chests offered after a correct answer.
func RollChests(r *rand.Rand, canTarget bool) [Chests]Chest {
	var out [Chests]Chest
	for i := range out {
		out[i] = Roll(r, canTarget)
	}
	return out
}

// PercentFloor is the minimum gain of a percentage chest, so a +10% chest
// is still worth something at 0 gold.
func PercentFloor(pct int64) int64 { return pct * 2 }
