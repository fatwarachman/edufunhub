package questions

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
)

// Item types.
const (
	TypeChoice    = "choice"
	TypeTrueFalse = "true_false"
)

// Item is one curated bank question. For true/false items Options is empty and Answer is 1 (true) or 0 (false).
type Item struct {
	Key     string   `json:"key"`
	Type    string   `json:"type"`
	Band    int      `json:"band"`
	Subject string   `json:"subject"`
	Prompt  Text     `json:"prompt"`
	Options []Text   `json:"options"`
	Answer  int      `json:"answer"`
	Hint    Text     `json:"hint"`
	Games   []string `json:"games"`
}

// ForGame reports whether the item is distributed to game ("" matches every item).
func (it Item) ForGame(game string) bool {
	if game == "" {
		return true
	}
	for _, g := range it.Games {
		if g == game {
			return true
		}
	}
	return false
}

// Bank is an immutable set of items grouped by type and band.
type Bank struct {
	Version string
	items   []Item
}

// Len returns the number of items.
func (b *Bank) Len() int { return len(b.items) }

func (b *Bank) filter(kind string, band int, game string) []Item {
	out := make([]Item, 0, 16)
	for _, it := range b.items {
		if it.Type == kind && it.Band == band && it.ForGame(game) {
			out = append(out, it)
		}
	}
	return out
}

func (b *Bank) choices(band int, game string) []Item { return b.filter(TypeChoice, band, game) }
func (b *Bank) truths(band int, game string) []Item  { return b.filter(TypeTrueFalse, band, game) }

// Validate rejects malformed items so a bad sync never reaches players.
func Validate(items []Item) error {
	seen := map[string]bool{}
	for _, it := range items {
		switch {
		case it.Key == "" || seen[it.Key]:
			return fmt.Errorf("invalid or duplicate key %q", it.Key)
		case it.Band < 0 || it.Band > 3:
			return fmt.Errorf("%s: band out of range", it.Key)
		case it.Prompt.ID == "":
			return fmt.Errorf("%s: empty prompt", it.Key)
		case it.Type == TypeChoice && (len(it.Options) < 3 || it.Answer < 0 || it.Answer >= len(it.Options)):
			return fmt.Errorf("%s: choice needs at least 3 options and a valid answer", it.Key)
		case it.Type == TypeTrueFalse && (it.Answer < 0 || it.Answer > 1):
			return fmt.Errorf("%s: true/false answer must be 0 or 1", it.Key)
		case it.Type != TypeChoice && it.Type != TypeTrueFalse:
			return fmt.Errorf("%s: unknown type %q", it.Key, it.Type)
		}
		seen[it.Key] = true
	}
	return nil
}

// Parse decodes and validates a bank payload: {"version": "...", "questions": [...]}.
func Parse(body []byte) (*Bank, error) {
	var payload struct {
		Version   string `json:"version"`
		Questions []Item `json:"questions"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if len(payload.Questions) == 0 {
		return nil, errors.New("question bank is empty")
	}
	if err := Validate(payload.Questions); err != nil {
		return nil, err
	}
	return &Bank{Version: payload.Version, items: payload.Questions}, nil
}

var current atomic.Pointer[Bank]

// Current returns the active bank (built-in until a sync succeeds).
func Current() *Bank {
	if b := current.Load(); b != nil {
		return b
	}
	return builtin
}

// Use swaps the active bank. Passing nil restores the built-in bank.
func Use(b *Bank) {
	current.Store(b)
}

// builtin is the bundled bank used before the first sync and as a fallback.
var builtin = func() *Bank {
	items := []Item{}
	both := []string{"flag-quest", "sky-quiz"}
	for band, list := range choiceBank {
		for i, q := range list {
			items = append(items, Item{Key: fmt.Sprintf("mc-%d-%d", band, i), Type: TypeChoice, Band: band, Subject: q.subject, Prompt: q.prompt, Options: q.options, Answer: q.answer, Hint: q.hint, Games: both})
		}
	}
	for band, list := range truthBank {
		for i, q := range list {
			answer := 0
			if q.answer {
				answer = 1
			}
			items = append(items, Item{Key: fmt.Sprintf("tf-%d-%d", band, i), Type: TypeTrueFalse, Band: band, Subject: q.subject, Prompt: q.prompt, Answer: answer, Games: []string{"flag-quest"}})
		}
	}
	return &Bank{Version: "builtin", items: items}
}()

// Builtin returns the bundled bank.
func Builtin() *Bank { return builtin }

// Answer records how a player answered one bank question (reported to Laravel for statistics).
type Answer struct {
	Key     string `json:"key"`
	Correct bool   `json:"correct"`
}
