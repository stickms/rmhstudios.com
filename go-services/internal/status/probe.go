// Package status implements the Go port of server/status/index.ts: periodic
// HTTP probing of every service with a rolling uptime history and a JSON API.
package status

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// Status represents the health of a service or the overall platform.
type Status string

const (
	StatusUp      Status = "up"
	StatusDegraded Status = "degraded"
	StatusDown    Status = "down"
	StatusUnknown Status = "unknown"
)

// ProbeResult is the outcome of a single custom (non-HTTP) probe — mirroring
// the `{ status, latencyMs, detail }` triple the Node probes return. LatencyMs
// is nil when there is no meaningful latency to report (errors / not
// configured), matching Node's `latencyMs: null`.
type ProbeResult struct {
	Status    Status
	LatencyMs *int64
	Detail    string
}

// Target is a named endpoint to probe. By default it is probed via an HTTP GET
// to URL. If Probe is non-nil it is used instead — this is how the Database
// service (Node `kind: 'database'`) is supported: cmd/status injects a probe
// that runs the same `SELECT 1` health check Node does, without internal/status
// taking a direct dependency on pgx.
type Target struct {
	Name        string
	URL         string
	Description string
	// Probe, when set, replaces the HTTP GET with a custom health check.
	Probe func(ctx context.Context) ProbeResult
}

// ServiceStatus is the per-service result returned in /api/status and used in
// the HTML dashboard. The Up field is for internal use only (tests, logic).
//
// JSON representation matches the Node source (server/status/index.ts) exactly:
//   - description is omitted when empty (Node omits an undefined `description`).
//   - latencyMs and uptimePct are emitted as `null` when absent (Node emits an
//     explicit `null`, not an omitted key), so they are pointers WITHOUT the
//     omitempty option.
type ServiceStatus struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Status      Status   `json:"status"`
	LatencyMs   *int64   `json:"latencyMs"`
	Detail      string   `json:"detail"`
	CheckedAt   string   `json:"checkedAt"`
	UptimePct   *float64 `json:"uptimePct"`

	// Up is a convenience bool for callers (including tests). Not serialised.
	Up bool `json:"-"`
}

// Bucket is a time-boxed uptime counter. T is a Unix millisecond epoch for the
// start of the bucket window. The JSON tags match the Node history file format
// (server/status/index.ts persists `Record<string, Bucket[]>` where Bucket is
// `{ t, up, degraded, down }`) so the persisted file is interchangeable.
type Bucket struct {
	T        int64 `json:"t"`
	Up       int   `json:"up"`
	Degraded int   `json:"degraded"`
	Down     int   `json:"down"`
}

// Snapshot is an immutable view of the prober state at a point in time.
type Snapshot struct {
	Services []ServiceStatus
}

// Service returns the ServiceStatus for the named service, or nil.
func (s *Snapshot) Service(name string) *ServiceStatus {
	for i := range s.Services {
		if s.Services[i].Name == name {
			return &s.Services[i]
		}
	}
	return nil
}

// history holds per-service rolling buckets and the last probe result.
type history struct {
	mu      sync.Mutex
	last    ServiceStatus
	buckets []Bucket
}

// Warner is the minimal logging surface the prober uses for non-fatal history
// persistence problems. *log.Logger satisfies it; nil disables logging.
type Warner interface {
	Warn(msg string, args ...any)
}

// Prober probes a list of targets on demand and stores their history.
type Prober struct {
	targets    []Target
	timeout    time.Duration
	bucketDur  time.Duration
	maxBuckets int
	mu         sync.RWMutex
	hist       map[string]*history

	// historyPath, when non-empty, enables load-on-start / save-after-probe
	// persistence to a JSON file (Node's status-history.json). logger receives
	// non-fatal persistence warnings.
	historyPath string
	logger      Warner
}

// NewProber constructs a Prober for the given targets. Timeout defaults to 4s.
func NewProber(targets []Target) *Prober {
	p := &Prober{
		targets:    targets,
		timeout:    4 * time.Second,
		bucketDur:  time.Hour,
		maxBuckets: 90,
		hist:       make(map[string]*history, len(targets)),
	}
	for _, t := range targets {
		p.hist[t.Name] = &history{
			last: ServiceStatus{
				Name:        t.Name,
				Description: t.Description,
				Status:      StatusUnknown,
				CheckedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			},
		}
	}
	return p
}

