package crossword

import (
	"encoding/json"
	"math/rand/v2"
	"strings"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

func claims(id int64) auth.Claims {
	return auth.Claims{Subject: id, Name: "P", Grade: 5, Game: GameKey}
}

func roomOf(h *Hub, uid int64) *room {
	var out *room
	h.rooms.View(uid, func(r *room) { out = r })
	return out
}

func TestBankWordsAreCleanAndUnique(t *testing.T) {
	for level, entries := range Builtin().Levels {
		seen := map[string]bool{}
		for _, e := range entries {
			if e.Answer != normalize(e.Answer) || e.ClueID == "" || e.ClueEN == "" {
				t.Fatalf("level %d bad entry %+v", level, e)
			}
			if seen[e.Answer] {
				t.Fatalf("level %d duplicate %s", level, e.Answer)
			}
			seen[e.Answer] = true
		}
		if len(entries) < 25 {
			t.Fatalf("level %d needs a deep bank: %d", level, len(entries))
		}
	}
}

func TestGeneratedGridsAreValidAndGrowWithLevel(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	prevCells := 0
	for _, l := range Levels {
		total := 0
		for run := 0; run < 30; run++ {
			p := Generate(l, rng)
			if len(p.Words) < l.Words-1 {
				t.Fatalf("level %d placed only %d words", l.Number, len(p.Words))
			}
			if p.Rows > l.Size || p.Cols > l.Size {
				t.Fatalf("level %d grid too big %dx%d", l.Number, p.Rows, p.Cols)
			}
			used := map[[2]int]int{}
			for _, w := range p.Words {
				for i, c := range w.Cells() {
					if p.Letters[c[0]][c[1]] != w.Answer[i] {
						t.Fatalf("letter mismatch in %s", w.Answer)
					}
					used[c]++
				}
			}
			crossings := 0
			for _, n := range used {
				if n > 1 {
					crossings++
				}
			}
			if crossings < len(p.Words)-1 {
				t.Fatalf("level %d grid is not connected: %d words, %d crossings", l.Number, len(p.Words), crossings)
			}
			total += len(used)
		}
		if avg := total / 30; avg <= prevCells {
			t.Fatalf("level %d should have more squares than the level below: %d <= %d", l.Number, avg, prevCells)
		} else {
			prevCells = avg
		}
	}
}

func TestSoloGameSolvesAndPays(t *testing.T) {
	h := NewHub(3)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1), "id")
	if _, err := h.Create(claims(1), 9, now); err != ErrLevel {
		t.Fatalf("bad level: %v", err)
	}
	_, _ = h.Create(claims(1), 1, now)
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	r := roomOf(h, 1)
	st := h.State(claims(1), now)
	if st["answers"] != nil {
		t.Fatal("answers must stay hidden while playing")
	}
	for _, row := range st["grid"].(Message)["cells"].([][]any) {
		for _, cell := range row {
			if m, ok := cell.(Message); ok && m["letter"] != nil {
				t.Fatal("letters must start hidden")
			}
		}
	}
	if _, _, err := h.Guess(1, 0, "X", now); err != ErrLength {
		t.Fatalf("length check: %v", err)
	}
	for i, w := range r.Game.puzzle.Words {
		now = now.Add(time.Second)
		_, ok, err := h.Guess(1, i, w.Answer, now)
		if err != nil || !ok {
			t.Fatalf("guess %s: %v %v", w.Answer, ok, err)
		}
	}
	if r.Phase != "done" || r.Game.ended != "solved" {
		t.Fatalf("game should end solved: %s %s", r.Phase, r.Game.ended)
	}
	res := h.TakeResults()
	words := len(r.Game.puzzle.Words)
	if len(res) != 1 || res[0].Points != Award(1, words, false, false) || res[0].Correct != words || res[0].Mission != "level-1" {
		t.Fatalf("result %+v", res)
	}
	if res[0].Points != points.Defaults.Participation+words*PointsPerWord(1) {
		t.Fatalf("solo points %d", res[0].Points)
	}
}

