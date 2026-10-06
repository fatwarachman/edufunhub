package questions

import (
	"fmt"
	"strings"
	"testing"

	"edufunhub/game/internal/points"
)

func testBank(t *testing.T, n int) {
	t.Helper()
	var items []string
	for i := 0; i < n; i++ {
		subject := []string{"science", "social"}[i%2]
		pts := 0
		if i == 0 {
			pts = 25
		}
		items = append(items, fmt.Sprintf(`{"key":"q%d","type":"choice","band":1,"subject":%q,"prompt":{"id":"Soal %d"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz"],"points":%d}`, i, subject, i, pts))
	}
	bank, err := Parse([]byte(`{"version":"t","points":{"per_correct":12,"win":30,"draw":0,"participation":5},"questions":[` + strings.Join(items, ",") + `]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	History.Reset()
	t.Cleanup(func() { Use(nil); points.Use(nil); History.Reset() })
}

func TestSubjectFilterAndMix(t *testing.T) {
	testBank(t, 10)
	g := NewFor("sky-quiz", 5, 7).For("social", 1)
	for i := 0; i < 5; i++ {
		if q := g.Choice(); q.Subject != "social" || !q.FromBank {
			t.Fatalf("social game drew %q (bank %v)", q.Subject, q.FromBank)
		}
	}
	// A subject the game has no questions for borrows the subject's
	// questions from the built-in bank instead of generating arithmetic.
	g = NewFor("sky-quiz", 5, 7).For("civics", 1)
	for i := 0; i < 12; i++ {
		if q := g.Choice(); q.Subject != "civics" || !q.FromBank || g.Fallback() {
			t.Fatalf("civics game drew %q (bank %v, fallback %v)", q.Subject, q.FromBank, g.Fallback())
		}
	}
	// A subject without questions anywhere falls back to the mix.
	UseSubjects(append([]string{"music"}, BuiltinSubjects...))
	t.Cleanup(func() { UseSubjects(BuiltinSubjects) })
	g = NewFor("sky-quiz", 5, 7).For("music", 1)
	if q := g.Choice(); !q.FromBank || !g.Fallback() {
		t.Fatal("empty subject must fall back to the bank mix and say so")
	}
	if g := NewFor("sky-quiz", 5, 7).For("social", 1); g.Choice().Subject != "social" || g.Fallback() {
		t.Fatal("a subject with questions is not a fallback")
	}
	if NormSubject(Mix) != "" || NormSubject("hack") != "" || NormSubject("english") != "english" {
		t.Fatal("subject normalisation")
	}
}

func TestNextGameStartsWithUnseenQuestions(t *testing.T) {
	testBank(t, 10)
	first := map[string]bool{}
	g := NewFor("sky-quiz", 5, 1).For("science", 42)
	for i := 0; i < 3; i++ {
		first[g.Choice().Key] = true
	}
	g = NewFor("sky-quiz", 5, 1).For("science", 42) // same seed on purpose
	for i := 0; i < 2; i++ {
		if k := g.Choice().Key; first[k] {
			t.Fatalf("question %s repeated although unseen ones remain", k)
		}
	}
	// Another player has no history and may see anything.
	if NewFor("sky-quiz", 5, 1).For("science", 7).Choice().Key == "" {
		t.Fatal("expected a question")
	}
}

func TestOrderDiffersBetweenGames(t *testing.T) {
	testBank(t, 12)
	order := func() string {
		g := NewFor("sky-quiz", 5, 99).For("social", 5)
		var keys []string
		for i := 0; i < 3; i++ {
			keys = append(keys, g.Choice().Key)
		}
		return strings.Join(keys, ",")
	}
	if a, b := order(), order(); a == b {
		t.Fatalf("two games in a row got the same order %s", a)
	}
}

func TestBankPointsAndRules(t *testing.T) {
	testBank(t, 2)
	if r := points.Current(); r.PerCorrect != 12 || r.Win != 30 {
		t.Fatalf("rules not applied: %+v", r)
	}
	g := NewFor("sky-quiz", 5, 3).For("science", 9)
	q := g.Choice()
	if q.Key != "q0" || q.Worth() != 25 {
		t.Fatalf("bonus question worth %d", q.Worth())
	}
	if (Question{Points: 0}).Worth() != 12 {
		t.Fatal("normal question uses per_correct")
	}
	if _, err := Parse([]byte(`{"questions":[{"key":"x","type":"choice","band":0,"prompt":{"id":"x"},"options":[{"id":"1"},{"id":"2"},{"id":"3"}],"answer":0,"points":500}]}`)); err == nil {
		t.Fatal("points above the cap must be rejected")
	}
}

func TestSubjectsFollowTheSyncedList(t *testing.T) {
	t.Cleanup(func() { UseSubjects(BuiltinSubjects) })
	if NormSubject("music") != "" {
		t.Fatal("unknown subject must be the mix")
	}
	body := []byte(`{"version":"v-subjects","subjects":["math","music","mix","BAD key"],"questions":[{"key":"m1","type":"choice","band":1,"subject":"music","prompt":{"id":"Not do?","en":""},"options":[{"id":"do"},{"id":"re"},{"id":"mi"}],"answer":0,"games":["sky-quiz"]}]}`)
	if _, err := Parse(body); err != nil {
		t.Fatal(err)
	}
	if NormSubject("music") != "music" || NormSubject("math") != "math" {
		t.Fatal("synced subjects must be pickable")
	}
	if NormSubject("science") != "" || NormSubject("mix") != "" || NormSubject("BAD key") != "" {
		t.Fatal("subjects outside the synced list, mix and invalid keys are the mix")
	}
	UseSubjects(nil)
	if NormSubject("science") != "science" {
		t.Fatal("an empty list restores the built-in subjects")
	}
}

func TestSubjectNeverTurnsIntoArithmetic(t *testing.T) {
	// The game pool only holds English for grade 1 (like the live
	// snakes-and-ladders bank); other subjects and grades must still be
	// asked from the bank, not as generated math.
	bank, err := Parse([]byte(`{"version":"t","questions":[
		{"key":"en1","type":"choice","band":0,"subject":"english","prompt":{"id":"A"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["snakes-and-ladders"]},
		{"key":"so1","type":"choice","band":1,"subject":"social","prompt":{"id":"B"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["sky-quiz"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	History.Reset()
	t.Cleanup(func() { Use(nil); History.Reset() })
	for _, c := range []struct {
		subject string
		grade   int
	}{{"social", 5}, {"science", 5}, {"science", 8}, {"english", 1}} {
		g := NewFor("snakes-and-ladders", c.grade, 3).For(c.subject, 1)
		for i := 0; i < 25; i++ {
			if q := g.Choice(); q.Subject != c.subject || !q.FromBank {
				t.Fatalf("%s grade %d drew %q (bank %v) at question %d", c.subject, c.grade, q.Subject, q.FromBank, i)
			}
		}
	}
	g := NewFor("snakes-and-ladders", 5, 3).For("mix", 1)
	bankDrawn := 0
	for i := 0; i < 40; i++ {
		if g.Choice().FromBank {
			bankDrawn++
		}
	}
	if bankDrawn != 1 {
		t.Fatalf("mix with an empty game pool must still ask the bank question once: %d/40", bankDrawn)
	}
}
