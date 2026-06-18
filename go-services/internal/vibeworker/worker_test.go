package vibeworker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// fakeCapturer records captures and can be told to fail for specific slugs.
type fakeCapturer struct {
	mu       sync.Mutex
	captured []string
	failOn   map[string]bool
}

func (f *fakeCapturer) Capture(_ context.Context, slug, _ string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failOn[slug] {
		return "", errors.New("boom")
	}
	f.captured = append(f.captured, slug)
	return "/api/vibe/thumb/" + slug + "?v=1", nil
}

func (f *fakeCapturer) Close() {}

// fakeRepo is an in-memory Repo that models the optimistic-concurrency clear.
type fakeRepo struct {
	stale []StalePage
	// current updatedAt per id; ClearStale only succeeds when it matches.
	currentUpdatedAt map[string]time.Time

	clearedURLs map[string]string // id -> url, via ClearStale
	setURLs     map[string]string // id -> url, via SetThumbnailURL
	selectErr   error
}

func (r *fakeRepo) SelectStale(_ context.Context, limit int) ([]StalePage, error) {
	if r.selectErr != nil {
		return nil, r.selectErr
	}
	if limit < len(r.stale) {
		return r.stale[:limit], nil
	}
	return r.stale, nil
}

func (r *fakeRepo) ClearStale(_ context.Context, id, url string, expected time.Time) (bool, error) {
	if r.currentUpdatedAt[id].Equal(expected) {
		if r.clearedURLs == nil {
			r.clearedURLs = map[string]string{}
		}
		r.clearedURLs[id] = url
		return true, nil
	}
	return false, nil
}

func (r *fakeRepo) SetThumbnailURL(_ context.Context, id, url string) error {
	if r.setURLs == nil {
		r.setURLs = map[string]string{}
	}
	r.setURLs[id] = url
	return nil
}

func testWorker(repo Repo, cap Capturer) *Worker {
	return newWorker(repo, cap, log.New("vibe-worker-test", "error"), telemetry.New("vibe-worker-test"))
}

func TestProcessStale_HappyPath_ClearsFlagOptimistically(t *testing.T) {
	now := time.Now().Truncate(time.Millisecond)
	repo := &fakeRepo{
		stale: []StalePage{
			{ID: "1", Slug: "a", HTML: "<h1>a</h1>", UpdatedAt: now},
			{ID: "2", Slug: "b", HTML: "<h1>b</h1>", UpdatedAt: now},
		},
		currentUpdatedAt: map[string]time.Time{"1": now, "2": now},
	}
	cap := &fakeCapturer{}
	w := testWorker(repo, cap)

	w.processStale(context.Background())

	if len(cap.captured) != 2 {
		t.Fatalf("expected 2 captures, got %v", cap.captured)
	}
	if got := repo.clearedURLs["1"]; got != "/api/vibe/thumb/a?v=1" {
		t.Errorf("page 1 not cleared with expected url, got %q", got)
	}
	if _, ok := repo.clearedURLs["2"]; !ok {
		t.Errorf("page 2 should have been cleared")
	}
	if len(repo.setURLs) != 0 {
		t.Errorf("no mid-render fallback expected, got %v", repo.setURLs)
	}
}

func TestProcessStale_ChangedMidRender_KeepsStaleButRecordsURL(t *testing.T) {
	readAt := time.Now().Truncate(time.Millisecond)
	// The page's updatedAt advanced after we read it (customized mid-render),
	// so the optimistic ClearStale must miss and we fall back to SetThumbnailURL.
	repo := &fakeRepo{
		stale:            []StalePage{{ID: "1", Slug: "a", HTML: "x", UpdatedAt: readAt}},
		currentUpdatedAt: map[string]time.Time{"1": readAt.Add(time.Second)},
	}
	cap := &fakeCapturer{}
	w := testWorker(repo, cap)

	w.processStale(context.Background())

	if _, ok := repo.clearedURLs["1"]; ok {
		t.Errorf("page 1 should NOT have been cleared (updatedAt changed)")
	}
	if got := repo.setURLs["1"]; got != "/api/vibe/thumb/a?v=1" {
		t.Errorf("expected mid-render url recorded, got %q", got)
	}
}

func TestProcessStale_CaptureFailure_LeavesPageUntouched(t *testing.T) {
	now := time.Now()
	repo := &fakeRepo{
		stale:            []StalePage{{ID: "1", Slug: "a", HTML: "x", UpdatedAt: now}},
		currentUpdatedAt: map[string]time.Time{"1": now},
	}
	cap := &fakeCapturer{failOn: map[string]bool{"a": true}}
	w := testWorker(repo, cap)

	w.processStale(context.Background())

	if len(repo.clearedURLs) != 0 || len(repo.setURLs) != 0 {
		t.Errorf("capture failure must not touch the row; cleared=%v set=%v", repo.clearedURLs, repo.setURLs)
	}
}

func TestProcessStale_ReentrancyGuard(t *testing.T) {
	// With running=true, a concurrent tick must be a no-op (no SelectStale).
	repo := &countingRepo{}
	w := testWorker(repo, &fakeCapturer{})
	w.running = true

	w.processStale(context.Background())

	if repo.selectCalls != 0 {
		t.Errorf("reentrancy guard failed: SelectStale called %d times", repo.selectCalls)
	}
}

// countingRepo counts SelectStale calls; everything else is a no-op.
type countingRepo struct{ selectCalls int }

func (r *countingRepo) SelectStale(context.Context, int) ([]StalePage, error) {
	r.selectCalls++
	return nil, nil
}
func (r *countingRepo) ClearStale(context.Context, string, string, time.Time) (bool, error) {
	return true, nil
}
func (r *countingRepo) SetThumbnailURL(context.Context, string, string) error { return nil }
