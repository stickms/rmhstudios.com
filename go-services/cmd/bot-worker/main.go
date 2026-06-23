// Command bot-worker is a long-lived background worker that maintains a pool of
// AI-generated synthetic users on the RMHark feed, posting in-voice throughout
// the day. It ports server/bot-worker/index.ts.
//
// Idles harmlessly if DEEPSEEK_API_KEY is not set.
// There is no client HTTP surface — only /health and /metrics on cfg.MetricsAddr.
package main

import (
	"github.com/rmhstudios/rmh-go/internal/botworker"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	worker.RunStandalone("bot-worker", "", botworker.Run)
}
