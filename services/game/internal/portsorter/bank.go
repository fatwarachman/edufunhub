package portsorter

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"unicode/utf8"

	"edufunhub/game/internal/questions"
)

// Bounds of an admin-managed sorter set.
const (
	MinBins     = 2
	MaxBins     = 6
	MaxItems    = 200
	MaxLabel    = 12
	MaxItemHint = 40
	// MaxLevel is the highest unlock level of an item (0-based, one per speed level).
	MaxLevel = Packets/PacketsPerLevel - 1
)

// Bin is one drop target (protocol, category, ...) in column order.
type Bin struct {
	Key   string         `json:"key"`
	Name  questions.Text `json:"name"`
	Color string         `json:"color"`
}

// Item is one falling packet and the bin it belongs to. Level is the first
// speed level (0-based) the item may fall on.
type Item struct {
	Label string         `json:"label"`
	Hint  questions.Text `json:"hint"`
	Bin   int            `json:"bin"`
	Level int            `json:"level"`
}

// Set is one sorting topic: its bins and the answer key. The bin of an item
// is never sent to players while it falls.
type Set struct {
	Key         string         `json:"key"`
	Title       questions.Text `json:"title"`
	Description questions.Text `json:"description"`
	Bins        []Bin          `json:"bins"`
	Items       []Item         `json:"items"`
}

// Validate checks bins (2..6, unique keys, hex colours) and items (every bin
// reachable on level 1, unique labels, known bins and levels).
func (s Set) Validate() error {
	if s.Key == "" || len(s.Key) > 40 || s.Title.ID == "" {
		return errors.New("invalid key or title")
	}
	if len(s.Bins) < MinBins || len(s.Bins) > MaxBins {
		return fmt.Errorf("%s: %d bins, want %d..%d", s.Key, len(s.Bins), MinBins, MaxBins)
	}
	keys := map[string]bool{}
	for _, b := range s.Bins {
		if b.Key == "" || len(b.Key) > 30 || keys[b.Key] || b.Name.ID == "" || len(b.Name.ID) > 24 || len(b.Name.EN) > 24 || !validHex(b.Color) {
			return fmt.Errorf("%s: invalid bin %q", s.Key, b.Key)
		}
		keys[b.Key] = true
	}
	if len(s.Items) < len(s.Bins) || len(s.Items) > MaxItems {
		return fmt.Errorf("%s: %d items, want %d..%d", s.Key, len(s.Items), len(s.Bins), MaxItems)
	}
	labels := map[string]bool{}
	starter := map[int]bool{}
	for _, it := range s.Items {
		if it.Label == "" || utf8.RuneCountInString(it.Label) > MaxLabel || labels[it.Label] {
			return fmt.Errorf("%s: invalid or duplicate label %q", s.Key, it.Label)
		}
		labels[it.Label] = true
		if len(it.Hint.ID) > MaxItemHint || len(it.Hint.EN) > MaxItemHint {
			return fmt.Errorf("%s: hint too long for %q", s.Key, it.Label)
		}
		if it.Bin < 0 || it.Bin >= len(s.Bins) || it.Level < 0 || it.Level > MaxLevel {
			return fmt.Errorf("%s: %q has bin %d level %d", s.Key, it.Label, it.Bin, it.Level)
		}
		if it.Level == 0 {
			starter[it.Bin] = true
		}
	}
	if len(starter) < 2 {
		return fmt.Errorf("%s: level 1 needs items of at least 2 bins", s.Key)
	}
	return nil
}

