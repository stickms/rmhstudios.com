// Command discord-bot is the Go port of server/discord-bot/index.ts: a
// long-running Discord gateway bot. It exposes only /health and /metrics on
// cfg.MetricsAddr (no client-facing HTTP) and is driven by the discordgo
// session lifecycle — open session, register slash commands on ready, block on
// signal, close — following the FOUNDATION worker skeleton.
package main

import (
	"context"
	"net/http"
	"time"

	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("discord-bot")
	logger := log.New("discord-bot", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
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
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", httpx.Health("discord-bot", nil))
		mux.Handle("/metrics", metrics.Handler())
		if err := http.ListenAndServe(cfg.MetricsAddr, mux); err != nil {
			logger.Fatal("metrics server", "error", err)
		}
	}()

	botCfg := discordbot.Config{
		Token:        firstNonEmpty(config.GetString("DISCORD_BOT_TOKEN", ""), config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")),
		DevGuildID:   config.GetString("DISCORD_DEV_GUILD_ID", ""),
		OwnerID:      config.GetString("OWNER_ID", ""),
		DeepSeekKey:  config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod:  config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
		WorktreesDir: config.GetString("RMHBOT_WORKTREES_DIR", ""),
		GithubToken:  config.GetString("GITHUB_TOKEN", ""),
	}
	if botCfg.Token == "" {
		logger.Fatal("config", "error", "DISCORD_BOT_TOKEN or DISCORD_ACTIVITY_BOT_TOKEN is required")
	}

	deepseek := discordbot.NewDeepSeekClient(botCfg.DeepSeekKey, botCfg.DeepSeekMod)
	chat := discordbot.NewChatService(deepseek, database, logger)
	rmhbot := discordbot.NewRmhbotService(deepseek, logger, botCfg.WorktreesDir, botCfg.GithubToken)

	bot, err := discordbot.New(botCfg, chat, rmhbot, logger)
	if err != nil {
		logger.Fatal("bot init", "error", err)
	}

	// Block on signal; Run closes the gateway when ctx is cancelled.
	go func() {
		httpx.WaitForSignal()
		cancel()
	}()
	if err := bot.Run(ctx); err != nil {
		logger.Error("bot run", "error", err)
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
