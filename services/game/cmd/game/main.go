package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"edufunhub/game/internal/crossword"
	"edufunhub/game/internal/orderrush"
	"edufunhub/game/internal/portsorter"
	"edufunhub/game/internal/questions"
	"edufunhub/game/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secret := os.Getenv("GAME_SERVICE_SECRET")
	if len(secret) < 32 {
		logger.Error("GAME_SERVICE_SECRET must be at least 32 characters")
		os.Exit(1)
	}
	origins := []string{}
	for _, o := range strings.Split(os.Getenv("GAME_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	srv := server.New(server.Config{
		Secret:         []byte(secret),
		ResultURL:      os.Getenv("GAME_RESULT_URL"),
		AllowedOrigins: origins,
		Logger:         logger,
	})
	addr := os.Getenv("GAME_ADDR")
	if addr == "" {
		addr = ":8090"
	}
	httpServer := &http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				srv.Prune(30 * time.Minute)
			}
		}
	}()
	go srv.RunDuels(ctx, 250*time.Millisecond)
	go srv.RunSnakes(ctx, 250*time.Millisecond)
	go srv.RunCrosswords(ctx, time.Second)
	go srv.RunMinigames(ctx, 250*time.Millisecond)
	go srv.RunFloorDrop(ctx, time.Second)
	go srv.RunHeist(ctx, time.Second)
	go srv.RunOrderRush(ctx, time.Second)
	if bankURL := os.Getenv("GAME_QUESTION_BANK_URL"); bankURL != "" {
		syncer := &questions.Syncer{URL: bankURL, Secret: []byte(secret), Logger: logger}
		go syncer.Run(ctx, time.Minute)
	}
	if seqURL := os.Getenv("GAME_SEQUENCE_BANK_URL"); seqURL != "" {
		syncer := &orderrush.Syncer{URL: seqURL, Secret: []byte(secret), Logger: logger}
		go syncer.Run(ctx, time.Minute)
	}
	if sorterURL := os.Getenv("GAME_SORTER_BANK_URL"); sorterURL != "" {
		syncer := &portsorter.Syncer{URL: sorterURL, Secret: []byte(secret), Logger: logger}
		go syncer.Run(ctx, time.Minute)
	}
	if wordsURL := os.Getenv("GAME_CROSSWORD_BANK_URL"); wordsURL != "" {
		syncer := &crossword.Syncer{URL: wordsURL, Secret: []byte(secret), Logger: logger}
		go syncer.Run(ctx, time.Minute)
	}
	go func() {
		logger.Info("game service listening", "addr", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("listen failed", "err", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdown)
}
