package discordbot

import (
	"context"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// summaryInterval is how often the /sohumbum2 summarizer sweeps for periods
// whose figures have changed. Half-hourly: a day's write-up should feel current
// without a model call per message.
const summaryInterval = 30 * time.Minute

// Run assembles the bot's services and runs the discordgo session until ctx is
// cancelled. With no bot token configured it idles (returns nil on cancel) so a
// missing secret never takes down the supervisor.
func Run(ctx context.Context, d worker.Deps) error {
	cfg := Config{
		Token:          firstNonEmpty(config.GetString("DISCORD_BOT_TOKEN", ""), config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")),
		DevGuildID:     config.GetString("DISCORD_DEV_GUILD_ID", ""),
		OwnerID:        config.GetString("OWNER_ID", ""),
		DeepSeekKey:    config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod:    config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
		MessageContent: config.GetBool("ALEX_MESSAGE_CONTENT", false),
	}
	if cfg.Token == "" {
		d.Logger.Warn("no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set — discord bot disabled")
		<-ctx.Done()
		return nil
	}

	configurePetRates() // apply any env overrides to the tamagotchi pacing

	// The logger is attached so a retried DeepSeek call says so once, rather
	// than a stalled reply looking like a hang.
	deepseek := NewDeepSeekClient(cfg.DeepSeekKey, cfg.DeepSeekMod).WithLogger(d.Logger)
	repo := newPetRepo(d.DB)
	imager := newAlexImager(repo, d.Logger)
	// Base URL of the web app that renders the /caretakers leaderboard image.
	imageBaseURL := config.GetString("ALEX_PUBLIC_BASE_URL", "https://rmhstudios.com")
	pet := NewPetService(repo, imager, deepseek, d.Logger, imageBaseURL)
	chat := NewChatService(deepseek, d.DB, d.Logger)
	chat.pet = pet // let /chat reflect and record Alex's live state

	watchCfg := loadWatchConfig()
	watchRepo := newWatchRepo(d.DB).withLogger(d.Logger)
	watch := NewWatchService(watchCfg, watchRepo, d.Logger)
	var summarizer *WatchSummarizer
	if watch != nil {
		d.Logger.Info("watch: activity tracking enabled",
			"users", len(watchCfg.UserIDs), "timeZone", watchCfg.TimeZone, "storeContent", watchCfg.StoreContent)
		summarizer = NewWatchSummarizer(watchCfg, watchRepo, deepseek, watch.loc, d.Logger)
		if summarizer == nil {
			d.Logger.Warn("watch: no DEEPSEEK_API_KEY — figures will be tracked without written summaries")
		}
	}

	bot, err := New(cfg, chat, pet, watch, summarizer, d.Logger)
	if err != nil {
		return err
	}
	return bot.Run(ctx)
}

// loadWatchConfig resolves the activity tracker's configuration.
//
// The allowlist defaults to the one account the dossier was built for, so the
// feature works without extra deployment config. `DISCORD_WATCH_USER_IDS=none`
// (or `off`) turns tracking off entirely without removing the worker — the
// documented way to disable it, since an empty env var is indistinguishable
// from an unset one and would otherwise silently re-enable the default.
func loadWatchConfig() WatchConfig {
	ids := config.GetCSV("DISCORD_WATCH_USER_IDS")
	if len(ids) == 0 {
		ids = []string{defaultWatchUserID}
	}
	if len(ids) == 1 {
		switch strings.ToLower(strings.TrimSpace(ids[0])) {
		case "none", "off", "disabled":
			ids = nil
		}
	}
	return WatchConfig{
		UserIDs:       ids,
		TimeZone:      config.GetString("DISCORD_WATCH_TIMEZONE", "America/New_York"),
		StoreContent:  config.GetBool("DISCORD_WATCH_STORE_CONTENT", true),
		RetentionDays: config.GetInt("DISCORD_WATCH_RETENTION_DAYS", 45),
		FlushInterval: config.GetDuration("DISCORD_WATCH_FLUSH_INTERVAL", time.Minute),
		GapGrace:      config.GetDuration("DISCORD_WATCH_GAP_GRACE", 10*time.Minute),
		// Unset by default: posting into a channel is the one thing this worker
		// does that other people see, so it stays off until somebody names the
		// channel deliberately.
		DigestChannelID: config.GetString("DISCORD_WATCH_DIGEST_CHANNEL_ID", ""),
		SiteURL: strings.TrimRight(config.GetString("SITE_URL",
			config.GetString("VITE_BETTER_AUTH_URL", "https://rmhstudios.com")), "/"),
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
