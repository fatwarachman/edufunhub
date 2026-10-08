package blockbattle

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

// fastConfig keeps timings short so a whole game runs in about a second.
func fastConfig() Config {
	c := Defaults
	c.Tick, c.BoardsTick, c.Minute = 5*time.Millisecond, 20*time.Millisecond, 2*time.Second
	c.Countdown, c.QuestionTime, c.YoungTime, c.RevealTime = 20*time.Millisecond, 300*time.Millisecond, 300*time.Millisecond, 20*time.Millisecond
	c.MinAnswer, c.RewardWindow, c.PenaltyTime, c.WrongCool = 0, 200*time.Millisecond, 200*time.Millisecond, 50*time.Millisecond
	c.Gravity, c.MinGravity, c.GravityStep, c.LockDelay = 400*time.Millisecond, 100*time.Millisecond, 50*time.Millisecond, 50*time.Millisecond
	c.TurnTime, c.FortressFall = 300*time.Millisecond, 50*time.Millisecond
	c.MonsterEvery, c.MonsterFast, c.MonsterFaster = time.Hour, time.Hour, time.Hour
	c.LobbyDrop = 200 * time.Millisecond
	c.Buffer = 8192
	return c
}

func claims(id int64, grade int) auth.Claims {
	return auth.Claims{Subject: id, Name: fmt.Sprintf("P%d", id), Grade: grade, Game: GameKey}
}

type harness struct {
	t    *testing.T
	hub  *Hub
	host *Client
	pin  string
	kids []*Client
}

func newHarness(t *testing.T, cfg Config, players int) *harness {
	t.Helper()
	h := &harness{t: t, hub: NewHub(cfg, 7)}
	h.host = NewClient(auth.Claims{Subject: 9000, Name: "Teacher", Grade: 4, Game: HostKey}, true, "id", cfg.Buffer)
	room, err := h.hub.Create(h.host, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	h.pin = room.Pin
	for i := 1; i <= players; i++ {
		c := NewClient(claims(int64(i), 4), false, "id", cfg.Buffer)
		if err := h.hub.Join(c, h.pin, nil); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
		h.kids = append(h.kids, c)
	}
	t.Cleanup(h.hub.CloseAll)
	return h
}

func (h *harness) inspect(fn func(r *Room) any) any {
	h.t.Helper()
	v, err := h.hub.Inspect(h.pin, fn)
	if err != nil {
		h.t.Fatal(err)
	}
	return v
}

func (h *harness) wait(what string, cond func(r *Room) bool) {
	h.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if h.inspect(func(r *Room) any { return cond(r) }).(bool) {
			return
		}
		time.Sleep(3 * time.Millisecond)
	}
	h.t.Fatalf("timeout waiting for %s", what)
}

// question waits for an open question of player uid newer than after.
func (h *harness) question(uid, after int64) (int64, int) {
	h.t.Helper()
	var id int64
	var answer int
	h.wait("question", func(r *Room) bool {
		p := r.byID[uid]
		if r.phase == PhasePlaying && p.q.Stage == StageQuestion && p.q.ID > after {
			id, answer = p.q.ID, p.q.Question.Answer
			return true
		}
		return false
	})
	return id, answer
}

func (h *harness) startPlaying() {
	h.t.Helper()
	if err := h.hub.Start(h.host); err != nil {
		h.t.Fatal(err)
	}
	h.wait("playing", func(r *Room) bool { return r.phase == PhasePlaying })
}

func drain(c *Client) []Message {
	var out []Message
	for {
		select {
		case m := <-c.Out():
			out = append(out, m)
		default:
			return out
		}
	}
}

func has(msgs []Message, kind string) Message {
	for _, m := range msgs {
		if m["t"] == kind {
			return m
		}
	}
	return nil
}

