package blockbattle

import (
	"math/rand/v2"
	"testing"
	"time"
)

func testRng() *rand.Rand { return rand.New(rand.NewPCG(1, 2)) }

func newTestField(content string) *Field {
	f := NewField(FieldConfig{Cols: Cols, Rows: Rows, Hidden: Hidden, Gravity: time.Second, LockDelay: 500 * time.Millisecond, Content: content}, testRng())
	f.Start(time.Now())
	return f
}

func TestBagDealsEverySevenPieces(t *testing.T) {
	bag := NewBag(testRng())
	for round := 0; round < 3; round++ {
		seen := map[byte]bool{}
		for i := 0; i < 7; i++ {
			seen[bag.Next()] = true
		}
		if len(seen) != 7 {
			t.Fatalf("round %d dealt %v", round, seen)
		}
	}
}

func TestRotationCyclesAndKicksOffTheWall(t *testing.T) {
	b := NewBoard(Cols, Rows, Hidden)
	p, ok := b.Spawn(NewPiece('T'))
	if !ok {
		t.Fatal("spawn")
	}
	start := p.Cells()
	q := p
	for i := 0; i < 4; i++ {
		q, ok = b.Rotate(q, 1)
		if !ok {
			t.Fatalf("rotate %d", i)
		}
	}
	if q.Cells() != start {
		t.Fatalf("four turns should return home: %v vs %v", q.Cells(), start)
	}
	// A vertical I against the left wall needs the +2 kick to turn flat.
	i := NewPiece('I')
	i.Rot, i.X, i.Y = 1, -2, 5
	if !b.Fits(i) {
		t.Fatal("vertical I at the wall should fit")
	}
	for _, c := range i.Cells() {
		if c[0] != 0 {
			t.Fatalf("vertical I not in column 0: %v", i.Cells())
		}
	}
	r, ok := b.Rotate(i, 1)
	if !ok || r.X != 0 {
		t.Fatalf("kick: ok=%v x=%d", ok, r.X)
	}
	// Counter-clockwise undoes clockwise.
	back, _ := b.Rotate(r, -1)
	if back.Rot != 1 {
		t.Fatalf("ccw rot %d", back.Rot)
	}
	// Fully boxed in: rotation fails and the piece stays.
	boxed := NewBoard(4, 4, 0)
	boxed.Load("####", "....", "####", "####")
	flat := NewPiece('I')
	flat.Y = 0 // row 1 holds the I
	if !boxed.Fits(flat) {
		t.Fatal("flat I fits its tunnel")
	}
	if _, ok := boxed.Rotate(flat, 1); ok {
		t.Fatal("boxed rotation should fail")
	}
}

func TestGarbageTable(t *testing.T) {
	want := map[int]int{0: 0, 1: 0, 2: 1, 3: 2, 4: 4}
	for n, g := range want {
		if got := GarbageFor(n); got != g {
			t.Errorf("GarbageFor(%d) = %d, want %d", n, got, g)
		}
	}
}

// fillBottom loads n bottom rows full except column hole.
func fillBottom(b *Board, n, hole int) {
	rows := make([]string, n)
	for i := range rows {
		row := []byte("GGGGGGGGGG")
		row[hole] = Empty
		rows[i] = string(row)
	}
	b.Load(rows...)
}

func verticalI(col int) *Piece {
	p := NewPiece('I')
	p.Rot, p.X, p.Y = 1, col-2, 0
	return &p
}

func TestTetrisClearsFourAndSendsFour(t *testing.T) {
	f := newTestField("")
	fillBottom(f.Board, 4, 9)
	f.Piece = verticalI(9)
	_, res := f.Input(ActHard, time.Now())
	if res == nil || res.Cleared != 4 || res.Send != 4 || f.Lines != 4 {
		t.Fatalf("tetris: %+v lines %d", res, f.Lines)
	}
	for y := 0; y < f.Board.Rows; y++ {
		if !f.Board.RowEmpty(y) {
			t.Fatalf("row %d left after tetris", y)
		}
	}
	// Two lines send one.
	f2 := newTestField("")
	fillBottom(f2.Board, 2, 9)
	f2.Piece = verticalI(9)
	_, res = f2.Input(ActHard, time.Now())
	if res.Cleared != 2 || res.Send != 1 {
		t.Fatalf("double: %+v", res)
	}
}

