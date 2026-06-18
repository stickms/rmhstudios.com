// Command recap is the Go port of server/recap/index.ts: the Lights Out daily
// recap runner. It is a long-running scheduler that every 5 minutes posts due
// daily recaps to Discord channels, and holds a Discord gateway connection so
// the bot shows as "online". It exposes /health and /metrics on RECAP_PORT.
package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"

	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("recap")
	logger := log.New("recap", cfg.LogLevel)
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

	metrics := telemetry.New("recap")

	// Env (matches index.ts):
	//   DISCORD_ACTIVITY_BOT_TOKEN, VITE_DISCORD_ACTIVITY_CLIENT_ID
	//   (fallback DISCORD_ACTIVITY_CLIENT_ID), SITE_URL (fallback chain).
	botToken := config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")
	appID := config.GetString("VITE_DISCORD_ACTIVITY_CLIENT_ID",
		config.GetString("DISCORD_ACTIVITY_CLIENT_ID", ""))
	siteURL := stripTrailingSlash(config.GetString("SITE_URL",
		config.GetString("VITE_BETTER_AUTH_URL", "https://rmhstudios.com")))

	// Build the Discord session (gateway presence + REST). discordgo.Open()
	// handles heartbeats/reconnect/resume — far simpler than the hand-rolled Node
	// gateway. When no bot token is set the runner still serves health/metrics
	// but skips posting (mirrors the Node `if (!BOT_TOKEN)` guard, minus exit).
	var session *discordgo.Session
	if botToken != "" {
		session, err = discordgo.New("Bot " + botToken)
		if err != nil {
			logger.Fatal("discord session", "error", err)
		}
		// No privileged intents needed (index.ts identifies with intents: 0).
		session.Identify.Intents = discordgo.IntentsNone
		// Presence: "online", playing "RMHBox" (op-2 presence in index.ts).
		session.Identify.Presence = discordgo.GatewayStatusUpdate{
			Status: "online",
			Game:   discordgo.Activity{Name: "RMHBox", Type: discordgo.ActivityTypeGame},
		}
	} else {
		logger.Warn("no DISCORD_ACTIVITY_BOT_TOKEN set — recap posting disabled")
	}

	runner := recap.New(database, session, recap.Config{
		BotToken: botToken,
		AppID:    appID,
		SiteURL:  siteURL,
	}, logger, metrics)
	runner.Start(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("recap", nil))
	mux.Handle("/metrics", metrics.Handler())

	addr := ":" + config.GetString("RECAP_PORT", "7004")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}

	cancel()
	runner.Stop()
}

// stripTrailingSlash ports lib/url.ts stripTrailingSlash (trim trailing slashes).
func stripTrailingSlash(url string) string {
	return strings.TrimRight(url, "/")
}
