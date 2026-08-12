// watch.go is the activity tracker behind the site's /sohumbum2 dossier: a
// standing record of what one Discord account does with its day — how long it
// sits in a voice channel, how much it types and about what, and which game it
// is in while doing neither.
//
// # Who is tracked
//
// An explicit allowlist (DISCORD_WATCH_USER_IDS), checked before anything is
// written. The bot needs the message and presence intents to see any of this,
// which means it sees them for everyone in the server — so the allowlist is
// applied at the TOP of every handler, not as a filter at read time. Nothing
// about anybody else reaches the database.
//
// # How time is counted
//
// Raw open/close rows are the source of truth; the per-day rollups are
// RECOMPUTED from them (watch_rollup.go) rather than incremented. That ordering
// is the whole design:
//
//   - A voice session is a row with a NULL leftAt. Duration is (leftAt - joinedAt),
//     so a session that is still open is simply measured against `now` — the page
//     shows a live figure without the tracker having to tick anything.
//   - Mute / deafen / stream / video / alone are TOGGLES that flip mid-session,
//     and elapsed time under a toggle cannot be derived after the fact. Those are
//     the only counters banked incrementally: each flip adds the time since the
//     last flip and moves the cursor (flagsChangedAt / peersChangedAt).
//   - A session crossing local midnight is split across both days by the rollup,
//     because "how late was he up" is the question this page is actually asking.
//
// Recomputing instead of incrementing means a duplicated gateway event, a
// restart mid-session, or a handler that runs twice cannot inflate a total: the
// rollup is a pure function of the rows that exist. The one exception is
// reactions, which have no raw table of their own and are incremented directly;
// the rollup writer leaves those two columns alone.
//
// # Restarts and brief outages
//
// A deploy takes seconds and he does not leave the call for it, so a restart
// must not chop a six-hour session into two. Every open row carries its own
// heartbeat — the flush loop touches `updatedAt` once a minute — and startup
// reads the gap since that beat:
//
//   - gap <= WATCH_GAP_GRACE (10 minutes by default): the session is RESUMED.
//     The row stays open and the gap counts, because the overwhelmingly likely
//     thing to have happened during a redeploy is nothing. Reconcile then
//     confirms it against the gateway's real voice states as guilds sync, and
//     closes it retroactively at the heartbeat if he had in fact left.
//   - gap > grace: the bot was gone long enough that it cannot vouch for the
//     time. The row is closed at its last heartbeat and marked "stale", so an
//     outage under-counts rather than inventing hours.
//
// The heartbeat is `updatedAt` on the session row rather than a tracker-wide
// cursor: a row is only resumable on the evidence that the tracker was watching
// THAT session, which is exactly what touching it proves.
//
// # Nothing depends on an event arriving
//
// Every gateway event this tracker listens to fires on a TRANSITION. None of
// them fire for a state that is already true, so anything learned only from a
// handler is invisible whenever the bot was not watching at the moment it
// changed — which is every restart, every reconnect, and every write that
// failed. That is not a rare edge: the normal case for the tracked account is
// being online and in a call already, continuously, across a deploy.
//
// So every measured signal has a recovery path that does not involve an event,
// and this table is the contract. A new signal without a middle column is a
// signal that will silently read zero one day:
//
//	SIGNAL              LIVE SOURCE           RECOVERY (no event required)
//	voice session       VOICE_STATE_UPDATE    Reconcile on guild sync, then
//	                                          syncVoiceFromState every tick
//	voice peers/alone   VOICE_STATE_UPDATE    refreshPeers("") every tick
//	                    (anyone's, not his)
//	status + clients    PRESENCE_UPDATE       Reconcile, then adopt-if-unknown
//	                                          in syncPresenceFromState
//	activities/games    PRESENCE_UPDATE       same, via applyPresence
//	live card row       PRESENCE_UPDATE       same; also refreshed every tick
//	name + avatar       MESSAGE_CREATE        RefreshIdentities, hourly REST
//	typing runs         TYPING_START          sweepTyping settles them by clock
//	day rollups         (derived)             recomputed from raw rows every
//	                                          tick; backfillRollups at startup
//	summaries           (derived)             regenerate when the prompt hash
//	                                          moves, so corrected days re-run
//
// Two signals genuinely have no recovery, and it is better to say so than to
// imply otherwise: MESSAGES and REACTIONS. Both are events about a moment
// rather than a state, so there is nothing to re-read — a message sent while
// the bot is down is simply not counted. (Message rows are keyed on a unique
// `messageId`, so a channel-history backfill would be safe to add if that gap
// ever matters; nothing else here would need to change.)
//
// The sweeps live in watch_voicesync.go and watch_presencesync.go, and both
// carry the same warning: the gateway's state cache is authoritative for what
// it holds, but discordgo merges rather than replaces `ClientStatus`, so it is
// not authoritative for which clients he is signed in on.
package discordbot

