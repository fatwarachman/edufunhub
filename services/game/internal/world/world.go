// Package world builds the authoritative mission maps and resolves movement/collision.
package world

import (
	"errors"
	"math"
	"math/rand/v2"
)

// Tile codes sent to clients. Keep in sync with resources/js/lib/flag-quest/world.ts.
const (
	Grass  byte = 'g'
	Water  byte = 'w'
	Sand   byte = 's'
	Path   byte = 'p'
	Bridge byte = 'b'
	Dock   byte = 'd'
	Plaza  byte = 'z'
)

const (
	Width        = 76
	Height       = 48
	PlayerRadius = 0.3
	InteractDist = 1.9
)

// ErrUnknownMission is returned for mission ids outside the catalogue.
var ErrUnknownMission = errors.New("unknown mission")

// Point is a world coordinate in tile units.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Rect is an axis-aligned rectangle in tile units.
type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Decor is a static prop. R > 0 means solid with that radius.
type Decor struct {
	Kind    string  `json:"k"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	R       float64 `json:"r"`
	Variant int     `json:"v"`
}

// Checkpoint is a challenge station guarding a bridge gate.
type Checkpoint struct {
	ID      int     `json:"id"`
	Kind    string  `json:"kind"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Gate    Rect    `json:"gate"`
	Cleared bool    `json:"cleared"`
}

// Mission describes a map variant.
type Mission struct {
	ID         string    `json:"id"`
	Difficulty int       `json:"difficulty"`
	Kinds      [3]string `json:"kinds"`
	seed       uint64
	bridgeY    [3]int
	flagY      int
}

// Missions is the ordered catalogue exposed to clients.
var Missions = []Mission{
	{ID: "lakeside", Difficulty: 1, Kinds: [3]string{"quick_quiz", "snakes_ladders", "true_false"}, seed: 11, bridgeY: [3]int{12, 30, 20}, flagY: 24},
	{ID: "forest", Difficulty: 2, Kinds: [3]string{"true_false", "math_sprint", "snakes_ladders"}, seed: 23, bridgeY: [3]int{34, 14, 36}, flagY: 32},
	{ID: "summit", Difficulty: 3, Kinds: [3]string{"math_sprint", "quick_quiz", "snakes_ladders"}, seed: 37, bridgeY: [3]int{22, 38, 9}, flagY: 12},
}

// RiverX holds the left column of each river.
var RiverX = [3]int{20, 40, 58}

// World is the full authoritative map state of one mission.
type World struct {
	Mission     string       `json:"mission"`
	W           int          `json:"w"`
	H           int          `json:"h"`
	Tiles       []string     `json:"tiles"`
	Decor       []Decor      `json:"decor"`
	Checkpoints []Checkpoint `json:"checkpoints"`
	Flag        Point        `json:"flag"`
	Spawn       Point        `json:"spawn"`
	grid        [][]byte
}

// FindMission returns the mission definition by id.
func FindMission(id string) (Mission, bool) {
	for _, m := range Missions {
		if m.ID == id {
			return m, true
		}
	}
	return Mission{}, false
}

