package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// waitForFile polls until path exists or the deadline passes.
func waitForFile(t *testing.T, path string, within time.Duration) bool {
	t.Helper()
	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return true
		}
		time.Sleep(2 * time.Millisecond)
	}
	return false
}

// TestShutdownFlush asserts Service.Start writes the history once more when its
// context is cancelled (Node's SIGTERM saveHistory()). A long probe interval
// guarantees the ticker never fires, so re-creation of a removed file can only
// come from the shutdown flush.
func TestShutdownFlush(t *testing.T) {
	path := filepath.Join(t.TempDir(), HistoryFileName)
	lat := int64(1)
	svc := New(Config{
		Targets: []Target{{
			Name:  "db",
			Probe: func(ctx context.Context) ProbeResult { return ProbeResult{Status: StatusUp, LatencyMs: &lat, Detail: "ok"} },
		}},
		ProbeInterval: time.Hour, // ticker must not fire during the test
		HistoryPath:   path,
	})

	ctx, cancel := context.WithCancel(context.Background())
	svc.Start(ctx)

	// The initial probe persists the file; wait for it, then remove it so the
	// only thing that can re-create it is the shutdown flush.
	if !waitForFile(t, path, time.Second) {
		t.Fatal("initial probe did not persist history")
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove: %v", err)
	}

	cancel()
	if !waitForFile(t, path, time.Second) {
		t.Fatal("shutdown flush did not persist history after cancel")
	}
}

// TestHistoryRoundTrip writes a probe's rolling history to a temp file, reloads
// it into a fresh prober, and asserts the buckets survive byte-for-byte.
func TestHistoryRoundTrip(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer up.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()

	path := filepath.Join(t.TempDir(), HistoryFileName)
	targets := []Target{{Name: "up", URL: up.URL}, {Name: "down", URL: down.URL}}

	// First prober: probe twice so buckets accumulate, persisting after each cycle.
	p1 := NewProber(targets)
	p1.EnableHistoryPersistence(path, nil)
	p1.ProbeOnce(context.Background())
	p1.ProbeOnce(context.Background())

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("history file not written: %v", err)
	}

	want := snapshotBuckets(p1)

	// Second prober: load the persisted history; buckets must match.
	p2 := NewProber(targets)
	p2.EnableHistoryPersistence(path, nil)
	got := snapshotBuckets(p2)

	if !reflect.DeepEqual(want, got) {
		t.Fatalf("history did not round-trip:\n want %+v\n got  %+v", want, got)
	}
	// "up" should have recorded an up sample; "down" a degraded sample.
	if len(got["up"]) == 0 || got["up"][len(got["up"])-1].Up == 0 {
		t.Fatalf("expected up samples for 'up': %+v", got["up"])
	}
	if len(got["down"]) == 0 || got["down"][len(got["down"])-1].Degraded == 0 {
		t.Fatalf("expected degraded samples for 'down': %+v", got["down"])
	}
}

// TestLoadHistoryMissingFileIsTolerated asserts a missing file is a no-op (no
// panic, starts fresh).
func TestLoadHistoryMissingFileIsTolerated(t *testing.T) {
	path := filepath.Join(t.TempDir(), HistoryFileName)
	p := NewProber([]Target{{Name: "a", URL: "http://x"}})
	p.EnableHistoryPersistence(path, nil) // file does not exist
	if got := snapshotBuckets(p); len(got["a"]) != 0 {
		t.Fatalf("expected empty history, got %+v", got)
	}
}

// TestLoadHistoryCorruptFileIsTolerated asserts a corrupt file starts fresh.
func TestLoadHistoryCorruptFileIsTolerated(t *testing.T) {
	path := filepath.Join(t.TempDir(), HistoryFileName)
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	p := NewProber([]Target{{Name: "a", URL: "http://x"}})
	p.EnableHistoryPersistence(path, nil)
	if got := snapshotBuckets(p); len(got["a"]) != 0 {
		t.Fatalf("expected empty history after corrupt load, got %+v", got)
	}
}

// TestResolveHistoryPath checks the Node path-resolution rules.
func TestResolveHistoryPath(t *testing.T) {
	// Explicit STATUS_DATA_DIR wins.
	if got := ResolveHistoryPath("/custom/dir"); got != filepath.Join("/custom/dir", HistoryFileName) {
		t.Fatalf("explicit dir: got %q", got)
	}
	// Unset falls back to ./db (no /app/db in the test env).
	if got := ResolveHistoryPath(""); got != filepath.Join("./db", HistoryFileName) && got != filepath.Join("/app/db", HistoryFileName) {
		t.Fatalf("default dir: got %q", got)
	}
}

// snapshotBuckets reads each service's buckets out of a prober for comparison.
func snapshotBuckets(p *Prober) map[string][]Bucket {
	out := make(map[string][]Bucket)
	p.mu.RLock()
	defer p.mu.RUnlock()
	for name, h := range p.hist {
		h.mu.Lock()
		if len(h.buckets) > 0 {
			cp := make([]Bucket, len(h.buckets))
			copy(cp, h.buckets)
			out[name] = cp
		}
		h.mu.Unlock()
	}
	return out
}
