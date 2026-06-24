// Command vibe-worker is a long-lived background worker that renders gallery
// thumbnails for AI-generated vibe pages. It ports server/vibe-worker/index.ts:
// it polls "vibe_page" rows flagged thumbnailStale, renders each page's HTML in
// headless Chromium, captures a downscaled WebP, uploads it to object storage
// (vibe-thumbs/<slug>.webp, served via CDN/proxy), and clears the stale flag
// with optimistic concurrency.
//
// There is no client HTTP surface — only /health and /metrics on cfg.MetricsAddr.
//
// RUNTIME REQUIREMENT: a Chromium/Chrome binary must be present. In production it
// is provided via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; locally chromedp discovers
// an installed Chrome.
package main

import (
	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	worker.RunStandalone("vibe-worker", "", vibeworker.Run)
}