func TestLobbyRulesAndConfigure(t *testing.T) {
	h := newHarness(t, fastConfig(), 1)
	if err := h.hub.Start(h.kids[0]); err != ErrHostOnly {
		t.Fatalf("player start: %v", err)
	}
	if err := h.hub.Start(h.host); err != ErrPlayers {
		t.Fatalf("battle with one player: %v", err)
	}
	for _, bad := range []struct {
		mode    string
		minutes int
		content string
	}{{"SOLO", 0, ""}, {"", 4, ""}, {"", 0, "LATIN"}, {"", 0, ""}} {
		if err := h.hub.Configure(h.host, bad.mode, bad.minutes, bad.content); err != ErrConfig {
			t.Fatalf("configure %v: %v", bad, err)
		}
	}
	if err := h.hub.Configure(h.kids[0], ModeWords, 0, ""); err != ErrHostOnly {
		t.Fatalf("player configure: %v", err)
	}
	if err := h.hub.SetSubject(h.kids[0], "math"); err != ErrHostOnly {
		t.Fatalf("player subject: %v", err)
	}
	if err := h.hub.Configure(h.host, ModeWords, 3, ContentWordsEN); err != nil {
		t.Fatal(err)
	}
	got := h.inspect(func(r *Room) any { return []any{r.mode, r.minutes, r.content} }).([]any)
	if got[0] != ModeWords || got[1] != 3 || got[2] != ContentWordsEN {
		t.Fatalf("config %v", got)
	}
	var state Message
	for _, m := range drain(h.host) {
		if m["t"] == "state_sync" {
			state = m
		}
	}
	if state == nil || state["mode"] != ModeWords || state["min_players"] != 1 {
		t.Fatalf("state %v", state)
	}
	if err := h.hub.Join(NewClient(claims(5, 4), false, "id", 8), "000000", nil); err != ErrNotFound {
		t.Fatalf("unknown pin: %v", err)
	}
	if err := h.hub.Input(h.kids[0], ActLeft, time.Now()); err != ErrPhase {
		t.Fatalf("input in lobby: %v", err)
	}
	if err := h.hub.Answer(h.host, 1, 0, time.Now()); err != ErrPlayerOnly {
		t.Fatalf("host answer: %v", err)
	}
	// WORDS starts with one player.
	h.startPlaying()
	if err := h.hub.Configure(h.host, ModeBattle, 0, ""); err != ErrPhase {
		t.Fatalf("configure while playing: %v", err)
	}
	if err := h.hub.Input(h.kids[0], "jump", time.Now()); err != ErrInput {
		t.Fatalf("bad input: %v", err)
	}
}

func TestRoomIsCappedAtMaxPlayers(t *testing.T) {
	h := newHarness(t, fastConfig(), MaxPlayers)
	if err := h.hub.Join(NewClient(claims(999, 4), false, "id", 8), h.pin, nil); err != ErrFull {
		t.Fatalf("51st player: %v", err)
	}
}

func TestBattleRewardAttackAndIPiece(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	h.startPlaying()
	if err := h.hub.Claim(h.kids[0], RewardAttack, time.Now()); err != ErrNoReward {
		t.Fatalf("claim without reward: %v", err)
	}
	qid, answer := h.question(1, 0)
	drain(h.kids[0])
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != ErrAnswered {
		t.Fatalf("second answer: %v", err)
	}
	res := has(drain(h.kids[0]), "answer_result")
	if res == nil || res["correct"] != true || res["reward_choice"] != true || res["correct_index"] != answer {
		t.Fatalf("answer result %v", res)
	}
	if err := h.hub.Claim(h.kids[0], "BOMB", time.Now()); err != ErrReward {
		t.Fatalf("bad reward: %v", err)
	}
	if err := h.hub.Claim(h.kids[0], RewardIPiece, time.Now()); err != nil {
		t.Fatal(err)
	}
	if next := h.inspect(func(r *Room) any { return r.byID[1].field.Queue[0].Type }).(byte); next != 'I' {
		t.Fatalf("next piece %c", next)
	}
	// Second correct answer: no pick within the window means ATTACK.
	qid, answer = h.question(1, qid)
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	h.wait("auto attack", func(r *Room) bool { return !r.byID[1].reward })
	garbage := h.inspect(func(r *Room) any {
		f := r.byID[2].field
		return f.PendingLines() + strings.Count(f.Board.Visible(nil), "G")
	}).(int)
	if garbage == 0 {
		t.Fatal("no garbage reached the rival")
	}
	found := false
	for _, m := range drain(h.host) {
		if m["t"] == "attack" && m["kind"] == "quiz" && m["lines"].(int) >= AttackLines {
			found = true
		}
	}
	if !found {
		t.Fatal("projector did not see the quiz attack")
	}
}

