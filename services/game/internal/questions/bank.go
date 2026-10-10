package questions

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"

	"edufunhub/game/internal/points"
)

// Item types.
const (
	TypeChoice    = "choice"
	TypeTrueFalse = "true_false"
)

// Item is one curated bank question. For true/false items Options is empty and Answer is 1 (true) or 0 (false).
type Item struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	Band int    `json:"band"`
	// Grades lists explicit target grades (0 = kindergarten). Empty means the whole band.
	Grades  []int    `json:"grades"`
	Subject string   `json:"subject"`
	Prompt  Text     `json:"prompt"`
	Options []Text   `json:"options"`
	Answer  int      `json:"answer"`
	Hint    Text     `json:"hint"`
	Games   []string `json:"games"`
	// Points overrides the per-correct award (bonus questions); 0 = default.
	Points int `json:"points"`
	// Level is the difficulty: 1 easy, 2 medium, 3 expert (0 = easy).
	Level int `json:"level"`
	// Visual is an optional illustration (image, cable, topology, terminal)
	// passed through to clients as is; it never contains the answer index.
	Visual json.RawMessage `json:"visual,omitempty"`
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

// ForGrade reports whether the item targets grade: explicit grades win over the band.
func (it Item) ForGrade(grade int) bool {
	if len(it.Grades) == 0 {
		return it.Band == Band(grade)
	}
	for _, g := range it.Grades {
		if g == grade {
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

func (b *Bank) filter(kind string, grade int, game string) []Item {
	out := make([]Item, 0, 16)
	for _, it := range b.items {
		if it.Type == kind && it.ForGrade(grade) && it.ForGame(game) {
			out = append(out, it)
		}
	}
	return out
}

func (b *Bank) choices(grade int, game string) []Item { return b.filter(TypeChoice, grade, game) }
func (b *Bank) truths(grade int, game string) []Item  { return b.filter(TypeTrueFalse, grade, game) }

// Validate rejects malformed items so a bad sync never reaches players.
func Validate(items []Item) error {
	seen := map[string]bool{}
	for _, it := range items {
		switch {
		case it.Key == "" || seen[it.Key]:
			return fmt.Errorf("invalid or duplicate key %q", it.Key)
		case it.Band < 0 || it.Band > 3:
			return fmt.Errorf("%s: band out of range", it.Key)
		case !validGrades(it.Grades):
			return fmt.Errorf("%s: grades must be between 0 and 12", it.Key)
		case it.Prompt.ID == "":
			return fmt.Errorf("%s: empty prompt", it.Key)
		case it.Type == TypeChoice && (len(it.Options) < 3 || it.Answer < 0 || it.Answer >= len(it.Options)):
			return fmt.Errorf("%s: choice needs at least 3 options and a valid answer", it.Key)
		case it.Type == TypeTrueFalse && (it.Answer < 0 || it.Answer > 1):
			return fmt.Errorf("%s: true/false answer must be 0 or 1", it.Key)
		case it.Type != TypeChoice && it.Type != TypeTrueFalse:
			return fmt.Errorf("%s: unknown type %q", it.Key, it.Type)
		case it.Points < 0 || it.Points > points.MaxPerQuestion:
			return fmt.Errorf("%s: points out of range", it.Key)
		case it.Level < 0 || it.Level > points.LevelExpert:
			return fmt.Errorf("%s: level out of range", it.Key)
		case !validVisual(it.Visual):
			return fmt.Errorf("%s: visual must be an object with a kind", it.Key)
		}
		seen[it.Key] = true
	}
	return nil
}

// MaxVisualBytes caps one question illustration payload.
const MaxVisualBytes = 8 << 10

// validVisual accepts no visual (empty or null) or a JSON object with a
// non-empty string kind, up to MaxVisualBytes.
func validVisual(raw json.RawMessage) bool {
	if len(raw) == 0 || string(raw) == "null" {
		return true
	}
	if len(raw) > MaxVisualBytes {
		return false
	}
	var head struct {
		Kind string `json:"kind"`
	}
	return json.Unmarshal(raw, &head) == nil && head.Kind != ""
}

func validGrades(grades []int) bool {
	for _, g := range grades {
		if g < 0 || g > 12 {
			return false
		}
	}
	return true
}

// Parse decodes and validates a bank payload: {"version": "...", "questions": [...]}.
func Parse(body []byte) (*Bank, error) {
	var payload struct {
		Version   string        `json:"version"`
		Questions []Item        `json:"questions"`
		Points    *points.Rules `json:"points"`
		Subjects  []string      `json:"subjects"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.Points != nil {
		points.Use(payload.Points)
	}
	if len(payload.Questions) == 0 {
		return nil, errors.New("question bank is empty")
	}
	if err := Validate(payload.Questions); err != nil {
		return nil, err
	}
	if payload.Subjects != nil {
		UseSubjects(payload.Subjects)
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
	both := []string{"flag-quest", "sky-quiz", "quiz-duel", "knowledge-train", "snakes-and-ladders", "market-math", "number-garden", "explore-indonesia", "mini-lab", "floor-drop", "economy-heist", "turbo-trivia", "block-battle", "monster-cafe", "ping-pong", "snake"}
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
	// Choice is the original bank option index the player picked; nil for
	// timeouts or when the pick cannot be attributed.
	Choice *int `json:"choice,omitempty"`
}
