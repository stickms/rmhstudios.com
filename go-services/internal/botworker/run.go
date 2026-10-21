package botworker

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run is the entry point for the bot-worker. If DEEPSEEK_API_KEY is not set it
// logs a warning and idles until ctx is cancelled, returning nil (harmless).
// Otherwise it builds the worker, starts the tickers, and blocks until ctx is
// cancelled, then stops gracefully.
//
// Run never calls log.Fatal, never binds a port, and never panics.
func Run(ctx context.Context, d worker.Deps) error {
	apiKey := config.GetString("DEEPSEEK_API_KEY", "")
	if apiKey == "" {
		d.Logger.Warn("bot-worker: DEEPSEEK_API_KEY not set — idling (no bots will be generated)")
		<-ctx.Done()
		return nil
	}

	// The bots have their own model knob. DEEPSEEK_MODEL (the Discord bot's)
	// and RMHARK_AI_MODEL (every web AI feature's) are deliberately not read,
	// so retuning either of those never moves the bots off their model.
	model := config.GetString("BOT_AI_MODEL", defaultModel)
	w := New(d, apiKey, model, LoadConfig())
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
