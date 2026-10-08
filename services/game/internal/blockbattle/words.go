package blockbattle

import (
	"math/rand/v2"
	"strconv"
	"strings"
)

// WordsID and WordsEN are the bundled kid friendly dictionaries (3-5
// letters, uppercase). Targets are drawn from their 3-4 letter words; the
// row scan accepts any of them.
var WordsID = strings.Fields(`
IBU AYAH ADIK KAKAK BUKU BOLA MATA KAKI MEJA KURSI PENA TAS BAJU TOPI SUSU NASI ROTI KUE MADU GULA
GARAM AIR API ANGIN AWAN BULAN LAUT SAPI KUDA AYAM BEBEK IKAN RUSA ULAR GAJAH SINGA DOMBA TIKUS SEMUT
LEBAH KUPU KATAK PADI JERUK APEL NANAS SALAK TOMAT BAYAM KOTA DESA JALAN PASAR KAPAL MOBIL BUS GURU
KELAS LARI MAIN TARI LAGU SENI PAGI SORE MALAM HARI TAHUN JAM DUA TIGA LIMA ENAM SATU MERAH HIJAU BIRU
UNGU PUTIH HITAM SUKA BAIK BARU BESAR KECIL PANAS BUAH POHON DAUN BUNGA TANAH BATU PASIR EMAS RAJA RATU
TEMAN KITA KAMU AKU RUMAH SAWAH KEBUN HUJAN
`)

var WordsEN = strings.Fields(`
CAT DOG SUN MOON STAR TREE BOOK BALL FISH BIRD COW PIG HEN DUCK FROG BEE ANT LION BEAR WOLF DEER GOAT
HORSE MOUSE APPLE PEAR LIME RICE MILK CAKE BREAD WATER FIRE WIND RAIN SNOW CLOUD SEA LAKE HILL ROAD CAR
BUS SHIP BOAT TRAIN BIKE HOME HOUSE DOOR BED DESK PEN CUP HAT SHOE SOCK COAT RED BLUE PINK GOLD KING
QUEEN FARM PLAY SING READ JUMP RUN SWIM HAPPY SMILE FUN EGG LEAF ROSE SAND ROCK HAND FOOT EYE EAR NOSE
`)

var dictionaries = map[string]map[string]bool{
	ContentWordsID: setOf(WordsID),
	ContentWordsEN: setOf(WordsEN),
}

func setOf(words []string) map[string]bool {
	out := map[string]bool{}
	for _, w := range words {
		if l := len(w); l >= 3 && l <= 5 {
			out[w] = true
		}
	}
	return out
}

// Targets are the 3-4 letter words of a content (word targets).
func Targets(content string) []string {
	list := WordsID
	if content == ContentWordsEN {
		list = WordsEN
	}
	out := make([]string, 0, len(list))
	for _, w := range list {
		if l := len(w); l >= 3 && l <= 4 {
			out = append(out, w)
		}
	}
	return out
}

// Match is a row that exploded.
type Match struct {
	Row  int
	Text string
}

// runs splits a glyph row into maximal runs of contiguous glyph cells.
func runs(row []byte) []string {
	var out []string
	start := -1
	for x := 0; x <= len(row); x++ {
		has := x < len(row) && row[x] != NoGlyph && row[x] != 0
		if has && start < 0 {
			start = x
		}
		if !has && start >= 0 {
			out = append(out, string(row[start:x]))
			start = -1
		}
	}
	return out
}

// FindWord returns the longest dictionary word inside a contiguous run.
func FindWord(row []byte, dict map[string]bool) string {
	best := ""
	for _, run := range runs(row) {
		for i := 0; i < len(run); i++ {
			for l := 5; l >= 3; l-- {
				if i+l <= len(run) && l > len(best) && dict[run[i:i+l]] {
					best = run[i : i+l]
				}
			}
		}
	}
	return best
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }
func isOp(c byte) bool    { return c == '+' || c == '-' || c == 'x' }

func apply(a int, op byte, b int) int {
	switch op {
	case '+':
		return a + b
	case '-':
		return a - b
	}
	return a * b
}

// Eval evaluates "d op d" or "d op d op d" left to right.
func Eval(expr string) (int, bool) {
	if len(expr) != 3 && len(expr) != 5 {
		return 0, false
	}
	for i := 0; i < len(expr); i++ {
		if (i%2 == 0 && !isDigit(expr[i])) || (i%2 == 1 && !isOp(expr[i])) {
			return 0, false
		}
	}
	v := int(expr[0] - '0')
	for i := 1; i < len(expr); i += 2 {
		v = apply(v, expr[i], int(expr[i+1]-'0'))
	}
	return v, true
}