func validHex(c string) bool {
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

// Bank is an immutable list of sorter sets.
type Bank struct {
	Version string
	Sets    []Set
	byKey   map[string]Set
}

// NewBank validates and indexes sets.
func NewBank(version string, sets []Set) (*Bank, error) {
	if len(sets) == 0 {
		return nil, errors.New("empty sorter bank")
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

// Pick returns the set with key, or the first set of the bank.
func (b *Bank) Pick(key string) Set {
	if s, ok := b.byKey[key]; ok {
		return s
	}
	return b.Sets[0]
}

// Catalog describes the sets for the picker (no answers).
func (b *Bank) Catalog(locale string) []Message {
	out := make([]Message, len(b.Sets))
	for i, s := range b.Sets {
		out[i] = Message{
			"key": s.Key, "title": s.Title.Get(locale), "description": s.Description.Get(locale),
			"bins": s.binMessages(locale), "items": len(s.Items),
		}
	}
	return out
}

func (s Set) binMessages(locale string) []Message {
	out := make([]Message, len(s.Bins))
	for i, b := range s.Bins {
		out[i] = Message{"key": b.Key, "name": b.Name.Get(locale), "color": b.Color}
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

// Current returns the active bank (the built-in bank until Laravel sends one).
func Current() *Bank {
	if b := current.Load(); b != nil {
		return b
	}
	return builtin
}

// Use activates a bank; Use(nil) restores the built-in bank.
func Use(b *Bank) { current.Store(b) }

func t(id, en string) questions.Text { return questions.Text{ID: id, EN: en} }

func item(label, hint string, bin, level int) Item {
	return Item{Label: label, Hint: t(hint, hint), Bin: bin, Level: level}
}

// BuiltinSets ship with the service; Laravel seeds the same sets
// (database/data/sorter_sets.php).
var BuiltinSets = []Set{
	{
		Key:         "ports-basic",
		Title:       t("Port Jaringan Dasar", "Basic network ports"),
		Description: t("Pilah port standar ke 4 protokol: web, DNS, remote, dan mail.", "Sort standard ports into 4 protocols: web, DNS, remote and mail."),
		Bins: []Bin{
			{Key: "web", Name: t("HTTP/WEB", "HTTP/WEB"), Color: "#2563eb"},
			{Key: "dns", Name: t("DNS", "DNS"), Color: "#c2410c"},
			{Key: "remote", Name: t("SSH/REMOTE", "SSH/REMOTE"), Color: "#7c3aed"},
			{Key: "mail", Name: t("MAIL", "MAIL"), Color: "#be185d"},
		},
		Items: []Item{
			item("80", "HTTP", 0, 0), item("443", "HTTPS", 0, 0), item("53", "DNS", 1, 0),
			item("22", "SSH", 2, 0), item("21", "FTP", 2, 0), item("3306", "MySQL", 2, 0),
			item("25", "SMTP", 3, 0), item("8080", "HTTP Alt", 0, 2), item("23", "Telnet", 2, 2),
			item("110", "POP3", 3, 2), item("143", "IMAP", 3, 2), item("3389", "RDP", 2, 4),
			item("853", "DNS over TLS", 1, 4), item("587", "SMTP Submission", 3, 4),
			item("993", "IMAPS", 3, 4), item("995", "POP3S", 3, 4),
		},
	},
	{
		Key:         "ports-services",
		Title:       t("Port Layanan Lengkap", "Service ports (full)"),
		Description: t("6 keranjang: web, DNS, remote, file, mail, dan database.", "6 bins: web, DNS, remote, file, mail and database."),
		Bins: []Bin{
			{Key: "web", Name: t("WEB", "WEB"), Color: "#2563eb"},
			{Key: "dns", Name: t("DNS", "DNS"), Color: "#c2410c"},
			{Key: "remote", Name: t("REMOTE", "REMOTE"), Color: "#7c3aed"},
			{Key: "file", Name: t("FILE", "FILE"), Color: "#0f766e"},
			{Key: "mail", Name: t("MAIL", "MAIL"), Color: "#be185d"},
			{Key: "database", Name: t("DATABASE", "DATABASE"), Color: "#4d7c0f"},
		},
		Items: []Item{
			item("80", "HTTP", 0, 0), item("443", "HTTPS", 0, 0), item("53", "DNS", 1, 0),
			item("22", "SSH", 2, 0), item("21", "FTP", 3, 0), item("25", "SMTP", 4, 0),
			item("3306", "MySQL", 5, 0), item("8080", "HTTP Alt", 0, 1), item("23", "Telnet", 2, 1),
			item("20", "FTP Data", 3, 1), item("110", "POP3", 4, 1), item("5432", "PostgreSQL", 5, 1),
			item("143", "IMAP", 4, 2), item("3389", "RDP", 2, 2), item("69", "TFTP", 3, 2),
			item("1433", "SQL Server", 5, 2), item("8443", "HTTPS Alt", 0, 3), item("853", "DNS over TLS", 1, 3),
			item("5900", "VNC", 2, 3), item("445", "SMB", 3, 3), item("587", "SMTP Submission", 4, 3),
			item("27017", "MongoDB", 5, 3), item("993", "IMAPS", 4, 4), item("995", "POP3S", 4, 4),
			item("6379", "Redis", 5, 4), item("989", "FTPS Data", 3, 4), item("990", "FTPS", 3, 5),
			item("1521", "Oracle DB", 5, 5),
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
