package doctrine

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

// The batched decay statements against a real Postgres (set RMH_PERF_DSN to a
// migrated database), inside a rolled-back transaction: the update lands, and
// the ledger delta computed in SQL equals newXp - oldXp, as the per-user loop
// wrote it. A reputation whose total changed after the read is left alone (the
// concurrent award is not overwritten) and gets no ledger row.
func TestDecayBatchSQL(t *testing.T) {
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

	rows, err := tx.Query(ctx, `SELECT id FROM "user" ORDER BY id LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	var users []string
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		users = append(users, id)
	}
	rows.Close()
	if len(users) < 2 {
		t.Skip("need two users")
	}
	reps := []inactiveRep{{id: "rep-a", totalXp: 1000}, {id: "rep-b", totalXp: 37}}
	for i, r := range reps {
		if _, err := tx.Exec(ctx, `INSERT INTO "doctrine_reputation" ("id","userId","totalXp","lastActiveAt") VALUES ($1,$2,$3, now() - interval '30 days')`, r.id, users[i], r.totalXp); err != nil {
			t.Fatal(err)
		}
	}
	ids := []string{"rep-a", "rep-b"}
	newXps := []int32{950, 35}
	olds := []int32{1000, 37}
	// An XP award lands after the inactive read: rep-b is no longer 37.
	if _, err := tx.Exec(ctx, `UPDATE "doctrine_reputation" SET "totalXp" = 137 WHERE id = 'rep-b'`); err != nil {
		t.Fatal(err)
	}
	rrows, err := tx.Query(ctx, decayUpdateSQL, ids, newXps, olds)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	var applied []string
	for rrows.Next() {
		var id string
		_ = rrows.Scan(&id)
		applied = append(applied, id)
	}
	rrows.Close()
	if len(applied) != 1 || applied[0] != "rep-a" {
		t.Fatalf("applied = %v, want only rep-a (rep-b changed since the read)", applied)
	}
	if _, err := tx.Exec(ctx, decayLedgerSQL, []string{"l-a"}, []string{"rep-a"}, []int32{950}, []int32{1000}, "Weekly inactivity decay (-5%)"); err != nil {
		t.Fatalf("ledger: %v", err)
	}
	var xpA, xpB, dA, nB int
	var act string
	if err := tx.QueryRow(ctx, `SELECT (SELECT "totalXp" FROM "doctrine_reputation" WHERE id='rep-a'), (SELECT "totalXp" FROM "doctrine_reputation" WHERE id='rep-b'),
		(SELECT "xpDelta" FROM "doctrine_reputation_ledger" WHERE id='l-a'), (SELECT count(*) FROM "doctrine_reputation_ledger" WHERE "reputationId"='rep-b'),
		(SELECT "action" FROM "doctrine_reputation_ledger" WHERE id='l-a')`).Scan(&xpA, &xpB, &dA, &nB, &act); err != nil {
		t.Fatal(err)
	}
	// rep-a decayed; rep-b keeps the concurrent award (137), un-decayed and unlogged.
	if xpA != 950 || xpB != 137 || dA != -50 || nB != 0 || act != "WEEKLY_DECAY" {
		t.Fatalf("got xp %d/%d delta %d ledger(b)=%d action %s", xpA, xpB, dA, nB, act)
	}
}
