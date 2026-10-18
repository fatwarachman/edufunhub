package server

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/pingpong"
)

// A second tab/device of the same account takes over every game socket; the
// older one must close with StatusReplaced so its client stops instead of
// reconnecting and kicking the new one out (the endless reconnect loop).
func TestSecondConnectionClosesTheFirstAsReplaced(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	for _, tc := range []struct{ path, game string }{
		{"/ws/ping-pong", pingpong.GameKey},
		{"/ws/duel", "quiz-duel"},
		{"/ws/floor-drop", "floor-drop"},
		{"/ws/turbo-trivia", "turbo-trivia"},
		{"/ws/snake", "snake"},
	} {
		t.Run(tc.game, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			url := "ws" + strings.TrimPrefix(ts.URL, "http") + tc.path + "?locale=id&token=" + floorToken(t, 91, tc.game)
			first, _, err := websocket.Dial(ctx, url, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer first.Close(websocket.StatusNormalClosure, "")
			var msg map[string]any
			if err := wsjson.Read(ctx, first, &msg); err != nil {
				t.Fatal(err)
			}
			second, _, err := websocket.Dial(ctx, url, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer second.Close(websocket.StatusNormalClosure, "")
			told := false
			for {
				msg = nil
				if err := wsjson.Read(ctx, first, &msg); err != nil {
					if code := websocket.CloseStatus(err); code != StatusReplaced {
						t.Fatalf("first socket closed with %v (%v), want %d", code, err, StatusReplaced)
					}
					break
				}
				told = told || msg["t"] == "replaced"
			}
			if !told {
				t.Fatal(`first socket must get {"t":"replaced"} before the close`)
			}
			if err := wsjson.Read(ctx, second, &msg); err != nil {
				t.Fatalf("second socket must keep working: %v", err)
			}
		})
	}
}
