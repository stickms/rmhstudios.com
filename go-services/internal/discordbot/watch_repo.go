// watch_repo.go is the persistence layer for the activity tracker: raw pgx
// access to the five `discord_watch_*` tables.
//
// Same conventions as pet_repo.go — every query is parameterized, camelCase
// columns are quoted exactly as Prisma names them, and a nil *db.DB makes every
// method a safe no-op so the bot runs without Postgres in local dev.
//
// The one rule worth stating: this file NEVER decides who is tracked. The
// allowlist is enforced in watch.go before a handler reaches any of these
// methods, so a row's existence here is already proof it was permitted.
package discordbot

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/rmhstudios/rmh-go/pkg/db"
)

// watchRepo owns DB access for the tracker.
//
// Every statement goes through `exec`/`query`/`queryRow` below rather than
// touching the pool directly, so the retry policy is written once instead of at
// forty call sites — and so no future call site can forget it.
type watchRepo struct {
	db     *db.DB
	logger retryLogger
	// pool is the ONLY thing the three helpers below talk to, and the seam a
	// test injects a fake through. It exists because the helpers previously
	// named `r.db.Pool.Exec` inline, a blanket rename turned each of them into a
	// call to ITSELF, and every statement in the tracker recursed until the
	// stack overflowed — which in Go is a fatal error that takes the whole
	// supervisor process down. Nothing caught it because every repo method
	// early-returns on a nil `db`, so no unit test ever reached the recursion.
	pool pgxConn
}

// pgxConn is the slice of pgxpool.Pool the retrying helpers use. Narrow on
// purpose: it is satisfied by the real pool and by a counting fake, which is
// what makes "exec calls the pool exactly once" a testable statement.
type pgxConn interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func newWatchRepo(database *db.DB) *watchRepo {
	r := &watchRepo{db: database}
	if database != nil && database.Pool != nil {
		r.pool = database.Pool
	}
	return r
}

// conn returns the pool the helpers should use. Never nil: every caller has
// already guarded on `r.db == nil`, and a nil here would be a panic rather than
// the no-op those guards promise.
func (r *watchRepo) conn() pgxConn {
	if r.pool != nil {
		return r.pool
	}
	return r.db.Pool
}

// withLogger attaches a logger for retry narration. Optional; nil is silent.
func (r *watchRepo) withLogger(l retryLogger) *watchRepo {
	if r != nil {
		r.logger = l
	}
	return r
}

// ── The retrying SQL seam ───────────────────────────────────────────────────
//
// A pool blip, a failover or a restarting Postgres is a few hundred milliseconds
// and the gateway does not redeliver: a message row lost to one of those is lost
// for good, because Discord will not send it again. So the statements retry.
//
// # Only when it is provably safe
//
// `pgconn.SafeToRetry` is the whole basis for this, and it is the reason these
// wrappers are worth having rather than a blanket loop. It reports true only when
// the driver knows the statement never reached the server — a connection that
// failed to acquire, a write that never left. A connection that dropped while
// AWAITING a reply is not safe to retry: the insert may well have committed, and
// blindly re-running it would double-count a voice session or a message.
//
// Most statements here are upserts or conditional updates and would survive a
// double-run anyway. `insertMessage` and the session inserts would not, and one
// rule that is correct for all of them beats a per-call-site judgement that will
// eventually be made wrong.

// retryableDBError reports whether a failed statement is worth another attempt.
func retryableDBError(err error) bool {
	if err == nil {
		return false
	}
	// A cancelled context is a shutdown, not a fault.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	return pgconn.SafeToRetry(err)
}

// dbRetry runs `fn` under the database schedule, giving up immediately on
// anything the driver cannot vouch is un-executed.
func (r *watchRepo) dbRetry(ctx context.Context, label string, fn func(ctx context.Context) error) error {
	return withRetry(ctx, r.logger, label, retryDBPolicy, func(ctx context.Context) error {
		err := fn(ctx)
		if err != nil && !retryableDBError(err) {
			return permanent(err)
		}
		return err
	})
}

// exec runs a statement, retrying when it is safe to.
func (r *watchRepo) exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	var tag pgconn.CommandTag
	err := r.dbRetry(ctx, "db.exec", func(ctx context.Context) error {
		var err error
		tag, err = r.conn().Exec(ctx, sql, args...)
		return err
	})
	return tag, err
}

// query runs a query, retrying when it is safe to.
//
// The rows are NOT retried once handed back — a failure part-way through
// iteration surfaces from `rows.Err()` to the caller, which is where the partial
// result already is.
func (r *watchRepo) query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	var rows pgx.Rows
	err := r.dbRetry(ctx, "db.query", func(ctx context.Context) error {
		var err error
		rows, err = r.conn().Query(ctx, sql, args...)
		return err
	})
	return rows, err
}

// queryRowScan runs a single-row query AND its scan under one retry.
//
// The pair is retried together because pgx's QueryRow defers every error to
// Scan: retrying only the query would re-run the statement and then still hand
// back the first attempt's failure. Passing the scan in is what lets the loop
// own both halves.
//
// `pgx.ErrNoRows` reaches the caller unchanged (it is wrapped, and `errors.Is`
// sees through that) — an empty result is an answer, not a fault.
func (r *watchRepo) queryRowScan(
	ctx context.Context,
	label, sql string,
	args []any,
	scan func(pgx.Row) error,
) error {
	return r.dbRetry(ctx, label, func(ctx context.Context) error {
		return scan(r.conn().QueryRow(ctx, sql, args...))
	})
}

// ── Row types ───────────────────────────────────────────────────────────────

