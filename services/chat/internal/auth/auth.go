// Package auth verifies chat socket tokens issued by Laravel and signed
// publish requests sent by Laravel.
//
// Token: base64url(json{sub,aud,exp,nonce}) + "." + base64url(HMAC-SHA256(part, secret)).
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("invalid signature")
	ErrExpired   = errors.New("token expired")
	ErrClaims    = errors.New("invalid claims")
)

// Audience every chat token must carry, so game tokens cannot open chat.
const Audience = "chat"

// Claims identify the player behind a socket.
type Claims struct {
	Subject  int64  `json:"sub"`
	Audience string `json:"aud"`
	Expires  int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

// Sign creates a token (tests and tooling; Laravel issues real ones).
func Sign(c Claims, secret []byte) string {
	payload, _ := json.Marshal(c)
	part := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(part))
	return part + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Verify checks signature, expiry and audience.
func Verify(token string, secret []byte, now time.Time) (Claims, error) {
	var c Claims
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return c, ErrMalformed
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return c, ErrMalformed
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0]))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return c, ErrSignature
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(payload, &c) != nil {
		return c, ErrMalformed
	}
	if now.Unix() >= c.Expires {
		return c, ErrExpired
	}
	if c.Subject <= 0 || c.Audience != Audience {
		return c, ErrClaims
	}
	return c, nil
}

// VerifyRequest checks an HMAC-signed request body from Laravel:
// hex(HMAC-SHA256(timestamp + "." + body)) within tolerance.
func VerifyRequest(secret []byte, timestamp, signature string, body []byte, now time.Time, tolerance time.Duration) bool {
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || signature == "" {
		return false
	}
	if d := now.Sub(time.Unix(ts, 0)); d > tolerance || d < -tolerance {
		return false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(signature))
}
