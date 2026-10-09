package pingpong

import (
	"encoding/json"
	"math/rand/v2"
	"strings"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
)

// useBank installs a tiny bank for the test: two science questions for
// ping-pong (one worth bonus points), one social question for another game.
func useBank(t *testing.T) {
	t.Helper()
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"pp-sci-1","type":"choice","band":3,"subject":"science","prompt":{"id":"Planet terbesar?","en":"Largest planet?"},"options":[{"id":"Jupiter","en":"Jupiter"},{"id":"Mars","en":"Mars"},{"id":"Bumi","en":"Earth"},{"id":"Venus","en":"Venus"},{"id":"Merkurius","en":"Mercury"}],"answer":0,"hint":{"id":"Jupiter paling besar.","en":"Jupiter is the largest."},"games":["ping-pong"],"points":20},
		{"key":"pp-sci-2","type":"choice","band":3,"subject":"science","prompt":{"id":"Rumus air?","en":"Formula of water?"},"options":[{"id":"H2O"},{"id":"CO2"},{"id":"O2"}],"answer":0,"games":["ping-pong"]},
		{"key":"other-social","type":"choice","band":3,"subject":"social","prompt":{"id":"Ibu kota?"},"options":[{"id":"A"},{"id":"B"},{"id":"C"}],"answer":1,"games":["sky-quiz"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	questions.Use(bank)
	questions.History.Reset()
	t.Cleanup(func() {
		questions.Use(nil)
		questions.UseSubjects(questions.BuiltinSubjects)
		questions.History.Reset()
	})
}

// setupSubject creates a room (1 human = bot match, 2 humans = room match),
// sets the subject and starts it.
func setupSubject(t *testing.T, humans int, subject string) (*Hub, auth.Claims, time.Time) {
	t.Helper()
	h := NewHub(42)
	now := time.Unix(1000, 0)
	c := auth.Claims{Subject: 1, Name: "Rani", Grade: 10, Level: 3, Game: GameKey, Character: json.RawMessage(`{"hair":"blue"}`)}
	h.Join(c, "id")
	pin, _ := h.Create(c, now)
	if humans == 2 {
		b := auth.Claims{Subject: 2, Name: "Budi", Grade: 10, Level: 3, Game: GameKey}
		h.Join(b, "en")
		if _, err := h.Enter(b, pin, now); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.SetSubject(1, subject, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	return h, c, now
}

func setupRoom(t *testing.T, humans int) (*Hub, auth.Claims, time.Time) {
	t.Helper()
	useBank(t)
	return setupSubject(t, humans, "science")
}

// current reads the server-side question (tests only).
func current(h *Hub) (turn, round int, q questions.Question) {
	h.rooms.View(1, func(r *room) { turn, round, q = r.Game.turn, r.Game.round, r.Game.question })
	return
}

func wrongOf(q questions.Question) int { return (q.Answer + 1) % len(q.Options) }

func TestDoneRosterChangesRemainSafe(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	h.Leave(2, now)
	pin := h.State(c, now)["pin"].(string)
	newcomer := auth.Claims{Subject: 3, Name: "Citra", Grade: 10, Game: GameKey}
	if _, err := h.Enter(newcomer, pin, now); err != nil {
		t.Fatal(err)
	}
	s := h.State(newcomer, now)
	if s["phase"] != "lobby" || len(s["players"].([]Message)) != 2 || s["question"] != nil {
		t.Fatal(s)
	}
}

func TestSnapshotIsDetached(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	s := h.State(c, now)
	s["players"].([]Message)[0]["character"].(json.RawMessage)[0] = 'x'
	s["question"].(Message)["options"].([]string)[0] = "tampered"
	again := h.State(c, now)
	if raw := again["players"].([]Message)[0]["character"].(json.RawMessage); raw[0] != '{' {
		t.Fatal("avatar aliases room")
	}
	if again["question"].(Message)["options"].([]string)[0] == "tampered" {
		t.Fatal("options alias room")
	}
}

func TestLobbyPayloadHasNoQuestion(t *testing.T) {
	useBank(t)
	h := NewHub(1)
	now := time.Unix(1000, 0)
	c := auth.Claims{Subject: 1, Name: "Rani", Grade: 10, Game: GameKey}
	h.Join(c, "id")
	h.Create(c, now)
	s := h.State(c, now)
	if s["phase"] != "lobby" || s["question"] != nil || s["subject"] != "mix" || s["subject_fallback"] != false || s["feedback"] != nil {
		t.Fatal(s)
	}
	if _, ok := s["term"]; ok {
		t.Fatal("legacy term field")
	}
}

func TestSubjectOnlyHostInLobby(t *testing.T) {
	useBank(t)
	h := NewHub(7)
	now := time.Unix(1000, 0)
	a := auth.Claims{Subject: 1, Name: "Rani", Grade: 10, Game: GameKey}
	b := auth.Claims{Subject: 2, Name: "Budi", Grade: 10, Game: GameKey}
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	h.Enter(b, pin, now)
	if _, err := h.SetSubject(2, "science", now); err != lobby.ErrNotHost {
		t.Fatal(err)
	}
	if _, err := h.SetSubject(1, "science", now); err != nil {
		t.Fatal(err)
	}
	if s := h.State(b, now); s["subject"] != "science" {
		t.Fatal(s["subject"])
	}
	if _, err := h.SetSubject(1, "nonsense", now); err != nil {
		t.Fatal(err)
	}
	if s := h.State(b, now); s["subject"] != "mix" {
		t.Fatal(s["subject"])
	}
	h.SetSubject(1, "science", now)
	h.Start(1, now)
	if _, err := h.SetSubject(1, "mix", now); err != lobby.ErrPhase {
		t.Fatal(err)
	}
	s := h.State(a, now)
	if s["subject"] != "science" || s["subject_fallback"] != false {
		t.Fatal(s)
	}
	for i := 0; i < 6; i++ {
		turn, round, q := current(h)
		if q.Subject != "science" || !q.FromBank || !strings.HasPrefix(q.Key, "pp-sci-") || len(q.Options) > Options {
			t.Fatalf("question %d: %+v", i, q)
		}
		if _, err := h.Answer(int64(turn+1), round, q.Answer, now); err != nil {
			t.Fatal(err)
		}
	}
}

func TestSubjectFallbackFlag(t *testing.T) {
	useBank(t)
	questions.UseSubjects(append(append([]string{}, questions.BuiltinSubjects...), "robotics"))
	h, c, _ := setupSubject(t, 1, "robotics")
	s := h.State(c, time.Unix(1000, 0))
	if s["subject"] != "robotics" || s["subject_fallback"] != true {
		t.Fatal(s)
	}
	if q := s["question"].(Message); q["text"] == "" || len(q["options"].([]string)) < 2 {
		t.Fatal(q)
	}
}

func TestQuestionPayloadHidesAnswer(t *testing.T) {
	h, c, now := setupRoom(t, 1)
	s := h.State(c, now)
	q := s["question"].(Message)
	for _, k := range []string{"answer", "correct", "hint"} {
		if _, ok := q[k]; ok {
			t.Fatalf("leaks %s", k)
		}
	}
	_, round, _ := current(h)
	if q["id"] != s["pin"].(string)+"-"+itoa(round) || q["subject"] != "science" || len(q["options"].([]string)) > Options {
		t.Fatal(q)
	}
	raw, _ := json.Marshal(s)
	if strings.Contains(string(raw), `"layer"`) || strings.Contains(string(raw), `"term"`) {
		t.Fatal(string(raw))
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

func TestTimeoutBoundaryAndValidation(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	_, round, q := current(h)
	for _, tt := range []struct {
		uid           int64
		round, option int
		want          error
	}{{2, round, 0, ErrTurn}, {1, round - 1, 0, ErrStale}, {1, round, len(q.Options), ErrOption}, {1, round, -1, ErrOption}} {
		if _, err := h.Answer(tt.uid, tt.round, tt.option, now); err != tt.want {
			t.Fatalf("%+v: %v", tt, err)
		}
	}
	h.Answer(1, round, q.Answer, now.Add(AnswerTime))
	s := h.State(c, now.Add(AnswerTime))
	f := s["feedback"].(Message)
	if s["goals"] != [2]int{0, 1} || s["turn"] != 0 || f["correct"] != false || f["goal"] != true {
		t.Fatal(s)
	}
	if f["answer"] != q.Options[q.Answer].Get("id") || f["prompt"] != q.Prompt.Get("id") {
		t.Fatal(f)
	}
	res := h.TakeResults()
	if len(res) != 0 {
		t.Fatal(res)
	}
	h.Stop(1, now.Add(AnswerTime))
	for _, r := range h.TakeResults() {
		if r.UserID == 1 && (len(r.Answers) != 1 || r.Answers[0].Correct || r.Answers[0].Choice != nil) {
			t.Fatalf("timeout answer %+v", r.Answers)
		}
	}
}

func TestCorrectReturnsBallWrongIsGoalAndAnswersRecorded(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	_, round, q := current(h)
	if _, err := h.Answer(1, round, q.Answer, now); err != nil {
		t.Fatal(err)
	}
	s := h.State(c, now)
	f := s["feedback"].(Message)
	if s["turn"] != 1 || s["rally"] != 1 || s["goals"] != [2]int{} || f["correct"] != true || f["goal"] != false || f["seat"] != 0 {
		t.Fatal(s)
	}
	if q.Key == "pp-sci-1" && f["hint"] != "Jupiter paling besar." {
		t.Fatal(f)
	}
	if en := h.State(auth.Claims{Subject: 2}, now)["feedback"].(Message); en["prompt"] != q.Prompt.Get("en") {
		t.Fatal(en)
	}
	_, round2, q2 := current(h)
	wrong := wrongOf(q2)
	if _, err := h.Answer(2, round2, wrong, now); err != nil {
		t.Fatal(err)
	}
	s = h.State(c, now)
	if s["goals"] != [2]int{1, 0} || s["rally"] != 0 || s["turn"] != 1 {
		t.Fatal(s)
	}
	h.Stop(1, now.Add(time.Second))
	res := h.TakeResults()
	if len(res) != 2 {
		t.Fatal(res)
	}
	for _, r := range res {
		if len(r.Answers) != 1 {
			t.Fatalf("%d answers %+v", r.UserID, r.Answers)
		}
		a := r.Answers[0]
		switch r.UserID {
		case 1:
			if a.Key != q.Key || !a.Correct || a.Choice == nil || *a.Choice != *q.Original(q.Answer) || *a.Choice != 0 {
				t.Fatalf("host %+v", a)
			}
			// Host leads 1-0 when stopped, so the win bonus applies.
			if want := points.Finished(points.Outcome(q.Worth(), true, false), MaxPoints); r.Points != want {
				t.Fatalf("points %d want %d", r.Points, want)
			}
		case 2:
			if a.Key != q2.Key || a.Correct || a.Choice == nil || *a.Choice != *q2.Original(wrong) || *a.Choice == 0 {
				t.Fatalf("guest %+v", a)
			}
		}
	}
}

func TestWorthUsesQuestionBonus(t *testing.T) {
	h, _, now := setupRoom(t, 2)
	for i := 0; i < 4; i++ {
		turn, round, q := current(h)
		before := h.State(auth.Claims{Subject: 1}, now)["question"].(Message)["worth"]
		if before != q.Worth() {
			t.Fatalf("payload worth %v want %d", before, q.Worth())
		}
		want := points.Worth(0, q.Level)
		if q.Key == "pp-sci-1" {
			want = points.Worth(20, q.Level)
		}
		if q.Worth() != want || (q.Key == "pp-sci-1" && q.Worth() <= points.Worth(0, q.Level)) {
			t.Fatalf("%s worth %d want %d", q.Key, q.Worth(), want)
		}
		h.Answer(int64(turn+1), round, q.Answer, now)
	}
}

func TestSixtyReturnsDrawPointsAndRestart(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	earned := [2]int{}
	for i := 0; i < MaxRounds; i++ {
		turn, round, q := current(h)
		earned[turn] += q.Worth()
		if _, err := h.Answer(int64(turn+1), round, q.Answer, now.Add(time.Duration(i)*time.Millisecond)); err != nil {
			t.Fatal(err)
		}
	}
	s := h.State(c, now)
	if s["phase"] != "done" || s["winner"] != nil || s["round"] != 60 {
		t.Fatal(s)
	}
	results := h.TakeResults()
	if len(results) != 2 || results[0].Points != points.Finished(earned[0], MaxPoints) || results[0].Match.Level != 3 || len(results[0].Answers) != 30 {
		t.Fatal(results)
	}
	h.Stop(1, now)
	if len(h.TakeResults()) != 0 {
		t.Fatal("duplicate payout")
	}
	h.Start(1, now.Add(time.Minute))
	if _, err := h.Answer(1, 1, 0, now.Add(time.Minute)); err != ErrStale {
		t.Fatal(err)
	}
}

func TestLowestGradeAndLevelPickQuestions(t *testing.T) {
	useBank(t)
	h := NewHub(3)
	now := time.Unix(1000, 0)
	a := auth.Claims{Subject: 1, Name: "Rani", Grade: 10, Level: 3, Game: GameKey}
	b := auth.Claims{Subject: 2, Name: "Budi", Grade: 4, Level: 2, Game: GameKey}
	h.Join(a, "id")
	h.Join(b, "id")
	pin, _ := h.Create(a, now)
	h.Enter(b, pin, now)
	h.Start(1, now)
	h.rooms.View(1, func(r *room) {
		if r.Game.grade != 4 || r.Game.level != 2 || r.Game.gen.Grade != 4 || r.Game.gen.Level != 2 {
			t.Fatalf("grade %d level %d", r.Game.grade, r.Game.level)
		}
	})
	if s := h.State(a, now); s["level"] != 2 {
		t.Fatal(s["level"])
	}
}

func TestStopLeavePruneHandover(t *testing.T) {
	h, c, now := setupRoom(t, 2)
	if _, err := h.Stop(2, now); err != lobby.ErrNotHost {
		t.Fatal(err)
	}
	h.Offline(1)
	h.HandOver(now)
	h.HandOver(now.Add(lobby.HostGrace))
	if h.State(c, now)["host"] != 1 {
		t.Fatal("handover")
	}
	_, paid := h.Leave(1, now.Add(time.Second))
	if paid != 0 {
		t.Fatal(paid)
	}
	res := h.TakeResults()
	if len(res) != 1 || res[0].UserID != 2 || res[0].Match.Players[0].Left != true || res[0].Answers == nil {
		t.Fatal(res)
	}
	h, c, now = setupRoom(t, 1)
	h.Stop(1, now.Add(time.Second))
	res = h.TakeResults()
	if len(res) != 1 || res[0].Match.Mode != "bot" || res[0].Match.Players[1].UserID != 0 || !res[0].Match.Players[1].Bot {
		t.Fatal(res)
	}
	h, c, now = setupRoom(t, 1)
	h.Offline(c.Subject)
	h.Prune(now.Add(31 * time.Minute))
	if n, _ := h.Counts(); n != 0 {
		t.Fatal(n)
	}
}

func TestLeaveMidGameKeepsEarnedPoints(t *testing.T) {
	h, _, now := setupRoom(t, 2)
	_, round, q := current(h)
	h.Answer(1, round, q.Answer, now)
	_, paid := h.Leave(1, now.Add(time.Second))
	if want := points.Abandoned(q.Worth(), 1, MaxPoints); paid != want || paid <= 0 {
		t.Fatalf("paid %d want %d", paid, want)
	}
	for _, r := range h.TakeResults() {
		if r.UserID == 1 && (r.Points != paid || len(r.Answers) != 1 || !r.Answers[0].Correct) {
			t.Fatal(r)
		}
	}
}

func TestBotAnswersAndNeverRecordsAnswers(t *testing.T) {
	h, c, now := setupRoom(t, 1)
	botRight := 0
	at := now
	for i := 0; i < 200; i++ {
		turn, round, q := current(h)
		if h.State(c, at)["phase"] != "playing" {
			h.TakeResults()
			h.Start(1, at)
			continue
		}
		if turn == 0 {
			h.Answer(1, round, q.Answer, at)
			continue
		}
		before, _ := json.Marshal(h.State(c, at))
		h.Tick(at.Add(500 * time.Millisecond))
		if _, r, _ := current(h); r != round {
			t.Fatal("bot answered too early")
		}
		at = at.Add(2 * time.Second)
		h.Tick(at)
		_, r2, _ := current(h)
		if r2 == round && h.State(c, at)["phase"] == "playing" {
			t.Fatalf("bot did not answer: %s", before)
		}
		h.rooms.View(1, func(r *room) { botRight += r.Game.botData.correct })
	}
	if botRight == 0 {
		t.Fatal("bot never right")
	}
	h.Stop(1, at)
	for _, r := range h.TakeResults() {
		if r.UserID != 1 {
			t.Fatal(r)
		}
		for _, a := range r.Answers {
			if !a.Correct {
				t.Fatalf("human only answered correctly: %+v", a)
			}
		}
	}
}

func TestBotAccuracyRoughlyThreeQuarters(t *testing.T) {
	g := &game{rng: rand.New(rand.NewPCG(1, 2))}
	right := 0
	g.question = questions.Question{Options: make([]questions.Text, 4), Answer: 2}
	for i := 0; i < 4000; i++ {
		pick := botPick(g)
		if pick < 0 || pick >= 4 {
			t.Fatal(pick)
		}
		if pick == 2 {
			right++
		}
	}
	if right < 2800 || right > 3200 {
		t.Fatalf("bot right %d/4000", right)
	}
}

func TestBotDeterminismAndConcurrentSnapshots(t *testing.T) {
	useBank(t)
	a, c, now := setupSubject(t, 1, "science")
	questions.History.Reset()
	b, _, _ := setupSubject(t, 1, "science")
	questions.History.Reset()
	for i := 0; i < 30; i++ {
		at := now.Add(time.Duration(i) * 3 * time.Second)
		a.Tick(at)
		b.Tick(at)
		x, _ := json.Marshal(a.State(c, at)["goals"])
		y, _ := json.Marshal(b.State(c, at)["goals"])
		if string(x) != string(y) {
			t.Fatal("seed divergence")
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				json.Marshal(a.State(c, now))
				a.Tick(now.Add(time.Duration(j) * time.Second))
				a.SetLocale(1, []string{"en", "id"}[i%2])
				if j%10 == 0 {
					turn, round, q := current(a)
					if turn == 0 && len(q.Options) > 0 {
						a.Answer(1, round, q.Answer, now)
					}
				}
			}
		}(i)
	}
	wg.Wait()
}

func TestDoneMatchTimestampStable(t *testing.T) {
	h, c, now := setupRoom(t, 1)
	h.Stop(1, now.Add(time.Second))
	a, _ := json.Marshal(h.State(c, now)["match"])
	b, _ := json.Marshal(h.State(c, now.Add(time.Hour))["match"])
	if string(a) != string(b) {
		t.Fatal("done match changes on sync")
	}
	if s := h.State(c, now); s["question"] == nil || s["subject"] != "science" {
		t.Fatal(s)
	}
}

func TestMaxPointsCap(t *testing.T) {
	if MaxPoints != 18150 || MaxPoints != points.Cap(MaxRounds) {
		t.Fatal(MaxPoints)
	}
}

func TestSoloCorrectReturnWrongGoal(t *testing.T) {
	useBank(t)
	now := time.Unix(1000, 0)
	h := NewHub(42)
	c := auth.Claims{Subject: 1, Name: "Rani", Grade: 10, Level: 2, Game: GameKey}
	h.Join(c, "en")
	pin, _ := h.Create(c, now)
	if len(pin) != 6 {
		t.Fatal(pin)
	}
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	s := h.State(c, now)
	if s["phase"] != "playing" || s["turn"] != 0 || s["subject"] != "mix" {
		t.Fatal(s)
	}
	players := s["players"].([]Message)
	if len(players) != 2 || players[1]["bot"] != true || players[1]["controlled"] != false {
		t.Fatal(players)
	}
	_, round, q := current(h)
	if _, err := h.Answer(1, round, q.Answer, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	s = h.State(c, now.Add(time.Second))
	if s["turn"] != 1 || s["rally"] != 1 || s["goals"] != [2]int{} {
		t.Fatal(s)
	}
	if _, err := h.Answer(1, round, q.Answer, now.Add(time.Second)); err != ErrStale {
		t.Fatalf("duplicate: %v", err)
	}
	h.Tick(now.Add(4 * time.Second))
	s = h.State(c, now.Add(4*time.Second))
	if s["round"].(int) != round+2 {
		t.Fatal(s)
	}
}

func TestRematchTurnNumberRestartsAtOne(t *testing.T) {
	h, c, now := setupRoom(t, 1)
	first := h.State(c, now)
	if first["turn_number"] != 1 {
		t.Fatalf("first match turn_number %v", first["turn_number"])
	}
	h.Stop(1, now.Add(time.Second))
	h.TakeResults()
	if _, err := h.Start(1, now.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	again := h.State(c, now.Add(2*time.Second))
	if again["turn_number"] != 1 || again["round"].(int) <= first["round"].(int) || again["feedback"] != nil {
		t.Fatalf("rematch turn_number %v round %v (first round %v)", again["turn_number"], again["round"], first["round"])
	}
}
