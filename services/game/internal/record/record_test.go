package record

import "testing"

func TestRankOrdersByScoreWithTiesAndLeavers(t *testing.T) {
	p := []Player{{Score: 50}, {Score: 90}, {Score: 50}, {Score: 99, Left: true}}
	Rank(p, func(i int) int { return p[i].Score }, -1)
	want := []int{2, 1, 2, 4}
	for i, w := range want {
		if p[i].Rank != w {
			t.Fatalf("seat %d rank %d, want %d (%+v)", i, p[i].Rank, w, p)
		}
	}
}

func TestRankPutsForcedWinnerFirst(t *testing.T) {
	p := []Player{{Score: 10}, {Score: 80}}
	Rank(p, func(i int) int { return p[i].Score }, 0)
	if p[0].Rank != 1 || p[1].Rank != 2 {
		t.Fatalf("winner must rank first: %+v", p)
	}
}

func TestMode(t *testing.T) {
	if Mode([]Player{{}}) != ModeSolo || Mode([]Player{{}, {Local: true}}) != ModeRoom {
		t.Fatal("one seat is solo, more is a room")
	}
}