func TestBattleWrongAnswerPenalizesAndExposes(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	h.startPlaying()
	qid, answer := h.question(2, 0)
	if err := h.hub.Answer(h.kids[1], qid, 9, time.Now()); err != ErrOption {
		t.Fatalf("option 9: %v", err)
	}
	if err := h.hub.Answer(h.kids[1], qid+999, 0, time.Now()); err != ErrLocked {
		t.Fatalf("stale: %v", err)
	}
	if err := h.hub.Answer(h.kids[1], qid, 0, time.Now().Add(time.Hour)); err != ErrLocked {
		t.Fatalf("late: %v", err)
	}
	drain(h.kids[1])
	if err := h.hub.Answer(h.kids[1], qid, (answer+1)%4, time.Now()); err != nil {
		t.Fatal(err)
	}
	res := has(drain(h.kids[1]), "answer_result")
	if res == nil || res["correct"] != false || res["penalty_ms"] == nil {
		t.Fatalf("wrong result %v", res)
	}
	state := h.inspect(func(r *Room) any {
		now := time.Now()
		f := r.byID[2].field
		target := r.pickTarget(r.byID[1], now)
		return []any{f.Gravity(now) == f.Base/2, f.Exposed(now), target.ID()}
	}).([]any)
	if state[0] != true || state[1] != true || state[2] != int64(2) {
		t.Fatalf("penalty %v", state)
	}
	// An attack on an exposed player gets the bonus line.
	lines := h.inspect(func(r *Room) any {
		_, n := r.attack(r.byID[1], 2, "quiz", time.Now())
		return n
	}).(int)
	if lines != 3 {
		t.Fatalf("exposed attack lines %d", lines)
	}
	if v := h.inspect(func(r *Room) any { return r.pickTarget(r.byID[1], time.Now()) == r.byID[1] }).(bool); v {
		t.Fatal("target picked self")
	}
	h.wait("penalty expires", func(r *Room) bool {
		fx, _ := r.byID[2].field.Effects(time.Now())
		return len(fx) == 0
	})
}

func TestBattleEndsWhenOneAliveAndReports(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	h.startPlaying()
	h.inspect(func(r *Room) any {
		now := time.Now()
		r.byID[3].hitBy, r.byID[3].hitAt = 1, now
		r.knockOut(r.byID[3], now)
		return nil
	})
	ko := has(drain(h.host), "ko")
	if ko == nil || ko["rank"] != 3 || ko["alive"] != 2 || ko["by"].(Message)["id"] != int64(1) {
		t.Fatalf("ko %v", ko)
	}
	if err := h.hub.Input(h.kids[2], ActLeft, time.Now()); err != ErrKnocked {
		t.Fatalf("knocked out input: %v", err)
	}
	h.inspect(func(r *Room) any {
		r.byID[2].field.Lines = 7
		r.knockOut(r.byID[2], time.Now())
		return nil
	})
	h.wait("game over", func(r *Room) bool { return r.phase == PhaseOver })
	ranks := h.inspect(func(r *Room) any { return []int{r.byID[1].rank, r.byID[2].rank, r.byID[3].rank, r.byID[1].kos} }).([]int)
	if ranks[0] != 1 || ranks[1] != 2 || ranks[2] != 3 || ranks[3] != 1 {
		t.Fatalf("ranks %v", ranks)
	}
	results := h.hub.TakeResults()
	if len(results) != 3 {
		t.Fatalf("results %d", len(results))
	}
	for _, res := range results {
		if !strings.HasPrefix(res.EventID, fmt.Sprintf("bb-%d-room-", res.UserID)) || res.Match == nil || res.GameKey != GameKey || res.Mission != Mission {
			t.Fatalf("result %+v", res)
		}
		if res.Match.Level != DefaultMinutes || len(res.Match.Players) != 3 || res.Match.Players[0].UserID != 1 {
			t.Fatalf("match %+v", res.Match)
		}
		if res.UserID == 1 && res.Points != Award(0, true) {
			t.Fatalf("winner points %d", res.Points)
		}
		if res.UserID != 1 && res.Points != Award(0, false) {
			t.Fatalf("loser points %d", res.Points)
		}
	}
	pod := has(drain(h.kids[0]), "podium_result")
	if pod == nil || pod["you"].(Message)["won"] != true || len(pod["ranking"].([]Message)) != 3 {
		t.Fatalf("podium %v", pod)
	}
}

