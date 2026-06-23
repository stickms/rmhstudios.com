// Command discord-bot is the Go port of server/discord-bot/index.ts: a
// long-running Discord gateway bot. It exposes only /health and /metrics on
// cfg.MetricsAddr (no client-facing HTTP) and is driven by the discordgo
// session lifecycle — open session, register slash commands on ready, block on
// signal, close — following the FOUNDATION worker skeleton.
package main

import (
	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	// DB is used for /chat session persistence. The chat handler tolerates a nil
	// DB, but we wait for reachability like the other workers do.
	// Metrics + health only; no client HTTP for this bot. A bind failure must be
	// fatal — otherwise the pod stays up but unprobeable, so k8s never restarts it.
	worker.RunStandalone("discord-bot", "", discordbot.Run)
}
