package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/floordrop"
)

func floorToken(t *testing.T, id int64, game string) string {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: game, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

type floorConn struct {
	t    *testing.T
	conn *websocket.Conn
	ctx  context.Context
}

func dialFloor(t *testing.T, base string, id int64, game string) *floorConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/floor-drop?locale=en&token=" + floorToken(t, id, game)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

func (c *floorConn) send(msg map[string]any) {
	c.t.Helper()
	if err := wsjson.Write(c.ctx, c.conn, msg); err != nil {
		c.t.Fatal(err)
	}
}

// until reads messages until one of type kind matches.
func (c *floorConn) until(kind string, match func(map[string]any) bool) map[string]any {
	c.t.Helper()
	for {
		var msg map[string]any
		if err := wsjson.Read(c.ctx, c.conn, &msg); err != nil {
			c.t.Fatalf("waiting for %s: %v", kind, err)
		}
		if msg["t"] == "error" && kind != "error" {
			c.t.Fatalf("error while waiting for %s: %v", kind, msg)
		}
		if msg["t"] == kind && (match == nil || match(msg)) {
			return msg
		}
	}
}

func fastFloor() floordrop.Config {
	c := floordrop.Defaults
	c.BaseTime, c.YoungTime, c.MinTime = time.Second, time.Second, 500*time.Millisecond
	c.ReadyTime, c.LockTime, c.RevealTime, c.SummaryTime = 100*time.Millisecond, 50*time.Millisecond, 80*time.Millisecond, 50*time.Millisecond
	c.MinAnswer, c.Grace = 0, 300*time.Millisecond
	c.Tick, c.Progress = 10*time.Millisecond, 30*time.Millisecond
	return c
}

func TestFloorDropRejectsWrongToken(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, FloorDrop: fastFloor()}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/ws/floor-drop?token=" + floorToken(t, 1, "sky-quiz"))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("foreign game token: %d", res.StatusCode)
	}
}

// TestFloorDropWebSocketGame plays a full game over WebSocket: the host
// opens a room, two players join with the PIN, one answers right and wins,
// and the signed results reach the Laravel endpoint.
func TestFloorDropWebSocketGame(t *testing.T) {
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
	srv := New(Config{Secret: secret, ResultURL: laravel.URL, AllowedOrigins: []string{"*"}, FloorDrop: fastFloor()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunFloorDrop(ctx, time.Second)

	host := dialFloor(t, ts.URL, 100, floordrop.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	lobby := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == floordrop.PhaseLobby })
	pin := lobby["pin"].(string)

	a := dialFloor(t, ts.URL, 1, floordrop.GameKey)
	b := dialFloor(t, ts.URL, 2, floordrop.GameKey)
	for _, p := range []*floorConn{a, b} {
		p.until("state_sync", nil)
		p.send(map[string]any{"t": "join_room", "pin": pin})
		p.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
	}
	// A player cannot start the game or change settings; the host can.
	a.send(map[string]any{"t": "start_game"})
	if e := a.until("error", nil); e["code"] != "host_only" {
		t.Fatalf("player start: %v", e)
	}
	host.send(map[string]any{"t": "set_settings", "minutes": 7})
	if e := host.until("error", nil); e["code"] != "invalid_duration" {
		t.Fatalf("odd duration: %v", e)
	}
	host.send(map[string]any{"t": "set_settings", "minutes": 3, "player_limit": 10})
	host.until("state_sync", func(m map[string]any) bool { return m["minutes"] == float64(3) && m["max_players"] == float64(10) })
	host.send(map[string]any{"t": "start_game"})

	// Every round A answers option 1 and B stays silent. Three silent rounds
	// break B's floor; A either keeps answering right or falls in the same
	// round having answered, so A always ranks first.
	var drop map[string]any
	for round := 1; round <= floordrop.Lives; round++ {
		q := a.until("question_start", nil)
		if _, leaked := q["correct_index"]; leaked {
			t.Fatal("question_start leaked the answer")
		}
		a.send(map[string]any{"t": "submit_answer", "round_id": q["round_id"], "choice_index": 1})
		a.until("answer_ack", nil)
		drop = host.until("tile_drop", nil)
		lives := drop["lives"].(map[string]any)
		if lives["2"] != float64(floordrop.Lives-round) {
			t.Fatalf("round %d: B lives %v", round, lives)
		}
	}
	over := host.until("podium_result", nil)
	ranking := over["ranking"].([]any)
	first := int64(ranking[0].(map[string]any)["user_id"].(float64))
	if first != 1 {
		t.Fatalf("A must rank first: %v (last drop %v)", ranking, drop)
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
		if r["game_key"] != floordrop.GameKey || !strings.HasPrefix(r["event_id"].(string), "fd-") || r["match"] == nil {
			t.Fatalf("bad result %v", r)
		}
	}
}
