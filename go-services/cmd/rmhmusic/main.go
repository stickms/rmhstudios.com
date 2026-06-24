// Command rmhmusic is the Go port of the Node rmhmusic service: synchronized
// group music-listening rooms where the host controls playback and members share
// a queue + chat. In Node it lived inside the unified socket-server behind the
// "rmhmusic:" event prefix; here it is its own standalone service.
//
// It serves the realtime hub at "/rmhmusic-ws/" plus /health and /metrics, on
// RMHMUSIC_PORT (default 7002). Unlike the legacy games server, rmhmusic REQUIRES
// authentication (hub RequireAuth: true), so the database (which backs session
// validation) is mandatory.
package main

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/rmhmusic"
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
	cfg, err := config.LoadCommon("rmhmusic")
	logger := log.New("rmhmusic", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// rmhmusic requires auth, so the database (session validation + the room-row
	// write) is mandatory.
	database, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("rmhmusic")
	host, _ := os.Hostname()
	bus, _ := events.FromURL(host, cfg.RedisURL)
	defer bus.Close()

	v := auth.NewValidator(database.Pool)
	hub := realtime.NewHub(ctx, realtime.Options{
		Origin:       host,
		Logger:       logger,
		Metrics:      metrics,
		Validator:    v,
		Bus:          bus,
		AllowOrigins: config.GetCSV("SOCKET_CORS_ORIGIN"), // empty => allow all
		RequireAuth:  true,                                // rmhmusic requires auth
	})

	mgr := rmhmusic.NewManager(hub, logger, rmhmusic.NewPgRepo(database))
	mgr.Register()
	mgr.Start(ctx)
	defer mgr.Stop()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("rmhmusic", nil))
	// Health also exposed under the public WS prefix so the status page can probe
	// the real user-facing path (the edge already routes /rmhmusic-ws/* here). The
	// exact "/rmhmusic-ws/health" pattern wins over the "/rmhmusic-ws/" subtree.
	mux.HandleFunc("/rmhmusic-ws/health", httpx.Health("rmhmusic", nil))
	mux.Handle("/metrics", metrics.Handler())
	mux.HandleFunc("/rmhmusic-ws/", hub.ServeWS)

	addr := ":" + config.GetString("RMHMUSIC_PORT", "7002")
	logger.Info("rmhmusic starting", "addr", addr, "path", "/rmhmusic-ws/")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
}
