// Command rmhbox is the Go port of the Node "server/rmhbox" Jackbox-style
// party-game server. It serves the realtime hub at "/rmhbox-ws/" plus /health
// and /metrics on RMHBOX_PORT (default 7676). It builds on the shared
// realtime.Hub (replacing Socket.IO) and persists match results via raw pgx.
package main

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/rmhbox"
	"github.com/rmhstudios/rmh-go/pkg/auth"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/events"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("rmhbox")
	logger := log.New("rmhbox", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// The database backs match persistence + leaderboard reads. It is optional:
	// a failed open degrades to in-memory play with persistence disabled.
	var (
		database  *db.DB
		validator *auth.Validator
	)
	if cfg.DatabaseURL != "" {
		if d, derr := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize); derr != nil {
			logger.Warn("db unavailable, persistence disabled", "error", derr)
		} else {
			database = d
			defer database.Close()
			validator = auth.NewValidator(database.Pool)
		}
	}

	metrics := telemetry.New("rmhbox")
	host, _ := os.Hostname()
	bus, _ := events.FromURL(host, cfg.RedisURL)
	defer bus.Close()

	hub := realtime.NewHub(ctx, realtime.Options{
		Origin:       host,
		Logger:       logger,
		Metrics:      metrics,
		Validator:    validator,
		Bus:          bus,
		AllowOrigins: config.GetCSV("SOCKET_CORS_ORIGIN"),
		RequireAuth:  false,
	})

	mgr := rmhbox.NewManager(hub, database, logger)
	mgr.Register()
	mgr.Start()
	defer mgr.Stop()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("rmhbox", nil))
	mux.Handle("/metrics", metrics.Handler())
	mux.HandleFunc("/rmhbox-ws/", hub.ServeWS)

	addr := ":" + config.GetString("RMHBOX_PORT", "7676")
	logger.Info("rmhbox starting", "addr", addr, "path", "/rmhbox-ws/")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
}
