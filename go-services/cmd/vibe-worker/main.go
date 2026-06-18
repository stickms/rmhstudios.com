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
	"context"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("vibe-worker")
	logger := log.New("vibe-worker", cfg.LogLevel)
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

	metrics := telemetry.New("vibe-worker")

	// Metrics + health only; no client HTTP for this worker. A bind failure must
	// be fatal — otherwise the pod stays up but unprobeable, so k8s never restarts
	// it.
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", httpx.Health("vibe-worker", nil))
		mux.Handle("/metrics", metrics.Handler())
		if err := http.ListenAndServe(cfg.MetricsAddr, mux); err != nil {
			logger.Fatal("metrics server", "error", err)
		}
	}()

	// THUMB_DIR = <cwd>/db/vibe-thumbs (the shared volume the web app serves at
	// /api/vibe/thumb/{slug}), matching lib/rmhvibe/vibe-thumbs.ts.
	cwd, err := os.Getwd()
	if err != nil {
		logger.Fatal("cwd", "error", err)
	}
	thumbDir := filepath.Join(cwd, "db", "vibe-thumbs")
	execPath := os.Getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")

	capturer := vibeworker.NewChromedpCapturer(thumbDir, execPath)
	w := vibeworker.New(database, capturer, logger, metrics)
	w.Start(ctx)

	httpx.WaitForSignal()
	logger.Info("vibe-worker shutting down")
	cancel()
	w.Stop()
}
