package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/heist"
)

func fastHeist() heist.Config {
	c := heist.Defaults
	c.Cooldown, c.MinAnswer, c.TargetTime = 100*time.Millisecond, 0, time.Second
	c.Tick, c.Board = 10*time.Millisecond, 20*time.Millisecond
	return c
}

func dialHeistURL(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/economy-heist?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

// write sends without failing the test (safe from helper goroutines).
func (c *floorConn) write(msg map[string]any) { _ = wsjson.Write(c.ctx, c.conn, msg) }

func TestHeistRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, Heist: fastHeist()}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/ws/economy-heist?token=" + floorToken(t, 1, "floor-drop"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token: %d", res.StatusCode)
	}
}

// TestHeistWebSocketGame plays a gold-target game over WebSocket: the host
// opens a room, two players join with room_code + avatar, answer, open
// chests, and the signed results reach the Laravel endpoint.
func TestHeistWebSocketGame(t *testing.T) {
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
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, Heist: fastHeist()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunHeist(ctx, time.Second)

	url := func(id int64, game string) *floorConn { return dialHeistURL(t, ts.URL, id, game) }
	host := url(100, heist.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	lobby := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == heist.PhaseLobby })
	pin := lobby["pin"].(string)
	host.send(map[string]any{"t": "configure", "win": heist.WinGold, "value": 1000})
	host.until("state_sync", func(m map[string]any) bool { return m["win"] == heist.WinGold })

	a := url(1, heist.GameKey)
	b := url(2, heist.GameKey)
	look := map[string]any{"color": "violet", "gender": "boy", "skin": "brown", "hair": "black"}
	a.until("state_sync", nil)
	// A join claiming someone else's id is refused.
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": "2", "username": "A", "avatar": look})
	if e := a.until("error", nil); e["code"] != "invalid_player" {
		t.Fatalf("spoofed join: %v", e)
	}
	for i, p := range []*floorConn{a, b} {
		if i == 1 {
			p.until("state_sync", nil)
		}
		p.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": []string{"1", "2"}[i], "username": "X", "avatar": look})
		p.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
	}
	roster := host.until("state_sync", func(m map[string]any) bool {
		ps, _ := m["players"].([]any)
		return len(ps) == 2
	})["players"].([]any)
	if roster[0].(map[string]any)["character"] == nil {
		t.Fatalf("host roster without avatar: %v", roster)
	}
	a.send(map[string]any{"t": "start_game"})
	if e := a.until("error", nil); e["code"] != "host_only" {
		t.Fatalf("player start: %v", e)
	}
	host.send(map[string]any{"t": "start_game"})

	// Play until the game ends: answer every question with option 0; on a
	// miss wait for the next question; open chest 0; target the rival.
	done := make(chan struct{})
	play := func(p *floorConn, rival int64) {
		for {
			var msg map[string]any
			if err := wsjson.Read(p.ctx, p.conn, &msg); err != nil {
				return
			}
			switch msg["t"] {
			case "question":
				q := msg["question"].(map[string]any)
				p.write(map[string]any{"t": "submit_answer", "question_id": q["id"], "answer_index": 0})
			case "answer_result":
				if msg["correct"] == true {
					p.write(map[string]any{"t": "select_chest", "chest_index": 0})
				}
			case "chest_result":
				if msg["requires_target"] == true {
					p.write(map[string]any{"t": "execute_heist_target", "target_player_id": rival})
				}
			case "podium_result":
				return
			}
			select {
			case <-done:
				return
			default:
			}
		}
	}
	go play(a, 2)
	go play(b, 1)
	// Force a short game: end after a few seconds if nobody hits 1000.
	time.AfterFunc(3*time.Second, func() { host.write(map[string]any{"t": "end_game"}) })
	over := host.until("podium_result", nil)
	close(done)
	podium := over["podium"].([]any)
	if len(podium) != 2 || podium[0].(map[string]any)["character"] == nil {
		t.Fatalf("podium %v", podium)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(results)
		mu.Unlock()
		if n == 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(results) != 2 {
		t.Fatalf("results reported: %d", len(results))
	}
	for _, r := range results {
		if r["game_key"] != heist.GameKey || !strings.HasPrefix(r["event_id"].(string), "eh-") || r["match"] == nil {
			t.Fatalf("bad result %v", r)
		}
	}
}

// TestHeistConnectionsDoNotLeak opens and drops many sockets and checks the
// per-connection goroutines exit.
func TestHeistConnectionsDoNotLeak(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, Heist: fastHeist()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	before := runtime.NumGoroutine()
	for i := range 30 {
		c := dialHeistURL(t, ts.URL, int64(500+i), heist.GameKey)
		c.until("state_sync", nil)
		c.conn.CloseNow()
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		srv.mu.Lock()
		n := len(srv.heistConns)
		srv.mu.Unlock()
		if n == 0 && runtime.NumGoroutine() <= before+4 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("leak: %d conns tracked, goroutines %d -> %d", len(srv.heistConns), before, runtime.NumGoroutine())
}
