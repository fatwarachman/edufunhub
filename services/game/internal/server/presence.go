package server

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"edufunhub/game/internal/lobby"
	"edufunhub/game/internal/minigames"
)

// Activity is one running room or match of a player, so the portal can offer
// "continue playing" after the browser was closed by accident.
type Activity struct {
	Game  string `json:"game"`
	Pin   string `json:"pin,omitempty"`
	Phase string `json:"phase"`
	Host  bool   `json:"host"`
}

// Presence lists every room or match uid is seated in right now.
func (s *Server) Presence(uid int64) []Activity {
	out := []Activity{}
	lobbyRoom := func(game string, p lobby.Presence, ok bool) {
		if ok && p.Phase != lobby.PhaseDone {
			out = append(out, Activity{Game: game, Pin: p.Pin, Phase: p.Phase, Host: p.Host})
		}
	}
	p, ok := s.snakes.Presence(uid)
	lobbyRoom("snakes-and-ladders", p, ok)
	p, ok = s.crosswords.Presence(uid)
	lobbyRoom("crossword", p, ok)
	for _, key := range minigames.Keys {
		p, ok = s.minis[key].Presence(uid)
		lobbyRoom(key, p, ok)
	}
	if pin, ok := s.duels.Presence(uid); ok {
		out = append(out, Activity{Game: "quiz-duel", Pin: pin, Phase: lobby.PhasePlaying})
	}
	type roomHub interface {
		Presence(uid int64) (pin, phase string, host, ok bool)
	}
	for game, hub := range map[string]roomHub{
		"floor-drop": s.floor, "economy-heist": s.heist, "order-rush": s.rush, "turbo-trivia": s.turbo, "block-battle": s.block,
	} {
		if pin, phase, host, ok := hub.Presence(uid); ok {
			out = append(out, Activity{Game: game, Pin: pin, Phase: phase, Host: host})
		}
	}
	return out
}

// servePresence answers signed requests only:
// GET /internal/presence?user=ID, X-Game-Signature = hex(HMAC(timestamp + ".")).
func (s *Server) servePresence(w http.ResponseWriter, r *http.Request) {
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > statsTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, nil)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	uid, err := strconv.ParseInt(r.URL.Query().Get("user"), 10, 64)
	if err != nil || uid <= 0 {
		http.Error(w, "bad user", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"rooms": s.Presence(uid)})
}
