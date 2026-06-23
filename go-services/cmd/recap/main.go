// Command recap is the Go port of server/recap/index.ts: the Lights Out daily
// recap runner. It is a long-running scheduler that every 5 minutes posts due
// daily recaps to Discord channels, and holds a Discord gateway connection so
// the bot shows as "online". It exposes /health and /metrics on RECAP_PORT.
package main

import (
	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	// Standalone recap historically served health on RECAP_PORT (7004).
	worker.RunStandalone("recap", ":"+config.GetString("RECAP_PORT", "7004"), recap.Run)
}
