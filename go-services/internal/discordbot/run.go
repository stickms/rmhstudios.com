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
		Token:       firstNonEmpty(config.GetString("DISCORD_BOT_TOKEN", ""), config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")),
		DevGuildID:  config.GetString("DISCORD_DEV_GUILD_ID", ""),
		OwnerID:     config.GetString("OWNER_ID", ""),
		DeepSeekKey: config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod: config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
	}
	if cfg.Token == "" {
		d.Logger.Warn("no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set — discord bot disabled")
		<-ctx.Done()
		return nil
	}

	configurePetRates() // apply any env overrides to the tamagotchi pacing

	deepseek := NewDeepSeekClient(cfg.DeepSeekKey, cfg.DeepSeekMod)
	repo := newPetRepo(d.DB)
	imager := newAlexImager(repo, d.Logger)
	pet := NewPetService(repo, imager, d.Logger)
	chat := NewChatService(deepseek, d.DB, d.Logger)
	chat.pet = pet // let /chat reflect and record Alex's live state

	bot, err := New(cfg, chat, pet, d.Logger)
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
