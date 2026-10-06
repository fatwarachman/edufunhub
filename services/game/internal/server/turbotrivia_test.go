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
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/turbotrivia"
)

func fastTurbo() turbotrivia.Config {
	c := turbotrivia.Defaults
	c.Tick, c.PlayerTick = 10*time.Millisecond, 20*time.Millisecond
	c.Countdown, c.QuestionTime, c.YoungTime, c.RevealTime = 30*time.Millisecond, 400*time.Millisecond, 400*time.Millisecond, 20*time.Millisecond
	c.MinAnswer, c.MissileFlight = 0, 30*time.Millisecond
	c.LapKm = 0.02
	c.Buffer = 4096
	return c
}

func dialTurbo(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/turbo-trivia?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func wsjsonRead(c *floorConn, v any) error  { return wsjson.Read(c.ctx, c.conn, v) }
func wsjsonWrite(c *floorConn, v any) error { return wsjson.Write(c.ctx, c.conn, v) }

func TestTurboTriviaRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, TurboTrivia: fastTurbo()}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/ws/turbo-trivia?token=" + floorToken(t, 1, "floor-drop"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token: %d", res.StatusCode)
	}
}

// TestTurboTriviaWebSocketRace races two karts over WebSocket: the host
// opens a room, both players join with the PIN, each player answers every
// question. The
// projector receives 20 Hz ticks, A crosses the line first and the signed
// results reach Laravel.
func TestTurboTriviaWebSocketRace(t *testing.T) {
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
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, TurboTrivia: fastTurbo()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunTurboTrivia(ctx, time.Second)

	host := dialTurbo(t, ts.URL, 900, turbotrivia.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	pin := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == turbotrivia.PhaseLobby })["pin"].(string)
	host.send(map[string]any{"t": "configure", "questions": 10})
	host.until("state_sync", func(m map[string]any) bool { return m["total"] == float64(10) })

	a := dialTurbo(t, ts.URL, 1, turbotrivia.GameKey)
	b := dialTurbo(t, ts.URL, 2, turbotrivia.GameKey)
	for _, p := range []*floorConn{a, b} {
		p.until("state_sync", nil)
	}
	// Spoofed player id is refused.
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
	host.send(map[string]any{"t": "start_game"})

	// Each player answers every question (A option 0, B option 1) until the
	// podium; the referee decides who is right.
	var wg sync.WaitGroup
	for i, p := range []*floorConn{a, b} {
		wg.Add(1)
		go func(choice int, p *floorConn) {
			defer wg.Done()
			for {
				var msg map[string]any
				if err := wsjsonRead(p, &msg); err != nil {
					return
				}
				switch msg["t"] {
				case "question_start":
					if _, leaked := msg["correct_index"]; leaked {
						t.Error("question_start leaked the answer")
					}
					_ = wsjsonWrite(p, map[string]any{"t": "submit_answer", "qid": msg["qid"], "choice_index": choice})
				case "podium_result":
					return
				}
			}
		}(i, p)
	}
	tick := host.until("tick", nil)
	if karts := tick["karts"].([]any); len(karts) != 2 {
		t.Fatalf("tick karts %v", karts)
	}
	over := host.until("podium_result", nil)
	wg.Wait()
	ranking := over["ranking"].([]any)
	if len(ranking) != 2 {
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
		if r["game_key"] != turbotrivia.GameKey || !strings.HasPrefix(r["event_id"].(string), "tt-") || r["match"] == nil {
			t.Fatalf("bad result %v", r)
		}
	}
}
