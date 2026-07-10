package botworker

import (
	"context"
	"os"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run is the entry point for the bot-worker. If DEEPSEEK_API_KEY is not set it
// logs a warning and idles until ctx is cancelled, returning nil (harmless).
// Otherwise it builds the worker, starts the tickers, and blocks until ctx is
// cancelled, then stops gracefully.
//
// Run never calls log.Fatal, never binds a port, and never panics.
func Run(ctx context.Context, d worker.Deps) error {
	apiKey := os.Getenv("DEEPSEEK_API_KEY")
	if apiKey == "" {
		d.Logger.Warn("bot-worker: DEEPSEEK_API_KEY not set — idling (no bots will be generated)")
		<-ctx.Done()
		return nil
	}

	model := os.Getenv("DEEPSEEK_MODEL")
	if model == "" {
		model = "deepseek-chat"
	}
	w := New(d, apiKey, model)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
