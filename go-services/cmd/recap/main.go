// Command recap is the Go port of server/recap/index.ts: the Lights Out daily
// recap runner. It is a long-running scheduler that every 5 minutes posts due
// daily recaps to Discord channels, and holds a Discord gateway connection so
// the bot shows as "online". It exposes /health and /metrics on RECAP_PORT.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("recap")
	logger := log.New("recap", cfg.LogLevel)
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

	metrics := telemetry.New("recap")
	// Standalone recap historically served health on RECAP_PORT (7004).
	httpx.ServeMetrics(":"+config.GetString("RECAP_PORT", "7004"), "recap", metrics.Handler(), logger)

	if err := recap.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