func TestRaceFirstSolverOwnsWordAndHintsAndThrottle(t *testing.T) {
	h := NewHub(5)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1), "id")
	h.Join(claims(2), "en")
	_, _ = h.Create(claims(1), 2, now)
	pin := roomOf(h, 1).Pin
	_, _ = h.Enter(claims(2), pin, now)
	if _, err := h.SetLevel(2, 3, now); err != ErrNotHost {
		t.Fatalf("guest changed level: %v", err)
	}
	_, _ = h.SetLevel(1, 3, now)
	_, _ = h.Start(1, now)
	r := roomOf(h, 1)
	if r.Game.level != 3 {
		t.Fatalf("level %d", r.Game.level)
	}
	w := r.Game.puzzle.Words[0]
	if _, err := h.Hint(2, 0, now); err != nil {
		t.Fatal(err)
	}
	if r.Seats[1].Data.hints != Hints-1 {
		t.Fatal("hint must be spent")
	}
	_, _, _ = h.Guess(2, 0, w.Answer[:len(w.Answer)-1]+"Q", now)
	if _, _, err := h.Guess(2, 0, w.Answer, now.Add(100*time.Millisecond)); err != ErrTooFast {
		t.Fatalf("throttle: %v", err)
	}
	if _, ok, _ := h.Guess(1, 0, w.Answer, now); !ok {
		t.Fatal("host should solve")
	}
	if _, _, err := h.Guess(2, 0, w.Answer, now.Add(time.Second)); err != ErrSolved {
		t.Fatalf("second solver: %v", err)
	}
	h.Tick(now.Add(TimeLimit(3)))
	if r.Phase != "done" || r.Game.ended != "time" || r.Game.winner != 0 {
		t.Fatalf("time out: %s %s %d", r.Phase, r.Game.ended, r.Game.winner)
	}
	res := h.TakeResults()
	if len(res) != 2 {
		t.Fatalf("both players paid: %+v", res)
	}
	for _, x := range res {
		if x.Points < points.Defaults.Participation {
			t.Fatalf("everyone earns at least participation: %+v", x)
		}
	}
	if st := h.State(claims(2), now); len(st["answers"].([]string)) != len(r.Game.puzzle.Words) {
		t.Fatal("answers shown after the game")
	}
}

func TestParseBankValidatesAndKeepsKeys(t *testing.T) {
	words := []map[string]any{}
	for level, list := range Builtin().Levels {
		for _, e := range list {
			words = append(words, map[string]any{"key": e.Key, "level": level, "answer": e.Answer, "clue": map[string]string{"id": e.ClueID, "en": ""}})
		}
	}
	body, _ := json.Marshal(map[string]any{"version": "v1", "words": words})
	b, err := ParseBank(body)
	if err != nil {
		t.Fatal(err)
	}
	if b.Version != "v1" || len(b.Levels[1]) != len(Builtin().Levels[1]) || b.Levels[1][0].Key == "" || b.Levels[1][0].ClueEN == "" {
		t.Fatalf("bank not parsed: %+v", b.Levels[1][0])
	}

	short, _ := json.Marshal(map[string]any{"version": "v2", "words": words[:3]})
	if _, err := ParseBank(short); err == nil {
		t.Fatal("a level without enough words must be rejected")
	}
	bad, _ := json.Marshal(map[string]any{"version": "v3", "words": []map[string]any{{"key": "x", "level": 1, "answer": "ab-c", "clue": map[string]string{"id": "x"}}}})
	if _, err := ParseBank(bad); err == nil {
		t.Fatal("invalid answers must be rejected")
	}
}

func TestSyncedBankFeedsTheGenerator(t *testing.T) {
	defer Use(nil)
	b := &Bank{Version: "test", Levels: map[int][]Entry{}}
	for level, list := range Builtin().Levels {
		for _, e := range list {
			e.Key = "admin-" + e.Key
			b.Levels[level] = append(b.Levels[level], e)
		}
	}
	Use(b)
	p := Generate(Levels[0], rand.New(rand.NewPCG(3, 4)))
	if !strings.HasPrefix(p.Words[0].Key, "admin-") {
		t.Fatalf("generator must use the synced bank: %+v", p.Words[0])
	}
}

