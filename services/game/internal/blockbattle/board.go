package blockbattle

import (
	"math/rand/v2"
	"strings"
)

// Cell values.
const (
	Empty    = '.'
	Garbage  = 'G'
	Base     = '#'
	NoGlyph  = ' '
	Cols     = 10
	Rows     = 20 // visible rows
	Hidden   = 2  // spawn rows above the visible board
	FortCols = 12
	FortRows = 16
)

// PieceTypes are the seven tetrominoes in 7-bag order.
const PieceTypes = "IJLOSTZ"

// shape is a piece in its spawn state: cell offsets inside a size x size box.
type shape struct {
	size  int
	cells [4][2]int
}

// shapes follow SRS spawn states; I cells run left to right so glyphs of an
// I piece read as a word.
var shapes = map[byte]shape{
	'I': {4, [4][2]int{{0, 1}, {1, 1}, {2, 1}, {3, 1}}},
	'J': {3, [4][2]int{{0, 0}, {0, 1}, {1, 1}, {2, 1}}},
	'L': {3, [4][2]int{{2, 0}, {0, 1}, {1, 1}, {2, 1}}},
	'O': {2, [4][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}}},
	'S': {3, [4][2]int{{1, 0}, {2, 0}, {0, 1}, {1, 1}}},
	'T': {3, [4][2]int{{1, 0}, {0, 1}, {1, 1}, {2, 1}}},
	'Z': {3, [4][2]int{{0, 0}, {1, 0}, {1, 1}, {2, 1}}},
}

// Kicks are the x offsets tried on rotation, first in place then one row up.
var Kicks = []int{0, -1, 1, -2, 2}

// Piece is a falling tetromino. Cell i always carries Glyphs[i], so glyphs
// follow their cell through rotations.
type Piece struct {
	Type   byte
	Rot    int // 0..3 clockwise quarter turns
	X, Y   int // top-left of the shape box on the board (Y includes hidden rows)
	Glyphs [4]byte
}

// NewPiece returns a piece of type t without glyphs.
func NewPiece(t byte) Piece {
	return Piece{Type: t, Glyphs: [4]byte{NoGlyph, NoGlyph, NoGlyph, NoGlyph}}
}

// Cells are the board coordinates of the piece's four cells.
func (p Piece) Cells() [4][2]int {
	s := shapes[p.Type]
	var out [4][2]int
	for i, c := range s.cells {
		x, y := c[0], c[1]
		for r := 0; r < ((p.Rot%4)+4)%4; r++ {
			x, y = s.size-1-y, x
		}
		out[i] = [2]int{p.X + x, p.Y + y}
	}
	return out
}

// HasGlyphs reports whether any cell carries a glyph.
func (p Piece) HasGlyphs() bool {
	for _, g := range p.Glyphs {
		if g != NoGlyph && g != 0 {
			return true
		}
	}
	return false
}

// Board is a grid of cells, row 0 at the top. Rows include hidden rows.
type Board struct {
	Cols, Rows, Hidden int
	Cells              []byte
	Glyphs             []byte
}

// NewBoard returns an empty board.
func NewBoard(cols, rows, hidden int) *Board {
	n := cols * (rows + hidden)
	b := &Board{Cols: cols, Rows: rows + hidden, Hidden: hidden, Cells: make([]byte, n), Glyphs: make([]byte, n)}
	for i := range b.Cells {
		b.Cells[i], b.Glyphs[i] = Empty, NoGlyph
	}
	return b
}

// At returns the cell at x, y ('#' outside the side and bottom walls).
func (b *Board) At(x, y int) byte {
	if x < 0 || x >= b.Cols || y >= b.Rows {
		return Base
	}
	if y < 0 {
		return Base
	}
	return b.Cells[y*b.Cols+x]
}

// Set writes a cell and its glyph.
func (b *Board) Set(x, y int, c, g byte) {
	if x < 0 || x >= b.Cols || y < 0 || y >= b.Rows {
		return
	}
	b.Cells[y*b.Cols+x], b.Glyphs[y*b.Cols+x] = c, g
}

