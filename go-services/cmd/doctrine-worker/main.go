// Command doctrine-worker runs the doctrine scheduler standalone. The worker
// logic lives in internal/doctrine.Run; this wrapper only wires config, db,
// metrics, and the /health + /metrics server. The supervisor runs the same Run.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("doctrine-worker")
	logger := log.New("doctrine-worker", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("doctrine-worker")
	httpx.ServeMetrics(cfg.MetricsAddr, "doctrine-worker", metrics.Handler(), logger)

	if err := doctrine.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
