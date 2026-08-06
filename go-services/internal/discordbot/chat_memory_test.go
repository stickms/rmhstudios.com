package discordbot

import (
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
)

// sfID builds a Discord snowflake id for a message created `ago` before now, so
// tests can exercise the age-based pruning without hardcoding magic numbers.
func sfID(ago time.Duration) string {
	ms := time.Now().Add(-ago).UnixMilli() - discordEpochMs
	if ms < 0 {
		ms = 0
	}
	return itoa64(uint64(ms) << 22)
}

// itoa64 is a tiny uint64->string for building test snowflakes (avoids importing
// strconv just for the tests).
func itoa64(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func TestSnowflakeTimeRoundTrips(t *testing.T) {
	// A freshly-minted snowflake should decode to ~now (within a second).
	id := sfID(0)
	got := snowflakeTime(id)
	if d := time.Since(got); d < -time.Second || d > time.Second {
		t.Errorf("snowflakeTime(%s) = %v, want ~now (delta %v)", id, got, d)
	}
	// A non-numeric id decodes to the zero time (treated as very old).
	if !snowflakeTime("not-a-snowflake").IsZero() {
		t.Errorf("non-numeric id should decode to the zero time")
	}
}

func TestMessageToTurnRoles(t *testing.T) {
	alex, ok := messageToTurn(&discordgo.Message{ID: "1", Author: &discordgo.User{ID: "bot"}, Content: "yo"}, "bot")
	if !ok || !alex.IsAlex {
		t.Fatalf("bot's own message should be an Alex turn, got %+v ok=%v", alex, ok)
	}
	if cm := alex.chatMessage(); cm.Role != roleAssistant || cm.Content != "yo" {
		t.Errorf("Alex turn should render as an assistant turn, got %+v", cm)
	}
	user, ok := messageToTurn(&discordgo.Message{ID: "2", Author: &discordgo.User{ID: "u1", Username: "bob"}, Content: "sup"}, "bot")
	if !ok || user.IsAlex || user.Name != "bob" {
		t.Fatalf("other user's message should be a named turn, got %+v ok=%v", user, ok)
	}
	if cm := user.chatMessage(); cm.Role != roleUser || cm.Content != "bob: sup" {
		t.Errorf("user turn should render as a name-prefixed user turn, got %+v", cm)
	}
	if _, ok := messageToTurn(&discordgo.Message{ID: "3", Author: &discordgo.User{ID: "u1"}, Content: "   "}, "bot"); ok {
		t.Errorf("empty-content message should produce no turn")
	}
}

func TestMergeTurnsDedupesOrdersAndPrunes(t *testing.T) {
	recent := sfID(time.Hour)       // within the retention window
	older := sfID(30 * time.Minute) // more recent than `recent`
	stale := sfID(1000 * time.Hour) // far past channelMemoryTTL → pruned

	existing := []storedTurn{
		{ID: recent, Name: "a", Content: "first"},
		{ID: stale, Name: "z", Content: "ancient"},
	}
	incoming := []storedTurn{
		{ID: recent, Name: "a", Content: "first (edited)"}, // same id → dedup, newer wins
		{ID: older, Name: "b", Content: "second"},
	}

	got := mergeTurns(existing, incoming)
	if len(got) != 2 {
		t.Fatalf("expected 2 turns after dedup + prune, got %d: %+v", len(got), got)
	}
	// Ordered oldest → newest by snowflake.
	if got[0].ID != recent || got[1].ID != older {
		t.Errorf("turns should be ordered oldest→newest, got %s then %s", got[0].ID, got[1].ID)
	}
	// Later occurrence of a duplicate id wins.
	if got[0].Content != "first (edited)" {
		t.Errorf("duplicate id should keep the latest content, got %q", got[0].Content)
	}
	// The stale turn was pruned by TTL.
	for _, tt := range got {
		if tt.ID == stale {
			t.Errorf("stale turn should have been pruned")
		}
	}
}

func TestMergeTurnsCapsToMax(t *testing.T) {
	var in []storedTurn
	// Build more than the cap, all within the window, strictly increasing in age
	// order so the newest ones are the ones that should survive.
	for i := channelMemoryMaxTurns + 20; i >= 1; i-- {
		in = append(in, storedTurn{ID: sfID(time.Duration(i) * time.Minute), Name: "u", Content: "m"})
	}
	got := mergeTurns(nil, in)
	if len(got) != channelMemoryMaxTurns {
		t.Fatalf("expected cap of %d, got %d", channelMemoryMaxTurns, len(got))
	}
	// Result stays sorted oldest → newest.
	for i := 1; i < len(got); i++ {
		if !snowflakeLess(got[i-1].ID, got[i].ID) {
			t.Errorf("capped result should remain chronologically ordered")
		}
	}
}

func TestRememberedBeyondExcludesLiveAndBounds(t *testing.T) {
	remembered := []storedTurn{
		{ID: "10", Content: "a"},
		{ID: "20", Content: "b"}, // in the live window
		{ID: "30", Content: "c"},
		{ID: "40", Content: "d"},
	}
	live := map[string]bool{"20": true}

	// No cap: everything not in the live window, order preserved.
	got := rememberedBeyond(remembered, live, channelMemoryInjectMax)
	if len(got) != 3 || got[0].ID != "10" || got[2].ID != "40" {
		t.Fatalf("should drop only live-window turns, got %+v", got)
	}
	// With a small cap, keep the NEWEST ones (tail).
	capped := rememberedBeyond(remembered, live, 2)
	if len(capped) != 2 || capped[0].ID != "30" || capped[1].ID != "40" {
		t.Errorf("cap should keep the newest turns, got %+v", capped)
	}
}
