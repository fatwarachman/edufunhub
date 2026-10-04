package server

import (
	"strings"
	"unicode/utf8"
)

// localName cleans the display name of a pass-and-play seat.
func localName(name string) string {
	name = strings.Join(strings.Fields(name), " ")
	if utf8.RuneCountInString(name) > 20 {
		name = string([]rune(name)[:20])
	}
	if name == "" {
		return "Pemain"
	}
	return name
}
