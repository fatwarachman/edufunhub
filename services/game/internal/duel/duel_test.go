package duel

import (
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/points"
)

var t0 = time.Date(2026, 10, 4, 8, 0, 0, 0, time.UTC)

func claims(id int64, grade int) auth.Claims {
	return auth.Claims{Subject: id, Name: "P" + string(rune('A'+id)), Grade: grade, Game: GameKey}
}

// startQuestion drives a fresh match past the countdown.
func startQuestion(t *testing.T, h *Hub, now time.Time) time.Time {
	t.Helper()
	now = now.Add(Countdown)
	h.Tick(now)
	return now
}

func answerOf(h *Hub, uid int64) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.matches[uid].question.Answer
}

func phaseOf(h *Hub, uid int64) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.matches[uid]; ok {
		return m.phase
	}
	return ""
}

func TestMatchesSameBandAndKeepsOtherBandsWaiting(t *testing.T) {
	h := NewHub(1)
	h.Join(claims(1, 4), "id", t0)
	if ids, _ := h.Queue(claims(1, 4), "", t0); len(ids) != 1 {
		t.Fatalf("first player should wait, got %v", ids)
	}
	if _, err := h.Queue(claims(2, 11), "", t0); err != nil {
		t.Fatal(err)
	}
	if phaseOf(h, 2) != "" {
		t.Fatal("grade 11 must not be matched with grade 4")
	}
	ids, _ := h.Queue(claims(3, 5), "", t0)
	if len(ids) != 2 || phaseOf(h, 1) != PhaseCountdown || phaseOf(h, 3) != PhaseCountdown {
		t.Fatalf("grade 4 and 5 share a band and must be matched: %v", ids)
	}
	if _, q := h.Counts(); q != 1 {
		t.Fatalf("grade 11 should still be queued, got %d", q)
	}
}

func TestFullDuelScoresAndReportsBothPlayers(t *testing.T) {
	h := NewHub(7)
	h.Queue(claims(1, 6), "", t0)
	h.Queue(claims(2, 6), "", t0)
	now := startQuestion(t, h, t0)
	var results []Result
	for r := 0; r < Rounds; r++ {
		if phaseOf(h, 1) != PhaseQuestion {
			t.Fatalf("round %d: phase %s", r, phaseOf(h, 1))
		}
		correct := answerOf(h, 1)
		if _, err := h.Answer(1, correct, now); err != ErrTooEarly {
			t.Fatalf("instant answer must be refused, got %v", err)
		}
		now = now.Add(2 * time.Second)
		if _, err := h.Answer(1, correct, now); err != nil {
			t.Fatal(err)
		}
		if _, err := h.Answer(1, correct, now); err != ErrAnswered {
			t.Fatalf("double answer: %v", err)
		}
		wrong := (correct + 1) % Options
		if _, err := h.Answer(2, wrong, now.Add(time.Second)); err != nil {
			t.Fatal(err)
		}
		if phaseOf(h, 1) != PhaseReveal {
			t.Fatal("both answered: round must be revealed")
		}
		now = now.Add(time.Second + RevealGap)
		_, res := h.Tick(now)
		results = append(results, res...)
	}
	if phaseOf(h, 1) != PhaseDone || len(results) != 2 {
		t.Fatalf("match must end with two results, got %s %d", phaseOf(h, 1), len(results))
	}
	byUser := map[int64]Result{}
	for _, r := range results {
		byUser[r.UserID] = r
	}
	if w := byUser[1]; w.Correct != Rounds || w.Points != Rounds*10+20+5 || w.GameKey != GameKey || w.Mission != Mission {
		t.Fatalf("winner result %+v", w)
	}
	if l := byUser[2]; l.Correct != 0 || l.Wrong != Rounds || l.Points != points.Defaults.Participation {
		t.Fatalf("loser result %+v", l)
	}
	if byUser[1].EventID == byUser[2].EventID {
		t.Fatal("event ids must be unique per player")
	}
	m := byUser[1].Match
	if m == nil || byUser[2].Match == nil || m.Key != byUser[2].Match.Key || m.Mode != "random" || m.Players[0].Rank != 1 || m.Players[1].Rank != 2 || m.Players[1].Wrong != Rounds {
		t.Fatalf("match summary %+v", m)
	}
	st := h.State(claims(1, 6), now)
	if st["result"].(Message)["outcome"] != OutcomeWin {
		t.Fatalf("state result %v", st["result"])
	}
}

