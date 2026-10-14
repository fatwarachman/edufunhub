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
	"edufunhub/game/internal/heist"
	"edufunhub/game/internal/monstercafe"
	"edufunhub/game/internal/orderrush"
)

func dialHostGameClassroom(t *testing.T, base, path, game string, id, room int64) *floorConn {
	t.Helper()
	tok, err := auth.Sign(auth.Claims{Subject: id, Name: "U" + strconv.FormatInt(id, 10), Grade: 10, Game: game, Classroom: room, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+path+"?token="+tok, nil)
	if err != nil {
		t.Fatal(err)
	}
	conn.SetReadLimit(1 << 20)
	t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
	return &floorConn{t: t, conn: conn, ctx: ctx}
}

// TestHostGamesClassroomOverWebSocket: {t:"classroom"} on Monster Café,
// Economy Heist and Order Rush seats players of one classroom in one
// host-screen-less room run by the first player (captain), hides it from the
// PIN lookup and refuses host tokens.
func TestHostGamesClassroomOverWebSocket(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, MonsterCafe: fastCafe(), Heist: fastHeist(), OrderRush: fastRush()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	games := []struct{ path, game, host, lobby string }{
		{"/ws/monster-cafe", monstercafe.GameKey, monstercafe.HostKey, monstercafe.PhaseLobby},
		{"/ws/economy-heist", heist.GameKey, heist.HostKey, heist.PhaseLobby},
		{"/ws/order-rush", orderrush.GameKey, orderrush.HostKey, orderrush.PhaseLobby},
	}
	for _, g := range games {
		t.Run(g.game, func(t *testing.T) {
			captain := dialHostGameClassroom(t, ts.URL, g.path, g.game, 1, 41)
			captain.until("state_sync", nil)
			captain.send(map[string]any{"t": "classroom", "classroom": 99})
			st := captain.until("state_sync", func(m map[string]any) bool { return m["phase"] == g.lobby })
			if st["classroom"] != float64(41) || st["captain"] != float64(1) || st["role"] != "player" {
				t.Fatalf("captain state: classroom %v captain %v role %v", st["classroom"], st["captain"], st["role"])
			}
			pin := st["pin"].(string)
			if found := srv.FindPin(pin); len(found) != 0 {
				t.Fatalf("pin lookup found classroom room: %v", found)
			}

			mate := dialHostGameClassroom(t, ts.URL, g.path, g.game, 2, 41)
			mate.until("state_sync", nil)
			mate.send(map[string]any{"t": "classroom"})
			ms := mate.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })
			if ms["captain"] != float64(1) {
				t.Fatalf("mate sees captain %v", ms["captain"])
			}
			mate.send(map[string]any{"t": "start_game"})
			if e := mate.until("error", nil); e["code"] != "host_only" {
				t.Fatalf("non-captain start: %v", e)
			}

			other := dialHostGameClassroom(t, ts.URL, g.path, g.game, 3, 42)
			other.until("state_sync", nil)
			other.send(map[string]any{"t": "join_room", "room_code": pin})
			if e := other.until("error", nil); e["code"] != "room_not_found" {
				t.Fatalf("other classroom pin: %v", e)
			}

			hostTok := dialHostGameClassroom(t, ts.URL, g.path, g.host, 4, 41)
			hostTok.until("state_sync", nil)
			hostTok.send(map[string]any{"t": "classroom"})
			if e := hostTok.until("error", nil); e["code"] != "player_only" {
				t.Fatalf("host token: %v", e)
			}

			plain := dialHostGameClassroom(t, ts.URL, g.path, g.game, 5, 0)
			plain.until("state_sync", nil)
			plain.send(map[string]any{"t": "classroom"})
			if e := plain.until("error", nil); e["code"] != "no_classroom" {
				t.Fatalf("no classroom: %v", e)
			}

			captain.send(map[string]any{"t": "start_game"})
			captain.until("state_sync", func(m map[string]any) bool { return m["phase"] != g.lobby && m["phase"] != nil && m["pin"] == pin })
		})
	}
}
