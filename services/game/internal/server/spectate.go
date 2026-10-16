package server

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/minigames"
)

var spectatePin = regexp.MustCompile(`^[0-9]{6}$`)

// Spectate returns the read-only snapshot of a live room for admin
// monitoring: the arena/host view for host-screen games, the seat-less
// player view for lobby games. Nothing is attached, seated or counted, so a
// spectator can never send input or change scores. ok is false for unknown
// games, finished/closed rooms and classroom rooms.
func (s *Server) Spectate(game, pin, locale string) (map[string]any, bool) {
	now := s.cfg.Now()
	if !spectatePin.MatchString(pin) {
		return nil, false
	}
	host := func(m map[string]any, ok bool) (map[string]any, bool) { return m, ok }
	switch game {
	case "turbo-trivia":
		return host(s.turbo.Spectate(pin, locale, now))
	case "floor-drop":
		return host(s.floor.Spectate(pin, locale, now))
	case "economy-heist":
		return host(s.heist.Spectate(pin, locale, now))
	case "order-rush":
		return host(s.rush.Spectate(pin, locale, now))
	case "block-battle":
		return host(s.block.Spectate(pin, locale, now))
	case "monster-cafe":
		return host(s.cafe.Spectate(pin, locale, now))
	}

	claims := auth.Claims{Subject: 0, Name: "spectator", Spectate: pin}
	var msg map[string]any
	switch game {
	case "snakes-and-ladders":
		msg = s.snakes.State(claims, now)
	case "snake":
		msg = s.snake.State(claims, now)
	case "ping-pong":
		msg = s.pingpong.State(claims, now)
	case "crossword":
		msg = s.crosswords.State(claims, now)
	default:
		hub, ok := s.minis[game]
		if !ok || !isMiniGame(game) {
			return nil, false
		}
		msg = hub.State(claims, now)
	}
	if msg == nil || msg["pin"] != pin {
		return nil, false
	}
	msg["spectator"] = true
	return msg, true
}

func isMiniGame(game string) bool {
	for _, key := range minigames.Keys {
		if key == game {
			return true
		}
	}
	return false
}

// serveSpectate answers signed admin polling: GET /internal/spectate?game=&pin=&locale=.
func (s *Server) serveSpectate(w http.ResponseWriter, r *http.Request) {
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > statsTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, nil)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	locale := r.URL.Query().Get("locale")
	if locale != "en" {
		locale = "id"
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	msg, ok := s.Spectate(r.URL.Query().Get("game"), r.URL.Query().Get("pin"), locale)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"room": nil})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"room": msg})
}
