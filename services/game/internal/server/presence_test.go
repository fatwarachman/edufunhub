package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"edufunhub/game/internal/auth"
)

func presenceRequest(t *testing.T, url string, user string, key []byte) *http.Response {
	t.Helper()
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	req, _ := http.NewRequest(http.MethodGet, url+"/internal/presence?user="+user, nil)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, nil))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestPresenceListsRunningRooms(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	if res, _ := http.Get(ts.URL + "/internal/presence?user=7"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("unsigned request: %d", res.StatusCode)
	}
	if res := presenceRequest(t, ts.URL, "x", secret); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad user: %d", res.StatusCode)
	}

	now := time.Now()
	host := auth.Claims{Subject: 7, Name: "A", Grade: 4, Game: "snakes-and-ladders"}
	srv.snakes.Join(host, "id")
	pin, _ := srv.snakes.Create(host, now)
	_, _ = srv.snakes.Start(7, now)

	res := presenceRequest(t, ts.URL, "7", secret)
	var body struct {
		Rooms []Activity `json:"rooms"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Rooms) != 1 || body.Rooms[0].Game != "snakes-and-ladders" || body.Rooms[0].Pin != pin || body.Rooms[0].Phase != "playing" || !body.Rooms[0].Host {
		t.Fatalf("running room: %+v", body.Rooms)
	}
	if got := srv.Presence(8); len(got) != 0 {
		t.Fatalf("stranger has no rooms: %+v", got)
	}
}