// New deterministically generates the map for a mission.
func New(id string) (*World, error) {
	m, ok := FindMission(id)
	if !ok {
		return nil, ErrUnknownMission
	}
	w := &World{Mission: m.ID, W: Width, H: Height, Spawn: Point{7.5, 24.5}}
	w.grid = make([][]byte, Height)
	for y := range w.grid {
		w.grid[y] = make([]byte, Width)
		for x := range w.grid[y] {
			w.grid[y][x] = Grass
			if x < 2 || y < 6 || x >= Width-2 || y >= Height-2 {
				w.grid[y][x] = Water
			}
		}
	}
	// Irregular lake shore at the top.
	rng := rand.New(rand.NewPCG(m.seed, m.seed*7919))
	for x := 2; x < Width-2; x++ {
		depth := 6 + rng.IntN(2)
		if x%11 < 4 {
			depth++
		}
		for y := 6; y < depth; y++ {
			w.grid[y][x] = Water
		}
	}
	// Rivers with one bridge each.
	for i, rx := range RiverX {
		for y := 6; y < Height-2; y++ {
			w.grid[y][rx] = Water
			w.grid[y][rx+1] = Water
		}
		by := m.bridgeY[i]
		for y := by; y < by+3; y++ {
			w.grid[y][rx] = Bridge
			w.grid[y][rx+1] = Bridge
		}
		w.Checkpoints = append(w.Checkpoints, Checkpoint{
			ID: i, Kind: m.Kinds[i],
			X: float64(rx) - 2.5, Y: float64(by) - 0.6,
			Gate: Rect{X: float64(rx), Y: float64(by), W: 2, H: 3},
		})
	}
	w.Flag = Point{68.5, float64(m.flagY) + 0.5}

	// Camp paths: campfire, picnic and tent connect to the spawn.
	w.carvePath(Point{5.5, 22.5}, w.Spawn)
	w.carvePath(w.Spawn, Point{4.5, 26.5})
	// Guidance path: spawn -> each bridge -> flag.
	cur := w.Spawn
	for i, rx := range RiverX {
		target := Point{float64(rx) - 0.5, float64(m.bridgeY[i]) + 1.5}
		w.carvePath(cur, target)
		cur = Point{float64(rx) + 2.5, target.Y}
	}
	w.carvePath(cur, w.Flag)
	for y := m.flagY - 2; y <= m.flagY+3; y++ {
		for x := 66; x <= 71; x++ {
			if w.grid[y][x] == Grass || w.grid[y][x] == Path {
				w.grid[y][x] = Plaza
			}
		}
	}
	// Docks into the lake.
	for _, dx := range []int{9, 47} {
		for y := 3; y < 9; y++ {
			for x := dx; x < dx+3; x++ {
				if w.grid[y][x] == Water {
					w.grid[y][x] = Dock
				}
			}
		}
	}
	// Sand shores.
	for y := 1; y < Height-1; y++ {
		for x := 1; x < Width-1; x++ {
			if w.grid[y][x] != Grass {
				continue
			}
			for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				if w.grid[y+d[1]][x+d[0]] == Water {
					w.grid[y][x] = Sand
					break
				}
			}
		}
	}
	w.placeCamp()
	w.scatter(rng)
	w.Tiles = make([]string, Height)
	for y := range w.grid {
		w.Tiles[y] = string(w.grid[y])
	}
	return w, nil
}

func (w *World) carvePath(a, b Point) {
	x0, y0, x1, y1 := int(a.X), int(a.Y), int(b.X), int(b.Y)
	paint := func(x, y int) {
		for dy := 0; dy <= 1; dy++ {
			for dx := 0; dx <= 1; dx++ {
				tx, ty := x+dx, y+dy
				if tx > 1 && ty > 1 && tx < Width-2 && ty < Height-2 && w.grid[ty][tx] == Grass {
					w.grid[ty][tx] = Path
				}
			}
		}
	}
	step := func(v, t int) int {
		if v < t {
			return 1
		}
		return -1
	}
	midX := (x0 + x1) / 2
	for x := x0; x != midX; x += step(x, midX) {
		paint(x, y0)
	}
	for y := y0; y != y1; y += step(y, y1) {
		paint(midX, y)
	}
	for x := midX; x != x1; x += step(x, x1) {
		paint(x, y1)
	}
	paint(x1, y1)
}

func (w *World) placeCamp() {
	w.Decor = append(w.Decor,
		Decor{Kind: "campfire", X: 5, Y: 20.5, R: 0.55},
		Decor{Kind: "log", X: 3.6, Y: 19.8, R: 0.4},
		Decor{Kind: "stump", X: 6.4, Y: 19.3, R: 0.35},
		Decor{Kind: "tent", X: 4, Y: 28, R: 1.0},
		Decor{Kind: "picnic", X: 11.5, Y: 29.5, R: 0.85},
		Decor{Kind: "board", X: 10.5, Y: 19.5, R: 0.6},
		Decor{Kind: "tent", X: 64, Y: 40, R: 1.0, Variant: 1},
	)
	for i, cp := range w.Checkpoints {
		w.Decor = append(w.Decor, Decor{Kind: "station", X: cp.X, Y: cp.Y, R: 0.6, Variant: i})
	}
	w.Decor = append(w.Decor, Decor{Kind: "flagpole", X: w.Flag.X, Y: w.Flag.Y, R: 0.25})
}

func (w *World) reserved(x, y float64) bool {
	near := func(p Point, d float64) bool { return math.Hypot(p.X-x, p.Y-y) < d }
	if near(w.Spawn, 5) || near(w.Flag, 4.5) || near(Point{8, 24}, 7) {
		return true
	}
	for _, cp := range w.Checkpoints {
		if near(Point{cp.X, cp.Y}, 3) || near(Point{cp.Gate.X - 1, cp.Gate.Y + 1.5}, 3.5) || near(Point{cp.Gate.X + 3, cp.Gate.Y + 1.5}, 3.5) {
			return true
		}
	}
	for _, d := range w.Decor {
		if near(Point{d.X, d.Y}, d.R+1.6) {
			return true
		}
	}
	return false
}