// voiceSession is one stay in a voice channel. `HeartbeatAt` is the row's
// `updatedAt` as last read — the tracker's proof it was watching this session,
// and the instant an unresumable session is closed at.
type voiceSession struct {
	ID          string
	DiscordID   string
	GuildID     string
	ChannelID   string
	ChannelName string

	JoinedAt    time.Time
	LeftAt      *time.Time
	EndedReason string
	DurationSec int

	MutedSec     int
	DeafenedSec  int
	StreamingSec int
	VideoSec     int
	AloneSec     int

	SelfMute   bool
	SelfDeaf   bool
	Streaming  bool
	Video      bool
	ServerMute bool
	ServerDeaf bool

	PeerCount int
	PeakPeers int

	FlagsChangedAt time.Time
	PeersChangedAt time.Time
	HeartbeatAt    time.Time
}

// watchMessage is one tracked message.
type watchMessage struct {
	DiscordID   string
	GuildID     string
	ChannelID   string
	ChannelName string
	MessageID   string
	SentAt      time.Time
	Content     string

	CharCount   int
	WordCount   int
	Attachments int
	Embeds      int
	Links       int
	Mentions    int
	Emoji       int
	Stickers    int

	IsReply     bool
	IsQuestion  bool
	IsLateNight bool
	// MentionsJob is decided once, at insert, by matchesJobHunt — see the note
	// at the top of watch_jobhunt.go for why it is stored rather than derived
	// later (the text it was derived from does not survive retention).
	MentionsJob bool
}

// presenceSession is one run of a rich-presence activity.
type presenceSession struct {
	ID           string
	DiscordID    string
	GuildID      string
	ActivityName string
	ActivityType int
	Details      string
	State        string
	StartedAt    time.Time
	EndedAt      *time.Time
	DurationSec  int
	HeartbeatAt  time.Time
}

// key matches activityKey's shape so an open row can be compared against a live
// activity without re-deriving the name/type pair differently in two places.
func (p *presenceSession) key() string {
	return strings.ToLower(strings.TrimSpace(p.ActivityName)) + "\x00" + itoa(p.ActivityType)
}

// ── Voice ───────────────────────────────────────────────────────────────────

const voiceColumns = `"id","discordId","guildId","channelId","channelName","joinedAt","leftAt",` +
	`"endedReason","durationSec","mutedSec","deafenedSec","streamingSec","videoSec","aloneSec",` +
	`"selfMute","selfDeaf","streaming","video","serverMute","serverDeaf","peerCount","peakPeers",` +
	`"flagsChangedAt","peersChangedAt","updatedAt"`

func scanVoiceSession(row pgx.Row) (*voiceSession, error) {
	v := &voiceSession{}
	var channelName, endedReason *string
	if err := row.Scan(
		&v.ID, &v.DiscordID, &v.GuildID, &v.ChannelID, &channelName, &v.JoinedAt, &v.LeftAt,
		&endedReason, &v.DurationSec, &v.MutedSec, &v.DeafenedSec, &v.StreamingSec, &v.VideoSec, &v.AloneSec,
		&v.SelfMute, &v.SelfDeaf, &v.Streaming, &v.Video, &v.ServerMute, &v.ServerDeaf, &v.PeerCount, &v.PeakPeers,
		&v.FlagsChangedAt, &v.PeersChangedAt, &v.HeartbeatAt,
	); err != nil {
		return nil, err
	}
	if channelName != nil {
		v.ChannelName = *channelName
	}
	if endedReason != nil {
		v.EndedReason = *endedReason
	}
	return v, nil
}

// openVoiceSession returns the user's in-progress session, or (nil, nil).
//
// ORDER BY joinedAt DESC because "the open session" must be singular even if a
// crash once left two: the newest is the one the state machine is about, and the
// older one is closed the next time startup sweeps.
func (r *watchRepo) openVoiceSession(ctx context.Context, discordID string) (*voiceSession, error) {
	if r.db == nil {
		return nil, nil
	}
	var v *voiceSession
	err := r.queryRowScan(ctx, "db.openVoiceSession",
		`SELECT `+voiceColumns+` FROM "discord_watch_voice_session"
		 WHERE "discordId"=$1 AND "leftAt" IS NULL
		 ORDER BY "joinedAt" DESC LIMIT 1`, []any{discordID},
		func(row pgx.Row) error {
			var err error
			v, err = scanVoiceSession(row)
			return err
		})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return v, nil
}

// insertVoiceSession writes a new open session and fills in its generated id.
func (r *watchRepo) insertVoiceSession(ctx context.Context, v *voiceSession) error {
	if r.db == nil {
		return nil
	}
	v.ID = newWatchID()
	now := time.Now().UTC()
	v.HeartbeatAt = now
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_voice_session"
		   ("id","discordId","guildId","channelId","channelName","joinedAt",
		    "selfMute","selfDeaf","streaming","video","serverMute","serverDeaf",
		    "peerCount","peakPeers","flagsChangedAt","peersChangedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		v.ID, v.DiscordID, v.GuildID, v.ChannelID, nullableString(v.ChannelName), v.JoinedAt,
		v.SelfMute, v.SelfDeaf, v.Streaming, v.Video, v.ServerMute, v.ServerDeaf,
		v.PeerCount, v.PeakPeers, v.FlagsChangedAt, v.PeersChangedAt, now)
	return err
}

