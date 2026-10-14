// Package classroom runs the 3D classroom world: authoritative avatar
// positions, movement, collisions, booth proximity, chat, roster and kicks.
// Rooms are keyed by the teacher classroom id from the player token.
package classroom

import (
	"math"
	"sort"
)

// GameKey is the token game key for the classroom world.
const GameKey = "classroom"

// World constants (meters; floor is the X/Z plane, origin = room centre).
const (
	PlayerRadius = 0.35
	Speed        = 3.5
	BoothRadius  = 1.3
	// SayRadius is the max distance between sender and target of a `say`.
	SayRadius = 3.0
	// TeacherSeatGap is the distance from the teacher desk's board-side edge
	// to the teacher seat.
	TeacherSeatGap = 0.75
	MaxBooths      = 10
	SpawnJitterX   = 1.0
	SpawnJitterZ   = 0.8
)

// Layout sizing. The room grows with the classroom seat count (max_members)
// so a full class never piles up on 12 desks.
const (
	// DefaultSeats is used when the token carries no seats claim (legacy
	// tokens): 12 desks in a 24 x 16 m room, the original layout.
	DefaultSeats = 24
	MaxSeats     = 200
	MinDesks     = 6
	MaxDesks     = 100
	// WideAfter switches the grid from 4 to 6 columns above this many desks.
	WideAfter = 40
	MinRoomW  = 24.0
	MinRoomD  = 16.0
	DeskW     = 1.4
	DeskD     = 0.9
	RowPitch  = 3.0
	// FrontGap is the distance from the front wall to the first desk row
	// (teacher desk + board area).
	FrontGap = 6.0
	// BackGap is the free strip from the last desk row to the back wall
	// (spawn + walkway).
	BackGap = 4.0
	// BoothSpacing is the minimum centre distance between wall booths.
	BoothSpacing = 3.5
)

var (
	narrowColumns = []float64{-6.5, -3.5, 3.5, 6.5}
	wideColumns   = []float64{-9.5, -6.5, -3.5, 3.5, 6.5, 9.5}
)

// Bounds is the floor size: W along x, D along z. Walls sit at +-W/2, +-D/2.
type Bounds struct {
	W float64 `json:"w"`
	D float64 `json:"d"`
}

// Point is a floor position.
type Point struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

// Box is a solid axis-aligned box on the floor: centre (X, Z), size W (x) by D (z).
type Box struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
	W float64 `json:"w"`
	D float64 `json:"d"`
}

// Booth is a game booth; players walk into it (it is not solid).
type Booth struct {
	I    int     `json:"i"`
	Game string  `json:"game"`
	X    float64 `json:"x"`
	Z    float64 `json:"z"`
	R    float64 `json:"r"`
}

// Geometry is the world layout shared with the client in `welcome`.
type Geometry struct {
	Seats       int    `json:"seats"`
	Room        Bounds `json:"room"`
	Spawn       Point  `json:"spawn"`
	Desks       []Box  `json:"desks"`
	TeacherDesk Box    `json:"teacher_desk"`
	// TeacherSeat is where the teacher avatar stands: behind the teacher
	// desk, on the board side.
	TeacherSeat Point   `json:"teacher_seat"`
	Booths      []Booth `json:"booths"`
}

// NormalizeSeats maps a seats claim to 1..MaxSeats (<= 0 = DefaultSeats).
func NormalizeSeats(seats int) int {
	switch {
	case seats <= 0:
		return DefaultSeats
	case seats > MaxSeats:
		return MaxSeats
	}
	return seats
}

// DeskCount is one desk per two students, clamped to MinDesks..MaxDesks.
func DeskCount(seats int) int {
	n := (NormalizeSeats(seats) + 1) / 2
	return int(math.Max(MinDesks, math.Min(MaxDesks, float64(n))))
}

