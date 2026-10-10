package questions

import (
	"encoding/json"
	"strings"
	"testing"
)

func visualItem(visual string) Item {
	it := Item{Key: "v-1", Type: TypeChoice, Band: 3, Subject: "tkj", Prompt: Text{ID: "Kabel apa ini?"}, Options: []Text{{ID: "A"}, {ID: "B"}, {ID: "C"}}, Answer: 0, Games: []string{"sky-quiz"}}
	if visual != "" {
		it.Visual = json.RawMessage(visual)
	}
	return it
}

func TestValidateVisual(t *testing.T) {
	ok := []string{"", "null", `{"kind":"image","src":"/question-media/a.png"}`, `{"kind":"rj45","pins":[]}`}
	for _, v := range ok {
		if err := Validate([]Item{visualItem(v)}); err != nil {
			t.Fatalf("visual %q rejected: %v", v, err)
		}
	}
	bad := []string{`{"src":"x"}`, `{"kind":""}`, `[1,2]`, `"image"`, `{"kind":"image","note":"` + strings.Repeat("x", MaxVisualBytes) + `"}`}
	for _, v := range bad {
		if err := Validate([]Item{visualItem(v)}); err == nil {
			t.Fatalf("visual %q accepted", v)
		}
	}
}

func TestVisualReachesQuestionMedia(t *testing.T) {
	visual := `{"kind":"topology","topology":"star"}`
	body, _ := json.Marshal(map[string]any{"version": "t", "questions": []Item{visualItem(visual)}})
	bank, err := Parse(body)
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	defer Use(nil)

	g := NewFor("sky-quiz", 10, 1).For("tkj")
	q, ok := g.BankChoice()
	if !ok {
		t.Fatal("no bank question drawn")
	}
	q = g.Present(q, 3)
	if string(q.Media()) != visual {
		t.Fatalf("media = %s, want %s", q.Media(), visual)
	}
	for seed := uint64(1); seed <= 60; seed++ {
		g := NewFor("sky-quiz", 10, seed).For("tkj")
		if q := g.Present(g.Choice(), 3); q.FromBank && string(q.Media()) != visual {
			t.Fatalf("seed %d lost the visual", seed)
		}
	}

	plain := Question{Prompt: Text{ID: "1 + 1 = ?"}}
	if plain.Media() != nil {
		t.Fatal("question without visual must have no media")
	}
	out, _ := json.Marshal(map[string]any{"media": plain.Media()})
	if string(out) != `{"media":null}` {
		t.Fatalf("empty media marshals as %s", out)
	}
}
