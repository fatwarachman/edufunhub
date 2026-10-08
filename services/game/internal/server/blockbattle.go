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
	"edufunhub/game/internal/blockbattle"
)

// blockInbound is a Block Battle client message (intents only). Client
// timestamps are never read: answer and input time is the server clock.
type blockInbound struct {
	T        string          `json:"t"`
	Pin      string          `json:"pin"`
	RoomCode string          `json:"room_code"`
	PlayerID json.RawMessage `json:"player_id"`
	Avatar   json.RawMessage `json:"avatar"`
	QID      int64           `json:"qid"`
	Choice   *int            `json:"choice_index"`
	Action   string          `json:"action"`
	Reward   string          `json:"reward"`
	Mode     string          `json:"mode"`
	Minutes  int             `json:"minutes"`
	Content  string          `json:"content"`
	Subject  string          `json:"subject"`
	Locale   string          `json:"locale"`
}

// RunBlockBattle reports Block Battle results. Rooms drive their own ticks.
func (s *Server) RunBlockBattle(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.block.CloseAll()
			s.reportBlock()
			return
		case <-s.block.Ready():
			s.reportBlock()
		case <-t.C:
			s.reportBlock()
		}
	}
}

func (s *Server) reportBlock() {
	for _, res := range s.block.TakeResults() {
		go s.report(res)
	}
}

// serveBlockBattle is the Block Battle WebSocket endpoint. A token for game
// block-battle-host opens the projector arena; block-battle a phone
// controller.
func (s *Server) serveBlockBattle(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, blockbattle.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, blockbattle.GameKey, now)
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

	client := blockbattle.NewClient(claims, host, r.URL.Query().Get("locale"), s.block.Config().Buffer)
	key := floorKey{id: claims.Subject, host: host}
	s.mu.Lock()
	if prev, ok := s.blockConns[key]; ok {
		prev.Close()
	}
	s.blockConns[key] = client
	s.mu.Unlock()

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
	reply := func(msg blockbattle.Message) { client.Reply(msg) }

	if !s.block.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(blockbattle.Message{"t": "state_sync", "phase": "NONE", "role": role})
	}

	for {
		var in blockInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.block.Create(client, at)
		case "join_room":
			pin := in.RoomCode
			if pin == "" {
				pin = in.Pin
			}
			if id, given := blockbattle.ParsePlayerID(in.PlayerID); given && id != claims.Subject {
				err = errors.New("invalid_player")
				break
			}
			err = s.block.Join(client, pin, in.Avatar)
		case "configure":
			err = s.block.Configure(client, in.Mode, in.Minutes, in.Content)
		case "set_subject":
			err = s.block.SetSubject(client, in.Subject)
		case "start_game":
			err = s.block.Start(client)
		case "end_game":
			err = s.block.End(client)
		case "submit_answer":
			if in.Choice == nil {
				err = blockbattle.ErrOption
				break
			}
			err = s.block.Answer(client, in.QID, *in.Choice, at)
		case "input":
			err = s.block.Input(client, in.Action, at)
		case "claim_reward":
			err = s.block.Claim(client, in.Reward, at)
		case "leave_room":
			err = s.block.Leave(client)
		case "sync":
			err = s.block.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.block.Sync(client)
			if errors.Is(err, blockbattle.ErrNoRoom) {
				err = nil
			}
		case "ping":
			reply(blockbattle.Message{"t": "pong"})
		default:
			err = errors.New("unknown_type")
		}
		if err != nil {
			reply(blockbattle.Message{"t": "error", "code": err.Error(), "for": in.T})
		}
		s.reportBlock()
	}

	s.mu.Lock()
	current := s.blockConns[key] == client
	if current {
		delete(s.blockConns, key)
	}
	s.mu.Unlock()
	if current {
		s.block.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}
