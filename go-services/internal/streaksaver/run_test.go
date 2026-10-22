package streaksaver

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type countingExec struct {
	calls    int
	failBulk bool
	failUser string
	sqls     []string
}

func (c *countingExec) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	c.calls++
	c.sqls = append(c.sqls, sql)
	if sql == insertReminders && c.failBulk {
		return pgconn.CommandTag{}, errors.New("fk violation")
	}
	if sql == insertReminder && args[1] == c.failUser {
		return pgconn.CommandTag{}, errors.New("fk violation")
	}
	return pgconn.CommandTag{}, nil
}

type nopLog struct{}

func (nopLog) Error(string, ...any) {}

func targets(n int) []reminder {
	out := make([]reminder, n)
	for i := range out {
		out[i] = reminder{UserID: "u" + string(rune('a'+i%26)) + string(rune('a'+i/26%26)), Current: 3 + i%5}
	}
	return out
}

// A full sweep (batchLimit = 500 users) is ONE statement, not 500.
func TestInsertAllIsOneStatement(t *testing.T) {
	ex := &countingExec{}
	got := insertAll(context.Background(), ex, nopLog{}, targets(batchLimit))
	if ex.calls != 1 || len(got) != batchLimit {
		t.Fatalf("%d statements, %d reminders; want 1 and %d", ex.calls, len(got), batchLimit)
	}
}

// If the batch is rejected, every user is retried alone and only the bad one is lost.
func TestInsertAllFallsBackPerUser(t *testing.T) {
	ts := targets(10)
	ex := &countingExec{failBulk: true, failUser: ts[3].UserID}
	got := insertAll(context.Background(), ex, nopLog{}, ts)
	if len(got) != 9 || ex.calls != 11 {
		t.Fatalf("%d reminders, %d statements; want 9 and 11", len(got), ex.calls)
	}
	for _, r := range got {
		if r.UserID == ts[3].UserID {
			t.Fatal("failed user reported as reminded")
		}
	}
}

func TestInsertAllEmpty(t *testing.T) {
	ex := &countingExec{}
	if got := insertAll(context.Background(), ex, nopLog{}, nil); got != nil || ex.calls != 0 {
		t.Fatalf("empty sweep touched the database: %d calls", ex.calls)
	}
}

// The batched SQL against a real Postgres (set RMH_PERF_DSN to a migrated DB):
// it must type-check against the NotificationType enum and write the same rows
// the per-user statement does. Runs in a rolled-back transaction.
func TestInsertRemindersSQLMatchesPerUser(t *testing.T) {
	dsn := os.Getenv("RMH_PERF_DSN")
	if dsn == "" {
		t.Skip("RMH_PERF_DSN not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	var uid string
	if err := tx.QueryRow(ctx, `SELECT id FROM "user" LIMIT 1`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, insertReminders, []string{"bulk1"}, []string{uid}, []string{"7"}, []string{"p"}); err != nil {
		t.Fatalf("batched insert: %v", err)
	}
	if _, err := tx.Exec(ctx, insertReminder, "single1", uid, "7", "p"); err != nil {
		t.Fatalf("per-user insert: %v", err)
	}
	var same bool
	err = tx.QueryRow(ctx, `
		SELECT a.type = b.type AND a."entityType" = b."entityType" AND a."entityId" = b."entityId"
		   AND a.preview = b.preview AND a.link = b.link AND a.read = b.read AND a."userId" = b."userId"
		FROM "notification" a, "notification" b WHERE a.id = 'bulk1' AND b.id = 'single1'`).Scan(&same)
	if err != nil || !same {
		t.Fatalf("rows differ (err %v)", err)
	}
}
