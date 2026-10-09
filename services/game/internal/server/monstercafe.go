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
	"edufunhub/game/internal/monstercafe"
)

// cafeInbound is a Monster Café client message (intents only). Client
// timestamps, coins and outcomes are never read.
type cafeInbound struct {
	T          string          `json:"t"`
	Pin        string          `json:"pin"`
	RoomCode   string          `json:"room_code"`
	PlayerID   json.RawMessage `json:"player_id"`
	Avatar     json.RawMessage `json:"avatar"`
	Question   string          `json:"question_id"`
	Answer     *int            `json:"answer_index"`
	Ingredient string          `json:"ingredient"`
	OrderID    string          `json:"order_id"`
	RatID      string          `json:"rat_id"`
	Target     json.RawMessage `json:"target_player_id"`
	Minutes    int             `json:"minutes"`
	Subject    string          `json:"subject"`
	Locale     string          `json:"locale"`
}

// RunMonsterCafe reports Monster Café results. Rooms drive their own timers.
func (s *Server) RunMonsterCafe(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.cafe.CloseAll()
			s.reportCafe()
			return
		case <-s.cafe.Ready():
			s.reportCafe()
		case <-t.C:
			s.reportCafe()
		}
	}
}

func (s *Server) reportCafe() {
	for _, res := range s.cafe.TakeResults() {
		go s.report(res)
	}
}

// serveMonsterCafe is the Monster Café WebSocket endpoint. A token for game
// monster-cafe-host opens the teacher screen; monster-cafe a player pad.
func (s *Server) serveMonsterCafe(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, monstercafe.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, monstercafe.GameKey, now)
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

	client := monstercafe.NewClient(claims, host, r.URL.Query().Get("locale"), s.cafe.Config().Buffer)
	key := floorKey{id: claims.Subject, host: host}
	s.mu.Lock()
	if prev, ok := s.cafeConns[key]; ok {
		prev.Close()
	}
	s.cafeConns[key] = client
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
	reply := func(msg monstercafe.Message) { client.Reply(msg) }

	if !s.cafe.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(monstercafe.Message{"t": "state_sync", "phase": monstercafe.PhaseNone, "role": role})
	}

	for {
		var in cafeInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.cafe.Create(client, at)
		case "create_solo":
			_, err = s.cafe.CreateSolo(client, in.Avatar, at)
		case "join_room":
			pin := in.RoomCode
			if pin == "" {
				pin = in.Pin
			}
			if id, given := monstercafe.ParsePlayerID(in.PlayerID); given && id != claims.Subject {
				err = monstercafe.ErrIdentity
				break
			}
			err = s.cafe.Join(client, pin, in.Avatar)
		case "configure":
			err = s.cafe.Configure(client, in.Minutes)
		case "set_subject":
			err = s.cafe.SetSubject(client, in.Subject)
		case "start_game":
			err = s.cafe.Start(client)
		case "end_game":
			err = s.cafe.End(client)
		case "submit_answer":
			if in.Answer == nil {
				err = monstercafe.ErrOption
				break
			}
			err = s.cafe.Answer(client, in.Question, *in.Answer, at)
		case monstercafe.OpRequest, monstercafe.OpPlateAdd:
			err = s.cafe.Act(client, in.T, in.Ingredient, 0)
		case monstercafe.OpPlateClear, monstercafe.OpCook, monstercafe.OpTakeOut, monstercafe.OpDiscard:
			err = s.cafe.Act(client, in.T, "", 0)
		case monstercafe.OpServe:
			err = s.cafe.Act(client, in.T, in.OrderID, 0)
		case monstercafe.OpShoo:
			err = s.cafe.Act(client, in.T, in.RatID, 0)
		case monstercafe.OpPie:
			id, given := monstercafe.ParsePlayerID(in.Target)
			if given && id <= 0 {
				err = monstercafe.ErrTarget
				break
			}
			err = s.cafe.Act(client, in.T, "", id)
		case "leave_room":
			err = s.cafe.Leave(client)
		case "sync":
			err = s.cafe.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.cafe.Sync(client)
			if errors.Is(err, monstercafe.ErrNoRoom) {
				err = nil
			}
		case "ping":
			reply(monstercafe.Message{"t": "pong"})
		default:
			err = monstercafe.ErrUnknownType
		}
		if err != nil {
			reply(monstercafe.Message{"t": "error", "code": err.Error(), "for": in.T})
		}
		s.reportCafe()
	}

	s.mu.Lock()
	current := s.cafeConns[key] == client
	if current {
		delete(s.cafeConns, key)
	}
	s.mu.Unlock()
	if current {
		s.cafe.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}
