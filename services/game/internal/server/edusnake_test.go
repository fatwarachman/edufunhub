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

	"edufunhub/game/internal/edusnake"
)

func dialSnake(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/snake?token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func TestEduSnakeRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()

	res, _ := http.Get(ts.URL + "/ws/snake?token=" + floorToken(t, 1, "economy-heist"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token accepted: %d", res.StatusCode)
	}
	res, _ = http.Get(ts.URL + "/ws/snake")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no token accepted: %d", res.StatusCode)
	}
}

// TestEduSnakeWebSocketRoom plays a room over the socket: create, join by
// PIN, start, see the question with food, steer, stop, and get reported.
func TestEduSnakeWebSocketRoom(t *testing.T) {
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

	cfg := edusnake.Defaults
	cfg.Countdown, cfg.Step = 50*time.Millisecond, 40*time.Millisecond
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, EduSnake: cfg})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.RunEduSnake(ctx, 10*time.Millisecond)

	host := dialSnake(t, ts.URL, 1, edusnake.GameKey)
	host.until("snake_state", nil)
	host.send(map[string]any{"t": "create"})
	lobbyState := host.until("snake_state", func(m map[string]any) bool { return m["pin"] != "" })
	pin := lobbyState["pin"].(string)

	guest := dialSnake(t, ts.URL, 2, edusnake.GameKey)
	guest.until("snake_state", nil)
	guest.send(map[string]any{"t": "join", "pin": pin})
	guest.until("snake_state", func(m map[string]any) bool { return m["pin"] == pin })

	host.send(map[string]any{"t": "mode", "mode": "split"})
	host.until("snake_state", func(m map[string]any) bool { return m["mode"] == "split" })
	host.send(map[string]any{"t": "start"})
	playing := host.until("snake_state", func(m map[string]any) bool { return m["phase"] == "playing" })
	board, _ := playing["board"].(map[string]any)
	q, _ := board["question"].(map[string]any)
	if q == nil || q["text"] == "" || len(q["options"].([]any)) < 2 {
		t.Fatalf("no question while playing: %#v", board)
	}
	if len(board["foods"].([]any)) != len(q["options"].([]any)) {
		t.Fatal("one food per option")
	}
	host.send(map[string]any{"t": "turn", "direction": "up"})
	host.until("snake_state", func(m map[string]any) bool {
		b, _ := m["board"].(map[string]any)
		snakes, _ := b["snakes"].([]any)
		return len(snakes) > 0 && snakes[0].(map[string]any)["dir"] == "up"
	})
	host.send(map[string]any{"t": "stop"})
	host.until("snake_state", func(m map[string]any) bool { return m["phase"] == "done" })

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(results)
		mu.Unlock()
		if n >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(results) != 2 {
		t.Fatalf("results %d", len(results))
	}
	for _, r := range results {
		if r["game_key"] != "snake" || r["mission"] != "room" || !strings.HasPrefix(r["event_id"].(string), "sn-") {
			t.Fatalf("bad result %#v", r)
		}
	}
}