// Layout builds the geometry for the booth game keys (max 10 used) and the
// classroom seat count. Desks fill a grid with a centre aisle from the front;
// the room is sized so a 2 m+ walkway rings the desks, the teacher desk sits
// at the front, spawn is at the back right and booths line the walls.
func Layout(games []string, seats int) Geometry {
	seats = NormalizeSeats(seats)
	n := DeskCount(seats)
	cols := narrowColumns
	if n > WideAfter {
		cols = wideColumns
	}
	rows := (n + len(cols) - 1) / len(cols)
	deskEdge := cols[len(cols)-1] + DeskW/2
	boothX := deskEdge + 3.3
	room := Bounds{
		W: math.Max(MinRoomW, 2*(boothX+1.5)),
		D: math.Max(MinRoomD, FrontGap+RowPitch*float64(rows-1)+BackGap),
	}
	hw, hd := room.W/2, room.D/2
	g := Geometry{
		Seats:       seats,
		Room:        room,
		Spawn:       Point{X: hw - 3, Z: hd - 2},
		Desks:       make([]Box, 0, n),
		TeacherDesk: Box{X: 0, Z: -hd + 2, W: 4, D: 1.2},
		Booths:      []Booth{},
	}
	g.TeacherSeat = Point{X: g.TeacherDesk.X, Z: g.TeacherDesk.Z - g.TeacherDesk.D/2 - TeacherSeatGap}
	for r := 0; r < rows; r++ {
		z := -hd + FrontGap + RowPitch*float64(r)
		for _, x := range rowColumns(cols, n-r*len(cols)) {
			g.Desks = append(g.Desks, Box{X: x, Z: z, W: DeskW, D: DeskD})
		}
	}
	spots := boothSpots(room, boothX, g.Spawn, min(len(games), MaxBooths))
	for i, key := range games {
		if i >= len(spots) {
			break
		}
		g.Booths = append(g.Booths, Booth{I: i, Game: key, X: spots[i].X, Z: spots[i].Z, R: BoothRadius})
	}
	return g
}

// rowColumns returns the columns used by a row holding left desks: a full row
// uses every column, a partial last row fills from the centre aisle out.
func rowColumns(cols []float64, left int) []float64 {
	if left >= len(cols) {
		return cols
	}
	byCentre := append([]float64{}, cols...)
	sort.SliceStable(byCentre, func(i, j int) bool { return math.Abs(byCentre[i]) < math.Abs(byCentre[j]) })
	picked := byCentre[:left]
	sort.Float64s(picked)
	return picked
}

// wallSlots spreads k booth centres evenly over [lo, hi] (k <= capacity).
func wallSlots(lo, hi float64, k int) []float64 {
	if k <= 0 || hi < lo {
		return nil
	}
	if k == 1 {
		return []float64{round2((lo + hi) / 2)}
	}
	out := make([]float64, k)
	for i := range out {
		out[i] = round2(lo + (hi-lo)*float64(i)/float64(k-1))
	}
	return out
}

func wallCapacity(lo, hi float64) int {
	if hi < lo {
		return 0
	}
	return int(math.Floor((hi-lo)/BoothSpacing+1e-9)) + 1
}

// boothSpots places k booths: left and right walls first (spread evenly along
// the room depth; the right wall stops short of the spawn), then the front
// corners, then the back wall.
func boothSpots(room Bounds, boothX float64, spawn Point, k int) []Point {
	hd := room.D / 2
	lo := -hd + 3
	leftHi, rightHi := hd-2.5, spawn.Z-3
	capL, capR := wallCapacity(lo, leftHi), wallCapacity(lo, rightHi)
	nL := min((k+1)/2, capL)
	nR := min(k-nL, capR)
	nL = min(k-nR, capL)
	out := make([]Point, 0, k)
	for _, z := range wallSlots(lo, leftHi, nL) {
		out = append(out, Point{X: -boothX, Z: z})
	}
	for _, z := range wallSlots(lo, rightHi, nR) {
		out = append(out, Point{X: boothX, Z: z})
	}
	extra := []Point{{X: -(boothX - 3.5), Z: -hd + 1}, {X: boothX - 3.5, Z: -hd + 1}, {X: -4, Z: hd - 1}}
	for _, p := range extra {
		if len(out) >= k {
			break
		}
		out = append(out, p)
	}
	return out
}

