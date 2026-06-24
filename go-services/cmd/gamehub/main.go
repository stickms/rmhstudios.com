// Command gamehub is the Go port of the unified Socket.IO games server
// (server/socket-server): one WebSocket runtime hosting every mini-game relay.
// It serves the realtime hub at "/socket/" plus /health and /metrics, on
// SOCKET_PORT (default 7001). Auth is soft — anonymous connections are allowed
// by the hub (RequireAuth defaults to false), matching the legacy soft-auth
// middleware.
package main

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/gamehub"
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
	cfg, err := config.LoadCommon("gamehub")
	logger := log.New("gamehub", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// The database backs soft-auth session lookups. It is optional: the legacy
	// server allowed connections even when auth was unavailable, so a failed DB
	// open degrades to fully-anonymous rather than fatal.
	var validator *auth.Validator
	if cfg.DatabaseURL != "" {
		if database, derr := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize); derr != nil {
			logger.Warn("db unavailable, running anonymous-only", "error", derr)
		} else {
			defer database.Close()
			validator = auth.NewValidator(database.Pool)
		}
	}

	metrics := telemetry.New("gamehub")
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
		RequireAuth:  false,                               // soft-auth: anonymous allowed
	})

	mgr := gamehub.NewManager(hub, logger)
	mgr.Register()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("gamehub", nil))
	// Same health check exposed under the public WS prefix. The edge (Apache
	// ProxyPass /socket/ → here; the Go gateway by longest-prefix) already routes
	// /socket/* to this service, so /socket/health is reachable through the real
	// public path — letting the status page probe user-facing reachability (DNS
	// → CDN → proxy → service) rather than just internal container health. The
	// exact "/socket/health" pattern wins over the "/socket/" subtree in ServeMux.
	mux.HandleFunc("/socket/health", httpx.Health("gamehub", nil))
	mux.Handle("/metrics", metrics.Handler())
	mux.HandleFunc("/socket/", hub.ServeWS)

	addr := ":" + config.GetString("SOCKET_PORT", "7001")
	logger.Info("gamehub starting", "addr", addr, "path", "/socket/")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
}
