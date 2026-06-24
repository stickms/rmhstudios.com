package vibeworker

import (
	"context"
	"os"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run wires the Chromium capturer (which uploads thumbnails to object storage),
// starts the poll loop, and blocks until ctx is cancelled.
func Run(ctx context.Context, d worker.Deps) error {
	execPath := os.Getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")

	capturer := NewChromedpCapturer(execPath)
	w := New(d.DB, capturer, d.Logger, d.Metrics)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
