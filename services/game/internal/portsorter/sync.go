package portsorter

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

// Syncer pulls the admin-managed sorter bank from Laravel. The request is
// signed with the shared game secret: hex(HMAC-SHA256(timestamp + ".")).
// Running games keep the set they started with.
type Syncer struct {
	URL    string
	Secret []byte
	Client *http.Client
	Logger *slog.Logger
}

// SyncOnce fetches, validates and activates the bank. Failures keep the
// current bank (the built-in bank until the first successful sync).
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
		return fmt.Errorf("status %s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	bank, err := Parse(body)
	if err != nil {
		return err
	}
	if prev := Current(); prev.Version != bank.Version && s.Logger != nil {
		s.Logger.Info("sorter bank synced", "version", bank.Version, "sets", len(bank.Sets))
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
			s.Logger.Warn("sorter bank sync failed; keeping current bank", "err", err, "version", Current().Version)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
