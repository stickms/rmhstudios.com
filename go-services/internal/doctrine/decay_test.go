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
// wrote it.
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
	if _, err := tx.Exec(ctx, decayUpdateSQL, ids, newXps); err != nil {
		t.Fatalf("update: %v", err)
	}
	if _, err := tx.Exec(ctx, decayLedgerSQL, []string{"l-a", "l-b"}, ids, newXps, olds, "Weekly inactivity decay (-5%)"); err != nil {
		t.Fatalf("ledger: %v", err)
	}
	var xpA, xpB, dA, dB int
	var act string
	if err := tx.QueryRow(ctx, `SELECT (SELECT "totalXp" FROM "doctrine_reputation" WHERE id='rep-a'), (SELECT "totalXp" FROM "doctrine_reputation" WHERE id='rep-b'),
		(SELECT "xpDelta" FROM "doctrine_reputation_ledger" WHERE id='l-a'), (SELECT "xpDelta" FROM "doctrine_reputation_ledger" WHERE id='l-b'),
		(SELECT "action" FROM "doctrine_reputation_ledger" WHERE id='l-a')`).Scan(&xpA, &xpB, &dA, &dB, &act); err != nil {
		t.Fatal(err)
	}
	if xpA != 950 || xpB != 35 || dA != -50 || dB != -2 || act != "WEEKLY_DECAY" {
		t.Fatalf("got xp %d/%d delta %d/%d action %s", xpA, xpB, dA, dB, act)
	}
}