func TestPlayerLeavingIsAbandonedAndKnockedOut(t *testing.T) {
	h := newHarness(t, fastConfig(), 3)
	h.startPlaying()
	h.inspect(func(r *Room) any { r.byID[3].earned, r.byID[3].correct = 30, 3; return nil })
	if err := h.hub.Leave(h.kids[2]); err != nil {
		t.Fatal(err)
	}
	state := h.inspect(func(r *Room) any { return []any{r.phase, r.byID[3].alive, r.alive()} }).([]any)
	if state[0] != PhasePlaying || state[1] != false || state[2] != 2 {
		t.Fatalf("after leave %v", state)
	}
	if err := h.hub.End(h.kids[0]); err != ErrHostOnly {
		t.Fatalf("player end: %v", err)
	}
	if err := h.hub.End(h.host); err != nil {
		t.Fatal(err)
	}
	for _, res := range h.hub.TakeResults() {
		if res.UserID == 3 && res.Points != 30+5 {
			t.Fatalf("abandoned points %d", res.Points)
		}
	}
}

func TestPaidAnswersAreCapped(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	h.startPlaying()
	h.inspect(func(r *Room) any { r.byID[1].paid, r.byID[1].earned = MaxPaid, 400; return nil })
	qid, answer := h.question(1, 0)
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	got := h.inspect(func(r *Room) any { return []int{r.byID[1].earned, r.byID[1].correct} }).([]int)
	if got[0] != 400 || got[1] != 1 {
		t.Fatalf("cap: %v", got)
	}
}

func TestQuestionTimeoutCountsWrong(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	h.startPlaying()
	h.question(1, 0)
	h.wait("timeout", func(r *Room) bool { return r.byID[1].wrong >= 1 })
	if v := h.inspect(func(r *Room) any { return r.byID[1].field.PenaltyUntil.IsZero() }).(bool); v {
		t.Fatal("timeout must penalize")
	}
}

func TestWordsModeCorrectAnswerGivesTargetPiece(t *testing.T) {
	h := newHarness(t, fastConfig(), 1)
	if err := h.hub.Configure(h.host, ModeWords, 0, ContentMath); err != nil {
		t.Fatal(err)
	}
	h.startPlaying()
	qid, answer := h.question(1, 0)
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	got := h.inspect(func(r *Room) any {
		f := r.byID[1].field
		v, ok := Eval(string(f.Queue[0].Glyphs[:3]))
		return []any{f.Queue[0].Type, ok && v == f.Glyphs.Number}
	}).([]any)
	if got[0] != byte('I') || got[1] != true {
		t.Fatalf("target piece %v", got)
	}
	var board Message
	for _, m := range drain(h.kids[0]) {
		if m["t"] == "board" {
			board = m
		}
	}
	if board == nil || board["target"].(Message)["kind"] != "math" || len(board["cells"].(string)) != Cols*Rows || len(board["glyphs"].(string)) != Cols*Rows {
		t.Fatalf("board %v", board)
	}
	// Word explosions are announced.
	h.inspect(func(r *Room) any {
		f := r.byID[1].field
		f.Glyphs.Number = 9
		f.Board.LoadGlyphs("4+5.......")
		o := NewPiece('O')
		o.X = 8
		f.Piece = &o
		return nil
	})
	if err := h.hub.Input(h.kids[0], ActHard, time.Now()); err != nil {
		t.Fatal(err)
	}
	word := has(drain(h.kids[0]), "word")
	if word == nil || word["word"] != "4+5" || word["combo"] != 1 {
		t.Fatalf("word %v", word)
	}
	if has(drain(h.host), "word") == nil {
		t.Fatal("host missed the word")
	}
}

