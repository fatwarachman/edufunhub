package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/portsorter"
)

func TestPortSorterWebSocketRequiresItsTokenAndRefusesInstantLanding(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, AllowedOrigins: []string{"*"}}).Handler())
	defer ts.Close()
	base := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/port-sorter?locale=id&token="
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, res, err := websocket.Dial(ctx, base+token(t, time.Now().Add(time.Hour)), nil); err == nil || res.StatusCode != http.StatusUnauthorized {
		t.Fatal("flag-quest token accepted by port sorter endpoint")
	}
	tok, _ := auth.Sign(auth.Claims{Subject: 51, Name: "Dimas", Grade: 10, Game: portsorter.GameKey, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	conn, _, err := websocket.Dial(ctx, base+tok, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	var msg map[string]any
	if err := wsjson.Read(ctx, conn, &msg); err != nil || msg["t"] != "port_state" || msg["phase"] != "ready" || len(msg["sets"].([]any)) < 2 {
		t.Fatalf("initial state: %v %v", msg, err)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "choose", "value": "ports-services"})
	_ = wsjson.Read(ctx, conn, &msg)
	if msg["set"].(map[string]any)["key"] != "ports-services" || len(msg["bins"].([]any)) != 6 {
		t.Fatalf("choose: %v", msg)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "start", "value": "ports-basic"})
	_ = wsjson.Read(ctx, conn, &msg)
	pk, ok := msg["packet"].(map[string]any)
	if !ok || pk["fall_ms"].(float64) != float64(portsorter.Fall(0).Milliseconds()) || len(msg["bins"].([]any)) != 4 || pk["label"] == "" {
		t.Fatalf("start: %v", msg)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "land", "packet": pk["id"], "option": 0})
	_ = wsjson.Read(ctx, conn, &msg)
	if msg["code"] != "too_early" {
		t.Fatalf("instant landing must be refused, got %v", msg)
	}
}
