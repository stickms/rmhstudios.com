package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func depsFor(string) worker.Deps {
	return worker.Deps{Logger: log.New("test", "error"), Metrics: telemetry.New("test")}
}

// All workers start; a single worker error cancels the group and runGroup
// returns that error.
func TestRunGroupPropagatesWorkerError(t *testing.T) {
	boom := errors.New("boom")
	started := make(chan string, 2)
	runs := map[string]worker.RunFunc{
		"ok": func(ctx context.Context, d worker.Deps) error {
			started <- "ok"; <-ctx.Done(); return nil
		},
		"bad": func(ctx context.Context, d worker.Deps) error {
			started <- "bad"; return boom
		},
	}
	err := runGroup(context.Background(), runs, depsFor)
	if !errors.Is(err, boom) {
		t.Fatalf("expected boom, got %v", err)
	}
	if len(started) != 2 {
		t.Fatalf("expected both workers to start, got %d", len(started))
	}
}

func TestRunGroupStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runs := map[string]worker.RunFunc{
		"a": func(ctx context.Context, d worker.Deps) error { <-ctx.Done(); return nil },
	}
	done := make(chan error, 1)
	go func() { done <- runGroup(ctx, runs, depsFor) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runGroup did not return after cancel")
	}
}
