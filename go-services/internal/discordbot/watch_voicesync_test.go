package discordbot

import (
	"testing"

	"github.com/bwmarrin/discordgo"
)

// The voice sync's correctness rests on two lookups, and both have a failure
// mode that would be invisible in production: one silently misses a user who IS
// in a channel, the other silently closes a live session because the cache had
// not loaded yet.

func stateWith(guilds ...*discordgo.Guild) *discordgo.Session {
	state := discordgo.NewState()
	for _, g := range guilds {
		_ = state.GuildAdd(g)
	}
	return &discordgo.Session{State: state}
}

func TestLookupVoiceStateFindsAUserInAnyGuild(t *testing.T) {
	s := stateWith(
		&discordgo.Guild{ID: "g1", VoiceStates: []*discordgo.VoiceState{
			{UserID: "someone-else", ChannelID: "c9"},
		}},
		&discordgo.Guild{ID: "g2", VoiceStates: []*discordgo.VoiceState{
			{UserID: "u", ChannelID: "c1", SelfMute: true},
		}},
	)

	got := lookupVoiceState(s, "u")
	if got == nil {
		t.Fatal("lookupVoiceState returned nil for a user who is in a channel")
	}
	if got.ChannelID != "c1" {
		t.Errorf("ChannelID = %q, want c1", got.ChannelID)
	}
	// The guild id is routinely omitted inside a guild payload, and `startVoice`
	// needs it — a blank one would write a session that belongs to no guild and
	// that `Reconcile` could never match.
	if got.GuildID != "g2" {
		t.Errorf("GuildID = %q, want g2 (filled in from the containing guild)", got.GuildID)
	}
	if !got.SelfMute {
		t.Error("flags were not carried through")
	}
}

func TestLookupVoiceStateIgnoresAnEmptyChannel(t *testing.T) {
	// Discord leaves a voice state behind with a blank ChannelID when somebody
	// disconnects. Treating that as "in a channel" would open a session against
	// no channel at all and never close it.
	s := stateWith(&discordgo.Guild{ID: "g1", VoiceStates: []*discordgo.VoiceState{
		{UserID: "u", ChannelID: ""},
	}})
	if got := lookupVoiceState(s, "u"); got != nil {
		t.Errorf("lookupVoiceState = %+v, want nil for a blank channel", got)
	}
}

func TestLookupVoiceStateReturnsNilWhenNotInVoice(t *testing.T) {
	s := stateWith(&discordgo.Guild{ID: "g1", VoiceStates: []*discordgo.VoiceState{
		{UserID: "other", ChannelID: "c1"},
	}})
	if got := lookupVoiceState(s, "u"); got != nil {
		t.Errorf("lookupVoiceState = %+v, want nil", got)
	}
	// And a nil session must not panic — the sweep runs on a timer that can fire
	// before the gateway is up.
	if got := lookupVoiceState(nil, "u"); got != nil {
		t.Errorf("lookupVoiceState(nil) = %+v, want nil", got)
	}
}

func TestLookupVoiceStateCopiesTheState(t *testing.T) {
	// discordgo mutates its cached voice states in place as events arrive, and
	// the caller reads the result outside the state lock. Returning the pointer
	// would be a data race that only shows up under load.
	guild := &discordgo.Guild{ID: "g1", VoiceStates: []*discordgo.VoiceState{
		{UserID: "u", ChannelID: "c1"},
	}}
	s := stateWith(guild)

	got := lookupVoiceState(s, "u")
	if got == nil {
		t.Fatal("expected a voice state")
	}
	if got == guild.VoiceStates[0] {
		t.Error("lookupVoiceState returned the cache's own pointer rather than a copy")
	}
}

func TestStateKnowsGuild(t *testing.T) {
	s := stateWith(&discordgo.Guild{ID: "g1"})

	if !stateKnowsGuild(s, "g1") {
		t.Error("a guild in the cache should be known")
	}
	// The distinction the "he left" branch depends on. An unknown guild means we
	// have not been told, and closing a live session on that basis would delete
	// real time every time the gateway reconnected.
	if stateKnowsGuild(s, "g-unseen") {
		t.Error("an absent guild must not read as known")
	}
	if stateKnowsGuild(s, "") {
		t.Error("a blank guild id must not read as known")
	}
	if stateKnowsGuild(nil, "g1") {
		t.Error("a nil session must not read as known")
	}
}
