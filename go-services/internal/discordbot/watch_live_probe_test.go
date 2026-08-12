// End-to-end checks against a real Postgres, skipped unless WATCH_PROBE_DSN is
// set. They COMPILE in CI so they cannot rot, and they answer with evidence
// rather than reasoning the one question the unit suite cannot: does a voice
// join actually write a row?
//
// The unit suite runs every repo method against a nil database, where each one
// early-returns — which is exactly how a self-recursive SQL helper reached
// production. These are the tests that would have caught it in ten seconds.
//
//	WATCH_PROBE_DSN=postgres://postgres:password@localhost:5432/rmhstudios \
//	  go test ./internal/discordbot/ -run TestProbe -v
package discordbot

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

const probeUser = "999999999999999999"

func probeService(t *testing.T) (*WatchService, context.Context) {
	t.Helper()
	dsn := os.Getenv("WATCH_PROBE_DSN")
	if dsn == "" {
		t.Skip("WATCH_PROBE_DSN unset")
	}
	ctx := context.Background()
	database, err := db.Open(ctx, dsn, 4)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool.Exec(ctx,
			`DELETE FROM "discord_watch_voice_session" WHERE "discordId"=$1`, probeUser)
		_, _ = database.Pool.Exec(ctx,
			`DELETE FROM "discord_watch_day" WHERE "discordId"=$1`, probeUser)
	})

	logger := log.New("probe", "info")
	repo := newWatchRepo(database).withLogger(logger)
	svc := NewWatchService(WatchConfig{
		UserIDs:       []string{probeUser},
		TimeZone:      "America/New_York",
		RetentionDays: 45,
		FlushInterval: time.Minute,
		GapGrace:      10 * time.Minute,
	}, repo, logger)
	if svc == nil {
		t.Fatal("NewWatchService returned nil")
	}
	return svc, ctx
}

// probeSummarizer builds a summarizer whose model client is deliberately
// UNCONFIGURED, so any attempt to write a summary fails immediately and locally
// — no key, no network, no cost. That turns "did it try to re-summarise?" into a
// plain error check.
func probeSummarizer(t *testing.T, w *WatchService) *WatchSummarizer {
	t.Helper()
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable: %v", err)
	}
	return &WatchSummarizer{
		repo:     w.repo,
		deepseek: &DeepSeekClient{},
		logger:   log.New("probe", "info"),
		cfg:      WatchConfig{UserIDs: []string{probeUser}, TimeZone: "America/New_York"},
		loc:      loc,
	}
}

// seedProbeDay writes a rollup with enough in it that the period is worth
// summarising — without it, `summarize` returns early on "nothing happened" and
// a seal test would pass for entirely the wrong reason.
func seedProbeDay(t *testing.T, ctx context.Context, w *WatchService, dateKey string) {
	t.Helper()
	if err := w.repo.writeDayRollup(ctx, &dayRollup{
		DiscordID: probeUser,
		DateKey:   dateKey,
		TimeZone:  "America/New_York",
		Messages:  42,
		VoiceSec:  3600,
	}); err != nil {
		t.Fatalf("writeDayRollup: %v", err)
	}
}

