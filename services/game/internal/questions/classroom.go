package questions

import (
	"encoding/json"
	"log/slog"
)

// Classroom pool limits: a bad or oversized sync never balloons memory.
const (
	// MaxClassroomPools caps the classrooms kept from one bank sync.
	MaxClassroomPools = 5000
	// MaxClassroomGames caps the games kept per classroom.
	MaxClassroomGames = 32
	// MaxClassroomItems caps the picked questions kept per classroom game.
	MaxClassroomItems = 100
)

// classroomPayload is one running classroom in the bank sync:
// {"id": 12, "games": {"sky-quiz": [Item, ...]}}.
type classroomPayload struct {
	ID    int64                      `json:"id"`
	Games map[string]json.RawMessage `json:"games"`
}

// parseClassrooms validates the teacher-picked pools. Unlike the main bank,
// a malformed item only drops that item (logged), so one bad pick never
// blocks the whole bank or the rest of the classroom.
func parseClassrooms(list []classroomPayload) map[int64]map[string][]Item {
	if len(list) == 0 {
		return nil
	}
	out := map[int64]map[string][]Item{}
	for _, c := range list {
		if len(out) >= MaxClassroomPools {
			slog.Warn("classroom pools capped", "max", MaxClassroomPools)
			break
		}
		if c.ID <= 0 || out[c.ID] != nil {
			continue
		}
		games := map[string][]Item{}
		for game, raw := range c.Games {
			if game == "" || len(games) >= MaxClassroomGames {
				continue
			}
			if items := parsePool(c.ID, game, raw); len(items) > 0 {
				games[game] = items
			}
		}
		if len(games) > 0 {
			out[c.ID] = games
		}
	}
	return out
}

// parsePool decodes one game's picked items one by one, dropping invalid or
// duplicate items and everything beyond MaxClassroomItems.
func parsePool(classroom int64, game string, raw json.RawMessage) []Item {
	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		slog.Warn("classroom pool dropped", "classroom", classroom, "game", game, "err", err)
		return nil
	}
	items := make([]Item, 0, min(len(entries), MaxClassroomItems))
	seen := map[string]bool{}
	for _, entry := range entries {
		if len(items) >= MaxClassroomItems {
			break
		}
		var it Item
		if err := json.Unmarshal(entry, &it); err != nil {
			slog.Warn("classroom question dropped", "classroom", classroom, "game", game, "err", err)
			continue
		}
		if seen[it.Key] {
			continue
		}
		if err := checkItem(it); err != nil {
			slog.Warn("classroom question dropped", "classroom", classroom, "game", game, "err", err)
			continue
		}
		seen[it.Key] = true
		items = append(items, it)
	}
	return items
}

// ClassroomPool returns the teacher-picked items of kind for game in
// classroom id (nil when there are none).
func (b *Bank) ClassroomPool(id int64, game, kind string) []Item {
	if b == nil || id <= 0 || game == "" {
		return nil
	}
	pool := b.classrooms[id][game]
	out := make([]Item, 0, len(pool))
	for _, it := range pool {
		if it.Type == kind {
			out = append(out, it)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// Classrooms returns how many classroom pools the bank holds.
func (b *Bank) Classrooms() int { return len(b.classrooms) }

// InClassroom makes the generator draw only the questions the teacher of
// classroom id picked for its game, whenever that pool has questions of
// the asked kind (0 or no pool = normal bank behaviour).
func (g *Generator) InClassroom(id int64) *Generator {
	g.Classroom = max(id, 0)
	return g
}

// classroomItems is the active classroom pool of kind (nil when none).
func (g *Generator) classroomItems(kind string) []Item {
	if g.Classroom <= 0 {
		return nil
	}
	return Current().ClassroomPool(g.Classroom, g.Game, kind)
}

// HasClassroomChoices reports whether a classroom pool supplies this
// generator's multiple choice questions (games with their own content then
// ask only the teacher's questions).
func (g *Generator) HasClassroomChoices() bool { return len(g.classroomItems(TypeChoice)) > 0 }
