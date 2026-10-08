package blockbattle

import (
	"math/rand/v2"
	"time"
)

// Input actions.
const (
	ActLeft      = "left"
	ActRight     = "right"
	ActRotate    = "rotate"
	ActRotateCCW = "rotate_ccw"
	ActSoft      = "soft"
	ActHard      = "hard"
)

// ValidAction reports whether a is a known input action.
func ValidAction(a string) bool {
	switch a {
	case ActLeft, ActRight, ActRotate, ActRotateCCW, ActSoft, ActHard:
		return true
	}
	return false
}

// Limiter drops inputs above Max per Window (fixed window).
type Limiter struct {
	Max    int
	Window time.Duration
	start  time.Time
	count  int
}

// Allow reports whether one more input fits the window at now.
func (l *Limiter) Allow(now time.Time) bool {
	if l.start.IsZero() || now.Sub(l.start) >= l.Window || now.Before(l.start) {
		l.start, l.count = now, 0
	}
	if l.count >= l.Max {
		return false
	}
	l.count++
	return true
}

// Attack is queued garbage: Lines rows sharing one Hole column.
type Attack struct {
	Lines int
	Hole  int
	From  int64
}

// LockResult describes what one lock did.
type LockResult struct {
	Cleared   int     // full rows cleared
	Cancelled int     // pending garbage lines cancelled by the clear
	Send      int     // garbage lines to send to a rival (BATTLE)
	Inserted  int     // pending garbage lines that rose into the board
	Matches   []Match // exploded rows (WORDS)
	Points    int     // score gained
	ToppedOut bool    // the next piece could not spawn
}

// FieldConfig sizes a personal board and its timings.
type FieldConfig struct {
	Cols, Rows, Hidden int
	Gravity            time.Duration // base fall interval
	LockDelay          time.Duration
	// Content is "" for BATTLE, else the WORDS content (glyph boards).
	Content string
}

// Field is one personal board: the falling piece, the preview queue,
// gravity, lock delay, pending garbage and effects. Owned by the room
// goroutine; pure and deterministic for a given rng.
type Field struct {
	cfg    FieldConfig
	Board  *Board
	Piece  *Piece
	Queue  []Piece
	Glyphs *Glyphs

	Pending []Attack

	Lines, Score, Combo int
	Alive               bool

	// Base is the current base gravity (the room lowers it over time).
	Base time.Duration

	PenaltyUntil time.Time
	ExposedUntil time.Time

	rng        *rand.Rand
	bag        *Bag
	fallAt     time.Time
	lockAt     time.Time
	lockResets int
	limiter    Limiter
}

// NewField returns a field with an empty board; Start spawns the first piece.
func NewField(cfg FieldConfig, rng *rand.Rand) *Field {
	f := &Field{
		cfg: cfg, Board: NewBoard(cfg.Cols, cfg.Rows, cfg.Hidden), rng: rng, bag: NewBag(rng),
		Base: cfg.Gravity, limiter: Limiter{Max: MaxInputs, Window: time.Second},
	}
	if cfg.Content != "" {
		f.Glyphs = NewGlyphs(cfg.Content, rng)
	}
	return f
}

func (f *Field) draw() Piece {
	p := NewPiece(f.bag.Next())
	if f.Glyphs != nil {
		p.Glyphs = f.Glyphs.Next()
	}
	return p
}

// Start fills the preview queue and spawns the first piece.
func (f *Field) Start(now time.Time) {
	f.Alive = true
	for len(f.Queue) < Previews {
		f.Queue = append(f.Queue, f.draw())
	}
	f.spawn(now)
}

// spawn takes the next piece from the queue; a blocked spawn knocks out.
func (f *Field) spawn(now time.Time) bool {
	next := f.Queue[0]
	f.Queue = append(f.Queue[1:], f.draw())
	p, ok := f.Board.Spawn(next)
	f.lockAt, f.lockResets = time.Time{}, 0
	f.fallAt = now.Add(f.Gravity(now))
	if !ok {
		f.Piece, f.Alive = nil, false
		return false
	}
	f.Piece = &p
	return true
}

// SetNext replaces the next piece (rewards).
func (f *Field) SetNext(p Piece) {
	if len(f.Queue) == 0 {
		f.Queue = append(f.Queue, p)
		return
	}
	f.Queue[0] = p
}

// Gravity is the fall interval at now: PENALTY halves the base interval.
func (f *Field) Gravity(now time.Time) time.Duration {
	if now.Before(f.PenaltyUntil) {
		return max(time.Millisecond, f.Base/2)
	}
	return f.Base
}

// Penalize doubles gravity for d.
func (f *Field) Penalize(now time.Time, d time.Duration) {
	f.PenaltyUntil = now.Add(d)
	if f.fallAt.After(now.Add(f.Gravity(now))) {
		f.fallAt = now.Add(f.Gravity(now))
	}
}

// Expose marks the field EXPOSED for d.
func (f *Field) Expose(now time.Time, d time.Duration) { f.ExposedUntil = now.Add(d) }

// Exposed reports whether attacks on this field get the bonus line.
func (f *Field) Exposed(now time.Time) bool { return now.Before(f.ExposedUntil) }

// Effects lists the active effects and their remaining time.
func (f *Field) Effects(now time.Time) ([]string, map[string]int64) {
	fx, ms := []string{}, map[string]int64{}
	if now.Before(f.PenaltyUntil) {
		fx = append(fx, FxPenalty)
		ms[FxPenalty] = f.PenaltyUntil.Sub(now).Milliseconds()
	}
	if now.Before(f.ExposedUntil) {
		fx = append(fx, FxExposed)
		ms[FxExposed] = f.ExposedUntil.Sub(now).Milliseconds()
	}
	return fx, ms
}

