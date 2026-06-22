// Command discord-bot is the Go port of server/discord-bot/index.ts: a
// long-running Discord gateway bot. It exposes only /health and /metrics on
// cfg.MetricsAddr (no client-facing HTTP) and is driven by the discordgo
// session lifecycle — open session, register slash commands on ready, block on
// signal, close — following the FOUNDATION worker skeleton.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("discord-bot")
	logger := log.New("discord-bot", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	// DB is used for /chat session persistence. The chat handler tolerates a nil
	// DB, but we wait for reachability like the other workers do.
	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("discord-bot")
	// Metrics + health only; no client HTTP for this bot. A bind failure must be
	// fatal — otherwise the pod stays up but unprobeable, so k8s never restarts it.
	httpx.ServeMetrics(cfg.MetricsAddr, "discord-bot", metrics.Handler(), logger)

	if err := discordbot.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
