package crossword

import (
	"math/rand/v2"
	"sort"
)

// Direction of a word on the grid.
const (
	Across = "across"
	Down   = "down"
)

// Word is a placed answer.
type Word struct {
	Number int
	Dir    string
	Row    int
	Col    int
	Answer string
	ClueID string
	ClueEN string
	Key    string
}

// Cells covered by the word.
func (w Word) Cells() [][2]int {
	out := make([][2]int, len(w.Answer))
	for i := range w.Answer {
		if w.Dir == Across {
			out[i] = [2]int{w.Row, w.Col + i}
		} else {
			out[i] = [2]int{w.Row + i, w.Col}
		}
	}
	return out
}

// Puzzle is a generated crossword: Rows x Cols grid, letters by cell, words.
type Puzzle struct {
	Rows    int
	Cols    int
	Letters [][]byte
	Words   []Word
}

// Level describes the size and source of a puzzle.
type Level struct {
	Number int
	Size   int
	Words  int
}

// Levels: higher levels have more squares, more words and harder clues.
var Levels = []Level{
	{Number: 1, Size: 9, Words: 5},
	{Number: 2, Size: 11, Words: 7},
	{Number: 3, Size: 13, Words: 9},
	{Number: 4, Size: 15, Words: 11},
}

// FindLevel returns a level by number.
func FindLevel(n int) (Level, bool) {
	for _, l := range Levels {
		if l.Number == n {
			return l, true
		}
	}
	return Level{}, false
}

type placement struct {
	row, col int
	dir      string
}

type grid struct {
	size  int
	cells [][]byte
	words []Word
}

func newGrid(size int) *grid {
	cells := make([][]byte, size)
	for i := range cells {
		cells[i] = make([]byte, size)
	}
	return &grid{size: size, cells: cells}
}

func (g *grid) at(r, c int) byte {
	if r < 0 || c < 0 || r >= g.size || c >= g.size {
		return 0
	}
	return g.cells[r][c]
}

// fits returns how many letters a placement shares with existing words, or
// -1 when it is illegal (out of bounds, conflicts, or touches other words
// side by side).
func (g *grid) fits(word string, p placement) int {
	dr, dc := 0, 1
	if p.dir == Down {
		dr, dc = 1, 0
	}
	n := len(word)
	endR, endC := p.row+dr*(n-1), p.col+dc*(n-1)
	if p.row < 0 || p.col < 0 || endR >= g.size || endC >= g.size {
		return -1
	}
	if g.at(p.row-dr, p.col-dc) != 0 || g.at(endR+dr, endC+dc) != 0 {
		return -1
	}
	shared := 0
	for i := 0; i < n; i++ {
		r, c := p.row+dr*i, p.col+dc*i
		cur := g.cells[r][c]
		if cur != 0 {
			if cur != word[i] {
				return -1
			}
			shared++
			continue
		}
		if g.at(r+dc, c+dr) != 0 || g.at(r-dc, c-dr) != 0 {
			return -1
		}
	}
	if shared == n {
		return -1
	}
	return shared
}

func (g *grid) place(e Entry, p placement) {
	dr, dc := 0, 1
	if p.dir == Down {
		dr, dc = 1, 0
	}
	for i := 0; i < len(e.Answer); i++ {
		g.cells[p.row+dr*i][p.col+dc*i] = e.Answer[i]
	}
	g.words = append(g.words, Word{Dir: p.dir, Row: p.row, Col: p.col, Answer: e.Answer, ClueID: e.ClueID, ClueEN: e.ClueEN, Key: e.Key})
}

