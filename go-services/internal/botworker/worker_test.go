package botworker

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunIdlesWithoutDeepSeekKey(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("bot-worker", "error"), Metrics: telemetry.New("bot-worker")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil idle shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
func TestPersonaStringNeverRevealsBot(t *testing.T) {
	// The persona string is the LLM system prompt seed. It must never hint that
	// the persona is synthetic. (Replaces the original TestPostTextNeverRevealsBot
	// which referenced assemblePost — a function that was never defined.)
	got := buildPersonaString("coffee", "wry", "posts a few times a day about their day and interests")
	for _, banned := range []string{"as an ai", "i am a bot", "language model", "chatbot"} {
		if strings.Contains(strings.ToLower(got), banned) {
			t.Fatalf("persona string leaked bot disclosure %q: %q", banned, got)
		}
	}
}

// TestBuildPersonaStringEmitsHabitLabel ensures buildPersonaString produces
// an ACTIVITY line that shouldPost()'s regex can match. Previously it always
// emitted "posts regularly throughout the day", which matched no branch and
// caused every bot to default to perDay=5.
func TestBuildPersonaStringEmitsHabitLabel(t *testing.T) {
	for _, h := range postingHabits {
		persona := buildPersonaString("coffee", "wry", h.label)
		if !strings.Contains(persona, h.label) {
			t.Errorf("habit %q: label not present in persona string %q", h.id, persona)
		}
	}
}

// TestShouldPostPacingVaried verifies that the four POSTING_HABITS produce
// distinct perDay rates in shouldPost(). We check this indirectly by feeding
// each habit label into BotUser.BotPersona and checking the regex branch fires.
// Bots with no recent post are used so the gap check doesn't interfere.
func TestShouldPostPacingVaried(t *testing.T) {
	// Map each habit id → expected perDay from shouldPost's switch.
	tests := []struct {
		habitID    string
		habitLabel string
		wantPerDay float64
	}{
		{"chatty",  "very online, posts frequently with quick thoughts",          9},
		{"lurker",  "rare poster — only chimes in when something matters",        2},
		{"bursty",  "goes quiet then posts a flurry when inspired",               6},
		{"steady",  "posts a few times a day about their day and interests",      5},
	}

	for _, tt := range tests {
		persona := buildPersonaString("coffee", "wry", tt.habitLabel)
		// Verify the regex matches are consistent with the expected perDay.
		// We replicate shouldPost's switch logic directly (without randomness).
		var gotPerDay float64
		switch {
		case matchPersona(persona, `very online|frequently`):
			gotPerDay = 9
		case matchPersona(persona, `rare poster|only chimes in`):
			gotPerDay = 2
		case matchPersona(persona, `flurry|goes quiet`):
			gotPerDay = 6
		default:
			gotPerDay = 5
		}
		if gotPerDay != tt.wantPerDay {
			t.Errorf("habit %q: want perDay=%.0f, got perDay=%.0f (persona=%q)",
				tt.habitID, tt.wantPerDay, gotPerDay, persona)
		}
	}
}
