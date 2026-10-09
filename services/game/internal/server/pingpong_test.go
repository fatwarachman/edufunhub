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

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/pingpong"
	"edufunhub/game/internal/questions"
	"github.com/coder/websocket"
)

func TestPingPongWebSocketAndSignedResult(t *testing.T) {
	bank, err := questions.Parse([]byte(`{"version":"t","questions":[
		{"key":"pp-ws-1","type":"choice","band":1,"subject":"science","prompt":{"id":"Pilih BENAR","en":"Pick RIGHT"},"options":[{"id":"RIGHT"},{"id":"WRONG-A"},{"id":"WRONG-B"},{"id":"WRONG-C"}],"answer":0,"games":["ping-pong"]},
		{"key":"pp-ws-2","type":"choice","band":1,"subject":"science","prompt":{"id":"Pilih BENAR lagi","en":"Pick RIGHT again"},"options":[{"id":"RIGHT"},{"id":"WRONG-D"},{"id":"WRONG-E"}],"answer":0,"games":["ping-pong"]}
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
	for _, tok := range []string{"garbage", floorToken(t, 1, "quiz-duel")} {
		res, err := http.Get(ts.URL + "/ws/ping-pong?token=" + tok)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 401 {
			t.Fatalf("auth: %d", res.StatusCode)
		}
	}
	dial := func(id int64) *floorConn {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		t.Cleanup(cancel)
		conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws/ping-pong?locale=en&token="+floorToken(t, id, pingpong.GameKey), nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close(websocket.StatusNormalClosure, "") })
		c := &floorConn{t: t, conn: conn, ctx: ctx}
		c.until("pingpong_state", nil)
		return c
	}
	a, b := dial(81), dial(82)
	a.send(map[string]any{"t": "create"})
	pin := a.until("pingpong_state", func(m map[string]any) bool { return m["pin"] != "" })["pin"].(string)
	b.send(map[string]any{"t": "join", "pin": pin})
	b.until("pingpong_state", func(m map[string]any) bool { return m["you"] == float64(1) })
	b.send(map[string]any{"t": "start"})
	if e := b.until("error", nil); e["code"] != "not_host" {
		t.Fatal(e)
	}
	b.send(map[string]any{"t": "subject", "subject": "science"})
	if e := b.until("error", nil); e["code"] != "not_host" {
		t.Fatal(e)
	}
	a.send(map[string]any{"t": "subject", "subject": "science"})
	b.until("pingpong_state", func(m map[string]any) bool { return m["subject"] == "science" })
	a.send(map[string]any{"t": "start"})
	state := a.until("pingpong_state", func(m map[string]any) bool { return m["phase"] == "playing" })
	q := state["question"].(map[string]any)
	if _, ok := q["answer"]; ok || state["subject"] != "science" || state["subject_fallback"] != false {
		t.Fatal("answer leaked or subject missing", state)
	}
	b.send(map[string]any{"t": "answer", "round": state["round"], "option": 0})
	if e := b.until("error", nil); e["code"] != "not_your_turn" {
		t.Fatal(e)
	}
	a.send(map[string]any{"t": "answer", "round": state["round"], "option": 9})
	if e := a.until("error", nil); e["code"] != "invalid_option" {
		t.Fatal(e)
	}
	for i := 0; i < 5; i++ {
		wrong := -1
		for j, o := range state["question"].(map[string]any)["options"].([]any) {
			if strings.HasPrefix(o.(string), "WRONG") {
				wrong = j
			}
		}
		round := state["round"].(float64)
		a.send(map[string]any{"t": "answer", "round": round, "option": wrong})
		state = a.until("pingpong_state", func(m map[string]any) bool { return m["round"].(float64) > round || m["phase"] == "done" })
		if f := state["feedback"].(map[string]any); f["correct"] != false || f["goal"] != true || f["answer"] != "RIGHT" {
			t.Fatal(f)
		}
	}
	if state["phase"] != "done" || state["winner"] != float64(1) {
		t.Fatal(state)
	}
	for i := 0; i < 2; i++ {
		select {
		case res := <-results:
			if res["game_key"] != pingpong.GameKey || res["mission"] != "room" || !strings.HasPrefix(res["event_id"].(string), "pp-") {
				t.Fatal(res)
			}
			if res["match"].(map[string]any)["finished"] != true {
				t.Fatal(res)
			}
			answers, _ := res["answers"].([]any)
			if res["user_id"] == float64(81) {
				if len(answers) != 5 {
					t.Fatal(res)
				}
				for _, x := range answers {
					a := x.(map[string]any)
					if a["correct"] != false || a["choice"] == float64(0) || a["choice"] == nil || !strings.HasPrefix(a["key"].(string), "pp-ws-") {
						t.Fatal(a)
					}
				}
			} else if res["answers"] == nil || len(answers) != 0 {
				t.Fatal(res)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("missing signed result")
		}
	}
}

func TestPingPongDiscovery(t *testing.T) {
	srv := New(Config{Secret: secret})
	now := time.Now()
	c := auth.Claims{Subject: 55, Name: "Rani", Grade: 10, Game: pingpong.GameKey}
	pin, _ := srv.pingpong.Create(c, now)
	if rooms := srv.FindPin(pin); len(rooms) != 1 || rooms[0].Game != pingpong.GameKey || !rooms[0].Open {
		t.Fatal(rooms)
	}
	if rooms := srv.Presence(55); len(rooms) != 1 || rooms[0].Pin != pin {
		t.Fatal(rooms)
	}
	found := false
	for _, g := range srv.Snapshot().Games {
		if g.Game == pingpong.GameKey {
			found = true
			if g.Sessions != 1 {
				t.Fatal(g)
			}
		}
	}
	if !found {
		t.Fatal("stats missing")
	}
	srv.pingpong.Start(55, now)
	srv.pingpong.Stop(55, now.Add(time.Second))
	if rooms := srv.FindPin(pin); len(rooms) != 0 {
		t.Fatal(rooms)
	}
	if rooms := srv.Presence(55); len(rooms) != 0 {
		t.Fatal(rooms)
	}
}