// candidates lists legal crossing placements for word, best first.
func (g *grid) candidates(word string, rng *rand.Rand) []placement {
	type scored struct {
		p     placement
		score int
	}
	var list []scored
	seen := map[placement]bool{}
	for r := 0; r < g.size; r++ {
		for c := 0; c < g.size; c++ {
			letter := g.cells[r][c]
			if letter == 0 {
				continue
			}
			for i := 0; i < len(word); i++ {
				if word[i] != letter {
					continue
				}
				for _, p := range []placement{{r, c - i, Across}, {r - i, c, Down}} {
					if seen[p] {
						continue
					}
					seen[p] = true
					if s := g.fits(word, p); s > 0 {
						list = append(list, scored{p, s*10 + rng.IntN(10)})
					}
				}
			}
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].score > list[b].score })
	out := make([]placement, len(list))
	for i, s := range list {
		out[i] = s.p
	}
	return out
}

// build tries one random layout and returns the grid.
func build(entries []Entry, level Level, rng *rand.Rand) *grid {
	pool := append([]Entry(nil), entries...)
	rng.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	sort.SliceStable(pool, func(i, j int) bool { return len(pool[i].Answer) > len(pool[j].Answer) })
	g := newGrid(level.Size)
	var first int
	for first = range pool {
		if len(pool[first].Answer) <= level.Size {
			break
		}
	}
	e := pool[first]
	dir := Across
	if rng.IntN(2) == 0 {
		dir = Down
	}
	start := (level.Size - len(e.Answer)) / 2
	mid := level.Size / 2
	if dir == Across {
		g.place(e, placement{mid, start, Across})
	} else {
		g.place(e, placement{start, mid, Down})
	}
	rest := append(pool[:first:first], pool[first+1:]...)
	for pass := 0; pass < 2 && len(g.words) < level.Words; pass++ {
		next := rest[:0:0]
		for _, e := range rest {
			if len(g.words) >= level.Words {
				break
			}
			if len(e.Answer) > level.Size {
				continue
			}
			if c := g.candidates(e.Answer, rng); len(c) > 0 {
				g.place(e, c[0])
			} else {
				next = append(next, e)
			}
		}
		rest = next
	}
	return g
}

// Generate builds a puzzle for a level from its bank. It tries several random
// layouts and keeps the one with the most words.
func Generate(level Level, rng *rand.Rand) Puzzle {
	return GenerateFrom(Entries(level.Number), level, rng)
}

// GenerateFrom builds a puzzle from the given entries.
func GenerateFrom(entries []Entry, level Level, rng *rand.Rand) Puzzle {
	var best *grid
	for try := 0; try < 40; try++ {
		g := build(entries, level, rng)
		if best == nil || len(g.words) > len(best.words) {
			best = g
		}
		if len(best.words) >= level.Words {
			break
		}
	}
	return best.puzzle()
}

// puzzle crops the grid to its used area and numbers the words.
func (g *grid) puzzle() Puzzle {
	minR, minC, maxR, maxC := g.size, g.size, -1, -1
	for r := 0; r < g.size; r++ {
		for c := 0; c < g.size; c++ {
			if g.cells[r][c] != 0 {
				minR, minC = min(minR, r), min(minC, c)
				maxR, maxC = max(maxR, r), max(maxC, c)
			}
		}
	}
	p := Puzzle{Rows: maxR - minR + 1, Cols: maxC - minC + 1}
	p.Letters = make([][]byte, p.Rows)
	for r := range p.Letters {
		p.Letters[r] = append([]byte(nil), g.cells[minR+r][minC:maxC+1]...)
	}
	words := append([]Word(nil), g.words...)
	for i := range words {
		words[i].Row -= minR
		words[i].Col -= minC
	}
	sort.SliceStable(words, func(a, b int) bool {
		if words[a].Row != words[b].Row {
			return words[a].Row < words[b].Row
		}
		return words[a].Col < words[b].Col
	})
	numbers := map[[2]int]int{}
	next := 1
	for i := range words {
		key := [2]int{words[i].Row, words[i].Col}
		if n, ok := numbers[key]; ok {
			words[i].Number = n
			continue
		}
		numbers[key] = next
		words[i].Number = next
		next++
	}
	p.Words = words
	return p
}
