package auth

import (
	"errors"
	"strings"
	"testing"
	"time"
)

var secret = []byte("test-secret-at-least-32-characters!!")

func validClaims(now time.Time) Claims {
	return Claims{Subject: 7, Name: "Andika", Grade: 5, Color: "teal", Accessory: "cap", Game: "flag-quest", Expires: now.Add(time.Hour).Unix(), Nonce: "n"}
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token, _ := Sign(validClaims(now), secret)
	claims, err := Verify(token, secret, "flag-quest", now)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Subject != 7 || claims.Name != "Andika" || claims.Grade != 5 {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestVerifyRejectsTamperingExpiryAndBadClaims(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token, _ := Sign(validClaims(now), secret)
	parts := strings.Split(token, ".")
	forged, _ := Sign(Claims{Subject: 7, Name: "A", Grade: 5, Game: "flag-quest", Expires: now.Add(time.Hour).Unix()}, []byte("another-secret-at-least-32-chars!!"))

	cases := map[string]struct {
		token string
		now   time.Time
		want  error
	}{
		"malformed":         {"abc", now, ErrMalformed},
		"payload swapped":   {strings.Split(forged, ".")[0] + "." + parts[1], now, ErrSignature},
		"wrong secret":      {forged, now, ErrSignature},
		"expired":           {token, now.Add(2 * time.Hour), ErrExpired},
		"bad signature b64": {parts[0] + ".!!!", now, ErrMalformed},
	}
	for name, tc := range cases {
		if _, err := Verify(tc.token, secret, "flag-quest", tc.now); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v want %v", name, err, tc.want)
		}
	}

	for name, mutate := range map[string]func(*Claims){
		"grade below kindergarten": func(c *Claims) { c.Grade = -1 },
		"grade 13":                 func(c *Claims) { c.Grade = 13 },
		"other game":               func(c *Claims) { c.Game = "sky-quiz" },
		"no subject":               func(c *Claims) { c.Subject = 0 },
		"blank name":               func(c *Claims) { c.Name = "   " },
	} {
		c := validClaims(now)
		mutate(&c)
		tok, _ := Sign(c, secret)
		if _, err := Verify(tok, secret, "flag-quest", now); !errors.Is(err, ErrClaims) {
			t.Errorf("%s: got %v want ErrClaims", name, err)
		}
	}

	if _, err := Verify(token, []byte("short"), "flag-quest", now); !errors.Is(err, ErrSignature) {
		t.Errorf("short secret must be rejected, got %v", err)
	}
}