import (
	"context"
	"strings"
	"sync"
	"time"

	// Embeds the IANA timezone database in the binary.
	//
	// NOT optional, and not a nicety. The Go binaries ship in an Alpine image
	// (the root Dockerfile's `runner-full`), and Alpine does not include tzdata
	// — so without this, `time.LoadLocation("America/New_York")` FAILS in
	// production and every day boundary, late-night window and hourly bucket
	// silently shifts by four or five hours. The subject is in Eastern time and
	// the whole point of this page is what he was doing at 3am; measuring that
	// in UTC would put it in the wrong day.
	//
	// It lives in this package rather than in a `main` so the tracker cannot be
	// built into a binary that forgot it. Costs ~450KB.
	_ "time/tzdata"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// defaultWatchUserID is the account the dossier was built for. It is a default
// rather than a hardcode: DISCORD_WATCH_USER_IDS replaces it entirely, and an
// explicit "none" disables tracking without removing the worker.
const defaultWatchUserID = "169194892269060096"

// lateNightStart/lateNightEnd bound the "late night" band in local hours —
// midnight to 5am, the window a message in it says the most about.
const (
	lateNightStart = 0
	lateNightEnd   = 5
)

// contentLimit is the maximum message text stored, matching the VARCHAR(500) in
// the schema. Enough for the summarizer to characterise a conversation, short
// enough that this is a sample rather than a transcript.
const contentLimit = 500

// WatchConfig is the tracker's runtime configuration, resolved from env.
type WatchConfig struct {
	// UserIDs is the allowlist. Empty disables the tracker entirely.
	UserIDs []string
	// TimeZone is the zone every dateKey and every "late night" judgement is
	// made in. A day boundary is a local fact; the worker runs in UTC.
	TimeZone string
	// StoreContent keeps a truncated copy of message text for the summarizer.
	// Off means the tracker still records message SHAPE (counts, timing,
	// channels) but never the words.
	StoreContent bool
	// RetentionDays is how long raw message rows survive after their day has
	// been summarised. The rollups and the prose summaries are permanent.
	RetentionDays int
	// FlushInterval is how often live days are recomputed and open sessions
	// re-measured. It doubles as the heartbeat cadence for open rows.
	FlushInterval time.Duration
	// GapGrace is how long an outage may last before an open session stops being
	// resumable. Under it, a restart is treated as continuous; over it, the
	// session is closed at its last heartbeat. See the restart note at the top.
	GapGrace time.Duration
	// DigestChannelID is where the weekly write-up is posted once a week has
	// ended. Empty — the default — means no digest is ever posted, which is the
	// right default for a feature that writes into somebody else's channel.
	DigestChannelID string
	// SiteURL is the origin the digest's links point at.
	SiteURL string
}

// Enabled reports whether anything should be tracked at all.
func (c WatchConfig) Enabled() bool { return len(c.UserIDs) > 0 }

// WatchService owns the tracker's state machine and its persistence.
//
// Every gateway handler funnels through `mu`. Voice and presence transitions are
// read-modify-write cycles against the open-session rows, and Discord delivers
// bursts (a channel move is two events; a guild sync is dozens), so the cheapest
// correct thing is to serialize them. Event volume for one user is nowhere near
// enough for the lock to matter.
type WatchService struct {
	repo   *watchRepo
	logger *log.Logger
	cfg    WatchConfig
	loc    *time.Location

	watched map[string]struct{}

	mu sync.Mutex
}

// NewWatchService builds the tracker. A nil return means it is disabled (no
// allowlist), which every call site treats as a no-op rather than an error.
func NewWatchService(cfg WatchConfig, repo *watchRepo, logger *log.Logger) *WatchService {
	if !cfg.Enabled() {
		return nil
	}
	loc, err := time.LoadLocation(cfg.TimeZone)
	if err != nil || loc == nil {
		// ERROR, not warn: this is not a degraded mode, it is wrong data. Every
		// dateKey, every "late night" judgement and every hourly bucket is
		// measured in this zone, so falling back to UTC silently re-buckets a
		// 1am session into the previous day and reports it as an afternoon.
		//
		// With `time/tzdata` embedded above this should be unreachable; it stays
		// as a guard against a genuinely bad DISCORD_WATCH_TIMEZONE value.
		logger.Error("watch: unknown timezone — day boundaries will be UTC and WRONG for a non-UTC subject",
			"timeZone", cfg.TimeZone, "error", err)
		loc = time.UTC
	}
	watched := make(map[string]struct{}, len(cfg.UserIDs))
	for _, id := range cfg.UserIDs {
		watched[id] = struct{}{}
	}
	return &WatchService{repo: repo, logger: logger, cfg: cfg, loc: loc, watched: watched}
}

// tracks reports whether a Discord user ID is on the allowlist.
func (w *WatchService) tracks(userID string) bool {
	if w == nil || userID == "" {
		return false
	}
	_, ok := w.watched[userID]
	return ok
}

// dateKey renders an instant as the YYYY-MM-DD it falls on locally.
func (w *WatchService) dateKey(t time.Time) string {
	return t.In(w.loc).Format("2006-01-02")
}

// ── Startup ─────────────────────────────────────────────────────────────────

// Start decides what to do with whatever the previous run left open, then begins
// the flush loop. Sessions whose heartbeat is recent are resumed; older ones are
// closed at that heartbeat. See the restart note at the top of this file.
func (w *WatchService) Start(ctx context.Context, s *discordgo.Session) {
	if w == nil {
		return
	}
	resumed, closed, err := w.repo.resumeOrCloseSessions(ctx, time.Now().UTC(), w.gapGrace())
	if err != nil {
		w.logger.Warn("watch: reconciling sessions from previous run", "error", err)
	} else if resumed > 0 || closed > 0 {
		w.logger.Info("watch: sessions from previous run", "resumed", resumed, "closedStale", closed)
	}
	// Off the caller's goroutine: this is a REST round trip, and Run is holding
	// up the gateway's post-open path.
	go w.RefreshIdentities(ctx, s)
	go w.backfillRollups(ctx)
	go w.flushLoop(ctx, s)
}

// backfillRollupsMax bounds the startup backfill regardless of retention.
//
// Sixty days is far more than any correction has needed and short enough that
// the sweep is a few hundred queries rather than a scan of the whole history.
const backfillRollupsMax = 60

// backfillRollups recomputes recent days once, at startup.
//
// The flush loop only ever recomputes today and yesterday, because those are the
// only days still accruing. That is right for normal operation and wrong after a
// bug fix: a day rolled up by an older, incorrect version of the aggregation
// keeps its wrong figures forever, since nothing ever asks for it again. This is
// the path that lets a correction reach history.
//
// # Why it is bounded by retention, and must stay so
//
// `recomputeDay` rebuilds a day from its RAW rows. Message rows are pruned after
// `RetentionDays`, so recomputing a day older than that would find no messages
// and write a row full of zeroes — erasing real history rather than correcting
// it. The window is therefore capped just inside the retention horizon. Anything
// that widens retention may widen this; nothing may widen this alone.
func (w *WatchService) backfillRollups(ctx context.Context) {
	if w == nil || !w.cfg.Enabled() {
		return
	}
	// One day of headroom: a day at the exact boundary may be losing rows to the
	// pruner as this runs.
	days := w.cfg.RetentionDays - 1
	if days > backfillRollupsMax {
		days = backfillRollupsMax
	}
	if days < 1 {
		return
	}

	now := time.Now().UTC()
	// Yesterday backwards: today and yesterday are the flush loop's job and it
	// will have done them within the minute.
	start := now.AddDate(0, 0, -days)
	repaired := 0
	for _, id := range w.cfg.UserIDs {
		if err := w.recomputeSpan(ctx, id, start, now.AddDate(0, 0, -1)); err != nil {
			w.logger.Warn("watch: rollup backfill", "userId", id, "error", err)
			continue
		}
		repaired++
	}
	if repaired > 0 {
		// Worth a line: it explains why a summary that had settled is about to be
		// rewritten (the prompt hash moves with the figures, so a corrected day
		// re-summarises on the next pass by design).
		w.logger.Info("watch: recomputed recent rollups from raw rows",
			"users", repaired, "days", days)
	}
}

// gapGrace is the configured outage tolerance, with a sane floor so a
// misconfigured zero does not make every restart lose the session.
func (w *WatchService) gapGrace() time.Duration {
	if w.cfg.GapGrace <= 0 {
		return 10 * time.Minute
	}
	return w.cfg.GapGrace
}

// flushLoop re-measures open sessions and recomputes the live days on a fixed
// cadence, so a page loaded mid-session sees numbers that are at most one
// interval stale even if no gateway event has landed for hours.
func (w *WatchService) flushLoop(ctx context.Context, s *discordgo.Session) {
	interval := w.cfg.FlushInterval
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// The identity poll runs on its own, much slower clock off the same ticker,
	// so there is one timer rather than two racing for the mutex.
	identity := time.NewTicker(identityRefreshInterval)
	defer identity.Stop()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-identity.C:
				w.RefreshIdentities(ctx, s)
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			// Shutdown is an observed boundary: close open sessions at `now` and
			// bank the final stretch, rather than leaving rows the next start has
			// to write off as stale.
			w.closeAll(context.WithoutCancel(ctx), "shutdown")
			return
		case <-ticker.C:
			w.flush(ctx, s)
		}
	}
}

