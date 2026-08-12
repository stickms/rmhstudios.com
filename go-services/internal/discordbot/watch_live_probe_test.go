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
