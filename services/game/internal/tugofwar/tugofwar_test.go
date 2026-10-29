package tugofwar

import (
	"encoding/json"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/points"
	"edufunhub/game/internal/questions"
)

func useBank(t *testing.T) {
	t.Helper()
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"tw-1","type":"choice","band":3,"subject":"science","prompt":{"id":"Planet terbesar?","en":"Largest planet?"},"options":[{"id":"Jupiter"},{"id":"Mars"},{"id":"Bumi"},{"id":"Venus"}],"answer":0,"hint":{"id":"Jupiter paling besar."},"games":["tug-of-war"]},
		{"key":"tw-2","type":"choice","band":3,"subject":"science","prompt":{"id":"Rumus air?","en":"Formula of water?"},"options":[{"id":"H2O"},{"id":"CO2"},{"id":"O2"}],"answer":0,"games":["tug-of-war"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	questions.Use(bank)
	questions.History.Reset()
	t.Cleanup(func() { questions.Use(nil); questions.History.Reset() })
}

func claims(id int64, name string) auth.Claims {
	return auth.Claims{Subject: id, Name: name, Grade: 10, Level: 1, Game: GameKey, Character: json.RawMessage(`{"color":"teal"}`)}
}

// setup opens a room with n humans (ids 1..n) and returns it in the lobby.
func setup(t *testing.T, n int) (*Hub, string, time.Time) {
	t.Helper()
	useBank(t)
	h := NewHub(7)
	now := time.Unix(1000, 0)
	h.Join(claims(1, "P1"), "id")
	pin, _ := h.Create(claims(1, "P1"), now)
	for id := int64(2); id <= int64(n); id++ {
		h.Join(claims(id, "P"), "id")
		if _, err := h.Enter(claims(id, "P"), pin, now); err != nil {
			t.Fatal(err)
		}
	}
	return h, pin, now
}

// begin starts and skips the countdown; returns the time the first question shows.
func begin(t *testing.T, h *Hub, now time.Time) time.Time {
	t.Helper()
	if _, err := h.Start(1, now); err != nil {
		t.Fatal(err)
	}
	at := now.Add(Countdown)
	h.Tick(at)
	return at
}

func peek(h *Hub) (g game) {
	h.rooms.View(1, func(r *room) { g = r.Game })
	return
}

func wrong(q questions.Question) int { return (q.Answer + 1) % len(q.Options) }

func TestNewcomersBalanceTeams(t *testing.T) {
	h, _, now := setup(t, 4)
	s := h.State(claims(1, "P1"), now)
	var size [2]int
	for _, p := range s["players"].([]Message) {
		size[p["team"].(int)]++
	}
	if size != [2]int{2, 2} {
		t.Fatal(size)
	}
	if s["question"] != nil || s["stage"] != nil {
		t.Fatal("lobby leaks question", s)
	}
}

func TestStartNeedsEvenBalancedTeams(t *testing.T) {
	h, _, now := setup(t, 3)
	if _, err := h.Start(1, now); err != ErrOdd {
		t.Fatal(err)
	}
	h2, _, now2 := setup(t, 4)
	if _, err := h2.SetTeam(1, 1, TeamRed, now2); err != nil {
		t.Fatal(err)
	}
	if _, err := h2.Start(1, now2); err != ErrUnbalanced {
		t.Fatal(err)
	}
	if _, err := h2.SetTeam(2, 1, TeamBlue, now2); err != lobby.ErrNotHost {
		t.Fatal("non-host moved a player", err)
	}
	if _, err := h2.SetTeam(1, 1, 5, now2); err != ErrTeam {
		t.Fatal(err)
	}
	if _, err := h2.ShuffleTeams(1, now2); err != nil {
		t.Fatal(err)
	}
	if _, err := h2.Start(1, now2); err != nil {
		t.Fatal(err)
	}
}

func TestQuestionCountSetting(t *testing.T) {
	h, _, now := setup(t, 1)
	if _, err := h.SetQuestions(1, 7, now); err != ErrCount {
		t.Fatal(err)
	}
	if _, err := h.SetQuestions(1, 5, now); err != nil {
		t.Fatal(err)
	}
	if h.State(claims(1, "P1"), now)["question_count"] != 5 {
		t.Fatal("count not applied")
	}
}

func TestCorrectAnswerPullsRopeAndHidesKey(t *testing.T) {
	h, _, now := setup(t, 2)
	at := begin(t, h, now)
	s := h.State(claims(1, "P1"), at)
	q := s["question"].(Message)
	for _, k := range []string{"answer", "correct_index", "hint"} {
		if _, ok := q[k]; ok {
			t.Fatal("question leaks", k)
		}
	}
	g := peek(h)
	if _, err := h.Answer(1, g.round, g.question.Answer, at.Add(100*time.Millisecond)); err != ErrEarly {
		t.Fatal("too early accepted", err)
	}
	if _, err := h.Answer(1, g.round+1, 0, at.Add(time.Second)); err != ErrStale {
		t.Fatal(err)
	}
	if _, err := h.Answer(1, g.round, 9, at.Add(time.Second)); err != ErrOption {
		t.Fatal(err)
	}
	// Player 1 is red (host), player 2 blue.
	if _, err := h.Answer(2, g.round, g.question.Answer, at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	g = peek(h)
	if g.rope != 1 || g.stage != StageReveal || g.reveal.team != TeamBlue {
		t.Fatal(g.rope, g.stage, g.reveal)
	}
	if _, err := h.Answer(1, g.round, 0, at.Add(2*time.Second)); err != ErrStale {
		t.Fatal("answer during reveal", err)
	}
	rv := h.State(claims(1, "P1"), at.Add(time.Second))["reveal"].(Message)
	if rv["team"] != TeamBlue || rv["answer"] == "" {
		t.Fatal(rv)
	}
}

func TestWrongAnswerLocksPlayerAndAllWrongResolvesWithoutPull(t *testing.T) {
	h, _, now := setup(t, 2)
	at := begin(t, h, now)
	g := peek(h)
	if _, err := h.Answer(1, g.round, wrong(g.question), at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Answer(1, g.round, g.question.Answer, at.Add(2*time.Second)); err != ErrAnswered {
		t.Fatal("second try allowed", err)
	}
	if peek(h).stage != StageQuestion {
		t.Fatal("resolved before everyone answered")
	}
	if _, err := h.Answer(2, g.round, wrong(g.question), at.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	g = peek(h)
	if g.stage != StageReveal || g.rope != 0 || g.reveal.team != -1 {
		t.Fatal(g.stage, g.rope, g.reveal)
	}
}

func TestTimeoutResolvesAndNextQuestionFollows(t *testing.T) {
	h, _, now := setup(t, 2)
	at := begin(t, h, now)
	g := peek(h)
	h.Tick(g.deadline)
	g = peek(h)
	if g.stage != StageReveal || g.rope != 0 {
		t.Fatal(g.stage)
	}
	h.Tick(g.stageUntil)
	if peek(h).number != 2 || peek(h).stage != StageQuestion {
		t.Fatal("no next question")
	}
	_ = at
}

// pullRed lets the red team (seat 0, user 1) win one round.
func pullRed(t *testing.T, h *Hub, at time.Time) time.Time {
	t.Helper()
	g := peek(h)
	if _, err := h.Answer(1, g.round, g.question.Answer, at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	next := at.Add(time.Second + RevealTime)
	h.Tick(next)
	return next
}

func TestTeamWinPaysSamePointsAndMVPBonus(t *testing.T) {
	h, _, now := setup(t, 4)
	if _, err := h.SetQuestions(1, 30, now); err != nil {
		t.Fatal(err)
	}
	// Red = users 1 and 3, blue = 2 and 4 (balanced newcomers).
	at := begin(t, h, now)
	at = pullRed(t, h, at)
	g := peek(h)
	if _, err := h.Answer(3, g.round, g.question.Answer, at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	at = at.Add(time.Second + RevealTime)
	h.Tick(at)
	for i := 0; i < WinSteps-2; i++ {
		at = pullRed(t, h, at)
	}
	s := h.State(claims(1, "P1"), at)
	if s["phase"] != lobby.PhaseDone || s["winner"] != TeamRed {
		t.Fatal(s["phase"], s["winner"], peek(h).rope)
	}
	results := h.TakeResults()
	if len(results) != 4 {
		t.Fatal(len(results))
	}
	paid := map[int64]int{}
	for _, r := range results {
		paid[r.UserID] = r.Points
		if r.Match == nil || !r.Match.Finished || len(r.Match.Players) != 4 {
			t.Fatal(r.Match)
		}
	}
	team := 5 * points.Worth(0, 1)
	want := points.Finished(points.Outcome(team, true, false), MaxPoints)
	if paid[1] != want+MVPBonus || paid[3] != want {
		t.Fatal("red", paid, want)
	}
	lose := points.Finished(0, MaxPoints)
	if paid[2] != lose || paid[4] != lose {
		t.Fatal("blue", paid)
	}
	r := h.State(claims(1, "P1"), at)["result"].(Message)
	if r["mvp"] != true || r["won"] != true {
		t.Fatal(r)
	}
}

func TestQuestionLimitEndsByRope(t *testing.T) {
	h, _, now := setup(t, 2)
	if _, err := h.SetQuestions(1, 5, now); err != nil {
		t.Fatal(err)
	}
	at := begin(t, h, now)
	at = pullRed(t, h, at)
	for i := 0; i < 4; i++ {
		g := peek(h)
		h.Tick(g.deadline)
		at = g.deadline.Add(RevealTime)
		h.Tick(at)
	}
	s := h.State(claims(1, "P1"), at)
	if s["phase"] != lobby.PhaseDone || s["winner"] != TeamRed {
		t.Fatal(s["phase"], s["winner"], peek(h).number)
	}
}

func TestDrawHasNoWinner(t *testing.T) {
	h, _, now := setup(t, 2)
	h.SetQuestions(1, 5, now)
	at := begin(t, h, now)
	for i := 0; i < 5; i++ {
		g := peek(h)
		h.Tick(g.deadline)
		at = g.deadline.Add(RevealTime)
		h.Tick(at)
	}
	s := h.State(claims(1, "P1"), at)
	if s["phase"] != lobby.PhaseDone {
		t.Fatal(s["phase"])
	}
	if s["winner"] != nil {
		t.Fatal("draw has winner")
	}
}

func TestSoloPlaysAgainstComputer(t *testing.T) {
	h, _, now := setup(t, 1)
	at := begin(t, h, now)
	g := peek(h)
	if !g.solo || g.bot == nil {
		t.Fatal("no computer")
	}
	s := h.State(claims(1, "P1"), at)
	players := s["players"].([]Message)
	if len(players) != 2 || players[1]["bot"] != true || players[1]["team"] != TeamBlue {
		t.Fatal(players)
	}
	// The computer answers within the answer time.
	for step := at; step.Before(g.deadline) && peek(h).stage == StageQuestion; step = step.Add(250 * time.Millisecond) {
		h.Tick(step)
	}
	if !peek(h).bot.answered && peek(h).stage == StageQuestion {
		t.Fatal("computer never answered")
	}
	h.Stop(1, at.Add(30*time.Second))
	res := h.TakeResults()
	if len(res) != 1 || res[0].Match.Mode != "bot" || len(res[0].Match.Players) != 2 {
		t.Fatal(res)
	}
}

func TestLeavingTeamForfeitsAndPaysAchieved(t *testing.T) {
	h, _, now := setup(t, 2)
	at := begin(t, h, now)
	g := peek(h)
	h.Answer(2, g.round, g.question.Answer, at.Add(time.Second))
	_, paid := h.Leave(2, at.Add(2*time.Second))
	if paid != points.Abandoned(points.Worth(0, 1), 1, MaxPoints) {
		t.Fatal(paid)
	}
	s := h.State(claims(1, "P1"), at.Add(2*time.Second))
	if s["phase"] != lobby.PhaseDone || s["winner"] != TeamRed || s["forfeit"] != true {
		t.Fatal(s["phase"], s["winner"], s["forfeit"])
	}
}

func TestRematchKeepsTeams(t *testing.T) {
	h, _, now := setup(t, 2)
	h.SetTeam(1, 0, TeamBlue, now)
	h.SetTeam(1, 1, TeamRed, now)
	at := begin(t, h, now)
	h.Stop(1, at)
	if _, err := h.Start(1, at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	g := peek(h)
	if g.teamOf(1) != TeamBlue || g.teamOf(2) != TeamRed {
		t.Fatal("teams reset")
	}
}

func TestHostCanWatchOnBigScreen(t *testing.T) {
	h, _, now := setup(t, 3)
	if _, err := h.SetTeam(1, 1, TeamWatch, now); err != ErrTeam {
		t.Fatal("other player set to watch", err)
	}
	if _, err := h.SetTeam(1, 0, TeamWatch, now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.ShuffleTeams(1, now); err != nil {
		t.Fatal(err)
	}
	at := begin(t, h, now)
	g := peek(h)
	if g.teamOf(1) != TeamWatch || g.solo {
		t.Fatal("host not watching", g.teamOf(1), g.solo)
	}
	if _, err := h.Answer(1, g.round, g.question.Answer, at.Add(time.Second)); err != ErrWatching {
		t.Fatal(err)
	}
	h.Answer(2, g.round, wrong(g.question), at.Add(time.Second))
	h.Answer(3, g.round, wrong(g.question), at.Add(time.Second))
	if peek(h).stage != StageReveal {
		t.Fatal("watcher blocks the round")
	}
	h.Stop(1, at.Add(2*time.Second))
	// The watcher's own done snapshot must render (team index 2).
	if res := h.State(claims(1, "P1"), at.Add(2*time.Second))["result"].(Message); res["watching"] != true {
		t.Fatal(res)
	}
	for _, r := range h.TakeResults() {
		if r.UserID == 1 {
			t.Fatal("watcher paid")
		}
		if len(r.Match.Players) != 2 {
			t.Fatal(r.Match.Players)
		}
	}
}

func TestSnapshotIsDetached(t *testing.T) {
	h, _, now := setup(t, 2)
	at := begin(t, h, now)
	s := h.State(claims(1, "P1"), at)
	s["players"].([]Message)[0]["character"].(json.RawMessage)[0] = 'x'
	s["question"].(Message)["options"].([]string)[0] = "tampered"
	again := h.State(claims(1, "P1"), at)
	if again["players"].([]Message)[0]["character"].(json.RawMessage)[0] != '{' || again["question"].(Message)["options"].([]string)[0] == "tampered" {
		t.Fatal("snapshot aliases room")
	}
}

func TestClassroomRoomIsHidden(t *testing.T) {
	useBank(t)
	h := NewHub(3)
	now := time.Unix(1000, 0)
	a := claims(1, "A")
	a.Classroom = 9
	if _, err := h.EnterClassroom(a, now); err != nil {
		t.Fatal(err)
	}
	pin := h.State(a, now)["pin"].(string)
	if _, ok := h.RoomPhase(pin); ok {
		t.Fatal("classroom room visible by PIN")
	}
	if _, err := h.Enter(claims(2, "B"), pin, now); err != lobby.ErrNotFound {
		t.Fatal(err)
	}
	b := claims(3, "C")
	b.Classroom = 9
	if _, err := h.EnterClassroom(b, now); err != nil {
		t.Fatal(err)
	}
	if h.State(b, now)["pin"] != pin || h.State(b, now)["players"].([]Message)[1]["team"] != TeamBlue {
		t.Fatal("classmate not seated on the other team")
	}
}
