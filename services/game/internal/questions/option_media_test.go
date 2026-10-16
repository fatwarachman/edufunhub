package questions

import (
	"encoding/json"
	"testing"
)

func TestBankDecodeKeepsOptionMediaThroughShuffle(t *testing.T) {
	raw := `{"key":"pic-1","type":"choice","band":0,"grades":[0],"subject":"science","prompt":{"id":"Mana kucing?","en":"Which is a cat?"},
		"options":[{"id":"Kucing","en":"Cat","media":{"kind":"image","src":"/games/question-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"}},{"id":"Anjing","en":"Dog"},{"id":"Ikan","en":"Fish","media":{"kind":"image","src":"/games/question-media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp"}}],
		"answer":0,"games":["sky-quiz"]}`
	var it Item
	if err := json.Unmarshal([]byte(raw), &it); err != nil {
		t.Fatal(err)
	}
	if err := checkItem(it); err != nil {
		t.Fatal(err)
	}
	if it.Options[0].Media == nil || it.Options[0].Media.Src == "" || it.Options[1].Media != nil {
		t.Fatalf("media not decoded: %+v", it.Options)
	}

	Use(&Bank{Version: "pics", items: []Item{it}})
	t.Cleanup(func() { Use(nil) })
	for seed := uint64(1); seed <= 20; seed++ {
		q := NewFor("sky-quiz", 0, seed).For("science").Choice()
		if q.Key != "pic-1" {
			t.Fatalf("seed %d: got %q", seed, q.Key)
		}
		media := q.OptionMedia()
		if len(media) != len(q.Options) {
			t.Fatalf("seed %d: media %d options %d", seed, len(media), len(q.Options))
		}
		for i, o := range q.Options {
			want := map[string]string{"Kucing": "aaaa", "Anjing": "", "Ikan": "bbbb"}[o.ID]
			got := ""
			if media[i] != nil {
				got = media[i].Src[len("/games/question-media/") : len("/games/question-media/")+4]
			}
			if got != want {
				t.Fatalf("seed %d: option %q media %q, want %q", seed, o.ID, got, want)
			}
		}
		if q.Options[q.Answer].ID != "Kucing" {
			t.Fatalf("seed %d: answer moved away from its option", seed)
		}
	}
}

func TestOptionMediaIsNilWithoutPictures(t *testing.T) {
	q := Question{Options: []Text{same("a"), same("b")}}
	if q.OptionMedia() != nil {
		t.Fatal("text-only options must not send option_media")
	}
	b, _ := json.Marshal(same("a"))
	if string(b) != `{"id":"a","en":"a"}` {
		t.Fatalf("text json changed: %s", b)
	}
}
