// Package vibeworker is the private implementation of the vibe-worker service:
// a long-lived background worker that renders gallery screenshots ("thumbnails")
// for AI-generated vibe pages. It ports server/vibe-worker/index.ts and
// lib/rmhvibe/vibe-screenshot.server.ts.
//
// Generated vibe pages are arbitrary interactive HTML (esbuild-bundled React,
// canvas, three.js from esm.sh). To show them in the gallery we render the saved
// HTML once, headlessly, in Chromium, screenshot it, downscale, and write a PNG
// to the shared db/ volume. The worker decouples headless Chromium from the web
// app's request path.
package vibeworker

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/chromedp/chromedp"
)

// Capture configuration ported from lib/rmhvibe/vibe-screenshot.server.ts.
const (
	// viewportWidth/viewportHeight — 16:10 reads well in the gallery grid.
	viewportWidth  = 1200
	viewportHeight = 750
	// thumbWidth is the downscaled width of the served thumbnail.
	thumbWidth = 640
	// settleDelay lets esm.sh modules load + first React paint + intro
	// animations settle after the network goes idle.
	settleDelay = 1500 * time.Millisecond
	// captureTimeout is the real per-render deadline applied to a single page's
	// navigate + settle + screenshot via a chromedp context with timeout. It must
	// comfortably exceed settleDelay so the render isn't cut off mid-settle.
	captureTimeout = 10 * time.Second
)

// Capturer renders a vibe page's HTML to a downscaled PNG thumbnail on disk and
// returns the public, cache-busted URL the web app serves. Implementations
// return an error on any failure; the orchestrator then leaves the page stale so
// it is retried on a later tick. Keeping this behind an interface lets the poll
// loop be tested with a fake (see worker_test.go).
type Capturer interface {
	// Capture renders html for slug, writes <thumbDir>/<slug>.png, and returns
	// the public URL (e.g. "/api/vibe/thumb/<slug>?v=<ts>").
	Capture(ctx context.Context, slug, html string) (string, error)
	// Close releases any shared browser resources so the process can exit.
	Close()
}

// ChromedpCapturer is the production Capturer backed by headless Chromium driven
// through chromedp.
//
// SUBSTITUTION NOTE: the Node implementation downscales the raw screenshot with
// the `sharp` image library (resize to thumbWidth, PNG compression level 9). Go
// has no equivalent of sharp in the allowed dependency set, so instead of a
// post-capture resize we ask Chromium itself to produce a smaller image by
// setting a fractional device scale factor (thumbWidth/viewportWidth) on the
// emulated viewport. The capture viewport stays 1200x750 (so pages lay out the
// same), but the rasterized PNG comes out at ~thumbWidth px wide. This is the
// faithful intent (a small gallery PNG) achieved with chromedp's own scaling
// rather than sharp.
type ChromedpCapturer struct {
	thumbDir string
	execPath string // optional explicit Chromium binary path
}

// NewChromedpCapturer builds the production capturer. thumbDir is the directory
// PNGs are written to (the shared db/vibe-thumbs volume). If execPath is
// non-empty it is passed to Chromium as the executable path
// (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH in prod; empty locally so chromedp uses a
// discovered Chrome/Chromium). Chromium MUST be present at runtime.
func NewChromedpCapturer(thumbDir, execPath string) *ChromedpCapturer {
	return &ChromedpCapturer{thumbDir: thumbDir, execPath: execPath}
}

// thumbDeviceScale is the fractional device scale factor that makes Chromium
// rasterize the 1200px-wide viewport down to ~thumbWidth px (sharp substitute).
const thumbDeviceScale = float64(thumbWidth) / float64(viewportWidth)

// Capture renders html headlessly and writes the downscaled PNG for slug.
func (c *ChromedpCapturer) Capture(ctx context.Context, slug, html string) (string, error) {
	// Container-safe flags mirror the Node launch args; sandbox can't run as the
	// unprivileged app user. ExecPath honors PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
	opts := append([]chromedp.ExecAllocatorOption{},
		chromedp.NoSandbox,
		chromedp.DisableGPU,
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("headless", true),
	)
	if c.execPath != "" {
		opts = append(opts, chromedp.ExecPath(c.execPath))
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()
	taskCtx, cancelTask := chromedp.NewContext(allocCtx)
	defer cancelTask()

	// Apply captureTimeout as a real per-render deadline on the navigate + settle
	// + screenshot, like Playwright's per-action timeout. If a page hangs (e.g. a
	// sub-resource never finishes), the run is cancelled at this deadline and the
	// page is left stale to retry, rather than blocking the batch indefinitely.
	runCtx, cancelRun := context.WithTimeout(taskCtx, captureTimeout)
	defer cancelRun()

	// Render via a data: URL so we never touch the filesystem for input and the
	// page's own injected CSP still governs sub-resource loads. We can't easily
	// reproduce the Node per-request host allowlist (esm.sh, cdn.jsdelivr.net)
	// with chromedp without CDP fetch interception; the page's CSP remains the
	// primary control. Sub-resources from those CDNs load normally.
	// Base64-encode the payload. The generated HTML is arbitrary and routinely
	// contains '#' (fragment delimiter) and '%' (percent-escape introducer),
	// which truncate or mis-decode in a non-encoded data: URL. Base64 makes the
	// URL opaque so Chromium decodes the exact bytes.
	dataURL := "data:text/html;charset=utf-8;base64," + base64.StdEncoding.EncodeToString([]byte(html))

	var png []byte
	err := chromedp.Run(runCtx,
		chromedp.EmulateViewport(viewportWidth, viewportHeight, chromedp.EmulateScale(thumbDeviceScale)),
		chromedp.Navigate(dataURL),
		// networkidle can never fire on animation-heavy pages, so we don't block
		// on it; the settle sleep below gives modules + first paint time instead.
		chromedp.Sleep(settleDelay),
		chromedp.CaptureScreenshot(&png),
	)
	if err != nil {
		return "", fmt.Errorf("vibeworker: capture %s: %w", slug, err)
	}

	if err := os.MkdirAll(c.thumbDir, 0o755); err != nil {
		return "", fmt.Errorf("vibeworker: mkdir thumb dir: %w", err)
	}
	dest := filepath.Join(c.thumbDir, slug+".png")
	if err := os.WriteFile(dest, png, 0o644); err != nil {
		return "", fmt.Errorf("vibeworker: write %s: %w", dest, err)
	}

	// Cache-busted public URL the web app serves at /api/vibe/thumb/{slug}.
	return fmt.Sprintf("/api/vibe/thumb/%s?v=%d", slug, time.Now().UnixMilli()), nil
}

// Close is a no-op: ChromedpCapturer allocates a fresh browser per capture and
// tears it down via the deferred cancels, so there is no shared browser to
// close. The method exists to satisfy Capturer and mirror closeVibeBrowser().
func (c *ChromedpCapturer) Close() {}
