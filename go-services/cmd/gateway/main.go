// Command gateway is the edge/BFF that fronts the whole rmhstudios platform on
// PORT_WEB (default 7005). It is the single ingress target the Helm chart from
// PR #121 routes to: it reverse-proxies the React SSR/Nitro app and the Go
// realtime services (WebSocket pass-through included), validates Better Auth
// sessions into trusted identity headers, optionally serves built static
// assets, and exposes /health + /metrics.
package main

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/gateway"
	"github.com/rmhstudios/rmh-go/pkg/auth"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("gateway")
	logger := log.New("gateway", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("gateway")
	v := auth.NewValidator(database.Pool)

	router, err := gateway.NewRouter(gateway.LoadConfig(), logger)
	if err != nil {
		logger.Fatal("router", "error", err)
	}

	// The proxy router handles everything that isn't a gateway-local endpoint.
	// AuthMiddleware runs in front of it so every proxied request carries the
	// trusted identity headers (or none, for anonymous traffic).
	proxied := gateway.AuthMiddleware(v)(router)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("gateway", nil))
	mux.Handle("/metrics", metrics.Handler())
	// Catch-all: hand off to the auth-wrapped proxy router.
	mux.Handle("/", proxied)

	addr := ":" + config.GetString("PORT_WEB", "7005")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
		os.Exit(1)
	}
}