// flush beats the heartbeat on every open session and recomputes the days that
// can still change. Yesterday is included because a session that began before
// local midnight keeps adding to it until it ends.
func (w *WatchService) flush(ctx context.Context, s *discordgo.Session) {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := time.Now().UTC()
	// Settled first, so a compose session that expired since the last tick is
	// already judged by the time this tick's recompute reads the table.
	w.sweepTyping(ctx, now)
	// Then make the open voice rows match the gateway's own state, so a join we
	// never saw — or never managed to write — is adopted within the minute
	// rather than lost until he next leaves. See watch_voicesync.go.
	w.syncVoiceFromState(ctx, s, now)
	// …and the same for presence: status, clients and activities all hang off
	// PRESENCE_UPDATE, which never fires for somebody who was already online.
	w.syncPresenceFromState(ctx, s, now)
	// Peer counts drive `aloneSec`, the most damning figure the page has, and
	// they only move on a voice event — including other people's. Re-deriving
	// them from the gateway's state every tick means a missed join cannot leave
	// him credited as alone for the rest of the evening.
	w.refreshPeers(ctx, s, "", now)
	for _, id := range w.cfg.UserIDs {
		w.beat(ctx, id, now)
		for _, key := range []string{w.dateKey(now), w.dateKey(now.Add(-24 * time.Hour))} {
			if err := w.recomputeDay(ctx, id, key); err != nil {
				w.logger.Warn("watch: recompute day", "userId", id, "dateKey", key, "error", err)
			}
		}
	}
}

// beat re-saves a user's open sessions so their `updatedAt` proves the tracker
// was watching them a moment ago. That timestamp is the only thing a restart has
// to decide whether the session is resumable, so nothing else may skip it.
//
// Saving also banks the flag and peer time accrued since the last event, which
// keeps a long silent session's mute/alone counters honest instead of letting
// them arrive in one lump whenever he finally unmutes.
func (w *WatchService) beat(ctx context.Context, discordID string, now time.Time) {
	// The presence and activity heartbeats come FIRST and unconditionally: he is
	// very often online without being in a voice channel, and hanging them off
	// the voice branch below would leave those runs unbeaten — and so written
	// off as stale by the next restart.
	if err := w.repo.touchOpenPresence(ctx, discordID); err != nil {
		w.logger.Warn("watch: presence heartbeat", "userId", discordID, "error", err)
	}
	if err := w.repo.touchOpenStatus(ctx, discordID); err != nil {
		w.logger.Warn("watch: status heartbeat", "userId", discordID, "error", err)
	}

	sess, err := w.repo.openVoiceSession(ctx, discordID)
	if err != nil || sess == nil {
		return
	}
	w.bankFlags(sess, now)
	w.bankPeers(sess, now, sess.PeerCount)
	if err := w.repo.saveVoiceSession(ctx, sess); err != nil {
		w.logger.Warn("watch: heartbeat", "userId", discordID, "error", err)
		return
	}
	if err := w.repo.touchOpenPresence(ctx, discordID); err != nil {
		w.logger.Warn("watch: presence heartbeat", "userId", discordID, "error", err)
	}
}

