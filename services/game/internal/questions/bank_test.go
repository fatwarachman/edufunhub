package questions

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuiltinBankMatchesLegacyKeys(t *testing.T) {
	b := Builtin()
	if b.Len() != 64 {
		t.Fatalf("expected 64 built-in questions, got %d", b.Len())
	}
	if err := Validate(b.items); err != nil {
		t.Fatal(err)
	}
	if got := b.choices(2, "sky-quiz"); len(got) != 10 || got[0].Key != "mc-0-0" {
		t.Fatalf("unexpected band 0 sky choices: %d", len(got))
	}
	if got := b.truths(2, "sky-quiz"); len(got) != 0 {
		t.Fatal("true/false items are not distributed to sky quiz")
	}
}

func TestGeneratorOnlyUsesQuestionsForItsGame(t *testing.T) {
	bank, err := Parse([]byte(`{"version":"v1","questions":[
		{"key":"q-sky","type":"choice","band":1,"subject":"science","prompt":{"id":"Langit?","en":"Sky?"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":0,"games":["sky-quiz"]},
		{"key":"q-flag","type":"choice","band":1,"subject":"science","prompt":{"id":"Bendera?","en":"Flag?"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":1,"games":["flag-quest"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	defer Use(nil)
	g := NewFor("sky-quiz", 5, 1)
	sawBank := false
	for i := 0; i < 50; i++ {
		q := g.Choice()
		if q.Key == "q-flag" {
			t.Fatal("flag-only question leaked into sky quiz")
		}
		if q.FromBank {
			sawBank = true
			if q.Options[q.Answer].ID != "A" {
				t.Fatal("answer must follow shuffle")
			}
		}
	}
	if !sawBank {
		t.Fatal("expected the sky question to be drawn at least once")
	}
}

func TestParseRejectsInvalidBanks(t *testing.T) {
	cases := []string{
		`{"questions":[]}`,
		`{"questions":[{"key":"a","type":"choice","band":0,"prompt":{"id":"x"},"options":[{"id":"1"},{"id":"2"}],"answer":0}]}`,
		`{"questions":[{"key":"a","type":"choice","band":7,"prompt":{"id":"x"},"options":[{"id":"1"},{"id":"2"},{"id":"3"}],"answer":0}]}`,
		`{"questions":[{"key":"a","type":"true_false","band":0,"prompt":{"id":"x"},"answer":2}]}`,
		`{"questions":[{"key":"a","type":"essay","band":0,"prompt":{"id":"x"},"answer":0}]}`,
		`{"questions":[{"key":"a","type":"true_false","band":0,"prompt":{"id":"x"},"answer":1},{"key":"a","type":"true_false","band":0,"prompt":{"id":"y"},"answer":1}]}`,
	}
	for _, c := range cases {
		if _, err := Parse([]byte(c)); err == nil {
			t.Fatalf("expected error for %s", c)
		}
	}
}

func TestSyncerSignsRequestAndKeepsBankOnFailure(t *testing.T) {
	defer Use(nil)
	secret := []byte("sync-test-secret-with-32-characters!")
	now := time.Unix(1_790_000_000, 0)
	fail := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Game-Timestamp") != "1790000000" || len(r.Header.Get("X-Game-Signature")) != 64 {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if fail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(`{"version":"v9","questions":[{"key":"db-1","type":"true_false","band":2,"subject":"science","prompt":{"id":"Air mendidih 100°C."},"answer":1,"games":["flag-quest"]}]}`))
	}))
	defer srv.Close()
	s := &Syncer{URL: srv.URL, Secret: secret, Now: func() time.Time { return now }}
	if err := s.SyncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if Current().Version != "v9" || Current().Len() != 1 {
		t.Fatalf("bank not activated: %s", Current().Version)
	}
	fail = true
	if err := s.SyncOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("expected failure, got %v", err)
	}
	if Current().Version != "v9" {
		t.Fatal("failed sync must keep the last good bank")
	}
}

func TestExplicitGradesOverrideBand(t *testing.T) {
	bank, err := Parse([]byte(`{"version":"v2","questions":[
		{"key":"q-tk","type":"choice","band":0,"grades":[0,2],"subject":"math","prompt":{"id":"Satu tambah satu?"},"options":[{"id":"2"},{"id":"3"},{"id":"4"}],"answer":0,"games":["sky-quiz"]},
		{"key":"q-band","type":"choice","band":0,"subject":"math","prompt":{"id":"Dua tambah dua?"},"options":[{"id":"4"},{"id":"5"},{"id":"6"}],"answer":0,"games":["sky-quiz"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	keys := func(grade int) string {
		var out []string
		for _, it := range bank.choices(grade, "sky-quiz") {
			out = append(out, it.Key)
		}
		return strings.Join(out, ",")
	}
	if got := keys(0); got != "q-tk,q-band" {
		t.Fatalf("kindergarten: %q", got)
	}
	if got := keys(1); got != "q-band" {
		t.Fatalf("grade 1 must skip a question targeted at TK and grade 2: %q", got)
	}
	if got := keys(2); got != "q-tk,q-band" {
		t.Fatalf("grade 2: %q", got)
	}
	if _, err := Parse([]byte(`{"version":"v3","questions":[{"key":"q-bad","type":"choice","band":0,"grades":[13],"subject":"math","prompt":{"id":"x"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["sky-quiz"]}]}`)); err == nil {
		t.Fatal("grade 13 must be rejected")
	}
}