// TestProbeSealedPeriodIsNeverRewritten is the composition the unit tests cannot
// reach: `decideSummary` and `periodSealed` are pure and tested, but whether
// `summarize` actually consults them needs a row in a real table, because with a
// nil database every repo method early-returns and the summary always looks
// absent.
//
// The pair matters more than either half. The sealed case proves nothing is
// rewritten; the in-progress case proves the model WOULD have been called on the
// same data, so the seal is what stopped it and not an unrelated early return.
func TestProbeSealedPeriodIsNeverRewritten(t *testing.T) {
	w, ctx := probeService(t)
	s := probeSummarizer(t, w)

	const dateKey = "2026-08-11"
	const sentinel = "sentinel-hash-written-when-the-day-was-current"
	t.Cleanup(func() {
		_, _ = w.repo.db.Pool.Exec(ctx,
			`DELETE FROM "discord_watch_summary" WHERE "discordId"=$1`, probeUser)
	})

	seedProbeDay(t, ctx, w, dateKey)
	if err := w.repo.upsertSummary(ctx, &watchSummary{
		DiscordID: probeUser, Period: periodDay, PeriodKey: dateKey,
		Headline: "Sealed", Summary: "Written while the day was still current.",
		Model: "probe", SourceHash: sentinel,
	}); err != nil {
		t.Fatalf("upsertSummary: %v", err)
	}

	// Long after the settle window: the entry is final.
	sealedAt := time.Date(2026, time.August, 20, 12, 0, 0, 0, s.loc)
	if err := s.summarize(ctx, probeUser, periodDay, dateKey, sealedAt); err != nil {
		t.Fatalf("summarize on a sealed day returned %v — it tried to rewrite it", err)
	}
	after, err := w.repo.summarySourceHash(ctx, probeUser, periodDay, dateKey)
	if err != nil {
		t.Fatalf("summarySourceHash: %v", err)
	}
	if after != sentinel {
		t.Errorf("sourceHash = %q, want the original %q — the sealed entry was rewritten", after, sentinel)
	}

	// The same call while the day is still running must reach the model. If this
	// does NOT error, the seal is not what stopped the case above.
	duringTheDay := time.Date(2026, time.August, 11, 15, 0, 0, 0, s.loc)
	if err := s.summarize(ctx, probeUser, periodDay, dateKey, duringTheDay); err == nil {
		t.Error("summarize on the current day returned nil — it never reached the model, " +
			"so the sealed case above proves nothing")
	}
}

// TestProbeConcludedPeriodWithNoSummaryIsStillFilledIn guards the deliberate
// exception. Sealing must not turn an outage into a permanent blank cell.
func TestProbeConcludedPeriodWithNoSummaryIsStillFilledIn(t *testing.T) {
	w, ctx := probeService(t)
	s := probeSummarizer(t, w)

	const dateKey = "2026-08-11"
	t.Cleanup(func() {
		_, _ = w.repo.db.Pool.Exec(ctx,
			`DELETE FROM "discord_watch_summary" WHERE "discordId"=$1`, probeUser)
	})
	seedProbeDay(t, ctx, w, dateKey)

	// Concluded, sealed, and never written. It must still be attempted — which
	// with an unconfigured client means reaching the model and failing there.
	sealedAt := time.Date(2026, time.August, 20, 12, 0, 0, 0, s.loc)
	if err := s.summarize(ctx, probeUser, periodDay, dateKey, sealedAt); err == nil {
		t.Error("a concluded day with no summary was skipped — an outage would leave " +
			"a permanent hole in the calendar")
	}
}

// TestProbeVoiceJoinWritesARow drives the ordinary event path.
func TestProbeVoiceJoinWritesARow(t *testing.T) {
	w, ctx := probeService(t)
	session := &discordgo.Session{State: discordgo.NewState()}
	_ = session.State.GuildAdd(&discordgo.Guild{ID: "g1"})

	w.mu.Lock()
	err := w.applyVoice(ctx, session, &discordgo.VoiceStateUpdate{
		VoiceState: &discordgo.VoiceState{UserID: probeUser, GuildID: "g1", ChannelID: "c1"},
	}, time.Now().UTC())
	w.mu.Unlock()
	if err != nil {
		t.Fatalf("applyVoice: %v", err)
	}

	open, err := w.repo.openVoiceSession(ctx, probeUser)
	if err != nil {
		t.Fatalf("openVoiceSession: %v", err)
	}
	if open == nil {
		t.Fatal("no open voice session after a join — the write path is broken")
	}
	t.Logf("join wrote session id=%s channel=%s", open.ID, open.ChannelID)
}