func (w *World) scatter(rng *rand.Rand) {
	kinds := []struct {
		kind   string
		weight int
		radius float64
	}{
		{"tree", 34, 0.45}, {"pine", 20, 0.4}, {"bush", 14, 0.35}, {"berry", 6, 0.35},
		{"rock", 8, 0.4}, {"flowers", 16, 0}, {"mushroom", 2, 0},
	}
	total := 0
	for _, k := range kinds {
		total += k.weight
	}
	for attempt := 0; attempt < 2400 && len(w.Decor) < 260; attempt++ {
		tx, ty := 2+rng.IntN(Width-4), 7+rng.IntN(Height-9)
		if w.grid[ty][tx] != Grass {
			continue
		}
		clear := true
		for dy := -2; dy <= 1 && clear; dy++ {
			for dx := -1; dx <= 2; dx++ {
				if ty+dy < 0 || ty+dy >= Height || tx+dx < 0 || tx+dx >= Width {
					continue
				}
				t := w.grid[ty+dy][tx+dx]
				if t == Path || t == Bridge || t == Plaza || t == Dock {
					clear = false
					break
				}
			}
		}
		x, y := float64(tx)+0.2+rng.Float64()*0.6, float64(ty)+0.2+rng.Float64()*0.6
		if !clear || w.reserved(x, y) {
			continue
		}
		pick := rng.IntN(total)
		for _, k := range kinds {
			if pick < k.weight {
				w.Decor = append(w.Decor, Decor{Kind: k.kind, X: x, Y: y, R: k.radius, Variant: rng.IntN(4)})
				break
			}
			pick -= k.weight
		}
	}
}

// TileAt returns the tile code, water outside bounds.
func (w *World) TileAt(x, y float64) byte {
	tx, ty := int(math.Floor(x)), int(math.Floor(y))
	if tx < 0 || ty < 0 || tx >= w.W || ty >= w.H {
		return Water
	}
	return w.grid[ty][tx]
}

// Blocked reports whether a player circle centred at x,y collides.
func (w *World) Blocked(x, y float64) bool {
	r := PlayerRadius
	for _, p := range [][2]float64{{x - r, y - r}, {x + r, y - r}, {x - r, y + r}, {x + r, y + r}} {
		if w.TileAt(p[0], p[1]) == Water {
			return true
		}
	}
	for _, cp := range w.Checkpoints {
		g := cp.Gate
		if !cp.Cleared && x > g.X-r && x < g.X+g.W+r && y > g.Y-r && y < g.Y+g.H+r {
			return true
		}
	}
	for _, d := range w.Decor {
		if d.R > 0 && math.Hypot(d.X-x, d.Y-y) < d.R+r {
			return true
		}
	}
	return false
}

// Move advances from (x,y) along direction (dx,dy) by dist with axis-separated sliding.
func (w *World) Move(x, y, dx, dy, dist float64) (float64, float64) {
	l := math.Hypot(dx, dy)
	if l == 0 || dist <= 0 {
		return x, y
	}
	dx, dy = dx/l, dy/l
	steps := int(math.Ceil(dist / 0.1))
	s := dist / float64(steps)
	for i := 0; i < steps; i++ {
		movedX, movedY := false, false
		if nx := x + dx*s; !w.Blocked(nx, y) {
			x, movedX = nx, true
		}
		if ny := y + dy*s; !w.Blocked(x, ny) {
			y, movedY = ny, true
		}
		// Corner assist: pushing mostly along one axis into a corner slides the player
		// sideways toward the free side so narrow bridges are easy to enter.
		if !movedX && math.Abs(dx) > 0.7 {
			if side := w.freeSide(x+dx*s, y, false); side != 0 && !w.Blocked(x, y+side*s) {
				y += side * s
			}
		}
		if !movedY && math.Abs(dy) > 0.7 {
			if side := w.freeSide(x, y+dy*s, true); side != 0 && !w.Blocked(x+side*s, y) {
				x += side * s
			}
		}
	}
	return x, y
}

// CornerAssist is how far (tiles) around a blocked point the assist looks for a free side.
const CornerAssist = 0.45

// freeSide returns +1/-1 for the nearest perpendicular side that is free at (tx,ty), or 0.
// alongX=true searches along the x axis, otherwise along the y axis.
func (w *World) freeSide(tx, ty float64, alongX bool) float64 {
	for _, off := range []float64{0.1, 0.2, 0.3, CornerAssist} {
		for _, sign := range []float64{1, -1} {
			px, py := tx, ty+sign*off
			if alongX {
				px, py = tx+sign*off, ty
			}
			if !w.Blocked(px, py) {
				return sign
			}
		}
	}
	return 0
}

// Distance helper.
func Distance(ax, ay, bx, by float64) float64 { return math.Hypot(ax-bx, ay-by) }
