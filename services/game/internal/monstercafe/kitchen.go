package monstercafe

import (
	"math/rand/v2"
	"slices"
	"time"
)

// Ingredients (contract enum strings).
const (
	Bun       = "BUN"
	Patty     = "PATTY"
	Cheese    = "CHEESE"
	Lettuce   = "LETTUCE"
	Tomato    = "TOMATO"
	Sauce     = "SAUCE"
	Dough     = "DOUGH"
	Mushroom  = "MUSHROOM"
	Pepperoni = "PEPPERONI"
	Olive     = "OLIVE"
)

// Ingredients is the pantry in contract order.
var Ingredients = []string{Bun, Patty, Cheese, Lettuce, Tomato, Sauce, Dough, Mushroom, Pepperoni, Olive}

// Dishes.
const (
	DishBurger = "BURGER"
	DishPizza  = "PIZZA"
	DishMess   = "MESS"
)

// Monsters are the customers.
var Monsters = []string{"SLIME", "CYCLOPS", "VAMPIRE", "YETI", "DRAGON", "GHOST"}

// Moods by remaining patience.
const (
	MoodHappy     = "HAPPY"
	MoodImpatient = "IMPATIENT"
	MoodAngry     = "ANGRY"
)

// Oven states.
const (
	OvenEmpty   = "EMPTY"
	OvenCooking = "COOKING"
	OvenReady   = "READY"
	OvenBurnt   = "BURNT"
)

// Order failure reasons.
const (
	FailAngry = "ANGRY"
	FailWrong = "WRONG_DISH"
)

// Feed kinds.
const (
	KindServed = "SERVED"
	KindAngry  = "ANGRY"
	KindBurnt  = "BURNT"
	KindRat    = "RAT"
	KindPie    = "PIE"
)

// recipeBook holds each dish's fixed base and its optional extras.
var recipeBook = map[string]struct{ base, extras []string }{
	DishBurger: {[]string{Bun, Patty}, []string{Cheese, Lettuce, Tomato, Sauce}},
	DishPizza:  {[]string{Dough, Sauce}, []string{Cheese, Mushroom, Pepperoni, Olive}},
}

// ValidIngredient reports whether s is a pantry ingredient.
func ValidIngredient(s string) bool { return slices.Contains(Ingredients, s) }

// NewRecipe builds a recipe of dish with extras toppings (1–4, no duplicates).
func NewRecipe(rng *rand.Rand, dish string, extras int) []string {
	book := recipeBook[dish]
	pool := slices.Clone(book.extras)
	rng.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	extras = max(1, min(extras, len(pool)))
	return append(slices.Clone(book.base), pool[:extras]...)
}

// DishOf infers what an oven makes of the plate: a bun makes a burger, a
// dough makes a pizza, anything else is a mess.
func DishOf(items []string) string {
	switch {
	case slices.Contains(items, Bun):
		return DishBurger
	case slices.Contains(items, Dough):
		return DishPizza
	}
	return DishMess
}

// SameItems compares two ingredient lists as multisets.
func SameItems(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	count := map[string]int{}
	for _, x := range a {
		count[x]++
	}
	for _, x := range b {
		count[x]--
		if count[x] < 0 {
			return false
		}
	}
	return true
}

// MoodOf grades remaining patience: >50% happy, 20–50% impatient, <20% angry.
func MoodOf(left, total time.Duration) string {
	if total <= 0 {
		return MoodAngry
	}
	switch pct := float64(left) / float64(total); {
	case pct > 0.5:
		return MoodHappy
	case pct >= 0.2:
		return MoodImpatient
	}
	return MoodAngry
}

// Tip pays up to MaxTip linearly by the patience still left.
func Tip(left, total time.Duration) int {
	if total <= 0 || left <= 0 {
		return 0
	}
	return int(int64(MaxTip) * int64(min(left, total)) / int64(total))
}

// Order is one monster waiting for its dish.
type Order struct {
	ID       string
	Monster  string
	Dish     string
	Recipe   []string
	Total    time.Duration
	Deadline time.Time
}

// Oven holds a cooking, ready or burnt dish.
type Oven struct {
	State   string
	Dish    string
	Items   []string
	ReadyAt time.Time
	BurnAt  time.Time
}

// Held is a dish taken out of the oven.
type Held struct {
	Dish  string
	Items []string
}

// removeOne deletes one x from s (reports false when absent).
func removeOne(s []string, x string) ([]string, bool) {
	i := slices.Index(s, x)
	if i < 0 {
		return s, false
	}
	return slices.Delete(s, i, i+1), true
}

// list copies s for a message (never null, never shared with room state).
func list(s []string) []string {
	if len(s) == 0 {
		return []string{}
	}
	return slices.Clone(s)
}
