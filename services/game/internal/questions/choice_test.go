package questions

import (
	"encoding/json"
	"math/rand/v2"
	"strings"
	"testing"
)

func choiceQuestion() Question {
	return Question{
		Key:      "q-choice",
		Options:  []Text{same("A"), same("B"), same("C"), same("D"), same("E")},
		Answer:   2,
		FromBank: true,
	}
}

func TestShuffleTracksOriginalOrder(t *testing.T) {
	original := choiceQuestion()
	for seed := uint64(1); seed <= 50; seed++ {
		g := &Generator{Rand: rand.New(rand.NewPCG(seed, seed*7))}
		q := choiceQuestion()
		q.Options = append([]Text(nil), original.Options...)
		g.shuffle(&q)
		if len(q.Order) != len(q.Options) {
			t.Fatalf("order length %d, want %d", len(q.Order), len(q.Options))
		}
		for displayed, opt := range q.Options {
			if original.Options[q.Order[displayed]] != opt {
				t.Fatalf("seed %d: displayed %d maps to %d, text mismatch", seed, displayed, q.Order[displayed])
			}
		}
		if got := *q.Original(q.Answer); got != original.Answer {
			t.Fatalf("seed %d: correct maps to %d, want %d", seed, got, original.Answer)
		}
	}
}

func TestTrimAfterShuffleKeepsOriginalIndex(t *testing.T) {
	original := choiceQuestion()
	for seed := uint64(1); seed <= 50; seed++ {
		r := rand.New(rand.NewPCG(seed, 3))
		g := &Generator{Rand: r}
		q := choiceQuestion()
		q.Options = append([]Text(nil), original.Options...)
		g.shuffle(&q)
		trimmed := Trim(q, 3, r)
		if len(trimmed.Options) != 3 || len(trimmed.Order) != 3 {
			t.Fatalf("trim kept %d options / %d order", len(trimmed.Options), len(trimmed.Order))
		}
		for displayed, opt := range trimmed.Options {
			if original.Options[*trimmed.Original(displayed)] != opt {
				t.Fatalf("seed %d: trimmed option %d maps to wrong original", seed, displayed)
			}
		}
		if *trimmed.Original(trimmed.Answer) != original.Answer {
			t.Fatalf("seed %d: trimmed answer lost its original index", seed)
		}
	}
}

func TestTrimWithoutShuffleUsesIdentity(t *testing.T) {
	q := choiceQuestion()
	trimmed := Trim(q, 2, rand.New(rand.NewPCG(9, 9)))
	for displayed, opt := range trimmed.Options {
		if q.Options[*trimmed.Original(displayed)] != opt {
			t.Fatalf("option %d maps to wrong original", displayed)
		}
	}
}

func TestOriginalIsNilForGeneratedOrInvalid(t *testing.T) {
	q := choiceQuestion()
	q.FromBank = false
	if q.Original(0) != nil {
		t.Fatal("generated questions must not report a choice")
	}
	bank := choiceQuestion()
	if bank.Original(-1) != nil || bank.Original(len(bank.Options)) != nil {
		t.Fatal("out of range picks must not report a choice")
	}
	if bank.Picked(false, 1) != nil {
		t.Fatal("unanswered rounds must not report a choice")
	}
	if got := bank.Picked(true, 1); got == nil || *got != 1 {
		t.Fatal("identity mapping expected without order")
	}
	if *TruthChoice(true) != 1 || *TruthChoice(false) != 0 {
		t.Fatal("true/false choice must match bank answer encoding")
	}
}

func TestAnswerJSONOmitsNilChoice(t *testing.T) {
	raw, err := json.Marshal(Answer{Key: "k", Correct: false})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "choice") {
		t.Fatalf("nil choice must be omitted: %s", raw)
	}
	zero := 0
	raw, _ = json.Marshal(Answer{Key: "k", Correct: true, Choice: &zero})
	if !strings.Contains(string(raw), `"choice":0`) {
		t.Fatalf("zero choice must be sent: %s", raw)
	}
}
