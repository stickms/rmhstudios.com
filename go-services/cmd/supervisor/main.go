// Command supervisor runs the background workers as goroutines in one
// process: it opens a single shared db pool, builds a per-worker metrics
// registry merged behind one /metrics endpoint, and launches each worker's Run
// under an errgroup. Any worker's unrecoverable error cancels the group and
// exits the process non-zero so the orchestrator restarts the whole supervisor.
// The WS hubs (gamehub/rmhmusic/rmhtube/rmhbox), gateway, and status run as
// their own processes — only the background workers are consolidated here.
package main

import (
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/botworker"
	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/internal/streaksaver"
	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("supervisor")
	logger := log.New("supervisor", cfg.LogLevel)
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

	runs := map[string]worker.RunFunc{
		"doctrine-worker": doctrine.Run,
		"vibe-worker":     vibeworker.Run,
		"recap":           recap.Run,
		"discord-bot":     discordbot.Run,
		"bot-worker":      botworker.Run,
		"streak-saver":    streaksaver.Run,
	}

	// One metrics registry per worker so the merged /metrics keeps per-worker
	// "service" labels; one shared db pool across all of them.
	metricsByWorker := make(map[string]*telemetry.Metrics, len(runs))
	all := make([]*telemetry.Metrics, 0, len(runs))
	for name := range runs {
		m := telemetry.New(name)
		metricsByWorker[name] = m
		all = append(all, m)
	}
	httpx.ServeMetrics(cfg.MetricsAddr, "supervisor", telemetry.MergedHandler(all...), logger)

	deps := func(name string) worker.Deps {
		return worker.Deps{DB: database, Logger: logger.With("worker", name), Metrics: metricsByWorker[name], Cfg: cfg}
	}

	// Bound the post-SIGTERM drain well under Compose's stop_grace_period (90s
	// for supervisor). An unbounded g.Wait() would let one stuck worker hang the
	// process until Compose SIGKILLs it, throwing away the clean-shutdown path.
	drainGrace := config.GetDuration("SHUTDOWN_DRAIN_GRACE", 80*time.Second)

	logger.Info("supervisor starting", "workers", len(runs))
	if err := runGroup(ctx, runs, deps, logger, drainGrace); err != nil {
		logger.Error("supervisor exiting on worker error", "error", err)
		os.Exit(1)
	}
	logger.Info("supervisor stopped")
}
