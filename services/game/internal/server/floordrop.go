package server

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"edufunhub/game/internal/auth"
	"edufunhub/game/internal/floordrop"
)

// floorInbound is a Floor Drop client message. Client timestamps are never
// read: submission time is the server reception clock.
type floorInbound struct {
	T       string `json:"t"`
	Pin     string `json:"pin"`
	RoundID int64  `json:"round_id"`
	Choice  *int   `json:"choice_index"`
	Subject string `json:"subject"`
	Locale  string `json:"locale"`
	Minutes int    `json:"minutes"`
	Limit   int    `json:"player_limit"`
}

// RunFloorDrop reports Floor Drop results. Rooms drive their own timers.
func (s *Server) RunFloorDrop(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			s.floor.CloseAll()
			s.reportFloor()
			return
		case <-s.floor.Ready():
			s.reportFloor()
		case <-t.C:
			s.reportFloor()
		}
	}
}

func (s *Server) reportFloor() {
	for _, res := range s.floor.TakeResults() {
		go s.report(res)
	}
}

// serveFloorDrop is the Floor Drop WebSocket endpoint. A token for game
// floor-drop-host opens the teacher screen; floor-drop opens a player pad.
func (s *Server) serveFloorDrop(w http.ResponseWriter, r *http.Request) {
	now := s.cfg.Now()
	token := r.URL.Query().Get("token")
	host := true
	claims, err := auth.Verify(token, s.cfg.Secret, floordrop.HostKey, now)
	if err != nil {
		host = false
		claims, err = auth.Verify(token, s.cfg.Secret, floordrop.GameKey, now)
	}
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return
	}
	conn.SetReadLimit(512)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := floordrop.NewClient(claims, host, r.URL.Query().Get("locale"), s.floor.Config().Buffer)
	s.mu.Lock()
	key := floorKey{id: claims.Subject, host: host}
	if prev, ok := s.floorConns[key]; ok {
		prev.Close()
	}
	s.floorConns[key] = client
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
	reply := func(msg floordrop.Message) { client.Reply(msg) }

	if !s.floor.Resume(client) {
		role := "player"
		if host {
			role = "host"
		}
		reply(floordrop.Message{"t": "state_sync", "phase": "NONE", "role": role})
	}

	for {
		var in floorInbound
		if err := wsjson.Read(ctx, conn, &in); err != nil {
			break
		}
		at := s.cfg.Now()
		var err error
		switch in.T {
		case "create_room":
			_, err = s.floor.Create(client, at)
		case "join_room":
			err = s.floor.Join(client, in.Pin)
		case "start_game":
			err = s.floor.Start(client)
		case "set_subject":
			err = s.floor.SetSubject(client, in.Subject)
		case "set_settings":
			err = s.floor.SetSettings(client, in.Minutes, in.Limit)
		case "submit_answer":
			if in.Choice == nil {
				err = floordrop.ErrOption
				break
			}
			err = s.floor.Answer(client, in.RoundID, *in.Choice, at)
		case "leave_room":
			err = s.floor.Leave(client)
		case "sync":
			err = s.floor.Sync(client)
		case "locale":
			client.SetLocale(in.Locale)
			err = s.floor.Sync(client)
		case "ping":
			reply(floordrop.Message{"t": "pong"})
		default:
			err = errors.New("unknown_type")
		}
		if err != nil {
			reply(floordrop.Message{"t": "error", "code": err.Error()})
		}
		s.reportFloor()
	}

	// Disconnect: the room starts the reconnect window, then drain the
	// writer before closing the socket.
	s.mu.Lock()
	current := s.floorConns[key] == client
	if current {
		delete(s.floorConns, key)
	}
	s.mu.Unlock()
	if current {
		s.floor.Detach(client)
	}
	client.Close()
	cancel()
	<-writerDone
	conn.Close(websocket.StatusNormalClosure, "")
}

type floorKey struct {
	id   int64
	host bool
}
