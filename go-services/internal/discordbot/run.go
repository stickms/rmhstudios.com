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
		DeepSeekKey: config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod: config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
		XAIKey:      config.GetString("XAI_API_KEY", ""),
		XAIImageMod: config.GetString("XAI_IMAGE_MODEL", defaultXAIImageModel),
		XAIVisonMod: config.GetString("XAI_VISION_MODEL", defaultXAIVisionModel),
		Cooldown:    config.GetDuration("LIQUID_COOLDOWN", defaultCooldown),
	}
	if cfg.Token == "" {
		d.Logger.Warn("no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set — discord bot disabled")
		<-ctx.Done()
		return nil
	}
	// Both keys are optional at boot: the bot still connects and registers
	// /liquid, and the command explains which half is missing when it is run.
	if cfg.XAIKey == "" {
		d.Logger.Warn("no XAI_API_KEY set — /liquid cannot render")
	}
	if cfg.DeepSeekKey == "" {
		d.Logger.Warn("no DEEPSEEK_API_KEY set — /liquid will ship a static caption instead of a design note")
	}

	budget := newBudgetRepo(d.DB)
	xai := newXAIClient(cfg.XAIKey, cfg.XAIImageMod, cfg.XAIVisonMod, budget, d.Logger)
	deepseek := NewDeepSeekClient(cfg.DeepSeekKey, cfg.DeepSeekMod)
	liquid := NewLiquidService(xai, deepseek, cfg.Cooldown, d.Logger)

	bot, err := New(cfg, liquid, d.Logger)
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

// compile-time assertion that Run matches the worker contract.
var _ worker.RunFunc = Run
