// Command doctrine-worker is the Go port of server/doctrine-worker/index.ts:
// a long-lived background scheduler that generates daily puzzles, checks Sahur
// activation per timezone, and applies weekly reputation decay. It exposes only
// /health and /metrics — no client-facing HTTP.
package main

import (
	"context"
	"net/http"
	"time"

	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("doctrine-worker")
	logger := log.New("doctrine-worker", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("doctrine-worker")
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", httpx.Health("doctrine-worker", nil))
		mux.Handle("/metrics", metrics.Handler())
		if err := http.ListenAndServe(cfg.MetricsAddr, mux); err != nil {
			// A bind failure leaves the pod unprobeable (k8s liveness hits
			// /health here), so fail loudly rather than run blind.
			logger.Fatal("metrics server", "error", err)
		}
	}()

	w := doctrine.New(database, logger, metrics)
	w.Start(ctx) // launches goroutine tickers

	httpx.WaitForSignal() // block until SIGINT/SIGTERM

	cancel()
	w.Stop()
}
