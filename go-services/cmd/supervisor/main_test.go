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

var testLogger = log.New("test", "error")

// All workers start; a single worker error cancels the group and runGroup
// returns that error.
func TestRunGroupPropagatesWorkerError(t *testing.T) {
	boom := errors.New("boom")
	started := make(chan string, 2)
	runs := map[string]worker.RunFunc{
		"ok": func(ctx context.Context, d worker.Deps) error {
			started <- "ok"
			<-ctx.Done()
			return nil
		},
		"bad": func(ctx context.Context, d worker.Deps) error {
			started <- "bad"
			return boom
		},
	}
	err := runGroup(context.Background(), runs, depsFor, testLogger, time.Second)
	if !errors.Is(err, boom) {
		t.Fatalf("expected boom, got %v", err)
	}
	if len(started) != 2 {
		t.Fatalf("expected both workers to start, got %d", len(started))
	}
}

// A SIGTERM-style context cancel drains the workers and returns nil (a clean
// stop, not a crash) once they finish in-flight work.
func TestRunGroupStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runs := map[string]worker.RunFunc{
		"a": func(ctx context.Context, d worker.Deps) error { <-ctx.Done(); return nil },
	}
	done := make(chan error, 1)
	go func() { done <- runGroup(ctx, runs, depsFor, testLogger, time.Second) }()
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

// A worker that ignores the shutdown signal must not hang the process: runGroup
// bounds the drain by drainGrace, then force-exits (returns nil) rather than
// waiting for the straggler — the property that keeps a stuck worker from
// riding past Compose's kill grace.
func TestRunGroupBoundsDrainOnStuckWorker(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	release := make(chan struct{})
	defer close(release)
	runs := map[string]worker.RunFunc{
		"stuck": func(_ context.Context, d worker.Deps) error {
			<-release // never respects ctx — only the test releasing it stops this
			return nil
		},
	}
	done := make(chan error, 1)
	go func() { done <- runGroup(ctx, runs, depsFor, testLogger, 50*time.Millisecond) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil after bounded drain, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runGroup did not force-exit past the drain deadline")
	}
}
