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
	"regexp"
	"strings"
	"time"
)

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("invalid token signature")
	ErrExpired   = errors.New("token expired")
	ErrClaims    = errors.New("invalid token claims")
)

// MaxCharacterBytes caps the avatar look carried in a token.
const MaxCharacterBytes = 2048

// Claims describe the authenticated player and the game they may start.
type Claims struct {
	Subject int64  `json:"sub"`
	Name    string `json:"name"`
	Grade   int    `json:"grade"`
	// Level is the player's chosen question level (1 easy, 2 medium,
	// 3 expert; 0 = easy). Harder levels pay more per correct answer.
	Level     int    `json:"level,omitempty"`
	Color     string `json:"color"`
	Accessory string `json:"accessory"`
	// Character is the portal avatar look (colour, gender, skin, hair, shop
	// items). Go treats it as opaque and only echoes it to room players.
	Character json.RawMessage `json:"character,omitempty"`
	Game      string          `json:"game"`
	// Classroom is the teacher classroom the player is in for this game
	// (0 = none); its picked questions replace the normal bank.
	Classroom int64 `json:"classroom,omitempty"`
	// Booths are the game keys the teacher picked for the classroom world,
	// in order. Verify keeps only valid keys, deduplicated, at most MaxBooths.
	Booths []string `json:"booths,omitempty"`
	// Seats is the classroom capacity (max_members) that sizes the classroom
	// world layout; 0 = not set. Verify clamps it to 0..MaxSeats.
	Seats int `json:"seats,omitempty"`
	// TeacherID is the classroom owner (0 = unknown). A token whose Subject
	// equals TeacherID is the teacher's own token. Verify maps negatives to 0.
	TeacherID int64 `json:"teacher_id,omitempty"`
	Observer  bool  `json:"observer,omitempty"`
	// Spectate is the PIN of the live room an admin watches read-only
	// ("" = normal player token). A spectator connection is never seated,
	// sends no gameplay input and never earns points. Verify accepts only
	// 6 digit PINs.
	Spectate string `json:"spectate,omitempty"`
	Expires  int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

// MaxBooths caps the classroom world booths carried in a token.
const MaxBooths = 10

// MaxSeats caps the classroom seats claim (Classroom::MAX_MEMBERS).
const MaxSeats = 200

var boothKey = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

var spectatePin = regexp.MustCompile(`^[0-9]{6}$`)

// cleanBooths keeps valid, unique game keys in order, at most MaxBooths.
func cleanBooths(in []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, key := range in {
		if len(out) == MaxBooths {
			break
		}
		if !boothKey.MatchString(key) || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	return out
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
	if claims.Subject <= 0 || claims.Game != game || claims.Grade < 0 || claims.Grade > 12 || name == "" || len([]rune(name)) > 60 {
		return claims, ErrClaims
	}
	if claims.Spectate != "" && !spectatePin.MatchString(claims.Spectate) {
		return claims, ErrClaims
	}
	claims.Name = name
	if claims.Level < 0 || claims.Level > 3 {
		claims.Level = 0
	}
	if claims.Classroom < 0 {
		claims.Classroom = 0
	}
	if len(claims.Character) > MaxCharacterBytes || (len(claims.Character) > 0 && claims.Character[0] != '{') {
		claims.Character = nil
	}
	if claims.TeacherID < 0 {
		claims.TeacherID = 0
	}
	claims.Booths = cleanBooths(claims.Booths)
	if claims.Seats < 0 {
		claims.Seats = 0
	} else if claims.Seats > MaxSeats {
		claims.Seats = MaxSeats
	}
	return claims, nil
}

// FirstClassroom returns the first positive classroom claim in order (the
// host or creating player first), or 0 when nobody is in a classroom.
func FirstClassroom(claims ...Claims) int64 {
	for _, c := range claims {
		if c.Classroom > 0 {
			return c.Classroom
		}
	}
	return 0
}
