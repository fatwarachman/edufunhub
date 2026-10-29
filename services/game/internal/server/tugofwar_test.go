package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/tugofwar"
)

func TestTugOfWarWebSocketAndSignedResult(t *testing.T) {
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"tw-ws-1","type":"choice","band":1,"subject":"science","prompt":{"id":"Pilih BENAR","en":"Pick RIGHT"},"options":[{"id":"RIGHT"},{"id":"WRONG-A"},{"id":"WRONG-B"},{"id":"WRONG-C"}],"answer":0,"games":["tug-of-war"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	questions.Use(bank)
	questions.History.Reset()
	t.Cleanup(func() { questions.Use(nil); questions.History.Reset() })
	results := make(chan map[string]any, 4)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if Sign(secret, r.Header.Get("X-Game-Timestamp"), body) != r.Header.Get("X-Game-Signature") {
			t.Error("invalid signature")
		}
		var m map[string]any
		if err := json.Unmarshal(body, &m); err != nil {
			t.Error(err)
		}
		results <- m
		w.WriteHeader(201)
	}))
	defer receiver.Close()
	srv := New(Config{Secret: secret, ResultURL: receiver.URL, AllowedOrigins: []string{"*"}})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	tick, stopTick := context.WithCancel(context.Background())
	defer stopTick()
	go srv.RunTugOfWar(tick, 20*time.Millisecond)
	res, err := http.Get(ts.URL + "/ws/tug-of-war?token=" + floorToken(t, 1, "ping-pong"))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatalf("auth: %d", res.StatusCode)
	}
	dial := func(id int64) *floorConn {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		t.Cleanup(cancel)
		conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws/tug-of-war?locale=en&token="+floorToken(t, id, tugofwar.GameKey), nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
		c := &floorConn{t: t, conn: conn, ctx: ctx}
		c.until("tugofwar_state", nil)
		return c
	}
	a, b := dial(91), dial(92)
	a.send(map[string]any{"t": "create"})
	pin := a.until("tugofwar_state", func(m map[string]any) bool { return m["pin"] != "" })["pin"].(string)
	b.send(map[string]any{"t": "join", "pin": pin})
	b.until("tugofwar_state", func(m map[string]any) bool { return m["you"] == float64(1) })
	b.send(map[string]any{"t": "team", "seat": 0, "team": 1})
	if e := b.until("error", nil); e["code"] != "not_host" {
		t.Fatal(e)
	}
	a.send(map[string]any{"t": "questions", "count": 5})
	a.until("tugofwar_state", func(m map[string]any) bool { return m["question_count"] == float64(5) })
	a.send(map[string]any{"t": "subject", "subject": "science"})
	a.until("tugofwar_state", func(m map[string]any) bool { return m["subject"] == "science" })
	a.send(map[string]any{"t": "start"})
	q := b.until("tugofwar_state", func(m map[string]any) bool { return m["stage"] == "question" })
	question := q["question"].(map[string]any)
	if _, leak := question["answer"]; leak {
		t.Fatal("answer leaked")
	}
	opts := question["options"].([]any)
	right := -1
	for i, o := range opts {
		if o == "RIGHT" {
			right = i
		}
	}
	time.Sleep(350 * time.Millisecond)
	b.send(map[string]any{"t": "answer", "round": q["round"], "option": right})
	var s map[string]any
	for s == nil {
		var msg map[string]any
		if err := wsjson.Read(b.ctx, b.conn, &msg); err != nil {
			t.Fatalf("waiting for the pull (right=%d, options=%v): %v", right, opts, err)
		}
		if msg["t"] == "error" {
			t.Fatalf("answer rejected (right=%d, options=%v): %v", right, opts, msg)
		}
		if msg["t"] == "tugofwar_state" && msg["rope"] == float64(1) {
			s = msg
		}
	}
	if s["reveal"].(map[string]any)["team"] != float64(1) {
		t.Fatal(s["reveal"])
	}
	a.send(map[string]any{"t": "stop"})
	a.until("tugofwar_state", func(m map[string]any) bool { return m["phase"] == "done" && m["winner"] == float64(1) })
	got := map[float64]map[string]any{}
	for len(got) < 2 {
		select {
		case r := <-results:
			if r["game_key"] != tugofwar.GameKey || !strings.HasPrefix(r["event_id"].(string), "tw-") {
				t.Fatal(r)
			}
			got[r["user_id"].(float64)] = r
		case <-time.After(3 * time.Second):
			t.Fatal("missing signed result")
		}
	}
	if got[92]["points"].(float64) <= got[91]["points"].(float64) {
		t.Fatal("winning team not paid more", got[91]["points"], got[92]["points"])
	}
}

func TestTugOfWarDiscovery(t *testing.T) {
	srv := New(Config{Secret: secret})
	now := time.Now()
	c := auth.Claims{Subject: 55, Name: "Rani", Grade: 10, Game: tugofwar.GameKey}
	pin, _ := srv.tug.Create(c, now)
	if rooms := srv.FindPin(pin); len(rooms) != 1 || rooms[0].Game != tugofwar.GameKey || !rooms[0].Open {
		t.Fatal(rooms)
	}
	if rooms := srv.Presence(55); len(rooms) != 1 || rooms[0].Pin != pin {
		t.Fatal(rooms)
	}
	if msg, ok := srv.Spectate(tugofwar.GameKey, pin, "id"); !ok || msg["spectator"] != true {
		t.Fatal("spectate", msg)
	}
	found := false
	for _, g := range srv.Snapshot().Games {
		found = found || (g.Game == tugofwar.GameKey && g.Sessions == 1)
	}
	if !found {
		t.Fatal("stats missing")
	}
}
