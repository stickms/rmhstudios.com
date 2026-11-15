package main

import (
	"context"
	"os"
	"regexp"
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

// newDBProbe returns a func(ctx context.Context) status.ProbeResult that runs the SAME health check the Node
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

var pgbossSchemaRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// jobFreshness returns a reader for status.Config.JobLastSuccess: the latest
// COMPLETED run per pg-boss queue (status.NodeJobQueues), straight from the
// queue's own job table. A sweep that failed is state 'failed', so it does not
// count. Nil when there is no DATABASE_URL. The schema is PGBOSS_SCHEMA
// (default "pgboss"), the same setting lib/jobs/boss.server.ts reads.
func jobFreshness(dsn string, timeout time.Duration) func(ctx context.Context) (map[string]time.Time, error) {
	schema := pgbossSchema()
	if dsn == "" || schema == "" {
		return nil
	}
	d := &dbProbe{dsn: dsn, timeout: timeout}
	query := `SELECT name, max(completed_on) FROM ` + schema + `.job WHERE name = ANY($1) AND state = 'completed' GROUP BY name`
	return func(ctx context.Context) (map[string]time.Time, error) {
		pool, err := d.ensurePool(ctx)
		if err != nil {
			return nil, err
		}
		qctx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		rows, err := pool.Query(qctx, query, status.NodeJobQueues())
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := map[string]time.Time{}
		for rows.Next() {
			var name string
			var t *time.Time
			if err := rows.Scan(&name, &t); err != nil {
				return nil, err
			}
			if t != nil {
				out[name] = *t
			}
		}
		return out, rows.Err()
	}
}

// pgbossSchema is the pg-boss schema (PGBOSS_SCHEMA, default "pgboss", the
// setting lib/jobs/boss.server.ts reads); "" when the value is not a plain
// identifier, which disables the readers that would interpolate it.
func pgbossSchema() string {
	schema := os.Getenv("PGBOSS_SCHEMA")
	if schema == "" {
		schema = "pgboss"
	}
	if !pgbossSchemaRE.MatchString(schema) {
		return ""
	}
	return schema
}

// discordHeartbeatQuery reads the Discord bot's heartbeat queue: whether its
// cron is scheduled (the bot has a token and means to be online) and the newest
// COMPLETED heartbeat job (a failed one is a minute the gateway was not READY).
func discordHeartbeatQuery(schema string) string {
	return `SELECT EXISTS (SELECT 1 FROM ` + schema + `.schedule WHERE name = $1),
		(SELECT max(completed_on) FROM ` + schema + `.job WHERE name = $1 AND state = 'completed')`
}

// discordHeartbeat returns a reader for status.Config.DiscordGateway (B07).
// Nil when there is no DATABASE_URL.
func discordHeartbeat(dsn string, timeout time.Duration) func(ctx context.Context) (status.GatewayHeartbeat, error) {
	schema := pgbossSchema()
	if dsn == "" || schema == "" {
		return nil
	}
	d := &dbProbe{dsn: dsn, timeout: timeout}
	query := discordHeartbeatQuery(schema)
	return func(ctx context.Context) (status.GatewayHeartbeat, error) {
		pool, err := d.ensurePool(ctx)
		if err != nil {
			return status.GatewayHeartbeat{}, err
		}
		qctx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		var hb status.GatewayHeartbeat
		var last *time.Time
		if err := pool.QueryRow(qctx, query, status.JobQueueDiscordHeartbeat).Scan(&hb.Scheduled, &last); err != nil {
			return status.GatewayHeartbeat{}, err
		}
		if last != nil {
			hb.LastCompleted = *last
		}
		return hb, nil
	}
}

// puzzlesReadyFor returns a reader for status.Config.PuzzlesReadyFor (A19): the
// latest UTC day for which every doctrine puzzle mode (6, SAHUR_SPECIAL included)
// exists, looked at straight in doctrine_puzzle so it does not depend on which
// process generated them. Zero time when no day in the window is complete. Nil
// when there is no DATABASE_URL.
func puzzlesReadyFor(dsn string, timeout time.Duration) func(ctx context.Context) (time.Time, error) {
	if dsn == "" {
		return nil
	}
	d := &dbProbe{dsn: dsn, timeout: timeout}
	const query = `SELECT max("date") FROM (
		SELECT "date" FROM doctrine_puzzle
		WHERE "date" >= ((now() AT TIME ZONE 'utc')::date - 2)
		GROUP BY "date" HAVING count(DISTINCT "mode") >= 6) d`
	return func(ctx context.Context) (time.Time, error) {
		pool, err := d.ensurePool(ctx)
		if err != nil {
			return time.Time{}, err
		}
		qctx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		var day *time.Time
		if err := pool.QueryRow(qctx, query).Scan(&day); err != nil {
			return time.Time{}, err
		}
		if day == nil {
			return time.Time{}, nil
		}
		return time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC), nil
	}
}
