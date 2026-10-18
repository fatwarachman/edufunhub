package edukart

import (
	"embed"
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

//go:embed tracks/*.json
var trackFiles embed.FS

// TrackIDs are the circuits a host can pick, in menu order.
var TrackIDs = []string{"forest", "beach", "mandalika"}

// Ramp is a jump: driving over [S, S+Len) launches the kart for Air seconds.
type Ramp struct {
	S   float64 `json:"s"`
	Len float64 `json:"len"`
	Air float64 `json:"air"`
}

// Pad is a green speed pad centred on Lateral, Width wide, from S to S+Len.
type Pad struct {
	S       float64 `json:"s"`
	Len     float64 `json:"len"`
	Lateral float64 `json:"lateral"`
	Width   float64 `json:"width"`
}

// Fruit is one collectible star on the track.
type Fruit struct {
	S       float64 `json:"s"`
	Lateral float64 `json:"lateral"`
}

// Track is a closed circuit sampled every Step metres along its centreline.
// Samples are [x, z, y] (y = height). Heading and curvature are derived and
// never sent: clients derive them with the same maths (lib/edu-kart/track.ts).
type Track struct {
	ID        string       `json:"id"`
	Theme     string       `json:"theme"`
	Step      float64      `json:"step"`
	Length    float64      `json:"length"`
	HalfWidth float64      `json:"half_width"`
	Samples   [][3]float64 `json:"samples"`
	Gates     []float64    `json:"gates"`
	Ramps     []Ramp       `json:"ramps"`
	Pads      []Pad        `json:"pads"`
	Fruits    []Fruit      `json:"fruits"`

	heading []float64 // unwrapped tangent angle per sample
	curve   []float64 // dθ/ds per sample (positive = turning right)
}

var tracks = map[string]*Track{}

func init() {
	for _, id := range TrackIDs {
		raw, err := trackFiles.ReadFile("tracks/" + id + ".json")
		if err != nil {
			panic(err)
		}
		t, err := ParseTrack(raw)
		if err != nil {
			panic(fmt.Sprintf("track %s: %v", id, err))
		}
		tracks[id] = t
	}
}

// TrackByID returns a built-in track (nil when unknown).
func TrackByID(id string) *Track { return tracks[id] }

// ParseTrack decodes and prepares a track.
func ParseTrack(raw []byte) (*Track, error) {
	var t Track
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, err
	}
	n := len(t.Samples)
	if n < 16 || t.Step <= 0 || t.HalfWidth <= 0 {
		return nil, fmt.Errorf("bad track")
	}
	t.Length = float64(n) * t.Step
	t.heading = make([]float64, n)
	t.curve = make([]float64, n)
	for i := 0; i < n; i++ {
		a, b := t.Samples[(i-1+n)%n], t.Samples[(i+1)%n]
		t.heading[i] = math.Atan2(b[1]-a[1], b[0]-a[0])
	}
	for i := 1; i < n; i++ {
		t.heading[i] = t.heading[i-1] + wrapAngle(t.heading[i]-t.heading[i-1])
	}
	for i := 0; i < n; i++ {
		prev, next := t.heading[(i-1+n)%n], t.heading[(i+1)%n]
		t.curve[i] = wrapAngle(next-prev) / (2 * t.Step)
	}
	sort.Float64s(t.Gates)
	return &t, nil
}

// wrapAngle maps an angle to (-π, π].
func wrapAngle(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a <= -math.Pi {
		a += 2 * math.Pi
	}
	return a
}

// Wrap maps any progress to s in [0, Length).
func (t *Track) Wrap(p float64) float64 {
	s := math.Mod(p, t.Length)
	if s < 0 {
		s += t.Length
	}
	return s
}

// locate returns the sample index at or before s and the fraction to the next.
func (t *Track) locate(p float64) (int, int, float64) {
	s := t.Wrap(p)
	f := s / t.Step
	i := int(math.Floor(f))
	n := len(t.Samples)
	if i >= n {
		i = n - 1
	}
	return i, (i + 1) % n, f - float64(i)
}

// Curvature at progress p (linear between samples).
func (t *Track) Curvature(p float64) float64 {
	i, j, f := t.locate(p)
	return t.curve[i] + (t.curve[j]-t.curve[i])*f
}

// Heading is the tangent angle at progress p.
func (t *Track) Heading(p float64) float64 {
	i, j, f := t.locate(p)
	return t.heading[i] + wrapAngle(t.heading[j]-t.heading[i])*f
}

// Height of the road at progress p.
func (t *Track) Height(p float64) float64 {
	i, j, f := t.locate(p)
	return t.Samples[i][2] + (t.Samples[j][2]-t.Samples[i][2])*f
}

// World position (x, y, z) of track coordinates (p, d); d > 0 is right of travel.
func (t *Track) World(p, d float64) (float64, float64, float64) {
	i, j, f := t.locate(p)
	a, b := t.Samples[i], t.Samples[j]
	x := a[0] + (b[0]-a[0])*f
	z := a[1] + (b[1]-a[1])*f
	y := a[2] + (b[2]-a[2])*f
	h := t.Heading(p)
	return x - math.Sin(h)*d, y, z + math.Cos(h)*d
}

// Ahead returns how far b is ahead of a along the loop, in (-L/2, L/2].
func (t *Track) Ahead(a, b float64) float64 {
	d := math.Mod(b-a, t.Length)
	if d > t.Length/2 {
		d -= t.Length
	}
	if d <= -t.Length/2 {
		d += t.Length
	}
	return d
}

// AnswerLanes returns the lateral centre of each answer box and the lane
// width for a gate with n options (option 0 is the leftmost box).
func (t *Track) AnswerLanes(n int) ([]float64, float64) {
	w := 2 * t.HalfWidth / float64(n)
	out := make([]float64, n)
	for i := range out {
		out[i] = -t.HalfWidth + w*(float64(i)+0.5)
	}
	return out, w
}

// LaneAt is the answer box a kart at lateral d hits (-1 when off the road).
func (t *Track) LaneAt(n int, d float64) int {
	if math.Abs(d) > t.HalfWidth+0.5 {
		return -1
	}
	_, w := t.AnswerLanes(n)
	i := int(math.Floor((d + t.HalfWidth) / w))
	return max(0, min(n-1, i))
}
