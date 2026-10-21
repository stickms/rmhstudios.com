// Package status implements the Go port of server/status/index.ts: periodic
// HTTP probing of every service with a rolling uptime history and a JSON API.
package status

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"os"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Status represents the health of a service or the overall platform.
type Status string

const (
	StatusUp       Status = "up"
	StatusDegraded Status = "degraded"
	StatusDown     Status = "down"
	StatusUnknown  Status = "unknown"
	// StatusMaintenance is a DISPLAY state only: the dashboard, the badges and
	// the Statuspage-compatible API show it for a component inside a scheduled
	// maintenance window. It is never emitted on /api/status, whose vocabulary is
	// fixed by the Node original, and never recorded into a bucket.
	StatusMaintenance Status = "maintenance"
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
	// Group buckets the target on the dashboard ("Core", "Realtime", …). Targets
	// with an empty Group render in a leading unlabelled section, so callers
	// that set no group keep the original flat list.
	Group string
	// Expect, when non-empty, requires the response body to CONTAIN this string.
	// A 2xx whose body is missing it is `degraded`, not `up`.
	//
	// This is the difference between probing a port and probing a product. The
	// web app happily returns 200 with a valid HTML shell when its data layer is
	// broken; asserting on a marker inside the rendered page is what makes the
	// dashboard reflect what a visitor would actually see.
	Expect string
	// ExpectAny is Expect with alternatives: the body must contain AT LEAST ONE
	// of these. It exists for documents whose legitimate shape varies — the
	// sitemap is a `<sitemapindex>` today and was a `<urlset>` before it outgrew
	// one file, and both are a working sitemap. When both Expect and ExpectAny
	// are set, both must hold.
	ExpectAny []string
	// DegradedAfter, when > 0, downgrades an otherwise-healthy response to
	// `degraded` if it took longer than this. A service answering in eight
	// seconds is not "operational" — reporting that as green is how a status
	// page ends up disagreeing with every user looking at it.
	DegradedAfter time.Duration
	// Probe, when set, replaces the HTTP GET with a custom health check.
	Probe func(ctx context.Context) ProbeResult
}

// expects reports whether the target asserts anything about the body.
func (t Target) expects() bool { return t.Expect != "" || len(t.ExpectAny) > 0 }

// MatchesBody applies Expect and ExpectAny to a response body.
func (t Target) MatchesBody(body []byte) bool {
	if t.Expect != "" && !bytes.Contains(body, []byte(t.Expect)) {
		return false
	}
	if len(t.ExpectAny) == 0 {
		return true
	}
	for _, want := range t.ExpectAny {
		if bytes.Contains(body, []byte(want)) {
			return true
		}
	}
	return false
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
	Group       string   `json:"group,omitempty"`
	Status      Status   `json:"status"`
	LatencyMs   *int64   `json:"latencyMs"`
	Detail      string   `json:"detail"`
	CheckedAt   string   `json:"checkedAt"`
	UptimePct   *float64 `json:"uptimePct"`

	// Up is a convenience bool for callers (including tests). Not serialised.
	Up bool `json:"-"`
}

// Bucket is a time-boxed uptime counter. T is a Unix millisecond epoch for the
// start of the bucket window. The first four JSON tags match the Node history
// file format (server/status/index.ts persists `Record<string, Bucket[]>` where
// Bucket is `{ t, up, degraded, down }`) so the persisted file is
// interchangeable; every field after them is an omitempty EXTENSION a Node
// reader ignores.
type Bucket struct {
	T        int64 `json:"t"`
	Up       int   `json:"up"`
	Degraded int   `json:"degraded"`
	Down     int   `json:"down"`
	// Maint counts non-up checks taken inside a scheduled maintenance window.
	// They are kept (so the record is honest about what the prober saw) but are
	// excluded from every uptime and error-budget calculation, which is the
	// contract a maintenance window exists to make.
	Maint int `json:"maint,omitempty"`
	// Latency aggregate over the checks that measured one.
	LatN   int   `json:"latN,omitempty"`
	LatSum int64 `json:"latSum,omitempty"`
	LatMin int64 `json:"latMin,omitempty"`
	LatMax int64 `json:"latMax,omitempty"`
	// LatHist counts measured latencies per latencyBounds bin, which is what
	// lets a percentile be estimated over a window far longer than the raw
	// sample ring keeps.
	LatHist []int `json:"latHist,omitempty"`
}

// Total is the number of checks that count toward uptime (maintenance excluded).
func (b Bucket) Total() int { return b.Up + b.Degraded + b.Down }

