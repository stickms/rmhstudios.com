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
	// the persona is synthetic, whatever axes are rolled.
	for i := 0; i < 200; i++ {
		got := strings.ToLower(composePersona(rollPersona()))
		for _, banned := range []string{"as an ai", "i am a bot", "language model", "chatbot"} {
			if strings.Contains(got, banned) {
				t.Fatalf("persona string leaked bot disclosure %q: %q", banned, got)
			}
		}
	}
}

// TestComposePersonaPacesEveryHabit ensures each habit's ACTIVITY line drives
// shouldPost()'s rate. A persona that matched no branch would silently fall
// back to 5/day.
func TestComposePersonaPacesEveryHabit(t *testing.T) {
	for _, h := range postingHabits {
		spec := rollPersona()
		spec.habit = h
		if got := habitPostsPerDay(composePersona(spec)); got != float64(h.postsPerDay) {
			t.Errorf("habit %q: habitPostsPerDay = %v, want %d", h.id, got, h.postsPerDay)
		}
	}
}

// TestHabitPostsPerDayIgnoresOtherLines pins that only the ACTIVITY line sets
// the pace, so a voice rule mentioning "frequently" can't speed a lurker up.
func TestHabitPostsPerDayIgnoresOtherLines(t *testing.T) {
	persona := "VOICE (x): posts frequently with flair\nACTIVITY: rare poster — only chimes in when something matters."
	if got := habitPostsPerDay(persona); got != 2 {
		t.Errorf("habitPostsPerDay = %v, want 2", got)
	}
	// Legacy personas without an ACTIVITY prefix still match on the whole text.
	if got := habitPostsPerDay("very online"); got != 9 {
		t.Errorf("legacy habitPostsPerDay = %v, want 9", got)
	}
}

// TestShouldPostMultiplier checks the admin multiplier scales the per-tick
// probability and that 0 pauses posting outright.
func TestShouldPostMultiplier(t *testing.T) {
	now := time.Now()
	bot := BotUser{ID: "b", BotPersona: "ACTIVITY: posts a few times a day about their day and interests."}
	// steady = 5/day over 288 five-minute ticks → p ≈ 0.01736 at ×1.
	if !shouldPost(bot, 1, postTickInterval, now, 0.017) || shouldPost(bot, 1, postTickInterval, now, 0.018) {
		t.Error("×1 threshold should sit at 5/288")
	}
	// ×3 → p ≈ 0.052.
	if !shouldPost(bot, 3, postTickInterval, now, 0.05) || shouldPost(bot, 3, postTickInterval, now, 0.053) {
		t.Error("×3 threshold should sit at 15/288")
	}
	if shouldPost(bot, 0, postTickInterval, now, 0) {
		t.Error("multiplier 0 must pause posting")
	}
}
