package server

import (
	"crypto/hmac"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"edufunhub/game/internal/duel"
	"edufunhub/game/internal/lobby"
)

// classroomEnded is the close reason / error code sent to players when the
// teacher ends a classroom: host-screen games get a state_sync with phase
// NONE and closed "classroom_ended", lobby games an error frame with code
// "classroom_ended" followed by their (now room-less) state.
const classroomEnded = "classroom_ended"

// serveClassroomClose closes every game room of a classroom. Laravel calls it
// when a teacher ends the classroom: POST {"classroom": id}, signed like the
// kick endpoint (X-Game-Timestamp, X-Game-Signature). 204 on success.
func (s *Server) serveClassroomClose(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	ts := r.Header.Get("X-Game-Timestamp")
	unix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || s.cfg.Now().Sub(time.Unix(unix, 0)).Abs() > statsTolerance ||
		!hmac.Equal([]byte(Sign(s.cfg.Secret, ts, body)), []byte(r.Header.Get("X-Game-Signature"))) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var in struct {
		Classroom int64 `json:"classroom"`
	}
	if json.Unmarshal(body, &in) != nil || in.Classroom <= 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.closeClassroom(in.Classroom)
	w.WriteHeader(http.StatusNoContent)
}

// closeClassroom closes the rooms of classroom id in every game hub and tells
// the affected players. Normal PIN rooms and other classrooms stay open.
func (s *Server) closeClassroom(id int64) {
	if id <= 0 {
		return
	}
	now := s.cfg.Now()

	// Host-screen games: the room itself settles and pushes the close.
	s.floor.CloseClassroom(id)
	s.turbo.CloseClassroom(id)
	s.block.CloseClassroom(id)
	s.cafe.CloseClassroom(id)
	s.heist.CloseClassroom(id)
	s.rush.CloseClassroom(id)

	ended := lobby.Message{"t": "error", "code": classroomEnded}

	if ids := s.snakes.CloseClassroom(id, now); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.snakesSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushSnakes(ids, now)
		s.reportSnakes()
	}
	if ids := s.crosswords.CloseClassroom(id, now); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.crosswordSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushCrossword(ids, now)
		s.reportCrosswords()
	}
	if ids := s.pingpong.CloseClassroom(id, now); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.pingpongSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushPingPong(ids, now)
		s.reportPingPong()
	}
	if ids := s.tug.CloseClassroom(id, now); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.tugSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushTugOfWar(ids, now)
		s.reportTugOfWar()
	}
	if ids := s.snake.CloseClassroom(id, now); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.snakeSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushEduSnake(ids, now)
		s.reportEduSnake()
	}
	reportMinis := false
	for key, hub := range s.minis {
		ids := hub.CloseClassroom(id, now)
		if len(ids) == 0 {
			continue
		}
		reportMinis = true
		s.mu.Lock()
		subs := pickSubs(s.miniSubs[key], ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(ended)
		}
		s.pushMini(key, ids, now)
	}
	if reportMinis {
		s.reportMinis()
	}
	if ids := s.duelRooms.CloseClassroom(id); len(ids) > 0 {
		s.mu.Lock()
		subs := pickSubs(s.duelSubs, ids)
		s.mu.Unlock()
		for _, sub := range subs {
			sub.send(duel.Message(ended))
		}
		s.pushDuel(ids, now)
	}
}

// pickSubs returns the connected subscribers of ids (each once). Call with
// s.mu held.
func pickSubs[T any](subs map[int64]T, ids []int64) []T {
	out := make([]T, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if sub, ok := subs[id]; ok && !seen[id] {
			seen[id] = true
			out = append(out, sub)
		}
	}
	return out
}
