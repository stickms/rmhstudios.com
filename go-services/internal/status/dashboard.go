package status

import (
	"encoding/json"
	"fmt"
	"html"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// dashboard is the HTTP handler for the status service.
type dashboard struct {
	svc *Service
}

// newDashboard constructs the handler mux for the status service.
func newDashboard(s *Service) http.Handler {
	d := &dashboard{svc: s}
	mux := http.NewServeMux()
	mux.HandleFunc("/", d.handleRoot)
	mux.HandleFunc("/api/status", d.handleAPIStatus)
	// A SEPARATE endpoint, not extra keys on /api/status: that payload is
	// byte-compatible with the Node original this service replaced, and staying
	// that way is the reason nothing downstream had to change when it did. Every
	// endpoint added since follows the same rule.
	mux.HandleFunc("/api/slo", d.handleAPISLO)
	mux.HandleFunc("/health", d.handleHealth)

	get := func(pattern string, h http.HandlerFunc) {
		mux.HandleFunc("GET "+pattern, h)
		mux.HandleFunc("OPTIONS "+pattern, func(w http.ResponseWriter, r *http.Request) {
			cors(w)
			w.WriteHeader(http.StatusNoContent)
		})
	}
	get("/api/dashboard", d.handleAPIDashboard)
	get("/api/services", d.handleAPIServices)
	get("/api/services/{slug}", d.handleAPIService)
	get("/api/uptime", d.handleAPIUptime)
	get("/api/history", d.handleAPIHistory)
	get("/api/history.csv", d.handleHistoryCSV)
	get("/api/incidents", d.handleAPIIncidents)
	get("/api/incidents/{id}", d.handleAPIIncident)
	get("/api/maintenance", d.handleAPIMaintenance)
	get("/api/announcements", d.handleAPIAnnouncements)
	get("/api/v2/{doc}", d.handleV2)
	get("/api/v2/{kind}/{doc}", d.handleV2Sub)
	get("/metrics", d.handleMetrics)
	get("/badge.svg", d.handleBadge)
	get("/badge/{file}", d.handleBadge)
	get("/feed.rss", d.handleRSS)
	get("/feed.atom", d.handleAtom)
	get("/maintenance.ics", d.handleICS)
	get("/history", d.handleHistoryPage)
	get("/incidents/{id}", d.handleIncidentPage)
	get("/report", d.handleReportPage)
	get("/embed", d.handleEmbed)
	get("/embed.js", d.handleEmbedJS)
	get("/manifest.webmanifest", d.handleManifest)
	get("/robots.txt", d.handleRobots)

	mux.HandleFunc("POST /api/admin/incidents", d.admin(d.adminCreateIncident))
	mux.HandleFunc("POST /api/admin/incidents/{id}/updates", d.admin(d.adminIncidentUpdate))
	mux.HandleFunc("PATCH /api/admin/incidents/{id}", d.admin(d.adminPatchIncident))
	mux.HandleFunc("DELETE /api/admin/incidents/{id}", d.admin(d.adminDeleteIncident))
	mux.HandleFunc("POST /api/admin/maintenance", d.admin(d.adminCreateMaintenance))
	mux.HandleFunc("PATCH /api/admin/maintenance/{id}", d.admin(d.adminPatchMaintenance))
	mux.HandleFunc("POST /api/admin/maintenance/{id}/cancel", d.admin(d.adminCancelMaintenance))
	mux.HandleFunc("DELETE /api/admin/maintenance/{id}", d.admin(d.adminDeleteMaintenance))
	mux.HandleFunc("GET /api/admin/announcements", d.admin(d.adminListAnnouncements))
	mux.HandleFunc("POST /api/admin/announcements", d.admin(d.adminCreateAnnouncement))
	mux.HandleFunc("DELETE /api/admin/announcements/{id}", d.admin(d.adminDeleteAnnouncement))
	mux.HandleFunc("POST /api/admin/test-webhook", d.admin(d.adminTestWebhook))
	return mux
}

func (d *dashboard) view() *View { return d.svc.View(time.Now()) }

// handleRoot serves the HTML dashboard at /.
func (d *dashboard) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, renderHTML(d.view()))
}

// handleAPISLO serves the multi-window burn-rate report at /api/slo (E14).
//
// Publishing the remaining error budget is not decoration. A budget nobody can
// see is a budget nobody defends; a number on the public status page is a
// forcing function, and it is the same number the paging rule reads, so the
// alert and the page can never disagree about how much is left.
func (d *dashboard) handleAPISLO(w http.ResponseWriter, r *http.Request) {
	report := d.svc.prober.SLO(d.svc.cfg.SLO, time.Now())

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	// 200 even when Page is true. This endpoint reports a BUDGET position, and a
	// non-2xx here would make every uptime checker pointed at it treat "we are
	// burning budget" as "the status service is down".
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(report)
}

