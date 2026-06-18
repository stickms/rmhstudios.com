package vibeworker

import (
	"context"
	"sync"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Poll cadence and batch size, ported from server/vibe-worker/index.ts.
const (
	pollInterval = 10 * time.Second
	batchSize    = 5
	jobName      = "vibe_thumbnails"
)

// StalePage is the subset of a "vibe_page" row the worker needs to render a
// thumbnail and to perform the optimistic-concurrency flag clear.
type StalePage struct {
	ID        string
	Slug      string
	HTML      string
	UpdatedAt time.Time
}

// Repo is the data-access surface the worker needs. Keeping it behind an
// interface lets the poll/optimistic-update orchestration be tested without a
// real database (see worker_test.go).
type Repo interface {
	// SelectStale returns up to limit stale vibe pages, oldest first
	// (ORDER BY "updatedAt" ASC LIMIT limit).
	SelectStale(ctx context.Context, limit int) ([]StalePage, error)
	// ClearStale clears the stale flag and records the thumbnail URL with
	// optimistic concurrency: it only updates the row when "updatedAt" still
	// equals expectedUpdatedAt. It reports whether a row was updated.
	ClearStale(ctx context.Context, id, thumbnailURL string, expectedUpdatedAt time.Time) (cleared bool, err error)
	// SetThumbnailURL records the URL for a page whose content changed
	// mid-render, leaving it stale so the latest content re-renders next tick.
	SetThumbnailURL(ctx context.Context, id, thumbnailURL string) error
}

// Worker polls for stale vibe pages and renders their thumbnails.
type Worker struct {
	repo     Repo
	capturer Capturer
	logger   *log.Logger
	metrics  *telemetry.Metrics

	mu      sync.Mutex // guards running (reentrancy guard, like the Node `running` flag)
	running bool

	stopOnce sync.Once
	done     chan struct{}
}

// New builds a Worker from a database, capturer, logger, and metrics. It wraps
// the pool in the production PGRepo. capturer is injected so tests can supply a
// fake; in production it is a *ChromedpCapturer.
func New(database *db.DB, capturer Capturer, logger *log.Logger, metrics *telemetry.Metrics) *Worker {
	return newWorker(NewPGRepo(database, metrics), capturer, logger, metrics)
}

// newWorker is the internal constructor used by both New and the tests.
func newWorker(repo Repo, capturer Capturer, logger *log.Logger, metrics *telemetry.Metrics) *Worker {
	return &Worker{
		repo:     repo,
		capturer: capturer,
		logger:   logger,
		metrics:  metrics,
		done:     make(chan struct{}),
	}
}

// Start launches the ticker goroutine. It runs one pass immediately (matching
// the Node `void processStale()` kick) and then every pollInterval until ctx is
// cancelled or Stop is called.
func (w *Worker) Start(ctx context.Context) {
	w.logger.Info("vibe-worker starting", "interval", pollInterval.String(), "batch", batchSize)
	go func() {
		w.processStale(ctx)
		ticker := time.NewTicker(pollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case <-ticker.C:
				w.processStale(ctx)
			}
		}
	}()
}

// Stop signals the ticker goroutine to exit and closes the capturer.
func (w *Worker) Stop() {
	w.stopOnce.Do(func() { close(w.done) })
	w.capturer.Close()
}

// processStale renders one batch of stale pages. A reentrancy guard prevents
// overlapping ticks, since a batch of captures can outlast the poll interval.
func (w *Worker) processStale(ctx context.Context) {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return
	}
	w.running = true
	w.mu.Unlock()
	defer func() {
		w.mu.Lock()
		w.running = false
		w.mu.Unlock()
	}()

	pages, err := w.repo.SelectStale(ctx, batchSize)
	if err != nil {
		w.logger.Error("vibe-worker poll failed", "error", err)
		w.recordRun("error")
		return
	}

	// Track per-page outcomes so a batch where every render failed is not
	// recorded as "ok". "ok" => empty batch or all succeeded; "error" => at least
	// one attempted and none succeeded; "partial" => some succeeded, some failed.
	attempted, succeeded := 0, 0
	for _, page := range pages {
		if ctx.Err() != nil {
			break
		}
		attempted++
		if w.renderOne(ctx, page) {
			succeeded++
		}
	}

	switch {
	case attempted == 0 || succeeded == attempted:
		w.recordRun("ok")
	case succeeded == 0:
		w.recordRun("error")
	default:
		w.recordRun("partial")
	}
}

// renderOne captures a single page and clears its stale flag with optimistic
// concurrency, faithfully reproducing the Node per-page logic. It reports whether
// the render succeeded (the screenshot was produced and persisted), so the batch
// can record an accurate run outcome. A render failure or a failure to record the
// URL counts as unsuccessful; a clean mid-render change still counts as success
// because the screenshot was captured and a thumbnail URL was stored.
func (w *Worker) renderOne(ctx context.Context, page StalePage) bool {
	url, err := w.capturer.Capture(ctx, page.Slug, page.HTML)
	if err != nil {
		// Capture failed; leave the page stale so it retries next tick.
		w.logger.Error("vibe-worker capture failed", "slug", page.Slug, "error", err)
		return false
	}

	// Clear the flag only if the page hasn't been customized while we rendered
	// (updatedAt unchanged); otherwise leave it stale to re-render next tick.
	cleared, err := w.repo.ClearStale(ctx, page.ID, url, page.UpdatedAt)
	if err != nil {
		w.logger.Error("vibe-worker clear-stale failed", "slug", page.Slug, "error", err)
		return false
	}
	if cleared {
		w.logger.Info("vibe-worker rendered", "slug", page.Slug)
		return true
	}

	// Page changed mid-render; still record the URL so the gallery shows
	// something, but keep it stale so the latest content gets re-rendered.
	if err := w.repo.SetThumbnailURL(ctx, page.ID, url); err != nil {
		w.logger.Warn("vibe-worker set-thumbnail (mid-render) failed", "slug", page.Slug, "error", err)
		return false
	}
	w.logger.Info("vibe-worker changed mid-render — will re-render", "slug", page.Slug)
	return true
}

func (w *Worker) recordRun(outcome string) {
	if w.metrics != nil {
		w.metrics.JobRuns.WithLabelValues(jobName, outcome).Inc()
	}
}