// FindExpr returns the longest expression inside a contiguous run that
// equals target.
func FindExpr(row []byte, target int) string {
	best := ""
	for _, run := range runs(row) {
		for i := 0; i < len(run); i++ {
			for _, l := range []int{5, 3} {
				if i+l > len(run) || l <= len(best) {
					continue
				}
				if v, ok := Eval(run[i : i+l]); ok && v == target {
					best = run[i : i+l]
				}
			}
		}
	}
	return best
}

// Scan checks every row of b for a word (WORDS_*) or an expression equal to
// target (MATH) and returns the matching rows, top to bottom.
func Scan(b *Board, content string, target int) []Match {
	var out []Match
	dict := dictionaries[content]
	for y := 0; y < b.Rows; y++ {
		row := b.Glyphs[y*b.Cols : (y+1)*b.Cols]
		text := ""
		if content == ContentMath {
			text = FindExpr(row, target)
		} else {
			text = FindWord(row, dict)
		}
		if text != "" {
			out = append(out, Match{Row: y, Text: text})
		}
	}
	return out
}

// Glyphs draws the glyphs of WORDS pieces: mostly the current target's
// characters in order, with filler letters (or digits and operators).
type Glyphs struct {
	Content string
	Word    string // word target (WORDS_*)
	Number  int    // math target (MATH)
	Expr    string // expression the math glyphs spell (e.g. "4+5")

	rng    *rand.Rand
	cursor int
}

// NewGlyphs returns a glyph source with a fresh target.
func NewGlyphs(content string, rng *rand.Rand) *Glyphs {
	g := &Glyphs{Content: content, rng: rng}
	g.NewTarget()
	return g
}

// NewTarget draws the next target.
func (g *Glyphs) NewTarget() {
	g.cursor = 0
	if g.Content == ContentMath {
		g.Number = 2 + g.rng.IntN(17)
		g.Expr = MathFor(g.Number, g.rng)
		return
	}
	list := Targets(g.Content)
	prev := g.Word
	for i := 0; i < 4 && (g.Word == prev); i++ {
		g.Word = list[g.rng.IntN(len(list))]
	}
}

// MathFor is a "d op d" expression equal to target (2..18).
func MathFor(target int, rng *rand.Rand) string {
	var pairs []string
	for a := 1; a <= 9; a++ {
		if b := target - a; b >= 1 && b <= 9 {
			pairs = append(pairs, strconv.Itoa(a)+"+"+strconv.Itoa(b))
		}
		if target%a == 0 && target/a >= 2 && target/a <= 9 && a >= 2 {
			pairs = append(pairs, strconv.Itoa(a)+"x"+strconv.Itoa(target/a))
		}
	}
	if len(pairs) == 0 {
		return "1+1"
	}
	return pairs[rng.IntN(len(pairs))]
}

// Text is the target shown to the player.
func (g *Glyphs) Text() string {
	if g.Content == ContentMath {
		return strconv.Itoa(g.Number)
	}
	return g.Word
}

// Kind is "math" or "word".
func (g *Glyphs) Kind() string {
	if g.Content == ContentMath {
		return "math"
	}
	return "word"
}

func (g *Glyphs) spell() string {
	if g.Content == ContentMath {
		return g.Expr
	}
	return g.Word
}

func (g *Glyphs) filler() byte {
	if g.Content == ContentMath {
		const pool = "123456789123456789+-x+"
		return pool[g.rng.IntN(len(pool))]
	}
	const pool = "AAEEIIOOUURSTNKMLBPDG"
	return pool[g.rng.IntN(len(pool))]
}

// Next returns four glyphs for a regular piece: about two thirds come from
// the target in order, the rest are filler.
func (g *Glyphs) Next() [4]byte {
	var out [4]byte
	s := g.spell()
	for i := range out {
		if g.rng.IntN(3) < 2 {
			out[i] = s[g.cursor%len(s)]
			g.cursor++
		} else {
			out[i] = g.filler()
		}
	}
	return out
}

// TargetPiece is the I piece a correct WORDS answer grants: the target
// spelled left to right (a word is padded with a blank cell, an
// expression with one filler glyph).
func (g *Glyphs) TargetPiece() Piece {
	p := NewPiece('I')
	s := g.spell()
	for i := 0; i < 4; i++ {
		switch {
		case i < len(s):
			p.Glyphs[i] = s[i]
		case g.Content == ContentMath:
			p.Glyphs[i] = g.filler()
		}
	}
	return p
}