// closeAll ends every open session for every tracked user at `now`.
func (w *WatchService) closeAll(ctx context.Context, reason string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := time.Now().UTC()
	for _, id := range w.cfg.UserIDs {
		if sess, err := w.repo.openVoiceSession(ctx, id); err == nil && sess != nil {
			w.bankFlags(sess, now)
			w.bankPeers(sess, now, sess.PeerCount)
			if err := w.repo.closeVoiceSession(ctx, sess, now, reason); err != nil {
				w.logger.Warn("watch: close voice on shutdown", "error", err)
			}
		}
		if err := w.repo.closeOpenPresence(ctx, id, nil, now); err != nil {
			w.logger.Warn("watch: close presence on shutdown", "error", err)
		}
		if open, err := w.repo.openStatusSession(ctx, id); err == nil && open != nil {
			if err := w.repo.closeStatusSession(ctx, open, now, reason); err != nil {
				w.logger.Warn("watch: close status on shutdown", "error", err)
			}
		}
		if err := w.recomputeDay(ctx, id, w.dateKey(now)); err != nil {
			w.logger.Warn("watch: recompute on shutdown", "error", err)
		}
	}
}

// ── Voice ───────────────────────────────────────────────────────────────────

// HandleVoiceState processes a voice state update. It runs for EVERY user, not
// just tracked ones, because somebody else joining or leaving is what decides
// whether the tracked user is now alone in the channel — but only a tracked
// user's own transitions produce rows.
func (w *WatchService) HandleVoiceState(ctx context.Context, s *discordgo.Session, e *discordgo.VoiceStateUpdate) {
	if w == nil || e == nil || e.VoiceState == nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	now := time.Now().UTC()
	if w.tracks(e.UserID) {
		if err := w.applyVoice(ctx, s, e, now); err != nil {
			w.logger.Warn("watch: voice transition", "userId", e.UserID, "error", err)
		}
	}
	// Somebody moved in or out of a channel a tracked user may be sitting in.
	w.refreshPeers(ctx, s, e.GuildID, now)
}

// applyVoice is the tracked user's own voice state machine: join, leave, move,
// or a flag change within the same channel.
func (w *WatchService) applyVoice(
	ctx context.Context, s *discordgo.Session, e *discordgo.VoiceStateUpdate, now time.Time,
) error {
	open, err := w.repo.openVoiceSession(ctx, e.UserID)
	if err != nil {
		return err
	}

	switch {
	case e.ChannelID == "":
		if open == nil {
			return nil
		}
		w.bankFlags(open, now)
		w.bankPeers(open, now, open.PeerCount)
		if err := w.repo.closeVoiceSession(ctx, open, now, "leave"); err != nil {
			return err
		}
		return w.recomputeSpan(ctx, e.UserID, open.JoinedAt, now)

	case open != nil && open.ChannelID != e.ChannelID:
		// A move is a leave plus a join, so "longest session" keeps meaning one
		// continuous stay in one place.
		w.bankFlags(open, now)
		w.bankPeers(open, now, open.PeerCount)
		if err := w.repo.closeVoiceSession(ctx, open, now, "move"); err != nil {
			return err
		}
		if err := w.recomputeSpan(ctx, e.UserID, open.JoinedAt, now); err != nil {
			return err
		}
		return w.startVoice(ctx, s, e, now)

	case open == nil:
		return w.startVoice(ctx, s, e, now)

	default:
		w.bankFlags(open, now)
		open.SelfMute, open.SelfDeaf = e.SelfMute, e.SelfDeaf
		open.Streaming, open.Video = e.SelfStream, e.SelfVideo
		open.ServerMute, open.ServerDeaf = e.Mute, e.Deaf
		return w.repo.saveVoiceSession(ctx, open)
	}
}

// startVoice opens a session for a tracked user who just joined a channel.
func (w *WatchService) startVoice(
	ctx context.Context, s *discordgo.Session, e *discordgo.VoiceStateUpdate, now time.Time,
) error {
	peers := countVoicePeers(s, e.GuildID, e.ChannelID, e.UserID)
	sess := &voiceSession{
		DiscordID:      e.UserID,
		GuildID:        e.GuildID,
		ChannelID:      e.ChannelID,
		ChannelName:    channelName(s, e.ChannelID),
		JoinedAt:       now,
		SelfMute:       e.SelfMute,
		SelfDeaf:       e.SelfDeaf,
		Streaming:      e.SelfStream,
		Video:          e.SelfVideo,
		ServerMute:     e.Mute,
		ServerDeaf:     e.Deaf,
		PeerCount:      peers,
		PeakPeers:      peers,
		FlagsChangedAt: now,
		PeersChangedAt: now,
	}
	if err := w.repo.insertVoiceSession(ctx, sess); err != nil {
		return err
	}
	return w.recomputeDay(ctx, e.UserID, w.dateKey(now))
}

// refreshPeers re-counts the company a tracked user has in their channel and
// banks any stretch they spent alone in it.
//
// An EMPTY `guildID` means "every guild" — the recovery path. Peer counts
// otherwise only move when a voice event arrives, so a join or leave that never
// reached us would leave him credited as alone for the rest of the call. The
// flush tick passes "" so the count is re-derived from the gateway's own state
// every minute regardless of which events landed.
func (w *WatchService) refreshPeers(ctx context.Context, s *discordgo.Session, guildID string, now time.Time) {
	for id := range w.watched {
		sess, err := w.repo.openVoiceSession(ctx, id)
		if err != nil || sess == nil {
			continue
		}
		if guildID != "" && sess.GuildID != guildID {
			continue
		}
		peers := countVoicePeers(s, sess.GuildID, sess.ChannelID, id)
		if peers == sess.PeerCount {
			continue
		}
		w.bankPeers(sess, now, peers)
		if err := w.repo.saveVoiceSession(ctx, sess); err != nil {
			w.logger.Warn("watch: peer update", "userId", id, "error", err)
		}
	}
}

