// Command bot-worker is a long-lived background worker that maintains a pool of
// AI-generated synthetic users on the RMHark feed, posting in-voice throughout
// the day. It ports server/bot-worker/index.ts.
//
// Idles harmlessly if DEEPSEEK_API_KEY is not set.
// There is no client HTTP surface — only /health and /metrics on cfg.MetricsAddr.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/botworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("bot-worker")
	logger := log.New("bot-worker", cfg.LogLevel)
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

	metrics := telemetry.New("bot-worker")
	httpx.ServeMetrics(cfg.MetricsAddr, "bot-worker", metrics.Handler(), logger)

	if err := botworker.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