func TestGarbageHoleAndPendingCancel(t *testing.T) {
	b := NewBoard(Cols, Rows, Hidden)
	b.InsertGarbage(2, 4)
	for i := 0; i < 2; i++ {
		row := b.Row(i)
		if row != "GGGG.GGGGG" {
			t.Fatalf("garbage row %d = %q", i, row)
		}
	}
	f := newTestField("")
	f.AddGarbage(3, 7)
	if f.PendingLines() != 3 {
		t.Fatalf("pending %d", f.PendingLines())
	}
	fillBottom(f.Board, 2, 9)
	f.Piece = verticalI(9)
	_, res := f.Input(ActHard, time.Now())
	if res.Cleared != 2 || res.Cancelled != 2 || res.Send != 0 || res.Inserted != 1 {
		t.Fatalf("cancel: %+v", res)
	}
	if f.PendingLines() != 0 {
		t.Fatalf("pending after insert %d", f.PendingLines())
	}
	holes := 0
	for _, c := range []byte(f.Board.Row(0)) {
		if c == Empty {
			holes++
		} else if c != Garbage {
			t.Fatalf("bottom row %q", f.Board.Row(0))
		}
	}
	if holes != 1 {
		t.Fatalf("garbage row needs one hole: %q", f.Board.Row(0))
	}
	// Pending garbage rises when a piece locks without clearing.
	g := newTestField("")
	g.Pending = []Attack{{Lines: 2, Hole: 0}}
	g.Input(ActHard, time.Now())
	if g.Board.Row(0) != ".GGGGGGGGG" || g.Board.Row(1) != ".GGGGGGGGG" {
		t.Fatalf("garbage not inserted: %q %q", g.Board.Row(0), g.Board.Row(1))
	}
}

func TestTopOutKnocksOut(t *testing.T) {
	f := newTestField("")
	b := f.Board
	for y := 2; y < b.Rows; y++ {
		for x := 0; x < 9; x++ {
			b.Set(x, y, Garbage, NoGlyph)
		}
	}
	for x := 2; x < 8; x++ {
		b.Set(x, 1, Garbage, NoGlyph)
	}
	o := NewPiece('O')
	f.Piece = &o
	_, res := f.Input(ActHard, time.Now())
	if res == nil || !res.ToppedOut || f.Alive || f.Piece != nil {
		t.Fatalf("top out: %+v alive %v", res, f.Alive)
	}
	if ok, _ := f.Input(ActLeft, time.Now()); ok {
		t.Fatal("knocked out board accepts input")
	}
}

func TestGravityAndLockDelay(t *testing.T) {
	now := time.Now()
	f := NewField(FieldConfig{Cols: Cols, Rows: Rows, Hidden: Hidden, Gravity: 100 * time.Millisecond, LockDelay: 50 * time.Millisecond}, testRng())
	f.Start(now)
	y := f.Piece.Y
	f.Step(now.Add(100 * time.Millisecond))
	if f.Piece.Y != y+1 {
		t.Fatalf("gravity: y %d -> %d", y, f.Piece.Y)
	}
	// Fall to the floor, then lock after the delay.
	at := now.Add(200 * time.Millisecond)
	var locked *LockResult
	for i := 0; i < 400 && locked == nil; i++ {
		at = at.Add(20 * time.Millisecond)
		_, locked = f.Step(at)
	}
	if locked == nil {
		t.Fatal("piece never locked")
	}
}

func TestPenaltyDoublesGravityAndExpires(t *testing.T) {
	now := time.Now()
	f := newTestField("")
	f.Penalize(now, 5*time.Second)
	if g := f.Gravity(now); g != 500*time.Millisecond {
		t.Fatalf("penalty gravity %v", g)
	}
	fx, ms := f.Effects(now)
	if len(fx) != 1 || fx[0] != FxPenalty || ms[FxPenalty] <= 0 {
		t.Fatalf("fx %v %v", fx, ms)
	}
	if g := f.Gravity(now.Add(6 * time.Second)); g != time.Second {
		t.Fatalf("penalty did not expire: %v", g)
	}
	if fx, _ := f.Effects(now.Add(6 * time.Second)); len(fx) != 0 {
		t.Fatalf("fx after expiry %v", fx)
	}
	f.Expose(now, time.Second)
	if !f.Exposed(now) || f.Exposed(now.Add(2*time.Second)) {
		t.Fatal("exposed window")
	}
}

