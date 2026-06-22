// Package status implements the Go port of server/status/index.ts: periodic
// HTTP probing of every service with a rolling uptime history and a JSON API.
package status

import (
	"context"
	"net/http"
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

// Target is a named HTTP endpoint to probe.
type Target struct {
	Name        string
	URL         string
	Description string
}

// ServiceStatus is the per-service result returned in /api/status and used in
// the HTML dashboard. The Up field is for internal use only (tests, logic).
type ServiceStatus struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Status      Status   `json:"status"`
	LatencyMs   *int64   `json:"latencyMs,omitempty"`
	Detail      string   `json:"detail"`
	CheckedAt   string   `json:"checkedAt"`
	UptimePct   *float64 `json:"uptimePct,omitempty"`

	// Up is a convenience bool for callers (including tests). Not serialised.
	Up bool `json:"-"`
}

// Bucket is a time-boxed uptime counter. T is a Unix millisecond epoch for the
// start of the bucket window.
type Bucket struct {
	T        int64
	Up       int
	Degraded int
	Down     int
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

// Prober probes a list of targets on demand and stores their history.
type Prober struct {
	targets    []Target
	timeout    time.Duration
	bucketDur  time.Duration
	maxBuckets int
	mu         sync.RWMutex
	hist       map[string]*history
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
			results[idx] = probe(ctx, client, tgt)
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
		h.mu.Unlock()
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
		ss.Status = StatusDown
		ss.Detail = "connection error"
		return ss
	}
	resp.Body.Close()

	ss.LatencyMs = &latency
	code := resp.StatusCode

	switch {
	case code >= 200 && code < 400:
		ss.Status = StatusUp
		ss.Up = true
		ss.Detail = http.StatusText(code)
		if code >= 300 {
			ss.Detail = "HTTP redirect " + http.StatusText(code)
		} else {
			ss.Detail = "HTTP " + http.StatusText(code)
		}
	default:
		ss.Status = StatusDegraded
		ss.Detail = "HTTP " + http.StatusText(code)
	}

	return ss
}