// bankFlags credits the time elapsed since the last flag change to whichever
// toggles were on across it, then moves the cursor to `now`. Idempotent: calling
// it twice in a row banks zero the second time.
func (w *WatchService) bankFlags(sess *voiceSession, now time.Time) {
	d := int(now.Sub(sess.FlagsChangedAt).Seconds())
	if d > 0 {
		if sess.SelfMute || sess.ServerMute {
			sess.MutedSec += d
		}
		if sess.SelfDeaf || sess.ServerDeaf {
			sess.DeafenedSec += d
		}
		if sess.Streaming {
			sess.StreamingSec += d
		}
		if sess.Video {
			sess.VideoSec += d
		}
	}
	sess.FlagsChangedAt = now
}

// bankPeers credits time spent as the only human in the channel, then records
// the new company. `peakPeers` only ever rises.
func (w *WatchService) bankPeers(sess *voiceSession, now time.Time, peers int) {
	if d := int(now.Sub(sess.PeersChangedAt).Seconds()); d > 0 && sess.PeerCount == 0 {
		sess.AloneSec += d
	}
	sess.PeersChangedAt = now
	sess.PeerCount = peers
	if peers > sess.PeakPeers {
		sess.PeakPeers = peers
	}
}

// Reconcile settles the tracker's open rows against the gateway's own voice
// states when a guild syncs. This is what makes a restart mid-call correct in
// both directions, and it is the only place with enough information to do it:
//
//   - He is in the channel the resumed row already names → nothing to do, and
//     the session keeps its original joinedAt. A redeploy is invisible.
//   - He is in a DIFFERENT channel → the resumed row is closed as a move and a
//     new one opened, exactly as a live move would have been handled.
//   - He is in no channel at all → the row was resumed optimistically and that
//     bet lost, so it is closed RETROACTIVELY at its heartbeat rather than at
//     `now`. Resuming can therefore never credit time he was not there for;
//     the worst case is that the last minute before the restart is counted.
func (w *WatchService) Reconcile(ctx context.Context, s *discordgo.Session, guild *discordgo.Guild) {
	if w == nil || guild == nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	now := time.Now().UTC()
	present := make(map[string]struct{})

	for _, vs := range guild.VoiceStates {
		if vs == nil || !w.tracks(vs.UserID) || vs.ChannelID == "" {
			continue
		}
		present[vs.UserID] = struct{}{}

		open, err := w.repo.openVoiceSession(ctx, vs.UserID)
		if err != nil {
			w.logger.Warn("watch: reconcile lookup", "userId", vs.UserID, "error", err)
			continue
		}
		if open != nil && open.ChannelID == vs.ChannelID {
			continue // already tracking this exact stay — the resume held
		}
		if open != nil {
			w.bankFlags(open, now)
			w.bankPeers(open, now, open.PeerCount)
			if err := w.repo.closeVoiceSession(ctx, open, now, "move"); err != nil {
				w.logger.Warn("watch: reconcile close", "userId", vs.UserID, "error", err)
			}
		}
		if err := w.startVoice(ctx, s, &discordgo.VoiceStateUpdate{VoiceState: vs}, now); err != nil {
			w.logger.Warn("watch: reconcile open", "userId", vs.UserID, "error", err)
		}
	}

	// Settle the PRESENCE log against the same sync, for the same reason the
	// voice log is settled below: a status run resumed across a restart is a
	// guess until the gateway confirms it.
	//
	// A synced guild carries its members' presences, and Discord's presence is a
	// user-level fact rather than a per-guild one, so whichever guild syncs first
	// gives the real answer. `applyStatusSession` no-ops when the status and
	// client set are unchanged, which is what makes a redeploy invisible — the
	// resumed run keeps its original startedAt rather than being chopped in two.
	//
	// The `len(guild.Presences) > 0` guard matters: a lazily-loaded guild can
	// deliver an EMPTY presence array, which is "we did not tell you" and not
	// "he is offline". Treating that as offline would end a live run on every
	// such sync.
	if len(guild.Presences) > 0 {
		seen := make(map[string]struct{})
		for _, pr := range guild.Presences {
			if pr == nil || pr.User == nil || !w.tracks(pr.User.ID) {
				continue
			}
			seen[pr.User.ID] = struct{}{}
			if strings.TrimSpace(string(pr.Status)) == "" {
				continue
			}
			// The whole presence path, not just the session log. This used to
			// call `applyStatusSession` alone, which settled the LOG and left
			// `discord_watch_live` untouched — so a bot that connected while he
			// was already online showed a grey dot and "offline" on the card
			// forever, however many hours the log was correctly accruing. It
			// also opens the presence sessions for anything he is already
			// playing, which the log-only path never did either.
			w.applyPresence(ctx, &discordgo.PresenceUpdate{Presence: *pr, GuildID: guild.ID}, now)
		}

		// Present in the guild's roster but absent from its presences means
		// offline. Close the resumed run RETROACTIVELY at its heartbeat, so
		// resuming can never credit presence he was not there for.
		for id := range w.watched {
			if _, online := seen[id]; online {
				continue
			}
			open, err := w.repo.openStatusSession(ctx, id)
			if err != nil || open == nil {
				continue
			}
			endedAt := open.HeartbeatAt
			if endedAt.IsZero() || endedAt.Before(open.StartedAt) {
				endedAt = open.StartedAt
			}
			if err := w.repo.closeStatusSession(ctx, open, endedAt, "stale"); err != nil {
				w.logger.Warn("watch: reconcile status retire", "userId", id, "error", err)
				continue
			}
			if err := w.recomputeSpan(ctx, id, open.StartedAt, endedAt); err != nil {
				w.logger.Warn("watch: reconcile status recompute", "userId", id, "error", err)
			}
		}
	}

	// A resumed session in this guild for somebody who is not in voice here lost
	// its bet: close it back at the heartbeat that justified resuming it.
	for id := range w.watched {
		if _, stillHere := present[id]; stillHere {
			continue
		}
		open, err := w.repo.openVoiceSession(ctx, id)
		if err != nil || open == nil || open.GuildID != guild.ID {
			continue
		}
		endedAt := open.HeartbeatAt
		if endedAt.IsZero() || endedAt.Before(open.JoinedAt) {
			endedAt = open.JoinedAt
		}
		w.bankFlags(open, endedAt)
		w.bankPeers(open, endedAt, open.PeerCount)
		if err := w.repo.closeVoiceSession(ctx, open, endedAt, "stale"); err != nil {
			w.logger.Warn("watch: reconcile retire", "userId", id, "error", err)
			continue
		}
		if err := w.recomputeSpan(ctx, id, open.JoinedAt, endedAt); err != nil {
			w.logger.Warn("watch: reconcile recompute", "userId", id, "error", err)
		}
	}
}

