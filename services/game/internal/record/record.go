// Package record describes a finished match so Laravel can store who played
// together, at which level and how everyone ranked. Every result of a room
// game carries the same Match; Laravel upserts it by Key, so it does not
// matter which player's result arrives first.
package record

import (
	"sort"
	"time"
)

// Modes of play.
const (
	ModeSolo   = "solo"   // a room with one account and no other seats
	ModeRoom   = "room"   // invite room (PIN / link), possibly with local seats
	ModeRandom = "random" // matchmaking against another player
	ModeBot    = "bot"    // matchmaking fell back to a bot
)

// Player is one seat of a match.
type Player struct {
	UserID  int64  `json:"user_id,omitempty"`
	Name    string `json:"name"`
	Grade   int    `json:"grade"`
	Local   bool   `json:"local,omitempty"`
	Bot     bool   `json:"bot,omitempty"`
	Left    bool   `json:"left,omitempty"`
	Score   int    `json:"score"`
	Correct int    `json:"correct"`
	Wrong   int    `json:"wrong"`
	Rank    int    `json:"rank"`
}

// Word is a crossword answer shown in the match and whether anyone solved it.
type Word struct {
	Key    string `json:"key"`
	Solved bool   `json:"solved"`
}

// Match is the shared summary attached to every result of one game.
type Match struct {
	Key       string   `json:"key"`
	Mode      string   `json:"mode"`
	Pin       string   `json:"pin,omitempty"`
	Level     int      `json:"level"`
	Grade     int      `json:"grade"`
	StartedAt string   `json:"started_at"`
	EndedAt   string   `json:"ended_at"`
	Finished  bool     `json:"finished"`
	Players   []Player `json:"players"`
	Words     []Word   `json:"words,omitempty"`
}

// Mode picks solo or room from the seats of an invite room.
func Mode(players []Player) string {
	if len(players) == 1 {
		return ModeSolo
	}
	return ModeRoom
}

// Rank orders players by the given key (higher is better; leavers last) and
// sets Rank. Ties share a rank. first, when >= 0, is always ranked first
// (e.g. the Ular Tangga winner).
func Rank(players []Player, key func(i int) int, first int) {
	order := make([]int, len(players))
	for i := range order {
		order[i] = i
	}
	better := func(a, b int) bool {
		if (a == first) != (b == first) {
			return a == first
		}
		if players[a].Left != players[b].Left {
			return !players[a].Left
		}
		return key(a) > key(b)
	}
	sort.SliceStable(order, func(x, y int) bool { return better(order[x], order[y]) })
	for pos, i := range order {
		if pos > 0 {
			prev := order[pos-1]
			if !better(prev, i) && !better(i, prev) {
				players[i].Rank = players[prev].Rank
				continue
			}
		}
		players[i].Rank = pos + 1
	}
}

// Stamp formats a time for the match payload.
func Stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
