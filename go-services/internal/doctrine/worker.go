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
			w.metrics.JobRuns.WithLabelValues(name, "panic").Inc()
			w.log.Error("job panicked", "job", name, "panic", r)
		}
	}()
	if err := fn(ctx); err != nil {
		w.metrics.JobRuns.WithLabelValues(name, "error").Inc()
		w.log.Error("job failed", "job", name, "error", err)
		return
	}
	w.metrics.JobRuns.WithLabelValues(name, "ok").Inc()
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
	timezones, err := w.distinctTimezones(ctx)
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
// Node applyReputationDecay. The Monday gate lives in the scheduler.
func (w *Worker) applyReputationDecay(ctx context.Context) error {
	// oneWeekAgo = now - 7 days. Node uses local Date here; we use UTC for
	// determinism, which matches the rest of the worker's UTC scheduling.
	oneWeekAgo := time.Now().UTC().AddDate(0, 0, -7)

	reps, err := w.inactiveReputations(ctx, oneWeekAgo)
	if err != nil {
		return err
	}

	decayed := 0
	reason := "Weekly inactivity decay (-5%)"
	for _, rep := range reps {
		// newXp = floor(totalXp * (1 - rate)); delta = newXp - totalXp.
		newXp := int(float64(rep.totalXp) * (1 - weeklyDecayRate)) // truncation == Math.floor for non-negative.
		delta := newXp - rep.totalXp

		if err := w.updateReputationXp(ctx, rep.id, newXp); err != nil {
			return err
		}
		if err := w.insertLedger(ctx, rep.id, "WEEKLY_DECAY", delta, reason); err != nil {
			return err
		}
		decayed++
	}

	if decayed > 0 {
		w.log.Info("applied reputation decay", "users", decayed)
	}
	return nil
}

// inactiveReputations finds reputations with lastActiveAt < cutoff and totalXp > 0.
func (w *Worker) inactiveReputations(ctx context.Context, cutoff time.Time) ([]inactiveRep, error) {
	rows, err := w.db.Pool.Query(ctx,
		`SELECT "id", "totalXp" FROM "doctrine_reputation" WHERE "lastActiveAt" < $1 AND "totalXp" > 0`,
		cutoff,
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

func (w *Worker) updateReputationXp(ctx context.Context, id string, newXp int) error {
	_, err := w.db.Pool.Exec(ctx,
		`UPDATE "doctrine_reputation" SET "totalXp" = $1 WHERE "id" = $2`,
		newXp, id,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return nil
}

// insertLedger writes a doctrine_reputation_ledger row. metadata is left NULL
// and createdAt takes its default, matching the Node ledger create.
func (w *Worker) insertLedger(ctx context.Context, reputationID, action string, xpDelta int, reason string) error {
	_, err := w.db.Pool.Exec(ctx,
		`INSERT INTO "doctrine_reputation_ledger"
		   ("id", "reputationId", "action", "xpDelta", "reason", "metadata", "createdAt")
		 VALUES ($1, $2, $3, $4, $5, NULL, now())`,
		uuid.NewString(), reputationID, action, xpDelta, reason,
	)
	if err != nil {
		w.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	w.metrics.DBQueries.WithLabelValues("ok").Inc()
	return nil
}
