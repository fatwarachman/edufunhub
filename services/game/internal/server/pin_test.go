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

func pinRequest(t *testing.T, url, pin string, key []byte) *http.Response {
	t.Helper()
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	req, _ := http.NewRequest(http.MethodGet, url+"/internal/room?pin="+pin, nil)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, nil))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestFindPinLocatesTheGameOfARoom(t *testing.T) {
	srv := New(Config{Secret: secret})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	if res, _ := http.Get(ts.URL + "/internal/room?pin=123456"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("unsigned request: %d", res.StatusCode)
	}
	if res := pinRequest(t, ts.URL, "12ab", secret); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pin: %d", res.StatusCode)
	}

	now := time.Now()
	host := auth.Claims{Subject: 7, Name: "A", Grade: 4, Game: "crossword"}
	srv.crosswords.Join(host, "id")
	if _, err := srv.crosswords.Create(host, 1, now); err != nil {
		t.Fatal(err)
	}
	pin := srv.Presence(7)[0].Pin

	decode := func(res *http.Response) []RoomMatch {
		t.Helper()
		var body struct {
			Rooms []RoomMatch `json:"rooms"`
		}
		if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return body.Rooms
	}
	rooms := decode(pinRequest(t, ts.URL, pin, secret))
	if len(rooms) != 1 || rooms[0].Game != "crossword" || rooms[0].Phase != "lobby" || !rooms[0].Open {
		t.Fatalf("lobby room: %+v", rooms)
	}

	other := "000000"
	if other == pin {
		other = "999999"
	}
	if got := decode(pinRequest(t, ts.URL, other, secret)); len(got) != 0 {
		t.Fatalf("unknown pin: %+v", got)
	}

	mini := auth.Claims{Subject: 9, Name: "B", Grade: 3, Game: "mini-lab"}
	srv.minis["mini-lab"].Join(mini, "id")
	srv.minis["mini-lab"].Create(mini, now)
	miniPin := srv.Presence(9)[0].Pin
	if got := srv.FindPin(miniPin); len(got) < 1 || got[len(got)-1].Game != "mini-lab" {
		t.Fatalf("mini-lab room: %+v", got)
	}
}
