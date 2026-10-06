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
	"edufunhub/game/internal/turbotrivia"
)

// turboInbound is a Turbo Trivia client message (intents only). Client
// timestamps are never read: answer time is the server reception clock.
type turboInbound struct {
	T         string          `json:"t"`
	Pin       string          `json:"pin"`
	RoomCode  string          `json:"room_code"`
	PlayerID  json.RawMessage `json:"player_id"`
	Avatar    json.RawMessage `json:"avatar"`
	QID       int64           `json:"qid"`
	Choice    *int            `json:"choice_index"`
	Item      string          `json:"item"`
	Questions int             `json:"questions"`
	Subject   string          `json:"subject"`
	Locale    string          `json:"locale"`
}

// RunTurboTrivia reports Turbo Trivia results. Rooms drive their own ticks.
func (s *Server) RunTurboTrivia(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.turbo.CloseAll()
			s.reportTurbo()
			return
		case <-s.turbo.Ready():
			s.reportTurbo()
		case <-t.C:
			s.reportTurbo()
		}
	}
}

func (s *Server) reportTurbo() {
	for _, res := range s.turbo.TakeResults() {
		go s.report(res)
	}
}

// serveTurboTrivia is the Turbo Trivia WebSocket endpoint. A token for game
// turbo-trivia-host opens the projector arena; turbo-trivia a phone
// controller.
func (s *Server) serveTurboTrivia(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, turbotrivia.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, turbotrivia.GameKey, now)
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

	client := turbotrivia.NewClient(claims, host, r.URL.Query().Get("locale"), s.turbo.Config().Buffer)
	key := floorKey{id: claims.Subject, host: host}
	s.mu.Lock()
	if prev, ok := s.turboConns[key]; ok {
		prev.Close()
	}
	s.turboConns[key] = client
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
	reply := func(msg turbotrivia.Message) { client.Reply(msg) }

	if !s.turbo.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(turbotrivia.Message{"t": "state_sync", "phase": "NONE", "role": role})
	}

	for {
		var in turboInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.turbo.Create(client, at)
		case "join_room":
			pin := in.RoomCode
			if pin == "" {
				pin = in.Pin
			}
			if id, given := turbotrivia.ParsePlayerID(in.PlayerID); given && id != claims.Subject {
				err = errors.New("invalid_player")
				break
			}
			err = s.turbo.Join(client, pin, in.Avatar)
		case "configure":
			err = s.turbo.Configure(client, in.Questions)
		case "set_subject":
			err = s.turbo.SetSubject(client, in.Subject)
		case "start_game":
			err = s.turbo.Start(client)
		case "end_game":
			err = s.turbo.End(client)
		case "submit_answer":
			if in.Choice == nil {
				err = turbotrivia.ErrOption
				break
			}
			err = s.turbo.Answer(client, in.QID, *in.Choice, at)
		case "use_item":
			err = s.turbo.UseItem(client, in.Item, at)
		case "leave_room":
			err = s.turbo.Leave(client)
		case "sync":
			err = s.turbo.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.turbo.Sync(client)
			if errors.Is(err, turbotrivia.ErrNoRoom) {
				err = nil
			}
		case "ping":
			reply(turbotrivia.Message{"t": "pong"})
		default:
			err = errors.New("unknown_type")
		}
		if err != nil {
			reply(turbotrivia.Message{"t": "error", "code": err.Error(), "for": in.T})
		}
		s.reportTurbo()
	}

	s.mu.Lock()
	current := s.turboConns[key] == client
	if current {
		delete(s.turboConns, key)
	}
	s.mu.Unlock()
	if current {
		s.turbo.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}
