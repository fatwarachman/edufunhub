// Package auth verifies player tokens issued by the Laravel portal.
//
// Token format: base64url(json payload) + "." + base64url(HMAC-SHA256(payloadPart, secret)).
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("invalid token signature")
	ErrExpired   = errors.New("token expired")
	ErrClaims    = errors.New("invalid token claims")
)

// Claims describe the authenticated player and the game they may start.
type Claims struct {
	Subject   int64  `json:"sub"`
	Name      string `json:"name"`
	Grade     int    `json:"grade"`
	Color     string `json:"color"`
	Accessory string `json:"accessory"`
	Game      string `json:"game"`
	Expires   int64  `json:"exp"`
	Nonce     string `json:"nonce"`
}

// Sign creates a token. Used by tests and tooling; Laravel issues production tokens.
func Sign(claims Claims, secret []byte) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	part := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(part))
	return part + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

// Verify validates signature, expiry, game key and claim ranges.
func Verify(token string, secret []byte, game string, now time.Time) (Claims, error) {
	var claims Claims
	if len(secret) < 16 {
		return claims, ErrSignature
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return claims, ErrMalformed
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, ErrMalformed
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0]))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return claims, ErrSignature
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return claims, ErrMalformed
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return claims, ErrMalformed
	}
	if now.Unix() >= claims.Expires {
		return claims, ErrExpired
	}
	name := strings.TrimSpace(claims.Name)
	if claims.Subject <= 0 || claims.Game != game || claims.Grade < 1 || claims.Grade > 12 || name == "" || len([]rune(name)) > 60 {
		return claims, ErrClaims
	}
	claims.Name = name
	return claims, nil
}
