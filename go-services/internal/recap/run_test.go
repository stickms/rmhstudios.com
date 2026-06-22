package recap

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunStopsOnContextCancelNoToken(t *testing.T) {
	t.Setenv("DISCORD_ACTIVITY_BOT_TOKEN", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("recap", "error"), Metrics: telemetry.New("recap")}
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

// TestRunOnceRecoversPanic proves that a panicking runOnce does not crash the
// process. We use a panicRepo to reliably trigger the panic path via a nil
// pointer dereference in DueChannels.
func TestRunOnceRecoversPanic(t *testing.T) {
	r := newTestRunner(&panicRepo{}, &fakePoster{})
	// Must not panic — the defer in runOnce must catch it.
	r.runOnce(context.Background())
	// Reaching this line proves the panic was recovered.
}

// panicRepo simulates what a nil *db.DB does inside pgRepo.DueChannels.
type panicRepo struct{}

func (p *panicRepo) DueChannels(_ context.Context, _ time.Time) ([]DueChannel, error) {
	panic("simulated nil-DB dereference")
}
func (p *panicRepo) Participants(_ context.Context, _, _ string) ([]Participant, error) {
	return nil, nil
}
func (p *panicRepo) ClearRecap(_ context.Context, _ string) error { return nil }
