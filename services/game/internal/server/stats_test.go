package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func statsRequest(t *testing.T, url string, ts time.Time, key []byte) *http.Response {
	t.Helper()
	stamp := strconv.FormatInt(ts.Unix(), 10)
	req, _ := http.NewRequest(http.MethodGet, url+"/internal/stats", nil)
	req.Header.Set("X-Game-Timestamp", stamp)
	req.Header.Set("X-Game-Signature", Sign(key, stamp, nil))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestStatsRequiresSignatureAndReportsGames(t *testing.T) {
	ts := httptest.NewServer(New(Config{Secret: secret}).Handler())
	defer ts.Close()

	res, _ := http.Get(ts.URL + "/internal/stats")
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("unsigned request: %d", res.StatusCode)
	}
	if res := statsRequest(t, ts.URL, time.Now(), []byte("wrong-secret-with-at-least-32-chars")); res.StatusCode != http.StatusForbidden {
		t.Fatalf("bad signature: %d", res.StatusCode)
	}
	if res := statsRequest(t, ts.URL, time.Now().Add(-10*time.Minute), secret); res.StatusCode != http.StatusForbidden {
		t.Fatalf("stale timestamp: %d", res.StatusCode)
	}

	res = statsRequest(t, ts.URL, time.Now(), secret)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("signed request: %d", res.StatusCode)
	}
	var stats Stats
	if err := json.NewDecoder(res.Body).Decode(&stats); err != nil {
		t.Fatal(err)
	}
	if stats.Service != "edufunhub-game" || stats.Goroutines == 0 || stats.HeapAllocBytes == 0 || len(stats.Games) != 11 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
}