// addLatency folds one measured latency into the bucket's aggregate.
func (b *Bucket) addLatency(ms int64) {
	if b.LatN == 0 || ms < b.LatMin {
		b.LatMin = ms
	}
	if ms > b.LatMax {
		b.LatMax = ms
	}
	b.LatN++
	b.LatSum += ms
	if len(b.LatHist) != len(latencyBounds)+1 {
		hist := make([]int, len(latencyBounds)+1)
		copy(hist, b.LatHist)
		b.LatHist = hist
	}
	b.LatHist[latencyBin(ms)]++
}

// merge adds another bucket's counts into b (used for rollups and windows).
func (b *Bucket) merge(o Bucket) {
	b.Up += o.Up
	b.Degraded += o.Degraded
	b.Down += o.Down
	b.Maint += o.Maint
	if o.LatN > 0 {
		if b.LatN == 0 || o.LatMin < b.LatMin {
			b.LatMin = o.LatMin
		}
		if o.LatMax > b.LatMax {
			b.LatMax = o.LatMax
		}
		b.LatN += o.LatN
		b.LatSum += o.LatSum
		if len(b.LatHist) != len(latencyBounds)+1 {
			hist := make([]int, len(latencyBounds)+1)
			copy(hist, b.LatHist)
			b.LatHist = hist
		}
		for i := 0; i < len(o.LatHist) && i < len(b.LatHist); i++ {
			b.LatHist[i] += o.LatHist[i]
		}
	}
}

// latencyBounds are the upper edges (ms) of the latency histogram bins; the
// final bin is open-ended. Dense where the services actually live (tens to
// hundreds of ms) and sparse past the budgets, where the exact number matters
// less than the fact that it is that slow.
var latencyBounds = []int64{10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2500, 4000, 6000}

func latencyBin(ms int64) int {
	for i, ub := range latencyBounds {
		if ms <= ub {
			return i
		}
	}
	return len(latencyBounds)
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

// Warner is the minimal logging surface the prober uses for history
// persistence: Info for the successful load, Warn for non-fatal problems
// (missing/corrupt file, write errors). *log.Logger satisfies it; nil disables
// logging. (Kept named Warner for API compatibility with existing callers.)
type Warner interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}

// Prober probes a list of targets on demand and stores their history.
type Prober struct {
	targets    []Target
	timeout    time.Duration
	bucketDur  time.Duration
	maxBuckets int
	// interval is the probe cadence, used to turn failed-check counts into an
	// estimate of downtime minutes. Defaults to 15s.
	interval time.Duration
	// maxDays is how many daily rollup buckets are retained (default 90).
	maxDays int
	// recentCap is how many raw samples per service the recent ring keeps
	// (default 240 — an hour at the default 15s cadence).
	recentCap int
	// openAfter / closeAfter debounce automatic incidents: a failure streak
	// must reach openAfter checks before it is an incident (a shorter one is a
	// blip), and closeAfter consecutive good checks resolve it.
	openAfter  int
	closeAfter int

	mu   sync.RWMutex
	hist map[string]*history

	// historyPath, when non-empty, enables load-on-start / save-after-probe
	// persistence to a JSON file (Node's status-history.json). logger receives
	// non-fatal persistence warnings.
	historyPath string
	logger      Warner
	// extPath is the extended-state file (daily rollups, recent samples,
	// counters) persisted beside the Node-compatible history file.
	extPath      string
	lastExtSave  time.Time
	lastSaveAt   time.Time
	lastSaveErr  string
	extSaveEvery time.Duration

	// inMaintenance, when set, reports whether a service is inside a scheduled
	// maintenance window at the given instant. onEvents receives the incident
	// lifecycle events each cycle produced, after every lock is released.
	inMaintenance func(service string, at time.Time) bool
	onEvents      func([]Event)

	// Self-monitoring of the prober itself.
	cycles        int64
	lastCycleDur  time.Duration
	totalCycleDur time.Duration
	lastCycleAt   time.Time
}

// Cycles is the number of completed probe cycles.
func (p *Prober) Cycles() int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.cycles
}

// NewProber constructs a Prober for the given targets. Timeout defaults to 4s.
func NewProber(targets []Target) *Prober {
	p := &Prober{
		targets:      targets,
		timeout:      4 * time.Second,
		bucketDur:    time.Hour,
		maxBuckets:   90,
		interval:     15 * time.Second,
		maxDays:      90,
		recentCap:    240,
		openAfter:    2,
		closeAfter:   2,
		extSaveEvery: time.Minute,
		hist:         make(map[string]*history, len(targets)),
	}
	for _, t := range targets {
		p.hist[t.Name] = &history{
			last: ServiceStatus{
				Name:        t.Name,
				Description: t.Description,
				Group:       t.Group,
				Status:      StatusUnknown,
				Detail:      "Not checked yet",
				CheckedAt:   epochSentinel,
			},
			ctr: newCounters(),
		}
	}
	return p
}