func TestWordsEndsAtTimeLimit(t *testing.T) {
	cfg := fastConfig()
	cfg.Minute = 50 * time.Millisecond
	h := newHarness(t, cfg, 2)
	_ = h.hub.Configure(h.host, ModeWords, 3, ContentWordsID)
	h.startPlaying()
	h.wait("time up", func(r *Room) bool { return r.phase == PhaseOver })
	if n := len(h.hub.TakeResults()); n != 2 {
		t.Fatalf("results %d", n)
	}
}

func TestFortressTurnQueueAndWin(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	_ = h.hub.Configure(h.host, ModeFortress, 0, "")
	h.startPlaying()
	if err := h.hub.Input(h.kids[0], ActLeft, time.Now()); err != ErrNotTurn {
		t.Fatalf("input without turn: %v", err)
	}
	if err := h.hub.Claim(h.kids[0], RewardAttack, time.Now()); err != ErrNoReward {
		t.Fatalf("claim in fortress: %v", err)
	}
	qid, answer := h.question(1, 0)
	drain(h.kids[0])
	if err := h.hub.Answer(h.kids[0], qid, answer, time.Now()); err != nil {
		t.Fatal(err)
	}
	if res := has(drain(h.kids[0]), "answer_result"); res == nil || res["queue_position"] != 1 {
		t.Fatalf("queue %v", res)
	}
	h.wait("turn", func(r *Room) bool { return r.turn != nil && r.turn.uid == 1 })
	time.Sleep(20 * time.Millisecond)
	if has(drain(h.kids[0]), "your_turn") == nil {
		t.Fatal("no your_turn")
	}
	if err := h.hub.Input(h.kids[1], ActLeft, time.Now()); err != ErrNotTurn {
		t.Fatalf("other player input: %v", err)
	}
	if err := h.hub.Input(h.kids[0], ActHard, time.Now()); err != nil {
		t.Fatal(err)
	}
	if v := h.inspect(func(r *Room) any { return r.turn == nil || r.turn.uid != 1 }).(bool); !v {
		t.Fatal("hard drop should end the turn")
	}
	fort := has(drain(h.host), "fortress")
	if fort == nil || fort["cols"] != FortCols || len(fort["cells"].(string)) != FortCols*FortRows {
		t.Fatalf("fortress %v", fort)
	}
	// The cannon finishes the monster: everyone wins.
	h.inspect(func(r *Room) any {
		r.fort.MonsterHP = CannonDamage
		y := FortRows - 1
		for x := 0; x < FortCols; x++ {
			r.fort.Board.Set(x, y, Empty, NoGlyph)
		}
		for x := 0; x < FortCols-1; x++ {
			r.fort.Board.Set(x, y, Base, NoGlyph)
		}
		r.fort.Armored[y] = false
		for row := 0; row < FortRows; row++ {
			r.fort.Board.Set(FortCols-1, row, Empty, NoGlyph)
		}
		p := NewPiece('I')
		p.Rot, p.X, p.Y = 1, FortCols-3, 0
		r.turn = &turnState{uid: 2, until: time.Now().Add(time.Hour), piece: p, fallAt: time.Now().Add(time.Hour)}
		return nil
	})
	if err := h.hub.Input(h.kids[1], ActHard, time.Now()); err != nil {
		t.Fatal(err)
	}
	h.wait("team win", func(r *Room) bool { return r.phase == PhaseOver })
	team := h.inspect(func(r *Room) any { return []any{r.teamWon, r.reason} }).([]any)
	if team[0] != true || team[1] != ReasonMonster {
		t.Fatalf("team %v", team)
	}
	for _, res := range h.hub.TakeResults() {
		if res.Points < Award(0, true) {
			t.Fatalf("team points %+v", res)
		}
	}
	pod := has(drain(h.kids[1]), "podium_result")
	if pod == nil || pod["team"].(Message)["won"] != true || pod["you"].(Message)["won"] != true {
		t.Fatalf("podium %v", pod)
	}
}

