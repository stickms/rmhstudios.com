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
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rmhstudios/rmh-go/pkg/db"
)

// watchRepo owns DB access for the tracker.
type watchRepo struct {
	db *db.DB
}

func newWatchRepo(database *db.DB) *watchRepo { return &watchRepo{db: database} }

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
	row := r.db.Pool.QueryRow(ctx,
		`SELECT `+voiceColumns+` FROM "discord_watch_voice_session"
		 WHERE "discordId"=$1 AND "leftAt" IS NULL
		 ORDER BY "joinedAt" DESC LIMIT 1`, discordID)
	v, err := scanVoiceSession(row)
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
	_, err := r.db.Pool.Exec(ctx,
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
	_, err := r.db.Pool.Exec(ctx,
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
	_, err := r.db.Pool.Exec(ctx,
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
	voice, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_watch_voice_session" SET
		   "leftAt"="updatedAt",
		   "endedReason"='stale',
		   "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "joinedAt")))::int),
		   "updatedAt"=$2
		 WHERE "leftAt" IS NULL AND "updatedAt" < $1`, cutoff, now)
	if err != nil {
		return 0, 0, fmt.Errorf("retire stale voice sessions: %w", err)
	}
	presence, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_watch_presence_session" SET
		   "endedAt"="updatedAt",
		   "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "startedAt")))::int),
		   "updatedAt"=$2
		 WHERE "endedAt" IS NULL AND "updatedAt" < $1`, cutoff, now)
	if err != nil {
		return 0, 0, fmt.Errorf("retire stale presence sessions: %w", err)
	}

	var resumed int
	if err := r.db.Pool.QueryRow(ctx,
		`SELECT (SELECT count(*) FROM "discord_watch_voice_session" WHERE "leftAt" IS NULL)
		      + (SELECT count(*) FROM "discord_watch_presence_session" WHERE "endedAt" IS NULL)`,
	).Scan(&resumed); err != nil {
		return 0, 0, fmt.Errorf("count resumed sessions: %w", err)
	}
	return resumed, int(voice.RowsAffected() + presence.RowsAffected()), nil
}

// ── Messages ────────────────────────────────────────────────────────────────

// insertMessage records one message. ON CONFLICT DO NOTHING on the unique
// messageId makes a gateway redelivery a no-op rather than a double count.
func (r *watchRepo) insertMessage(ctx context.Context, m *watchMessage) error {
	if r.db == nil {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_watch_message"
		   ("id","discordId","guildId","channelId","channelName","messageId","sentAt","content",
		    "charCount","wordCount","attachments","embeds","links","mentions","emoji","stickers",
		    "isReply","isQuestion","isLateNight")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		 ON CONFLICT ("messageId") DO NOTHING`,
		newWatchID(), m.DiscordID, m.GuildID, m.ChannelID, nullableString(m.ChannelName), m.MessageID,
		m.SentAt, nullableString(m.Content),
		m.CharCount, m.WordCount, m.Attachments, m.Embeds, m.Links, m.Mentions, m.Emoji, m.Stickers,
		m.IsReply, m.IsQuestion, m.IsLateNight)
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
	err := r.db.Pool.QueryRow(ctx,
		`SELECT "discordId","sentAt" FROM "discord_watch_message" WHERE "messageId"=$1`, messageID,
	).Scan(&author, &sentAt)
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
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "channelId","channelName","sentAt","charCount","wordCount","attachments","links",
		        "mentions","emoji","stickers","isReply","isQuestion","isLateNight"
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
			&m.IsReply, &m.IsQuestion, &m.IsLateNight); err != nil {
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
	rows, err := r.db.Pool.Query(ctx,
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
	tag, err := r.db.Pool.Exec(ctx,
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
	rows, err := r.db.Pool.Query(ctx,
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
	_, err := r.db.Pool.Exec(ctx,
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
	_, err := r.db.Pool.Exec(ctx,
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
	_, err := r.db.Pool.Exec(ctx, query, args...)
	return err
}

// touchOpenPresence beats the heartbeat on a user's running activities so a
// restart can tell a live game from one the bot lost track of days ago.
func (r *watchRepo) touchOpenPresence(ctx context.Context, discordID string) error {
	if r.db == nil {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
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
	rows, err := r.db.Pool.Query(ctx,
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
	rows, err := r.db.Pool.Query(ctx,
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

// ── Live state ──────────────────────────────────────────────────────────────

// upsertLiveStatus records Discord's own online/idle/dnd level and what he is
// reported to be doing. `statusChangedAt` only moves when the status actually
// changes, so the page can say "online for 4h" rather than "online for 60s"
// after every unrelated presence event.
func (r *watchRepo) upsertLiveStatus(ctx context.Context, discordID, status, activityName string, activityType *int) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_watch_live" ("discordId","status","statusChangedAt","activityName","activityType","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$3)
		 ON CONFLICT ("discordId") DO UPDATE SET
		   "status"=EXCLUDED."status",
		   "statusChangedAt"=CASE
		     WHEN "discord_watch_live"."status" IS DISTINCT FROM EXCLUDED."status"
		     THEN EXCLUDED."statusChangedAt" ELSE "discord_watch_live"."statusChangedAt" END,
		   "activityName"=EXCLUDED."activityName",
		   "activityType"=EXCLUDED."activityType",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		discordID, status, now, nullableString(activityName), activityType)
	return err
}

// upsertLiveIdentity caches the name and avatar hash the profile card renders,
// so the web tier never needs a bot token to ask Discord who he is.
//
// It deliberately does NOT touch `status`: identity arrives on message events,
// which say nothing about whether he is online, and writing the column's default
// here would flick the card to offline every time he typed.
func (r *watchRepo) upsertLiveIdentity(ctx context.Context, discordID, username, globalName, avatarHash string) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_watch_live" ("discordId","username","globalName","avatarHash","statusChangedAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$5)
		 ON CONFLICT ("discordId") DO UPDATE SET
		   "username"=COALESCE(EXCLUDED."username","discord_watch_live"."username"),
		   "globalName"=COALESCE(EXCLUDED."globalName","discord_watch_live"."globalName"),
		   "avatarHash"=COALESCE(EXCLUDED."avatarHash","discord_watch_live"."avatarHash"),
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
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_watch_day"
		   ("discordId","dateKey","timeZone","voiceSec","voiceSessions","longestVoiceSec","mutedSec",
		    "deafenedSec","streamingSec","videoSec","aloneSec","lateNightSec","messages","words",
		    "characters","attachments","links","mentions","emoji","stickers","replies","questions",
		    "lateNightMessages","gamingSec","gameSessions","topGame","topGameSec","topChannel",
		    "topChannelMessages","hourlyMessages","hourlyVoiceSec","firstSeenAt","lastSeenAt","updatedAt")
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		         $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
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
		   "firstSeenAt"=EXCLUDED."firstSeenAt",
		   "lastSeenAt"=EXCLUDED."lastSeenAt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		d.DiscordID, d.DateKey, d.TimeZone, d.VoiceSec, d.VoiceSessions, d.LongestVoiceSec, d.MutedSec,
		d.DeafenedSec, d.StreamingSec, d.VideoSec, d.AloneSec, d.LateNightSec, d.Messages, d.Words,
		d.Characters, d.Attachments, d.Links, d.Mentions, d.Emoji, d.Stickers, d.Replies, d.Questions,
		d.LateNightMessages, d.GamingSec, d.GameSessions, nullableString(d.TopGame), d.TopGameSec,
		nullableString(d.TopChannel), d.TopChannelMessages, jsonInts(d.HourlyMessages), jsonInts(d.HourlyVoiceSec),
		d.FirstSeenAt, d.LastSeenAt, now)
	return err
}

// bumpReactions increments the two counters the rollup cannot recompute,
// creating the day row if the reaction is the first thing to touch it.
func (r *watchRepo) bumpReactions(ctx context.Context, discordID, dateKey, timeZone string, given, received int) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.db.Pool.Exec(ctx,
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
	err := r.db.Pool.QueryRow(ctx,
		`SELECT "sourceHash" FROM "discord_watch_summary"
		 WHERE "discordId"=$1 AND "period"=$2 AND "periodKey"=$3`, discordID, period, periodKey).Scan(&hash)
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
	_, err := r.db.Pool.Exec(ctx,
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

// daysInRange returns the rollups for [fromKey, toKey] inclusive — the figures
// the summarizer describes and the hash it keys off.
func (r *watchRepo) daysInRange(ctx context.Context, discordID, fromKey, toKey string) ([]*dayRollup, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "dateKey","voiceSec","voiceSessions","longestVoiceSec","mutedSec","deafenedSec",
		        "streamingSec","videoSec","aloneSec","lateNightSec","messages","words","characters",
		        "attachments","links","mentions","emoji","stickers","replies","questions",
		        "lateNightMessages","reactionsGiven","reactionsReceived","gamingSec","gameSessions",
		        "topGame","topGameSec","topChannel","topChannelMessages","firstSeenAt","lastSeenAt"
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
			&d.DeafenedSec, &d.StreamingSec, &d.VideoSec, &d.AloneSec, &d.LateNightSec, &d.Messages,
			&d.Words, &d.Characters, &d.Attachments, &d.Links, &d.Mentions, &d.Emoji, &d.Stickers,
			&d.Replies, &d.Questions, &d.LateNightMessages, &d.ReactionsGiven, &d.ReactionsReceived,
			&d.GamingSec, &d.GameSessions, &topGame, &d.TopGameSec, &topChannel, &d.TopChannelMessages,
			&d.FirstSeenAt, &d.LastSeenAt); err != nil {
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
