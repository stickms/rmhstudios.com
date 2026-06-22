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

func TestPostTextNeverRevealsBot(t *testing.T) {
	got := assemblePost(Persona{Theme: "coffee", Voice: "wry"}, "great latte today")
	for _, banned := range []string{"as an AI", "I am a bot", "language model"} {
		if strings.Contains(strings.ToLower(got), strings.ToLower(banned)) {
			t.Fatalf("post leaked bot disclosure: %q", got)
		}
	}
}
