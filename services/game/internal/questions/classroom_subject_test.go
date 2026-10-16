package questions

import (
	"strings"
	"testing"
)

// classroomSubjectBank has science and math questions for grade 5 and an
// English one only for grade 10, plus classroom 7 whose sky-quiz is locked
// to science and whose flag-quest is mixed.
const classroomSubjectBank = `{"version":"v-classroom","subjects":["math","science","english"],"questions":[
	{"key":"sci-1","type":"choice","band":1,"grades":[5],"subject":"science","prompt":{"id":"IPA 1"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz","flag-quest"]},
	{"key":"sci-2","type":"choice","band":1,"grades":[5],"subject":"science","prompt":{"id":"IPA 2"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz","flag-quest"]},
	{"key":"mat-1","type":"choice","band":1,"grades":[5],"subject":"math","prompt":{"id":"MTK 1"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz","flag-quest"]},
	{"key":"eng-1","type":"choice","band":2,"grades":[10],"subject":"english","prompt":{"id":"ENG 1"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz"]}
],"classrooms":[
	{"id":7,"games":[
		{"game_key":"sky-quiz","subjects":["science"],"questions":[]},
		{"game_key":"flag-quest","subjects":[],"questions":[]},
		{"game_key":"knowledge-train","subjects":["english"],"questions":[]}
	]},
	{"id":8,"games":{"sky-quiz":[{"key":"pick-1","type":"choice","band":1,"subject":"math","prompt":{"id":"Pilih 1"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0}]}}
]}`

func useClassroomSubjectBank(t *testing.T) {
	t.Helper()
	bank, err := Parse([]byte(classroomSubjectBank))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	t.Cleanup(func() {
		Use(nil)
		UseSubjects(nil)
	})
}

func TestClassroomSubjectsReplaceThePlayersChoice(t *testing.T) {
	useClassroomSubjectBank(t)
	for seed := uint64(1); seed <= 60; seed++ {
		g := NewFor("sky-quiz", 5, seed).For("math").InClassroom(7)
		if g.Subject != "science" || !g.SubjectLocked() {
			t.Fatalf("seed %d: subject %q locked %v, want science locked", seed, g.Subject, g.SubjectLocked())
		}
		for i := 0; i < 6; i++ {
			if q := g.Choice(); q.Subject != "science" {
				t.Fatalf("seed %d: classroom locked to science asked %q (%s)", seed, q.Subject, q.Key)
			}
		}
	}
}

func TestMixedClassroomGameIgnoresThePlayersChoice(t *testing.T) {
	useClassroomSubjectBank(t)
	g := NewFor("flag-quest", 5, 3).For("math").InClassroom(7)
	if g.Subject != "" || g.SubjectLocked() {
		t.Fatalf("mixed classroom game: subject %q locked %v, want mix unlocked", g.Subject, g.SubjectLocked())
	}
}

func TestOutsideAClassroomThePlayerChoiceStays(t *testing.T) {
	useClassroomSubjectBank(t)
	for _, id := range []int64{0, 99} {
		g := NewFor("sky-quiz", 5, 1).For("math").InClassroom(id)
		if g.Subject != "math" || g.SubjectLocked() {
			t.Fatalf("classroom %d: subject %q locked %v, want math unlocked", id, g.Subject, g.SubjectLocked())
		}
	}
}

func TestLockedSubjectUsesNearestGradeInsteadOfTheMix(t *testing.T) {
	useClassroomSubjectBank(t)
	g := NewFor("knowledge-train", 5, 1).For("").InClassroom(7)
	items := g.items(TypeChoice)
	if len(items) == 0 {
		t.Fatal("locked english classroom game found no questions")
	}
	for _, it := range items {
		if it.Subject != "english" {
			t.Fatalf("locked english game drew %q", it.Subject)
		}
	}
	if g.Fallback() {
		t.Fatal("locked subject must not report the mix fallback")
	}
}

func TestBankChoiceKeepsLockedSubjects(t *testing.T) {
	useClassroomSubjectBank(t)
	for seed := uint64(1); seed <= 40; seed++ {
		g := NewFor("sky-quiz", 5, seed).InClassroom(7)
		if q, ok := g.BankChoice(); ok && q.Subject != "science" {
			t.Fatalf("seed %d: bank choice asked %q", seed, q.Subject)
		}
		if _, ok := g.BankChoice("math"); ok {
			t.Fatalf("seed %d: a math-only game in a science classroom must get no bank question", seed)
		}
	}
}

func TestLegacyClassroomPoolStillParses(t *testing.T) {
	useClassroomSubjectBank(t)
	pool := Current().ClassroomPool(8, "sky-quiz", TypeChoice)
	if len(pool) != 1 || pool[0].Key != "pick-1" {
		t.Fatalf("legacy pool = %+v", pool)
	}
	if subject, ok := Current().ClassroomSubject(8, "sky-quiz"); !ok || subject != "" {
		t.Fatalf("legacy classroom subject = %q, %v", subject, ok)
	}
	if q := NewFor("sky-quiz", 5, 1).InClassroom(8).Choice(); !strings.HasPrefix(q.Key, "pick-") {
		t.Fatalf("picked pool not used: %s", q.Key)
	}
}
