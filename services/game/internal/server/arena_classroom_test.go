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
)

// dialArenaClassroom opens a game socket with a token that carries a
// classroom claim (0 = none).
func dialArenaClassroom(t *testing.T, base, path, game string, id, room int64) *floorConn {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 4, Game: game, Classroom: room, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+path+"?locale=en&token="+tok, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

// TestArenaGamesClassroomOverWebSocket: for floor-drop, turbo-trivia and
// block-battle a player token sends {t:"classroom"}, lands in a room without
// a host screen as captain, a classmate joins the same room, the PIN lookup
// does not see it, another classroom cannot use the PIN, the captain can
// start and a host token is refused.
func TestArenaGamesClassroomOverWebSocket(t *testing.T) {
	srv := New(Config{Secret: secret, FloorDrop: fastFloor(), TurboTrivia: fastTurbo(), BlockBattle: fastBlock()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	for _, g := range []struct{ path, game, host string }{
		{"/ws/floor-drop", "floor-drop", "floor-drop-host"},
		{"/ws/turbo-trivia", "turbo-trivia", "turbo-trivia-host"},
		{"/ws/block-battle", "block-battle", "block-battle-host"},
	} {
		t.Run(g.game, func(t *testing.T) {
			captain := dialArenaClassroom(t, ts.URL, g.path, g.game, 1, 41)
			captain.until("state_sync", nil)
			captain.send(map[string]any{"t": "classroom", "classroom": 99})
			state := captain.until("state_sync", func(m map[string]any) bool { return m["classroom"] == float64(41) })
			pin, _ := state["pin"].(string)
			if pin == "" || state["captain"] != float64(1) || state["role"] != "player" {
				t.Fatalf("captain state: %v", state)
			}
			for _, room := range srv.FindPin(pin) {
				if room.Game == g.game {
					t.Fatalf("PIN lookup found classroom room: %v", room)
				}
			}

			mate := dialArenaClassroom(t, ts.URL, g.path, g.game, 2, 41)
			mate.until("state_sync", nil)
			mate.send(map[string]any{"t": "classroom"})
			joined := mate.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
			if joined["captain"] != float64(1) {
				t.Fatalf("mate state: %v", joined)
			}

			other := dialArenaClassroom(t, ts.URL, g.path, g.game, 3, 42)
			other.until("state_sync", nil)
			other.send(map[string]any{"t": "join_room", "pin": pin, "room_code": pin})
			if e := other.until("error", nil); e["code"] != "room_not_found" {
				t.Fatalf("other classroom by PIN: %v", e)
			}

			none := dialArenaClassroom(t, ts.URL, g.path, g.game, 4, 0)
			none.until("state_sync", nil)
			none.send(map[string]any{"t": "classroom"})
			if e := none.until("error", nil); e["code"] != "no_classroom" {
				t.Fatalf("no classroom: %v", e)
			}

			host := dialArenaClassroom(t, ts.URL, g.path, g.host, 5, 41)
			host.until("state_sync", nil)
			host.send(map[string]any{"t": "classroom"})
			if e := host.until("error", nil); e["code"] != "player_only" {
				t.Fatalf("host token: %v", e)
			}

			mate.send(map[string]any{"t": "start_game"})
			if e := mate.until("error", nil); e["code"] != "host_only" {
				t.Fatalf("non-captain start: %v", e)
			}
			captain.send(map[string]any{"t": "start_game"})
			captain.until("state_sync", func(m map[string]any) bool { return m["phase"] != "LOBBY" })
			captain.send(map[string]any{"t": "leave_room"})
			mate.until("state_sync", func(m map[string]any) bool { return m["captain"] == float64(2) })
		})
	}
}
