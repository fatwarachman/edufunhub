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
	if got := b.choices(0, "sky-quiz"); len(got) != 10 || got[0].Key != "mc-0-0" {
		t.Fatalf("unexpected band 0 sky choices: %d", len(got))
	}
	if got := b.truths(0, "sky-quiz"); len(got) != 0 {
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
