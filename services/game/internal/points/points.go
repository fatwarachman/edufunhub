// Package points holds the portal point rules shared by every Go game.
//
// Guide (super admin setting, synced from Laravel together with the bank):
//   - A correct answer earns the question's points: PerCorrect (10) for a
//     normal question, more for questions the admin marked as bonus.
//   - A wrong answer earns nothing and never takes points away.
//   - A draw earns the Draw bonus (0 by default: no extra points).
//   - A win earns the Win bonus. Every finished game also pays Participation.
package points

import "sync/atomic"

const (
	// MinAnswersForAbandon is how many answers a game left early needs before
	// it still pays out (stops create/leave farming).
	MinAnswersForAbandon = 3

	// Upper bounds of the admin settings; award caps are derived from them.
	MaxPerQuestion   = 100
	MaxBonus         = 100
	MaxParticipation = 50
)

// Rules are the admin-configurable point values.
type Rules struct {
	PerCorrect    int `json:"per_correct"`
	Win           int `json:"win"`
	Draw          int `json:"draw"`
	Participation int `json:"participation"`
}

// Defaults apply until Laravel sends rules.
var Defaults = Rules{PerCorrect: 10, Win: 20, Draw: 0, Participation: 5}

var current atomic.Pointer[Rules]

// Current returns the active rules.
func Current() Rules {
	if r := current.Load(); r != nil {
		return *r
	}
	return Defaults
}

// Use activates rules, clamped to the admin bounds. Use(nil) restores defaults.
func Use(r *Rules) {
	if r == nil {
		current.Store(nil)
		return
	}
	clean := Rules{
		PerCorrect:    clamp(r.PerCorrect, 1, MaxPerQuestion),
		Win:           clamp(r.Win, 0, MaxBonus),
		Draw:          clamp(r.Draw, 0, MaxBonus),
		Participation: clamp(r.Participation, 0, MaxParticipation),
	}
	current.Store(&clean)
}

func clamp(v, lo, hi int) int { return max(lo, min(v, hi)) }

// Question returns what one correct answer is worth: the question's own
// points when the admin set them (bonus questions), else PerCorrect.
func Question(own int) int {
	if own > 0 {
		return min(own, MaxPerQuestion)
	}
	return Current().PerCorrect
}

// Outcome adds the win or draw bonus to the points earned from answers.
func Outcome(earned int, won, draw bool) int {
	r := Current()
	switch {
	case won:
		return earned + r.Win
	case draw:
		return earned + r.Draw
	}
	return earned
}

// Cap is the most a game with n questions can award (all bonus questions,
// a win, participation). Laravel validates results against the same bound.
func Cap(n int) int { return n*MaxPerQuestion + MaxBonus + MaxParticipation }

// Finished returns the award for a completed game: participation plus what
// the player achieved, capped at max.
func Finished(achieved, max int) int {
	return min(Current().Participation+achieved, max)
}

// Abandoned returns the award for a game left early: participation plus what
// was achieved, but nothing unless the player answered enough to have really
// played.
func Abandoned(achieved, answered, max int) int {
	if answered < MinAnswersForAbandon {
		return 0
	}
	return Finished(achieved, max)
}