// ── Messages ────────────────────────────────────────────────────────────────

// HandleMessage records one message from a tracked user. Content is stored only
// when StoreContent is on, and only truncated; everything else here is shape.
func (w *WatchService) HandleMessage(ctx context.Context, s *discordgo.Session, m *discordgo.MessageCreate) {
	if w == nil || m == nil || m.Author == nil || !w.tracks(m.Author.ID) {
		return
	}
	sentAt := m.Timestamp.UTC()
	if sentAt.IsZero() {
		sentAt = time.Now().UTC()
	}
	metrics := analyzeMessage(m.Content)

	row := &watchMessage{
		DiscordID:   m.Author.ID,
		GuildID:     m.GuildID,
		ChannelID:   m.ChannelID,
		ChannelName: channelName(s, m.ChannelID),
		MessageID:   m.ID,
		SentAt:      sentAt,
		CharCount:   metrics.Chars,
		WordCount:   metrics.Words,
		Attachments: len(m.Attachments),
		Embeds:      len(m.Embeds),
		Links:       metrics.Links,
		Mentions:    len(m.Mentions),
		Emoji:       metrics.Emoji,
		Stickers:    len(m.StickerItems),
		IsReply:     m.MessageReference != nil,
		IsQuestion:  metrics.Question,
		IsLateNight: isLateNight(sentAt, w.loc),
		// Decided here, from the text, and stored — the text does not survive
		// retention and a rule applied later would have nothing to read.
		// Independent of StoreContent: the FINDING is not the content, and the
		// figure this feeds must not silently zero out when text is off.
		MentionsJob: matchesJobHunt(m.Content),
	}
	if w.cfg.StoreContent && m.Content != "" {
		row.Content = truncateRunes(m.Content, contentLimit)
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.repo.insertMessage(ctx, row); err != nil {
		w.logger.Warn("watch: insert message", "userId", m.Author.ID, "error", err)
		return
	}
	// The message is the verdict on whatever he was typing in this channel: the
	// compose session produced something after all.
	w.settleTypingForMessage(ctx, m.Author.ID, m.ChannelID, sentAt)
	// A message is the most reliable place to learn his current name and avatar:
	// the author object on a MessageCreate is always fully populated, where a
	// presence update's user often is not.
	if err := w.repo.upsertLiveIdentity(ctx, m.Author.ID, m.Author.Username, m.Author.GlobalName, m.Author.Avatar); err != nil {
		w.logger.Warn("watch: live identity from message", "error", err)
	}
	if err := w.recomputeDay(ctx, m.Author.ID, w.dateKey(sentAt)); err != nil {
		w.logger.Warn("watch: recompute after message", "error", err)
	}
}

// HandleReaction records reactions in both directions: ones a tracked user gave,
// and ones other people left on a tracked user's messages.
//
// These are the only counters incremented rather than recomputed — there is no
// raw reaction table to recompute them from — which is why the rollup writer
// leaves both columns untouched.
func (w *WatchService) HandleReaction(ctx context.Context, e *discordgo.MessageReactionAdd) {
	if w == nil || e == nil || e.MessageReaction == nil {
		return
	}
	now := time.Now().UTC()

	w.mu.Lock()
	defer w.mu.Unlock()

	if w.tracks(e.UserID) {
		if err := w.repo.bumpReactions(ctx, e.UserID, w.dateKey(now), w.cfg.TimeZone, 1, 0); err != nil {
			w.logger.Warn("watch: reaction given", "error", err)
		}
		return
	}
	author, sentAt, err := w.repo.messageAuthor(ctx, e.MessageID)
	if err != nil || author == "" {
		return
	}
	if err := w.repo.bumpReactions(ctx, author, w.dateKey(sentAt), w.cfg.TimeZone, 0, 1); err != nil {
		w.logger.Warn("watch: reaction received", "error", err)
	}
}

// ── Presence (what he is playing) ───────────────────────────────────────────

// HandlePresence reconciles a tracked user's running activities against the open
// presence rows: anything they stopped is closed, anything new is opened.
//
// Custom statuses (type 4) are skipped — a status is a string somebody typed,
// not time spent doing something, and counting it as an activity would put "🧋"
// on the chart next to eleven hours of Counter-Strike.
func (w *WatchService) HandlePresence(ctx context.Context, e *discordgo.PresenceUpdate) {
	if w == nil || e == nil || e.User == nil || !w.tracks(e.User.ID) {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.applyPresence(ctx, e, time.Now().UTC())
}

// applyPresence is the whole of the presence bookkeeping, split from the handler
// above so the periodic sweep can run the identical path.
//
// That sharing is the point rather than a convenience: a second implementation
// of "what a presence means" is how the live card and the presence log end up
// disagreeing about whether he is online. See watch_presencesync.go for why the
// sweep exists at all.
//
// Caller must hold `w.mu`.
func (w *WatchService) applyPresence(ctx context.Context, e *discordgo.PresenceUpdate, now time.Time) {
	live := make(map[string]*discordgo.Activity, len(e.Activities))
	for _, a := range e.Activities {
		if a == nil || a.Type == discordgo.ActivityTypeCustom || strings.TrimSpace(a.Name) == "" {
			continue
		}
		live[activityKey(a)] = a
	}

	// The profile card's "now" row. Written before the session reconciliation
	// below so the card is current even if a database error stops the rest.
	w.recordLiveStatus(ctx, e)

	// The presence LOG — how long he was online, and on what. Separate from the
	// live row above because that one records a level and this one records
	// intervals; only the log can answer "nine hours, six of them on mobile".
	if status := strings.TrimSpace(string(e.Status)); status != "" {
		if status == "invisible" {
			status = "offline"
		}
		if err := w.applyStatusSession(ctx, e.User.ID, status, clientsFrom(e.ClientStatus), now); err != nil {
			w.logger.Warn("watch: status session", "userId", e.User.ID, "error", err)
		}
	}

	open, err := w.repo.openPresenceSessions(ctx, e.User.ID)
	if err != nil {
		w.logger.Warn("watch: presence lookup", "error", err)
		return
	}
	stillOpen := make(map[string]struct{}, len(open))
	for _, sess := range open {
		key := sess.key()
		if _, running := live[key]; running {
			stillOpen[key] = struct{}{}
			continue
		}
		if err := w.repo.closePresenceSession(ctx, sess, now); err != nil {
			w.logger.Warn("watch: close presence", "error", err)
		}
	}

	for key, a := range live {
		if _, already := stillOpen[key]; already {
			continue
		}
		// Rich presence reports when the activity actually began, which is often
		// before the bot heard about it. Trust it, but never let it backdate past
		// the previous local midnight — a client that has been open for three days
		// would otherwise dump 72 hours into today.
		startedAt := now
		if ts := a.Timestamps.StartTimestamp; ts > 0 {
			if t := time.UnixMilli(ts).UTC(); t.Before(now) && t.After(localMidnight(now, w.loc)) {
				startedAt = t
			}
		}
		sess := &presenceSession{
			DiscordID:    e.User.ID,
			GuildID:      e.GuildID,
			ActivityName: truncateRunes(a.Name, 120),
			ActivityType: int(a.Type),
			Details:      truncateRunes(a.Details, 200),
			State:        truncateRunes(a.State, 200),
			StartedAt:    startedAt,
		}
		if err := w.repo.insertPresenceSession(ctx, sess); err != nil {
			w.logger.Warn("watch: open presence", "activity", key, "error", err)
		}
	}

	if err := w.recomputeDay(ctx, e.User.ID, w.dateKey(now)); err != nil {
		w.logger.Warn("watch: recompute after presence", "error", err)
	}
}

// identityRefreshInterval is how often the tracker re-asks Discord who he is.
//
// Identity also arrives opportunistically (every message, and presence payloads
// that carry a full user), but neither fires while he is quiet — and an avatar
// hash goes DEAD the moment he changes his picture, because Discord's CDN 404s
// the old hash rather than redirecting. A poll is the only thing that closes
// that window for a user who changes their avatar and then says nothing.
//
// Hourly: one REST call per tracked user against a
// rate limit measured in requests per second.
const identityRefreshInterval = time.Hour

// RefreshIdentities re-fetches each tracked user's current name and avatar from
// Discord and caches them for the profile card.
//
// The REST endpoint rather than the state cache: `s.State.Member` only knows
// users the bot has seen in an event this run, so on a fresh start — exactly
// when the card is emptiest — it usually knows nothing. `s.User` always answers.
func (w *WatchService) RefreshIdentities(ctx context.Context, s *discordgo.Session) {
	if w == nil || s == nil {
		return
	}
	for _, id := range w.cfg.UserIDs {
		user, err := s.User(id, discordgo.WithContext(ctx))
		if err != nil || user == nil {
			// A failed lookup leaves the last known identity in place; the next
			// refresh (or his next message) tries again.
			w.logger.Warn("watch: identity refresh", "userId", id, "error", err)
			continue
		}
		w.mu.Lock()
		err = w.repo.upsertLiveIdentity(ctx, user.ID, user.Username, user.GlobalName, user.Avatar)
		w.mu.Unlock()
		if err != nil {
			w.logger.Warn("watch: identity refresh write", "userId", id, "error", err)
		}
	}
}

// recordLiveStatus writes the online/idle/dnd level and the headline activity
// for the profile card.
//
// Discord sends an empty status string on some presence payloads (a partial
// update carrying only activities). Treating that as "offline" would flicker the
// card's dot every time he alt-tabbed, so an empty status is left alone rather
// than written.
func (w *WatchService) recordLiveStatus(ctx context.Context, e *discordgo.PresenceUpdate) {
	status := strings.TrimSpace(string(e.Status))
	if status == "" {
		return
	}
	// `invisible` is what the client reports to itself; to everyone else — and to
	// this page — it is offline, and calling it anything else would be a lie the
	// dot tells.
	if status == "invisible" {
		status = "offline"
	}

	// Discord stacks activities — a game, Spotify and a stream can all be live at
	// once — so the whole set is recorded and the card renders all of them. The
	// headline pair is kept alongside for the one-line summaries (the OG card,
	// the meta description) that have room for exactly one.
	name, kind := "", (*int)(nil)
	live := make([]liveActivity, 0, len(e.Activities))
	custom, customEmoji := "", ""

	for _, a := range e.Activities {
		if a == nil {
			continue
		}
		// Type 4 is the custom status: a line of text somebody typed about
		// themselves, not time spent doing something. It is captured, but as its
		// own thing rather than as an activity.
		if a.Type == discordgo.ActivityTypeCustom {
			custom = truncateRunes(strings.TrimSpace(a.State), 190)
			if a.Emoji.Name != "" {
				customEmoji = truncateRunes(a.Emoji.Name, 64)
			}
			continue
		}
		if strings.TrimSpace(a.Name) == "" {
			continue
		}

		t := int(a.Type)
		entry := liveActivity{
			Name:    truncateRunes(a.Name, 120),
			Type:    t,
			Details: truncateRunes(a.Details, 200),
			State:   truncateRunes(a.State, 200),
		}
		// Rich presence reports when the activity began; the card counts up from
		// it. Left zero when Discord does not say, and the card then omits the
		// duration rather than claiming it started this instant.
		if ts := a.Timestamps.StartTimestamp; ts > 0 {
			entry.StartedAt = time.UnixMilli(ts).UTC().Format(time.RFC3339)
		}
		live = append(live, entry)

		// A game outranks whatever else is running for the headline slot; the
		// first non-game only holds it until a game turns up.
		if kind == nil || (!playingActivityTypes[*kind] && playingActivityTypes[t]) {
			name, kind = entry.Name, &t
		}
	}

	if err := w.repo.upsertLiveStatus(ctx, e.User.ID, status, name, kind, live, custom, customEmoji); err != nil {
		w.logger.Warn("watch: live status", "error", err)
	}
	if u := e.User; u != nil && u.Username != "" {
		if err := w.repo.upsertLiveIdentity(ctx, u.ID, u.Username, u.GlobalName, u.Avatar); err != nil {
			w.logger.Warn("watch: live identity", "error", err)
		}
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// messageMetrics is what one message's text is worth to the rollups.
type messageMetrics struct {
	Chars    int
	Words    int
	Links    int
	Emoji    int
	Question bool
}

// analyzeMessage derives a message's shape from its text. Pure, so the counting
// rules are testable without a gateway.
func analyzeMessage(content string) messageMetrics {
	m := messageMetrics{Chars: len([]rune(content))}
	m.Words = len(strings.Fields(content))
	m.Question = strings.Contains(content, "?")

	lower := strings.ToLower(content)
	for _, scheme := range []string{"http://", "https://"} {
		m.Links += strings.Count(lower, scheme)
	}
	// Custom emoji (<:name:id> / <a:name:id>) plus anything in a Unicode
	// pictographic range. Counting runes rather than grapheme clusters means a
	// flag or a skin-tone sequence lands as more than one; the figure is a
	// texture measure, not an inventory.
	m.Emoji = strings.Count(content, "<:") + strings.Count(content, "<a:")
	for _, r := range content {
		if isPictographic(r) {
			m.Emoji++
		}
	}
	return m
}

// isPictographic reports whether a rune sits in one of the emoji blocks.
func isPictographic(r rune) bool {
	switch {
	case r >= 0x1F300 && r <= 0x1FAFF, // symbols & pictographs through extended-A
		r >= 0x2600 && r <= 0x27BF,   // misc symbols + dingbats
		r >= 0x1F000 && r <= 0x1F2FF: // mahjong/domino/playing cards, enclosed
		return true
	}
	return false
}

// isLateNight reports whether an instant falls in the local small hours.
func isLateNight(t time.Time, loc *time.Location) bool {
	h := t.In(loc).Hour()
	return h >= lateNightStart && h < lateNightEnd
}

// localMidnight is the most recent local midnight at or before t.
func localMidnight(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc).UTC()
}

// truncateRunes cuts a string to at most n runes (never mid-rune, which is what
// a byte slice would do to any message with an emoji in it).
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// activityKey identifies an activity across presence updates. Name plus type,
// because "Spotify" as listening and "Spotify" as playing are different things
// and Discord will report both. `itoa` is the package's own (pet.go).
func activityKey(a *discordgo.Activity) string {
	return strings.ToLower(strings.TrimSpace(a.Name)) + "\x00" + itoa(int(a.Type))
}

// countVoicePeers counts the other humans in a channel, from the gateway's state
// cache. discordgo applies a VoiceStateUpdate to that cache before dispatching
// it to handlers, so this is the membership AFTER the event that triggered it.
func countVoicePeers(s *discordgo.Session, guildID, channelID, exclude string) int {
	if s == nil || s.State == nil || channelID == "" {
		return 0
	}
	g, err := s.State.Guild(guildID)
	if err != nil || g == nil {
		return 0
	}
	n := 0
	for _, vs := range g.VoiceStates {
		if vs == nil || vs.ChannelID != channelID || vs.UserID == exclude {
			continue
		}
		if m, err := s.State.Member(guildID, vs.UserID); err == nil && m != nil && m.User != nil && m.User.Bot {
			continue
		}
		n++
	}
	return n
}

// channelName resolves a channel's name from state, falling back to "" so the
// rollup shows the id rather than blocking on a REST call in a handler.
func channelName(s *discordgo.Session, channelID string) string {
	if s == nil || s.State == nil || channelID == "" {
		return ""
	}
	c, err := s.State.Channel(channelID)
	if err != nil || c == nil {
		return ""
	}
	return c.Name
}
