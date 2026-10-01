package world

import (
	"testing"
)

func reachable(w *World, from, to Point) bool {
	type cell struct{ x, y int }
	start, goal := cell{int(from.X), int(from.Y)}, cell{int(to.X), int(to.Y)}
	seen := map[cell]bool{start: true}
	queue := []cell{start}
	for len(queue) > 0 {
		c := queue[0]
		queue = queue[1:]
		if c == goal {
			return true
		}
		for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			n := cell{c.x + d[0], c.y + d[1]}
			if seen[n] || w.Blocked(float64(n.x)+0.5, float64(n.y)+0.5) {
				continue
			}
			seen[n] = true
			queue = append(queue, n)
		}
	}
	return false
}

func TestEveryMissionIsCompletableOnlyThroughGates(t *testing.T) {
	for _, m := range Missions {
		w, err := New(m.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(w.Tiles) != Height || len(w.Tiles[0]) != Width || len(w.Checkpoints) != 3 {
			t.Fatalf("%s: bad dimensions", m.ID)
		}
		if w.Blocked(w.Spawn.X, w.Spawn.Y) {
			t.Fatalf("%s: spawn blocked", m.ID)
		}
		if reachable(w, w.Spawn, Point{w.Flag.X - 2, w.Flag.Y}) {
			t.Fatalf("%s: flag reachable while gates are closed", m.ID)
		}
		for i := range w.Checkpoints {
			cp := w.Checkpoints[i]
			if !reachable(w, w.Spawn, Point{cp.X + 1.2, cp.Y + 1}) {
				t.Fatalf("%s: station %d not reachable", m.ID, i)
			}
			w.Checkpoints[i].Cleared = true
		}
		if !reachable(w, w.Spawn, Point{w.Flag.X - 2, w.Flag.Y}) {
			t.Fatalf("%s: flag unreachable after clearing gates", m.ID)
		}
	}
}

func TestDeterministicAndUnknown(t *testing.T) {
	a, _ := New("forest")
	b, _ := New("forest")
	if len(a.Decor) != len(b.Decor) || a.Tiles[20] != b.Tiles[20] {
		t.Fatal("generation must be deterministic")
	}
	if _, err := New("moon"); err != ErrUnknownMission {
		t.Fatalf("expected ErrUnknownMission, got %v", err)
	}
}

func TestMoveCollidesWithWaterAndSlides(t *testing.T) {
	w, _ := New("lakeside")
	x, y := w.Move(w.Spawn.X, w.Spawn.Y, 0, -1, 40)
	if y < 6 || w.Blocked(x, y) {
		t.Fatalf("walked into lake: %v,%v", x, y)
	}
	gate := w.Checkpoints[0].Gate
	x, _ = w.Move(gate.X-1, gate.Y+1.5, 1, 0, 5)
	if x > gate.X {
		t.Fatalf("passed through closed gate: %v", x)
	}
}

func TestCornerAssistEntersBridgeFromEdge(t *testing.T) {
	w, _ := New("lakeside")
	for i := range w.Checkpoints {
		w.Checkpoints[i].Cleared = true
	}
	g := w.Checkpoints[2].Gate
	// Stand just above the bridge's top edge and walk straight east into the corner.
	x, y := w.Move(g.X-0.35, g.Y+0.25, 1, 0, 4)
	if x < g.X+g.W {
		t.Fatalf("stuck at bridge corner: %.2f,%.2f (gate x %.0f)", x, y, g.X)
	}
	// A wall with no free side must still block.
	x2, _ := w.Move(g.X-0.35, g.Y-2, 1, 0, 4)
	if x2 > g.X {
		t.Fatalf("walked through water: %.2f", x2)
	}
}
