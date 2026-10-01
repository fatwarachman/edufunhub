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
	"edufunhub/game/internal/session"
	"edufunhub/game/internal/sky"
)

var secret = []byte("server-test-secret-with-32-chars!!")

func token(t *testing.T, exp time.Time) string {
	tok, err := auth.Sign(auth.Claims{Subject: 3, Name: "Andika", Grade: 4, Color: "amber", Accessory: "none", Game: session.GameKey, Expires: exp.Unix()}, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestHealthAndUnauthorized(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	res, _ := http.Get(ts.URL + "/healthz")
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"ok"`) {
		t.Fatalf("health: %d %s", res.StatusCode, body)
	}
	res, _ = http.Get(ts.URL + "/ws?token=bad")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 got %d", res.StatusCode)
	}
	res, _ = http.Get(ts.URL + "/ws?token=" + token(t, time.Now().Add(-time.Minute)))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expired token accepted: %d", res.StatusCode)
	}
}

func TestWebSocketWelcomeInteractAndReconnect(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, AllowedOrigins: []string{"*"}}).Handler())
	defer ts.Close()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws?locale=en&token=" + token(t, time.Now().Add(time.Hour))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	var welcome map[string]any
	if err := wsjson.Read(ctx, conn, &welcome); err != nil || welcome["t"] != "welcome" {
		t.Fatalf("welcome: %v %v", welcome, err)
	}
	player := welcome["player"].(map[string]any)
	if player["name"] != "Andika" || player["grade"].(float64) != 4 {
		t.Fatalf("player: %v", player)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "interact"})
	var reply map[string]any
	_ = wsjson.Read(ctx, conn, &reply)
	if reply["code"] != "nothing_nearby" {
		t.Fatalf("unexpected: %v", reply)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "mission", "mission": "forest"})
	_ = wsjson.Read(ctx, conn, &reply)
	if reply["mission"] != "forest" {
		t.Fatalf("mission switch failed: %v", reply)
	}
	conn.Close(websocket.StatusNormalClosure, "")

	conn2, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn2.Close(websocket.StatusNormalClosure, "")
	_ = wsjson.Read(ctx, conn2, &reply)
	if reply["mission"] != "forest" {
		t.Fatalf("reconnect must resume mission, got %v", reply["mission"])
	}
}

func TestReportSignsResult(t *testing.T) {
	var mu sync.Mutex
	var got []byte
	var sig, stamp string
	laravel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		got, _ = io.ReadAll(r.Body)
		sig, stamp = r.Header.Get("X-Game-Signature"), r.Header.Get("X-Game-Timestamp")
		w.WriteHeader(201)
	}))
	defer laravel.Close()
	s := New(Config{Secret: secret, ResultURL: laravel.URL})
	s.report(session.Result{EventID: "fq-1", UserID: 3, Points: 70})
	mu.Lock()
	defer mu.Unlock()
	if Sign(secret, stamp, got) != sig {
		t.Fatal("signature mismatch")
	}
	var r session.Result
	_ = json.Unmarshal(got, &r)
	if r.EventID != "fq-1" || r.Points != 70 {
		t.Fatalf("payload %+v", r)
	}
	if _, err := strconv.Atoi(stamp); err != nil {
		t.Fatal("timestamp missing")
	}
}

func TestSkyWebSocketRequiresSkyTokenAndPlays(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret, AllowedOrigins: []string{"*"}}).Handler())
	defer ts.Close()
	base := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/sky?locale=id&token="
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// A flag-quest token must not open the sky arena.
	if _, res, err := websocket.Dial(ctx, base+token(t, time.Now().Add(time.Hour)), nil); err == nil || res.StatusCode != http.StatusUnauthorized {
		t.Fatal("flag-quest token accepted by sky endpoint")
	}
	tok, _ := auth.Sign(auth.Claims{Subject: 9, Name: "Andika", Grade: 2, Game: sky.GameKey, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	conn, _, err := websocket.Dial(ctx, base+tok, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	var msg map[string]any
	if err := wsjson.Read(ctx, conn, &msg); err != nil || msg["t"] != "sky_state" || msg["phase"] != sky.PhaseReady {
		t.Fatalf("initial state: %v %v", msg, err)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "start"})
	_ = wsjson.Read(ctx, conn, &msg)
	q, ok := msg["question"].(map[string]any)
	if !ok || len(q["options"].([]any)) != sky.Options || msg["player"].(map[string]any)["grade"].(float64) != 2 {
		t.Fatalf("start: %v", msg)
	}
	_ = wsjson.Write(ctx, conn, map[string]any{"t": "touch", "option": 0})
	_ = wsjson.Read(ctx, conn, &msg)
	if msg["code"] != "too_early" {
		t.Fatalf("instant touch must be refused, got %v", msg)
	}
}