// saveVoiceSession persists the mutable half of an open session. Writing
// `updatedAt` is what beats the heartbeat, so this is also how the tracker
// proves it is still watching.
func (r *watchRepo) saveVoiceSession(ctx context.Context, v *voiceSession) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	v.HeartbeatAt = now
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_voice_session" SET
		   "mutedSec"=$2,"deafenedSec"=$3,"streamingSec"=$4,"videoSec"=$5,"aloneSec"=$6,
		   "selfMute"=$7,"selfDeaf"=$8,"streaming"=$9,"video"=$10,"serverMute"=$11,"serverDeaf"=$12,
		   "peerCount"=$13,"peakPeers"=$14,"flagsChangedAt"=$15,"peersChangedAt"=$16,"updatedAt"=$17
		 WHERE "id"=$1`,
		v.ID, v.MutedSec, v.DeafenedSec, v.StreamingSec, v.VideoSec, v.AloneSec,
		v.SelfMute, v.SelfDeaf, v.Streaming, v.Video, v.ServerMute, v.ServerDeaf,
		v.PeerCount, v.PeakPeers, v.FlagsChangedAt, v.PeersChangedAt, now)
	return err
}

// closeVoiceSession ends a session at `at`, banking its final duration.
//
// `at` is not always `now`: a session closed because a reconcile found he had
// actually left is closed back at its last heartbeat, so the row never claims
// time the tracker did not observe.
func (r *watchRepo) closeVoiceSession(ctx context.Context, v *voiceSession, at time.Time, reason string) error {
	if r.db == nil {
		return nil
	}
	duration := int(at.Sub(v.JoinedAt).Seconds())
	if duration < 0 {
		duration = 0
	}
	v.LeftAt, v.EndedReason, v.DurationSec = &at, reason, duration
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_voice_session" SET
		   "leftAt"=$2,"endedReason"=$3,"durationSec"=$4,
		   "mutedSec"=$5,"deafenedSec"=$6,"streamingSec"=$7,"videoSec"=$8,"aloneSec"=$9,
		   "peerCount"=$10,"peakPeers"=$11,"flagsChangedAt"=$12,"peersChangedAt"=$13,"updatedAt"=$14
		 WHERE "id"=$1`,
		v.ID, at, reason, duration,
		v.MutedSec, v.DeafenedSec, v.StreamingSec, v.VideoSec, v.AloneSec,
		v.PeerCount, v.PeakPeers, v.FlagsChangedAt, v.PeersChangedAt, time.Now().UTC())
	return err
}

// resumeOrCloseSessions settles whatever the previous run left open.
//
// Rows whose heartbeat is within `grace` are LEFT OPEN — a redeploy is not a
// reason to end a call, and Reconcile will retire them from the gateway's real
// voice states if the bet was wrong. Older rows are closed at their heartbeat
// and marked stale, so an outage under-counts rather than inventing hours.
//
// Returns (resumed, closed).
func (r *watchRepo) resumeOrCloseSessions(ctx context.Context, now time.Time, grace time.Duration) (int, int, error) {
	if r.db == nil {
		return 0, 0, nil
	}
	cutoff := now.Add(-grace)

	// Voice: duration is measured to the heartbeat, not to now.
	voice, err := r.exec(ctx,
		`UPDATE "discord_watch_voice_session" SET
		   "leftAt"="updatedAt",
		   "endedReason"='stale',
		   "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "joinedAt")))::int),
		   "updatedAt"=$2
		 WHERE "leftAt" IS NULL AND "updatedAt" < $1`, cutoff, now)
	if err != nil {
		return 0, 0, fmt.Errorf("retire stale voice sessions: %w", err)
	}
	statuses, err := r.exec(ctx,
		`UPDATE "discord_watch_status_session" SET
		   "endedAt"="updatedAt",
		   "endedReason"='stale',
		   "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "startedAt")))::int),
		   "updatedAt"=$2
		 WHERE "endedAt" IS NULL AND "updatedAt" < $1`, cutoff, now)
	if err != nil {
		return 0, 0, fmt.Errorf("retire stale status sessions: %w", err)
	}
	presence, err := r.exec(ctx,
		`UPDATE "discord_watch_presence_session" SET
		   "endedAt"="updatedAt",
		   "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "startedAt")))::int),
		   "updatedAt"=$2
		 WHERE "endedAt" IS NULL AND "updatedAt" < $1`, cutoff, now)
	if err != nil {
		return 0, 0, fmt.Errorf("retire stale presence sessions: %w", err)
	}

	var resumed int
	if err := r.queryRowScan(ctx, "db.countResumed",
		`SELECT (SELECT count(*) FROM "discord_watch_voice_session" WHERE "leftAt" IS NULL)
		      + (SELECT count(*) FROM "discord_watch_presence_session" WHERE "endedAt" IS NULL)
		      + (SELECT count(*) FROM "discord_watch_status_session" WHERE "endedAt" IS NULL)`,
		nil, func(row pgx.Row) error { return row.Scan(&resumed) }); err != nil {
		return 0, 0, fmt.Errorf("count resumed sessions: %w", err)
	}
	return resumed, int(voice.RowsAffected() + presence.RowsAffected() + statuses.RowsAffected()), nil
}

// ── Messages ────────────────────────────────────────────────────────────────

