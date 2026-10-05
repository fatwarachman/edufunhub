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
	"edufunhub/game/internal/orderrush"
)

// rushInbound is an Order Rush client message (intents only). The client
// duration is accepted for compatibility but never used: timing is the
// server reception time.
type rushInbound struct {
	T        string          `json:"t"`
	Pin      string          `json:"pin"`
	RoomCode string          `json:"room_code"`
	PlayerID json.RawMessage `json:"player_id"`
	Avatar   json.RawMessage `json:"avatar"`
	Question string          `json:"question_id"`
	Order    []string        `json:"submitted_order"`
	Duration int64           `json:"client_duration_ms"`
	Target   json.RawMessage `json:"target_player_id"`
	PowerUp  string          `json:"powerup_type"`
	Mode     string          `json:"mode"`
	Value    int             `json:"value"`
	Sets     []string        `json:"sets"`
	Locale   string          `json:"locale"`
}

// RunOrderRush reports Order Rush results. Rooms drive their own timers.
func (s *Server) RunOrderRush(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.rush.CloseAll()
			s.reportRush()
			return
		case <-s.rush.Ready():
			s.reportRush()
		case <-t.C:
			s.reportRush()
		}
	}
}

func (s *Server) reportRush() {
	for _, res := range s.rush.TakeResults() {
		go s.report(res)
	}
}

// serveOrderRush is the Order Rush WebSocket endpoint. A token for game
// order-rush-host opens the teacher screen; order-rush a player pad.
func (s *Server) serveOrderRush(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, orderrush.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, orderrush.GameKey, now)
	}
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	// join_room may carry the avatar look (up to auth.MaxCharacterBytes);
	// a submitted order holds at most orderrush.MaxSubmitted short ids.
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := orderrush.NewClient(claims, host, r.URL.Query().Get("locale"), s.rush.Config().Buffer)
	key := floorKey{id: claims.Subject, host: host}
	s.mu.Lock()
	if prev, ok := s.rushConns[key]; ok {
		prev.Close()
	}
	s.rushConns[key] = client
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
	reply := func(msg orderrush.Message) { client.Reply(msg) }

	if !s.rush.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(orderrush.Message{"t": "state_sync", "phase": "NONE", "role": role, "catalog": orderrush.Current().Catalog(client.Locale())})
	}

	for {
		var in rushInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.rush.Create(client, at)
		case "join_room":
			pin := in.RoomCode
			if pin == "" {
				pin = in.Pin
			}
			if id, given := orderrush.ParsePlayerID(in.PlayerID); given && id != claims.Subject {
				err = orderrush.ErrIdentity
				break
			}
			err = s.rush.Join(client, pin, in.Avatar)
		case "configure":
			err = s.rush.Configure(client, in.Mode, in.Value, in.Sets)
		case "start_game":
			err = s.rush.Start(client)
		case "end_game":
			err = s.rush.End(client)
		case "submit_sequence":
			if in.Order == nil {
				err = orderrush.ErrOrder
				break
			}
			err = s.rush.Submit(client, in.Question, in.Order, at)
		case "use_powerup":
			target, given := orderrush.ParsePlayerID(in.Target)
			if given && target <= 0 {
				err = orderrush.ErrTarget
				break
			}
			err = s.rush.UsePowerUp(client, in.PowerUp, target, at)
		case "leave_room":
			err = s.rush.Leave(client)
		case "sync":
			err = s.rush.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.rush.Sync(client)
			if errors.Is(err, orderrush.ErrNoRoom) {
				err = nil
			}
		case "ping":
			reply(orderrush.Message{"t": "pong"})
		default:
			err = errors.New("unknown_type")
		}
		if err != nil {
			reply(orderrush.Message{"t": "error", "code": err.Error(), "for": in.T})
		}
		s.reportRush()
	}

	s.mu.Lock()
	current := s.rushConns[key] == client
	if current {
		delete(s.rushConns, key)
	}
	s.mu.Unlock()
	if current {
		s.rush.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}
