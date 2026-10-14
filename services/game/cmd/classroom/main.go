// Command classroom serves the 3D classroom world (container edufunhub-classroom).
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

	"edufunhub/game/internal/classroomsrv"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secret := os.Getenv("GAME_SERVICE_SECRET")
	if len(secret) < 32 {
		logger.Error("GAME_SERVICE_SECRET must be at least 32 characters")
		os.Exit(1)
	}
	origins := []string{}
	for _, o := range strings.Split(os.Getenv("CLASSROOM_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	srv := classroomsrv.New(classroomsrv.Config{
		Secret:         []byte(secret),
		ChatURL:        os.Getenv("CLASSROOM_CHAT_URL"),
		AllowedOrigins: origins,
		Logger:         logger,
	})
	addr := os.Getenv("CLASSROOM_ADDR")
	if addr == "" {
		addr = ":8092"
	}
	httpServer := &http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		logger.Info("classroom service listening", "addr", addr)
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
