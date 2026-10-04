package crossword

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"
)

// MinWordLen and MaxWordLen bound answers; the largest grid is 15 wide.
const (
	MinWordLen = 3
	MaxWordLen = 15
)

// Bank is the word bank by level.
type Bank struct {
	Version string
	Levels  map[int][]Entry
}

var current atomic.Pointer[Bank]

// builtin wraps the bundled words with their keys.
var builtin = func() *Bank {
	levels := map[int][]Entry{}
	for level, list := range seed {
		for _, e := range list {
			levels[level] = append(levels[level], Entry{Answer: e.Answer, ClueID: e.ClueID, ClueEN: e.ClueEN, Key: fmt.Sprintf("cw-%d-%s", level, e.Answer)})
		}
	}
	return &Bank{Version: "builtin", Levels: levels}
}()

// Builtin returns the bundled bank.
func Builtin() *Bank { return builtin }

// Current returns the active bank (built-in until a sync succeeds).
func Current() *Bank {
	if b := current.Load(); b != nil {
		return b
	}
	return builtin
}

// Use swaps the active bank. Passing nil restores the built-in bank.
func Use(b *Bank) { current.Store(b) }

// Entries returns the words of a level from the active bank.
func Entries(level int) []Entry { return Current().Levels[level] }

// ValidAnswer reports whether a word only uses A-Z and fits every grid.
func ValidAnswer(s string) bool {
	if len(s) < MinWordLen || len(s) > MaxWordLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < 'A' || s[i] > 'Z' {
			return false
		}
	}
	return true
}

// ParseBank reads the bank served by Laravel. Every level needs enough valid
// words to fill its grid, otherwise the bank is rejected and the current one
// stays active.
func ParseBank(body []byte) (*Bank, error) {
	var payload struct {
		Version string `json:"version"`
		Words   []struct {
			Key    string `json:"key"`
			Level  int    `json:"level"`
			Answer string `json:"answer"`
			Clue   struct {
				ID string `json:"id"`
				EN string `json:"en"`
			} `json:"clue"`
		} `json:"words"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	b := &Bank{Version: payload.Version, Levels: map[int][]Entry{}}
	seen := map[string]bool{}
	for _, w := range payload.Words {
		if _, ok := FindLevel(w.Level); !ok || !ValidAnswer(w.Answer) || w.Clue.ID == "" || w.Key == "" {
			return nil, fmt.Errorf("invalid word %q", w.Key)
		}
		id := fmt.Sprintf("%d:%s", w.Level, w.Answer)
		if seen[id] {
			continue
		}
		seen[id] = true
		en := w.Clue.EN
		if en == "" {
			en = w.Clue.ID
		}
		b.Levels[w.Level] = append(b.Levels[w.Level], Entry{Key: w.Key, Answer: w.Answer, ClueID: w.Clue.ID, ClueEN: en})
	}
	for _, l := range Levels {
		if len(b.Levels[l.Number]) < l.Words*2 {
			return nil, fmt.Errorf("level %d needs at least %d words", l.Number, l.Words*2)
		}
	}
	return b, nil
}

// Syncer pulls the admin-managed word bank from Laravel, signed like the
// question bank: hex(HMAC-SHA256(timestamp + ".", secret)).
type Syncer struct {
	URL    string
	Secret []byte
	Client *http.Client
	Logger *slog.Logger
}

// SyncOnce fetches and activates the bank. Failures keep the current bank.
func (s *Syncer) SyncOnce(ctx context.Context) error {
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.URL, nil)
	if err != nil {
		return err
	}
	mac := hmac.New(sha256.New, s.Secret)
	mac.Write([]byte(ts + "."))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Game-Timestamp", ts)
	req.Header.Set("X-Game-Signature", hex.EncodeToString(mac.Sum(nil)))
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return errors.New("status " + res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	bank, err := ParseBank(body)
	if err != nil {
		return err
	}
	if Current().Version != bank.Version && s.Logger != nil {
		s.Logger.Info("crossword bank synced", "version", bank.Version)
	}
	Use(bank)
	return nil
}

// Run syncs immediately and then every interval until ctx is done.
func (s *Syncer) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		if err := s.SyncOnce(ctx); err != nil && s.Logger != nil {
			s.Logger.Warn("crossword bank sync failed; keeping current bank", "err", err, "version", Current().Version)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
