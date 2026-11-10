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

// DISCORD_BOT_RUNTIME=node hands the bot to Node: Run must idle even WITH a
// token, so the two runtimes never hold the gateway at the same time.
func TestRunIdlesWhenNodeRuntimeSelected(t *testing.T) {
	t.Setenv("DISCORD_BOT_RUNTIME", " Node ")
	t.Setenv("DISCORD_BOT_TOKEN", "not-a-real-token")
	if !NodeRuntimeSelected() {
		t.Fatal("NodeRuntimeSelected should accept a trimmed, case-insensitive \"node\"")
	}
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

func TestNodeRuntimeSelectedDefaultsOff(t *testing.T) {
	for _, v := range []string{"", "go", "nodejs"} {
		t.Setenv("DISCORD_BOT_RUNTIME", v)
		if NodeRuntimeSelected() {
			t.Fatalf("DISCORD_BOT_RUNTIME=%q must leave the Go bot in charge", v)
		}
	}
}
