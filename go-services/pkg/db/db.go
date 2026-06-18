// Package db provides the shared Postgres access layer for every Go service.
//
// It replaces two patterns from the Node codebase at once:
//   - server/shared/prisma-client.ts (the pooled Prisma client used by the
//     socket/worker services), and
//   - the raw `pg.Pool` clients embedded in server/rmhbox/auth.ts etc.
//
// We standardize on pgx/v5's pgxpool. The same DATABASE_URL drives it, the
// pool size mirrors SERVER_DB_POOL_SIZE, and every query in the fleet runs
// through *this* pool so connection accounting is uniform.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgx connection pool with the platform's defaults.
type DB struct {
	Pool *pgxpool.Pool
}

// Open creates a pgx pool from a DSN and verifies connectivity with a ping,
// reproducing the Node client's "fail fast if the DB is unreachable" behavior.
func Open(ctx context.Context, dsn string, poolSize int32) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("db: parse DSN: %w", err)
	}
	if poolSize > 0 {
		cfg.MaxConns = poolSize
	}
	// Mirror the Node client's 30s idle / 10s connect timeouts.
	cfg.MaxConnIdleTime = 30 * time.Second
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

// Close releases the pool. Safe to call on a nil DB.
func (d *DB) Close() {
	if d != nil && d.Pool != nil {
		d.Pool.Close()
	}
}

// WaitForReachable polls the database until it answers or attempts run out.
// This ports the migrate-job / worker startup loop ("wait for DB reachability,
// 10 x 5s") from deploy.sh and the Node workers into one reusable helper.
func WaitForReachable(ctx context.Context, dsn string, attempts int, interval time.Duration) (*DB, error) {
	var lastErr error
	for i := 0; i < attempts; i++ {
		d, err := Open(ctx, dsn, 1)
		if err == nil {
			return d, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(interval):
		}
	}
	return nil, fmt.Errorf("db: not reachable after %d attempts: %w", attempts, lastErr)
}
