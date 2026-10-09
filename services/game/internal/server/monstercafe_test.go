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

	"edufunhub/game/internal/monstercafe"
)

func fastCafe() monstercafe.Config {
	c := monstercafe.Defaults
	c.Cook, c.BurnAfter = 50*time.Millisecond, time.Second
	c.Cooldown, c.MinAnswer = 50*time.Millisecond, 0
	c.RatMin, c.RatMax = time.Hour, time.Hour
	c.Tick, c.Board, c.Kitchen = 10*time.Millisecond, 20*time.Millisecond, 200*time.Millisecond
	return c
}

func dialCafe(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/monster-cafe?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func TestMonsterCafeRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, MonsterCafe: fastCafe()}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/ws/monster-cafe?token=" + floorToken(t, 1, "economy-heist"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token: %d", res.StatusCode)
	}
	res, _ = http.Get(ts.URL + "/ws/monster-cafe")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no token: %d", res.StatusCode)
	}
}

// TestMonsterCafeWebSocketGame plays a solo game over WebSocket: the host
// opens a room, one player joins, earns ingredients by answering, cooks and
// serves a dish, and the signed result reaches the Laravel endpoint.
func TestMonsterCafeWebSocketGame(t *testing.T) {
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
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, MonsterCafe: fastCafe()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunMonsterCafe(ctx, time.Second)

	host := dialCafe(t, ts.URL, 100, monstercafe.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" && m["phase"] == "NONE" })
	host.send(map[string]any{"t": "create_room"})
	lobby := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == monstercafe.PhaseLobby })
	pin := lobby["pin"].(string)
	host.send(map[string]any{"t": "configure", "minutes": 3})
	host.until("state_sync", func(m map[string]any) bool { return m["minutes"] == float64(3) })

	a := dialCafe(t, ts.URL, 1, monstercafe.GameKey)
	a.until("state_sync", func(m map[string]any) bool { return m["role"] == "player" })
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": "2"})
	if e := a.until("error", nil); e["code"] != "invalid_player" {
		t.Fatalf("spoofed join: %v", e)
	}
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": "1", "avatar": map[string]any{"color": "teal"}})
	a.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin && m["you"] == float64(1) })
	a.send(map[string]any{"t": "start_game"})
	if e := a.until("error", nil); e["code"] != "host_only" || e["for"] != "start_game" {
		t.Fatalf("player start: %v", e)
	}
	host.send(map[string]any{"t": "start_game"})
	k := a.until("kitchen_sync", nil)
	order := k["orders"].([]any)[0].(map[string]any)
	recipe := order["recipe"].([]any)

	// Earn every ingredient of the first recipe through questions.
	for _, ing := range recipe {
		for {
			a.send(map[string]any{"t": "request_ingredient", "ingredient": ing})
			q := a.until("question", nil)["question"].(map[string]any)
			ans, _ := srv.cafe.Inspect(pin, func(r *monstercafe.Room) any { return monstercafe.AnswerOf(r, 1) })
			a.send(map[string]any{"t": "submit_answer", "question_id": q["question_id"], "answer_index": ans})
			res := a.until("answer_result", nil)
			if res["correct"] == true && res["ingredient"] == ing {
				break
			}
			t.Fatalf("answer %v", res)
		}
	}
	for _, ing := range recipe {
		a.send(map[string]any{"t": "plate_add", "ingredient": ing})
	}
	a.send(map[string]any{"t": "cook"})
	a.until("kitchen_sync", func(m map[string]any) bool { return m["oven"].(map[string]any)["state"] == monstercafe.OvenReady })
	a.send(map[string]any{"t": "take_out"})
	a.until("kitchen_sync", func(m map[string]any) bool { return m["dish"] != nil })
	a.send(map[string]any{"t": "serve", "order_id": "missing"})
	if e := a.until("error", nil); e["code"] != "invalid_order_id" {
		t.Fatalf("bad order: %v", e)
	}
	a.send(map[string]any{"t": "serve", "order_id": order["id"]})
	served := a.until("order_served", nil)
	if served["coins"].(float64) < monstercafe.BaseCoins {
		t.Fatalf("served %v", served)
	}
	if fb := host.until("action_broadcast", nil); fb["kind"] != monstercafe.KindServed {
		t.Fatalf("host feed %v", fb)
	}
	a.send(map[string]any{"t": "throw_pie"})
	if e := a.until("error", nil); e["code"] != "no_pie" {
		t.Fatalf("pie: %v", e)
	}
	a.send(map[string]any{"t": "ping"})
	a.until("pong", nil)

	host.send(map[string]any{"t": "end_game"})
	over := host.until("podium_result", nil)
	if p := over["podium"].([]any); len(p) != 1 || p[0].(map[string]any)["character"] == nil {
		t.Fatalf("podium %v", p)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(results)
		mu.Unlock()
		if n == 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(results) != 1 {
		t.Fatalf("results reported: %d", len(results))
	}
	r := results[0]
	match, _ := r["match"].(map[string]any)
	if r["game_key"] != monstercafe.GameKey || !strings.HasPrefix(r["event_id"].(string), "mc-1-room-") || r["mission"] != "room" ||
		match == nil || match["level"] != float64(3) {
		t.Fatalf("bad result %v", r)
	}
}

// TestMonsterCafeConnectionsDoNotLeak opens and drops many sockets and
// checks the per-connection goroutines exit.
func TestMonsterCafeConnectionsDoNotLeak(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, MonsterCafe: fastCafe()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	before := runtime.NumGoroutine()
	for i := range 30 {
		c := dialCafe(t, ts.URL, int64(500+i), monstercafe.GameKey)
		c.until("state_sync", nil)
		c.conn.CloseNow()
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		srv.mu.Lock()
		n := len(srv.cafeConns)
		srv.mu.Unlock()
		if n == 0 && runtime.NumGoroutine() <= before+4 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("leak: %d conns tracked, goroutines %d -> %d", len(srv.cafeConns), before, runtime.NumGoroutine())
}
