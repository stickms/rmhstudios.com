package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeMarksUpAndDown(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer up.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()

	p := NewProber([]Target{{Name: "up", URL: up.URL}, {Name: "down", URL: down.URL}})
	p.ProbeOnce(context.Background())
	snap := p.Snapshot()

	if !snap.Service("up").Up || snap.Service("down").Up {
		t.Fatalf("probe results wrong: %+v", snap)
	}
}

// TestLatencyNullOnNon2xx asserts the Node contract: a 2xx response records a
// non-nil latencyMs, while a non-2xx (503) response leaves latencyMs nil so the
// JSON emits `null` exactly as the Node source does.
func TestLatencyNullOnNon2xx(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer up.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()

	p := NewProber([]Target{{Name: "up", URL: up.URL}, {Name: "down", URL: down.URL}})
	p.ProbeOnce(context.Background())
	snap := p.Snapshot()

	if snap.Service("up").LatencyMs == nil {
		t.Fatalf("expected non-nil latency for up service, got nil")
	}
	d := snap.Service("down")
	if d.Status != StatusDegraded {
		t.Fatalf("expected degraded for 503, got %q", d.Status)
	}
	if d.LatencyMs != nil {
		t.Fatalf("expected nil latency for 503 (degraded), got %d", *d.LatencyMs)
	}
	if d.Detail != "HTTP 503" {
		t.Fatalf("expected detail 'HTTP 503', got %q", d.Detail)
	}
}

// TestCustomProbe asserts a Target with an injected Probe (e.g. the Database
// SELECT 1 check) bypasses HTTP and uses the supplied ProbeResult, including
// latency and detail.
func TestCustomProbe(t *testing.T) {
	lat := int64(7)
	p := NewProber([]Target{{
		Name: "Database",
		Probe: func(ctx context.Context) ProbeResult {
			return ProbeResult{Status: StatusUp, LatencyMs: &lat, Detail: "SELECT 1 ok"}
		},
	}})
	p.ProbeOnce(context.Background())
	snap := p.Snapshot()
	got := snap.Service("Database")
	if got == nil || !got.Up || got.Detail != "SELECT 1 ok" || got.LatencyMs == nil || *got.LatencyMs != 7 {
		t.Fatalf("custom probe result wrong: %+v", got)
	}
}
