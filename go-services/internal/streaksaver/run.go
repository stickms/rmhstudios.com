// Package streaksaver is a background worker that nudges users whose daily
// check-in streak is about to lapse. It runs inside the supervisor fleet (not a
// node-cron): on an interval it finds streaks that are alive but haven't been
// extended in most of a day and inserts an in-app "keep your streak" system
// notification, respecting each user's system-notification preference and a
// once-per-window idempotency guard so nobody is nudged twice.
//
// It only writes the in-app notification row; delivering that as a web push is
// a follow-up (needs a web-push sender in Go).
package streaksaver

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Tuning. These are deliberately conservative: only streaks worth saving, only
// in a window that means "checked in ~yesterday but not since", and never twice
// inside the dedupe window.
const (
	minStreak   = 3   // don't pester users over a 1–2 day streak
	lowerHours  = 20  // last check-in older than this → the day is nearly gone
	upperHours  = 44  // …but not older than this (else the streak is already lost)
	dedupeHours = 20  // never send a second reminder inside this window
	batchLimit  = 500 // cap work per sweep
)

// findAtRisk selects users to nudge. `system IS NULL` means no preference row,
// which defaults to opted-in.
const findAtRisk = `
	SELECT s."userId", s."current"
	FROM daily_streak s
	LEFT JOIN notification_preference np ON np."userId" = s."userId"
	WHERE s."current" >= $1
	  AND s."lastCheckIn" IS NOT NULL
	  AND s."lastCheckIn" < now() - make_interval(hours => $2)
	  AND s."lastCheckIn" > now() - make_interval(hours => $3)
	  AND (np.system IS NULL OR np.system = true)
	  AND NOT EXISTS (
	    SELECT 1 FROM notification n
	    WHERE n."userId" = s."userId"
	      AND n."entityType" = 'streak_reminder'
	      AND n."createdAt" > now() - make_interval(hours => $4)
	  )
	LIMIT $5`

// insertReminders is the batched form of insertReminder: one statement for the
// whole sweep (<= batchLimit rows) instead of one round trip per user. The
// enum needs an explicit cast because INSERT ... SELECT does not coerce an
// untyped literal to NotificationType the way VALUES does.
const insertReminders = `
	INSERT INTO "notification" (id, "userId", type, "entityType", "entityId", preview, link, read, "createdAt")
	SELECT t.id, t.uid, 'SYSTEM'::"NotificationType", 'streak_reminder', t.eid, t.preview, '/progress', false, now()
	FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(id, uid, eid, preview)`

const insertReminder = `
	INSERT INTO "notification" (id, "userId", type, "entityType", "entityId", preview, link, read, "createdAt")
	VALUES ($1, $2, 'SYSTEM', 'streak_reminder', $3, $4, '/progress', false, now())`

// Run blocks until ctx is cancelled, sweeping on an interval. Sweep failures are
// logged, never returned — returning a non-nil error would cancel the whole
// supervisor errgroup.
func Run(ctx context.Context, d worker.Deps) error {
	if config.GetString("STREAK_REMINDER_ENABLED", "true") == "false" {
		d.Logger.Info("streak reminders disabled (STREAK_REMINDER_ENABLED=false)")
		<-ctx.Done()
		return nil
	}

	interval := intervalFromEnv()
	d.Logger.Info("streak-saver started", "intervalMinutes", int(interval.Minutes()))

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	sweep(ctx, d) // run once at boot so a restart doesn't miss a window
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			sweep(ctx, d)
		}
	}
}

func intervalFromEnv() time.Duration {
	minutes := 60
	if v := config.GetString("STREAK_REMINDER_INTERVAL_MINUTES", ""); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			minutes = n
		}
	}
	return time.Duration(minutes) * time.Minute
}

func sweep(ctx context.Context, d worker.Deps) {
	rows, err := d.DB.Pool.Query(ctx, findAtRisk, minStreak, lowerHours, upperHours, dedupeHours, batchLimit)
	if err != nil {
		d.Logger.Error("streak-saver: query at-risk failed", "error", err)
		d.Metrics.RecordJob("streak_sweep", "error")
		return
	}
	type target struct {
		userID  string
		current int
	}
	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.userID, &t.current); err != nil {
			d.Logger.Error("streak-saver: scan failed", "error", err)
			rows.Close()
			d.Metrics.RecordJob("streak_sweep", "error")
			return
		}
		targets = append(targets, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		d.Logger.Error("streak-saver: rows error", "error", err)
		d.Metrics.RecordJob("streak_sweep", "error")
		return
	}

	tgts := make([]reminder, len(targets))
	for i, t := range targets {
		tgts[i] = reminder{UserID: t.userID, Current: t.current}
	}
	reminders := insertAll(ctx, d.DB.Pool, d.Logger, tgts)
	if len(reminders) > 0 {
		d.Logger.Info("streak-saver: reminders sent", "count", len(reminders), "candidates", len(targets))
		// Mirror the in-app reminders to web push (best-effort, no-op without
		// the internal secret / VAPID configured).
		pushReminders(ctx, d.Logger, reminders)
	}
	// The sweep itself worked (individual insert failures are logged above):
	// this is what the on-call staleness alarm watches.
	d.Metrics.RecordJob("streak_sweep", "ok")
}

// newCUID generates a compact, collision-resistant id compatible with Prisma's
// cuid() format (the id column has no DB default — cuid is generated in app
// code). Mirrors internal/botworker's generator.
func newCUID() string {
	return fmt.Sprintf("c%016x%08x", time.Now().UnixNano(), randSuffix())
}

func randSuffix() uint32 {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		t := time.Now().UnixNano()
		return uint32(t>>32) ^ uint32(t)
	}
	return binary.BigEndian.Uint32(b[:])
}

// execer is the slice of pgxpool.Pool the inserts need.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func reminderPreview(current int) string {
	return fmt.Sprintf("Your %d-day streak is about to end — check in to keep it alive!", current)
}

// insertAll writes the in-app reminders and returns the ones that landed. It
// tries ONE batched statement; if that fails (e.g. a user deleted since the
// SELECT breaks a foreign key) it falls back to the original per-user inserts so
// one bad row still costs only itself, exactly as before.
func insertAll(ctx context.Context, db execer, logger interface {
	Error(msg string, args ...any)
}, targets []reminder) []reminder {
	if len(targets) == 0 {
		return nil
	}
	ids := make([]string, len(targets))
	uids := make([]string, len(targets))
	eids := make([]string, len(targets))
	previews := make([]string, len(targets))
	for i, t := range targets {
		ids[i], uids[i], eids[i], previews[i] = newCUID(), t.UserID, strconv.Itoa(t.Current), reminderPreview(t.Current)
	}
	if _, err := db.Exec(ctx, insertReminders, ids, uids, eids, previews); err == nil {
		return targets
	} else {
		logger.Error("streak-saver: batch insert failed; retrying per user", "error", err)
	}
	var out []reminder
	for i, t := range targets {
		if _, err := db.Exec(ctx, insertReminder, ids[i], t.UserID, eids[i], previews[i]); err != nil {
			logger.Error("streak-saver: insert reminder failed", "userId", t.UserID, "error", err)
			continue
		}
		out = append(out, t)
	}
	return out
}
