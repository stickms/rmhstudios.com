package discordbot

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The retrying SQL helpers, tested through the `pgxConn` seam.
//
// These exist because the helpers once called THEMSELVES — a blanket rename
// rewrote `r.db.Pool.Exec(...)` inside `exec` into `r.exec(...)` — so every
// statement in the tracker recursed until the stack overflowed. In Go that is a
// fatal error, not a panic a handler can recover: it kills the whole supervisor
// process, so the bot crash-looped and recorded nothing at all.
//
// Nothing caught it because every repo method early-returns when `r.db` is nil,
// which is how the unit suite runs — no test ever reached the pool. The counting
// fake below is the fix for that: it makes "the helper calls the pool exactly
// once" a statement a test can make without a database.

// countingConn records how many times each helper reached the pool.
type countingConn struct {
	execs, queries, rows int
	err                  error
}

func (c *countingConn) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	c.execs++
	return pgconn.CommandTag{}, c.err
}

func (c *countingConn) Query(context.Context, string, ...any) (pgx.Rows, error) {
	c.queries++
	return nil, c.err
}

func (c *countingConn) QueryRow(context.Context, string, ...any) pgx.Row {
	c.rows++
	return stubRow{err: c.err}
}

type stubRow struct{ err error }

func (s stubRow) Scan(...any) error { return s.err }

func repoWithConn(conn pgxConn) *watchRepo {
	// `db` stays nil: the helpers only ever touch `conn()`, and leaving it nil
	// proves that.
	return &watchRepo{pool: conn}
}

func TestExecCallsThePoolExactlyOnce(t *testing.T) {
	conn := &countingConn{}
	r := repoWithConn(conn)

	if _, err := r.exec(context.Background(), `SELECT 1`); err != nil {
		t.Fatalf("exec: %v", err)
	}
	if conn.execs != 1 {
		t.Errorf("pool.Exec called %d times, want exactly 1", conn.execs)
	}
}

func TestQueryCallsThePoolExactlyOnce(t *testing.T) {
	conn := &countingConn{}
	r := repoWithConn(conn)

	if _, err := r.query(context.Background(), `SELECT 1`); err != nil {
		t.Fatalf("query: %v", err)
	}
	if conn.queries != 1 {
		t.Errorf("pool.Query called %d times, want exactly 1", conn.queries)
	}
}

func TestQueryRowScanCallsThePoolExactlyOnce(t *testing.T) {
	conn := &countingConn{}
	r := repoWithConn(conn)

	err := r.queryRowScan(context.Background(), "test", `SELECT 1`, nil,
		func(pgx.Row) error { return nil })
	if err != nil {
		t.Fatalf("queryRowScan: %v", err)
	}
	if conn.rows != 1 {
		t.Errorf("pool.QueryRow called %d times, want exactly 1", conn.rows)
	}
}

// A statement the driver cannot vouch never executed must NOT be retried: a
// connection that dropped awaiting a reply may well have committed, and
// re-running an insert would double-count a voice session.
func TestHelpersDoNotRetryAnUnsafeError(t *testing.T) {
	conn := &countingConn{err: errors.New("connection reset by peer")}
	r := repoWithConn(conn)

	if _, err := r.exec(context.Background(), `INSERT INTO t VALUES (1)`); err == nil {
		t.Fatal("exec returned nil for a failing statement")
	}
	if conn.execs != 1 {
		t.Errorf("pool.Exec called %d times, want 1 — an unsafe error must not be retried", conn.execs)
	}
}
