package hub

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPublishReachesEverySocketOfEachUser(t *testing.T) {
	h := New()
	a1, a2, b := h.Register(1), h.Register(1), h.Register(2)
	n := h.Publish([]int64{1, 3}, json.RawMessage(`{"t":"message"}`))
	if n != 2 || len(a1.Send) != 1 || len(a2.Send) != 1 || len(b.Send) != 0 {
		t.Fatalf("delivered %d: a1=%d a2=%d b=%d", n, len(a1.Send), len(a2.Send), len(b.Send))
	}
	if got := h.Online([]int64{1, 2, 3}); len(got) != 2 {
		t.Fatalf("online %v", got)
	}
	h.Unregister(a1)
	h.Unregister(a2)
	if users, sockets := h.Stats(); users != 1 || sockets != 1 {
		t.Fatalf("stats %d %d", users, sockets)
	}
}

func TestSlowClientIsDroppedAndLimitPerUser(t *testing.T) {
	h := New()
	slow := h.Register(1)
	for i := 0; i < BufferSize+1; i++ {
		h.Publish([]int64{1}, json.RawMessage(`{}`))
	}
	select {
	case <-slow.Done:
	default:
		t.Fatal("slow client not dropped")
	}
	first := h.Register(2)
	for i := 0; i < MaxConnsPerUser; i++ {
		h.Register(2)
	}
	select {
	case <-first.Done:
	default:
		t.Fatal("oldest socket not dropped over the limit")
	}
	if _, sockets := h.Stats(); sockets != MaxConnsPerUser {
		t.Fatalf("sockets %d", sockets)
	}
}

func drain(c *Client) []string {
	var out []string
	for {
		select {
		case e := <-c.Send:
			out = append(out, string(e))
		default:
			return out
		}
	}
}

func TestWatchersLearnPresenceChanges(t *testing.T) {
	h := NewWithGrace(0)
	watcher := h.Register(1)
	friend := h.Register(2)
	if got := h.Watch(watcher, []int64{2, 3, 2, 0}); len(got) != 1 || got[0] != 2 {
		t.Fatalf("initial online %v", got)
	}
	h.Unregister(friend)
	if got := drain(watcher); len(got) != 1 || got[0] != `{"online":false,"t":"presence","user":2}` {
		t.Fatalf("offline event %v", got)
	}
	h.Register(3)
	second := h.Register(3)
	if got := drain(watcher); len(got) != 1 || got[0] != `{"online":true,"t":"presence","user":3}` {
		t.Fatalf("online event once per user %v", got)
	}
	h.Unregister(second)
	if got := drain(watcher); len(got) != 0 {
		t.Fatalf("user with another socket must stay online %v", got)
	}
	h.Watch(watcher, nil)
	h.Register(2)
	if got := drain(watcher); len(got) != 0 {
		t.Fatalf("unwatched users must not notify %v", got)
	}
}

func TestOfflineGraceHidesQuickReconnects(t *testing.T) {
	h := NewWithGrace(40 * time.Millisecond)
	watcher := h.Register(1)
	friend := h.Register(2)
	h.Watch(watcher, []int64{2})
	h.Unregister(friend)
	if got := h.Online([]int64{2}); len(got) != 1 {
		t.Fatal("user must stay online during the grace period")
	}
	h.Register(2)
	time.Sleep(80 * time.Millisecond)
	if got := drain(watcher); len(got) != 0 {
		t.Fatalf("reload within grace must be silent %v", got)
	}
	for c := range h.clients[2] {
		h.Unregister(c)
	}
	time.Sleep(80 * time.Millisecond)
	if got := drain(watcher); len(got) != 1 || got[0] != `{"online":false,"t":"presence","user":2}` {
		t.Fatalf("offline after grace %v", got)
	}
	if got := h.Online([]int64{2}); len(got) != 0 {
		t.Fatalf("still online %v", got)
	}
}
