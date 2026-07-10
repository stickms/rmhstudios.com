package botworker

// repo_test.go — unit tests for SQL-building helpers and repo utility functions.
// These tests do NOT require a live database.

import (
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
	}
	for _, tc := range cases {
		got := sanitizeHandle(tc.in)
		if got != tc.want {
			t.Errorf("sanitizeHandle(%q) = %q, want %q", tc.in, got, tc.want)
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
