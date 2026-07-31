package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestInitialServiceState asserts a freshly-constructed Prober reports the Node
// "not yet checked" sentinels for an un-probed service: checkedAt is the epoch
// ("1970-01-01T00:00:00.000Z"), detail is "Not checked yet", status unknown.
func TestInitialServiceState(t *testing.T) {
	p := NewProber([]Target{{Name: "web", URL: "http://example.invalid"}})
	snap := p.Snapshot()
	got := snap.Service("web")
	if got == nil {
		t.Fatal("missing web service")
	}
	if got.CheckedAt != "1970-01-01T00:00:00.000Z" {
		t.Fatalf("expected epoch checkedAt, got %q", got.CheckedAt)
	}
	if got.Detail != "Not checked yet" {
		t.Fatalf("expected detail 'Not checked yet', got %q", got.Detail)
	}
	if got.Status != StatusUnknown {
		t.Fatalf("expected unknown status, got %q", got.Status)
	}
	if got.LatencyMs != nil {
		t.Fatalf("expected nil latency, got %d", *got.LatencyMs)
	}
}

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

// TestExpectContentDegradesOn200WithWrongBody is the check that separates
// "the port answered" from "the website works": a 200 whose body is missing the
// expected marker is degraded, not up. This is the exact failure mode a
// liveness-only status page misses — an SSR container serving a valid empty
// shell while its data layer is broken.
func TestExpectContentDegradesOn200WithWrongBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("<html><body>error</body></html>"))
	}))
	defer srv.Close()

	p := NewProber([]Target{{Name: "web", URL: srv.URL, Expect: `id="main-content"`}})
	p.ProbeOnce(context.Background())

	snap := p.Snapshot()
	got := snap.Service("web")
	if got.Status != StatusDegraded {
		t.Fatalf("expected degraded for 200-with-wrong-body, got %q", got.Status)
	}
	if got.Up {
		t.Fatal("Up must be false when the content assertion fails")
	}
	if !strings.Contains(got.Detail, "unexpected content") {
		t.Fatalf("detail should explain the content mismatch, got %q", got.Detail)
	}
}

// TestExpectContentPassesWhenBodyMatches asserts the happy path still reports
// up (with latency) when the marker is present.
func TestExpectContentPassesWhenBodyMatches(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`<html><main id="main-content">hi</main></html>`))
	}))
	defer srv.Close()

	p := NewProber([]Target{{Name: "web", URL: srv.URL, Expect: `id="main-content"`}})
	p.ProbeOnce(context.Background())

	snap := p.Snapshot()
	got := snap.Service("web")
	if got.Status != StatusUp || !got.Up {
		t.Fatalf("expected up, got %q", got.Status)
	}
	if got.LatencyMs == nil {
		t.Fatal("expected a measured latency on a passing content probe")
	}
}

// TestDegradedAfterBudget asserts a response that arrives but blows its latency
// budget is reported degraded — a status page calling an 8-second page
// "Operational" is the one disagreeing with every user looking at it.
func TestDegradedAfterBudget(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(60 * time.Millisecond)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProber([]Target{{Name: "slow", URL: srv.URL, DegradedAfter: 10 * time.Millisecond}})
	p.ProbeOnce(context.Background())

	snap := p.Snapshot()
	got := snap.Service("slow")
	if got.Status != StatusDegraded {
		t.Fatalf("expected degraded for over-budget response, got %q", got.Status)
	}
	// Unlike the error paths, latency is retained here — the number is the finding.
	if got.LatencyMs == nil {
		t.Fatal("expected latency to be retained on a slow-but-answering probe")
	}
	if !strings.Contains(got.Detail, "slow") {
		t.Fatalf("detail should mention slowness, got %q", got.Detail)
	}
}

// TestNoBudgetMeansNoSlowDowngrade asserts targets without a budget keep the
// original behaviour (any 2xx is up), so existing probes are unaffected.
func TestNoBudgetMeansNoSlowDowngrade(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(30 * time.Millisecond)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProber([]Target{{Name: "nobudget", URL: srv.URL}})
	p.ProbeOnce(context.Background())

	snap := p.Snapshot()
	if got := snap.Service("nobudget"); got.Status != StatusUp {
		t.Fatalf("expected up without a budget, got %q", got.Status)
	}
}

// TestGroupPropagatesToServiceStatus asserts a target's Group reaches the
// snapshot both before the first probe and after it, since the dashboard's
// section headings read it from there.
func TestGroupPropagatesToServiceStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer srv.Close()

	p := NewProber([]Target{{Name: "web", URL: srv.URL, Group: "Core"}})
	before := p.Snapshot()
	if got := before.Service("web"); got.Group != "Core" {
		t.Fatalf("group missing before first probe: %q", got.Group)
	}
	p.ProbeOnce(context.Background())
	after := p.Snapshot()
	if got := after.Service("web"); got.Group != "Core" {
		t.Fatalf("group missing after probe: %q", got.Group)
	}
}
