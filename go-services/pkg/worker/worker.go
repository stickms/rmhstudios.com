// Package worker defines the uniform contract every background worker exposes
// so it can run either standalone (cmd/<worker>) or as a goroutine inside the
// supervisor (cmd/supervisor). A Run blocks until ctx is cancelled or an
// unrecoverable error occurs; it never binds HTTP or calls log.Fatal.
package worker

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Deps is the shared dependency set the supervisor (or a standalone wrapper)
// builds once and hands to each worker's Run.
type Deps struct {
	DB      *db.DB
	Logger  *log.Logger
	Metrics *telemetry.Metrics
	Cfg     config.Common
}

// RunFunc is the signature every worker's Run satisfies.
type RunFunc = func(ctx context.Context, d Deps) error
