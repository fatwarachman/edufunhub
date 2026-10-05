package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/heist"
)

// heistInbound is an Economy Heist client message (intents only). Client
// timestamps, amounts and outcomes are never read.
type heistInbound struct {
	T        string          `json:"t"`
	Pin      string          `json:"pin"`
	RoomCode string          `json:"room_code"`
	PlayerID json.RawMessage `json:"player_id"`
	Avatar   json.RawMessage `json:"avatar"`
	Question string          `json:"question_id"`
	Answer   *int            `json:"answer_index"`
	Chest    *int            `json:"chest_index"`
	Target   json.RawMessage `json:"target_player_id"`
	Win      string          `json:"win"`
	Value    int64           `json:"value"`
	Subject  string          `json:"subject"`
	Locale   string          `json:"locale"`
}

// RunHeist reports Economy Heist results. Rooms drive their own timers.
func (s *Server) RunHeist(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.heist.CloseAll()
			s.reportHeist()
			return
		case <-s.heist.Ready():
			s.reportHeist()
		case <-t.C:
			s.reportHeist()
		}
	}
}

func (s *Server) reportHeist() {
	for _, res := range s.heist.TakeResults() {
		go s.report(res)
	}
}

// serveHeist is the Economy Heist WebSocket endpoint. A token for game
// economy-heist-host opens the teacher screen; economy-heist a player pad.
func (s *Server) serveHeist(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, heist.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, heist.GameKey, now)
	}
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	// join_room may carry the avatar look (up to auth.MaxCharacterBytes).
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := heist.NewClient(claims, host, r.URL.Query().Get("locale"), s.heist.Config().Buffer)
	key := floorKey{id: claims.Subject, host: host}
	s.mu.Lock()
	if prev, ok := s.heistConns[key]; ok {
		prev.Close()
	}
	s.heistConns[key] = client
	s.mu.Unlock()

	// Writer: drains the client queue; a slow or closed client stops it.
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case <-client.Gone():
				return
			case msg := <-client.Out():
				wctx, c := context.WithTimeout(ctx, 3*time.Second)
				err := wsjson.Write(wctx, conn, msg)
				c()
				if err != nil {
					return
				}
			}
		}
	}()
	reply := func(msg heist.Message) { client.Reply(msg) }

	if !s.heist.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(heist.Message{"t": "state_sync", "phase": "NONE", "role": role})
	}

	for {
		var in heistInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.heist.Create(client, at)
		case "join_room":
			pin := in.RoomCode
			if pin == "" {
				pin = in.Pin
			}
			if id, given := heist.ParsePlayerID(in.PlayerID); given && id != claims.Subject {
				err = heist.ErrIdentity
				break
			}
			err = s.heist.Join(client, pin, in.Avatar)
		case "configure":
			err = s.heist.Configure(client, in.Win, in.Value)
		case "set_subject":
			err = s.heist.SetSubject(client, in.Subject)
		case "start_game":
			err = s.heist.Start(client)
		case "end_game":
			err = s.heist.End(client)
		case "submit_answer":
			if in.Answer == nil {
				err = heist.ErrOption
				break
			}
			err = s.heist.Answer(client, in.Question, *in.Answer, at)
		case "select_chest":
			if in.Chest == nil {
				err = heist.ErrChest
				break
			}
			err = s.heist.SelectChest(client, *in.Chest)
		case "execute_heist_target":
			id, given := heist.ParsePlayerID(in.Target)
			if !given || id <= 0 {
				err = heist.ErrTarget
				break
			}
			err = s.heist.Target(client, id)
		case "leave_room":
			err = s.heist.Leave(client)
		case "sync":
			err = s.heist.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.heist.Sync(client)
			if errors.Is(err, heist.ErrNoRoom) {
				err = nil
			}
		case "ping":
			reply(heist.Message{"t": "pong"})
		default:
			err = errors.New("unknown_type")
		}
		if err != nil {
			reply(heist.Message{"t": "error", "code": err.Error()})
		}
		s.reportHeist()
	}

	s.mu.Lock()
	current := s.heistConns[key] == client
	if current {
		delete(s.heistConns, key)
	}
	s.mu.Unlock()
	if current {
		s.heist.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}
