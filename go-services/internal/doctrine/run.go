package doctrine

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run builds the scheduler, starts its tickers, and blocks until ctx is
// cancelled. It owns no HTTP surface — the caller (standalone main or the
// supervisor) serves health/metrics.
func Run(ctx context.Context, d worker.Deps) error {
	w := New(d.DB, d.Logger, d.Metrics)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
