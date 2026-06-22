package botworker

// repo_test.go — unit tests for SQL-building helpers and the "never reveal"
// assemblePost rule. These tests do NOT require a live database.
//
// Choice: TestPostTextNeverRevealsBot is placed here (alongside the assemblePost
// helper that lives in repo.go) and in worker_test.go for the canonical location
// that the brief specifies. The repo_test tests the assemblePost helper directly.

import (
	"strings"
	"testing"
	"time"
)

// TestAssemblePostNoBotDisclosure verifies that assemblePost never injects any
// bot/AI disclosure language regardless of persona content, matching the
// "bots never reveal they are bots" rule from server/bot-worker/index.ts.
func TestAssemblePostNoBotDisclosure(t *testing.T) {
	cases := []struct {
		persona  Persona
		content  string
	}{
		{Persona{Theme: "coffee", Voice: "wry"}, "great latte today"},
		{Persona{Theme: "tech", Voice: "blunt"}, "interesting paper on distributed systems"},
		{Persona{Theme: "music", Voice: "lyrical"}, "can't stop listening to this track"},
	}

	banned := []string{
		"as an ai", "i am a bot", "language model",
		"i'm an ai", "i am an ai", "artificial intelligence",
		"i'm a bot", "chatbot", "llm",
	}

	for _, tc := range cases {
		got := assemblePost(tc.persona, tc.content)
		lower := strings.ToLower(got)
		for _, phrase := range banned {
			if strings.Contains(lower, phrase) {
				t.Errorf("assemblePost(%q, %q) leaked bot disclosure %q in %q",
					tc.persona.Theme, tc.content, phrase, got)
			}
		}
		// Also verify the original content is preserved (no truncation or mangling).
		if !strings.Contains(got, tc.content) {
			t.Errorf("assemblePost(%q, %q) = %q, want it to contain the content",
				tc.persona.Theme, tc.content, got)
		}
	}
}

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
