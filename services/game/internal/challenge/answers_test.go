package challenge

import (
	"testing"

	"edufunhub/game/internal/questions"
)

func TestChallengeLogsOnlyBankAnswers(t *testing.T) {
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"tf-a","type":"true_false","band":1,"subject":"science","prompt":{"id":"A"},"answer":1,"games":["flag-quest"]},
		{"key":"tf-b","type":"true_false","band":1,"subject":"science","prompt":{"id":"B"},"answer":0,"games":["flag-quest"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	questions.Use(bank)
	defer questions.Use(nil)

	c := Start(TrueFalse, 0, 1, questions.NewFor("flag-quest", 5, 11), t0)
	bankAnswers := 0
	for i := 0; i < 6 && c.Phase == PhaseQuestion; i++ {
		fromBank := c.Question().FromBank
		key := c.Question().Key
		if _, err := c.Answer(correctValue(c), "id", t0); err != nil {
			t.Fatal(err)
		}
		if fromBank {
			bankAnswers++
			last := c.Answers[len(c.Answers)-1]
			if last.Key != key || !last.Correct {
				t.Fatalf("bad logged answer %+v", last)
			}
		}
	}
	if len(c.Answers) != bankAnswers {
		t.Fatalf("logged %d, expected %d bank answers", len(c.Answers), bankAnswers)
	}
}
