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

	"edufunhub/chat/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secret := os.Getenv("CHAT_SERVICE_SECRET")
	if len(secret) < 32 {
		logger.Error("CHAT_SERVICE_SECRET must be at least 32 characters")
		os.Exit(1)
	}
	origins := []string{}
	for _, o := range strings.Split(os.Getenv("CHAT_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	addr := os.Getenv("CHAT_ADDR")
	if addr == "" {
		addr = ":8091"
	}
	srv := server.New(server.Config{Secret: []byte(secret), AllowedOrigins: origins, Logger: logger})
	httpServer := &http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		logger.Info("chat service listening", "addr", addr)
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
