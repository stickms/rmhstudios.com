package botworker

// repo_test.go — unit tests for SQL-building helpers and repo utility functions.
// These tests do NOT require a live database.

import (
	"regexp"
	"testing"
	"time"
)

// TestNewCUIDFormat verifies that newCUID produces non-empty, 'c'-prefixed strings.
func TestNewCUIDFormat(t *testing.T) {
	id := newCUID()
	if len(id) == 0 {
		t.Fatal("newCUID returned empty string")
	}
	if id[0] != 'c' {
		t.Errorf("newCUID = %q, want 'c' prefix", id)
	}
	// Uniqueness check: two calls should differ.
	id2 := newCUID()
	if id == id2 {
		t.Errorf("newCUID returned same value twice: %q", id)
	}
}

// TestSanitizeHandle verifies handle normalization.
func TestSanitizeHandle(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"HelloWorld", "helloworld"},
		{"john_doe_123", "johndoe123"},
		{"ab", "abuser"}, // padded to min 4 chars
		{"verylonghandlethatexceedssixteen", "verylonghandleth"},
		{"42coffee", "u42coffee"},             // must start with a letter
		{"999", "u999"},                       // digits only
		{"", "uuser"},                         // nothing usable at all
		{"!!!", "uuser"},                      // nothing usable after stripping
		{"admin", "adminbot"},                 // reserved handles are not squattable
		{"notifications", "notificationsbot"}, // longest reserved word
	}
	for _, tc := range cases {
		got := sanitizeHandle(tc.in)
		if got != tc.want {
			t.Errorf("sanitizeHandle(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestSanitizeHandleSatisfiesSiteRules asserts the invariant the rest of the
// platform relies on: every handle a bot is created with must satisfy
// HANDLE_REGEX from lib/handle.ts, so bot accounts are indistinguishable from
// human ones to every validator, route and admin tool.
func TestSanitizeHandleSatisfiesSiteRules(t *testing.T) {
	handleRe := regexp.MustCompile(`^[a-z][a-z0-9_]{2,19}$`)
	inputs := []string{
		"HelloWorld", "42coffee", "999", "", "!!!", "a", "ab", "admin", "API",
		"___", "-_-", "verylonghandlethatexceedssixteencharacters",
		"Ünïcödé", "日本語", "🎉", "notifications", "rmhstudios",
	}
	for _, in := range inputs {
		got := sanitizeHandle(in)
		if !handleRe.MatchString(got) {
			t.Errorf("sanitizeHandle(%q) = %q, which fails HANDLE_REGEX", in, got)
		}
		if reservedHandles[got] {
			t.Errorf("sanitizeHandle(%q) = %q, which is a reserved handle", in, got)
		}
	}
}

// TestShouldPostRespectMinGap verifies the minimum gap enforcement: a bot that
// posted very recently should not post again.
func TestShouldPostRespectMinGap(t *testing.T) {
	now := time.Now()
	// A "very online" bot has perDay=9, minGapMs = 24h/(9*2+1) ≈ 1.26h
	// Setting lastPostAt = 30 seconds ago should block posting.
	recent := now.Add(-30 * time.Second)
	bot := BotUser{
		ID:            "test-bot",
		BotPersona:    "ACTIVITY: very online, frequently posts",
		BotLastPostAt: &recent,
	}
	// Run 20 trials; with a gap block the result must always be false.
	for i := 0; i < 20; i++ {
		if shouldPost(bot) {
			t.Error("shouldPost returned true within minimum gap")
			break
		}
	}
}
