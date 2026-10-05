package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"testing"
	"time"
)

var secret = []byte("0123456789abcdef0123456789abcdef")

func TestVerifyToken(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	good := Sign(Claims{Subject: 7, Audience: Audience, Expires: now.Add(time.Hour).Unix()}, secret)
	if c, err := Verify(good, secret, now); err != nil || c.Subject != 7 {
		t.Fatalf("valid token: %v %+v", err, c)
	}
	cases := map[string]struct {
		token string
		want  error
	}{
		"malformed":     {"abc", ErrMalformed},
		"wrong secret":  {Sign(Claims{Subject: 7, Audience: Audience, Expires: now.Add(time.Hour).Unix()}, []byte("another-secret-of-32-characters!!")), ErrSignature},
		"expired":       {Sign(Claims{Subject: 7, Audience: Audience, Expires: now.Unix()}, secret), ErrExpired},
		"game audience": {Sign(Claims{Subject: 7, Audience: "", Expires: now.Add(time.Hour).Unix()}, secret), ErrClaims},
		"no subject":    {Sign(Claims{Audience: Audience, Expires: now.Add(time.Hour).Unix()}, secret), ErrClaims},
	}
	for name, tc := range cases {
		if _, err := Verify(tc.token, secret, now); err != tc.want {
			t.Errorf("%s: got %v want %v", name, err, tc.want)
		}
	}
}

func TestVerifyRequest(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	body := []byte(`{"users":[1],"event":{"t":"message"}}`)
	ts := strconv.FormatInt(now.Unix(), 10)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts + "." + string(body)))
	sig := hex.EncodeToString(mac.Sum(nil))
	if !VerifyRequest(secret, ts, sig, body, now, 5*time.Minute) {
		t.Fatal("valid request rejected")
	}
	if VerifyRequest(secret, ts, sig, []byte(`{"users":[2]}`), now, 5*time.Minute) {
		t.Fatal("tampered body accepted")
	}
	if VerifyRequest(secret, ts, sig, body, now.Add(10*time.Minute), 5*time.Minute) {
		t.Fatal("stale request accepted")
	}
	if VerifyRequest(secret, "x", sig, body, now, 5*time.Minute) {
		t.Fatal("bad timestamp accepted")
	}
}
