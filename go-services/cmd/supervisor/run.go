package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// runGroup launches every worker's Run as a goroutine under one errgroup and
// supervises a graceful, BOUNDED shutdown.
//
// Two exit paths:
//   - A worker returns a non-nil error → the shared context cancels, the rest
//     unwind, and runGroup returns that error so main() exits non-zero and the
//     orchestrator restarts the supervisor.
//   - The parent ctx is cancelled by SIGTERM/SIGINT (see httpx.SignalContext) →
//     every worker's ctx is now Done, so they stop pulling new work and finish
//     what's in flight. We wait for that drain, but only up to drainGrace, which
//     MUST be shorter than Compose's stop_grace_period (90s for supervisor): an
//     unbounded "wait for everything" turns one stuck worker into a hang that
//     Compose SIGKILLs anyway, discarding the clean-shutdown code entirely. Past
//     the deadline we log which workers didn't drain and force-exit 0.
func runGroup(
	ctx context.Context,
	runs map[string]worker.RunFunc,
	deps func(name string) worker.Deps,
	logger *log.Logger,
	drainGrace time.Duration,
) error {
	g, gctx := errgroup.WithContext(ctx)

	// Track which workers are still running so a drain-timeout log can name the
	// stragglers. Guarded by mu because workers finish concurrently.
	var mu sync.Mutex
	pending := make(map[string]struct{}, len(runs))
	for name := range runs {
		pending[name] = struct{}{}
	}

	for name, run := range runs {
		name, run := name, run
		g.Go(func() error {
			err := run(gctx, deps(name))
			mu.Lock()
			delete(pending, name)
			mu.Unlock()
			if err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			return nil
		})
	}

	// Wait for the group off the main goroutine so we can race it against the
	// drain deadline once a shutdown signal arrives.
	done := make(chan error, 1)
	go func() { done <- g.Wait() }()

	select {
	case err := <-done:
		// Everyone returned on their own (clean exit, or a worker error unwound
		// the group) before any shutdown signal — nothing to bound.
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received — draining workers", "grace", drainGrace.String())
	}

	start := time.Now()
	timer := time.NewTimer(drainGrace)
	defer timer.Stop()

	select {
	case err := <-done:
		logger.Info("drained cleanly", "workers", len(runs), "in", time.Since(start).Round(time.Millisecond).String())
		// A signal-driven drain is a clean stop: swallow the context.Canceled the
		// errgroup surfaces so main() exits 0 and Compose doesn't see a crash.
		if err != nil && errgroupCausedBySignal(ctx, err) {
			return nil
		}
		return err
	case <-timer.C:
		mu.Lock()
		stuck := make([]string, 0, len(pending))
		for name := range pending {
			stuck = append(stuck, name)
		}
		mu.Unlock()
		sort.Strings(stuck)
		logger.Warn("drain deadline exceeded — forcing exit",
			"grace", drainGrace.String(),
			"drained", len(runs)-len(stuck),
			"stuck", strings.Join(stuck, ","),
		)
		// Exit 0: a bounded drain that force-exits on time is the intended
		// behavior, not a crash — returning an error would make the orchestrator
		// treat a routine shutdown as a failure.
		return nil
	}
}

// errgroupCausedBySignal reports whether the group's error is just the shutdown
// propagating (the root context was cancelled), rather than a real worker
// failure. On a signal-driven drain we don't want that to look like a crash.
func errgroupCausedBySignal(ctx context.Context, err error) bool {
	return ctx.Err() != nil && (errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded))
}
