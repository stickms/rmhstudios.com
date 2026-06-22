package doctrine

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run must return promptly (nil) when its context is cancelled, with a nil DB.
func TestRunStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("doctrine", "error"), Metrics: telemetry.New("doctrine")}

	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil on clean shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
}
