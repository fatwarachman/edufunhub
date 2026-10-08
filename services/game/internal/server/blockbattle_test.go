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

	"edufunhub/game/internal/blockbattle"
)

func fastBlock() blockbattle.Config {
	c := blockbattle.Defaults
	c.Tick, c.BoardsTick = 10*time.Millisecond, 20*time.Millisecond
	c.Countdown, c.QuestionTime, c.YoungTime, c.RevealTime = 30*time.Millisecond, 400*time.Millisecond, 400*time.Millisecond, 20*time.Millisecond
	c.MinAnswer, c.RewardWindow = 0, 50*time.Millisecond
	c.Gravity, c.LockDelay = 30*time.Millisecond, 20*time.Millisecond
	c.Buffer = 8192
	return c
}

func dialBlock(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/block-battle?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func TestBlockBattleRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, BlockBattle: fastBlock()}).Handler())
	defer ts.Close()
	for _, url := range []string{
		ts.URL + "/ws/block-battle?token=" + floorToken(t, 1, "turbo-trivia"),
		ts.URL + "/ws/block-battle?token=garbage",
		ts.URL + "/ws/block-battle",
	} {
		res, err := http.Get(url)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s: %d", url, res.StatusCode)
		}
	}
}

// TestBlockBattleWebSocketGame plays a BATTLE room over WebSocket: the host
// (projector token) opens a room, two players (player tokens) join, both
// hard-drop pieces until a board tops out; the last board standing wins and
// signed results reach Laravel.
func TestBlockBattleWebSocketGame(t *testing.T) {
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
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, BlockBattle: fastBlock()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunBlockBattle(ctx, time.Second)

	host := dialBlock(t, ts.URL, 900, blockbattle.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	pin := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == blockbattle.PhaseLobby })["pin"].(string)
	host.send(map[string]any{"t": "configure", "mode": "BATTLE", "minutes": 3})
	host.until("state_sync", func(m map[string]any) bool { return m["minutes"] == float64(3) })
	host.send(map[string]any{"t": "configure", "minutes": 4})
	if e := host.until("error", nil); e["code"] != "invalid_config" {
		t.Fatalf("bad minutes: %v", e)
	}

	a := dialBlock(t, ts.URL, 1, blockbattle.GameKey)
	b := dialBlock(t, ts.URL, 2, blockbattle.GameKey)
	for _, p := range []*floorConn{a, b} {
		if m := p.until("state_sync", nil); m["role"] != "player" || m["phase"] != "NONE" {
			t.Fatalf("player hello %v", m)
		}
	}
	a.send(map[string]any{"t": "create_room"})
	if e := a.until("error", nil); e["code"] != "host_only" {
		t.Fatalf("player create: %v", e)
	}
	a.send(map[string]any{"t": "join_room", "room_code": pin, "player_id": 2})
	if e := a.until("error", nil); e["code"] != "invalid_player" {
		t.Fatalf("spoof: %v", e)
	}
	for _, p := range []*floorConn{a, b} {
		p.send(map[string]any{"t": "join_room", "room_code": pin})
		p.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
	}
	a.send(map[string]any{"t": "start_game"})
	if e := a.until("error", nil); e["code"] != "host_only" {
		t.Fatalf("player start: %v", e)
	}
	host.send(map[string]any{"t": "join_room", "room_code": pin})
	if e := host.until("error", nil); e["code"] != "player_only" {
		t.Fatalf("host join: %v", e)
	}
	host.send(map[string]any{"t": "start_game"})

	// A hard-drops pieces until knocked out; B only answers questions.
	var wg sync.WaitGroup
	for i, p := range []*floorConn{a, b} {
		wg.Add(1)
		go func(dropper bool, p *floorConn) {
			defer wg.Done()
			for {
				var msg map[string]any
				if err := wsjsonRead(p, &msg); err != nil {
					return
				}
				switch msg["t"] {
				case "question":
					if _, leaked := msg["correct_index"]; leaked {
						t.Error("question leaked the answer")
					}
					_ = wsjsonWrite(p, map[string]any{"t": "submit_answer", "qid": msg["qid"], "choice_index": 0})
				case "board":
					if dropper && msg["alive"] == true {
						_ = wsjsonWrite(p, map[string]any{"t": "input", "action": "hard"})
					}
				case "podium_result":
					return
				}
			}
		}(i == 0, p)
	}
	boards := host.until("boards", nil)
	if list := boards["boards"].([]any); len(list) != 2 || len(list[0].(map[string]any)["c"].(string)) != 200 {
		t.Fatalf("boards %v", boards)
	}
	ko := host.until("ko", nil)
	if ko["user"].(map[string]any)["id"] != float64(1) || ko["rank"] != float64(2) {
		t.Fatalf("ko %v", ko)
	}
	over := host.until("podium_result", nil)
	wg.Wait()
	ranking := over["ranking"].([]any)
	if len(ranking) != 2 || ranking[0].(map[string]any)["user_id"] != float64(2) {
		t.Fatalf("ranking %v", ranking)
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
		if r["game_key"] != blockbattle.GameKey || !strings.HasPrefix(r["event_id"].(string), "bb-") || r["match"] == nil {
			t.Fatalf("bad result %v", r)
		}
	}
}
