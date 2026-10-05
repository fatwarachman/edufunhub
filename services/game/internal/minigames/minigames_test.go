package minigames

import (
	"math/rand/v2"
	"strings"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
)

func claims(id int64, grade int, game string) auth.Claims {
	return auth.Claims{Subject: id, Name: "P", Grade: grade, Game: game}
}

func roomOf(h *Hub, uid int64) *room {
	var out *room
	h.rooms.View(uid, func(r *room) { out = r })
	return out
}

// answerFor returns the right (or a wrong) option of uid's current question.
func answerFor(h *Hub, uid int64, right bool) int {
	r := roomOf(h, uid)
	a := r.Game.current.Question.Answer
	if right {
		return a
	}
	return (a + 1) % len(r.Game.current.Question.Options)
}

func TestContentIsValidForEveryGameAndGrade(t *testing.T) {
	r := rand.New(rand.NewPCG(1, 2))
	for _, key := range Keys {
		spec := Specs[key]
		for grade := 0; grade <= 12; grade++ {
			for i := 0; i < 60; i++ {
				round := spec.Make(grade, r)
				q := round.Question
				if q.Prompt.ID == "" || q.Prompt.EN == "" {
					t.Fatalf("%s g%d: empty prompt", key, grade)
				}
				if len(q.Options) < 4 || q.Answer < 0 || q.Answer >= len(q.Options) {
					t.Fatalf("%s g%d: %q has %d options, answer %d", key, grade, q.Prompt.ID, len(q.Options), q.Answer)
				}
				seen := map[string]bool{}
				for _, o := range q.Options {
					if seen[o.ID] {
						t.Fatalf("%s g%d: duplicate option %q in %q", key, grade, o.ID, q.Prompt.ID)
					}
					seen[o.ID] = true
				}
				if q.Key == "" || !strings.HasPrefix(q.Key, spec.Prefix+"-") {
					t.Fatalf("%s: key %q", key, q.Key)
				}
				if spec.RoundTime(grade) < 10*time.Second {
					t.Fatalf("%s g%d: round too short", key, grade)
				}
			}
		}
	}
}

func TestMarketMathAnswersAreCorrect(t *testing.T) {
	r := rand.New(rand.NewPCG(3, 4))
	for i := 0; i < 200; i++ {
		q := makeMarket(4, r).Question
		hint := q.Hint.ID
		if !strings.Contains(hint, q.Options[q.Answer].ID) {
			t.Fatalf("hint %q does not show answer %q", hint, q.Options[q.Answer].ID)
		}
	}
	if Rupiah(12500) != "Rp12.500" || Rupiah(500) != "Rp500" || Rupiah(1000000) != "Rp1.000.000" {
		t.Fatal("rupiah format")
	}
}

