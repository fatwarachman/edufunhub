package hub

import (
	"encoding/json"
	"testing"
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
