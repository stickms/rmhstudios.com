package doctrine

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
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
	rrows, err := tx.Query(ctx, decayUpdateSQL, ids, newXps, olds, time.Now().UTC())
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

// Decay is once per ISO week (UTC) per reputation, however many times the hourly
// Monday tick fires. Runs the real applyReputationDecay on a pool, with the
// clock injected: two passes in one week decay once; a pass the next week decays
// again; an XP award between a pass's read and write is still preserved.
func TestDecayOncePerWeek(t *testing.T) {
	dsn := os.Getenv("RMH_PERF_DSN")
	if dsn == "" {
		t.Skip("RMH_PERF_DSN not set")
	}
	ctx := context.Background()
	database, err := db.Open(ctx, dsn, 2)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Pool.Close()

	var users []string
	rows, err := database.Pool.Query(ctx, `SELECT id FROM "user" ORDER BY id LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		users = append(users, id)
	}
	rows.Close()
	if len(users) < 2 {
		t.Skip("need two users")
	}
	// The pool is not transactional here, so use unique ids and clean up.
	// (Deleting a reputation cascades its ledger rows.)
	const idA, idB = "decay-wk-a", "decay-wk-b"
	cleanup := func() {
		_, _ = database.Pool.Exec(ctx, `DELETE FROM "doctrine_reputation" WHERE id IN ($1,$2)`, idA, idB)
	}
	cleanup()
	defer cleanup()
	for i, r := range []struct {
		id string
		xp int
	}{{idA, 1000}, {idB, 1000}} {
		if _, err := database.Pool.Exec(ctx, `INSERT INTO "doctrine_reputation" ("id","userId","totalXp","lastActiveAt") VALUES ($1,$2,$3, '2020-01-01')`, r.id, users[i], r.xp); err != nil {
			t.Fatal(err)
		}
	}

	w := New(database, log.New("doctrine", "error"), telemetry.New("doctrine"))
	// Mondays (UTC): 2026-10-19 and 2026-10-26 are consecutive weeks.
	clock := time.Date(2026, 10, 19, 0, 5, 0, 0, time.UTC)
	w.nowFn = func() time.Time { return clock }
	xp := func(id string) (n int) {
		_ = database.Pool.QueryRow(ctx, `SELECT "totalXp" FROM "doctrine_reputation" WHERE id=$1`, id).Scan(&n)
		return
	}
	ledger := func(id string) (n int) {
		_ = database.Pool.QueryRow(ctx, `SELECT count(*) FROM "doctrine_reputation_ledger" WHERE "reputationId"=$1`, id).Scan(&n)
		return
	}
	pass := func() {
		t.Helper()
		if err := w.applyReputationDecay(ctx); err != nil {
			t.Fatal(err)
		}
	}

	// Week 1: the first Monday tick decays; the other 23 hours are no-ops.
	for h := 0; h < 24; h++ {
		clock = time.Date(2026, 10, 19, h, 5, 0, 0, time.UTC)
		pass()
	}
	if xp(idA) != 950 || ledger(idA) != 1 {
		t.Fatalf("week 1: xp=%d ledger=%d, want 950 and 1 (decayed once)", xp(idA), ledger(idA))
	}

	// Week 2: decays again, once.
	for h := 0; h < 24; h += 12 {
		clock = time.Date(2026, 10, 26, h, 5, 0, 0, time.UTC)
		pass()
	}
	if xp(idA) != 902 || ledger(idA) != 2 { // floor(950*0.95)
		t.Fatalf("week 2: xp=%d ledger=%d, want 902 and 2", xp(idA), ledger(idA))
	}

	// Concurrent award: the row read for the pass changes before its write, so it
	// is skipped, keeps the award, is not stamped, and decays on the next tick
	// only if it is still inactive.
	clock = time.Date(2026, 11, 2, 0, 5, 0, 0, time.UTC)
	reps, err := w.inactiveReputations(ctx, clock.AddDate(0, 0, -7), clock)
	if err != nil {
		t.Fatal(err)
	}
	var mine []inactiveRep
	for _, r := range reps {
		if r.id == idA || r.id == idB {
			mine = append(mine, r)
		}
	}
	if len(mine) != 2 {
		t.Fatalf("week 3 candidates = %v, want both test rows", mine)
	}
	if _, err := database.Pool.Exec(ctx, `UPDATE "doctrine_reputation" SET "totalXp" = 5000 WHERE id=$1`, idB); err != nil {
		t.Fatal(err)
	}
	ids, newXps := []string{}, []int32{}
	for _, r := range mine {
		ids = append(ids, r.id)
		newXps = append(newXps, int32(float64(r.totalXp)*(1-weeklyDecayRate)))
	}
	if err := w.applyDecayBatch(ctx, mine, ids, newXps, "test", clock); err != nil {
		t.Fatal(err)
	}
	if xp(idB) != 5000 || ledger(idB) != 2 { // award kept; only the two earlier weeks logged
		t.Fatalf("concurrent award: xp(b)=%d ledger(b)=%d, want 5000 and 2", xp(idB), ledger(idB))
	}
	if xp(idA) != 856 { // floor(902*0.95)
		t.Fatalf("week 3 a: xp=%d, want 856", xp(idA))
	}
	// A second pass the same week must not decay a again, and b (still inactive,
	// never stamped this week) decays now.
	pass()
	if xp(idA) != 856 || xp(idB) != 4750 {
		t.Fatalf("week 3 repeat: a=%d b=%d, want 856 and 4750", xp(idA), xp(idB))
	}
}
