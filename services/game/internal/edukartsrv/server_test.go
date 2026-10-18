package edukartsrv

import (
	"bytes"
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
	"edufunhub/game/internal/edukart"
)

var secret = []byte("edukart-test-secret-with-32-chars!!!")

func token(t *testing.T, id int64) string {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: edukart.GameKey, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

type wsConn struct {
	t    *testing.T
	conn *websocket.Conn
	ctx  context.Context
}

func (c *wsConn) send(msg map[string]any) {
	c.t.Helper()
	if err := wsjson.Write(c.ctx, c.conn, msg); err != nil {
		c.t.Fatal(err)
	}
}

func (c *wsConn) until(kind string, match func(map[string]any) bool) map[string]any {
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

func dial(t *testing.T, base string, id int64) *wsConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/edu-kart?locale=id&token=" + token(t, id)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &wsConn{t: t, conn: conn, ctx: ctx}
}

func TestHealthz(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	res, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || string(body) != `{"status":"ok","service":"edufunhub-edukart","protocol":1}` {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
}

func TestWebSocketUnauthorized(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	for _, q := range []string{"", "?token=bad"} {
		res, err := http.Get(ts.URL + "/ws/edu-kart" + q)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%q: %d", q, res.StatusCode)
		}
	}
	// Token for another game.
	tok, _ := auth.Sign(auth.Claims{Subject: 1, Game: "ping-pong", Expires: time.Now().Add(time.Hour).Unix()}, secret)
	res, _ := http.Get(ts.URL + "/ws/edu-kart?token=" + tok)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("other game token: %d", res.StatusCode)
	}
}

func signedGet(t *testing.T, base, path string, key []byte, at time.Time) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, base+path, nil)
	stamp := strconv.FormatInt(at.Unix(), 10)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, nil))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestInternalEndpointsRequireSignature(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	now := time.Now()
	paths := []string{"/internal/presence?user=1", "/internal/room?pin=123456", "/internal/stats", "/internal/live-rooms"}
	for _, p := range paths {
		if res := signedGet(t, ts.URL, p, []byte("wrong-secret-wrong-secret-wrong!!"), now); res.StatusCode != http.StatusForbidden {
			t.Fatalf("%s bad key: %d", p, res.StatusCode)
		}
		if res := signedGet(t, ts.URL, p, secret, now.Add(-time.Hour)); res.StatusCode != http.StatusForbidden {
			t.Fatalf("%s stale: %d", p, res.StatusCode)
		}
		if res := signedGet(t, ts.URL, p, secret, now); res.StatusCode != http.StatusOK {
			t.Fatalf("%s good: %d", p, res.StatusCode)
		}
	}
	// Presence and PIN lookup see a room.
	pin, _ := srv.Hub().Create(auth.Claims{Subject: 7, Name: "A", Game: edukart.GameKey}, now)
	var body struct {
		Rooms []map[string]any `json:"rooms"`
	}
	_ = json.NewDecoder(signedGet(t, ts.URL, "/internal/presence?user=7", secret, now).Body).Decode(&body)
	if len(body.Rooms) != 1 || body.Rooms[0]["game"] != edukart.GameKey || body.Rooms[0]["pin"] != pin || body.Rooms[0]["host"] != true {
		t.Fatalf("presence %v", body.Rooms)
	}
	_ = json.NewDecoder(signedGet(t, ts.URL, "/internal/room?pin="+pin, secret, now).Body).Decode(&body)
	if len(body.Rooms) != 1 || body.Rooms[0]["game"] != edukart.GameKey || body.Rooms[0]["open"] != true {
		t.Fatalf("room %v", body.Rooms)
	}
	var stats Stats
	_ = json.NewDecoder(signedGet(t, ts.URL, "/internal/stats", secret, now).Body).Decode(&stats)
	if stats.Service != "edufunhub-edukart" || len(stats.Games) != 1 || stats.Games[0].Game != edukart.GameKey || stats.Games[0].Sessions != 1 {
		t.Fatalf("stats %+v", stats)
	}
	if res := signedGet(t, ts.URL, "/internal/room?pin=12", secret, now); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pin: %d", res.StatusCode)
	}
}

func postClose(t *testing.T, base, body string, key []byte) int {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, base+"/internal/classroom/close", bytes.NewBufferString(body))
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, []byte(body)))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res.StatusCode
}

func TestClassroomClose(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	now := time.Now()
	if _, err := srv.Hub().EnterClassroom(auth.Claims{Subject: 5, Name: "A", Game: edukart.GameKey, Classroom: 3}, now); err != nil {
		t.Fatal(err)
	}
	if code := postClose(t, ts.URL, `{"classroom":3}`, []byte("bad-bad-bad-bad-bad-bad-bad-bad-!!")); code != http.StatusForbidden {
		t.Fatalf("bad signature: %d", code)
	}
	if code := postClose(t, ts.URL, `{"classroom":0}`, secret); code != http.StatusBadRequest {
		t.Fatalf("bad body: %d", code)
	}
	if code := postClose(t, ts.URL, `{"classroom":3}`, secret); code != http.StatusNoContent {
		t.Fatalf("close: %d", code)
	}
	if _, ok := srv.Hub().Presence(5); ok {
		t.Fatal("room still open")
	}
}