func TestRoundTimesOutAndUnansweredCountsWrong(t *testing.T) {
	h := NewHub(3)
	h.Queue(claims(1, 2), "", t0)
	h.Queue(claims(2, 2), "", t0)
	now := startQuestion(t, h, t0)
	h.Answer(1, answerOf(h, 1), now.Add(time.Second))
	h.Tick(now.Add(RoundTime - time.Millisecond))
	if phaseOf(h, 1) != PhaseQuestion {
		t.Fatal("round must stay open until the timer ends")
	}
	h.Tick(now.Add(RoundTime))
	if phaseOf(h, 1) != PhaseReveal {
		t.Fatal("round must close when time runs out")
	}
	h.mu.Lock()
	m := h.matches[2]
	wrong := m.players[1].wrong
	h.mu.Unlock()
	if wrong != 1 {
		t.Fatalf("unanswered round counts as wrong, got %d", wrong)
	}
}

func TestBotJoinsAfterWaitAndAnswers(t *testing.T) {
	h := NewHub(11)
	h.Queue(claims(1, 9), "", t0)
	h.Tick(t0.Add(BotAfter - time.Millisecond))
	if phaseOf(h, 1) != "" {
		t.Fatal("bot joined too early")
	}
	ids, _ := h.Tick(t0.Add(BotAfter))
	if len(ids) != 1 || phaseOf(h, 1) != PhaseCountdown {
		t.Fatalf("bot match not started: %v %s", ids, phaseOf(h, 1))
	}
	st := h.State(claims(1, 9), t0.Add(BotAfter))
	if op := st["opponent"].(Message); op["bot"] != true || op["name"] != BotName {
		t.Fatalf("opponent %v", op)
	}
	now := startQuestion(t, h, t0.Add(BotAfter))
	h.Tick(now.Add(11 * time.Second))
	h.mu.Lock()
	answered := h.matches[1].players[1].answered
	h.mu.Unlock()
	if !answered {
		t.Fatal("bot must answer within 11s")
	}
	h.mu.Lock()
	summary := h.matches[1].summary(now)
	h.mu.Unlock()
	if summary.Mode != "bot" || !summary.Players[1].Bot || summary.Players[1].UserID != 0 {
		t.Fatalf("bot matches are recorded as bot mode: %+v", summary)
	}
}

func TestAnswerIsHiddenUntilReveal(t *testing.T) {
	h := NewHub(5)
	h.Queue(claims(1, 3), "", t0)
	h.Queue(claims(2, 3), "", t0)
	now := startQuestion(t, h, t0)
	st := h.State(claims(1, 3), now)
	if _, ok := st["reveal"]; ok {
		t.Fatal("answer leaked during question phase")
	}
	if len(st["question"].(Message)["options"].([]string)) != Options {
		t.Fatalf("options %v", st["question"])
	}
	h.Answer(1, 0, now.Add(time.Second))
	if op := h.State(claims(2, 3), now.Add(time.Second))["opponent"].(Message); op["answered"] != true {
		t.Fatal("opponent should see that player 1 answered")
	}
}

func TestQueueAgainAfterMatchAndCancel(t *testing.T) {
	h := NewHub(9)
	h.Queue(claims(1, 1), "", t0)
	h.Cancel(1)
	if _, q := h.Counts(); q != 0 {
		t.Fatal("cancel must leave the queue")
	}
	h.Queue(claims(1, 1), "", t0)
	h.Queue(claims(2, 1), "", t0)
	if _, err := h.Queue(claims(1, 1), "", t0); err != ErrPhase {
		t.Fatalf("cannot queue during a live match: %v", err)
	}
}

func TestAwardRules(t *testing.T) {
	cases := []struct {
		correct int
		outcome string
		want    int
	}{
		// earned points, outcome: a draw adds nothing, a loss keeps earned points.
		{50, OutcomeWin, 75}, {30, OutcomeDraw, 35}, {20, OutcomeLose, 25}, {0, OutcomeLose, 5}, {0, OutcomeDraw, 5},
	}
	for _, c := range cases {
		if got := Award(c.correct, c.outcome); got != c.want {
			t.Fatalf("Award(%d,%s)=%d want %d", c.correct, c.outcome, got, c.want)
		}
	}
}

func TestPruneDropsFinishedMatches(t *testing.T) {
	h := NewHub(2)
	h.Queue(claims(1, 7), "", t0)
	h.Queue(claims(2, 7), "", t0)
	h.Prune(t0.Add(StaleAfter + time.Second))
	if phaseOf(h, 1) != "" {
		t.Fatal("abandoned offline match must be pruned")
	}
}
