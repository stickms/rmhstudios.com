package main

import (
	"context"

	"golang.org/x/sync/errgroup"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// runGroup launches every worker's Run as a goroutine under one errgroup. The
// first worker to return a non-nil error cancels the shared context, unwinding
// the rest; runGroup then returns that error so main() can exit non-zero and
// the orchestrator restarts the supervisor.
func runGroup(ctx context.Context, runs map[string]worker.RunFunc, deps func(name string) worker.Deps) error {
	g, gctx := errgroup.WithContext(ctx)
	for name, run := range runs {
		name, run := name, run
		g.Go(func() error {
			if err := run(gctx, deps(name)); err != nil {
				return err
			}
			return nil
		})
	}
	return g.Wait()
}
