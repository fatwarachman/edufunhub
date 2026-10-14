package server

import (
	"context"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/edusnake"
)

func dialSnakeClassroom(t *testing.T, base string, id, room int64) *floorConn {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: edusnake.GameKey, Classroom: room, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+"/ws/snake?token="+tok, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

// TestClassroomRoomOverWebSocket: players of one classroom land in the same
// room with {t:"classroom"} (no PIN), another classroom gets its own room and
// cannot use the PIN, and a token without a classroom claim is refused.
func TestClassroomRoomOverWebSocket(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()

	host := dialSnakeClassroom(t, ts.URL, 1, 31)
	host.until("snake_state", nil)
	host.send(map[string]any{"t": "classroom"})
	state := host.until("snake_state", func(m map[string]any) bool { return m["classroom"] == float64(31) })
	pin, _ := state["pin"].(string)
	if pin == "" {
		t.Fatalf("no room: %v", state)
	}

	mate := dialSnakeClassroom(t, ts.URL, 2, 31)
	mate.until("snake_state", nil)
	mate.send(map[string]any{"t": "classroom"})
	joined := mate.until("snake_state", func(m map[string]any) bool { return m["pin"] == pin })
	if players, _ := joined["players"].([]any); len(players) != 2 {
		t.Fatalf("players %v", joined["players"])
	}

	other := dialSnakeClassroom(t, ts.URL, 3, 32)
	other.until("snake_state", nil)
	other.send(map[string]any{"t": "join", "pin": pin})
	if e := other.until("error", nil); e["code"] != "room_not_found" {
		t.Fatalf("pin of other classroom: %v", e)
	}
	other.send(map[string]any{"t": "classroom"})
	own := other.until("snake_state", func(m map[string]any) bool { return m["classroom"] == float64(32) })
	if own["pin"] == pin {
		t.Fatal("other classroom joined the room")
	}

	plain := dialSnake(t, ts.URL, 4, edusnake.GameKey)
	plain.until("snake_state", nil)
	plain.send(map[string]any{"t": "classroom"})
	if e := plain.until("error", nil); e["code"] != "no_classroom" {
		t.Fatalf("no claim: %v", e)
	}
}
