package questions

import (
	"math/rand/v2"
	"testing"
)

func optionSignature(q Question) string {
	return q.arrangement().signature
}

func TestPresentRepeatedQuestionChangesAnswerPosition(t *testing.T) {
	for seed := uint64(1); seed <= 100; seed++ {
		g := &Generator{Rand: rand.New(rand.NewPCG(seed, seed^5))}
		original := choiceQuestion()
		positions := map[int]bool{}
		signatures := map[string]bool{}
		last := -1
		for showing := 0; showing < 4; showing++ {
			q := g.Present(choiceQuestion(), 4)
			if len(q.Options) != 4 {
				t.Fatalf("seed %d: kept %d options, want 4", seed, len(q.Options))
			}
			if q.Answer == last {
				t.Fatalf("seed %d showing %d: answer stayed at position %d", seed, showing, q.Answer)
			}
			if positions[q.Answer] {
				t.Fatalf("seed %d showing %d: answer position %d reused before all positions were used", seed, showing, q.Answer)
			}
			sig := optionSignature(q)
			if signatures[sig] {
				t.Fatalf("seed %d showing %d: option order repeated", seed, showing)
			}
			if q.Options[q.Answer] != original.Options[original.Answer] {
				t.Fatalf("seed %d: answer index points to the wrong option", seed)
			}
			if *q.Original(q.Answer) != original.Answer {
				t.Fatalf("seed %d: answer lost its original bank index", seed)
			}
			for displayed, opt := range q.Options {
				if original.Options[*q.Original(displayed)] != opt {
					t.Fatalf("seed %d: displayed %d maps to the wrong original", seed, displayed)
				}
			}
			positions[q.Answer], signatures[sig], last = true, true, q.Answer
		}
	}
}

func TestPresentAfterFourShowingsStillMovesAnswer(t *testing.T) {
	g := &Generator{Rand: rand.New(rand.NewPCG(7, 7))}
	last := -1
	for showing := 0; showing < 10; showing++ {
		q := g.Present(choiceQuestion(), 4)
		if q.Answer == last {
			t.Fatalf("showing %d: answer stayed at position %d", showing, q.Answer)
		}
		last = q.Answer
	}
}

func TestPresentTwoOptionsAlternate(t *testing.T) {
	g := &Generator{Rand: rand.New(rand.NewPCG(3, 3))}
	base := Question{Key: "pair", Options: []Text{same("Yes"), same("No")}, Answer: 0, FromBank: true}
	last := -1
	for showing := 0; showing < 6; showing++ {
		q := g.Present(base, 0)
		if q.Answer == last {
			t.Fatalf("showing %d: answer stayed at position %d", showing, q.Answer)
		}
		last = q.Answer
	}
}

func TestPresentTracksQuestionsSeparately(t *testing.T) {
	g := &Generator{Rand: rand.New(rand.NewPCG(11, 11))}
	first := g.Present(choiceQuestion(), 0)
	other := choiceQuestion()
	other.Key = "q-other"
	if q := g.Present(other, 0); len(g.shown) != 2 || len(q.Options) != 5 {
		t.Fatalf("distinct questions must be tracked separately")
	}
	again := g.Present(choiceQuestion(), 0)
	if again.Answer == first.Answer {
		t.Fatalf("repeat must move the answer away from %d", first.Answer)
	}
}

func TestPresentDoesNotMutateInput(t *testing.T) {
	g := &Generator{Rand: rand.New(rand.NewPCG(5, 5))}
	base := choiceQuestion()
	g.Present(base, 0)
	g.Present(base, 0)
	if base.Options[0] != same("A") || base.Order != nil || base.Answer != 2 {
		t.Fatalf("Present must not modify the caller's question")
	}
}

func TestPresentSingleOptionUnchanged(t *testing.T) {
	g := &Generator{Rand: rand.New(rand.NewPCG(1, 1))}
	q := g.Present(Question{Key: "solo", Options: []Text{same("A")}}, 4)
	if len(q.Options) != 1 || q.Answer != 0 {
		t.Fatalf("single option question must pass through")
	}
}
