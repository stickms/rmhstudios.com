package vibeworker

import (
	"context"
	"os"
	"path/filepath"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run wires the Chromium capturer and thumbnail directory, starts the poll
// loop, and blocks until ctx is cancelled.
func Run(ctx context.Context, d worker.Deps) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	thumbDir := filepath.Join(cwd, "db", "vibe-thumbs")
	execPath := os.Getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")

	capturer := NewChromedpCapturer(thumbDir, execPath)
	w := New(d.DB, capturer, d.Logger, d.Metrics)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