// handleAPIStatus serves the JSON API at /api/status.
func (d *dashboard) handleAPIStatus(w http.ResponseWriter, r *http.Request) {
	snap := d.svc.prober.Snapshot()
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
	// Match Node's `{ status: 'ok', uptime: process.uptime() }`: uptime is the
	// number of seconds (a float) since the service started.
	body := struct {
		Status string  `json:"status"`
		Uptime float64 `json:"uptime"`
	}{
		Status: "ok",
		Uptime: time.Since(d.svc.startedAt).Seconds(),
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(body)
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

// latestCheckedAt returns the most recent checkedAt among services, or the Node
// epoch sentinel ("1970-01-01T00:00:00.000Z") when there are no results yet —
// matching Node's lastCheckedAt initialization.
func latestCheckedAt(snap Snapshot) string {
	if len(snap.Services) == 0 {
		return epochSentinel
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
//
// The dashboard is rendered in the site's own design language — **Radial
// Avant-Garde Glass**, the liquid-globe shell (components/radial/*, the
// `--site-*` token contract in app/globals.css). It is a standalone Go-served
// page with no build pipeline, so nothing here can `@import` the real
// stylesheet; what it can do is speak the same contract, and it does:
//
//   • every colour, radius and shadow is a `--site-*` token, quoted from
//     globals.css, in the site's two shipped monochrome palettes — Daylight
//     (`.style-default`, the bare `:root`) and Midnight (`.style-graphite`).
//     The OS preference picks between them unless the visitor chose one with
//     the theme switch.
//   • the ground is the same layered scene: the fixed aurora canvas
//     (`--site-canvas` + the two drift keyframes), the radial ring backdrop,
//     and the faint blob field the glass floats on.
//   • surfaces are the L1 glass tier — translucent tint, hairline rim, an
//     ambient glint falling across the sheet — not flat paper.
//   • the hero IS the liquid globe: the same wireframe cage (six meridians,
//     seven parallels) drawn on ONE canvas through the same projection
//     constants as `components/radial/LiquidGlobe.tsx`, with one pin per
//     service placed by the same Fibonacci distribution and coloured by that
//     service's state. Drag it and it turns.
//
// Two rules from that module carry over verbatim and are the reason the page
// is built this way rather than the obvious way:
//
//   1. **The cage is one canvas, never thirteen transformed elements.** A
//      rotated 3D transform is the slow path for an antialiased elliptical
//      border — measured at exactly half the frame rate on a throttled phone
//      (components/radial/README.md).
//   2. **Nothing sits above a full-viewport `backdrop-filter`.** The globe
//      moves continuously, and Chromium re-blurs such a layer in full whenever
//      anything above it moves. The backdrop here is painted, never blurred.
//
// Everything is inline: one document, no external CSS, JS, font or image. A
// status page is read precisely when the rest of the platform is unreachable,
// so it must not depend on any origin but its own.
//
// The page is fully server-rendered — every chart is inline SVG computed in Go
// — and the script only ENHANCES it: live refresh (it re-fetches this page and
// swaps the `data-live` regions, so the globe never restarts), tooltips,
// filters, preferences and notifications. With scripting off it is still the
// whole page, refreshed by a meta tag.

type statusMeta struct {
	// label is the human word for the state, shown in the pill. Colour lives in
	// CSS, keyed off `data-status` — nothing here emits a hardcoded colour.
	label string
	// headline is the top-of-page verdict when this is the OVERALL state.
	headline string
}

var statusMetaMap = map[Status]statusMeta{
	StatusUp:          {label: "Operational", headline: "All systems operational"},
	StatusDegraded:    {label: "Degraded", headline: "Some systems degraded"},
	StatusDown:        {label: "Down", headline: "Major outage"},
	StatusUnknown:     {label: "Unknown", headline: "Status unknown"},
	StatusMaintenance: {label: "Maintenance", headline: "Scheduled maintenance in progress"},
}

func formatSpan(bucketDur time.Duration, maxBuckets int) string {
	ms := bucketDur.Milliseconds() * int64(maxBuckets)
	h := int(math.Round(float64(ms) / 3_600_000))
	if h < 48 {
		return fmt.Sprintf("%dh", h)
	}
	return fmt.Sprintf("%dd", int(math.Round(float64(h)/24)))
}

// severityLabel is the tooltip word for a bar severity.
var severityLabel = map[string]string{
	"up":       "No issues",
	"blip":     "Brief blip",
	"degraded": "Partial disruption",
	"down":     "Major outage",
	"maint":    "Maintenance",
	"empty":    "No data",
}

var esc = html.EscapeString

func fmtPct(p *float64) string {
	if p == nil {
		return "—"
	}
	if *p >= 100 {
		return "100%"
	}
	// Never round a non-perfect record UP to 100: 99.996% is not 100%.
	v := math.Floor(*p*100) / 100
	return strconv.FormatFloat(v, 'f', 2, 64) + "%"
}

func fmtMs(p *float64) string {
	if p == nil {
		return "—"
	}
	if *p < 10 {
		return strconv.FormatFloat(*p, 'f', 1, 64) + " ms"
	}
	return strconv.FormatFloat(math.Round(*p), 'f', 0, 64) + " ms"
}

func fmtSecs(p *int64) string {
	if p == nil {
		return "—"
	}
	return HumanDuration(time.Duration(*p) * time.Second)
}

func fmtCount(n int) string {
	s := strconv.Itoa(n)
	if n < 10000 {
		return s
	}
	var b strings.Builder
	pre := len(s) % 3
	if pre > 0 {
		b.WriteString(s[:pre])
	}
	for i := pre; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func fmtBytes(n int64) string {
	switch {
	case n <= 0:
		return "—"
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1<<20:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
}

const (
	layoutDateTime = "2 Jan 2006, 15:04 UTC"
	layoutTime     = "15:04:05 UTC"
	layoutDate     = "2 Jan 2006"
)

// timeTag renders a UTC timestamp the script can re-render in local time.
func timeTag(ms int64, layout string) string {
	if ms == 0 {
		return "—"
	}
	kind := "datetime"
	switch layout {
	case layoutTime:
		kind = "time"
	case layoutDate:
		kind = "date"
	}
	t := time.UnixMilli(ms).UTC()
	return fmt.Sprintf(`<time datetime="%s" data-ts="%d" data-fmt="%s">%s</time>`,
		t.Format(isoMillis), ms, kind, esc(t.Format(layout)))
}

// relAgo renders "3m ago" (the script keeps it ticking).
func relAgo(ms, now int64) string {
	if ms == 0 {
		return "never"
	}
	return fmt.Sprintf(`<span data-ago="%d">%s ago</span>`, ms, HumanDuration(time.Duration(now-ms)*time.Millisecond))
}

// ── Strips ──────────────────────────────────────────────────────────────────

// barTip is the tooltip text for one bucket.
func barTip(b Bucket, start time.Time, layout string) string {
	sev := BarSeverity(b)
	parts := []string{start.Format(layout), severityLabel[sev]}
	if t := b.Total(); t > 0 {
		failed := b.Degraded + b.Down
		parts = append(parts, fmt.Sprintf("%s up · %d of %d checks failed", fmtPct(fptr(float64(b.Up)/float64(t)*100)), failed, t))
		if b.Down > 0 && b.Degraded > 0 {
			parts = append(parts, fmt.Sprintf("%d down · %d degraded", b.Down, b.Degraded))
		}
	}
	if b.Maint > 0 {
		parts = append(parts, fmt.Sprintf("%d checks in maintenance", b.Maint))
	}
	if b.LatN > 0 {
		parts = append(parts, fmt.Sprintf("avg %s · p95 ≈ %s", fmtMs(fptr(float64(b.LatSum)/float64(b.LatN))), fmtMs(fptr(histQuantile(b, 0.95)))))
	}
	return strings.Join(parts, " — ")
}

// renderStrip emits one uptime strip, aligned to wall-clock slots: slot i is
// the bucket starting i steps before the current one, so every service's strip
// lines up down the page AND a gap in the prober's own history (a restart, a
// deploy) shows as an empty slot rather than silently compressing time.
func renderStrip(buckets []Bucket, slots int, step time.Duration, now time.Time, class, layout string) string {
	stepMs := step.Milliseconds()
	if stepMs <= 0 || slots <= 0 {
		return ""
	}
	bySlot := make(map[int64]Bucket, len(buckets))
	for _, b := range buckets {
		k := floorTo(b.T, stepMs)
		cur := bySlot[k]
		cur.T = k
		cur.merge(b)
		bySlot[k] = cur
	}
	current := floorTo(now.UnixMilli(), stepMs)
	var sb strings.Builder
	for i := slots - 1; i >= 0; i-- {
		t := current - int64(i)*stepMs
		b, ok := bySlot[t]
		if !ok {
			sb.WriteString(`<span class="` + class + `" data-b="empty"></span>`)
			continue
		}
		sev := BarSeverity(b)
		fmt.Fprintf(&sb, `<span class="%s" data-b="%s" title="%s"></span>`, class, sev, esc(barTip(b, time.UnixMilli(t).UTC(), layout)))
	}
	return sb.String()
}

// tally counts how many services are in each display state.
func tally(svcs []ServiceView) (up, degraded, down, maint, unknown int) {
	for _, s := range svcs {
		switch s.Display {
		case StatusUp:
			up++
		case StatusDegraded:
			degraded++
		case StatusDown:
			down++
		case StatusMaintenance:
			maint++
		default:
			unknown++
		}
	}
	return
}

// renderPins emits one globe pin per service, in snapshot order. The pins carry
// no position: LiquidGlobe's Fibonacci placement is a pure function of the index
// and the count, so the script derives it from the DOM order and there is one
// source of truth for where a pin sits. They are decorative — the cards below
// carry the same information as text — so the list is aria-hidden and each pin
// gets a native `title` for a hovering mouse.
func renderPins(v *View) string {
	var sb strings.Builder
	for _, s := range v.Services {
		m := statusMetaMap[s.Display]
		fmt.Fprintf(&sb,
			`<li class="globe__pin" data-pin data-svc="%s" data-status="%s" title="%s — %s"><span class="globe__pin-dot"></span></li>`,
			esc(s.Slug), s.Display, esc(s.Name), esc(m.label))
	}
	return sb.String()
}

// ── Service cards ───────────────────────────────────────────────────────────

// renderCards emits the grouped service list. A group heading is written
// whenever the group changes; targets arrive in the order cmd/status built them,
// which is already grouped, so this needs no sorting and preserves the author's
// intended ordering within a tier.
func renderCards(v *View) string {
	var sb strings.Builder
	lastGroup := ""
	open := false

	closeSection := func() {
		if open {
			sb.WriteString("</ul></section>")
			open = false
		}
	}

	for i := range v.Services {
		s := &v.Services[i]
		if s.Group != lastGroup || !open {
			closeSection()
			lastGroup = s.Group
			fmt.Fprintf(&sb, `<section class="tier" id="tier-%s" data-tier="%s">`, esc(Slugify(s.Group)), esc(Slugify(s.Group)))
			if s.Group != "" {
				fmt.Fprintf(&sb, `<h2 class="tier__label">%s</h2><button type="button" class="tier__toggle" data-collapse="%s" aria-expanded="true">Hide</button>`,
					esc(s.Group), esc(Slugify(s.Group)))
			}
			sb.WriteString(`<ul class="tier__list">`)
			open = true
		}
		sb.WriteString(renderServiceCard(v, s))
	}
	closeSection()
	return sb.String()
}

func renderServiceCard(v *View, s *ServiceView) string {
	m := statusMetaMap[s.Display]
	latency := "—"
	latencyTitle := s.Detail
	if s.LatencyMs != nil {
		latency = fmt.Sprintf("%d ms", *s.LatencyMs)
	}
	if latencyTitle == "" {
		latencyTitle = m.label
	}
	pctLabel := "no data"
	if s.UptimePct != nil {
		pctLabel = fmt.Sprintf("%s uptime · %s", fmtPct(s.UptimePct), v.Span)
	}
	dayPct := "no data"
	if len(s.Windows) >= 5 && s.Windows[4].UptimePct != nil {
		dayPct = fmt.Sprintf("%s uptime · %dd", fmtPct(s.Windows[4].UptimePct), v.MaxDays)
	}
	descHTML := ""
	if s.Description != "" {
		descHTML = fmt.Sprintf(`<p class="svc__desc">%s</p>`, esc(s.Description))
	}

	// Chips: the facts worth surfacing without opening the card.
	var chips []string
	if s.InMaintenance {
		chips = append(chips, `<span class="chip" data-status="maintenance">In maintenance</span>`)
	}
	if s.OpenIncident != "" {
		chips = append(chips, fmt.Sprintf(`<a class="chip" data-status="degraded" href="/incidents/%s">Active incident</a>`, esc(s.OpenIncident)))
	}
	if s.Flapping {
		chips = append(chips, fmt.Sprintf(`<span class="chip" data-status="degraded" title="%d state changes in the last hour">Flapping</span>`, s.Changes1h))
	}
	if s.TLSDaysLeft != nil && *s.TLSDaysLeft < 14 {
		chips = append(chips, fmt.Sprintf(`<span class="chip" data-status="down">TLS expires in %dd</span>`, *s.TLSDaysLeft))
	}
	if s.Counters.ConsecFail > 0 && s.Display != StatusMaintenance && s.Status != StatusUp {
		chips = append(chips, fmt.Sprintf(`<span class="chip" data-status="%s">Failing for %d checks</span>`, s.Status, s.Counters.ConsecFail))
	}
	chipHTML := ""
	if len(chips) > 0 {
		chipHTML = `<div class="svc__chips">` + strings.Join(chips, "") + `</div>`
	}

	uptimeNum := -1.0
	if len(s.Windows) > 1 && s.Windows[1].UptimePct != nil {
		uptimeNum = *s.Windows[1].UptimePct
	}
	latNum := -1.0
	if s.Latency1h.Avg != nil {
		latNum = *s.Latency1h.Avg
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, `<li class="svc glass-fill" data-status="%s" id="svc-%s" data-svc="%s" data-name="%s" data-group="%s" data-uptime="%.4f" data-latency="%.1f" data-issue="%t">
<div class="svc__head">
<span class="svc__dot" aria-hidden="true"></span>
<div class="svc__id">
<h3 class="svc__name"><a class="svc__anchor" href="#svc-%s">%s</a></h3>
%s
</div>
<div class="svc__meta">
%s
<span class="svc__latency" title="%s">%s</span>
<span class="svc__pill">%s</span>
</div>
</div>
%s
<div class="svc__bars" data-range="hours" role="img" aria-label="Uptime history for the last %s: %s">%s</div>
<div class="svc__bars" data-range="days" role="img" aria-label="Uptime history for the last %d days: %s">%s</div>
<div class="svc__legend" data-range="hours"><span>%s ago</span><span class="svc__uptime">%s</span><span>now</span></div>
<div class="svc__legend" data-range="days"><span>%dd ago</span><span class="svc__uptime">%s</span><span>today</span></div>
`,
		s.Display, esc(s.Slug), esc(s.Slug), esc(strings.ToLower(s.Name)), esc(s.Group), uptimeNum, latNum,
		s.Display != StatusUp,
		esc(s.Slug), esc(s.Name), descHTML,
		renderSparkline(s.Recent, 60),
		esc(latencyTitle), latency, esc(m.label),
		chipHTML,
		v.Span, esc(pctLabel), renderStrip(s.Hourly, v.MaxBuckets, v.BucketDur, v.GeneratedAt, "bar", "Mon 2 Jan 15:04 UTC"),
		v.MaxDays, esc(dayPct), renderStrip(s.Daily, v.MaxDays, 24*time.Hour, v.GeneratedAt, "bar bar--day", "Mon 2 Jan 2006"),
		v.Span, esc(pctLabel),
		v.MaxDays, esc(dayPct),
	)

	// The at-a-glance row.
	sb.WriteString(`<dl class="svc__stats">`)
	if len(s.Windows) >= 4 {
		for _, win := range s.Windows[1:4] {
			fmt.Fprintf(&sb, `<div><dt>%s</dt><dd>%s</dd></div>`, esc(win.Label), fmtPct(win.UptimePct))
		}
	}
	fmt.Fprintf(&sb, `<div><dt>p95 · 1h</dt><dd>%s</dd></div>`, fmtMs(s.Latency1h.P95))
	apdex := "—"
	if s.Apdex != nil {
		apdex = strconv.FormatFloat(*s.Apdex, 'f', 2, 64)
	}
	fmt.Fprintf(&sb, `<div><dt title="Apdex, T = %d ms">Apdex</dt><dd>%s</dd></div>`, s.ApdexTMs, apdex)
	trend := "—"
	if s.LatencyTrendPct != nil {
		trend = fmt.Sprintf("%+.0f%%", *s.LatencyTrendPct)
	}
	fmt.Fprintf(&sb, `<div><dt title="Last hour's mean latency against the 24h mean">Latency trend</dt><dd>%s</dd></div>`, trend)
	sb.WriteString(`</dl>`)

	sb.WriteString(renderServiceDetails(v, s))
	sb.WriteString(`</li>`)
	return sb.String()
}

// renderServiceDetails is the expandable panel: native <details>, so it opens
// without a script and is announced as a disclosure by every screen reader.
func renderServiceDetails(v *View, s *ServiceView) string {
	now := v.GeneratedAt.UnixMilli()
	var sb strings.Builder
	fmt.Fprintf(&sb, `<details class="svc__more" data-detail="%s"><summary>Details, charts &amp; recent checks</summary><div class="detail">`, esc(s.Slug))

	// Uptime by window.
	sb.WriteString(`<section class="detail__block detail__block--wide"><h4>Uptime by window</h4><table class="dt"><thead><tr><th>Window</th><th>Uptime</th><th>Avail.</th><th>Checks</th><th>Failed</th><th>Downtime</th></tr></thead><tbody>`)
	for _, win := range s.Windows {
		partial := ""
		if win.Partial && win.Checks > 0 {
			partial = ` <span class="dim" title="Less history exists than this window covers">(partial)</span>`
		}
		fmt.Fprintf(&sb, `<tr><td>%s%s</td><td>%s</td><td>%s</td><td>%s</td><td>%d</td><td>%s</td></tr>`,
			esc(win.Label), partial, fmtPct(win.UptimePct), fmtPct(win.AvailabilityPct), fmtCount(win.Checks), win.Failed,
			HumanDuration(time.Duration(win.DowntimeSec)*time.Second))
	}
	sb.WriteString(`</tbody></table>`)
	if s.UptimeDeltaPct != nil {
		fmt.Fprintf(&sb, `<p class="dim">Last 24h vs the 24h before: %+.2f percentage points.</p>`, *s.UptimeDeltaPct)
	}
	sb.WriteString(`</section>`)

	// Latency.
	sb.WriteString(`<section class="detail__block detail__block--wide"><h4>Response time</h4><table class="dt"><thead><tr><th></th><th>avg</th><th>p50</th><th>p95</th><th>p99</th><th>min</th><th>max</th><th>n</th></tr></thead><tbody>`)
	for _, ls := range []LatencyStats{s.Latency1h, s.Latency24h} {
		label := ls.Window
		if ls.Estimated {
			label += ` <span class="dim" title="Percentiles estimated from histogram bins">≈</span>`
		}
		fmt.Fprintf(&sb, `<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			label, fmtMs(ls.Avg), fmtMs(ls.P50), fmtMs(ls.P95), fmtMs(ls.P99), fmtMs(ls.Min), fmtMs(ls.Max), fmtCount(ls.Samples))
	}
	sb.WriteString(`</tbody></table>`)
	budget := ""
	if s.BudgetMs > 0 {
		budget = fmt.Sprintf(" · degraded past %d ms", s.BudgetMs)
	}
	fmt.Fprintf(&sb, `<p class="dim">Apdex threshold T = %d ms%s.</p>`, s.ApdexTMs, budget)
	sb.WriteString(renderLatencyChart(s.Hourly, v.BucketDur, v.GeneratedAt, 48, s.BudgetMs))
	sb.WriteString(renderHistogram(s.Hourly, v.BucketDur, v.GeneratedAt))
	sb.WriteString(`</section>`)

	// Last request anatomy.
	if s.Probe.Kind == "http" {
		sb.WriteString(`<section class="detail__block"><h4>Last request</h4>`)
		sb.WriteString(renderPhases(s.Probe.Phases))
		sb.WriteString(`<dl class="kv">`)
		kv := func(k, val string) { fmt.Fprintf(&sb, `<div><dt>%s</dt><dd>%s</dd></div>`, k, val) }
		code := "—"
		if s.Probe.Code > 0 {
			code = strconv.Itoa(s.Probe.Code)
		}
		kv("Status code", esc(code))
		kv("Protocol", esc(orDash(s.Probe.Proto)))
		kv("Size", fmtBytes(s.Probe.Bytes))
		kv("Content type", esc(orDash(s.Probe.ContentType)))
		if t := s.Probe.TLS; t != nil {
			kv("TLS", esc(orDash(t.Version)))
			kv("Certificate", fmt.Sprintf("%s · %s", esc(orDash(t.Subject)), esc(orDash(t.Issuer))))
			days := "—"
			if s.TLSDaysLeft != nil {
				days = fmt.Sprintf("%d days (%s)", *s.TLSDaysLeft, timeTag(t.NotAfter, layoutDate))
			}
			kv("Expires in", days)
		}
		sb.WriteString(`</dl></section>`)
	}

	// Reliability.
	c := s.Counters
	sb.WriteString(`<section class="detail__block"><h4>Reliability</h4><dl class="kv">`)
	kv := func(k, val string) { fmt.Fprintf(&sb, `<div><dt>%s</dt><dd>%s</dd></div>`, k, val) }
	streak := "—"
	switch {
	case c.ConsecUp > 0:
		streak = fmt.Sprintf("%s good checks (since %s)", fmtCount(c.ConsecUp), timeTag(c.UpStreakStart, layoutDateTime))
	case c.ConsecFail > 0:
		streak = fmt.Sprintf("%d failed checks (since %s)", c.ConsecFail, timeTag(c.FailStreakStart, layoutDateTime))
	}
	kv("Current streak", streak)
	kv("Last up", relAgo(c.LastUpAt, now))
	lastFail := relAgo(c.LastFailAt, now)
	if c.LastFailText != "" {
		lastFail += ` <span class="dim">· ` + esc(c.LastFailText) + `</span>`
	}
	kv("Last failure", lastFail)
	kv("Last state change", relAgo(c.LastChangeAt, now))
	kv("State changes · 1h", strconv.Itoa(s.Changes1h))
	kv("Incidents · 30d", strconv.Itoa(s.Incidents30d))
	kv("MTTR · 30d", fmtSecs(s.MTTRSec))
	kv("MTBF · 30d", fmtSecs(s.MTBFSec))
	kv("Blips", fmtCount(c.Blips))
	kv("Checks recorded", fmtCount(c.Checks))
	if c.FirstSeenAt > 0 {
		kv("Monitored since", timeTag(c.FirstSeenAt, layoutDate))
	}
	sb.WriteString(`</dl>`)
	sb.WriteString(renderDistribution("Responses by status class", c.Codes, []string{"2xx", "3xx", "4xx", "5xx", "none"}))
	sb.WriteString(renderCategories(c.Errors))
	sb.WriteString(`</section>`)

	// Recent checks.
	sb.WriteString(`<section class="detail__block detail__block--wide"><h4>Recent checks</h4>`)
	sb.WriteString(renderRecent(s.Recent, 20))
	sb.WriteString(`</section>`)

	fmt.Fprintf(&sb, `<p class="detail__links"><a href="/api/services/%[1]s">JSON</a> · <a href="/api/history?service=%[1]s&amp;range=daily">Daily history</a> · <a href="/badge/%[1]s.svg">Badge</a> · <a href="/api/incidents?component=%[1]s">Incidents</a> · <button type="button" class="linkish" data-copy-link="svc-%[1]s">Copy link</button></p>`, esc(s.Slug))
	sb.WriteString(`</div></details>`)
	return sb.String()
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

// renderRecent lists the newest raw checks.
func renderRecent(samples []Sample, n int) string {
	if len(samples) == 0 {
		return `<p class="dim">No checks recorded yet.</p>`
	}
	var sb strings.Builder
	sb.WriteString(`<ol class="checks">`)
	for i := len(samples) - 1; i >= 0 && i >= len(samples)-n; i-- {
		s := samples[i]
		st := s.S
		if s.M {
			st = StatusMaintenance
		}
		lat := "—"
		if s.L != nil {
			lat = fmt.Sprintf("%d ms", *s.L)
		}
		var info []string
		if s.C > 0 {
			info = append(info, "HTTP "+strconv.Itoa(s.C))
		}
		if s.E != "" {
			info = append(info, CategoryLabel(s.E))
		}
		if s.D != "" && !strings.HasPrefix(s.D, "HTTP ") {
			info = append(info, s.D)
		}
		fmt.Fprintf(&sb, `<li data-status="%s"><span class="checks__dot" aria-hidden="true"></span>%s<span class="checks__st">%s</span><span class="checks__lat">%s</span><span class="checks__info">%s</span></li>`,
			st, timeTag(s.T, layoutTime), esc(statusMetaMap[st].label), lat, esc(strings.Join(info, " · ")))
	}
	sb.WriteString(`</ol>`)
	return sb.String()
}

// renderDistribution draws a stacked bar of counts by key.
func renderDistribution(title string, counts map[string]int, order []string) string {
	total := 0
	for _, k := range order {
		total += counts[k]
	}
	if total == 0 {
		return ""
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, `<p class="dist__title">%s</p><div class="dist" role="img" aria-label="%s">`, esc(title), esc(title))
	var legend strings.Builder
	for _, k := range order {
		n := counts[k]
		if n == 0 {
			continue
		}
		pct := float64(n) / float64(total) * 100
		fmt.Fprintf(&sb, `<span class="dist__seg" data-k="%s" style="width:%.3f%%" title="%s: %s (%.2f%%)"></span>`, esc(k), pct, esc(k), fmtCount(n), pct)
		fmt.Fprintf(&legend, `<li><span class="dist__key" data-k="%s"></span>%s <b>%s</b></li>`, esc(k), esc(k), fmtCount(n))
	}
	sb.WriteString(`</div><ul class="dist__legend">` + legend.String() + `</ul>`)
	return sb.String()
}

// renderCategories lists failure categories, most frequent first.
func renderCategories(errs map[string]int) string {
	if len(errs) == 0 {
		return `<p class="dim">No failures recorded.</p>`
	}
	keys := sortedKeys(errs)
	sort.SliceStable(keys, func(i, j int) bool { return errs[keys[i]] > errs[keys[j]] })
	top := errs[keys[0]]
	var sb strings.Builder
	sb.WriteString(`<p class="dist__title">Failures by cause</p><ul class="cats">`)
	for _, k := range keys {
		fmt.Fprintf(&sb, `<li><span class="cats__label">%s</span><span class="cats__bar"><span style="width:%.1f%%"></span></span><span class="cats__n">%s</span></li>`,
			esc(CategoryLabel(k)), float64(errs[k])/float64(top)*100, fmtCount(errs[k]))
	}
	sb.WriteString(`</ul>`)
	return sb.String()
}

// ── Page sections ───────────────────────────────────────────────────────────

func renderAnnouncements(v *View) string {
	var sb strings.Builder
	for _, a := range v.Announcements {
		link := ""
		if a.Link != "" {
			link = fmt.Sprintf(` <a href="%s">Learn more</a>`, esc(a.Link))
		}
		fmt.Fprintf(&sb, `<div class="banner" data-level="%s" role="status" data-announcement="%s"><p>%s%s</p><button type="button" class="banner__close" data-dismiss="%s" aria-label="Dismiss">×</button></div>`,
			esc(a.Level), esc(a.ID), esc(a.Message), link, esc(a.ID))
	}
	for _, inc := range v.Ongoing {
		latest := ""
		if len(inc.Updates) > 0 {
			latest = inc.Updates[len(inc.Updates)-1].Body
		}
		fmt.Fprintf(&sb, `<div class="banner" data-level="%s" role="alert"><p><b>%s</b> · %s · started %s — %s <a href="/incidents/%s">Follow this incident</a></p></div>`,
			impactLevel(inc.Impact), esc(inc.Title), esc(titleCase(inc.State)), relAgo(inc.StartedAt, v.GeneratedAt.UnixMilli()), esc(truncate(latest, 220)), esc(inc.ID))
	}
	for _, m := range v.Maintenance {
		if m.State(v.GeneratedAt) == MaintInProgress {
			fmt.Fprintf(&sb, `<div class="banner" data-level="maintenance" role="status"><p><b>Maintenance in progress:</b> %s — until %s. <a href="#maintenance">Details</a></p></div>`,
				esc(m.Title), timeTag(m.EndsAt, layoutDateTime))
		}
	}
	return sb.String()
}

func impactLevel(impact string) string {
	switch impact {
	case ImpactCritical, ImpactMajor:
		return "critical"
	case ImpactMinor:
		return "warning"
	}
	return "info"
}

// pctState colours an uptime figure against the SLO target.
func pctState(p *float64, target float64) string {
	switch {
	case p == nil:
		return "unknown"
	case *p >= target*100:
		return "up"
	case *p >= 99:
		return "degraded"
	}
	return "down"
}

func boolState(ok bool) string {
	if ok {
		return "up"
	}
	return "degraded"
}

func renderKPIs(v *View) string {
	k := v.KPIs
	var sb strings.Builder
	sb.WriteString(`<section class="tier" aria-labelledby="kpi-h"><h2 class="tier__label" id="kpi-h">At a glance</h2><ul class="kpis">`)
	tile := func(label, value, sub, state, tip string) {
		stateAttr := ""
		if state != "" {
			stateAttr = ` data-status="` + state + `"`
		}
		fmt.Fprintf(&sb, `<li class="kpi glass-fill"%s title="%s"><span class="kpi__label">%s</span><span class="kpi__value">%s</span><span class="kpi__sub">%s</span></li>`,
			stateAttr, esc(tip), esc(label), value, sub)
	}
	for _, w := range k.Windows[1:] {
		tile("Uptime · "+w.Label, fmtPct(w.UptimePct), fmt.Sprintf("%s checks", fmtCount(w.Checks)), pctState(w.UptimePct, v.SLO.Target),
			"Share of all checks across every service that were up over the last "+w.Label)
	}
	tile("Healthy services", fmt.Sprintf("%d / %d", k.Healthy, k.Total), fmt.Sprintf("%d flapping", k.Flapping), boolState(k.Healthy == k.Total), "Services currently operational")
	tile("Response time · 1h", fmtMs(k.AvgLatency1h), "p95 "+fmtMs(k.P95Latency1h), "", "Mean and 95th percentile of every measured check in the last hour")
	tile("Incidents · 30d", strconv.Itoa(k.Incidents30d), fmt.Sprintf("%d open · %d in 7d", k.OpenIncidents, k.Incidents7d), boolState(k.OpenIncidents == 0), "Automatic and declared incidents in the last 30 days")
	tile("MTTR · 30d", fmtSecs(k.MTTRSec), "mean time to recovery", "", "Mean duration of resolved incidents in the last 30 days")
	tile("Downtime · 30d", HumanDuration(time.Duration(k.Downtime30dSec)*time.Second), "failed checks × interval", "", "Estimated service-time spent failing, summed across all services")
	tile("Error budget", fmtPct(fptr(v.SLO.WorstRemaining*100)), "lowest remaining · "+esc(v.SLO.BudgetWindow), pctBudgetState(v.SLO), "The least healthy service's unspent error budget")
	tile("Checks recorded", fmtCount(k.ChecksTotal), fmt.Sprintf("%s in 24h", fmtCount(k.Checks24h)), "", "Every probe this page has recorded")
	tile("Blips", fmtCount(k.Blips), "failures too short to be incidents", "", "Failure streaks shorter than the incident threshold")
	if k.CertsExpiring > 0 {
		tile("Certificates", strconv.Itoa(k.CertsExpiring), "expiring within 14 days", "down", "TLS certificates close to expiry")
	}
	sb.WriteString(`</ul></section>`)
	return sb.String()
}

func pctBudgetState(r SLOReport) string {
	switch {
	case r.Page || r.WorstRemaining <= 0:
		return "down"
	case r.WorstRemaining < 0.25:
		return "degraded"
	}
	return "up"
}

func renderGroups(v *View) string {
	named := 0
	for _, g := range v.Groups {
		if g.Name != "" {
			named++
		}
	}
	if named == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString(`<ul class="groups" aria-label="Status by tier">`)
	for _, g := range v.Groups {
		if g.Name == "" {
			continue
		}
		fmt.Fprintf(&sb, `<li><a class="group glass-fill" data-status="%s" href="#tier-%s"><span class="svc__dot" aria-hidden="true"></span><span class="group__name">%s</span><span class="group__n">%d/%d</span><span class="group__up">%s</span></a></li>`,
			g.Display, esc(g.Slug), esc(g.Name), g.Healthy, g.Services, fmtPct(g.Uptime24h))
	}
	sb.WriteString(`</ul>`)
	return sb.String()
}

func renderToolbar(v *View) string {
	return `<div class="toolbar glass-fill" role="toolbar" aria-label="Filter and arrange services">
<label class="toolbar__search"><span class="sr-only">Search services</span><input type="search" placeholder="Search services…" data-search autocomplete="off" /></label>
<div class="seg" role="group" aria-label="Show">
<button type="button" data-filter="all" aria-pressed="true">All</button>
<button type="button" data-filter="issues" aria-pressed="false">Issues</button>
</div>
<div class="seg" role="group" aria-label="History range">
<button type="button" data-range-btn="hours" aria-pressed="true">` + esc(v.Span) + `</button>
<button type="button" data-range-btn="days" aria-pressed="false">` + strconv.Itoa(v.MaxDays) + `d</button>
</div>
<label class="toolbar__sort"><span class="sr-only">Sort</span><select data-sort>
<option value="default">Default order</option>
<option value="name">Name</option>
<option value="uptime">Lowest uptime</option>
<option value="latency">Slowest</option>
<option value="status">Worst status</option>
</select></label>
<button type="button" class="btn" data-expand-all>Expand all</button>
</div>`
}

func renderIncidents(v *View) string {
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="incidents" aria-labelledby="inc-h"><h2 class="tier__label" id="inc-h">Incidents</h2>`)
	sb.WriteString(`<div class="seg seg--small" role="group" aria-label="Filter incidents"><button type="button" data-inc-filter="all" aria-pressed="true">All</button><button type="button" data-inc-filter="open" aria-pressed="false">Ongoing</button><button type="button" data-inc-filter="resolved" aria-pressed="false">Resolved</button><button type="button" data-inc-filter="auto" aria-pressed="false">Automatic</button><button type="button" data-inc-filter="manual" aria-pressed="false">Declared</button></div>`)
	if len(v.Incidents) == 0 {
		sb.WriteString(`<p class="empty glass-fill">No incidents recorded. Failure streaks shorter than the incident threshold are counted as blips on each service.</p>`)
	} else {
		sb.WriteString(`<ol class="incidents">`)
		for i, inc := range v.Incidents {
			if i >= 15 {
				break
			}
			sb.WriteString(renderIncidentRow(inc, v.GeneratedAt))
		}
		sb.WriteString(`</ol>`)
	}
	sb.WriteString(`<p class="more"><a href="/history">Full incident history →</a> · <a href="/report">Monthly uptime report →</a></p></section>`)
	return sb.String()
}

func renderIncidentRow(inc Incident, now time.Time) string {
	state := "open"
	sofar := " so far"
	if inc.Resolved() {
		state, sofar = "resolved", ""
	}
	latest := ""
	if len(inc.Updates) > 0 {
		latest = inc.Updates[len(inc.Updates)-1].Body
	}
	comps := ""
	if len(inc.Components) > 0 {
		comps = ` · <span class="inc__comps">` + esc(strings.Join(inc.Components, ", ")) + `</span>`
	}
	return fmt.Sprintf(`<li class="inc glass-fill" data-impact="%s" data-state="%s" data-kind="%s"><div class="inc__head"><span class="impact" data-impact="%s">%s</span><a class="inc__title" href="/incidents/%s">%s</a><span class="inc__state">%s</span></div><p class="inc__meta">%s · lasted %s%s%s</p><p class="inc__body">%s</p></li>`,
		esc(inc.Impact), state, esc(inc.Kind), esc(inc.Impact), esc(titleCase(inc.Impact)), esc(inc.ID), esc(inc.Title), esc(titleCase(inc.State)),
		timeTag(inc.StartedAt, layoutDateTime), HumanDuration(inc.Duration(now)), sofar,
		comps, esc(truncate(latest, 300)))
}

func renderMaintenance(v *View) string {
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="maintenance" aria-labelledby="mt-h"><h2 class="tier__label" id="mt-h">Scheduled maintenance</h2>`)
	if len(v.Maintenance) == 0 {
		sb.WriteString(`<p class="empty glass-fill">No maintenance scheduled.</p>`)
	} else {
		sb.WriteString(`<ol class="incidents">`)
		nowMs := v.GeneratedAt.UnixMilli()
		for _, m := range v.Maintenance {
			st := m.State(v.GeneratedAt)
			comps := "All services"
			if len(m.Components) > 0 {
				comps = strings.Join(m.Components, ", ")
			}
			countdown := ""
			switch st {
			case MaintScheduled:
				countdown = fmt.Sprintf(` · <span data-countdown="%d" data-prefix="starts in">starts in %s</span>`, m.StartsAt, HumanDuration(time.Duration(m.StartsAt-nowMs)*time.Millisecond))
			case MaintInProgress:
				countdown = fmt.Sprintf(` · <span data-countdown="%d" data-prefix="ends in">ends in %s</span>`, m.EndsAt, HumanDuration(time.Duration(m.EndsAt-nowMs)*time.Millisecond))
			}
			fmt.Fprintf(&sb, `<li class="inc glass-fill" data-status="maintenance"><div class="inc__head"><span class="impact" data-impact="maintenance">%s</span><span class="inc__title">%s</span></div><p class="inc__meta">%s → %s (%s)%s · %s</p>`,
				esc(titleCase(strings.ReplaceAll(st, "_", " "))), esc(m.Title), timeTag(m.StartsAt, layoutDateTime), timeTag(m.EndsAt, layoutDateTime),
				HumanDuration(time.Duration(m.EndsAt-m.StartsAt)*time.Millisecond), countdown, esc(comps))
			if m.Description != "" {
				fmt.Fprintf(&sb, `<p class="inc__body">%s</p>`, esc(m.Description))
			}
			sb.WriteString(`</li>`)
		}
		sb.WriteString(`</ol>`)
	}
	sb.WriteString(`<p class="more"><a href="/maintenance.ics">Add maintenance to your calendar (iCal) →</a></p></section>`)
	return sb.String()
}

// budgetStatus maps a remaining-budget fraction onto the page's existing status
// vocabulary, so the error-budget section inherits the same colours as
// everything else instead of inventing a second language for the same idea.
//
// The bands are deliberately pessimistic: a quarter of the budget left is
// already a bad month, and reporting that in the same green as "untouched" is
// how a budget gets spent without anyone noticing. Paging overrides the band —
// burning fast on a full budget is still the thing you were paged for.
func budgetStatus(s ServiceSLO) Status {
	switch {
	case s.Page || s.BudgetRemaining <= 0:
		return StatusDown
	case s.BudgetRemaining < 0.25:
		return StatusDegraded
	default:
		return StatusUp
	}
}

// renderBudget emits the error-budget section (E14): one row per service with
// the fraction of its budget still unspent and the two burn-rate windows.
func renderBudget(slo SLOReport, interval time.Duration) string {
	if len(slo.Services) == 0 {
		return ""
	}

	headline := fmt.Sprintf("%.1f%% target · %s budget window · pages when the %s and %s burn rates both exceed %.1f× and %.1f×",
		slo.Target*100, slo.BudgetWindow, slo.FastWindow, slo.SlowWindow,
		FastBurnThreshold, SlowBurnThreshold)

	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="budget"><h2 class="tier__label">Error budget</h2>`)
	sb.WriteString(fmt.Sprintf(`<p class="tier__note">%s</p>`, esc(headline)))
	sb.WriteString(`<ul class="tier__list">`)

	for _, s := range slo.Services {
		st := budgetStatus(s)
		remaining := fmt.Sprintf("%.1f%%", s.BudgetRemaining*100)

		// "no data" rather than "0.0×": a window the prober has not filled yet
		// is unknown, and rendering unknown as a number invites someone to act
		// on it. Matches burnRate(), which returns 0 for an empty window
		// precisely so nothing pages on absence.
		burn := "no data"
		if s.SlowSamples > 0 {
			burn = fmt.Sprintf("%.1f× / %.1f×", s.BurnFast, s.BurnSlow)
		}

		// The budget in the unit people plan with: how much failure the
		// remaining fraction still allows at the window's check count.
		allowance := ""
		if s.BudgetSamples > 0 {
			allowed := float64(s.BudgetSamples) * slo.ErrorBudget * s.BudgetRemaining * interval.Seconds()
			allowance = " · ≈" + HumanDuration(time.Duration(allowed)*time.Second) + " of failure left"
		}

		pill := "Within budget"
		switch st {
		case StatusDown:
			if s.Page {
				pill = "Paging"
			} else {
				pill = "Exhausted"
			}
		case StatusDegraded:
			pill = "Running low"
		}

		sb.WriteString(fmt.Sprintf(`<li class="svc svc--budget glass-fill" data-status="%s">
<div class="svc__head">
<span class="svc__dot" aria-hidden="true"></span>
<div class="svc__id">
<h3 class="svc__name">%s</h3>
<p class="svc__desc">%s of the %s error budget remaining%s</p>
</div>
<div class="svc__meta">
<span class="svc__latency" title="Burn rate over %s / %s">%s</span>
<span class="svc__pill">%s</span>
</div>
</div>
<div class="meter" role="img" aria-label="%s remaining"><span style="width:%.1f%%"></span></div>
</li>`,
			st,
			esc(s.Name),
			esc(remaining),
			esc(slo.BudgetWindow),
			esc(allowance),
			esc(slo.FastWindow),
			esc(slo.SlowWindow),
			esc(burn),
			esc(pill),
			esc(remaining), s.BudgetRemaining*100,
		))
	}

	sb.WriteString(`</ul></section>`)
	return sb.String()
}

func renderProber(v *View) string {
	s := v.Self
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="prober" aria-labelledby="pr-h"><h2 class="tier__label" id="pr-h">Monitoring health</h2><p class="tier__note">The prober watching everything above — so a quiet page can be told apart from a stalled one.</p><dl class="kv kv--grid glass-fill">`)
	kv := func(k, val string) { fmt.Fprintf(&sb, `<div><dt>%s</dt><dd>%s</dd></div>`, k, val) }
	kv("Prober uptime", HumanDuration(time.Duration(s.UptimeSec)*time.Second))
	kv("Probe cycles", fmtCount(int(s.Cycles)))
	kv("Interval / timeout", fmt.Sprintf("%gs / %gs", s.IntervalSec, s.TimeoutSec))
	kv("Last cycle", fmt.Sprintf("%.1f ms", s.LastCycleMs))
	kv("Mean cycle", fmt.Sprintf("%.1f ms", s.AvgCycleMs))
	kv("Targets", strconv.Itoa(s.Targets))
	kv("Retention", fmt.Sprintf("%d × %gh · %dd · %d raw checks", s.MaxBuckets, s.BucketSec/3600, s.MaxDays, s.RecentCap))
	persist := "off"
	if s.Persistence {
		persist = "on"
		if s.LastSaveAt != "" {
			if t, err := time.Parse(isoMillis, s.LastSaveAt); err == nil {
				persist += " · saved " + relAgo(t.UnixMilli(), v.GeneratedAt.UnixMilli())
			}
		}
	}
	if s.LastSaveErr != "" {
		persist += ` · <span class="warn">` + esc(s.LastSaveErr) + `</span>`
	}
	kv("Persistence", persist)
	kv("Webhooks", strconv.Itoa(s.Notifiers))
	kv("Heap / goroutines", fmt.Sprintf("%.1f MB / %d", s.HeapMB, s.Goroutines))
	kv("Runtime", esc(s.GoVersion))
	sb.WriteString(`</dl></section>`)
	return sb.String()
}

func renderDevelopers(v *View) string {
	base := "https://status.rmhstudios.com"
	endpoints := []struct{ path, desc string }{
		{"/api/status", "Node-compatible current status"},
		{"/api/dashboard", "Everything on this page, as JSON"},
		{"/api/services/{slug}", "One service: windows, latency, probe detail, history"},
		{"/api/uptime", "Multi-window uptime for every service"},
		{"/api/history?range=hourly|daily|recent", "Bucket history (add &service=slug)"},
		{"/api/history.csv?range=daily", "History as CSV"},
		{"/api/incidents", "Incidents (?status=open|resolved, ?component=)"},
		{"/api/maintenance", "Maintenance windows"},
		{"/api/slo", "Error budgets and burn rates"},
		{"/api/v2/summary.json", "Statuspage-compatible summary (also status, components, incidents, scheduled-maintenances)"},
		{"/metrics", "Prometheus exposition"},
		{"/feed.rss", "Incident and maintenance feed (also /feed.atom)"},
		{"/maintenance.ics", "Maintenance calendar"},
	}
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="developers" aria-labelledby="dev-h"><h2 class="tier__label" id="dev-h">Subscribe &amp; integrate</h2><div class="dev glass-fill"><div class="dev__col"><h4>Endpoints</h4><ul class="endpoints">`)
	for _, e := range endpoints {
		link := strings.SplitN(e.path, "?", 2)[0]
		if strings.Contains(link, "{") {
			fmt.Fprintf(&sb, `<li><code>%s</code><span>%s</span></li>`, esc(e.path), esc(e.desc))
			continue
		}
		fmt.Fprintf(&sb, `<li><a href="%s"><code>%s</code></a><span>%s</span></li>`, esc(link), esc(e.path), esc(e.desc))
	}
	sb.WriteString(`</ul></div><div class="dev__col"><h4>Badges</h4><p class="badges"><img src="/badge.svg" alt="Overall status badge" height="20" /> <img src="/badge.svg?style=uptime&amp;window=30d" alt="30-day uptime badge" height="20" /></p>`)
	snippets := []struct{ label, code string }{
		{"Markdown badge", fmt.Sprintf("[![Status](%s/badge.svg)](%s)", base, base)},
		{"Per-service badge", fmt.Sprintf("%s/badge/website.svg?style=uptime&window=7d", base)},
		{"Embed widget", fmt.Sprintf(`<iframe src="%s/embed" width="320" height="64" style="border:0" title="RMH Studios status"></iframe>`, base)},
		{"Script embed", fmt.Sprintf(`<script src="%s/embed.js" async></script>`, base)},
	}
	for i, s := range snippets {
		fmt.Fprintf(&sb, `<div class="snippet"><span>%s</span><code id="snip-%d">%s</code><button type="button" class="btn btn--small" data-copy="snip-%d">Copy</button></div>`, esc(s.label), i, esc(s.code), i)
	}
	sb.WriteString(`<h4>Get notified</h4><p class="dim">Subscribe to <a href="/feed.rss">RSS</a> or <a href="/feed.atom">Atom</a>, add <a href="/maintenance.ics">the maintenance calendar</a>, or turn on <button type="button" class="linkish" data-notify>browser notifications</button> for this tab.</p></div></div></section>`)
	return sb.String()
}

// renderHTML renders the full dashboard document.
func renderHTML(v *View) string {
	headline := v.Headline
	if headline == "" {
		headline = statusMetaMap[v.Display].headline
	}
	checkedAt, hasChecked := prettyCheckedAt(v.CheckedAt)
	up, degraded, down, maint, unknown := tally(v.Services)
	total := len(v.Services)

	lede := "No services are configured."
	if total > 0 {
		if hasChecked {
			lede = fmt.Sprintf("%d of %d services responding · last checked %s", up, total, checkedAt)
		} else {
			lede = fmt.Sprintf("%d services registered · first check pending", total)
		}
	}

	// The tallies are only worth the space they take when they say something the
	// headline does not, so a state with nothing in it is left out entirely.
	var tallies strings.Builder
	for _, c := range []struct {
		state Status
		n     int
	}{
		{StatusUp, up}, {StatusDegraded, degraded}, {StatusDown, down}, {StatusMaintenance, maint}, {StatusUnknown, unknown},
	} {
		if c.n == 0 {
			continue
		}
		tallies.WriteString(fmt.Sprintf(
			`<li class="tally" data-status="%s"><span class="tally__n">%d</span><span class="tally__label">%s</span></li>`,
			c.state, c.n, esc(statusMetaMap[c.state].label),
		))
	}

	timeHTML := "never"
	if hasChecked {
		timeHTML = fmt.Sprintf(`<time datetime="%s">%s</time>`, esc(v.CheckedAt), esc(checkedAt))
	}

	var b strings.Builder
	b.WriteString(`<!doctype html>
<html lang="en" data-status="` + string(v.Display) + `">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="description" content="Live health, uptime history, incidents and maintenance for every RMH Studios service." />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="` + faviconDataURI + `" data-favicon />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="alternate" type="application/rss+xml" title="RMH Studios incident history (RSS)" href="/feed.rss" />
<link rel="alternate" type="application/atom+xml" title="RMH Studios incident history (Atom)" href="/feed.atom" />
<title>` + esc(headline) + ` — RMH Studios status</title>
<noscript><meta http-equiv="refresh" content="30" /></noscript>
<script>` + themeBootJS + `</script>
<style>` + dashboardCSS + `</style>
</head>
<body data-generated="` + strconv.FormatInt(v.GeneratedAt.UnixMilli(), 10) + `">
<a class="skip" href="#services">Skip to services</a>
<div class="site-aurora" aria-hidden="true"></div>
<div class="backdrop" aria-hidden="true">
<div class="backdrop__rings">`)
	for i := 0; i < 6; i++ {
		fmt.Fprintf(&b, `<span class="backdrop__ring" style="--i:%d"></span>`, i)
	}
	b.WriteString(`</div>
<div class="backdrop__field">`)
	for i := 0; i < 4; i++ {
		fmt.Fprintf(&b, `<span class="backdrop__blob" style="--i:%d"></span>`, i)
	}
	b.WriteString(`</div>
</div>

<header class="topbar">
<a class="topbar__brand" href="https://rmhstudios.com/">
<span class="topbar__mark">RMH</span><small>Studios</small>
</a>
<span class="topbar__tag">System status</span>
<nav class="topbar__tools" aria-label="Page preferences">
<span class="live" data-live-indicator title="Live updates" hidden><span class="live__dot" aria-hidden="true"></span><span class="live__text">Live</span></span>
<button type="button" class="icon-btn" data-refresh title="Refresh now (r)" aria-label="Refresh now">↻</button>
<button type="button" class="icon-btn" data-pause title="Pause live updates (p)" aria-label="Pause live updates" aria-pressed="false">❚❚</button>
<button type="button" class="icon-btn" data-tz title="Toggle UTC / local time (z)" aria-label="Toggle time zone">UTC</button>
<button type="button" class="icon-btn" data-density title="Compact layout (c)" aria-label="Toggle compact layout" aria-pressed="false">☰</button>
<button type="button" class="icon-btn" data-theme-btn title="Theme (t)" aria-label="Change theme"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
<button type="button" class="icon-btn" data-help title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
</nav>
</header>

<div class="banners" data-live="banners">` + renderAnnouncements(v) + `</div>

<main class="shell" id="main-content">
<section class="hero">
<div class="globe" data-globe>
<canvas class="globe__cage" data-cage aria-hidden="true"></canvas>
<span class="globe__glass" aria-hidden="true"></span>
<ul class="globe__pins" aria-hidden="true">` + renderPins(v) + `</ul>
</div>
<div class="hero__copy" data-live="hero">
<p class="kicker">RMH Presents</p>
<h1 class="hero__headline">` + esc(headline) + `</h1>
<p class="hero__lede">` + esc(lede) + `</p>
<ul class="hero__tallies">` + tallies.String() + `</ul>
</div>
</section>
<p class="hero__live" aria-live="off"><span data-updated>Updated just now</span><span data-countdown-refresh></span> · <button type="button" class="linkish" data-copy-summary>Copy status summary</button></p>

<div data-live="kpis">` + renderKPIs(v) + `</div>
<div data-live="groups">` + renderGroups(v) + `</div>
` + renderToolbar(v) + `
<div id="services" data-live="services">` + renderCards(v) + `</div>
<p class="empty glass-fill" data-no-results hidden>No services match.</p>
<div data-live="incidents">` + renderIncidents(v) + `</div>
<div data-live="maintenance">` + renderMaintenance(v) + `</div>
<div data-live="calendar">` + renderCalendar(v) + `</div>
<div data-live="heatmap">` + renderHeatmap(v) + `</div>
<div data-live="leaderboard">` + renderLeaderboard(v) + `</div>
<div data-live="budget">` + renderBudget(v.SLO, v.Interval) + `</div>
<div data-live="prober">` + renderProber(v) + `</div>
` + renderDevelopers(v) + `
</main>

<footer class="foot">
<p data-live="foot">Last checked ` + timeHTML + ` · refreshes every 30s</p>
<p><a href="/history">History</a> · <a href="/report">Uptime report</a> · <a href="/api/status">status.json</a> · <a href="/api/slo">slo.json</a> · <a href="/api/v2/summary.json">summary.json</a> · <a href="/feed.rss">RSS</a> · <a href="https://rmhstudios.com/">rmhstudios.com</a></p>
</footer>

<div class="tip" role="tooltip" data-tip hidden></div>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
<dialog class="help" data-help-dialog aria-labelledby="help-h">
<h2 id="help-h">Keyboard shortcuts</h2>
<dl class="kv">
<div><dt><kbd>/</kbd></dt><dd>Search services</dd></div>
<div><dt><kbd>i</kbd></dt><dd>Show only services with issues</dd></div>
<div><dt><kbd>g</kbd></dt><dd>Toggle hourly / daily history</dd></div>
<div><dt><kbd>e</kbd></dt><dd>Expand / collapse all details</dd></div>
<div><dt><kbd>r</kbd></dt><dd>Refresh now</dd></div>
<div><dt><kbd>p</kbd></dt><dd>Pause / resume live updates</dd></div>
<div><dt><kbd>z</kbd></dt><dd>Toggle UTC / local time</dd></div>
<div><dt><kbd>t</kbd></dt><dd>Cycle theme (auto, light, dark)</dd></div>
<div><dt><kbd>c</kbd></dt><dd>Compact layout</dd></div>
<div><dt><kbd>?</kbd></dt><dd>This help</dd></div>
</dl>
<form method="dialog"><button class="btn" type="submit">Close</button></form>
</dialog>
<script>` + dashboardJS + `</script>
<script>` + enhanceJS + `</script>
</body>
</html>`)
	return b.String()
}

// prettyCheckedAt turns the ISO checkedAt into the compact UTC stamp shown in
// the lede, and reports whether anything has been checked at all. The epoch
// sentinel means "not probed yet", which reads as a bogus 1970 date otherwise.
func prettyCheckedAt(iso string) (string, bool) {
	if iso == "" || iso == epochSentinel {
		return "", false
	}
	t, err := time.Parse(isoMillis, iso)
	if err != nil {
		return iso, true
	}
	return t.UTC().Format("2 Jan 2006, 15:04 UTC"), true
}

// faviconDataURI is the globe, reduced to a mark: a ring, its equator, and the
// pin at the front. Inline so the page fetches nothing — a status page that
// 404s its own favicon through its own handler is a silly thing to ship, and a
// status page that reaches out to another origin for one is a worse thing. `#`
// is percent-encoded; a raw one would end the URL at the fragment. The script
// swaps it for a copy whose pin carries the live verdict's colour.
const faviconDataURI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' stroke='%23888' stroke-width='2'%3E%3Ccircle cx='16' cy='16' r='13'/%3E%3Cellipse cx='16' cy='16' rx='13' ry='5'/%3E%3C/g%3E%3Ccircle cx='16' cy='16' r='4.5' fill='%23888'/%3E%3C/svg%3E"