// TestProbeSyncAdoptsAnAlreadyOpenChannel is the reported scenario: he is
// already sitting in a channel and no join event ever arrives.
func TestProbeSyncAdoptsAnAlreadyOpenChannel(t *testing.T) {
	w, ctx := probeService(t)

	// A gateway state that says he is in a channel, with the tracker knowing
	// nothing about it — exactly what a restart mid-call looks like.
	session := &discordgo.Session{State: discordgo.NewState()}
	_ = session.State.GuildAdd(&discordgo.Guild{
		ID: "g1",
		VoiceStates: []*discordgo.VoiceState{
			{UserID: probeUser, ChannelID: "c-already", SelfMute: true},
		},
	})

	if open, _ := w.repo.openVoiceSession(ctx, probeUser); open != nil {
		t.Fatalf("precondition: expected no open session, got %s", open.ID)
	}

	w.mu.Lock()
	w.syncVoiceFromState(ctx, session, time.Now().UTC())
	w.mu.Unlock()

	open, err := w.repo.openVoiceSession(ctx, probeUser)
	if err != nil {
		t.Fatalf("openVoiceSession: %v", err)
	}
	if open == nil {
		t.Fatal("sync did not adopt a channel the gateway says he is in")
	}
	if open.ChannelID != "c-already" {
		t.Errorf("adopted channel = %q, want c-already", open.ChannelID)
	}
	if !open.SelfMute {
		t.Error("flags were not carried into the adopted session")
	}
	t.Logf("sync adopted session id=%s channel=%s selfMute=%v", open.ID, open.ChannelID, open.SelfMute)

	// And the day rollup must reflect it, since that is what the page reads.
	roll, err := w.repo.daysInRange(ctx, probeUser, w.dateKey(time.Now().UTC()), w.dateKey(time.Now().UTC()))
	if err != nil {
		t.Fatalf("daysInRange: %v", err)
	}
	if len(roll) == 0 {
		t.Fatal("no day rollup written for the adopted session")
	}
	t.Logf("day rollup: voiceSec=%d voiceSessions=%d", roll[0].VoiceSec, roll[0].VoiceSessions)
}

// TestProbeSyncKeepsALiveSessionThroughATransientCacheGap is the guard on the
// one destructive thing the sweep does.
//
// A cache that momentarily does not list him — mid-rebuild, mid-reconnect, a
// guild whose voice states have not landed — must not end a call he is still
// sitting in, because the next sweep would then see nothing open and leave it
// ended. The symptom of getting this wrong is precisely "voice time accrues but
// the card never shows a channel".
func TestProbeSyncKeepsALiveSessionThroughATransientCacheGap(t *testing.T) {
	w, ctx := probeService(t)

	inVoice := &discordgo.Session{State: discordgo.NewState()}
	_ = inVoice.State.GuildAdd(&discordgo.Guild{
		ID:          "g1",
		VoiceStates: []*discordgo.VoiceState{{UserID: probeUser, ChannelID: "c1"}},
	})
	// The guild is known but reports nobody in voice — the ambiguous reading.
	gap := &discordgo.Session{State: discordgo.NewState()}
	_ = gap.State.GuildAdd(&discordgo.Guild{ID: "g1"})

	now := time.Now().UTC()
	w.mu.Lock()
	w.syncVoiceFromState(ctx, inVoice, now)
	w.mu.Unlock()

	open, _ := w.repo.openVoiceSession(ctx, probeUser)
	if open == nil {
		t.Fatal("precondition: sync did not adopt the session")
	}
	sessionID := open.ID

	// Two blank readings must not end it.
	for i := 1; i < voiceCloseAfterMisses; i++ {
		w.mu.Lock()
		w.syncVoiceFromState(ctx, gap, now.Add(time.Duration(i)*time.Minute))
		w.mu.Unlock()
		if open, _ = w.repo.openVoiceSession(ctx, probeUser); open == nil {
			t.Fatalf("session closed after %d blank reading(s), want it to survive %d",
				i, voiceCloseAfterMisses-1)
		}
	}

	// One more, and it settles.
	w.mu.Lock()
	w.syncVoiceFromState(ctx, gap, now.Add(voiceCloseAfterMisses*time.Minute))
	w.mu.Unlock()
	if open, _ = w.repo.openVoiceSession(ctx, probeUser); open != nil {
		t.Errorf("session %s still open after %d blank readings", open.ID, voiceCloseAfterMisses)
	}

	// And a sighting in between must reset the count rather than accumulating.
	w.mu.Lock()
	w.syncVoiceFromState(ctx, inVoice, now.Add(10*time.Minute))
	w.syncVoiceFromState(ctx, gap, now.Add(11*time.Minute))
	w.syncVoiceFromState(ctx, inVoice, now.Add(12*time.Minute))
	w.syncVoiceFromState(ctx, gap, now.Add(13*time.Minute))
	w.mu.Unlock()
	if open, _ = w.repo.openVoiceSession(ctx, probeUser); open == nil {
		t.Error("alternating sightings closed the session — the miss counter is not resetting")
	}
	_ = sessionID
}