// epochSentinel is the "not yet checked" timestamp, matching Node's
// `new Date(0).toISOString()` exactly (millisecond precision, ".000Z").
// Consumers use this to detect a service that has not been probed yet.
const epochSentinel = "1970-01-01T00:00:00.000Z"

// isoMillis is the timestamp layout every checkedAt uses.
const isoMillis = "2006-01-02T15:04:05.000Z07:00"

// ProbeOnce fires a parallel HTTP GET for every target and records results.
func (p *Prober) ProbeOnce(ctx context.Context) {
	cycleStart := time.Now()
	var wg sync.WaitGroup
	results := make([]ServiceStatus, len(p.targets))
	extras := make([]ProbeDetail, len(p.targets))

	client := &http.Client{Timeout: p.timeout}

	for i, t := range p.targets {
		wg.Add(1)
		go func(idx int, tgt Target) {
			defer wg.Done()
			if tgt.Probe != nil {
				results[idx], extras[idx] = customProbe(ctx, tgt)
			} else {
				results[idx], extras[idx] = probe(ctx, client, tgt)
			}
		}(i, t)
	}
	wg.Wait()

	now := time.Now().UTC()

	// Resolve maintenance before taking the prober lock: the callback belongs
	// to the incident store, which has its own lock, and holding both in
	// opposite orders on two goroutines is how a deadlock gets written.
	maint := make([]bool, len(results))
	if p.inMaintenance != nil {
		for i, ss := range results {
			maint[i] = p.inMaintenance(ss.Name, now)
		}
	}

	var events []Event
	p.mu.Lock()
	for i, ss := range results {
		h := p.hist[ss.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		if ev := h.record(p, ss, extras[i], now, maint[i]); ev != nil {
			events = append(events, *ev)
		}
		h.mu.Unlock()
	}

	p.cycles++
	p.lastCycleDur = time.Since(cycleStart)
	p.totalCycleDur += p.lastCycleDur
	p.lastCycleAt = now

	// Persist the rolling history after every cycle (Node calls saveHistory at
	// the end of probeAll). Best-effort: a failure must not break probing.
	if p.historyPath != "" {
		p.saveHistoryLocked()
		if p.extPath != "" && now.Sub(p.lastExtSave) >= p.extSaveEvery {
			p.saveExtendedLocked()
			p.lastExtSave = now
		}
	}
	onEvents := p.onEvents
	p.mu.Unlock()

	if onEvents != nil && len(events) > 0 {
		onEvents(events)
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

		// Compute uptime percentage across all buckets. Maintenance checks are
		// already outside Total(), so a planned window costs nothing.
		var totalUp, totalAll int
		for _, b := range h.buckets {
			totalUp += b.Up
			totalAll += b.Total()
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

// ProbeDetail is everything a probe learned beyond the Node-compatible
// `{status, latencyMs, detail}` triple: the request's phase timings, the TLS
// certificate it was served, the protocol and size of the answer, and a
// machine-readable category for a failure. None of it reaches /api/status.
type ProbeDetail struct {
	Code        int      `json:"code,omitempty"`
	Category    string   `json:"category,omitempty"`
	Proto       string   `json:"proto,omitempty"`
	Bytes       int64    `json:"bytes,omitempty"`
	ContentType string   `json:"contentType,omitempty"`
	Phases      *Phases  `json:"phases,omitempty"`
	TLS         *TLSInfo `json:"tls,omitempty"`
	TotalMs     *int64   `json:"totalMs,omitempty"`
	Kind        string   `json:"kind"`
	At          int64    `json:"at,omitempty"`
}

// Phases is a request's timing breakdown in milliseconds. A field is -1 when
// the phase did not happen on this request — most often because the transport
// reused a kept-alive connection, which skips DNS, connect and TLS entirely.
type Phases struct {
	DNS     float64 `json:"dns"`
	Connect float64 `json:"connect"`
	TLS     float64 `json:"tls"`
	TTFB    float64 `json:"ttfb"`
	Total   float64 `json:"total"`
	Reused  bool    `json:"reused"`
}

// TLSInfo describes the certificate a target served.
type TLSInfo struct {
	NotAfter int64  `json:"notAfter"`
	Issuer   string `json:"issuer,omitempty"`
	Subject  string `json:"subject,omitempty"`
	Version  string `json:"version,omitempty"`
}

// Failure categories. Stable strings: they are API values and metric labels.
const (
	CatTimeout  = "timeout"
	CatDNS      = "dns"
	CatRefused  = "refused"
	CatReset    = "reset"
	CatTLS      = "tls"
	CatNetwork  = "network"
	CatHTTP5xx  = "http_5xx"
	CatHTTP4xx  = "http_4xx"
	CatContent  = "content"
	CatSlow     = "slow"
	CatProbe    = "probe_error"
	CatNotReady = "unknown"
)

// CategoryLabel is the human phrase for a failure category.
func CategoryLabel(c string) string {
	switch c {
	case CatTimeout:
		return "Timeout"
	case CatDNS:
		return "DNS failure"
	case CatRefused:
		return "Connection refused"
	case CatReset:
		return "Connection reset"
	case CatTLS:
		return "TLS error"
	case CatNetwork:
		return "Network error"
	case CatHTTP5xx:
		return "Server error (5xx)"
	case CatHTTP4xx:
		return "Client error (4xx)"
	case CatContent:
		return "Unexpected content"
	case CatSlow:
		return "Over latency budget"
	case CatProbe:
		return "Probe error"
	case CatNotReady:
		return "Not configured"
	}
	return c
}

// classifyErr maps a transport error onto a failure category.
func classifyErr(err error) string {
	var dnsErr *net.DNSError
	var certErr *tls.CertificateVerificationError
	var recErr tls.RecordHeaderError
	switch {
	case errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err):
		return CatTimeout
	case errors.As(err, &dnsErr):
		return CatDNS
	case errors.Is(err, syscall.ECONNREFUSED):
		return CatRefused
	case errors.Is(err, syscall.ECONNRESET) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF):
		return CatReset
	case errors.As(err, &certErr) || errors.As(err, &recErr) || strings.Contains(err.Error(), "tls:") || strings.Contains(err.Error(), "x509:"):
		return CatTLS
	}
	return CatNetwork
}

// probe performs a single HTTP GET to the target and returns a ServiceStatus.
func probe(ctx context.Context, client *http.Client, t Target) (ServiceStatus, ProbeDetail) {
	ss := ServiceStatus{
		Name:        t.Name,
		Description: t.Description,
		Group:       t.Group,
		Status:      StatusUnknown,
		Detail:      "",
		CheckedAt:   time.Now().UTC().Format(isoMillis),
	}
	pd := ProbeDetail{Kind: "http", At: time.Now().UnixMilli()}

	reqCtx, cancel := context.WithTimeout(ctx, client.Timeout)
	defer cancel()

	// Phase timings. The trace hooks run on transport goroutines, but every one
	// of them has happened-before the response (or error) returns from Do, so
	// reading the times after Do is race-free.
	var dnsStart, dnsDone, connStart, connDone, tlsStart, tlsDone, firstByte time.Time
	reused := false
	trace := &httptrace.ClientTrace{
		DNSStart:             func(httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:              func(httptrace.DNSDoneInfo) { dnsDone = time.Now() },
		ConnectStart:         func(string, string) { connStart = time.Now() },
		ConnectDone:          func(string, string, error) { connDone = time.Now() },
		TLSHandshakeStart:    func() { tlsStart = time.Now() },
		TLSHandshakeDone:     func(tls.ConnectionState, error) { tlsDone = time.Now() },
		GotConn:              func(info httptrace.GotConnInfo) { reused = info.Reused },
		GotFirstResponseByte: func() { firstByte = time.Now() },
	}
	reqCtx = httptrace.WithClientTrace(reqCtx, trace)

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, t.URL, nil)
	if err != nil {
		ss.Status = StatusDown
		ss.Detail = "request build error: " + err.Error()
		pd.Category = CatProbe
		return ss, pd
	}
	// Identify the prober in access logs, and ask for uncached responses — a
	// status page reading a CDN cache entry is reporting on the CDN, not on the
	// service behind it.
	req.Header.Set("User-Agent", "rmh-status-probe/1.0")
	req.Header.Set("Cache-Control", "no-cache")

	start := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()

	span := func(a, b time.Time) float64 {
		if a.IsZero() || b.IsZero() {
			return -1
		}
		return float64(b.Sub(a).Microseconds()) / 1000
	}
	phases := &Phases{
		DNS:     span(dnsStart, dnsDone),
		Connect: span(connStart, connDone),
		TLS:     span(tlsStart, tlsDone),
		TTFB:    span(start, firstByte),
		Reused:  reused,
	}

	if err != nil {
		// Connection error / timeout: Node reports `down` with latencyMs null
		// and the error message as detail (timeouts read "timeout after Nms").
		ss.Status = StatusDown
		pd.Category = classifyErr(err)
		if pd.Category == CatTimeout {
			ss.Detail = fmt.Sprintf("timeout after %dms", client.Timeout.Milliseconds())
		} else {
			ss.Detail = err.Error()
		}
		phases.Total = float64(latency)
		pd.Phases = phases
		return ss, pd
	}

	// Read the body only when a target asserts on it, and cap the read so a
	// large or hung response can't balloon the prober's memory. Always drain a
	// little and close so the connection can be reused.
	var body []byte
	if t.expects() {
		body, _ = io.ReadAll(io.LimitReader(resp.Body, maxProbeBodyBytes))
	}
	resp.Body.Close()
	phases.Total = float64(time.Since(start).Microseconds()) / 1000
	pd.Phases = phases
	pd.TotalMs = &latency

	code := resp.StatusCode
	pd.Code = code
	pd.Proto = resp.Proto
	pd.ContentType = resp.Header.Get("Content-Type")
	switch {
	case resp.ContentLength >= 0:
		pd.Bytes = resp.ContentLength
	case body != nil && len(body) < maxProbeBodyBytes:
		pd.Bytes = int64(len(body))
	}
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		issuer := cert.Issuer.CommonName
		if issuer == "" && len(cert.Issuer.Organization) > 0 {
			issuer = cert.Issuer.Organization[0]
		}
		pd.TLS = &TLSInfo{
			NotAfter: cert.NotAfter.UnixMilli(),
			Issuer:   issuer,
			Subject:  cert.Subject.CommonName,
			Version:  tls.VersionName(resp.TLS.Version),
		}
	}

	// Detail mirrors Node's `HTTP <numeric code>` format exactly.
	ss.Detail = fmt.Sprintf("HTTP %d", code)

	if code >= 200 && code < 400 {
		// Node: 2xx/3xx => up, with measured latency.
		ss.Status = StatusUp
		ss.Up = true
		ss.LatencyMs = &latency

		// Content assertion: the endpoint answered, but with the wrong thing.
		// Degraded rather than down — something is serving, just not correctly.
		if t.expects() && !t.MatchesBody(body) {
			ss.Status = StatusDegraded
			ss.Up = false
			ss.Detail = fmt.Sprintf("HTTP %d, unexpected content", code)
			pd.Category = CatContent
		} else if t.DegradedAfter > 0 && latency > t.DegradedAfter.Milliseconds() {
			// Answering, but too slowly to call operational. Latency is kept
			// here (unlike the error paths) because the number IS the finding.
			ss.Status = StatusDegraded
			ss.Up = false
			ss.Detail = fmt.Sprintf("HTTP %d, slow (%dms)", code, latency)
			pd.Category = CatSlow
		}
	} else {
		// Node: 4xx/5xx => degraded, latencyMs null (omitted from the measured
		// value) — leave ss.LatencyMs nil so the JSON emits `null`.
		ss.Status = StatusDegraded
		if code >= 500 {
			pd.Category = CatHTTP5xx
		} else {
			pd.Category = CatHTTP4xx
		}
	}

	return ss, pd
}

// maxProbeBodyBytes caps how much of a response body a content-asserting probe
// reads. Markers live in the head of a document, so 64 KiB is generous.
const maxProbeBodyBytes = 64 << 10

// customProbe runs a Target's injected Probe (e.g. the Database SELECT 1 check)
// and maps the ProbeResult onto a ServiceStatus.
func customProbe(ctx context.Context, t Target) (ServiceStatus, ProbeDetail) {
	ss := ServiceStatus{
		Name:        t.Name,
		Description: t.Description,
		Group:       t.Group,
		Status:      StatusUnknown,
		CheckedAt:   time.Now().UTC().Format(isoMillis),
	}
	r := t.Probe(ctx)
	ss.Status = r.Status
	ss.Detail = r.Detail
	ss.LatencyMs = r.LatencyMs
	ss.Up = r.Status == StatusUp
	pd := ProbeDetail{Kind: "custom", At: time.Now().UnixMilli(), TotalMs: r.LatencyMs}
	switch r.Status {
	case StatusDown:
		pd.Category = CatProbe
		if strings.Contains(strings.ToLower(r.Detail), "timeout") || strings.Contains(r.Detail, "deadline") {
			pd.Category = CatTimeout
		}
	case StatusDegraded:
		pd.Category = CatSlow
	case StatusUnknown:
		pd.Category = CatNotReady
	}
	return ss, pd
}