// Fits reports whether p overlaps no wall or filled cell.
func (b *Board) Fits(p Piece) bool {
	for _, c := range p.Cells() {
		if b.At(c[0], c[1]) != Empty {
			return false
		}
	}
	return true
}

// Spawn places a new piece of type t centred at the top; ok is false when
// it does not fit (top-out).
func (b *Board) Spawn(p Piece) (Piece, bool) {
	s := shapes[p.Type]
	p.Rot, p.X, p.Y = 0, (b.Cols-s.size)/2, 0
	if p.Type == 'O' {
		p.X = (b.Cols - 2) / 2
	}
	return p, b.Fits(p)
}

// Rotate turns p by dir (+1 clockwise, -1 counter-clockwise) trying the
// simple kicks: x offsets 0,-1,+1,-2,+2, then the same one row up.
func (b *Board) Rotate(p Piece, dir int) (Piece, bool) {
	q := p
	q.Rot = ((p.Rot+dir)%4 + 4) % 4
	for _, dy := range []int{0, -1} {
		for _, dx := range Kicks {
			t := q
			t.X, t.Y = q.X+dx, q.Y+dy
			if b.Fits(t) {
				return t, true
			}
		}
	}
	return p, false
}

// Move shifts p by dx, dy when the target fits.
func (b *Board) Move(p Piece, dx, dy int) (Piece, bool) {
	q := p
	q.X, q.Y = p.X+dx, p.Y+dy
	if !b.Fits(q) {
		return p, false
	}
	return q, true
}

// Drop returns p moved down as far as it fits (ghost / hard drop) and the rows fallen.
func (b *Board) Drop(p Piece) (Piece, int) {
	n := 0
	for {
		q, ok := b.Move(p, 0, 1)
		if !ok {
			return p, n
		}
		p = q
		n++
	}
}

// Grounded reports whether p cannot fall further.
func (b *Board) Grounded(p Piece) bool {
	_, ok := b.Move(p, 0, 1)
	return !ok
}

// Place writes p into the board.
func (b *Board) Place(p Piece) {
	for i, c := range p.Cells() {
		g := p.Glyphs[i]
		if g == 0 {
			g = NoGlyph
		}
		b.Set(c[0], c[1], p.Type, g)
	}
}

// RowFull reports whether row y has no empty cell.
func (b *Board) RowFull(y int) bool {
	for x := 0; x < b.Cols; x++ {
		if b.Cells[y*b.Cols+x] == Empty {
			return false
		}
	}
	return true
}

// RowEmpty reports whether row y has no filled cell.
func (b *Board) RowEmpty(y int) bool {
	for x := 0; x < b.Cols; x++ {
		if b.Cells[y*b.Cols+x] != Empty {
			return false
		}
	}
	return true
}

// RemoveRows deletes the given rows and drops everything above them.
func (b *Board) RemoveRows(rows []int) {
	if len(rows) == 0 {
		return
	}
	drop := map[int]bool{}
	for _, y := range rows {
		drop[y] = true
	}
	cells, glyphs := make([]byte, len(b.Cells)), make([]byte, len(b.Glyphs))
	for i := range cells {
		cells[i], glyphs[i] = Empty, NoGlyph
	}
	dst := b.Rows - 1
	for y := b.Rows - 1; y >= 0; y-- {
		if drop[y] {
			continue
		}
		copy(cells[dst*b.Cols:(dst+1)*b.Cols], b.Cells[y*b.Cols:(y+1)*b.Cols])
		copy(glyphs[dst*b.Cols:(dst+1)*b.Cols], b.Glyphs[y*b.Cols:(y+1)*b.Cols])
		dst--
	}
	b.Cells, b.Glyphs = cells, glyphs
}

// FullRows lists the full rows, top to bottom.
func (b *Board) FullRows() []int {
	var out []int
	for y := 0; y < b.Rows; y++ {
		if b.RowFull(y) {
			out = append(out, y)
		}
	}
	return out
}

// ClearLines removes every full row and returns how many were cleared.
func (b *Board) ClearLines() int {
	rows := b.FullRows()
	b.RemoveRows(rows)
	return len(rows)
}

