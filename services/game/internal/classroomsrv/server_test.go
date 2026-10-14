package classroomsrv

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/classroom"
)

var secret = []byte("classroom-test-secret-with-32-chars!!")

// wsConn is a test WebSocket client.
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

// until reads messages until one of type kind matches.
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

func gameToken(t *testing.T, id int64, game string) string {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: game, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func classroomToken(t *testing.T, id, room int64) string {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: classroom.GameKey, Classroom: room, Booths: []string{"ping-pong", "snake"}, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func dialClassroom(t *testing.T, base string, id, room int64) *wsConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(base, "http") + "/ws/classroom?locale=id&token=" + classroomToken(t, id, room)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &wsConn{t: t, conn: conn, ctx: ctx}
}

func TestClassroomRejectsTokenWithoutClassroom(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	for name, tok := range map[string]string{
		"no classroom": classroomToken(t, 1, 0),
		"other game":   gameToken(t, 1, "snake"),
		"none":         "",
	} {
		res, err := http.Get(ts.URL + "/ws/classroom?token=" + tok)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: %d", name, res.StatusCode)
		}
	}
}

func TestClassroomKickSignature(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	body := []byte(`{"classroom":5,"user":0}`)
	now := time.Now().Unix()
	cases := map[string]struct {
		stamp int64
		key   []byte
		want  int
	}{
		"good":    {now, secret, http.StatusNoContent},
		"bad":     {now, []byte("another-secret-with-32-chars!!!!!"), http.StatusForbidden},
		"expired": {now - 3600, secret, http.StatusForbidden},
	}
	for name, tc := range cases {
		stamp := strconv.FormatInt(tc.stamp, 10)
		req, _ := http.NewRequest(http.MethodPost, ts.URL+"/internal/classroom/kick", bytes.NewReader(body))
		req.Header.Set("X-Game-Timestamp", stamp)
		req.Header.Set("X-Game-Signature", Sign(tc.key, stamp, body))
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != tc.want {
			t.Errorf("%s: %d want %d", name, res.StatusCode, tc.want)
		}
	}
}

func kickRequest(t *testing.T, base string, body string) int {
	t.Helper()
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	req, _ := http.NewRequest(http.MethodPost, base+"/internal/classroom/kick", strings.NewReader(body))
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(secret, stamp, []byte(body)))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res.StatusCode
}

// TestClassroomWebSocketWorld: two players of one classroom see each other in
// the roster and chat; a player of another classroom does not get the chat;
// a kick sends `kicked` and closes the socket.
func TestClassroomWebSocketWorld(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	a := dialClassroom(t, ts.URL, 1, 77)
	w := a.until("welcome", nil)
	if booths := w["booths"].([]any); len(booths) != 2 || booths[0].(map[string]any)["game"] != "ping-pong" || w["tick_ms"].(float64) != 66 {
		t.Fatalf("welcome: %v", w)
	}
	if desks := w["desks"].([]any); len(desks) != 12 {
		t.Fatalf("desks: %d", len(desks))
	}
	b := dialClassroom(t, ts.URL, 2, 77)
	b.until("welcome", nil)
	other := dialClassroom(t, ts.URL, 3, 88)
	other.until("welcome", nil)

	twoPlayers := func(m map[string]any) bool { return len(m["players"].([]any)) == 2 }
	a.until("roster", twoPlayers)
	b.until("roster", twoPlayers)

	a.send(map[string]any{"t": "chat", "text": "  halo\u200b  kelas  "})
	got := b.until("chat", nil)
	if got["text"] != "halo kelas" || got["id"].(float64) != 1 || got["name"] != "U1" {
		t.Fatalf("chat: %v", got)
	}

	// The other classroom must not see the chat: ping it and require the pong
	// to arrive with no chat before it.
	other.send(map[string]any{"t": "ping"})
	for {
		var msg map[string]any
		if err := wsjson.Read(other.ctx, other.conn, &msg); err != nil {
			t.Fatal(err)
		}
		if msg["t"] == "chat" {
			t.Fatalf("chat leaked to other classroom: %v", msg)
		}
		if msg["t"] == "pong" {
			break
		}
	}

	if code := kickRequest(t, ts.URL, `{"classroom":77,"user":2}`); code != http.StatusNoContent {
		t.Fatalf("kick: %d", code)
	}
	if k := b.until("kicked", nil); k["reason"] != "removed" {
		t.Fatalf("kicked: %v", k)
	}
	a.until("roster", func(m map[string]any) bool { return len(m["players"].([]any)) == 1 })
}

// TestClassroomSayReportsSignedEvent: a proximity `say` is delivered to both
// players over WebSocket and POSTed to ChatURL with a valid signature.
func TestClassroomSayReportsSignedEvent(t *testing.T) {
	type hit struct {
		body []byte
		ok   bool
	}
	hits := make(chan hit, 4)
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		ts := r.Header.Get("X-Game-Timestamp")
		hits <- hit{body: body, ok: r.Method == http.MethodPost && ts != "" && r.Header.Get("X-Game-Signature") == Sign(secret, ts, body)}
		w.WriteHeader(http.StatusOK)
	}))
	defer fake.Close()
	srv := New(Config{Secret: secret, ChatURL: fake.URL})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	a := dialClassroom(t, ts.URL, 1, 66)
	a.until("welcome", nil)
	b := dialClassroom(t, ts.URL, 2, 66)
	b.until("welcome", nil)
	srv.classroom.Place(66, 1, 0, 3)
	srv.classroom.Place(66, 2, 1, 3)
	a.send(map[string]any{"t": "say", "to": 2, "text": "halo"})
	for _, c := range []*wsConn{a, b} {
		if m := c.until("say", nil); m["text"] != "halo" || m["id"].(float64) != 1 || m["to"].(float64) != 2 {
			t.Fatalf("say: %v", m)
		}
	}
	select {
	case h := <-hits:
		if !h.ok {
			t.Fatal("bad signature or method")
		}
		var ev map[string]any
		if err := json.Unmarshal(h.body, &ev); err != nil {
			t.Fatal(err)
		}
		if ev["classroom"].(float64) != 66 || ev["from"].(float64) != 1 || ev["to"].(float64) != 2 || ev["text"] != "halo" || !strings.HasPrefix(ev["event_id"].(string), "cw-66-1-") || ev["at"].(float64) <= 0 {
			t.Fatalf("event: %s", h.body)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("chat endpoint not called")
	}
}

func TestHealthz(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	res, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != `{"status":"ok","service":"edufunhub-classroom","protocol":1}` {
		t.Fatalf("healthz: %d %s", res.StatusCode, body)
	}
}

// TestKickRejectsBadBody: a correctly signed but invalid body is a 400.
func TestKickRejectsBadBody(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	for _, body := range []string{`{"classroom":0,"user":1}`, `{"classroom":3,"user":-1}`, `nope`} {
		if code := kickRequest(t, ts.URL, body); code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, code)
		}
	}
}
