package doctrine

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func tzWorker(fetch func(context.Context) ([]string, error), clock *time.Time) *Worker {
	w := New(nil, log.New("doctrine", "error"), telemetry.New("doctrine"))
	w.fetchTZ = fetch
	w.nowFn = func() time.Time { return *clock }
	return w
}

// 60 Sahur checks (one hour of the per-minute loop) cost one DISTINCT scan of
// "user" instead of 60.
func TestTimezoneListIsFetchedOncePerTTL(t *testing.T) {
	clock := time.Now()
	calls := 0
	w := tzWorker(func(context.Context) ([]string, error) { calls++; return []string{"Asia/Tokyo"}, nil }, &clock)
	for i := 0; i < 9; i++ {
		got, err := w.timezones(context.Background())
		if err != nil || len(got) != 1 || got[0] != "Asia/Tokyo" {
			t.Fatalf("got %v, %v", got, err)
		}
		clock = clock.Add(time.Minute)
	}
	if calls != 1 {
		t.Fatalf("%d fetches inside the TTL window, want 1", calls)
	}
	clock = clock.Add(tzListTTL)
	_, _ = w.timezones(context.Background())
	if calls != 2 {
		t.Fatalf("%d fetches after expiry, want 2", calls)
	}
}

func TestTimezoneListErrorIsNotCachedAndEmptyListIs(t *testing.T) {
	clock := time.Now()
	calls, fail := 0, true
	w := tzWorker(func(context.Context) ([]string, error) {
		calls++
		if fail {
			return nil, errors.New("db down")
		}
		return nil, nil // no user has a timezone yet
	}, &clock)
	if _, err := w.timezones(context.Background()); err == nil {
		t.Fatal("want the fetch error")
	}
	fail = false
	for i := 0; i < 3; i++ {
		if _, err := w.timezones(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 2 {
		t.Fatalf("%d fetches, want 2 (failed, then one cached empty result)", calls)
	}
}