// insertMessage records one message. ON CONFLICT DO NOTHING on the unique
// messageId makes a gateway redelivery a no-op rather than a double count.
func (r *watchRepo) insertMessage(ctx context.Context, m *watchMessage) error {
	if r.db == nil {
		return nil
	}
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_message"
		   ("id","discordId","guildId","channelId","channelName","messageId","sentAt","content",
		    "charCount","wordCount","attachments","embeds","links","mentions","emoji","stickers",
		    "isReply","isQuestion","isLateNight","mentionsJob")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
		 ON CONFLICT ("messageId") DO NOTHING`,
		newWatchID(), m.DiscordID, m.GuildID, m.ChannelID, nullableString(m.ChannelName), m.MessageID,
		m.SentAt, nullableString(m.Content),
		m.CharCount, m.WordCount, m.Attachments, m.Embeds, m.Links, m.Mentions, m.Emoji, m.Stickers,
		m.IsReply, m.IsQuestion, m.IsLateNight, m.MentionsJob)
	return err
}

// messageAuthor resolves a message id back to the tracked user who sent it, so a
// reaction can be credited as "received". Returns ("", zero, nil) when the
// message is not one of ours — which is the common case, since the bot sees
// reactions on everybody's messages.
func (r *watchRepo) messageAuthor(ctx context.Context, messageID string) (string, time.Time, error) {
	if r.db == nil {
		return "", time.Time{}, nil
	}
	var author string
	var sentAt time.Time
	err := r.queryRowScan(ctx, "db.messageAuthor",
		`SELECT "discordId","sentAt" FROM "discord_watch_message" WHERE "messageId"=$1`,
		[]any{messageID}, func(row pgx.Row) error { return row.Scan(&author, &sentAt) })
	if errors.Is(err, pgx.ErrNoRows) {
		return "", time.Time{}, nil
	}
	if err != nil {
		return "", time.Time{}, err
	}
	return author, sentAt, nil
}

// messagesForDay returns the message rows whose local day is `dateKey`, bounded
// by the UTC instants the caller derived from it.
func (r *watchRepo) messagesForDay(ctx context.Context, discordID string, from, to time.Time) ([]*watchMessage, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT "channelId","channelName","sentAt","charCount","wordCount","attachments","links",
		        "mentions","emoji","stickers","isReply","isQuestion","isLateNight","mentionsJob"
		 FROM "discord_watch_message"
		 WHERE "discordId"=$1 AND "sentAt" >= $2 AND "sentAt" < $3
		 ORDER BY "sentAt"`, discordID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*watchMessage
	for rows.Next() {
		m := &watchMessage{DiscordID: discordID}
		var channelName *string
		if err := rows.Scan(&m.ChannelID, &channelName, &m.SentAt, &m.CharCount, &m.WordCount,
			&m.Attachments, &m.Links, &m.Mentions, &m.Emoji, &m.Stickers,
			&m.IsReply, &m.IsQuestion, &m.IsLateNight, &m.MentionsJob); err != nil {
			return nil, err
		}
		if channelName != nil {
			m.ChannelName = *channelName
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// sampleMessages returns the most recent stored message texts in a window — the
// raw material the summarizer characterises a period from. Empty strings are
// excluded so a run with content storage off yields nothing rather than blanks.
func (r *watchRepo) sampleMessages(ctx context.Context, discordID string, from, to time.Time, limit int) ([]sampledMessage, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT COALESCE("channelName","channelId"),"sentAt","content"
		 FROM "discord_watch_message"
		 WHERE "discordId"=$1 AND "sentAt" >= $2 AND "sentAt" < $3
		   AND "content" IS NOT NULL AND "content" <> ''
		 ORDER BY "sentAt" DESC LIMIT $4`, discordID, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []sampledMessage
	for rows.Next() {
		var s sampledMessage
		if err := rows.Scan(&s.Channel, &s.SentAt, &s.Content); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// sampledMessage is one line of context handed to the summarizer.
type sampledMessage struct {
	Channel string
	SentAt  time.Time
	Content string
}

// pruneMessages drops raw message rows past the retention window. The rollups
// and the written summaries are what persist; the text was only ever kept long
// enough to say what a day was about.
func (r *watchRepo) pruneMessages(ctx context.Context, before time.Time) (int64, error) {
	if r.db == nil {
		return 0, nil
	}
	tag, err := r.exec(ctx,
		`DELETE FROM "discord_watch_message" WHERE "sentAt" < $1`, before)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ── Presence ────────────────────────────────────────────────────────────────

func (r *watchRepo) openPresenceSessions(ctx context.Context, discordID string) ([]*presenceSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT "id","discordId","guildId","activityName","activityType","details","state",
		        "startedAt","updatedAt"
		 FROM "discord_watch_presence_session"
		 WHERE "discordId"=$1 AND "endedAt" IS NULL`, discordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*presenceSession
	for rows.Next() {
		p := &presenceSession{}
		var details, state *string
		if err := rows.Scan(&p.ID, &p.DiscordID, &p.GuildID, &p.ActivityName, &p.ActivityType,
			&details, &state, &p.StartedAt, &p.HeartbeatAt); err != nil {
			return nil, err
		}
		if details != nil {
			p.Details = *details
		}
		if state != nil {
			p.State = *state
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *watchRepo) insertPresenceSession(ctx context.Context, p *presenceSession) error {
	if r.db == nil {
		return nil
	}
	p.ID = newWatchID()
	now := time.Now().UTC()
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_presence_session"
		   ("id","discordId","guildId","activityName","activityType","details","state","startedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		p.ID, p.DiscordID, p.GuildID, p.ActivityName, p.ActivityType,
		nullableString(p.Details), nullableString(p.State), p.StartedAt, now)
	return err
}

func (r *watchRepo) closePresenceSession(ctx context.Context, p *presenceSession, at time.Time) error {
	if r.db == nil {
		return nil
	}
	duration := int(at.Sub(p.StartedAt).Seconds())
	if duration < 0 {
		duration = 0
	}
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_presence_session"
		 SET "endedAt"=$2,"durationSec"=$3,"updatedAt"=$4 WHERE "id"=$1`,
		p.ID, at, duration, time.Now().UTC())
	return err
}

// closeOpenPresence ends every open activity for a user. `only` narrows it to a
// single row when non-nil; nil closes all of them (shutdown).
func (r *watchRepo) closeOpenPresence(ctx context.Context, discordID string, only *string, at time.Time) error {
	if r.db == nil {
		return nil
	}
	query := `UPDATE "discord_watch_presence_session" SET
	            "endedAt"=$2,
	            "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($2 - "startedAt")))::int),
	            "updatedAt"=$3
	          WHERE "discordId"=$1 AND "endedAt" IS NULL`
	args := []any{discordID, at, time.Now().UTC()}
	if only != nil {
		query += ` AND "id"=$4`
		args = append(args, *only)
	}
	_, err := r.exec(ctx, query, args...)
	return err
}

// touchOpenPresence beats the heartbeat on a user's running activities so a
// restart can tell a live game from one the bot lost track of days ago.
func (r *watchRepo) touchOpenPresence(ctx context.Context, discordID string) error {
	if r.db == nil {
		return nil
	}
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_presence_session" SET "updatedAt"=$2
		 WHERE "discordId"=$1 AND "endedAt" IS NULL`, discordID, time.Now().UTC())
	return err
}

// voiceSessionsOverlapping returns every session touching [from, to) — including
// the open one, which is what lets a day's total keep climbing while he sits
// there. Open sessions are returned with a nil LeftAt; the rollup measures them
// against `to` or `now`, whichever is earlier.
func (r *watchRepo) voiceSessionsOverlapping(ctx context.Context, discordID string, from, to time.Time) ([]*voiceSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT `+voiceColumns+` FROM "discord_watch_voice_session"
		 WHERE "discordId"=$1 AND "joinedAt" < $3 AND COALESCE("leftAt", NOW()) > $2
		 ORDER BY "joinedAt"`, discordID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*voiceSession
	for rows.Next() {
		v, err := scanVoiceSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// presenceSessionsOverlapping is voiceSessionsOverlapping for activities.
func (r *watchRepo) presenceSessionsOverlapping(ctx context.Context, discordID string, from, to time.Time) ([]*presenceSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT "id","discordId","guildId","activityName","activityType","details","state",
		        "startedAt","endedAt","updatedAt"
		 FROM "discord_watch_presence_session"
		 WHERE "discordId"=$1 AND "startedAt" < $3 AND COALESCE("endedAt", NOW()) > $2
		 ORDER BY "startedAt"`, discordID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*presenceSession
	for rows.Next() {
		p := &presenceSession{}
		var details, state *string
		if err := rows.Scan(&p.ID, &p.DiscordID, &p.GuildID, &p.ActivityName, &p.ActivityType,
			&details, &state, &p.StartedAt, &p.EndedAt, &p.HeartbeatAt); err != nil {
			return nil, err
		}
		if details != nil {
			p.Details = *details
		}
		if state != nil {
			p.State = *state
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── Status sessions (time online) ───────────────────────────────────────────

// statusSession is one contiguous run of a status held on a set of clients.
type statusSession struct {
	ID          string
	DiscordID   string
	Status      string
	Clients     clientSet
	StartedAt   time.Time
	EndedAt     *time.Time
	DurationSec int
	HeartbeatAt time.Time
}

const statusColumns = `"id","discordId","status","desktop","mobile","web",` +
	`"startedAt","endedAt","durationSec","updatedAt"`

func scanStatusSession(row pgx.Row) (*statusSession, error) {
	v := &statusSession{}
	if err := row.Scan(&v.ID, &v.DiscordID, &v.Status,
		&v.Clients.Desktop, &v.Clients.Mobile, &v.Clients.Web,
		&v.StartedAt, &v.EndedAt, &v.DurationSec, &v.HeartbeatAt); err != nil {
		return nil, err
	}
	return v, nil
}

// openStatusSession returns the in-progress run, or (nil, nil).
func (r *watchRepo) openStatusSession(ctx context.Context, discordID string) (*statusSession, error) {
	if r.db == nil {
		return nil, nil
	}
	var v *statusSession
	err := r.queryRowScan(ctx, "db.openStatusSession",
		`SELECT `+statusColumns+` FROM "discord_watch_status_session"
		 WHERE "discordId"=$1 AND "endedAt" IS NULL
		 ORDER BY "startedAt" DESC LIMIT 1`, []any{discordID},
		func(row pgx.Row) error {
			var err error
			v, err = scanStatusSession(row)
			return err
		})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return v, nil
}

func (r *watchRepo) insertStatusSession(ctx context.Context, v *statusSession) error {
	if r.db == nil {
		return nil
	}
	v.ID = newWatchID()
	now := time.Now().UTC()
	v.HeartbeatAt = now
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_status_session"
		   ("id","discordId","status","desktop","mobile","web","startedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		v.ID, v.DiscordID, v.Status, v.Clients.Desktop, v.Clients.Mobile, v.Clients.Web,
		v.StartedAt, now)
	return err
}

// closeStatusSession ends a run at `at`. As with voice, `at` is not always now:
// a run retired after an outage is closed back at its last heartbeat so the log
// never claims presence the tracker did not observe.
func (r *watchRepo) closeStatusSession(ctx context.Context, v *statusSession, at time.Time, reason string) error {
	if r.db == nil {
		return nil
	}
	duration := int(at.Sub(v.StartedAt).Seconds())
	if duration < 0 {
		duration = 0
	}
	v.EndedAt, v.DurationSec = &at, duration
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_status_session"
		 SET "endedAt"=$2,"durationSec"=$3,"endedReason"=$4,"updatedAt"=$5 WHERE "id"=$1`,
		v.ID, at, duration, reason, time.Now().UTC())
	return err
}

// touchOpenStatus beats the heartbeat on the open run, so a restart can tell a
// live presence from one the bot lost track of.
func (r *watchRepo) touchOpenStatus(ctx context.Context, discordID string) error {
	if r.db == nil {
		return nil
	}
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_status_session" SET "updatedAt"=$2
		 WHERE "discordId"=$1 AND "endedAt" IS NULL`, discordID, time.Now().UTC())
	return err
}

// statusSessionsOverlapping returns every run touching [from, to), including the
// open one — which is what lets today's online figure keep climbing while he
// sits there.
func (r *watchRepo) statusSessionsOverlapping(ctx context.Context, discordID string, from, to time.Time) ([]*statusSession, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT `+statusColumns+` FROM "discord_watch_status_session"
		 WHERE "discordId"=$1 AND "startedAt" < $3 AND COALESCE("endedAt", NOW()) > $2
		 ORDER BY "startedAt"`, discordID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*statusSession
	for rows.Next() {
		v, err := scanStatusSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ── Live state ──────────────────────────────────────────────────────────────

// liveActivity is one entry of the `activities` JSON array — a single thing
// Discord reports him as doing right now.
type liveActivity struct {
	Name    string `json:"name"`
	Type    int    `json:"type"`
	Details string `json:"details,omitempty"`
	State   string `json:"state,omitempty"`
	// RFC3339, or empty when Discord did not report a start.
	StartedAt string `json:"startedAt,omitempty"`
}

// upsertLiveStatus records Discord's own online/idle/dnd level, everything he is
// reported to be doing, and his custom status.
//
// `statusChangedAt` only moves when the status actually changes, so the page can
// say "online for 4h" rather than "online for 60s" after every unrelated
// presence event.
//
// `activities` is written whole rather than merged: a presence update is the
// complete current set, so an activity that ended is one that is simply absent
// from the new array. Merging would leave a finished game on the card forever.
func (r *watchRepo) upsertLiveStatus(
	ctx context.Context,
	discordID, status, activityName string,
	activityType *int,
	activities []liveActivity,
	customStatus, customEmoji string,
) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	// A nil slice would be SQL NULL; an empty one must serialise as `[]` so the
	// page can tell "nothing running" from "never recorded".
	if activities == nil {
		activities = []liveActivity{}
	}
	payload, err := json.Marshal(activities)
	if err != nil {
		return fmt.Errorf("marshal activities: %w", err)
	}
	_, err = r.exec(ctx,
		`INSERT INTO "discord_watch_live"
		   ("discordId","status","statusChangedAt","activityName","activityType",
		    "activities","customStatus","customEmoji","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$3)
		 ON CONFLICT ("discordId") DO UPDATE SET
		   "status"=EXCLUDED."status",
		   "statusChangedAt"=CASE
		     WHEN "discord_watch_live"."status" IS DISTINCT FROM EXCLUDED."status"
		     THEN EXCLUDED."statusChangedAt" ELSE "discord_watch_live"."statusChangedAt" END,
		   "activityName"=EXCLUDED."activityName",
		   "activityType"=EXCLUDED."activityType",
		   "activities"=EXCLUDED."activities",
		   "customStatus"=EXCLUDED."customStatus",
		   "customEmoji"=EXCLUDED."customEmoji",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		discordID, status, now, nullableString(activityName), activityType,
		payload, nullableString(customStatus), nullableString(customEmoji))
	return err
}

// upsertLiveIdentity caches the name and avatar hash the profile card renders,
// so the web tier never needs a bot token to ask Discord who he is.
//
// Every column is written VERBATIM rather than COALESCEd over the stored value.
// That matters for one specific failure: Discord's CDN 404s an avatar hash the
// moment the avatar changes, so a cache that can only ever be added to will
// serve a dead image URL forever once he switches his picture — and, if he
// removes it entirely (`avatar: null`), a COALESCE would pin the old hash
// permanently with no event able to clear it.
//
// This is only safe because every caller has a COMPLETE user object: a message
// author, a presence payload already checked for a populated `Username`, or a
// REST fetch. A partial user (a presence carrying only an id) must not reach
// here — it would blank the name.
//
// It deliberately does NOT touch `status`: identity arrives on message events,
// which say nothing about whether he is online, and writing the column's default
// here would flick the card to offline every time he typed.
func (r *watchRepo) upsertLiveIdentity(ctx context.Context, discordID, username, globalName, avatarHash string) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_live" ("discordId","username","globalName","avatarHash","statusChangedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$5)
		 ON CONFLICT ("discordId") DO UPDATE SET
		   "username"=EXCLUDED."username",
		   "globalName"=EXCLUDED."globalName",
		   "avatarHash"=EXCLUDED."avatarHash",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		discordID, nullableString(username), nullableString(globalName), nullableString(avatarHash), now)
	return err
}

// ── Daily rollup ────────────────────────────────────────────────────────────

// writeDayRollup upserts the recomputed aggregate for one local day.
//
// It deliberately does NOT write "reactionsGiven"/"reactionsReceived": those are
// incremented by bumpReactions and have no raw table to be recomputed from, so
// listing them here would zero them on every flush.
func (r *watchRepo) writeDayRollup(ctx context.Context, d *dayRollup) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_day"
		   ("discordId","dateKey","timeZone","voiceSec","voiceSessions","longestVoiceSec","mutedSec",
		    "deafenedSec","streamingSec","videoSec","aloneSec","lateNightSec","onlineSec","idleSec","dndSec",
		    "desktopSec","mobileSec","webSec","messages","words",
		    "characters","attachments","links","mentions","emoji","stickers","replies","questions",
		    "lateNightMessages","gamingSec","gameSessions","topGame","topGameSec","topChannel",
		    "topChannelMessages","hourlyMessages","hourlyVoiceSec","hourlyGamingSec","firstSeenAt","lastSeenAt",
		    "jobMentions","typingStarts","typingAbandoned","typingAbandonedSec","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		         $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)
		 ON CONFLICT ("discordId","dateKey") DO UPDATE SET
		   "timeZone"=EXCLUDED."timeZone",
		   "voiceSec"=EXCLUDED."voiceSec",
		   "voiceSessions"=EXCLUDED."voiceSessions",
		   "longestVoiceSec"=EXCLUDED."longestVoiceSec",
		   "mutedSec"=EXCLUDED."mutedSec",
		   "deafenedSec"=EXCLUDED."deafenedSec",
		   "streamingSec"=EXCLUDED."streamingSec",
		   "videoSec"=EXCLUDED."videoSec",
		   "aloneSec"=EXCLUDED."aloneSec",
		   "lateNightSec"=EXCLUDED."lateNightSec",
		   "onlineSec"=EXCLUDED."onlineSec",
		   "idleSec"=EXCLUDED."idleSec",
		   "dndSec"=EXCLUDED."dndSec",
		   "desktopSec"=EXCLUDED."desktopSec",
		   "mobileSec"=EXCLUDED."mobileSec",
		   "webSec"=EXCLUDED."webSec",
		   "messages"=EXCLUDED."messages",
		   "words"=EXCLUDED."words",
		   "characters"=EXCLUDED."characters",
		   "attachments"=EXCLUDED."attachments",
		   "links"=EXCLUDED."links",
		   "mentions"=EXCLUDED."mentions",
		   "emoji"=EXCLUDED."emoji",
		   "stickers"=EXCLUDED."stickers",
		   "replies"=EXCLUDED."replies",
		   "questions"=EXCLUDED."questions",
		   "lateNightMessages"=EXCLUDED."lateNightMessages",
		   "gamingSec"=EXCLUDED."gamingSec",
		   "gameSessions"=EXCLUDED."gameSessions",
		   "topGame"=EXCLUDED."topGame",
		   "topGameSec"=EXCLUDED."topGameSec",
		   "topChannel"=EXCLUDED."topChannel",
		   "topChannelMessages"=EXCLUDED."topChannelMessages",
		   "hourlyMessages"=EXCLUDED."hourlyMessages",
		   "hourlyVoiceSec"=EXCLUDED."hourlyVoiceSec",
		   "hourlyGamingSec"=EXCLUDED."hourlyGamingSec",
		   "firstSeenAt"=EXCLUDED."firstSeenAt",
		   "lastSeenAt"=EXCLUDED."lastSeenAt",
		   "jobMentions"=EXCLUDED."jobMentions",
		   "typingStarts"=EXCLUDED."typingStarts",
		   "typingAbandoned"=EXCLUDED."typingAbandoned",
		   "typingAbandonedSec"=EXCLUDED."typingAbandonedSec",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		d.DiscordID, d.DateKey, d.TimeZone, d.VoiceSec, d.VoiceSessions, d.LongestVoiceSec, d.MutedSec,
		d.DeafenedSec, d.StreamingSec, d.VideoSec, d.AloneSec, d.LateNightSec, d.OnlineSec, d.IdleSec, d.DndSec,
		d.DesktopSec, d.MobileSec, d.WebSec, d.Messages, d.Words,
		d.Characters, d.Attachments, d.Links, d.Mentions, d.Emoji, d.Stickers, d.Replies, d.Questions,
		d.LateNightMessages, d.GamingSec, d.GameSessions, nullableString(d.TopGame), d.TopGameSec,
		nullableString(d.TopChannel), d.TopChannelMessages, jsonInts(d.HourlyMessages), jsonInts(d.HourlyVoiceSec), jsonInts(d.HourlyGamingSec),
		d.FirstSeenAt, d.LastSeenAt,
		d.JobMentions, d.TypingStarts, d.TypingAbandoned, d.TypingAbandonedSec, now)
	return err
}

// bumpReactions increments the two counters the rollup cannot recompute,
// creating the day row if the reaction is the first thing to touch it.
func (r *watchRepo) bumpReactions(ctx context.Context, discordID, dateKey, timeZone string, given, received int) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_day" ("discordId","dateKey","timeZone","reactionsGiven","reactionsReceived","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT ("discordId","dateKey") DO UPDATE SET
		   "reactionsGiven"="discord_watch_day"."reactionsGiven"+EXCLUDED."reactionsGiven",
		   "reactionsReceived"="discord_watch_day"."reactionsReceived"+EXCLUDED."reactionsReceived",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		discordID, dateKey, timeZone, given, received, now)
	return err
}

