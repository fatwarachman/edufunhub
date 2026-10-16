package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/turbotrivia"
)

func spectateRequest(t *testing.T, base, query string) (*http.Response, map[string]any) {
	t.Helper()
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	req, _ := http.NewRequest(http.MethodGet, base+"/internal/spectate?"+query, nil)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(secret, stamp, nil))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var body map[string]any
	_ = json.NewDecoder(res.Body).Decode(&body)
	return res, body
}

func TestSpectateRequiresSignature(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()
	res, err := http.Get(ts.URL + "/internal/spectate?game=snakes-and-ladders&pin=123456")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("unsigned spectate: %d", res.StatusCode)
	}
}

func TestSpectateLobbyRoomIsReadOnly(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	now := time.Now()
	host := auth.Claims{Subject: 7, Name: "A", Grade: 4, Game: "snakes-and-ladders"}
	srv.snakes.Join(host, "id")
	pin, _ := srv.snakes.Create(host, now)
	rooms, members := srv.snakes.Counts()

	res, body := spectateRequest(t, ts.URL, "game=snakes-and-ladders&pin="+pin)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("spectate status %d", res.StatusCode)
	}
	room := body["room"].(map[string]any)
	if room["pin"] != pin || room["spectator"] != true || room["you"] != float64(-1) {
		t.Fatalf("spectator view: %v", room)
	}
	if players := room["players"].([]any); len(players) != 1 {
		t.Fatalf("players %v", players)
	}
	if r2, m2 := srv.snakes.Counts(); r2 != rooms || m2 != members {
		t.Fatalf("watching changed the room: rooms %d->%d members %d->%d", rooms, r2, members, m2)
	}

	if res, _ := spectateRequest(t, ts.URL, "game=snakes-and-ladders&pin=000000"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown pin: %d", res.StatusCode)
	}
	if res, _ := spectateRequest(t, ts.URL, "game=unknown&pin="+pin); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown game: %d", res.StatusCode)
	}
	if res, _ := spectateRequest(t, ts.URL, "game=snakes-and-ladders&pin=abc"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("bad pin: %d", res.StatusCode)
	}
}

func TestSpectateHostScreenGameShowsArenaView(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, TurboTrivia: fastTurbo()})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go srv.RunTurboTrivia(ctx, time.Second)

	host := dialTurbo(t, ts.URL, 900, turbotrivia.HostKey)
	host.until("state_sync", func(m map[string]any) bool { return m["role"] == "host" })
	host.send(map[string]any{"t": "create_room"})
	pin := host.until("state_sync", func(m map[string]any) bool { return m["phase"] == turbotrivia.PhaseLobby })["pin"].(string)
	player := dialTurbo(t, ts.URL, 1, turbotrivia.GameKey)
	player.until("state_sync", nil)
	player.send(map[string]any{"t": "join_room", "room_code": pin})
	player.until("state_sync", func(m map[string]any) bool { return m["pin"] == pin })

	res, body := spectateRequest(t, ts.URL, "game=turbo-trivia&pin="+pin+"&locale=en")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("spectate status %d", res.StatusCode)
	}
	room := body["room"].(map[string]any)
	if room["role"] != "host" || room["spectator"] != true || room["pin"] != pin {
		t.Fatalf("arena view: %v", room)
	}
	if _, private := room["you"]; private {
		t.Fatal("spectator must not get a player's private view")
	}
	if players := room["players"].([]any); len(players) != 1 {
		t.Fatalf("roster %v", players)
	}
	if summaries := srv.turbo.RoomsSummary(); len(summaries) != 1 || summaries[0].Players != 1 {
		t.Fatalf("watching changed the room: %+v", summaries)
	}
}