func TestResultsCarryTheSharedMatch(t *testing.T) {
	h := NewHub(7)
	now := time.Unix(1_800_000_000, 0)
	a := auth.Claims{Subject: 1, Name: "Rani", Grade: 2, Game: GameKey}
	b := auth.Claims{Subject: 2, Name: "Bima", Grade: 9, Game: GameKey}
	h.Join(a, "id")
	h.Join(b, "id")
	_, _ = h.Create(a, 2, now)
	pin := roomOf(h, 1).Pin
	if _, err := h.Enter(b, pin, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	r := roomOf(h, 1)
	w := r.Game.puzzle.Words[0]
	if _, ok, err := h.Guess(2, 0, w.Answer, now.Add(time.Second)); err != nil || !ok {
		t.Fatal(err)
	}
	h.Tick(now.Add(TimeLimit(2) + time.Second))
	res := h.TakeResults()
	if len(res) != 2 || res[0].Match == nil || res[1].Match == nil || res[0].Match.Key != res[1].Match.Key {
		t.Fatalf("both results share one match: %+v", res)
	}
	m := res[0].Match
	if m.Mode != "room" || m.Pin != pin || m.Level != 2 || m.Grade != 2 || len(m.Players) != 2 || !m.Finished {
		t.Fatalf("bad match: %+v", m)
	}
	if m.Players[1].Rank != 1 || m.Players[0].Rank != 2 || m.Players[1].UserID != 2 || m.Players[1].Correct != 1 {
		t.Fatalf("Bima solved a word and ranks first: %+v", m.Players)
	}
	if len(m.Words) != len(r.Game.puzzle.Words) || !m.Words[0].Solved || m.Words[0].Key == "" {
		t.Fatalf("words must be recorded: %+v", m.Words)
	}
}

func TestTimeUpEndsTheGameAndRevealsAnswers(t *testing.T) {
	h := NewHub(8)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1), "id")
	h.Join(claims(2), "id")
	pin, _ := h.Create(claims(1), 2, now)
	_, _ = pin, 0
	r := roomOf(h, 1)
	if _, err := h.Enter(claims(2), r.Pin, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	words := r.Game.puzzle.Words
	now = now.Add(time.Second)
	if _, ok, _ := h.Guess(1, 0, words[0].Answer, now); !ok {
		t.Fatal("first word")
	}
	late := r.Game.ends.Add(time.Millisecond)
	if _, _, err := h.Guess(2, 1, words[1].Answer, late); err != ErrTimeUp {
		t.Fatalf("guess after the clock must be refused: %v", err)
	}
	if _, err := h.Hint(2, 1, late); err != ErrTimeUp {
		t.Fatalf("hint after the clock must be refused: %v", err)
	}
	if ids := h.Tick(late); len(ids) != 2 {
		t.Fatalf("time up must notify both players: %v", ids)
	}
	if r.Phase != "done" || r.Game.ended != "time" {
		t.Fatalf("game must end on time: %s %s", r.Phase, r.Game.ended)
	}
	st := h.State(claims(2), late)
	answers, _ := st["answers"].([]string)
	if len(answers) != len(words) || answers[1] != words[1].Answer {
		t.Fatalf("every answer is revealed: %v", st["answers"])
	}
	if st["unsolved"] != len(words)-1 {
		t.Fatalf("unsolved count %v", st["unsolved"])
	}
	res := h.TakeResults()
	byUser := map[int64]Result{}
	for _, x := range res {
		byUser[x.UserID] = x
	}
	if byUser[1].Points != Award(2, 1, true, false) || byUser[2].Points != points.Defaults.Participation {
		t.Fatalf("only solved words pay: %+v", res)
	}
}

func TestEqualScoresAreADrawWithoutBonus(t *testing.T) {
	h := NewHub(9)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1), "id")
	h.Join(claims(2), "id")
	h.Create(claims(1), 1, now)
	r := roomOf(h, 1)
	h.Enter(claims(2), r.Pin, now)
	h.Start(1, now)
	h.Tick(r.Game.ends)
	if r.Game.winner != -1 || !r.Game.draw {
		t.Fatalf("0-0 is a draw: winner %d draw %v", r.Game.winner, r.Game.draw)
	}
	for _, x := range h.TakeResults() {
		if x.Points != points.Defaults.Participation {
			t.Fatalf("a draw adds no points: %+v", x)
		}
	}
}