// ── Summaries ───────────────────────────────────────────────────────────────

// summarySourceHash returns the hash a period was last summarised from, or ""
// when it never has been. The summarizer compares it to the hash of the current
// rollups and only spends a model call when they differ.
func (r *watchRepo) summarySourceHash(ctx context.Context, discordID, period, periodKey string) (string, error) {
	if r.db == nil {
		return "", nil
	}
	var hash string
	err := r.queryRowScan(ctx, "db.summarySourceHash",
		`SELECT "sourceHash" FROM "discord_watch_summary"
		 WHERE "discordId"=$1 AND "period"=$2 AND "periodKey"=$3`,
		[]any{discordID, period, periodKey}, func(row pgx.Row) error { return row.Scan(&hash) })
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return hash, nil
}

func (r *watchRepo) upsertSummary(ctx context.Context, s *watchSummary) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.exec(ctx,
		`INSERT INTO "discord_watch_summary"
		   ("id","discordId","period","periodKey","headline","summary","verdict","mood","topics",
		    "model","sourceHash","generatedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		 ON CONFLICT ("discordId","period","periodKey") DO UPDATE SET
		   "headline"=EXCLUDED."headline",
		   "summary"=EXCLUDED."summary",
		   "verdict"=EXCLUDED."verdict",
		   "mood"=EXCLUDED."mood",
		   "topics"=EXCLUDED."topics",
		   "model"=EXCLUDED."model",
		   "sourceHash"=EXCLUDED."sourceHash",
		   "generatedAt"=EXCLUDED."generatedAt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		newWatchID(), s.DiscordID, s.Period, s.PeriodKey, s.Headline, s.Summary,
		nullableString(s.Verdict), nullableString(s.Mood), jsonStrings(s.Topics),
		s.Model, s.SourceHash, now, now)
	return err
}

// unpostedWeekSummaries returns weekly write-ups that have never been announced,
// no older than `oldestKey`. Ordered so a backlog is posted in the order the
// weeks happened rather than newest-first.
func (r *watchRepo) unpostedWeekSummaries(ctx context.Context, discordID, oldestKey string) ([]*watchSummary, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT "periodKey","headline","summary","verdict","mood","topics"
		 FROM "discord_watch_summary"
		 WHERE "discordId"=$1 AND "period"='week' AND "digestPostedAt" IS NULL AND "periodKey" >= $2
		 ORDER BY "periodKey"`, discordID, oldestKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*watchSummary
	for rows.Next() {
		v := &watchSummary{DiscordID: discordID, Period: periodWeek}
		var verdict, mood *string
		var topics []string
		if err := rows.Scan(&v.PeriodKey, &v.Headline, &v.Summary, &verdict, &mood, &topics); err != nil {
			return nil, err
		}
		if verdict != nil {
			v.Verdict = *verdict
		}
		if mood != nil {
			v.Mood = *mood
		}
		v.Topics = topics
		out = append(out, v)
	}
	return out, rows.Err()
}

