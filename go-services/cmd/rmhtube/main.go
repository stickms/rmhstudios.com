// Command rmhtube is the Go port of the standalone RmhTube watch-party server
// (server/rmhtube): one WebSocket runtime hosting synchronized video rooms with
// a shared queue and chat. It serves the realtime hub at "/rmhtube-ws/" plus
// /health and /metrics, on RMHTUBE_PORT (default 7003).
//
// Active (not-closed) rooms are restored from the database before the listener
// starts, so rooms survive restarts (members reconnect via websocket). When no
// DATABASE_URL is configured the service runs purely in-memory.
package main

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/rmhtube"
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
	cfg, err := config.LoadCommon("rmhtube")
	logger := log.New("rmhtube", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// The database backs room persistence/restore and session auth. It is
	// optional: a failed open degrades to a fully in-memory service (the legacy
	// server also started anyway when DB restore failed).
	var (
		validator *auth.Validator
		repo      rmhtube.Repo = rmhtube.NopRepo{}
	)
	if cfg.DatabaseURL != "" {
		if database, derr := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize); derr != nil {
			logger.Warn("db unavailable, running in-memory only", "error", derr)
		} else {
			defer database.Close()
			validator = auth.NewValidator(database.Pool)
			repo = rmhtube.NewPgxRepo(database.Pool)
		}
	}

	metrics := telemetry.New("rmhtube")
	host, _ := os.Hostname()
	bus, _ := events.FromURL(host, cfg.RedisURL)
	defer bus.Close()

	hub := realtime.NewHub(ctx, realtime.Options{
		Origin:       host,
		Logger:       logger,
		Metrics:      metrics,
		Validator:    validator,
		Bus:          bus,
		AllowOrigins: config.GetCSV("SOCKET_CORS_ORIGIN"), // empty => allow all
		RequireAuth:  false,
	})

	mgr := rmhtube.NewManager(ctx, hub, repo, logger, metrics)
	mgr.Register()
	defer mgr.Stop()

	// Restore active rooms before listening (mirrors restoreRoomsFromDb().then(listen)).
	if err := mgr.RestoreRoomsFromDB(); err != nil {
		logger.Error("db_restore_failed", "error", err) // start anyway
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("rmhtube", nil))
	// Health also exposed under the public WS prefix so the status page can probe
	// the real user-facing path (the edge already routes /rmhtube-ws/* here). The
	// exact "/rmhtube-ws/health" pattern wins over the "/rmhtube-ws/" subtree.
	mux.HandleFunc("/rmhtube-ws/health", httpx.Health("rmhtube", nil))
	mux.Handle("/metrics", metrics.Handler())
	mux.HandleFunc("/rmhtube-ws/", hub.ServeWS)

	addr := ":" + config.GetString("RMHTUBE_PORT", "7003")
	logger.Info("rmhtube starting", "addr", addr, "path", "/rmhtube-ws/")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
}
