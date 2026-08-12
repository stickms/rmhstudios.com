package discordbot

import (
	"testing"

	"github.com/bwmarrin/discordgo"
)

func presenceStateWith(guilds ...*discordgo.Guild) *discordgo.Session {
	state := discordgo.NewState()
	for _, g := range guilds {
		_ = state.GuildAdd(g)
	}
	return &discordgo.Session{State: state}
}

func TestLookupPresenceFindsAUserAndTheirGuild(t *testing.T) {
	s := presenceStateWith(
		&discordgo.Guild{ID: "g1", Presences: []*discordgo.Presence{
			{User: &discordgo.User{ID: "other"}, Status: discordgo.StatusOnline},
		}},
		&discordgo.Guild{ID: "g2", Presences: []*discordgo.Presence{
			{
				User:         &discordgo.User{ID: "u"},
				Status:       discordgo.StatusIdle,
				ClientStatus: discordgo.ClientStatus{Mobile: "idle"},
			},
		}},
	)

	got, guildID := lookupPresence(s, "u")
	if got == nil {
		t.Fatal("lookupPresence returned nil for a user with a cached presence")
	}
	if got.Status != discordgo.StatusIdle {
		t.Errorf("Status = %q, want idle", got.Status)
	}
	// A presence session records the guild it was observed in, so the id has to
	// come back with it — presence itself is a user-level fact.
	if guildID != "g2" {
		t.Errorf("guildID = %q, want g2", guildID)
	}
	if !clientsFrom(got.ClientStatus).Mobile {
		t.Error("client status did not survive the lookup")
	}
}

func TestLookupPresenceReturnsNilWhenAbsent(t *testing.T) {
	s := presenceStateWith(&discordgo.Guild{ID: "g1", Presences: []*discordgo.Presence{
		{User: &discordgo.User{ID: "other"}, Status: discordgo.StatusOnline},
	}})
	if got, _ := lookupPresence(s, "u"); got != nil {
		t.Errorf("lookupPresence = %+v, want nil", got)
	}
	// The sweep runs on a timer that can fire before the gateway is up.
	if got, _ := lookupPresence(nil, "u"); got != nil {
		t.Errorf("lookupPresence(nil) = %+v, want nil", got)
	}
}

func TestLookupPresenceCopiesTheEntry(t *testing.T) {
	// discordgo mutates cached presences in place as events arrive, and the
	// caller reads the result outside the state lock.
	guild := &discordgo.Guild{ID: "g1", Presences: []*discordgo.Presence{
		{User: &discordgo.User{ID: "u"}, Status: discordgo.StatusOnline},
	}}
	s := presenceStateWith(guild)

	got, _ := lookupPresence(s, "u")
	if got == nil {
		t.Fatal("expected a presence")
	}
	if got == guild.Presences[0] {
		t.Error("lookupPresence returned the cache's own pointer rather than a copy")
	}
}

// TestCachedClientStatusGoesStale documents the discordgo behaviour the sweep is
// deliberately narrow because of.
//
// `presenceAdd` merges: it copies a client status only when the incoming one is
// non-empty, and Discord signals "signed out of desktop" by OMITTING the field.
// So the cache never loses a client. If this test ever starts failing, discordgo
// has been fixed and `syncPresenceFromState` may safely widen to re-apply the
// client set on every tick.
func TestCachedClientStatusGoesStale(t *testing.T) {
	state := discordgo.NewState()
	_ = state.GuildAdd(&discordgo.Guild{ID: "g1"})

	// On desktop and mobile.
	_ = state.PresenceAdd("g1", &discordgo.Presence{
		User:         &discordgo.User{ID: "u"},
		Status:       discordgo.StatusOnline,
		ClientStatus: discordgo.ClientStatus{Desktop: "online", Mobile: "online"},
	})
	// Then he closes the desktop client: Discord sends the remaining clients only.
	_ = state.PresenceAdd("g1", &discordgo.Presence{
		User:         &discordgo.User{ID: "u"},
		Status:       discordgo.StatusOnline,
		ClientStatus: discordgo.ClientStatus{Mobile: "online"},
	})

	got, _ := lookupPresence(&discordgo.Session{State: state}, "u")
	if got == nil {
		t.Fatal("expected a presence")
	}
	if !clientsFrom(got.ClientStatus).Desktop {
		t.Skip("discordgo now clears an omitted ClientStatus — syncPresenceFromState can widen")
	}
	// The assertion is that the cache IS wrong, which is why the sweep only
	// adopts when nothing is open and never rewrites a live run's client set.
	if !clientsFrom(got.ClientStatus).Mobile {
		t.Error("mobile should still be set")
	}
}