func TestInputRateLimit(t *testing.T) {
	now := time.Now()
	l := Limiter{Max: MaxInputs, Window: time.Second}
	n := 0
	for i := 0; i < 50; i++ {
		if l.Allow(now) {
			n++
		}
	}
	if n != MaxInputs {
		t.Fatalf("allowed %d", n)
	}
	if !l.Allow(now.Add(time.Second)) {
		t.Fatal("window should reset")
	}
	f := newTestField("")
	moved := 0
	for i := 0; i < 50; i++ {
		if ok, _ := f.Input(ActRotate, now); ok {
			moved++
		}
	}
	if moved > MaxInputs || moved == 0 {
		t.Fatalf("field moved %d times", moved)
	}
	if ok, _ := f.Input("jump", now.Add(2*time.Second)); ok || ValidAction("jump") {
		t.Fatal("unknown action accepted")
	}
}

func TestSetNextMakesNextPieceI(t *testing.T) {
	f := newTestField("")
	f.SetNext(NewPiece('I'))
	f.Input(ActHard, time.Now())
	if f.Piece == nil || f.Piece.Type != 'I' {
		t.Fatalf("next piece %v", f.Piece)
	}
}

func TestWordDetection(t *testing.T) {
	if w := FindWord([]byte(" XBUKU    "), dictionaries[ContentWordsID]); w != "BUKU" {
		t.Fatalf("ID word %q", w)
	}
	if w := FindWord([]byte("  CAT  DOG"), dictionaries[ContentWordsEN]); w != "CAT" && w != "DOG" {
		t.Fatalf("EN word %q", w)
	}
	if w := FindWord([]byte("CA T      "), dictionaries[ContentWordsEN]); w != "" {
		t.Fatalf("gap must split runs: %q", w)
	}
	b := NewBoard(Cols, Rows, Hidden)
	b.LoadGlyphs("..HORSE...", "Q.........")
	m := Scan(b, ContentWordsEN, 0)
	if len(m) != 1 || m[0].Text != "HORSE" || m[0].Row != b.Rows-2 {
		t.Fatalf("scan %v", m)
	}
	if len(WordsID) < 60 || len(WordsEN) < 60 {
		t.Fatalf("word lists %d %d", len(WordsID), len(WordsEN))
	}
	for _, list := range [][]string{WordsID, WordsEN} {
		for _, w := range list {
			if len(w) < 3 || len(w) > 5 {
				t.Fatalf("word %q length", w)
			}
			for _, c := range []byte(w) {
				if c < 'A' || c > 'Z' {
					t.Fatalf("word %q not uppercase", w)
				}
			}
		}
	}
}

func TestMathDetection(t *testing.T) {
	cases := map[string]int{"4+5": 9, "2x3+1": 7, "9-4": 5, "8-2x3": 18}
	for expr, want := range cases {
		if v, ok := Eval(expr); !ok || v != want {
			t.Errorf("Eval(%q) = %d,%v", expr, v, ok)
		}
	}
	for _, bad := range []string{"45", "+45", "4++5", "4+5+", "12+3"} {
		if _, ok := Eval(bad); ok {
			t.Errorf("Eval(%q) accepted", bad)
		}
	}
	if e := FindExpr([]byte(" 34+5    "), 9); e != "4+5" {
		t.Fatalf("4+5=9: %q", e)
	}
	if e := FindExpr([]byte("2x3+1     "), 7); e != "2x3+1" {
		t.Fatalf("2x3+1=7: %q", e)
	}
	if e := FindExpr([]byte("4+5       "), 8); e != "" {
		t.Fatalf("wrong target matched: %q", e)
	}
	rng := testRng()
	for target := 2; target <= 18; target++ {
		expr := MathFor(target, rng)
		if v, ok := Eval(expr); !ok || v != target {
			t.Fatalf("MathFor(%d) = %q", target, expr)
		}
	}
}