// InsertGarbage pushes the stack up by n rows and fills the bottom with
// garbage rows sharing one hole column. overflow is true when filled cells
// were pushed off the top.
func (b *Board) InsertGarbage(n, hole int) (overflow bool) {
	if n <= 0 {
		return false
	}
	n = min(n, b.Rows)
	for y := 0; y < n; y++ {
		overflow = overflow || !b.RowEmpty(y)
	}
	copy(b.Cells, b.Cells[n*b.Cols:])
	copy(b.Glyphs, b.Glyphs[n*b.Cols:])
	for y := b.Rows - n; y < b.Rows; y++ {
		for x := 0; x < b.Cols; x++ {
			c := byte(Garbage)
			if x == hole {
				c = Empty
			}
			b.Set(x, y, c, NoGlyph)
		}
	}
	return overflow
}

// Visible returns the visible cells (hidden rows cut) as a string;
// piece, when non-nil, is merged in.
func (b *Board) Visible(piece *Piece) string {
	cells := append([]byte(nil), b.Cells[b.Hidden*b.Cols:]...)
	if piece != nil {
		for _, c := range piece.Cells() {
			y := c[1] - b.Hidden
			if y >= 0 && y < b.Rows-b.Hidden && c[0] >= 0 && c[0] < b.Cols {
				cells[y*b.Cols+c[0]] = piece.Type
			}
		}
	}
	return string(cells)
}

// VisibleGlyphs returns the visible glyphs as a string; piece is merged in.
func (b *Board) VisibleGlyphs(piece *Piece) string {
	glyphs := append([]byte(nil), b.Glyphs[b.Hidden*b.Cols:]...)
	if piece != nil {
		for i, c := range piece.Cells() {
			y := c[1] - b.Hidden
			if y >= 0 && y < b.Rows-b.Hidden && c[0] >= 0 && c[0] < b.Cols {
				glyphs[y*b.Cols+c[0]] = piece.Glyphs[i]
			}
		}
	}
	return string(glyphs)
}

// Load fills the bottom rows from cell strings (tests and fixtures).
func (b *Board) Load(rows ...string) {
	start := b.Rows - len(rows)
	for i, row := range rows {
		for x := 0; x < b.Cols && x < len(row); x++ {
			b.Set(x, start+i, row[x], NoGlyph)
		}
	}
}

// LoadGlyphs fills the bottom rows from glyph strings: '.' is empty, any
// other character is a glyph on a 'T' cell (tests and fixtures).
func (b *Board) LoadGlyphs(rows ...string) {
	start := b.Rows - len(rows)
	for i, row := range rows {
		for x := 0; x < b.Cols && x < len(row); x++ {
			if row[x] == Empty {
				b.Set(x, start+i, Empty, NoGlyph)
				continue
			}
			b.Set(x, start+i, 'T', row[x])
		}
	}
}

// Row returns the cells of row y counted from the bottom (0 = bottom) (tests).
func (b *Board) Row(fromBottom int) string {
	y := b.Rows - 1 - fromBottom
	return string(b.Cells[y*b.Cols : (y+1)*b.Cols])
}

// IsPiece reports whether c is a tetromino colour.
func IsPiece(c byte) bool { return strings.IndexByte(PieceTypes, c) >= 0 }

// GarbageFor is the garbage sent for clearing n lines at once.
func GarbageFor(n int) int {
	switch {
	case n <= 1:
		return 0
	case n == 2:
		return 1
	case n == 3:
		return 2
	}
	return 4
}

// Bag is the 7-bag randomizer.
type Bag struct {
	rng  *rand.Rand
	next []byte
}

// NewBag returns a bag drawing from rng.
func NewBag(rng *rand.Rand) *Bag { return &Bag{rng: rng} }

// Next draws the next piece type.
func (g *Bag) Next() byte {
	if len(g.next) == 0 {
		g.next = []byte(PieceTypes)
		g.rng.Shuffle(len(g.next), func(i, j int) { g.next[i], g.next[j] = g.next[j], g.next[i] })
	}
	t := g.next[0]
	g.next = g.next[1:]
	return t
}
