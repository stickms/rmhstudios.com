package status

import (
	"encoding/json"
	"fmt"
	"html"
	"math"
	"net/http"
	"strings"
	"time"
)

// dashboard is the HTTP handler for the status service.
type dashboard struct {
	prober *Prober
}

// newDashboard constructs the handler mux for the status service.
func newDashboard(p *Prober) http.Handler {
	d := &dashboard{prober: p}
	mux := http.NewServeMux()
	mux.HandleFunc("/", d.handleRoot)
	mux.HandleFunc("/api/status", d.handleAPIStatus)
	mux.HandleFunc("/health", d.handleHealth)
	return mux
}

// handleRoot serves the HTML dashboard at /.
func (d *dashboard) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		http.NotFound(w, r)
		return
	}
	snap := d.prober.Snapshot()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, renderHTML(snap, d.prober))
}

// handleAPIStatus serves the JSON API at /api/status.
func (d *dashboard) handleAPIStatus(w http.ResponseWriter, r *http.Request) {
	snap := d.prober.Snapshot()
	overall := overallStatus(snap)
	checkedAt := latestCheckedAt(snap)

	// Serialise via a struct (not a map) so the top-level key order — status,
	// checkedAt, services — matches the Node source exactly. ServiceStatus's own
	// JSON tags already match the per-service contract (description omitted when
	// empty; latencyMs / uptimePct emitted as explicit null; internal Up is
	// json:"-").
	if snap.Services == nil {
		snap.Services = []ServiceStatus{}
	}
	body := struct {
		Status    Status          `json:"status"`
		CheckedAt string          `json:"checkedAt"`
		Services  []ServiceStatus `json:"services"`
	}{
		Status:    overall,
		CheckedAt: checkedAt,
		Services:  snap.Services,
	}

	code := http.StatusOK
	if overall == StatusDown {
		code = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(body)
}

// handleHealth serves a simple liveness probe at /health.
func (d *dashboard) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}` + "\n"))
}

// overallStatus derives the platform status from the snapshot — matching the
// Node logic in index.ts exactly.
func overallStatus(snap Snapshot) Status {
	for _, ss := range snap.Services {
		if ss.Status == StatusDown {
			return StatusDown
		}
	}
	for _, ss := range snap.Services {
		if ss.Status == StatusDegraded {
			return StatusDegraded
		}
	}
	hasUp := false
	for _, ss := range snap.Services {
		if ss.Status == StatusUp {
			hasUp = true
		} else if ss.Status != StatusUnknown {
			return StatusUnknown
		}
	}
	if hasUp {
		return StatusUp
	}
	return StatusUnknown
}

// latestCheckedAt returns the most recent checkedAt among services, or a zero
// time when there are no results yet.
func latestCheckedAt(snap Snapshot) string {
	if len(snap.Services) == 0 {
		return time.Time{}.UTC().Format(time.RFC3339Nano)
	}
	latest := snap.Services[0].CheckedAt
	for _, ss := range snap.Services[1:] {
		if ss.CheckedAt > latest {
			latest = ss.CheckedAt
		}
	}
	return latest
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

type statusMeta struct {
	label string
	color string
}

var statusMetaMap = map[Status]statusMeta{
	StatusUp:      {label: "Operational", color: "#7bc88a"},
	StatusDegraded: {label: "Degraded", color: "#d9c36e"},
	StatusDown:    {label: "Down", color: "#d98a8a"},
	StatusUnknown: {label: "Unknown", color: "#6a6b74"},
}

func formatSpan(bucketDur time.Duration, maxBuckets int) string {
	ms := bucketDur.Milliseconds() * int64(maxBuckets)
	h := int(math.Round(float64(ms) / 3_600_000))
	if h < 48 {
		return fmt.Sprintf("%dh", h)
	}
	return fmt.Sprintf("%dd", int(math.Round(float64(h)/24)))
}

func bucketStatusStr(b Bucket) Status {
	if b.Down > 0 {
		return StatusDown
	}
	if b.Degraded > 0 {
		return StatusDegraded
	}
	if b.Up > 0 {
		return StatusUp
	}
	return StatusUnknown
}

func renderBars(p *Prober, name string) string {
	p.mu.RLock()
	h := p.hist[name]
	p.mu.RUnlock()

	var buckets []Bucket
	if h != nil {
		h.mu.Lock()
		buckets = make([]Bucket, len(h.buckets))
		copy(buckets, h.buckets)
		h.mu.Unlock()
	}

	maxBuckets := p.maxBuckets
	pad := maxBuckets - len(buckets)
	if pad < 0 {
		pad = 0
	}

	var sb strings.Builder
	for i := 0; i < pad; i++ {
		sb.WriteString(`<span class="bar bar-empty"></span>`)
	}
	for _, b := range buckets {
		st := bucketStatusStr(b)
		m := statusMetaMap[st]
		when := time.UnixMilli(b.T).UTC().Format("2006-01-02 15:04 UTC")
		total := b.Up + b.Degraded + b.Down
		pct := 0
		if total > 0 {
			pct = int(math.Round(float64(b.Up) / float64(total) * 100))
		}
		title := fmt.Sprintf("%s — %s (%d%% up, %d checks)", when, m.label, pct, total)
		sb.WriteString(fmt.Sprintf(`<span class="bar bar-%s" title="%s"></span>`, st, html.EscapeString(title)))
	}
	return sb.String()
}

func renderHTML(snap Snapshot, p *Prober) string {
	overall := overallStatus(snap)
	meta := statusMetaMap[overall]
	checkedAt := latestCheckedAt(snap)

	headline := "Status unknown"
	switch overall {
	case StatusUp:
		headline = "All systems operational"
	case StatusDegraded:
		headline = "Some systems degraded"
	case StatusDown:
		headline = "Major outage"
	}

	span := formatSpan(p.bucketDur, p.maxBuckets)

	var cards strings.Builder
	for _, ss := range snap.Services {
		m := statusMetaMap[ss.Status]
		latency := "—"
		if ss.LatencyMs != nil {
			latency = fmt.Sprintf("%d ms", *ss.LatencyMs)
		}
		pctLabel := "—"
		if ss.UptimePct != nil {
			pctLabel = fmt.Sprintf("%.2f%%", *ss.UptimePct)
		}
		descHTML := ""
		if ss.Description != "" {
			descHTML = fmt.Sprintf(`<span class="desc">%s</span>`, html.EscapeString(ss.Description))
		}
		cards.WriteString(fmt.Sprintf(`
        <li class="service">
          <div class="service-head">
            <span class="dot" style="background:%s"></span>
            <span class="info">
              <span class="name">%s</span>
              %s
            </span>
            <span class="meta">
              <span class="latency" title="%s">%s</span>
              <span class="badge" style="color:%s;border-color:%s">%s</span>
            </span>
          </div>
          <div class="bars" aria-hidden="true">%s</div>
          <div class="bars-legend">
            <span>%s ago</span>
            <span class="uptime">%s uptime</span>
            <span>now</span>
          </div>
        </li>`,
			m.color,
			html.EscapeString(ss.Name),
			descHTML,
			html.EscapeString(ss.Detail),
			latency,
			m.color, m.color, m.label,
			renderBars(p, ss.Name),
			span,
			pctLabel,
		))
	}

	return fmt.Sprintf(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="30" />
  <title>RMH Studios — System Status</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --site-bg: #000;
      --site-bg-subtle: #0b0b0c;
      --site-surface: #27282c;
      --site-surface-hover: #313238;
      --site-border: #3a3b42;
      --site-border-bright: #4a4b54;
      --site-text: #e8e8ec;
      --site-text-muted: #9a9ba4;
      --site-text-dim: #6a6b74;
      --site-accent: #9b7ad8;
      --site-success: #7bc88a;
      --site-warning: #d9c36e;
      --site-danger: #d98a8a;
      --site-radius: 12px;
      --site-radius-sm: 8px;
      --font-title: "Playfair Display", Georgia, "Times New Roman", serif;
      --font-body: "Inter", "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: var(--font-body);
      background:
        radial-gradient(1200px 600px at 50%% -10%%, rgba(155,122,216,0.10), transparent 60%%),
        var(--site-bg);
      color: var(--site-text); line-height: 1.5; min-height: 100vh;
      display: flex; justify-content: center; padding: 56px 16px;
      letter-spacing: -0.01em;
    }
    .wrap { width: 100%%; max-width: 760px; }
    header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    .banner { width: 16px; height: 16px; border-radius: 50%%; flex: none; box-shadow: 0 0 0 5px rgba(255,255,255,.05); }
    h1 { font-family: var(--font-title); font-size: 1.95rem; margin: 0; font-weight: 700; letter-spacing: 0; line-height: 1.15; }
    .sub { color: var(--site-text-muted); font-size: .9rem; margin-top: 4px; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .service {
      background: var(--site-surface); border: 1px solid var(--site-border);
      border-radius: var(--site-radius); padding: 16px 18px;
      transition: border-color .2s ease, transform .2s ease;
    }
    .service:hover { border-color: var(--site-border-bright); }
    .service-head { display: flex; align-items: center; gap: 14px; }
    .dot { width: 10px; height: 10px; border-radius: 50%%; flex: none; }
    .info { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
    .name { font-weight: 600; }
    .desc { color: var(--site-text-muted); font-size: .82rem; }
    .meta { display: flex; align-items: center; gap: 12px; flex: none; }
    .latency { color: var(--site-text-dim); font-size: .8rem; font-variant-numeric: tabular-nums; }
    .badge { font-size: .72rem; font-weight: 600; padding: 3px 10px; border: 1px solid; border-radius: 999px; white-space: nowrap; }
    .bars { display: flex; gap: 2px; margin-top: 14px; height: 30px; align-items: stretch; }
    .bar { flex: 1 1 0; border-radius: 2px; min-width: 2px; }
    .bar-up { background: var(--site-success); }
    .bar-degraded { background: var(--site-warning); }
    .bar-down { background: var(--site-danger); }
    .bar-unknown, .bar-empty { background: #2f3036; }
    .bar:hover { filter: brightness(1.25); }
    .bars-legend {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px; color: var(--site-text-dim); font-size: .72rem;
    }
    .uptime { color: var(--site-text-muted); font-weight: 600; font-variant-numeric: tabular-nums; }
    footer { margin-top: 22px; color: var(--site-text-dim); font-size: .76rem; text-align: center; }
    footer a { color: var(--site-accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }

    @media (max-width: 560px) {
      body { padding: 28px 12px; }
      header { gap: 12px; margin-bottom: 20px; }
      h1 { font-size: 1.55rem; }
      .service { padding: 14px; }
      .service-head { flex-wrap: wrap; row-gap: 8px; }
      .info { flex-basis: calc(100%% - 24px); }
      .meta { width: 100%%; padding-left: 24px; justify-content: flex-start; }
      .meta .latency { margin-left: auto; }
      .bars { height: 34px; gap: 1px; }
      .bar { min-width: 1px; border-radius: 1px; }
      .bars-legend { font-size: .68rem; }
    }
    @media (hover: none) {
      .bar:hover { filter: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="banner" style="background:%s"></span>
      <div>
        <h1>%s</h1>
        <div class="sub">RMH Studios system status</div>
      </div>
    </header>
    <ul>%s</ul>
    <footer>
      Last checked %s &middot; auto-refreshes every 30s &middot;
      <a href="/api/status">JSON</a>
    </footer>
  </div>
</body>
</html>`,
		meta.color,
		headline,
		cards.String(),
		html.EscapeString(checkedAt),
	)
}