// claimDigest marks a week as posted, returning whether THIS caller won the
// claim. Conditional on the column still being null, which is what makes two
// workers racing safe without a lock.
func (r *watchRepo) claimDigest(ctx context.Context, discordID, periodKey string, at time.Time) (bool, error) {
	if r.db == nil {
		return false, nil
	}
	tag, err := r.exec(ctx,
		`UPDATE "discord_watch_summary" SET "digestPostedAt"=$3,"updatedAt"=$4
		 WHERE "discordId"=$1 AND "period"='week' AND "periodKey"=$2 AND "digestPostedAt" IS NULL`,
		discordID, periodKey, at, time.Now().UTC())
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// releaseDigest undoes a claim after a transient send failure, so a later pass
// retries. Not called for a permanent one — see the note in watch_digest.go.
func (r *watchRepo) releaseDigest(ctx context.Context, discordID, periodKey string) error {
	if r.db == nil {
		return nil
	}
	_, err := r.exec(ctx,
		`UPDATE "discord_watch_summary" SET "digestPostedAt"=NULL,"updatedAt"=$3
		 WHERE "discordId"=$1 AND "period"='week' AND "periodKey"=$2`,
		discordID, periodKey, time.Now().UTC())
	return err
}

// daysInRange returns the rollups for [fromKey, toKey] inclusive — the figures
// the summarizer describes and the hash it keys off.
func (r *watchRepo) daysInRange(ctx context.Context, discordID, fromKey, toKey string) ([]*dayRollup, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.query(ctx,
		`SELECT "dateKey","voiceSec","voiceSessions","longestVoiceSec","mutedSec","deafenedSec",
		        "streamingSec","videoSec","aloneSec","lateNightSec","onlineSec","idleSec","dndSec",
		    "desktopSec","mobileSec","webSec","messages","words","characters",
		        "attachments","links","mentions","emoji","stickers","replies","questions",
		        "lateNightMessages","reactionsGiven","reactionsReceived","gamingSec","gameSessions",
		        "topGame","topGameSec","topChannel","topChannelMessages","firstSeenAt","lastSeenAt",
		        "jobMentions","typingStarts","typingAbandoned","typingAbandonedSec"
		 FROM "discord_watch_day"
		 WHERE "discordId"=$1 AND "dateKey" >= $2 AND "dateKey" <= $3
		 ORDER BY "dateKey"`, discordID, fromKey, toKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*dayRollup
	for rows.Next() {
		d := &dayRollup{DiscordID: discordID}
		var topGame, topChannel *string
		if err := rows.Scan(&d.DateKey, &d.VoiceSec, &d.VoiceSessions, &d.LongestVoiceSec, &d.MutedSec,
			&d.DeafenedSec, &d.StreamingSec, &d.VideoSec, &d.AloneSec, &d.LateNightSec, &d.OnlineSec, &d.IdleSec, &d.DndSec,
			&d.DesktopSec, &d.MobileSec, &d.WebSec, &d.Messages,
			&d.Words, &d.Characters, &d.Attachments, &d.Links, &d.Mentions, &d.Emoji, &d.Stickers,
			&d.Replies, &d.Questions, &d.LateNightMessages, &d.ReactionsGiven, &d.ReactionsReceived,
			&d.GamingSec, &d.GameSessions, &topGame, &d.TopGameSec, &topChannel, &d.TopChannelMessages,
			&d.FirstSeenAt, &d.LastSeenAt,
			&d.JobMentions, &d.TypingStarts, &d.TypingAbandoned, &d.TypingAbandonedSec); err != nil {
			return nil, err
		}
		if topGame != nil {
			d.TopGame = *topGame
		}
		if topChannel != nil {
			d.TopChannel = *topChannel
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ── Small helpers ───────────────────────────────────────────────────────────

// nullableString maps "" to a SQL NULL, so an unknown channel name is absent
// rather than an empty string the page would have to special-case.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// jsonInts / jsonStrings hand pgx a value it encodes into a jsonb column. A nil
// slice becomes SQL NULL rather than "null", which is what the page's "no data"
// branch checks for.
func jsonInts(v []int) any {
	if v == nil {
		return nil
	}
	return v
}

func jsonStrings(v []string) any {
	if v == nil {
		return nil
	}
	return v
}

// newWatchID generates a Prisma-cuid-shaped id. These tables' id columns have no
// DB default (Prisma generates cuids in JS), so every insert from Go supplies
// one — same approach as internal/botworker.
func newWatchID() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Never panic over an id: fall back to the clock's low bits, which are
		// still unique enough beside the nanosecond prefix.
		binary.BigEndian.PutUint32(b[:], uint32(time.Now().UnixNano()))
	}
	return fmt.Sprintf("c%016x%08x", time.Now().UnixNano(), binary.BigEndian.Uint32(b[:]))
}
