package discordbot

import (
	"context"
	"time"
)

// Persistence for compose sessions. The state machine and the reasoning are in
// watch_typing.go; this file is only the SQL.

// typingSession is one run of typing in one channel.
type typingSession struct {
	ID           string
	DiscordID    string
	GuildID      string
	ChannelID    string
	ChannelName  string
	StartedAt    time.Time
	LastTypingAt time.Time
	SettledAt    *time.Time
	DurationSec  int
	Sent         bool
}

// touchTypingSession extends the open run in this channel, or opens a new one.
//
// One statement, not a read-then-write: TYPING_START arrives every eight seconds
// per composing user and this is the hot path. The `UPDATE` matches only a run
// still inside its idle window; when it matches nothing, the `INSERT` runs. The
// two are ordered so the common case (still typing) is one row touched.
func (r *watchRepo) touchTypingSession(ctx context.Context, t *typingSession, idle time.Duration) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	cutoff := t.LastTypingAt.Add(-idle)

	tag, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_watch_typing_session"
		 SET "lastTypingAt"=$3,"updatedAt"=$4
		 WHERE "discordId"=$1 AND "channelId"=$2 AND "settledAt" IS NULL AND "lastTypingAt" >= $5`,
		t.DiscordID, t.ChannelID, t.LastTypingAt, now, cutoff)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		return nil
	}

	// Nothing open and fresh. Anything open but STALE is left for the sweep to
	// settle as abandoned — closing it here would silently forgive a run that
	// genuinely produced no message.
	t.ID = newWatchID()
	_, err = r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_watch_typing_session"
		   ("id","discordId","guildId","channelId","channelName","startedAt","lastTypingAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		t.ID, t.DiscordID, t.GuildID, t.ChannelID, nullableString(t.ChannelName),
		t.StartedAt, t.LastTypingAt, now)
	return err
}

// settleTypingSession closes the open run in a channel with a verdict.
//
// `at` is the instant the run ended — the message's timestamp when it was sent,
// the last typing event when it was not. Never `now`: a sweep running an hour
// after a restart must not record an hour-long compose session.
func (r *watchRepo) settleTypingSession(
	ctx context.Context,
	discordID, channelID string,
	at time.Time,
	sent bool,
) error {
	if r.db == nil {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_watch_typing_session"
		 SET "settledAt"=$3,
		     "sent"=$4,
		     "durationSec"=GREATEST(0, EXTRACT(EPOCH FROM ($3 - "startedAt"))::int),
		     "updatedAt"=$5
		 WHERE "discordId"=$1 AND "channelId"=$2 AND "settledAt" IS NULL`,
		discordID, channelID, at, sent, time.Now().UTC())
	return err
}

// openTypingSessions returns every unsettled run, across every tracked user.
//
// Unfiltered by user on purpose: the sweep's job is to find runs the process may
// know nothing about — ones opened before a restart — so it must read the table
// rather than any in-memory state.
func (r *watchRepo) openTypingSessions(ctx context.Context) ([]*typingSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "id","discordId","guildId","channelId","channelName",
		        "startedAt","lastTypingAt","settledAt","durationSec","sent"
		 FROM "discord_watch_typing_session"
		 WHERE "settledAt" IS NULL
		 ORDER BY "startedAt"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTypingSessions(rows)
}

// typingSessionsStartedIn returns the runs that BEGAN inside [from, to).
//
// Started-in rather than overlapping, matching how the rollup counts them: a
// compose session is an event, not a stretch of occupied time, so it belongs
// wholly to the day it began on.
func (r *watchRepo) typingSessionsStartedIn(
	ctx context.Context,
	discordID string,
	from, to time.Time,
) ([]*typingSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "id","discordId","guildId","channelId","channelName",
		        "startedAt","lastTypingAt","settledAt","durationSec","sent"
		 FROM "discord_watch_typing_session"
		 WHERE "discordId"=$1 AND "startedAt" >= $2 AND "startedAt" < $3
		 ORDER BY "startedAt"`, discordID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTypingSessions(rows)
}

type typingRows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}

func scanTypingSessions(rows typingRows) ([]*typingSession, error) {
	var out []*typingSession
	for rows.Next() {
		t := &typingSession{}
		var channelName *string
		if err := rows.Scan(&t.ID, &t.DiscordID, &t.GuildID, &t.ChannelID, &channelName,
			&t.StartedAt, &t.LastTypingAt, &t.SettledAt, &t.DurationSec, &t.Sent); err != nil {
			return nil, err
		}
		if channelName != nil {
			t.ChannelName = *channelName
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// purgeTypingSessions drops settled runs older than the retention window, in
// step with the message sweep — a compose session with no message is still a
// record of a moment in somebody's evening, and the day counts already carry
// everything the page shows.
func (r *watchRepo) purgeTypingSessions(ctx context.Context, before time.Time) error {
	if r.db == nil {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
		`DELETE FROM "discord_watch_typing_session"
		 WHERE "settledAt" IS NOT NULL AND "startedAt" < $1`, before)
	return err
}
