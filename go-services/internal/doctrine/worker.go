package doctrine

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// weeklyDecayRate ports WEEKLY_DECAY_RATE from the Node worker.
const weeklyDecayRate = 0.05

// Worker is the doctrine background scheduler. It owns the three jobs ported
// from server/doctrine-worker/index.ts and runs them as goroutine tickers.
type Worker struct {
	db      *db.DB
	log     *log.Logger
	metrics *telemetry.Metrics

	wg   sync.WaitGroup
	stop chan struct{}
	once sync.Once

	// tz caches the distinct user timezones for tzListTTL (see timezones).
	tzMu    sync.Mutex
	tzList  []string
	tzAt    time.Time
	fetchTZ func(context.Context) ([]string, error) // nil = distinctTimezones; tests inject
	nowFn   func() time.Time                        // nil = time.Now; tests inject
}

// tzListTTL bounds how stale the distinct-timezone list may be. The list feeds
// the per-minute Sahur check, and the underlying query is a DISTINCT scan of the
// whole "user" table (20k rows read per call at the seeded scale, 1,440 calls a
// day). A timezone first appearing inside the cache window is picked up at most
// tzListTTL later; Sahur's activation window for a timezone is a full local
// hour, so the worst case is a late start of ten minutes for the first user ever
// to set that timezone during its 03:00 hour, and no effect otherwise.
const tzListTTL = 10 * time.Minute

// timezones returns the distinct user timezones, refreshed at most every
// tzListTTL. A failed refresh returns its error and keeps the previous list for
// the next attempt.
func (w *Worker) timezones(ctx context.Context) ([]string, error) {
	now := time.Now()
	if w.nowFn != nil {
		now = w.nowFn()
	}
	w.tzMu.Lock()
	defer w.tzMu.Unlock()
	if w.tzList != nil && now.Sub(w.tzAt) < tzListTTL {
		return w.tzList, nil
	}
	fetch := w.distinctTimezones
	if w.fetchTZ != nil {
		fetch = w.fetchTZ
	}
	list, err := fetch(ctx)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []string{}
	}
	w.tzList, w.tzAt = list, now
	return list, nil
}

// New builds a doctrine Worker. Matches the FOUNDATION worker skeleton:
// worker.New(database, logger, metrics).
func New(database *db.DB, logger *log.Logger, metrics *telemetry.Metrics) *Worker {
	return &Worker{
		db:      database,
		log:     logger,
		metrics: metrics,
		stop:    make(chan struct{}),
	}
}

// Start launches the goroutine tickers. It returns immediately. The jobs run
// until ctx is cancelled or Stop is called.
//
// Schedule (faithful to the Node startup()):
//   - generateDailyPuzzles: once at startup, then at every midnight UTC
//     (self-rescheduling).
//   - checkSahurActivation: every 60 seconds.
//   - applyReputationDecay: every hour, but only acts on Mondays (UTC).
func (w *Worker) Start(ctx context.Context) {
	w.log.Info("starting doctrine-worker")

	// Generate tomorrow's puzzles immediately (startup run).
	w.runJob(ctx, "daily_puzzles", w.generateDailyPuzzles)

	w.wg.Add(3)
	go w.runMidnightLoop(ctx)
	go w.runSahurLoop(ctx)
	go w.runDecayLoop(ctx)

	w.log.Info("all tasks scheduled")
}

// Stop signals the tickers to exit and waits for them to drain.
func (w *Worker) Stop() {
	w.once.Do(func() { close(w.stop) })
	w.wg.Wait()
	w.log.Info("doctrine-worker stopped")
}

// runMidnightLoop reschedules generateDailyPuzzles for each successive midnight
// UTC, mirroring the recursive setTimeout(schedulePuzzles, ...) in Node.
func (w *Worker) runMidnightLoop(ctx context.Context) {
	defer w.wg.Done()
	for {
		d := millisUntilMidnightUTC(time.Now().UTC())
		timer := time.NewTimer(d)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-w.stop:
			timer.Stop()
			return
		case <-timer.C:
			w.runJob(ctx, "daily_puzzles", w.generateDailyPuzzles)
		}
	}
}

// runSahurLoop runs checkSahurActivation every 60 seconds.
func (w *Worker) runSahurLoop(ctx context.Context) {
	defer w.wg.Done()
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stop:
			return
		case <-ticker.C:
			w.runJob(ctx, "sahur_activation", w.checkSahurActivation)
		}
	}
}