func TestWebSocketRaceFlow(t *testing.T) {
	var mu sync.Mutex
	var reported [][]byte
	results := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.Header.Get("X-Game-Signature") != Sign(secret, r.Header.Get("X-Game-Timestamp"), body) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		mu.Lock()
		reported = append(reported, body)
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer results.Close()
	srv := New(Config{Secret: secret, ResultURL: results.URL})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Run(ctx)

	c := dial(t, ts.URL, 11)
	track := c.until("edukart_track", nil)
	if tr := track["track"].(map[string]any); tr["id"] != "forest" || len(tr["samples"].([]any)) < 16 {
		t.Fatalf("track %v", tr["id"])
	}
	c.until(edukart.StateType, nil)
	c.send(map[string]any{"t": "create"})
	c.until(edukart.StateType, func(m map[string]any) bool { return m["pin"] != "" })
	c.send(map[string]any{"t": "settings", "track": "moon"})
	if e := c.until("error", nil); e["code"] != "invalid_track" {
		t.Fatalf("error %v", e)
	}
	c.send(map[string]any{"t": "settings", "track": "beach", "laps": 2})
	if tr := c.until("edukart_track", nil)["track"].(map[string]any); tr["id"] != "beach" {
		t.Fatalf("track not resent: %v", tr["id"])
	}
	c.send(map[string]any{"t": "vehicle", "vehicle": "hover"})
	st := c.until(edukart.StateType, func(m map[string]any) bool {
		p := m["players"].([]any)
		return len(p) == 1 && p[0].(map[string]any)["vehicle"] == "hover"
	})
	if st["laps"].(float64) != 2 || st["track"] != "beach" {
		t.Fatalf("state %v", st)
	}
	c.send(map[string]any{"t": "start"})
	c.until(edukart.StateType, func(m map[string]any) bool { return m["race"] != nil })
	c.send(map[string]any{"t": "input", "seq": 1, "throttle": 1})
	frame := c.until("race", func(m map[string]any) bool { return m["ms"].(float64) > 0 })
	if frame["you"].(float64) != 0 || len(frame["racers"].([]any)) != edukart.MaxRacers {
		t.Fatalf("frame %v", frame)
	}
	c.until("race", func(m map[string]any) bool { return m["ack"].(float64) == 1 })
	c.send(map[string]any{"t": "ping"})
	c.until("pong", nil)
	c.send(map[string]any{"t": "stop"})
	done := c.until(edukart.StateType, func(m map[string]any) bool { return m["phase"] == "done" })
	race := done["race"].(map[string]any)
	if race["status"] != "done" || race["result"] == nil {
		t.Fatalf("done %v", race)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(reported)
		mu.Unlock()
		if n > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reported) != 1 || !bytes.Contains(reported[0], []byte(`"game_key":"edu-kart"`)) || !bytes.Contains(reported[0], []byte(`"event_id":"ek-11-room-`)) {
		t.Fatalf("reported %s", reported)
	}
}

func TestLatestConnectionWins(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	a := dial(t, ts.URL, 21)
	a.until(edukart.StateType, nil)
	b := dial(t, ts.URL, 21)
	b.until(edukart.StateType, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for {
		var msg map[string]any
		if err := wsjson.Read(ctx, a.conn, &msg); err != nil {
			return // replaced connection closed
		}
	}
}

// A second tab/device of the same account takes over; the older socket must be
// closed with StatusReplaced so its client stops instead of reconnecting and
// kicking the new one out in turn (the endless "reconnecting" loop in prod).
func TestSecondConnectionClosesTheFirstAsReplaced(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	first := dial(t, ts.URL, 77)
	first.until("edukart_state", nil)
	second := dial(t, ts.URL, 77)
	second.until("edukart_state", nil)
	told := false
	for {
		var msg map[string]any
		err := wsjson.Read(first.ctx, first.conn, &msg)
		if err == nil {
			told = told || msg["t"] == "replaced"
			continue
		}
		if !told {
			t.Fatal(`first socket must get {"t":"replaced"} before the close`)
		}
		if code := websocket.CloseStatus(err); code != StatusReplaced {
			t.Fatalf("first socket closed with %v (%v), want %d", code, err, StatusReplaced)
		}
		break
	}
	second.send(map[string]any{"t": "create"})
	if st := second.until("edukart_state", func(m map[string]any) bool { return m["pin"] != "" }); st["pin"] == "" {
		t.Fatal("second socket must keep working")
	}
}
