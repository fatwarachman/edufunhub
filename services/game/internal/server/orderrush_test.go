package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"edufunhub/game/internal/orderrush"
)

func fastRush() orderrush.Config {
	c := orderrush.Defaults
	c.MinSubmit, c.Retry = 0, 0
	c.Tick, c.Board = 10*time.Millisecond, 20*time.Millisecond
	return c
}

func dialRush(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/order-rush?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func TestOrderRushRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, OrderRush: fastRush()}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/ws/order-rush?token=" + floorToken(t, 1, "economy-heist"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token: %d", res.StatusCode)
	}
}

// TestOrderRushWebSocketRace plays a 5-module race over WebSocket. The
// solver reads its module's correct order from the hub (the client never
// receives it), a wrong and a malformed submission are checked, and the
// signed results with per-category stats reach Laravel.
func TestOrderRushWebSocketRace(t *testing.T) {
	var mu sync.Mutex
	var results []map[string]any
	laravel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if Sign(secret, r.Header.Get("X-Game-Timestamp"), body) != r.Header.Get("X-Game-Signature") {
			http.Error(w, "bad signature", http.StatusForbidden)
			return
		}
		var res map[string]any
		_ = json.Unmarshal(body, &res)
		mu.Lock()
		results = append(results, res)
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
	}))
	defer laravel.Close()
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, OrderRush: fastRush()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunOrderRush(ctx, time.Second)

	host := dialRush(t, ts.URL, 900, orderrush.HostKey)
	host.until("state_sync", nil)
	host.send(map[string]any{"t": "create_room"})
	pin := host.until("state_sync", func(m map[string]any) bool { return m["pin"] != nil })["pin"].(string)
	host.send(map[string]any{"t": "configure", "mode": "RACE", "value": 5, "sets": []string{"tcp-handshake", "dhcp-dora"}})
	host.until("state_sync", func(m map[string]any) bool { return m["modules"] == float64(5) })

	a := dialRush(t, ts.URL, 1, orderrush.GameKey)
	b := dialRush(t, ts.URL, 2, orderrush.GameKey)
	a.until("state_sync", nil)
	b.until("state_sync", nil)
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": "2", "avatar": map[string]any{"color": "teal"}})
	if e := a.until("error", nil); e["code"] != "invalid_player" {
		t.Fatalf("spoofed id: %v", e)
	}
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": "1", "username": "A", "avatar": map[string]any{"color": "teal", "gender": "girl"}})
	a.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
	b.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": 2, "avatar": map[string]any{"color": "coral"}})
	b.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
	host.send(map[string]any{"t": "start_game"})

	st := a.until("state_sync", func(m map[string]any) bool { return m["phase"] == orderrush.PhaseActive })
	q := st["you"].(map[string]any)["question"].(map[string]any)
	if _, leaked := q["correct_order"]; leaked {
		t.Fatal("correct order sent to the client")
	}
	board := st["leaderboard"].([]any)
	if board[0].(map[string]any)["avatar"] == nil {
		t.Fatalf("leaderboard without avatar: %v", board)
	}

	correct := func(id int64, qid string) []string {
		v, _ := srv.rush.Inspect(pin, func(r *orderrush.Room) any { return r.QuestionFor(id) })
		got := v.(orderrush.SequenceQuestion)
		if got.ID != qid {
			t.Fatalf("question %s, want %s", got.ID, qid)
		}
		return got.CorrectOrder
	}
	qid := q["id"].(string)
	// Malformed (too short) order: error, not a wrong attempt.
	a.send(map[string]any{"t": "submit_sequence", "question_id": qid, "submitted_order": []string{"x"}, "client_duration_ms": 10})
	if e := a.until("error", nil); e["code"] != "invalid_order" {
		t.Fatalf("malformed: %v", e)
	}
	// Wrong order: reversed.
	order := correct(1, qid)
	rev := make([]string, len(order))
	for i, id := range order {
		rev[len(order)-1-i] = id
	}
	a.send(map[string]any{"t": "submit_sequence", "question_id": qid, "submitted_order": rev, "client_duration_ms": 1200})
	v := a.until("sequence_validated", nil)
	if v["is_correct"] != false || v["error_slot_index"] != float64(0) {
		t.Fatalf("wrong order: %v", v)
	}
	for i := range 5 {
		a.send(map[string]any{"t": "submit_sequence", "question_id": qid, "submitted_order": correct(1, qid), "client_duration_ms": 900})
		v = a.until("sequence_validated", nil)
		if v["is_correct"] != true {
			t.Fatalf("module %d: %v", i, v)
		}
		if i == 0 {
			// The host board follows progress (throttled); wait for it before
			// the race can finish and replace it with the podium.
			host.until("race_progress_broadcast", func(m map[string]any) bool {
				board := m["leaderboard"].([]any)
				return len(board) > 0 && board[0].(map[string]any)["step"] == float64(1)
			})
		}
		if i < 4 {
			qid = v["next_question"].(map[string]any)["id"].(string)
		}
	}
	pod := a.until("podium_result", nil)
	if pod["you"].(map[string]any)["won"] != true {
		t.Fatalf("podium: %v", pod)
	}
	top := host.until("podium_result", nil)["podium"].([]any)
	if top[0].(map[string]any)["character"] == nil {
		t.Fatal("podium without avatar")
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		mu.Lock()
		n := len(results)
		mu.Unlock()
		if n == 2 || time.Now().After(deadline) {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(results) != 2 {
		t.Fatalf("results: %d", len(results))
	}
	for _, r := range results {
		if r["game_key"] != "order-rush" || !strings.HasPrefix(r["event_id"].(string), "or-") {
			t.Fatalf("result: %v", r)
		}
		if r["user_id"] == float64(1) {
			stats := r["sequence_stats"].([]any)
			if len(stats) == 0 || r["correct"] != float64(5) || r["wrong"] != float64(1) {
				t.Fatalf("winner result: %v", r)
			}
		}
	}
}