// runDecayLoop runs hourly and only applies decay on Mondays (UTC), matching
// the Node `setInterval(... if (isMonday()) ..., 3_600_000)`.
func (w *Worker) runDecayLoop(ctx context.Context) {
	defer w.wg.Done()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stop:
			return
		case <-ticker.C:
			if time.Now().UTC().Weekday() == time.Monday {
				w.runJob(ctx, "reputation_decay", w.applyReputationDecay)
			}
		}
	}
}

// runJob wraps a job with metrics + error logging (replacing the Node
// `.catch(e => console.error(...))` pattern).
// A deferred recover ensures a panicking job cannot crash the supervisor process.
func (w *Worker) runJob(ctx context.Context, name string, fn func(context.Context) error) {
	defer func() {
		if r := recover(); r != nil {
			w.metrics.RecordJob(name, "panic")
			w.log.Error("job panicked", "job", name, "panic", r)
		}
	}()
	if err := fn(ctx); err != nil {
		w.metrics.RecordJob(name, "error")
		w.log.Error("job failed", "job", name, "error", err)
		return
	}
	w.metrics.RecordJob(name, "ok")
}

// ─── Job 1: generateDailyPuzzles ────────────────────────────────────────────

// generateDailyPuzzles creates next-day puzzles for the 5 regular modes plus
// SAHUR_SPECIAL, with difficulty by weekday and a seeded config object, exactly
// as the Node worker does.
func (w *Worker) generateDailyPuzzles(ctx context.Context) error {
	now := time.Now().UTC()
	// tomorrow = now + 1 day, sliced to the YYYY-MM-DD date string.
	tomorrow := now.AddDate(0, 0, 1)
	dateStr := tomorrow.Format("2006-01-02")
	// date = midnight UTC of that day.
	date := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, time.UTC)
	// resetsAt = date + 1 day.
	resetDate := date.AddDate(0, 0, 1)

	dayOfWeek := int(date.Weekday()) // 0=Sunday..6=Saturday, matches getUTCDay.
	difficulty := DifficultyForWeekday(dayOfWeek)

	for _, mode := range Modes {
		exists, err := w.puzzleExists(ctx, mode, date)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		// Node: getSeedForDate(dateStr, mode.toLowerCase()).
		seed := GetSeedForDate(dateStr, toLower(mode))
		if err := w.insertPuzzle(ctx, mode, date, seed, difficulty, resetDate, false); err != nil {
			return err
		}
		w.log.Info("created puzzle", "mode", mode, "date", dateStr)
	}

	// SAHUR_SPECIAL puzzle.
	sahurExists, err := w.puzzleExists(ctx, SahurSpecialMode, date)
	if err != nil {
		return err
	}
	if !sahurExists {
		seed := GetSeedForDate(dateStr, "sahur_special")
		if err := w.insertPuzzle(ctx, SahurSpecialMode, date, seed, SahurDifficulty(difficulty), resetDate, true); err != nil {
			return err
		}
		w.log.Info("created puzzle", "mode", SahurSpecialMode, "date", dateStr)
	}
	// Every mode for tomorrow now exists: the on-call alarm (A19) pages when
	// this lags behind tomorrow after the midnight run should have advanced it.
	if w.metrics != nil {
		w.metrics.PuzzlesReadyFor.Set(float64(date.Unix()))
	}
	return nil
}

// puzzleExists reports whether a puzzle row already exists for (mode, date),
// reproducing the Prisma findUnique({ mode_date }) / findFirst guard.
func (w *Worker) puzzleExists(ctx context.Context, mode string, date time.Time) (bool, error) {
	var id string
	err := w.db.Pool.QueryRow(ctx,
		`SELECT "id" FROM "doctrine_puzzle" WHERE "mode" = $1 AND "date" = $2 LIMIT 1`,
		mode, date,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		w.metrics.DBQueries.WithLabelValues("ok").Inc()
		return false, nil
	}
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return false, err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return true, nil
}

