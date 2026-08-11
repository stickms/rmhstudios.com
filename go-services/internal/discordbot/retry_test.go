package discordbot

import (
	"context"
	"errors"
	"math/rand"
	"net/http"
	"testing"
	"time"
)

// A retry loop that gives up too early is no better than none, and one that
// never gives up turns a dead dependency into a hot loop that keeps it dead. The
// three properties below are the ones worth pinning.

func TestWithRetrySucceedsAfterTransientFailures(t *testing.T) {
	// Base 0 so the test does not actually sleep; the schedule is exercised in
	// TestBackoffIsBoundedAndJittered.
	policy := retryPolicy{Attempts: 4, Base: 0, Max: 0}
	calls := 0
	err := withRetry(context.Background(), nil, "test", policy, func(context.Context) error {
		calls++
		if calls < 3 {
			return errors.New("transient")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("withRetry returned %v, want nil", err)
	}
	if calls != 3 {
		t.Errorf("called %d times, want 3", calls)
	}
}

func TestWithRetryStopsOnPermanent(t *testing.T) {
	policy := retryPolicy{Attempts: 5, Base: 0, Max: 0}
	sentinel := errors.New("bad api key")
	calls := 0
	err := withRetry(context.Background(), nil, "test", policy, func(context.Context) error {
		calls++
		return permanent(sentinel)
	})
	if calls != 1 {
		t.Errorf("called %d times, want 1 — a permanent error must not be retried", calls)
	}
	// The caller must still be able to inspect what actually went wrong.
	if !errors.Is(err, sentinel) {
		t.Errorf("errors.Is lost the cause: %v", err)
	}
}

func TestWithRetryGivesUpAtTheAttemptCap(t *testing.T) {
	policy := retryPolicy{Attempts: 3, Base: 0, Max: 0}
	calls := 0
	err := withRetry(context.Background(), nil, "test", policy, func(context.Context) error {
		calls++
		return errors.New("still down")
	})
	if calls != 3 {
		t.Errorf("called %d times, want exactly 3", calls)
	}
	if err == nil {
		t.Error("withRetry returned nil after exhausting attempts")
	}
}

func TestWithRetryStopsOnCancelledContext(t *testing.T) {
	// A cancelled context is a shutdown, not a fault: the loop must not keep
	// hammering a dependency while the process is trying to exit.
	ctx, cancel := context.WithCancel(context.Background())
	policy := retryPolicy{Attempts: 10, Base: time.Hour, Max: time.Hour}
	calls := 0
	err := withRetry(ctx, nil, "test", policy, func(context.Context) error {
		calls++
		cancel()
		return errors.New("transient")
	})
	if calls != 1 {
		t.Errorf("called %d times, want 1 — cancellation must not wait out the backoff", calls)
	}
	if err == nil {
		t.Error("withRetry returned nil for a cancelled context")
	}
}

func TestBackoffIsBoundedAndJittered(t *testing.T) {
	policy := retryPolicy{Attempts: 8, Base: 100 * time.Millisecond, Max: time.Second}
	rng := rand.New(rand.NewSource(1))

	// Full jitter draws from [delay/2, delay*1.5), so the only hard guarantees
	// are that nothing exceeds 1.5×Max and that the schedule climbs.
	for attempt := 1; attempt <= 8; attempt++ {
		d := policy.backoff(attempt, rng)
		if d < 0 {
			t.Fatalf("attempt %d: negative delay %v", attempt, d)
		}
		if d > policy.Max*3/2 {
			t.Fatalf("attempt %d: %v exceeds the cap", attempt, d)
		}
	}

	// Two draws for the same attempt must differ, or there is no jitter and a
	// room full of clients retries in lockstep.
	var distinct bool
	for i := 0; i < 20; i++ {
		if policy.backoff(4, rng) != policy.backoff(4, rng) {
			distinct = true
			break
		}
	}
	if !distinct {
		t.Error("backoff produced identical delays — jitter is not applied")
	}
}

func TestRetryAfterOverridesTheSchedule(t *testing.T) {
	// A 429 carrying Retry-After knows better than the local schedule does.
	policy := retryPolicy{Attempts: 2, Base: time.Millisecond, Max: time.Millisecond}
	start := time.Now()
	calls := 0
	_ = withRetry(context.Background(), nil, "test", policy, func(context.Context) error {
		calls++
		return retryAfter(errors.New("429"), 40*time.Millisecond)
	})
	if elapsed := time.Since(start); elapsed < 30*time.Millisecond {
		t.Errorf("waited %v, want at least the server's Retry-After", elapsed)
	}
	if calls != 2 {
		t.Errorf("called %d times, want 2", calls)
	}
}

func TestRetryableStatus(t *testing.T) {
	retry := []int{408, 409, 429, 500, 502, 503, 504}
	for _, code := range retry {
		if !retryableStatus(code) {
			t.Errorf("status %d should be retried", code)
		}
	}
	// A bad key or a malformed request answers identically every time.
	for _, code := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound} {
		if retryableStatus(code) {
			t.Errorf("status %d should NOT be retried", code)
		}
	}
}

func TestParseRetryAfter(t *testing.T) {
	if got := parseRetryAfter("12"); got != 12*time.Second {
		t.Errorf("seconds form: got %v, want 12s", got)
	}
	if got := parseRetryAfter(""); got != 0 {
		t.Errorf("absent: got %v, want 0", got)
	}
	if got := parseRetryAfter("not-a-date"); got != 0 {
		t.Errorf("garbage: got %v, want 0", got)
	}
	// A date in the past must not produce a negative wait.
	if got := parseRetryAfter(time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat)); got != 0 {
		t.Errorf("past date: got %v, want 0", got)
	}
	if got := parseRetryAfter(time.Now().Add(30 * time.Second).UTC().Format(http.TimeFormat)); got <= 0 {
		t.Errorf("future date: got %v, want a positive wait", got)
	}
}

func TestRetryableDBErrorIgnoresCancellation(t *testing.T) {
	// Shutdown is not a fault to retry through.
	if retryableDBError(context.Canceled) {
		t.Error("context.Canceled must not be retried")
	}
	if retryableDBError(context.DeadlineExceeded) {
		t.Error("context.DeadlineExceeded must not be retried")
	}
	if retryableDBError(nil) {
		t.Error("nil must not be retried")
	}
}
