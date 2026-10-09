package server

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/minigames"
)

// RoomMatch is one open room that owns a PIN. Every game keeps its own PIN
// space, so one PIN can (rarely) exist in two games at once.
type RoomMatch struct {
	Game  string `json:"game"`
	Phase string `json:"phase"`
	// Open is true while players may still join (room in its lobby).
	Open bool `json:"open"`
}

var pinPattern = regexp.MustCompile(`^\d{6}$`)

// FindPin lists every unfinished room with the given PIN, so a player can
// type just the code and land in the right game.
func (s *Server) FindPin(pin string) []RoomMatch {
	out := []RoomMatch{}
	if !pinPattern.MatchString(pin) {
		return out
	}
	lobbyRoom := func(game, phase string, ok bool) {
		if ok && phase != lobby.PhaseDone {
			out = append(out, RoomMatch{Game: game, Phase: phase, Open: phase == lobby.PhaseLobby})
		}
	}
	phase, ok := s.snakes.RoomPhase(pin)
	lobbyRoom("snakes-and-ladders", phase, ok)
	phase, ok = s.snake.RoomPhase(pin)
	lobbyRoom("snake", phase, ok)
	phase, ok = s.pingpong.RoomPhase(pin)
	lobbyRoom("ping-pong", phase, ok)
	phase, ok = s.crosswords.RoomPhase(pin)
	lobbyRoom("crossword", phase, ok)
	for _, key := range minigames.Keys {
		phase, ok = s.minis[key].RoomPhase(pin)
		lobbyRoom(key, phase, ok)
	}
	phase, ok = s.duelRooms.PhaseOf(pin)
	lobbyRoom("quiz-duel", phase, ok)

	type roomHub interface {
		RoomPhase(pin string) (string, bool)
	}
	for _, room := range []struct {
		game string
		hub  roomHub
	}{{"floor-drop", s.floor}, {"economy-heist", s.heist}, {"order-rush", s.rush}, {"turbo-trivia", s.turbo}, {"block-battle", s.block}, {"monster-cafe", s.cafe}} {
		if phase, ok := room.hub.RoomPhase(pin); ok && phase != "GAME_OVER" {
			out = append(out, RoomMatch{Game: room.game, Phase: phase, Open: phase == "LOBBY"})
		}
	}
	return out
}

// serveFindPin answers signed requests only:
// GET /internal/room?pin=123456, X-Game-Signature = hex(HMAC(timestamp + ".")).
func (s *Server) serveFindPin(w http.ResponseWriter, r *http.Request) {
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > statsTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, nil)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	pin := r.URL.Query().Get("pin")
	if !pinPattern.MatchString(pin) {
		http.Error(w, "bad pin", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"rooms": s.FindPin(pin)})
}
