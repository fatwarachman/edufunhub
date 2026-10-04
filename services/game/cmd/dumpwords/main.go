// Command dumpwords prints the bundled crossword bank as JSON for the
// Laravel seed migration (database/data/crossword-words.json).
package main

import (
	"encoding/json"
	"os"
	"sort"

	"edufunhub/game/internal/crossword"
)

func main() {
	type word struct {
		Key    string            `json:"key"`
		Level  int               `json:"level"`
		Answer string            `json:"answer"`
		Clue   map[string]string `json:"clue"`
	}
	out := []word{}
	levels := []int{}
	for l := range crossword.Builtin().Levels {
		levels = append(levels, l)
	}
	sort.Ints(levels)
	for _, l := range levels {
		for _, e := range crossword.Builtin().Levels[l] {
			out = append(out, word{Key: e.Key, Level: l, Answer: e.Answer, Clue: map[string]string{"id": e.ClueID, "en": e.ClueEN}})
		}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]any{"words": out})
}