// ProbeOnce fires a parallel HTTP GET for every target and records results.
func (p *Prober) ProbeOnce(ctx context.Context) {
	var wg sync.WaitGroup
	results := make([]ServiceStatus, len(p.targets))

	client := &http.Client{Timeout: p.timeout}

	for i, t := range p.targets {
		wg.Add(1)
		go func(idx int, tgt Target) {
			defer wg.Done()
			if tgt.Probe != nil {
				results[idx] = customProbe(ctx, tgt)
			} else {
				results[idx] = probe(ctx, client, tgt)
			}
		}(i, t)
	}
	wg.Wait()

	now := time.Now().UTC()
	nowMs := now.UnixMilli()

	p.mu.Lock()
	defer p.mu.Unlock()

	for _, ss := range results {
		h := p.hist[ss.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		h.last = ss

		// Node's recordSample skips 'unknown' so a "not configured" service does
		// not tank the uptime percentage. Only up/degraded/down are bucketed.
		if ss.Status != StatusUnknown {
			// Find or create the current bucket.
			bucketStart := (nowMs / p.bucketDur.Milliseconds()) * p.bucketDur.Milliseconds()
			var cur *Bucket
			if len(h.buckets) > 0 && h.buckets[len(h.buckets)-1].T == bucketStart {
				cur = &h.buckets[len(h.buckets)-1]
			} else {
				h.buckets = append(h.buckets, Bucket{T: bucketStart})
				if len(h.buckets) > p.maxBuckets {
					h.buckets = h.buckets[len(h.buckets)-p.maxBuckets:]
				}
				cur = &h.buckets[len(h.buckets)-1]
			}
			switch ss.Status {
			case StatusUp:
				cur.Up++
			case StatusDegraded:
				cur.Degraded++
			case StatusDown:
				cur.Down++
			}
		}
		h.mu.Unlock()
	}

	// Persist the rolling history after every cycle (Node calls saveHistory at
	// the end of probeAll). Best-effort: a failure must not break probing.
	if p.historyPath != "" {
		p.saveHistoryLocked()
	}
}

// Snapshot returns a point-in-time view of the current probe results with
// uptime percentages computed from the rolling bucket history.
func (p *Prober) Snapshot() Snapshot {
	p.mu.RLock()
	defer p.mu.RUnlock()

	svcs := make([]ServiceStatus, 0, len(p.targets))
	for _, t := range p.targets {
		h := p.hist[t.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		ss := h.last // copy

		// Compute uptime percentage across all buckets.
		var totalUp, totalAll int
		for _, b := range h.buckets {
			totalUp += b.Up
			totalAll += b.Up + b.Degraded + b.Down
		}
		if totalAll > 0 {
			pct := float64(totalUp) / float64(totalAll) * 100
			ss.UptimePct = &pct
		}
		h.mu.Unlock()

		svcs = append(svcs, ss)
	}
	return Snapshot{Services: svcs}
}

// probe performs a single HTTP GET to the target and returns a ServiceStatus.
func probe(ctx context.Context, client *http.Client, t Target) ServiceStatus {
	ss := ServiceStatus{
		Name:        t.Name,
		Description: t.Description,
		Status:      StatusUnknown,
		Detail:      "",
		CheckedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}

	reqCtx, cancel := context.WithTimeout(ctx, client.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, t.URL, nil)
	if err != nil {
		ss.Status = StatusDown
		ss.Detail = "request build error: " + err.Error()
		return ss
	}

	start := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		// Connection error / timeout: Node reports `down` with latencyMs null
		// and the error message as detail (timeouts read "timeout after Nms").
		ss.Status = StatusDown
		if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
			ss.Detail = fmt.Sprintf("timeout after %dms", client.Timeout.Milliseconds())
		} else {
			ss.Detail = err.Error()
		}
		return ss
	}
	resp.Body.Close()

	code := resp.StatusCode
	// Detail mirrors Node's `HTTP <numeric code>` format exactly.
	ss.Detail = fmt.Sprintf("HTTP %d", code)

	if code >= 200 && code < 400 {
		// Node: 2xx/3xx => up, with measured latency.
		ss.Status = StatusUp
		ss.Up = true
		ss.LatencyMs = &latency
	} else {
		// Node: 4xx/5xx => degraded, latencyMs null (omitted from the measured
		// value) — leave ss.LatencyMs nil so the JSON emits `null`.
		ss.Status = StatusDegraded
	}

	return ss
}

// customProbe runs a Target's injected Probe (e.g. the Database SELECT 1 check)
// and maps the ProbeResult onto a ServiceStatus.
func customProbe(ctx context.Context, t Target) ServiceStatus {
	ss := ServiceStatus{
		Name:        t.Name,
		Description: t.Description,
		Status:      StatusUnknown,
		CheckedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}
	r := t.Probe(ctx)
	ss.Status = r.Status
	ss.Detail = r.Detail
	ss.LatencyMs = r.LatencyMs
	ss.Up = r.Status == StatusUp
	return ss
}
