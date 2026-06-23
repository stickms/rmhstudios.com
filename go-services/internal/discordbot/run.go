package discordbot

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run assembles the bot's services and runs the discordgo session until ctx is
// cancelled. With no bot token configured it idles (returns nil on cancel) so a
// missing secret never takes down the supervisor.
func Run(ctx context.Context, d worker.Deps) error {
	cfg := Config{
		Token:        firstNonEmpty(config.GetString("DISCORD_BOT_TOKEN", ""), config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")),
		DevGuildID:   config.GetString("DISCORD_DEV_GUILD_ID", ""),
		OwnerID:      config.GetString("OWNER_ID", ""),
		DeepSeekKey:  config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod:  config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
		WorktreesDir: config.GetString("RMHBOT_WORKTREES_DIR", ""),
		GithubToken:  config.GetString("GITHUB_TOKEN", ""),
	}
	if cfg.Token == "" {
		d.Logger.Warn("no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set — discord bot disabled")
		<-ctx.Done()
		return nil
	}

	deepseek := NewDeepSeekClient(cfg.DeepSeekKey, cfg.DeepSeekMod)
	chat := NewChatService(deepseek, d.DB, d.Logger)
	rmhbot := NewRmhbotService(deepseek, d.Logger, cfg.WorktreesDir, cfg.GithubToken)

	bot, err := New(cfg, chat, rmhbot, d.Logger)
	if err != nil {
		return err
	}
	return bot.Run(ctx)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