// insertPuzzle writes one doctrine_puzzle row. The "data" JSONB stores the same
// shape the Node worker persists: { generated: true, seed: <seed> }.
func (w *Worker) insertPuzzle(ctx context.Context, mode string, date time.Time, seed, difficulty int, resetsAt time.Time, isSahur bool) error {
	data, err := json.Marshal(map[string]any{"generated": true, "seed": seed})
	if err != nil {
		return err
	}
	_, err = w.db.Pool.Exec(ctx,
		`INSERT INTO "doctrine_puzzle"
		   ("id", "mode", "date", "seed", "data", "difficulty", "resetsAt", "isSahur", "createdAt")
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
		uuid.NewString(), mode, date, seed, data, difficulty, resetsAt, isSahur,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return nil
}

// ─── Job 2: checkSahurActivation ─────────────────────────────────────────────

// checkSahurActivation finds each distinct user timezone where the local hour
// is 3 and creates a doctrine_sahur_session for (today, timezone) if one does
// not already exist. Faithful to the Node checkSahurActivation.
func (w *Worker) checkSahurActivation(ctx context.Context) error {
	timezones, err := w.timezones(ctx)
	if err != nil {
		return err
	}
	today := time.Now().UTC().Format("2006-01-02")

	for _, tz := range timezones {
		if tz == "" {
			continue
		}
		if !isSahurHour(tz, time.Now()) {
			continue
		}
		exists, err := w.sahurSessionExists(ctx, today, tz)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if err := w.insertSahurSession(ctx, today, tz); err != nil {
			return err
		}
		w.log.Info("activated sahur", "timezone", tz)
	}
	return nil
}

// distinctTimezones returns the distinct non-null user doctrineTimezone values.
func (w *Worker) distinctTimezones(ctx context.Context) ([]string, error) {
	rows, err := w.db.Pool.Query(ctx,
		`SELECT DISTINCT "doctrineTimezone" FROM "user" WHERE "doctrineTimezone" IS NOT NULL`,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var tz string
		if err := rows.Scan(&tz); err != nil {
			w.metrics.DBQueries.WithLabelValues("error").Inc()
			return nil, err
		}
		out = append(out, tz)
	}
	if err := rows.Err(); err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return out, nil
}

// sahurSessionExists reproduces findUnique({ dateKey_timezone }).
func (w *Worker) sahurSessionExists(ctx context.Context, dateKey, timezone string) (bool, error) {
	var id string
	err := w.db.Pool.QueryRow(ctx,
		`SELECT "id" FROM "doctrine_sahur_session" WHERE "dateKey" = $1 AND "timezone" = $2 LIMIT 1`,
		dateKey, timezone,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		w.metrics.DBQueries.WithLabelValues("ok").Inc()
		return false, nil
	}
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return false, err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return true, nil
}

// insertSahurSession writes a new doctrine_sahur_session row. activatedAt and
// participantCount take their column defaults (now / 0), matching the Node
// create({ data: { dateKey, timezone } }).
func (w *Worker) insertSahurSession(ctx context.Context, dateKey, timezone string) error {
	_, err := w.db.Pool.Exec(ctx,
		`INSERT INTO "doctrine_sahur_session" ("id", "dateKey", "timezone", "activatedAt", "participantCount")
		 VALUES ($1, $2, $3, now(), 0)`,
		uuid.NewString(), dateKey, timezone,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return nil
}

// ─── Job 3: applyReputationDecay ─────────────────────────────────────────────

// inactiveRep is a minimal projection of doctrine_reputation needed for decay.
type inactiveRep struct {
	id      string
	totalXp int
}

// applyReputationDecay decays totalXp by 5% for users inactive for more than 7
// days (and with totalXp > 0), writing a ledger row for each. Faithful to the
// Node applyReputationDecay. The Monday gate lives in the scheduler; the
// once-per-week guarantee lives in the database ("lastDecayedAt", see
// decayUpdateSQL), so the hourly Monday ticks after the first are no-ops.
func (w *Worker) applyReputationDecay(ctx context.Context) error {
	now := time.Now().UTC()
	if w.nowFn != nil {
		now = w.nowFn().UTC()
	}
	// oneWeekAgo = now - 7 days. Node uses local Date here; we use UTC for
	// determinism, which matches the rest of the worker's UTC scheduling.
	oneWeekAgo := now.AddDate(0, 0, -7)

	reps, err := w.inactiveReputations(ctx, oneWeekAgo, now)
	if err != nil {
		return err
	}

	reason := "Weekly inactivity decay (-5%)"
	ids := make([]string, 0, len(reps))
	newXps := make([]int32, 0, len(reps))
	for _, rep := range reps {
		// newXp = floor(totalXp * (1 - rate)); delta = newXp - totalXp.
		newXp := int(float64(rep.totalXp) * (1 - weeklyDecayRate)) // truncation == Math.floor for non-negative.
		ids = append(ids, rep.id)
		newXps = append(newXps, int32(newXp))
	}
	// Two statements for the whole pass instead of two per user: the loop used
	// to issue 2N round trips (N = inactive players) on the shared pool.
	if err := w.applyDecayBatch(ctx, reps, ids, newXps, reason, now); err != nil {
		return err
	}
	if len(reps) > 0 {
		w.log.Info("applied reputation decay", "candidates", len(reps))
	}
	return nil
}

// inactiveReputations finds reputations with lastActiveAt < cutoff and totalXp > 0
// that have not already been decayed in the ISO week containing now (UTC).
func (w *Worker) inactiveReputations(ctx context.Context, cutoff, now time.Time) ([]inactiveRep, error) {
	rows, err := w.db.Pool.Query(ctx,
		`SELECT "id", "totalXp" FROM "doctrine_reputation" WHERE "lastActiveAt" < $1 AND "totalXp" > 0
		 AND ("lastDecayedAt" IS NULL OR "lastDecayedAt" < date_trunc('week', $2::timestamp))`,
		cutoff, now,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	defer rows.Close()

	var out []inactiveRep
	for rows.Next() {
		var r inactiveRep
		if err := rows.Scan(&r.id, &r.totalXp); err != nil {
			w.metrics.DBQueries.WithLabelValues("error").Inc()
			return nil, err
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return out, nil
}

// decayUpdateSQL / decayLedgerSQL write a whole decay pass at once. The update
// is conditional on the total still being the one the new value was computed
// from ($3), so an XP award landing between the read and this write is never
// overwritten: that row is skipped (RETURNING omits it) and gets no ledger row.
// The ledger delta is computed in SQL from the old total, so for every row that
// IS decayed the delta equals the change actually written.
//
// It is also conditional on the row not having been decayed yet in the ISO week
// containing $4 (the pass time, UTC; date_trunc('week') is Monday 00:00), and
// stamps "lastDecayedAt" = $4 in the same statement. That makes the hourly
// Monday ticks idempotent: the first pass of the week decays a row, the other
// 23 (and any restart or second supervisor instance) match nothing. Row locks
// serialise two concurrent passes, and the loser re-checks the guard against the
// winner's committed stamp.
const decayUpdateSQL = `UPDATE "doctrine_reputation" r SET "totalXp" = t.xp, "lastDecayedAt" = $4::timestamp
	FROM unnest($1::text[], $2::int[], $3::int[]) AS t(id, xp, old)
	WHERE r."id" = t.id AND r."totalXp" = t.old
	  AND (r."lastDecayedAt" IS NULL OR r."lastDecayedAt" < date_trunc('week', $4::timestamp))
	RETURNING r."id"`

const decayLedgerSQL = `INSERT INTO "doctrine_reputation_ledger"
	  ("id", "reputationId", "action", "xpDelta", "reason", "metadata", "createdAt")
	SELECT t.lid, t.rid, 'WEEKLY_DECAY', t.xp - t.old, $5, NULL, now()
	FROM unnest($1::text[], $2::text[], $3::int[], $4::int[]) AS t(lid, rid, xp, old)`

// applyDecayBatch applies newXps to reps[i] and logs the ledger rows in ONE
// transaction, so a failure leaves no half-decayed pass (previously a mid-loop
// error left earlier users decayed and unlogged-or-logged inconsistently).
func (w *Worker) applyDecayBatch(ctx context.Context, reps []inactiveRep, ids []string, newXps []int32, reason string, now time.Time) error {
	if len(reps) == 0 {
		return nil
	}
	olds := make([]int32, len(reps))
	for i, r := range reps {
		olds[i] = int32(r.totalXp)
	}
	tx, err := w.db.Pool.Begin(ctx)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, decayUpdateSQL, ids, newXps, olds, now)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	applied := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			w.metrics.DBQueries.WithLabelValues("error").Inc()
			return err
		}
		applied[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	// Ledger rows only for the reputations the conditional UPDATE changed.
	var lids, rids []string
	var lnew, lold []int32
	for i, id := range ids {
		if applied[id] {
			lids = append(lids, uuid.NewString())
			rids = append(rids, id)
			lnew = append(lnew, newXps[i])
			lold = append(lold, olds[i])
		}
	}
	if len(rids) > 0 {
		if _, err := tx.Exec(ctx, decayLedgerSQL, lids, rids, lnew, lold, reason); err != nil {
			w.metrics.DBQueries.WithLabelValues("error").Inc()
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Add(2)
	if skipped := len(ids) - len(applied); skipped > 0 {
		w.log.Info("decay skipped reputations changed since read", "users", skipped)
	}
	return nil
}
