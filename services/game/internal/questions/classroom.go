package questions

import (
	"encoding/json"
	"log/slog"
	"strings"
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
// {"id": 12, "games": [{"game_key": "sky-quiz", "subjects": ["math"],
// "questions": [Item, ...]}]}. The older map form {"sky-quiz": [Item, ...]}
// is still accepted.
type classroomPayload struct {
	ID    int64           `json:"id"`
	Games json.RawMessage `json:"games"`
}

// classroomGamePayload is one game of a classroom in the list form.
type classroomGamePayload struct {
	GameKey   string          `json:"game_key"`
	Subjects  []string        `json:"subjects"`
	Questions json.RawMessage `json:"questions"`
}

// classroomGame is the parsed setup of one classroom game: the subjects the
// teacher locked it to (canonical subject value, "" = every subject) and
// the picked questions.
type classroomGame struct {
	subject string
	items   []Item
}

// decodeClassroomGames reads both payload forms of a classroom's games.
func decodeClassroomGames(id int64, raw json.RawMessage) []classroomGamePayload {
	if len(raw) == 0 {
		return nil
	}
	var list []classroomGamePayload
	if err := json.Unmarshal(raw, &list); err == nil {
		return list
	}
	var legacy map[string]json.RawMessage
	if err := json.Unmarshal(raw, &legacy); err != nil {
		slog.Warn("classroom games dropped", "classroom", id, "err", err)
		return nil
	}
	out := make([]classroomGamePayload, 0, len(legacy))
	for game, questions := range legacy {
		out = append(out, classroomGamePayload{GameKey: game, Questions: questions})
	}
	return out
}

// parseClassrooms validates the teacher's classroom setups. Unlike the main
// bank, a malformed item only drops that item (logged), so one bad pick
// never blocks the whole bank or the rest of the classroom.
func parseClassrooms(list []classroomPayload) map[int64]map[string]classroomGame {
	if len(list) == 0 {
		return nil
	}
	out := map[int64]map[string]classroomGame{}
	for _, c := range list {
		if len(out) >= MaxClassroomPools {
			slog.Warn("classroom pools capped", "max", MaxClassroomPools)
			break
		}
		if c.ID <= 0 || out[c.ID] != nil {
			continue
		}
		games := map[string]classroomGame{}
		for _, g := range decodeClassroomGames(c.ID, c.Games) {
			if g.GameKey == "" || len(games) >= MaxClassroomGames {
				continue
			}
			if _, dup := games[g.GameKey]; dup {
				continue
			}
			setup := classroomGame{subject: NormSubject(strings.Join(g.Subjects, SubjectSeparator))}
			if len(g.Questions) > 0 && string(g.Questions) != "null" {
				setup.items = parsePool(c.ID, g.GameKey, g.Questions)
			}
			games[g.GameKey] = setup
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
	pool := b.classrooms[id][game].items
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

// ClassroomSubject returns the subjects the teacher set for game in
// classroom id (canonical subject value, "" = mix) and whether the bank
// knows that classroom game at all.
func (b *Bank) ClassroomSubject(id int64, game string) (string, bool) {
	if b == nil || id <= 0 || game == "" {
		return "", false
	}
	setup, ok := b.classrooms[id][game]
	return setup.subject, ok
}

// InClassroom makes the generator draw only the questions the teacher of
// classroom id picked for its game, whenever that pool has questions of
// the asked kind (0 or no pool = normal bank behaviour). The classroom's
// subjects replace whatever subject the players sent: the teacher's
// subjects when set (locked), else the mix, so students in a classroom
// never choose their own subject.
func (g *Generator) InClassroom(id int64) *Generator {
	g.Classroom = max(id, 0)
	if subject, ok := Current().ClassroomSubject(g.Classroom, g.Game); ok {
		g.Subject = subject
		g.locked = subject != ""
	}
	return g
}

// SubjectLocked reports whether the classroom fixed this generator's
// subjects (see InClassroom).
func (g *Generator) SubjectLocked() bool { return g.locked }

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

// lockedSubjects narrows a game's own subject list to the classroom's
// locked subjects (an empty game list means the game takes any subject).
func lockedSubjects(game, locked []string) []string {
	if len(game) == 0 {
		return locked
	}
	out := make([]string, 0, len(game))
	for _, s := range game {
		if containsString(locked, s) {
			out = append(out, s)
		}
	}
	return out
}

// nearestGrade keeps the items whose target grade is closest to the
// generator's grade (used when a locked subject has nothing for it).
func (g *Generator) nearestGrade(items []Item) []Item {
	best, out := -1, make([]Item, 0, len(items))
	for _, it := range items {
		d := gradeDistance(it, g.Grade)
		switch {
		case best < 0 || d < best:
			best, out = d, append(out[:0], it)
		case d == best:
			out = append(out, it)
		}
	}
	return out
}

// gradeDistance is how far an item's target grades are from grade.
func gradeDistance(it Item, grade int) int {
	if len(it.Grades) == 0 {
		return 3 * absInt(it.Band-Band(grade))
	}
	best := -1
	for _, g := range it.Grades {
		if d := absInt(g - grade); best < 0 || d < best {
			best = d
		}
	}
	return best
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