// Solids lists every collider (student desks + teacher desk).
func (g Geometry) Solids() []Box {
	return append(append([]Box{}, g.Desks...), g.TeacherDesk)
}

// Inside reports whether (x, z) is within booth i's radius.
func (g Geometry) Inside(i int, x, z float64) bool {
	if i < 0 || i >= len(g.Booths) {
		return false
	}
	b := g.Booths[i]
	return math.Hypot(x-b.X, z-b.Z) <= b.R
}

// Resolve pushes a player circle at (x, z) out of every solid and clamps it
// inside the room walls.
func Resolve(x, z float64, solids []Box, room Bounds) (float64, float64) {
	for pass := 0; pass < 3; pass++ {
		for _, b := range solids {
			x, z = pushOut(x, z, b)
		}
		x, z = clampBounds(x, z, room)
	}
	return x, z
}

// Blocked reports whether a player circle at (x, z) overlaps a solid or wall.
func Blocked(x, z float64, solids []Box, room Bounds) bool {
	if x < -room.W/2+PlayerRadius || x > room.W/2-PlayerRadius || z < -room.D/2+PlayerRadius || z > room.D/2-PlayerRadius {
		return true
	}
	for _, b := range solids {
		cx := clamp(x, b.X-b.W/2, b.X+b.W/2)
		cz := clamp(z, b.Z-b.D/2, b.Z+b.D/2)
		if (x-cx)*(x-cx)+(z-cz)*(z-cz) < PlayerRadius*PlayerRadius-1e-9 {
			return true
		}
	}
	return false
}

func pushOut(x, z float64, b Box) (float64, float64) {
	minX, maxX, minZ, maxZ := b.X-b.W/2, b.X+b.W/2, b.Z-b.D/2, b.Z+b.D/2
	cx, cz := clamp(x, minX, maxX), clamp(z, minZ, maxZ)
	dx, dz := x-cx, z-cz
	d2 := dx*dx + dz*dz
	if d2 >= PlayerRadius*PlayerRadius {
		return x, z
	}
	if d2 > 1e-12 {
		d := math.Sqrt(d2)
		return cx + dx/d*PlayerRadius, cz + dz/d*PlayerRadius
	}
	// Centre inside the box: leave by the shallowest side.
	left, right, back, front := x-minX, maxX-x, z-minZ, maxZ-z
	switch m := math.Min(math.Min(left, right), math.Min(back, front)); m {
	case left:
		return minX - PlayerRadius, z
	case right:
		return maxX + PlayerRadius, z
	case back:
		return x, minZ - PlayerRadius
	default:
		return x, maxZ + PlayerRadius
	}
}

func clampBounds(x, z float64, room Bounds) (float64, float64) {
	return clamp(x, -room.W/2+PlayerRadius, room.W/2-PlayerRadius), clamp(z, -room.D/2+PlayerRadius, room.D/2-PlayerRadius)
}

func clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}

// ClampInput turns a raw direction into a finite vector of length <= 1.
func ClampInput(x, z float64) (float64, float64) {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		x = 0
	}
	if math.IsNaN(z) || math.IsInf(z, 0) {
		z = 0
	}
	if l := math.Hypot(x, z); l > 1 {
		x, z = x/l, z/l
	}
	return x, z
}

// Advance moves a player for dt seconds along input (inX, inZ) and resolves
// collisions. Long frames are split so a player never tunnels through a desk.
func Advance(x, z, inX, inZ, dt float64, solids []Box, room Bounds) (float64, float64) {
	if dt <= 0 || (inX == 0 && inZ == 0) {
		return x, z
	}
	for dt > 0 {
		step := math.Min(dt, 0.05)
		dt -= step
		x, z = Resolve(x+inX*Speed*step, z+inZ*Speed*step, solids, room)
	}
	return x, z
}

// round2 rounds to 2 decimals for the wire.
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