func TestSoloRoomPlaysEightRoundsAndReportsOnce(t *testing.T) {
	h := NewHub(Specs["mini-lab"], 7)
	now := time.Unix(1_800_000_000, 0)
	h.Join(claims(1, 5, "mini-lab"), "id")
	h.Create(claims(1, 5, "mini-lab"), now)
	if _, err := h.Start(2, now); err != lobby.ErrNoRoom {
		t.Fatalf("stranger start: %v", err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Answer(1, 0, now); err != ErrPhase {
		t.Fatalf("answer during countdown: %v", err)
	}
	now = now.Add(Countdown)
	h.Tick(now)
	for round := 0; round < Rounds; round++ {
		st := h.State(claims(1, 5, "mini-lab"), now)
		if st["step"] != StepQuestion {
			t.Fatalf("round %d step %v", round, st["step"])
		}
		q := st["question"].(Message)
		if _, leak := q["answer"]; leak {
			t.Fatal("answer leaked before reveal")
		}
		if _, err := h.Answer(1, answerFor(h, 1, true), now.Add(100*time.Millisecond)); err != ErrTooEarly {
			t.Fatalf("instant answer: %v", err)
		}
		now = now.Add(2 * time.Second)
		if _, err := h.Answer(1, answerFor(h, 1, round != 0), now); err != nil {
			t.Fatal(err)
		}
		if _, err := h.Answer(1, 0, now); err != ErrPhase {
			t.Fatalf("second answer: %v", err)
		}
		now = now.Add(RevealTime)
		h.Tick(now)
	}
	r := roomOf(h, 1)
	if r.Phase != lobby.PhaseDone {
		t.Fatalf("phase %s", r.Phase)
	}
	res := h.TakeResults()
	if len(res) != 1 {
		t.Fatalf("results %d", len(res))
	}
	got := res[0]
	want := points.Finished(points.Outcome(7*points.Current().PerCorrect, true, false), MaxPoints)
	if got.Correct != 7 || got.Wrong != 1 || got.Points != want || got.GameKey != "mini-lab" || got.Mission != Mission {
		t.Fatalf("result %+v want points %d", got, want)
	}
	if !strings.HasPrefix(got.EventID, "ml-1-room-") || got.Match == nil || got.Match.Mode != "solo" || !got.Match.Finished {
		t.Fatalf("event/match %+v", got)
	}
	if len(h.TakeResults()) != 0 {
		t.Fatal("reported twice")
	}
	st := h.State(claims(1, 5, "mini-lab"), now)
	if st["result"].(Message)["won"] != true {
		t.Fatal("7/8 solo should pass")
	}
}

func TestFriendsRaceAndTopScoreWins(t *testing.T) {
	h := NewHub(Specs["market-math"], 9)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 6, "market-math"), claims(2, 3, "market-math")
	h.Join(a, "id")
	h.Join(b, "en")
	h.Create(a, now)
	pin := roomOf(h, 1).Pin
	if _, err := h.Enter(b, pin, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(2, now); err != lobby.ErrNotHost {
		t.Fatalf("guest start: %v", err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	if roomOf(h, 1).Game.grade != 3 {
		t.Fatal("questions follow the lower grade")
	}
	now = now.Add(Countdown)
	h.Tick(now)
	for round := 0; round < Rounds; round++ {
		now = now.Add(time.Second)
		_, _ = h.Answer(1, answerFor(h, 1, true), now)
		if roomOf(h, 1).Game.step != StepQuestion {
			t.Fatal("round must wait for every player")
		}
		_, _ = h.Answer(2, answerFor(h, 2, round%2 == 0), now)
		if roomOf(h, 1).Game.step != StepReveal {
			t.Fatal("round ends when everyone answered")
		}
		now = now.Add(RevealTime)
		h.Tick(now)
	}
	res := h.TakeResults()
	if len(res) != 2 {
		t.Fatalf("results %d", len(res))
	}
	byUser := map[int64]Result{}
	for _, r := range res {
		byUser[r.UserID] = r
	}
	if byUser[1].Points != Award(8*points.Current().PerCorrect, true) || byUser[2].Points != Award(4*points.Current().PerCorrect, false) {
		t.Fatalf("points %+v", byUser)
	}
	if byUser[1].Match.Players[0].Rank != 1 || byUser[1].Match.Mode != "room" || byUser[1].Match.Key != byUser[2].Match.Key {
		t.Fatalf("match %+v", byUser[1].Match)
	}
}

func TestTimeoutCountsAsWrongAndLeaverIsPaidOnlyAfterThreeAnswers(t *testing.T) {
	h := NewHub(Specs["explore-indonesia"], 11)
	now := time.Unix(1_800_000_000, 0)
	a, b := claims(1, 8, "explore-indonesia"), claims(2, 8, "explore-indonesia")
	h.Create(a, now)
	_, _ = h.Enter(b, roomOf(h, 1).Pin, now)
	_, _ = h.Start(1, now)
	now = now.Add(Countdown)
	h.Tick(now)
	// Nobody answers: the round times out.
	now = now.Add(Specs["explore-indonesia"].RoundTime(8))
	h.Tick(now)
	r := roomOf(h, 1)
	if r.Game.step != StepReveal || r.Seats[0].Data.wrong != 1 {
		t.Fatalf("timeout: step %s wrong %d", r.Game.step, r.Seats[0].Data.wrong)
	}
	// Guest leaves after one answered (timed out) round: not paid.
	h.Leave(2, now)
	if len(h.TakeResults()) != 0 {
		t.Fatal("leaver below the minimum must not be paid")
	}
	if roomOf(h, 1).Phase != lobby.PhasePlaying {
		t.Fatal("host keeps playing")
	}
}

func TestBankQuestionsJoinTheRotation(t *testing.T) {
	spec := Specs["mini-lab"]
	spec.BankShare = 1
	h := NewHub(spec, 5)
	now := time.Unix(1_800_000_000, 0)
	h.Create(claims(1, 5, "mini-lab"), now)
	_, _ = h.Start(1, now)
	h.Tick(now.Add(Countdown))
	q := roomOf(h, 1).Game.current.Question
	if !q.FromBank || q.Subject != "science" {
		t.Fatalf("expected a bundled science bank question, got %+v", q)
	}
}
