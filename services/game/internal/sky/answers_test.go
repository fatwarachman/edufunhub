package sky

import (
	"testing"

	"edufunhub/game/internal/questions"
)

func TestResultListsBankAnswersOnlyForSkyQuiz(t *testing.T) {
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"only-sky","type":"choice","band":1,"subject":"science","prompt":{"id":"Soal langit"},"options":[{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"}],"answer":2,"games":["sky-quiz"]},
		{"key":"only-flag","type":"choice","band":1,"subject":"science","prompt":{"id":"Soal bendera"},"options":[{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"}],"answer":0,"games":["flag-quest"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	questions.Use(bank)
	defer questions.Use(nil)

	s := newSession(5)
	s.Start(t0)
	now := t0
	var res *Result
	for i := 0; i < Rounds; i++ {
		now = now.Add(RoundGap + MinTouch)
		option := answer(s)
		if i%2 == 1 {
			option = wrongOption(s)
		}
		_, r, err := s.Touch(option, now)
		if err != nil {
			t.Fatal(err)
		}
		if r != nil {
			res = r
		}
		if res != nil {
			break
		}
	}
	if res == nil {
		t.Fatal("flight should finish")
	}
	for _, a := range res.Answers {
		if a.Key != "only-sky" {
			t.Fatalf("unexpected bank key %q", a.Key)
		}
	}
	if len(res.Answers) > 1 {
		t.Fatalf("a bank question must not repeat in one flight: %+v", res.Answers)
	}
}
