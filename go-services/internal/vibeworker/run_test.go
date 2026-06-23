package vibeworker

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("vibe", "error"), Metrics: telemetry.New("vibe-worker")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

// TestProcessStaleRecoversPanic proves that a panicking processStale does not
// crash the process. Worker is constructed with nil DB (via New) which makes
// NewPGRepo wrap a nil pool. On the first tick, SelectStale dereferences the
// nil pool and panics; the recovery defer must catch it, log, and return.
// Reaching the line after w.processStale proves recovery worked.
func TestProcessStaleRecoversPanic(t *testing.T) {
	// newWorker with a nil repo triggers a panic in SelectStale when called.
	// Use a panicRepo to reliably trigger the panic path.
	w := newWorker(&panicRepo{}, &fakeCapturer{}, log.New("vibe-worker-test", "error"), telemetry.New("vibe-worker-test"))
	// Must not crash the test process — panic is recovered inside processStale.
	w.processStale(context.Background())
	// Reaching this line proves the panic was recovered.
}

// panicRepo simulates what a nil *db.DB does inside PGRepo.SelectStale.
type panicRepo struct{}

func (p *panicRepo) SelectStale(_ context.Context, _ int) ([]StalePage, error) {
	panic("simulated nil-DB dereference")
}
func (p *panicRepo) ClearStale(_ context.Context, _, _ string, _ time.Time) (bool, error) {
	return false, nil
}
func (p *panicRepo) SetThumbnailURL(_ context.Context, _, _ string) error { return nil }
