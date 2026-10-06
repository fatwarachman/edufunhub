package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"edufunhub/chat/internal/auth"
)

var secret = []byte("0123456789abcdef0123456789abcdef")

func signedPublish(t *testing.T, url string, body string) *http.Response {
	t.Helper()
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts + "." + body))
	req, _ := http.NewRequest(http.MethodPost, url+"/internal/publish", bytes.NewBufferString(body))
	req.Header.Set("X-Chat-Timestamp", ts)
	req.Header.Set("X-Chat-Signature", hex.EncodeToString(mac.Sum(nil)))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestSocketReceivesPublishedEvent(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	token := auth.Sign(auth.Claims{Subject: 5, Audience: auth.Audience, Expires: time.Now().Add(time.Hour).Unix()}, secret)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if _, hello, err := conn.Read(ctx); err != nil || !strings.Contains(string(hello), `"hello"`) {
		t.Fatalf("hello %s %v", hello, err)
	}

	res := signedPublish(t, ts.URL, `{"users":[5,9],"event":{"t":"message","message":{"id":1,"body":"halo"}}}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("publish status %d", res.StatusCode)
	}
	_, got, err := conn.Read(ctx)
	if err != nil || !strings.Contains(string(got), `"halo"`) {
		t.Fatalf("event %s %v", got, err)
	}
}

func TestRejectsBadTokensAndUnsignedPublish(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	res, _ := http.Get(ts.URL + "/ws?token=nope")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("bad token status %d", res.StatusCode)
	}
	res, _ = http.Post(ts.URL+"/internal/publish", "application/json", bytes.NewBufferString(`{"users":[1],"event":{}}`))
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unsigned publish status %d", res.StatusCode)
	}
	if res := signedPublish(t, ts.URL, `{"users":[],"event":{}}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty users status %d", res.StatusCode)
	}
	if res := signedPublish(t, ts.URL, `{"users":[1],"event":"x"}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("non-object event status %d", res.StatusCode)
	}
}

func TestSocketWatchesPresence(t *testing.T) {
	srv := New(Config{Secret: secret, AllowedOrigins: []string{"*"}, OfflineGrace: time.Millisecond})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	dial := func(user int64) *websocket.Conn {
		token := auth.Sign(auth.Claims{Subject: user, Audience: auth.Audience, Expires: time.Now().Add(time.Hour).Unix()}, secret)
		conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws?token="+token, nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := conn.Read(ctx); err != nil {
			t.Fatal(err)
		}
		return conn
	}
	a := dial(5)
	defer a.CloseNow()
	b := dial(9)
	if err := a.Write(ctx, websocket.MessageText, []byte(`{"t":"watch","users":[9,11]}`)); err != nil {
		t.Fatal(err)
	}
	if _, got, err := a.Read(ctx); err != nil || string(got) != `{"online":[9],"t":"presence_state"}` {
		t.Fatalf("state %s %v", got, err)
	}
	b.Close(websocket.StatusNormalClosure, "")
	if _, got, err := a.Read(ctx); err != nil || string(got) != `{"online":false,"t":"presence","user":9}` {
		t.Fatalf("offline %s %v", got, err)
	}
}