func TestWordRowExplodesWithCombo(t *testing.T) {
	f := newTestField(ContentWordsID)
	f.Board.LoadGlyphs("BOLA......")
	o := NewPiece('O')
	o.X, o.Y = 8, 0
	f.Piece = &o
	_, res := f.Input(ActHard, time.Now())
	if res == nil || len(res.Matches) != 1 || res.Matches[0].Text != "BOLA" || f.Combo != 1 || res.Points != 40 {
		t.Fatalf("explosion %+v combo %d", res, f.Combo)
	}
	if f.Board.Row(0)[0] != Empty {
		t.Fatalf("row did not explode: %q", f.Board.Row(0))
	}
	// A correct answer's I piece spells the target.
	p := f.Glyphs.TargetPiece()
	if p.Type != 'I' || string(p.Glyphs[:len(f.Glyphs.Word)]) != f.Glyphs.Word {
		t.Fatalf("target piece %q for %q", p.Glyphs, f.Glyphs.Word)
	}
	m := NewGlyphs(ContentMath, testRng())
	mp := m.TargetPiece()
	if v, ok := Eval(string(mp.Glyphs[:3])); !ok || v != m.Number {
		t.Fatalf("math target piece %q for %d", mp.Glyphs, m.Number)
	}
}

func TestFortressArmorMonsterStrength(t *testing.T) {
	f := NewFortress(testRng())
	if len(f.ArmoredRows()) != 0 || f.Filled() == 0 || f.Broken() {
		t.Fatalf("fresh wall %v filled %d", f.ArmoredRows(), f.Filled())
	}
	for y := FortRows - FortressBaseRows; y < FortRows; y++ {
		if f.Board.RowFull(y) {
			t.Fatalf("base row %d has no hole", y)
		}
	}
	w := &Fortress{Board: NewBoard(FortCols, FortRows, 0), Armored: map[int]bool{}, Hits: map[int]int{}, MonsterHP: MonsterHP}
	w.Board.Load("###########.")
	i := NewPiece('I')
	i.Rot, i.X, i.Y = 1, FortCols-3, FortRows-4
	fresh := w.Place(i)
	if len(fresh) != 1 || fresh[0] != FortRows-1 || w.MonsterHP != MonsterHP-CannonDamage {
		t.Fatalf("armor %v hp %d", fresh, w.MonsterHP)
	}
	if s := w.Strength(); s != 15+3 {
		t.Fatalf("strength %d", s)
	}
	// Armored cells take two hits.
	if d := w.Hit(0, 1); d != 0 || w.Board.At(0, FortRows-1) == Empty {
		t.Fatalf("first hit on armor destroyed %d", d)
	}
	if d := w.Hit(0, 1); d != 1 || len(w.ArmoredRows()) != 0 {
		t.Fatalf("second hit destroyed %d armored %v", d, w.ArmoredRows())
	}
	if s := w.Strength(); s != 14 {
		t.Fatalf("strength after hit %d", s)
	}
	// Destroying the top of column 11 three times leaves one cell.
	if d := w.Hit(FortCols-1, 3); d != 3 {
		t.Fatalf("column hit destroyed %d", d)
	}
	// Holes subtract.
	h := &Fortress{Board: NewBoard(FortCols, FortRows, 0), Armored: map[int]bool{}, Hits: map[int]int{}, MonsterHP: MonsterHP}
	h.Board.Set(5, FortRows-2, Base, NoGlyph)
	if h.Holes() != 1 || h.Strength() != 0 || !h.Broken() {
		t.Fatalf("holes %d strength %d", h.Holes(), h.Strength())
	}
	empty := &Fortress{Board: NewBoard(FortCols, FortRows, 0), Armored: map[int]bool{}, Hits: map[int]int{}}
	if !empty.Broken() || !empty.Defeated() {
		t.Fatal("empty wall is broken; 0 hp monster is defeated")
	}
}

func TestAwardAndAccuracy(t *testing.T) {
	if MaxPoints != 12150 {
		t.Fatalf("max points %d", MaxPoints)
	}
	if Award(100, true) != 5+100+20 || Award(100, false) != 105 {
		t.Fatalf("award %d %d", Award(100, true), Award(100, false))
	}
	if Award(1e6, true) != MaxPoints {
		t.Fatal("award not capped")
	}
	if a := Accuracy(3, 1); a != 75 {
		t.Fatalf("accuracy %v", a)
	}
	if Accuracy(0, 0) != 0 {
		t.Fatal("empty accuracy")
	}
}