// AddGarbage queues an attack of n lines with one random hole column.
func (f *Field) AddGarbage(n int, from int64) {
	if n <= 0 {
		return
	}
	f.Pending = append(f.Pending, Attack{Lines: n, Hole: f.rng.IntN(f.cfg.Cols), From: from})
}

// PendingLines is the total of queued garbage.
func (f *Field) PendingLines() int {
	n := 0
	for _, a := range f.Pending {
		n += a.Lines
	}
	return n
}

// cancel removes n lines from the pending queue (oldest first).
func (f *Field) cancel(n int) int {
	done := 0
	for n > 0 && len(f.Pending) > 0 {
		take := min(n, f.Pending[0].Lines)
		f.Pending[0].Lines -= take
		n -= take
		done += take
		if f.Pending[0].Lines == 0 {
			f.Pending = f.Pending[1:]
		}
	}
	return done
}

// Input applies one action. ok is false when nothing changed (blocked move
// or dropped by the rate limit); locked carries the lock of a hard drop.
func (f *Field) Input(action string, now time.Time) (ok bool, res *LockResult) {
	if !f.Alive || f.Piece == nil || !f.limiter.Allow(now) {
		return false, nil
	}
	p := *f.Piece
	var moved bool
	switch action {
	case ActLeft:
		p, moved = f.Board.Move(p, -1, 0)
	case ActRight:
		p, moved = f.Board.Move(p, 1, 0)
	case ActRotate:
		p, moved = f.Board.Rotate(p, 1)
	case ActRotateCCW:
		p, moved = f.Board.Rotate(p, -1)
	case ActSoft:
		p, moved = f.Board.Move(p, 0, 1)
		if moved {
			f.Score++
			f.fallAt = now.Add(f.Gravity(now))
		}
	case ActHard:
		dropped, rows := f.Board.Drop(p)
		f.Piece = &dropped
		f.Score += 2 * rows
		r := f.lock(now)
		return true, &r
	default:
		return false, nil
	}
	if !moved {
		return false, nil
	}
	f.Piece = &p
	if !f.lockAt.IsZero() {
		if !f.Board.Grounded(p) {
			f.lockAt = time.Time{}
		} else if f.lockResets < MaxLockResets {
			f.lockResets++
			f.lockAt = now.Add(f.cfg.LockDelay)
		}
	}
	return true, nil
}

// Step applies gravity and the lock delay at now. changed reports a visible
// change; res is non-nil when the piece locked.
func (f *Field) Step(now time.Time) (changed bool, res *LockResult) {
	if !f.Alive || f.Piece == nil {
		return false, nil
	}
	for !now.Before(f.fallAt) {
		f.fallAt = f.fallAt.Add(f.Gravity(now))
		if f.fallAt.Before(now) {
			f.fallAt = now.Add(f.Gravity(now))
		}
		if p, ok := f.Board.Move(*f.Piece, 0, 1); ok {
			f.Piece = &p
			changed = true
			if !f.Board.Grounded(p) {
				f.lockAt = time.Time{}
			}
		}
	}
	grounded := f.Board.Grounded(*f.Piece)
	switch {
	case !grounded:
		f.lockAt = time.Time{}
	case f.lockAt.IsZero():
		f.lockAt = now.Add(f.cfg.LockDelay)
	case !now.Before(f.lockAt):
		r := f.lock(now)
		return true, &r
	}
	return changed, nil
}

// lineScore is the classic score of clearing n lines at once.
func lineScore(n int) int {
	return [5]int{0, 100, 300, 500, 800}[min(n, 4)]
}

// lock places the piece, explodes word rows (WORDS), clears full rows,
// cancels and inserts pending garbage and spawns the next piece.
func (f *Field) lock(now time.Time) LockResult {
	var res LockResult
	f.Board.Place(*f.Piece)
	f.Piece = nil
	if f.Glyphs != nil {
		res.Matches = Scan(f.Board, f.Glyphs.Content, f.Glyphs.Number)
		full := f.Board.FullRows()
		rows := append([]int{}, full...)
		for _, m := range res.Matches {
			if !contains(full, m.Row) {
				rows = append(rows, m.Row)
			}
		}
		if len(res.Matches) > 0 {
			f.Combo = min(MaxCombo, f.Combo+1)
			for _, m := range res.Matches {
				res.Points += len(m.Text) * 10 * f.Combo
			}
			f.Glyphs.NewTarget()
		} else {
			f.Combo = 0
		}
		res.Cleared = len(full)
		res.Points += 5 * len(full)
		f.Board.RemoveRows(rows)
		f.Lines += len(rows)
	} else {
		res.Cleared = f.Board.ClearLines()
		f.Lines += res.Cleared
		res.Points = lineScore(res.Cleared)
		if res.Cleared > 0 {
			f.Combo++
		} else {
			f.Combo = 0
		}
		// Cleared lines cancel pending garbage first (one line per line);
		// the lines left over send garbage to a rival by the table.
		res.Cancelled = f.cancel(res.Cleared)
		res.Send = GarbageFor(res.Cleared - res.Cancelled)
		for _, a := range f.Pending {
			f.Board.InsertGarbage(a.Lines, a.Hole)
			res.Inserted += a.Lines
		}
		f.Pending = nil
	}
	f.Score += res.Points
	res.ToppedOut = !f.spawn(now)
	return res
}

// Ghost is where the piece would land.
func (f *Field) Ghost() *Piece {
	if f.Piece == nil {
		return nil
	}
	g, _ := f.Board.Drop(*f.Piece)
	return &g
}

func contains(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
