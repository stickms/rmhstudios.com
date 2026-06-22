// Command vibe-worker is a long-lived background worker that renders gallery
// thumbnails for AI-generated vibe pages. It ports server/vibe-worker/index.ts:
// it polls "vibe_page" rows flagged thumbnailStale, renders each page's HTML in
// headless Chromium, downscales it, writes the PNG to the shared db/vibe-thumbs
// volume, and clears the stale flag with optimistic concurrency.
//
// There is no client HTTP surface — only /health and /metrics on cfg.MetricsAddr.
//
// RUNTIME REQUIREMENT: a Chromium/Chrome binary must be present. In production it
// is provided via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; locally chromedp discovers
// an installed Chrome.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("vibe-worker")
	logger := log.New("vibe-worker", cfg.LogLevel)
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

	metrics := telemetry.New("vibe-worker")
	httpx.ServeMetrics(cfg.MetricsAddr, "vibe-worker", metrics.Handler(), logger)

	if err := vibeworker.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
