package questions

import (
	"fmt"
	"strings"
	"testing"
)

// A subject without true/false questions must not borrow another subject's
// statements: players picked one subject and saw others in true/false gates.
func TestTrueFalseStaysInTheChosenSubject(t *testing.T) {
	var items []string
	for i := 0; i < 6; i++ {
		items = append(items, fmt.Sprintf(`{"key":"c%d","type":"choice","band":1,"subject":"geografi","prompt":{"id":"Ibu kota %d","en":"Capital %d"},"options":[{"id":"Jakarta"},{"id":"Bandung"},{"id":"Medan"}],"answer":0,"games":["edu-kart"]}`, i, i, i))
	}
	for i := 0; i < 4; i++ {
		items = append(items, fmt.Sprintf(`{"key":"tf%d","type":"true_false","band":1,"subject":"science","prompt":{"id":"Air mendidih %d"},"answer":1,"games":["edu-kart"]}`, i, i))
	}
	bank, err := Parse([]byte(`{"version":"t","questions":[` + strings.Join(items, ",") + `]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	UseSubjects(append([]string{"geografi"}, BuiltinSubjects...))
	History.Reset()
	t.Cleanup(func() { Use(nil); UseSubjects(BuiltinSubjects); History.Reset() })

	truths := map[int]int{}
	for seed := uint64(1); seed <= 40; seed++ {
		g := NewFor("edu-kart", 5, seed).For("geografi", 1)
		q := g.TrueFalse()
		if q.Subject != "geografi" || !q.FromBank || g.Fallback() {
			t.Fatalf("seed %d: geografi true/false drew %q (bank %v fallback %v)", seed, q.Subject, q.FromBank, g.Fallback())
		}
		if !strings.Contains(q.Prompt.ID, "Jawaban: ") || !strings.Contains(q.Prompt.EN, "Answer: ") {
			t.Fatalf("seed %d: statement prompt %+v", seed, q.Prompt)
		}
		right := strings.HasSuffix(q.Prompt.ID, "Jawaban: Jakarta")
		if right != (q.Answer == 1) {
			t.Fatalf("seed %d: answer %d does not match statement %q", seed, q.Answer, q.Prompt.ID)
		}
		truths[q.Answer]++
	}
	if truths[0] == 0 || truths[1] == 0 {
		t.Fatalf("statements must be both true and false: %v", truths)
	}
	// A subject that has its own statements keeps using them.
	if q := NewFor("edu-kart", 5, 3).For("science", 1).TrueFalse(); !strings.HasPrefix(q.Key, "tf") {
		t.Fatalf("science true/false used %s", q.Key)
	}
	// The mix is unchanged: real statements, never converted choices.
	if q := NewFor("edu-kart", 5, 3).TrueFalse(); strings.Contains(q.Prompt.ID, "Jawaban: ") {
		t.Fatalf("mixed true/false converted a choice: %+v", q.Prompt)
	}
}

// A chosen subject without questions for the player's grade (a vocational
// subject picked by a primary school player) uses its nearest grades instead
// of the whole mix; only a subject with no questions at all falls back.
func TestChosenSubjectUsesNearestGradeInsteadOfTheMix(t *testing.T) {
	var items []string
	for i := 0; i < 4; i++ {
		items = append(items, fmt.Sprintf(`{"key":"tkj%d","type":"choice","band":3,"subject":"tkj","prompt":{"id":"IP %d"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["edu-kart"]}`, i, i))
		items = append(items, fmt.Sprintf(`{"key":"sci%d","type":"choice","band":1,"subject":"science","prompt":{"id":"Sains %d"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["edu-kart"]}`, i, i))
		items = append(items, fmt.Sprintf(`{"key":"tf%d","type":"true_false","band":1,"subject":"science","prompt":{"id":"Benar %d"},"answer":1,"games":["edu-kart"]}`, i, i))
	}
	bank, err := Parse([]byte(`{"version":"t","questions":[` + strings.Join(items, ",") + `]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	UseSubjects(append([]string{"tkj", "music"}, BuiltinSubjects...))
	History.Reset()
	t.Cleanup(func() { Use(nil); UseSubjects(BuiltinSubjects); History.Reset() })

	for seed := uint64(1); seed <= 20; seed++ {
		g := NewFor("edu-kart", 3, seed).For("tkj", 1)
		if q := g.Choice(); q.Subject != "tkj" || g.Fallback() {
			t.Fatalf("seed %d: grade 3 tkj choice drew %q (fallback %v)", seed, q.Subject, g.Fallback())
		}
		if q := g.TrueFalse(); q.Subject != "tkj" || g.Fallback() {
			t.Fatalf("seed %d: grade 3 tkj true/false drew %q (fallback %v)", seed, q.Subject, g.Fallback())
		}
	}
	// A subject with no questions anywhere still falls back and says so.
	g := NewFor("edu-kart", 3, 1).For("music", 1)
	if q := g.Choice(); !q.FromBank || !g.Fallback() {
		t.Fatalf("empty subject must fall back to the mix and say so (%q, %v)", q.Subject, g.Fallback())
	}
}
