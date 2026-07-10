package discordbot

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// With no token configured, Run idles (no Discord connection) and returns nil
// on cancel rather than crashing the supervisor.
func TestRunIdlesWithoutToken(t *testing.T) {
	t.Setenv("DISCORD_BOT_TOKEN", "")
	t.Setenv("DISCORD_ACTIVITY_BOT_TOKEN", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("discord-bot", "error"), Metrics: telemetry.New("discord-bot")}
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
