package classroom

import (
	"strings"
	"time"
	"unicode"
)

// Chat limits.
const (
	ChatMaxRunes = 120
	ChatGap      = 1500 * time.Millisecond
	ChatWindow   = 10 * time.Second
	ChatBurst    = 3
)

// badWords are masked (whole word, case-insensitive) in chat.
var badWords = map[string]bool{
	"anjing": true, "bangsat": true, "goblok": true, "tolol": true, "kontol": true,
	"memek": true, "bego": true, "babi": true, "fuck": true, "shit": true,
	"bitch": true, "asshole": true,
}

// invisible reports runes that must never reach other players: control and
// format characters (zero-width, bidi overrides and isolates).
func invisible(r rune) bool {
	switch {
	case unicode.IsControl(r), unicode.Is(unicode.C, r):
		return true
	case r >= 0x200b && r <= 0x200f, r >= 0x202a && r <= 0x202e, r >= 0x2066 && r <= 0x2069, r == 0xfeff:
		return true
	}
	return false
}

// SanitizeChat trims, strips invisible characters, collapses whitespace,
// truncates to ChatMaxRunes and masks bad words. "" means reject.
func SanitizeChat(text string) string {
	var b strings.Builder
	pending := false
	runes := 0
	for _, r := range text {
		if unicode.IsSpace(r) {
			pending = runes > 0
			continue
		}
		if invisible(r) {
			continue
		}
		if pending {
			if runes+1 >= ChatMaxRunes {
				break
			}
			b.WriteRune(' ')
			runes++
			pending = false
		}
		if runes >= ChatMaxRunes {
			break
		}
		b.WriteRune(r)
		runes++
	}
	return maskBadWords(strings.TrimSpace(b.String()))
}

func maskBadWords(s string) string {
	rs := []rune(s)
	for i := 0; i < len(rs); {
		if !wordRune(rs[i]) {
			i++
			continue
		}
		j := i
		for j < len(rs) && wordRune(rs[j]) {
			j++
		}
		if badWords[strings.ToLower(string(rs[i:j]))] {
			for k := i; k < j; k++ {
				rs[k] = '*'
			}
		}
		i = j
	}
	return string(rs)
}

func wordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// chatLimiter allows one message per ChatGap and ChatBurst per ChatWindow.
type chatLimiter struct{ sent []time.Time }

func (l *chatLimiter) allow(now time.Time) bool {
	kept := l.sent[:0]
	for _, at := range l.sent {
		if now.Sub(at) < ChatWindow {
			kept = append(kept, at)
		}
	}
	l.sent = kept
	if len(l.sent) >= ChatBurst || (len(l.sent) > 0 && now.Sub(l.sent[len(l.sent)-1]) < ChatGap) {
		return false
	}
	l.sent = append(l.sent, now)
	return true
}
