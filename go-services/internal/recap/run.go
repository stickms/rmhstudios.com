package recap

import (
	"context"
	"strings"

	"github.com/bwmarrin/discordgo"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run builds the Discord session (skipped when no token is set, mirroring the
// Node `if (!BOT_TOKEN)` guard), starts the recap scheduler, and blocks until
// ctx is cancelled.
func Run(ctx context.Context, d worker.Deps) error {
	botToken := config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")
	appID := config.GetString("VITE_DISCORD_ACTIVITY_CLIENT_ID",
		config.GetString("DISCORD_ACTIVITY_CLIENT_ID", ""))
	siteURL := stripTrailingSlash(config.GetString("SITE_URL",
		config.GetString("VITE_BETTER_AUTH_URL", "https://rmhstudios.com")))

	var session *discordgo.Session
	if botToken != "" {
		s, err := discordgo.New("Bot " + botToken)
		if err != nil {
			return err
		}
		s.Identify.Intents = discordgo.IntentsNone
		s.Identify.Presence = discordgo.GatewayStatusUpdate{
			Status: "online",
			Game:   discordgo.Activity{Name: "RMHBox", Type: discordgo.ActivityTypeGame},
		}
		session = s
	} else {
		d.Logger.Warn("no DISCORD_ACTIVITY_BOT_TOKEN set — recap posting disabled")
	}

	runner := New(d.DB, session, Config{BotToken: botToken, AppID: appID, SiteURL: siteURL}, d.Logger, d.Metrics)
	runner.Start(ctx)
	<-ctx.Done()
	runner.Stop()
	return nil
}

// stripTrailingSlash ports lib/url.ts stripTrailingSlash.
func stripTrailingSlash(url string) string { return strings.TrimRight(url, "/") }
