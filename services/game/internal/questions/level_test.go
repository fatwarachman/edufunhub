package questions

import (
	"testing"

	"edufunhub/game/internal/points"
)

func levelBank(t *testing.T) {
	t.Helper()
	items := []Item{}
	for level := 1; level <= 3; level++ {
		for i := 0; i < 4; i++ {
			items = append(items, Item{
				Key: "lv" + string(rune('0'+level)) + "-" + string(rune('a'+i)), Type: TypeChoice, Band: 1, Subject: "science",
				Prompt: Text{ID: "Q"}, Options: []Text{{ID: "a"}, {ID: "b"}, {ID: "c"}}, Answer: 0,
				Games: []string{"sky-quiz"}, Level: level,
			})
		}
	}
	Use(&Bank{Version: "levels", items: items})
	t.Cleanup(func() { Use(nil) })
}

func TestGeneratorPrefersThePlayersLevel(t *testing.T) {
	levelBank(t)
	for _, level := range []int{1, 2, 3} {
		g := NewFor("sky-quiz", 5, 42).For("science").AtLevel(level)
		for i := 0; i < 4; i++ {
			q := g.Choice()
			if q.Level != level {
				t.Fatalf("level %d got a level %d question", level, q.Level)
			}
		}
	}
}

func TestHarderLevelsPayMore(t *testing.T) {
	per := points.Current().PerCorrect
	cases := map[int]int{0: per, 1: per, 2: 2 * per, 3: 3 * per, 9: per}
	for level, want := range cases {
		if got := (Question{Level: level}).Worth(); got != want {
			t.Fatalf("level %d worth %d, want %d", level, got, want)
		}
	}
	if got := (Question{Level: 3, Points: 40}).Worth(); got != 120 {
		t.Fatalf("expert bonus question worth %d, want 120", got)
	}
}

func TestMissingLevelFallsBackToNearest(t *testing.T) {
	Use(&Bank{Version: "easy-only", items: []Item{{Key: "e1", Type: TypeChoice, Band: 1, Subject: "science", Prompt: Text{ID: "Q"}, Options: []Text{{ID: "a"}, {ID: "b"}, {ID: "c"}}, Games: []string{"sky-quiz"}}}})
	t.Cleanup(func() { Use(nil) })
	q := NewFor("sky-quiz", 5, 1).For("science").AtLevel(3).Choice()
	if q.Key != "e1" || q.Level != 1 || q.Worth() != points.Current().PerCorrect {
		t.Fatalf("fallback question %+v worth %d", q, q.Worth())
	}
}

func TestValidateRejectsUnknownLevel(t *testing.T) {
	bad := []Item{{Key: "x", Type: TypeChoice, Prompt: Text{ID: "Q"}, Options: []Text{{ID: "a"}, {ID: "b"}, {ID: "c"}}, Level: 4}}
	if err := Validate(bad); err == nil {
		t.Fatal("level 4 accepted")
	}
}
