package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"edufunhub/game/internal/floordrop"
)

// closeHandler serves srv plus the classroom close route (registered in
// server.go by the parent; added here so the test does not depend on it).
func closeHandler(srv *Server) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", srv.Handler())
	mux.HandleFunc("POST /internal/classroom/close", srv.serveClassroomClose)
	return mux
}

func postClose(t *testing.T, h http.Handler, body string, ts time.Time, key []byte) int {
	t.Helper()
	stamp := strconv.FormatInt(ts.Unix(), 10)
	req := httptest.NewRequest(http.MethodPost, "/internal/classroom/close", bytes.NewBufferString(body))
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, []byte(body)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestClassroomCloseSignature(t *testing.T) {
	h := closeHandler(New(Config{Secret: secret}))
	now := time.Now()
	cases := []struct {
		name string
		body string
		ts   time.Time
		key  []byte
		want int
	}{
		{"good", `{"classroom":5}`, now, secret, http.StatusNoContent},
		{"bad signature", `{"classroom":5}`, now, []byte("another-secret-that-is-long-enough!!"), http.StatusForbidden},
		{"expired", `{"classroom":5}`, now.Add(-10 * time.Minute), secret, http.StatusForbidden},
		{"future", `{"classroom":5}`, now.Add(10 * time.Minute), secret, http.StatusForbidden},
		{"zero classroom", `{"classroom":0}`, now, secret, http.StatusBadRequest},
		{"bad json", `{"classroom":`, now, secret, http.StatusBadRequest},
	}
	for _, c := range cases {
		if got := postClose(t, h, c.body, c.ts, c.key); got != c.want {
			t.Errorf("%s: status %d, want %d", c.name, got, c.want)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/internal/classroom/close", bytes.NewBufferString(`{"classroom":5}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("unsigned: status %d", rec.Code)
	}
}

// TestClassroomCloseOverWebSocket: closing classroom 51 ends its Floor Drop
// room (state_sync NONE, closed "classroom_ended") and its Main Ular room
// (error "classroom_ended", then a room-less state), while classroom 52 and
// a normal PIN room keep playing.
func TestClassroomCloseOverWebSocket(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, FloorDrop: fastFloor()})
	ts := httptest.NewServer(closeHandler(srv))
	defer ts.Close()

	// Floor Drop: captain + mate in classroom 51, another player in 52.
	captain := dialHostGameClassroom(t, ts.URL, "/ws/floor-drop", floordrop.GameKey, 1, 51)
	mate := dialHostGameClassroom(t, ts.URL, "/ws/floor-drop", floordrop.GameKey, 2, 51)
	other := dialHostGameClassroom(t, ts.URL, "/ws/floor-drop", floordrop.GameKey, 3, 52)
	var pin string
	for _, c := range []*floorConn{captain, mate, other} {
		c.until("state_sync", nil)
		c.send(map[string]any{"t": "classroom"})
		st := c.until("state_sync", func(m map[string]any) bool { return m["phase"] == floordrop.PhaseLobby })
		if c == captain {
			pin = st["pin"].(string)
		}
	}
	// Normal PIN room with a host screen.
	host := dialFloor(t, ts.URL, 100, floordrop.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	normalPin := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == floordrop.PhaseLobby })["pin"].(string)

	// Main Ular: two players of classroom 51.
	s1 := dialSnakeClassroom(t, ts.URL, 11, 51)
	s2 := dialSnakeClassroom(t, ts.URL, 12, 51)
	for _, c := range []*floorConn{s1, s2} {
		c.until("snake_state", nil)
		c.send(map[string]any{"t": "classroom"})
		c.until("snake_state", func(m map[string]any) bool { return m["classroom"] == float64(51) })
	}
	if _, ok := srv.snake.Presence(11); !ok {
		t.Fatal("snake classroom room missing")
	}

	if code := postClose(t, ts.Config.Handler, `{"classroom":51}`, time.Now(), secret); code != http.StatusNoContent {
		t.Fatalf("close status %d", code)
	}

	for _, c := range []*floorConn{captain, mate} {
		st := c.until("state_sync", func(m map[string]any) bool { return m["phase"] == "NONE" })
		if st["closed"] != floordrop.ClosedClassroom {
			t.Fatalf("floor close reason %v", st["closed"])
		}
	}
	if _, err := srv.floor.Inspect(pin, func(r *floordrop.Room) any { return nil }); err == nil {
		t.Fatal("floor classroom room still open")
	}
	for _, c := range []*floorConn{s1, s2} {
		if e := c.until("error", nil); e["code"] != classroomEnded {
			t.Fatalf("snake error %v", e)
		}
		if st := c.until("snake_state", nil); st["pin"] != nil && st["pin"] != "" {
			t.Fatalf("snake still in room %v", st["pin"])
		}
	}
	if _, ok := srv.snake.Presence(11); ok {
		t.Fatal("snake classroom room still open")
	}
	// Untouched: classroom 52 and the normal PIN room.
	if _, _, _, ok := srv.floor.Presence(3); !ok {
		t.Fatal("other classroom room closed")
	}
	if _, ok := srv.floor.RoomPhase(normalPin); !ok {
		t.Fatal("normal PIN room closed")
	}
	if _, ok := srv.snake.Presence(12); ok {
		t.Fatal("snake mate still seated")
	}
}
