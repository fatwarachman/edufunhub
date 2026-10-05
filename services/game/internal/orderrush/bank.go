package orderrush

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"slices"
	"sync/atomic"

	"edufunhub/game/internal/questions"
)

// Category kinds pick the client validator animation: a LAN tester for
// cables and fibre cores, packet encapsulation for protocols.
const (
	KindCable    = "cable"
	KindProtocol = "protocol"
)

// MinSlots and MaxSlots bound a sequence set (the LAN tester shows up to 12
// LEDs for a 12-core fibre).
const (
	MinSlots = 2
	MaxSlots = 12
)

// SetItem is one piece of a sequence in its correct position.
type SetItem struct {
	Label questions.Text `json:"label"`
	// Color is the hex colour of a cable or fibre core; Stripe the stripe
	// colour of a white striped UTP pair (white-orange, white-green, ...).
	Color  string `json:"color,omitempty"`
	Stripe string `json:"stripe,omitempty"`
}

// Set is one sequence topic (a category of the TKJ bank). Items are stored
// in the correct order; the server never sends that order to clients.
type Set struct {
	Key         string         `json:"key"`
	Category    string         `json:"category"`
	Kind        string         `json:"kind"`
	Title       questions.Text `json:"title"`
	Description questions.Text `json:"description"`
	Items       []SetItem      `json:"items"`
}

// SequenceItem is a piece as clients see it: an opaque id per module, so
// the id never reveals the position.
type SequenceItem struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Color  string `json:"color,omitempty"`
	Stripe string `json:"stripe,omitempty"`
}

// SequenceQuestion is one module dealt to a player. CorrectOrder stays on
// the server (json "-"); PoolItems are shuffled.
type SequenceQuestion struct {
	ID           string         `json:"id"`
	Set          string         `json:"set"`
	Category     string         `json:"category"`
	Kind         string         `json:"kind"`
	Title        string         `json:"title"`
	Description  string         `json:"description"`
	TotalSlots   int            `json:"total_slots"`
	CorrectOrder []string       `json:"-"`
	PoolItems    []SequenceItem `json:"pool_items"`
}

// Validate checks a set: known kind, 2 to 12 items, non-empty unique labels
// and hex colours.
func (s Set) Validate() error {
	if s.Key == "" || len(s.Key) > 40 || s.Category == "" || len(s.Category) > 40 {
		return errors.New("invalid key or category")
	}
	if s.Kind != KindCable && s.Kind != KindProtocol {
		return fmt.Errorf("%s: unknown kind %q", s.Key, s.Kind)
	}
	if s.Title.ID == "" {
		return fmt.Errorf("%s: missing title", s.Key)
	}
	if len(s.Items) < MinSlots || len(s.Items) > MaxSlots {
		return fmt.Errorf("%s: %d items, want %d..%d", s.Key, len(s.Items), MinSlots, MaxSlots)
	}
	seen := map[string]bool{}
	for _, it := range s.Items {
		if it.Label.ID == "" || len(it.Label.ID) > 60 || len(it.Label.EN) > 60 {
			return fmt.Errorf("%s: invalid label", s.Key)
		}
		if seen[it.Label.ID] {
			return fmt.Errorf("%s: duplicate label %q", s.Key, it.Label.ID)
		}
		seen[it.Label.ID] = true
		if !validHex(it.Color) || !validHex(it.Stripe) {
			return fmt.Errorf("%s: invalid colour", s.Key)
		}
	}
	return nil
}

func validHex(c string) bool {
	if c == "" {
		return true
	}
	if len(c) != 7 || c[0] != '#' {
		return false
	}
	for _, r := range c[1:] {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r >= 'A' && r <= 'F') {
			return false
		}
	}
	return true
}