func TestFortressMonsterBreaksWall(t *testing.T) {
	cfg := fastConfig()
	cfg.MonsterEvery = 10 * time.Millisecond
	h := newHarness(t, cfg, 1)
	_ = h.hub.Configure(h.host, ModeFortress, 0, "")
	h.startPlaying()
	h.wait("wall broken", func(r *Room) bool { return r.phase == PhaseOver })
	team := h.inspect(func(r *Room) any { return []any{r.teamWon, r.reason} }).([]any)
	if team[0] != false || team[1] != ReasonBroken {
		t.Fatalf("team %v", team)
	}
	if has(drain(h.host), "monster_hit") == nil {
		t.Fatal("no monster_hit")
	}
}

func TestStateSyncResendsBoardAndQuestion(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	h.startPlaying()
	h.question(1, 0)
	drain(h.kids[0])
	if err := h.hub.Sync(h.kids[0]); err != nil {
		t.Fatal(err)
	}
	msgs := drain(h.kids[0])
	state := has(msgs, "state_sync")
	if state == nil || state["phase"] != PhasePlaying || state["you"].(Message)["alive"] != true || state["boards"] == nil {
		t.Fatalf("state %v", state)
	}
	if has(msgs, "board") == nil || has(msgs, "question") == nil {
		t.Fatalf("sync should resend board and question: %v", msgs)
	}
	q := has(msgs, "question")
	if _, leaked := q["correct_index"]; leaked || len(q["options"].([]string)) != Options {
		t.Fatalf("question %v", q)
	}
	time.Sleep(40 * time.Millisecond)
	boards := has(drain(h.host), "boards")
	if boards == nil || len(boards["boards"].([]Message)) != 2 {
		t.Fatalf("boards %v", boards)
	}
}

func TestPresenceAndPhase(t *testing.T) {
	h := newHarness(t, fastConfig(), 2)
	if phase, ok := h.hub.RoomPhase(h.pin); !ok || phase != PhaseLobby {
		t.Fatalf("phase %v %v", phase, ok)
	}
	if pin, _, host, ok := h.hub.Presence(1); !ok || pin != h.pin || host {
		t.Fatal("player presence")
	}
	if _, _, host, ok := h.hub.Presence(9000); !ok || !host {
		t.Fatal("host presence")
	}
	if rooms, players := h.hub.Counts(); rooms != 1 || players != 2 {
		t.Fatalf("counts %d %d", rooms, players)
	}
	if err := h.hub.Leave(h.host); err != nil {
		t.Fatal(err)
	}
	if rooms, _ := h.hub.Counts(); rooms != 0 {
		t.Fatalf("rooms after host left %d", rooms)
	}
}

func TestConcurrentInputsAreRaceFree(t *testing.T) {
	h := newHarness(t, fastConfig(), 4)
	h.startPlaying()
	var wg sync.WaitGroup
	actions := []string{ActLeft, ActRight, ActRotate, ActRotateCCW, ActSoft, ActHard}
	for i, c := range h.kids {
		wg.Add(1)
		go func(i int, c *Client) {
			defer wg.Done()
			for n := 0; n < 200; n++ {
				_ = h.hub.Input(c, actions[(n+i)%len(actions)], time.Now())
				_ = h.hub.Claim(c, RewardAttack, time.Now())
				if n%20 == 0 {
					_ = h.hub.Sync(c)
				}
				drain(c)
			}
		}(i, c)
	}
	wg.Wait()
	drain(h.host)
}
