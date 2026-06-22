package main

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rmhstudios/rmh-go/internal/status"
)

// dbProbe holds a lazily-opened pgx pool used by the Database status probe.
// It mirrors Node's getPrisma(): the pool is created on first use and reused.
type dbProbe struct {
	dsn     string
	timeout time.Duration
	mu      sync.Mutex
	pool    *pgxpool.Pool
}

// newDBProbe returns a status.ProbeFunc that runs the SAME health check the Node
// status service runs for the Database service: `SELECT 1` with a timeout. It
// reports:
//   - up      / "SELECT 1 ok"        on success (with latency)
//   - down    / <error message>      on failure (latency null)
//
// The pool is opened lazily so cmd/status can start with the DB unreachable.
func newDBProbe(dsn string, timeout time.Duration) func(ctx context.Context) status.ProbeResult {
	d := &dbProbe{dsn: dsn, timeout: timeout}
	return d.probe
}

func (d *dbProbe) ensurePool(ctx context.Context) (*pgxpool.Pool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.pool != nil {
		return d.pool, nil
	}
	cfg, err := pgxpool.ParseConfig(d.dsn)
	if err != nil {
		return nil, err
	}
	// Keep the footprint tiny — this is a health prober, not a workload pool.
	// Matches the Node adapter's max:2 / connect-timeout=PROBE_TIMEOUT_MS.
	cfg.MaxConns = 2
	cfg.MaxConnIdleTime = 30 * time.Second
	cfg.ConnConfig.ConnectTimeout = d.timeout
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	d.pool = pool
	return pool, nil
}

func (d *dbProbe) probe(ctx context.Context) status.ProbeResult {
	pool, err := d.ensurePool(ctx)
	if err != nil {
		return status.ProbeResult{Status: status.StatusDown, Detail: err.Error()}
	}

	probeCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()

	start := time.Now()
	if _, err := pool.Exec(probeCtx, "SELECT 1"); err != nil {
		return status.ProbeResult{Status: status.StatusDown, Detail: err.Error()}
	}
	latency := time.Since(start).Milliseconds()
	return status.ProbeResult{Status: status.StatusUp, LatencyMs: &latency, Detail: "SELECT 1 ok"}
}