// Deal builds a module from a set: fresh random piece ids and a pool order
// that never equals the solution.
func (s Set) Deal(id string, locale string, rng *rand.Rand) SequenceQuestion {
	n := len(s.Items)
	ids := make([]string, n)
	used := map[string]bool{}
	for i := range ids {
		for ids[i] == "" || used[ids[i]] {
			ids[i] = fmt.Sprintf("p%06x", rng.Uint32()&0xffffff)
		}
		used[ids[i]] = true
	}
	pool := make([]int, n)
	for i := range pool {
		pool[i] = i
	}
	for tries := 0; tries < 8; tries++ {
		rng.Shuffle(n, func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
		if !sorted(pool) {
			break
		}
	}
	if sorted(pool) && n > 1 {
		pool[0], pool[1] = pool[1], pool[0]
	}
	q := SequenceQuestion{
		ID: id, Set: s.Key, Category: s.Category, Kind: s.Kind,
		Title: s.Title.Get(locale), Description: s.Description.Get(locale),
		TotalSlots: n, CorrectOrder: ids,
	}
	q.PoolItems = make([]SequenceItem, n)
	for i, idx := range pool {
		it := s.Items[idx]
		q.PoolItems[i] = SequenceItem{ID: ids[idx], Label: it.Label.Get(locale), Color: it.Color, Stripe: it.Stripe}
	}
	return q
}

func sorted(a []int) bool {
	for i := range a {
		if a[i] != i {
			return false
		}
	}
	return true
}

// Relabel returns the module in another locale with the same ids and pool
// order (a locale switch must not reshuffle the pieces).
func (q SequenceQuestion) Relabel(s Set, locale string) SequenceQuestion {
	out := q
	out.Title, out.Description = s.Title.Get(locale), s.Description.Get(locale)
	pos := map[string]int{}
	for i, id := range q.CorrectOrder {
		pos[id] = i
	}
	out.PoolItems = make([]SequenceItem, len(q.PoolItems))
	for i, it := range q.PoolItems {
		if p, ok := pos[it.ID]; ok && p < len(s.Items) {
			it.Label = s.Items[p].Label.Get(locale)
		}
		out.PoolItems[i] = it
	}
	return out
}

// FirstMismatch returns the first slot where submitted differs from
// correct, or -1 when both are identical. It never indexes past either
// slice: a shorter or longer submission mismatches at the shorter length.
func FirstMismatch(submitted, correct []string) int {
	n := min(len(submitted), len(correct))
	for i := 0; i < n; i++ {
		if submitted[i] != correct[i] {
			return i
		}
	}
	if len(submitted) != len(correct) {
		return n
	}
	return -1
}

// WellFormed reports whether submitted is a permutation of the module's
// pieces (right length, known ids, no duplicates). Malformed submissions
// are rejected without counting as a wrong attempt.
func WellFormed(submitted, correct []string) bool {
	if len(submitted) != len(correct) || len(submitted) > MaxSubmitted {
		return false
	}
	seen := make(map[string]bool, len(correct))
	for _, id := range correct {
		seen[id] = false
	}
	for _, id := range submitted {
		used, known := seen[id]
		if !known || used {
			return false
		}
		seen[id] = true
	}
	return true
}

// Bank is an immutable set of sequence sets.
type Bank struct {
	Version string
	Sets    []Set
	byKey   map[string]Set
}

// NewBank validates and indexes sets.
func NewBank(version string, sets []Set) (*Bank, error) {
	if len(sets) == 0 {
		return nil, errors.New("empty sequence bank")
	}
	b := &Bank{Version: version, byKey: map[string]Set{}}
	for _, s := range sets {
		if err := s.Validate(); err != nil {
			return nil, err
		}
		if _, dup := b.byKey[s.Key]; dup {
			return nil, fmt.Errorf("duplicate set %q", s.Key)
		}
		b.byKey[s.Key] = s
		b.Sets = append(b.Sets, s)
	}
	return b, nil
}

// Get returns a set by key.
func (b *Bank) Get(key string) (Set, bool) {
	s, ok := b.byKey[key]
	return s, ok
}

// Keys lists the set keys in bank order.
func (b *Bank) Keys() []string {
	out := make([]string, len(b.Sets))
	for i, s := range b.Sets {
		out[i] = s.Key
	}
	return out
}

// Catalog describes the sets for the host picker (no answers).
func (b *Bank) Catalog(locale string) []Message {
	out := make([]Message, len(b.Sets))
	for i, s := range b.Sets {
		out[i] = Message{"key": s.Key, "category": s.Category, "kind": s.Kind, "title": s.Title.Get(locale), "slots": len(s.Items)}
	}
	return out
}

// Parse reads the Laravel bank payload {version, sets[]}.
func Parse(body []byte) (*Bank, error) {
	var payload struct {
		Version string `json:"version"`
		Sets    []Set  `json:"sets"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return NewBank(payload.Version, payload.Sets)
}

var current atomic.Pointer[Bank]

// Current returns the active bank (the built-in TKJ bank until Laravel
// sends one).
func Current() *Bank {
	if b := current.Load(); b != nil {
		return b
	}
	return builtin
}

// Use activates a bank; Use(nil) restores the built-in bank.
func Use(b *Bank) { current.Store(b) }

// Builtin returns the TKJ bank shipped with the service.
func Builtin() *Bank { return builtin }

func t(id, en string) questions.Text { return questions.Text{ID: id, EN: en} }

// UTP and fibre colours (TIA-568 / TIA-598).
const (
	cOrange = "#f97316"
	cGreen  = "#16a34a"
	cBlue   = "#2563eb"
	cBrown  = "#7c4a1e"
	cWhite  = "#f8fafc"
	cSlate  = "#64748b"
	cRed    = "#dc2626"
	cBlack  = "#111827"
	cYellow = "#facc15"
	cViolet = "#7c3aed"
	cRose   = "#f472b6"
	cAqua   = "#14b8a6"
)

func striped(id, en, stripe string) SetItem {
	return SetItem{Label: t(id, en), Color: cWhite, Stripe: stripe}
}

func solid(id, en, color string) SetItem { return SetItem{Label: t(id, en), Color: color} }

func word(id, en string) SetItem { return SetItem{Label: t(id, en)} }

// BuiltinSets is the TKJ sequence bank (Laravel seeds the same sets).
var BuiltinSets = []Set{
	{
		Key: "utp-t568b", Category: "UTP_T568B", Kind: KindCable,
		Title:       t("Kabel UTP T568B (Straight)", "UTP cable T568B (straight)"),
		Description: t("Urutkan warna pin 1–8 standar T568B.", "Order pins 1–8 of the T568B standard."),
		Items: []SetItem{
			striped("Putih-Orange", "White-Orange", cOrange), solid("Orange", "Orange", cOrange),
			striped("Putih-Hijau", "White-Green", cGreen), solid("Biru", "Blue", cBlue),
			striped("Putih-Biru", "White-Blue", cBlue), solid("Hijau", "Green", cGreen),
			striped("Putih-Cokelat", "White-Brown", cBrown), solid("Cokelat", "Brown", cBrown),
		},
	},
	{
		Key: "utp-t568a", Category: "UTP_T568A", Kind: KindCable,
		Title:       t("Kabel UTP T568A (Cross-end)", "UTP cable T568A (cross end)"),
		Description: t("Urutkan warna pin 1–8 standar T568A.", "Order pins 1–8 of the T568A standard."),
		Items: []SetItem{
			striped("Putih-Hijau", "White-Green", cGreen), solid("Hijau", "Green", cGreen),
			striped("Putih-Orange", "White-Orange", cOrange), solid("Biru", "Blue", cBlue),
			striped("Putih-Biru", "White-Blue", cBlue), solid("Orange", "Orange", cOrange),
			striped("Putih-Cokelat", "White-Brown", cBrown), solid("Cokelat", "Brown", cBrown),
		},
	},
	{
		Key: "fiber-12", Category: "FIBER_12_CORE", Kind: KindCable,
		Title:       t("Fiber Optic 12 Warna Core", "Fibre optic 12-colour core"),
		Description: t("Urutkan warna core 1–12 (TIA-598).", "Order cores 1–12 (TIA-598)."),
		Items: []SetItem{
			solid("Biru", "Blue", cBlue), solid("Orange", "Orange", cOrange), solid("Hijau", "Green", cGreen),
			solid("Cokelat", "Brown", cBrown), solid("Abu-abu", "Slate", cSlate), solid("Putih", "White", cWhite),
			solid("Merah", "Red", cRed), solid("Hitam", "Black", cBlack), solid("Kuning", "Yellow", cYellow),
			solid("Ungu", "Violet", cViolet), solid("Pink", "Rose", cRose), solid("Tosca", "Aqua", cAqua),
		},
	},
	{
		Key: "osi-top-down", Category: "OSI_TOP_DOWN", Kind: KindProtocol,
		Title:       t("OSI 7 Layer (Atas ke Bawah / Enkapsulasi)", "OSI 7 layers (top-down / encapsulation)"),
		Description: t("Urutkan layer dari Application ke Physical.", "Order the layers from Application to Physical."),
		Items: []SetItem{
			word("Application", "Application"), word("Presentation", "Presentation"), word("Session", "Session"),
			word("Transport", "Transport"), word("Network", "Network"), word("Data Link", "Data Link"),
			word("Physical", "Physical"),
		},
	},
	{
		Key: "osi-bottom-up", Category: "OSI_BOTTOM_UP", Kind: KindProtocol,
		Title:       t("OSI 7 Layer (Bawah ke Atas / Dekapsulasi)", "OSI 7 layers (bottom-up / decapsulation)"),
		Description: t("Urutkan layer dari Physical ke Application.", "Order the layers from Physical to Application."),
		Items: []SetItem{
			word("Physical", "Physical"), word("Data Link", "Data Link"), word("Network", "Network"),
			word("Transport", "Transport"), word("Session", "Session"), word("Presentation", "Presentation"),
			word("Application", "Application"),
		},
	},
	{
		Key: "pdu", Category: "PDU_HIERARCHY", Kind: KindProtocol,
		Title:       t("Hierarki PDU", "PDU hierarchy"),
		Description: t("Urutkan PDU saat enkapsulasi, dari atas ke bawah.", "Order the PDUs during encapsulation, top to bottom."),
		Items:       []SetItem{word("Data", "Data"), word("Segment", "Segment"), word("Packet", "Packet"), word("Frame", "Frame"), word("Bits", "Bits")},
	},
	{
		Key: "dhcp-dora", Category: "DHCP_DORA", Kind: KindProtocol,
		Title:       t("Proses DHCP (DORA)", "DHCP process (DORA)"),
		Description: t("Urutkan pesan DHCP sampai klien mendapat IP.", "Order the DHCP messages until the client gets an IP."),
		Items:       []SetItem{word("Discover", "Discover"), word("Offer", "Offer"), word("Request", "Request"), word("Acknowledge", "Acknowledge")},
	},
	{
		Key: "tcp-handshake", Category: "TCP_HANDSHAKE", Kind: KindProtocol,
		Title:       t("TCP 3-Way Handshake", "TCP three-way handshake"),
		Description: t("Urutkan segmen pembuka koneksi TCP.", "Order the segments that open a TCP connection."),
		Items:       []SetItem{word("SYN", "SYN"), word("SYN-ACK", "SYN-ACK"), word("ACK", "ACK")},
	},
	{
		Key: "troubleshooting", Category: "TROUBLESHOOTING", Kind: KindProtocol,
		Title:       t("Langkah Troubleshooting Jaringan", "Network troubleshooting steps"),
		Description: t("Urutkan pengecekan dari lapisan paling bawah.", "Order the checks from the lowest layer up."),
		Items: []SetItem{
			word("Fisik Kabel/Link", "Physical cable/link"), word("IP Address", "IP address"), word("Gateway", "Gateway"),
			word("DNS Public", "Public DNS"), word("Domain Name", "Domain name"),
		},
	},
}

var builtin = func() *Bank {
	b, err := NewBank("builtin", BuiltinSets)
	if err != nil {
		panic(err)
	}
	return b
}()

// pickSet chooses the next set for a player from the room's selection,
// avoiding the one just played when there is a choice.
func pickSet(b *Bank, selected []string, last string, rng *rand.Rand) Set {
	keys := make([]string, 0, len(selected))
	for _, k := range selected {
		if _, ok := b.Get(k); ok {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		keys = b.Keys()
	}
	if len(keys) > 1 {
		keys = slices.DeleteFunc(keys, func(k string) bool { return k == last })
	}
	s, _ := b.Get(keys[rng.IntN(len(keys))])
	return s
}
