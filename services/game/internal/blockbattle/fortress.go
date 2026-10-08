package blockbattle

import "math/rand/v2"

// Fortress is the shared FORTRESS wall: rows never clear, a row that
// becomes full is armored (its cells take two hits) and fires the cannon.
type Fortress struct {
	Board   *Board
	Armored map[int]bool
	// Hits counts the hits an armored cell already took (index into Cells).
	Hits      map[int]int
	MonsterHP int
}

// FortressBaseRows is how many base rows the wall starts with.
const FortressBaseRows = 3

// NewFortress builds the wall with three base rows that have random holes.
func NewFortress(rng *rand.Rand) *Fortress {
	f := &Fortress{Board: NewBoard(FortCols, FortRows, 0), Armored: map[int]bool{}, Hits: map[int]int{}, MonsterHP: MonsterHP}
	for y := FortRows - FortressBaseRows; y < FortRows; y++ {
		holes := 1 + rng.IntN(2)
		skip := map[int]bool{}
		for len(skip) < holes {
			skip[rng.IntN(FortCols)] = true
		}
		for x := 0; x < FortCols; x++ {
			if !skip[x] {
				f.Board.Set(x, y, Base, NoGlyph)
			}
		}
	}
	return f
}

// Place locks a patch piece into the wall and returns the newly armored
// rows; each one fires the cannon (monster -CannonDamage).
func (f *Fortress) Place(p Piece) []int {
	f.Board.Place(p)
	var fresh []int
	for y := 0; y < f.Board.Rows; y++ {
		if !f.Armored[y] && f.Board.RowFull(y) {
			f.Armored[y] = true
			fresh = append(fresh, y)
			f.MonsterHP = max(0, f.MonsterHP-CannonDamage)
		}
	}
	return fresh
}

// Hit is the monster striking column col: it destroys the top n filled
// cells of that column (armored cells need two hits) and reports how many
// cells were destroyed.
func (f *Fortress) Hit(col, n int) int {
	destroyed := 0
	b := f.Board
	for n > 0 {
		top := -1
		for y := 0; y < b.Rows; y++ {
			if b.At(col, y) != Empty {
				top = y
				break
			}
		}
		if top < 0 {
			break
		}
		n--
		i := top*b.Cols + col
		if f.Armored[top] && f.Hits[i] == 0 {
			f.Hits[i] = 1
			continue
		}
		delete(f.Hits, i)
		b.Set(col, top, Empty, NoGlyph)
		destroyed++
		if f.Armored[top] && !b.RowFull(top) {
			f.Armored[top] = false
			for x := 0; x < b.Cols; x++ {
				delete(f.Hits, top*b.Cols+x)
			}
		}
	}
	return destroyed
}

// Filled counts the filled cells.
func (f *Fortress) Filled() int {
	n := 0
	for _, c := range f.Board.Cells {
		if c != Empty {
			n++
		}
	}
	return n
}

// Holes counts empty cells under a filled cell in the same column.
func (f *Fortress) Holes() int {
	b, n := f.Board, 0
	for x := 0; x < b.Cols; x++ {
		roof := false
		for y := 0; y < b.Rows; y++ {
			if b.At(x, y) != Empty {
				roof = true
			} else if roof {
				n++
			}
		}
	}
	return n
}

// ArmoredRows lists the armored rows, top to bottom.
func (f *Fortress) ArmoredRows() []int {
	out := []int{}
	for y := 0; y < f.Board.Rows; y++ {
		if f.Armored[y] {
			out = append(out, y)
		}
	}
	return out
}

// Strength = filled cells + 3 x armored rows - holes.
func (f *Fortress) Strength() int {
	return f.Filled() + 3*len(f.ArmoredRows()) - f.Holes()
}

// MaxStrength is the strength of a completely filled, armored wall.
func MaxStrength() int { return FortCols*FortRows + 3*FortRows }

// Broken reports the wall lost: strength <= 0 or no filled cells.
func (f *Fortress) Broken() bool { return f.Filled() == 0 || f.Strength() <= 0 }

// Defeated reports the monster is down.
func (f *Fortress) Defeated() bool { return f.MonsterHP <= 0 }
