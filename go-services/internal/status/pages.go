package status

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// The status page's secondary documents: the incident archive, one page per
// incident, the monthly uptime (SLA) report, and the embeddable widget. They
// share the dashboard's stylesheet and its enhancement script, so the theme,
// time-zone and density preferences a visitor set carry across.

// pageShell wraps a body in the shared document chrome.
func pageShell(title string, display Status, body string) string {
	return `<!doctype html>
<html lang="en" data-status="` + string(display) + `">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="` + faviconDataURI + `" />
<link rel="alternate" type="application/rss+xml" title="RMH Studios incident history (RSS)" href="/feed.rss" />
<title>` + esc(title) + ` — RMH Studios status</title>
<script>` + themeBootJS + `</script>
<style>` + dashboardCSS + `</style>
</head>
<body>
<div class="site-aurora" aria-hidden="true"></div>
<header class="topbar">
<a class="topbar__brand" href="/"><span class="topbar__mark">RMH</span><small>Status</small></a>
<span class="topbar__tag">` + esc(title) + `</span>
<nav class="topbar__tools" aria-label="Page preferences">
<button type="button" class="icon-btn" data-tz title="Toggle UTC / local time (z)" aria-label="Toggle time zone">UTC</button>
<button type="button" class="icon-btn" data-theme-btn title="Theme (t)" aria-label="Change theme"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
</nav>
</header>
<main class="shell shell--page" id="main-content">
<p class="crumbs"><a href="/">← Current status</a></p>
` + body + `
</main>
<footer class="foot"><p><a href="/">Status</a> · <a href="/history">History</a> · <a href="/report">Uptime report</a> · <a href="/feed.rss">RSS</a> · <a href="https://rmhstudios.com/">rmhstudios.com</a></p></footer>
<div class="tip" role="tooltip" data-tip hidden></div>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
<script>` + enhanceJS + `</script>
</body>
</html>`
}

func writeHTML(w http.ResponseWriter, code int, doc string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_, _ = io.WriteString(w, doc)
}

// ── /history ────────────────────────────────────────────────────────────────

func (d *dashboard) handleHistoryPage(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	component := r.URL.Query().Get("component")
	incidents := d.svc.store.Incidents()
	maint := d.svc.store.Maintenances()

	type entry struct {
		at   int64
		html string
	}
	months := map[string][]entry{}
	for _, inc := range incidents {
		if component != "" && !containsSlug(inc.Components, component) {
			continue
		}
		k := time.UnixMilli(inc.StartedAt).UTC().Format("2006-01")
		months[k] = append(months[k], entry{inc.StartedAt, renderIncidentRow(inc, v.GeneratedAt)})
	}
	for _, m := range maint {
		if component != "" && len(m.Components) > 0 && !containsSlug(m.Components, component) {
			continue
		}
		k := time.UnixMilli(m.StartsAt).UTC().Format("2006-01")
		st := m.State(v.GeneratedAt)
		row := fmt.Sprintf(`<li class="inc glass-fill" data-status="maintenance" data-state="%s" data-kind="maintenance"><div class="inc__head"><span class="impact" data-impact="maintenance">Maintenance</span><span class="inc__title">%s</span><span class="inc__state">%s</span></div><p class="inc__meta">%s → %s</p>%s</li>`,
			esc(st), esc(m.Title), esc(titleCase(strings.ReplaceAll(st, "_", " "))), timeTag(m.StartsAt, layoutDateTime), timeTag(m.EndsAt, layoutDateTime),
			map[bool]string{true: `<p class="inc__body">` + esc(m.Description) + `</p>`, false: ""}[m.Description != ""])
		months[k] = append(months[k], entry{m.StartsAt, row})
	}
	keys := make([]string, 0, len(months))
	for k := range months {
		keys = append(keys, k)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(keys)))

	var sb strings.Builder
	sb.WriteString(`<section class="hero hero--page"><div class="hero__copy"><p class="kicker">Incident history</p><h1 class="hero__headline">Every incident and maintenance window</h1>`)
	fmt.Fprintf(&sb, `<p class="hero__lede">%d incidents on record · <a href="/feed.rss">RSS</a> · <a href="/feed.atom">Atom</a> · <a href="/api/incidents">JSON</a></p></div></section>`, len(incidents))

	// Component filter.
	sb.WriteString(`<nav class="filters" aria-label="Filter by component"><a href="/history"`)
	if component == "" {
		sb.WriteString(` aria-current="page"`)
	}
	sb.WriteString(`>All</a>`)
	for _, s := range v.Services {
		cur := ""
		if s.Slug == component {
			cur = ` aria-current="page"`
		}
		fmt.Fprintf(&sb, `<a href="/history?component=%s"%s>%s</a>`, esc(s.Slug), cur, esc(s.Name))
	}
	sb.WriteString(`</nav>`)

	if len(keys) == 0 {
		sb.WriteString(`<p class="empty glass-fill">Nothing on record yet.</p>`)
	}
	for _, k := range keys {
		t, _ := time.Parse("2006-01", k)
		entries := months[k]
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].at > entries[j].at })
		fmt.Fprintf(&sb, `<section class="tier"><h2 class="tier__label">%s</h2><ol class="incidents">`, t.Format("January 2006"))
		for _, e := range entries {
			sb.WriteString(e.html)
		}
		sb.WriteString(`</ol></section>`)
	}
	writeHTML(w, http.StatusOK, pageShell("Incident history", v.Display, sb.String()))
}

// ── /incidents/{id} ─────────────────────────────────────────────────────────

func (d *dashboard) handleIncidentPage(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	inc, ok := d.svc.store.Incident(r.PathValue("id"))
	if !ok {
		writeHTML(w, http.StatusNotFound, pageShell("Incident not found", v.Display,
			`<p class="empty glass-fill">No incident with that ID. <a href="/history">Browse the history</a>.</p>`))
		return
	}
	var sb strings.Builder
	state := "open"
	if inc.Resolved() {
		state = "resolved"
	}
	fmt.Fprintf(&sb, `<article class="incident" data-impact="%s" data-state="%s"><section class="hero hero--page"><div class="hero__copy"><p class="kicker"><span class="impact" data-impact="%s">%s impact</span> · %s</p><h1 class="hero__headline">%s</h1>`,
		esc(inc.Impact), state, esc(inc.Impact), esc(titleCase(inc.Impact)), esc(map[string]string{"auto": "Detected automatically", "manual": "Declared by the team"}[inc.Kind]), esc(inc.Title))
	fmt.Fprintf(&sb, `<p class="hero__lede">%s · started %s`, esc(titleCase(inc.State)), timeTag(inc.StartedAt, layoutDateTime))
	if inc.Resolved() {
		fmt.Fprintf(&sb, ` · resolved %s · lasted %s`, timeTag(inc.ResolvedAt, layoutDateTime), HumanDuration(inc.Duration(v.GeneratedAt)))
	} else {
		fmt.Fprintf(&sb, ` · ongoing for %s`, HumanDuration(inc.Duration(v.GeneratedAt)))
	}
	sb.WriteString(`</p></div></section>`)

	sb.WriteString(`<dl class="kv kv--grid glass-fill">`)
	kv := func(k, val string) { fmt.Fprintf(&sb, `<div><dt>%s</dt><dd>%s</dd></div>`, k, val) }
	comps := "—"
	if len(inc.Components) > 0 {
		var links []string
		for _, c := range inc.Components {
			links = append(links, fmt.Sprintf(`<a href="/#svc-%s">%s</a>`, esc(Slugify(c)), esc(c)))
		}
		comps = strings.Join(links, ", ")
	}
	kv("Affected", comps)
	kv("Impact", esc(titleCase(inc.Impact)))
	kv("Status", esc(titleCase(inc.State)))
	if inc.FailedChecks > 0 {
		kv("Failed checks", fmt.Sprintf("%d", inc.FailedChecks))
	}
	if inc.Worst != "" {
		kv("Worst state", esc(statusMetaMap[inc.Worst].label))
	}
	if inc.Category != "" {
		kv("Cause", esc(CategoryLabel(inc.Category)))
	}
	kv("Last updated", timeTag(inc.UpdatedAt, layoutDateTime))
	sb.WriteString(`</dl>`)

	sb.WriteString(`<section class="tier"><h2 class="tier__label">Updates</h2><ol class="timeline">`)
	for i := len(inc.Updates) - 1; i >= 0; i-- {
		u := inc.Updates[i]
		fmt.Fprintf(&sb, `<li class="timeline__item" data-state="%s"><span class="timeline__state">%s</span>%s<p>%s</p></li>`,
			esc(u.State), esc(titleCase(u.State)), timeTag(u.At, layoutDateTime), esc(u.Body))
	}
	sb.WriteString(`</ol></section>`)

	if inc.Postmortem != "" {
		fmt.Fprintf(&sb, `<section class="tier"><h2 class="tier__label">Postmortem</h2><div class="postmortem glass-fill">%s</div></section>`, esc(inc.Postmortem))
	}
	fmt.Fprintf(&sb, `<p class="more"><a href="/api/incidents/%s">JSON</a> · <button type="button" class="linkish" data-copy-url>Copy link</button></p></article>`, esc(inc.ID))
	writeHTML(w, http.StatusOK, pageShell(inc.Title, v.Display, sb.String()))
}

// ── /report ─────────────────────────────────────────────────────────────────

// handleReportPage renders a monthly uptime report from the daily rollups:
// per service, the month's uptime against the SLO target, availability,
// downtime and incidents, with a day-by-day strip.
func (d *dashboard) handleReportPage(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	now := v.GeneratedAt.UTC()
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if q := r.URL.Query().Get("month"); q != "" {
		if t, err := time.Parse("2006-01", q); err == nil {
			month = t
		}
	}
	start := month.UnixMilli()
	end := month.AddDate(0, 1, 0).UnixMilli()
	target := v.SLO.Target * 100
	incidents := d.svc.store.Incidents()

	var sb strings.Builder
	fmt.Fprintf(&sb, `<section class="hero hero--page"><div class="hero__copy"><p class="kicker">Uptime report</p><h1 class="hero__headline">%s</h1><p class="hero__lede">Target %.2f%% per service · daily rollups (UTC) · maintenance excluded</p></div></section>`,
		month.Format("January 2006"), target)

	prev := month.AddDate(0, -1, 0)
	next := month.AddDate(0, 1, 0)
	sb.WriteString(`<nav class="filters" aria-label="Month">`)
	if prev.UnixMilli() >= floorTo(now.UnixMilli(), dayMs)-int64(v.MaxDays)*dayMs-31*dayMs {
		fmt.Fprintf(&sb, `<a href="/report?month=%s">← %s</a>`, prev.Format("2006-01"), prev.Format("January"))
	}
	if next.UnixMilli() <= now.UnixMilli() {
		fmt.Fprintf(&sb, `<a href="/report?month=%s">%s →</a>`, next.Format("2006-01"), next.Format("January"))
	}
	fmt.Fprintf(&sb, `<a href="/api/history.csv?range=daily">Download CSV</a><button type="button" class="linkish" data-print>Print / save as PDF</button></nav>`)

	daysInMonth := int((end - start) / dayMs)
	sb.WriteString(`<div class="report glass-fill"><table class="dt dt--report"><thead><tr><th scope="col">Service</th><th scope="col">Uptime</th><th scope="col">Availability</th><th scope="col">Downtime</th><th scope="col">Incidents</th><th scope="col">Target</th><th scope="col">Days</th></tr></thead><tbody>`)
	var platform Bucket
	met := 0
	measured := 0
	for _, s := range v.Services {
		agg := sumRange(s.Daily, start, end)
		platform.merge(agg)
		incN := 0
		for _, inc := range incidents {
			if inc.StartedAt >= start && inc.StartedAt < end && containsStr(inc.Components, s.Name) {
				incN++
			}
		}
		up, avail, verdict, state := "—", "—", "no data", "unknown"
		if agg.Total() > 0 {
			measured++
			u := float64(agg.Up) / float64(agg.Total()) * 100
			a := float64(agg.Up+agg.Degraded) / float64(agg.Total()) * 100
			up, avail = fmtPct(&u), fmtPct(&a)
			if u >= target {
				verdict, state = "Met", "up"
				met++
			} else {
				verdict, state = "Missed", "down"
			}
		}
		downtime := HumanDuration(time.Duration(float64(agg.Degraded+agg.Down)*v.Interval.Seconds()) * time.Second)
		var strip strings.Builder
		for i := 0; i < daysInMonth; i++ {
			ds := start + int64(i)*dayMs
			db := sumRange(s.Daily, ds, ds+dayMs)
			sev := BarSeverity(db)
			if ds > now.UnixMilli() {
				sev = "empty"
			}
			tip := time.UnixMilli(ds).UTC().Format("2 Jan")
			if db.Total() > 0 {
				tip += " — " + fmtPct(fptr(float64(db.Up)/float64(db.Total())*100))
			}
			fmt.Fprintf(&strip, `<span class="bar bar--day" data-b="%s" title="%s"></span>`, sev, esc(tip))
		}
		fmt.Fprintf(&sb, `<tr data-status="%s"><th scope="row"><a href="/#svc-%s">%s</a></th><td>%s</td><td>%s</td><td>%s</td><td>%d</td><td><span class="svc__pill">%s</span></td><td><div class="svc__bars svc__bars--mini">%s</div></td></tr>`,
			state, esc(s.Slug), esc(s.Name), up, avail, downtime, incN, verdict, strip.String())
	}
	pu := "—"
	if platform.Total() > 0 {
		pu = fmtPct(fptr(float64(platform.Up) / float64(platform.Total()) * 100))
	}
	fmt.Fprintf(&sb, `</tbody><tfoot><tr><th scope="row">Platform</th><td>%s</td><td colspan="3">%s checks</td><td colspan="2">%d of %d services met target</td></tr></tfoot></table></div>`,
		pu, fmtCount(platform.Total()), met, measured)
	writeHTML(w, http.StatusOK, pageShell("Uptime report · "+month.Format("Jan 2006"), v.Display, sb.String()))
}

// ── /embed, /embed.js ───────────────────────────────────────────────────────

// handleEmbed serves a compact iframe widget: the verdict, one line, a link.
func (d *dashboard) handleEmbed(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	page := d.svc.cfg.PageURL
	if page == "" {
		page = "/"
	}
	doc := `<!doctype html><html lang="en" data-status="` + string(v.Display) + `"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light dark" /><meta http-equiv="refresh" content="60" /><title>Status</title><style>` + embedCSS + `</style></head><body>` +
		fmt.Sprintf(`<a class="w" href="%s" target="_blank" rel="noopener"><span class="w__dot" aria-hidden="true"></span><span class="w__text"><b>%s</b><small>%s · RMH Studios status</small></span></a>`,
			esc(page), esc(v.Headline), esc(fmt.Sprintf("%d/%d operational", v.KPIs.Healthy, v.KPIs.Total))) +
		`</body></html>`
	// Embeddable by design: this is the one page meant to live in someone
	// else's frame.
	w.Header().Set("Content-Security-Policy", "frame-ancestors *")
	writeHTML(w, http.StatusOK, doc)
}

func (d *dashboard) handleEmbedJS(w http.ResponseWriter, r *http.Request) {
	cors(w)
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = io.WriteString(w, embedJS)
}

// ── /manifest.webmanifest, /robots.txt ──────────────────────────────────────

func (d *dashboard) handleManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/manifest+json")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"name":             d.svc.cfg.PageName + " Status",
		"short_name":       "RMH Status",
		"description":      "Live health of every RMH Studios service.",
		"start_url":        "/",
		"scope":            "/",
		"display":          "standalone",
		"background_color": "#000000",
		"theme_color":      "#000000",
		"icons":            []map[string]string{{"src": faviconDataURI, "sizes": "any", "type": "image/svg+xml"}},
	})
}

func (d *dashboard) handleRobots(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, "User-agent: *\nDisallow: /api/admin/\nAllow: /\n")
}

// embedCSS is the widget's own tiny stylesheet: the same tokens, nothing else.
const embedCSS = `
:root { color-scheme: light dark; --text: #000; --muted: #565656; --bg: #fff; --border: rgba(0,0,0,.16);
  --up: #167d3a; --degraded: #7a4a00; --down: #c40016; --maintenance: #0a58ca; --unknown: #767676; }
@media (prefers-color-scheme: dark) { :root { --text: #f5f5f7; --muted: #a1a1a6; --bg: #1c1c1e; --border: rgba(255,255,255,.12);
  --up: #30d158; --degraded: #ff9f0a; --down: #ff453a; --maintenance: #2997ff; --unknown: #86868b; } }
html { --state: var(--unknown); }
html[data-status='up'] { --state: var(--up); }
html[data-status='degraded'] { --state: var(--degraded); }
html[data-status='down'] { --state: var(--down); }
html[data-status='maintenance'] { --state: var(--maintenance); }
body { margin: 0; font: 14px/1.3 -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; background: transparent; }
.w { display: flex; align-items: center; gap: .65rem; padding: .7rem .9rem; color: var(--text); text-decoration: none;
  background: var(--bg); border: 1px solid var(--border); border-radius: 14px; }
.w__dot { width: .65rem; height: .65rem; border-radius: 50%; background: var(--state);
  box-shadow: 0 0 0 .2rem color-mix(in srgb, var(--state) 20%, transparent); flex: none; }
.w__text { display: flex; flex-direction: column; min-width: 0; }
.w__text b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.w__text small { color: var(--muted); font-size: 12px; }
`

// embedJS renders a status pill into any [data-rmh-status] element on the
// host page, or a small fixed pill in the corner when there is none.
const embedJS = `(function () {
  'use strict';
  var me = document.currentScript;
  var origin = me ? new URL(me.src).origin : 'https://status.rmhstudios.com';
  var colors = { none: '#2ea44f', minor: '#dbab09', major: '#d73a49', critical: '#d73a49', maintenance: '#0969da' };
  function render(targets, data) {
    var ind = data.status.indicator;
    var text = data.status.description;
    targets.forEach(function (el) {
      el.textContent = '';
      var a = document.createElement('a');
      a.href = origin + '/';
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font:600 12px/1.4 system-ui,sans-serif;text-decoration:none;color:#fff;background:' + (colors[ind] || '#8b949e');
      var dot = document.createElement('span');
      dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.9';
      a.appendChild(dot);
      a.appendChild(document.createTextNode(text));
      el.appendChild(a);
    });
  }
  function run() {
    var targets = Array.prototype.slice.call(document.querySelectorAll('[data-rmh-status]'));
    if (!targets.length) {
      var holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000';
      document.body.appendChild(holder);
      targets = [holder];
    }
    fetch(origin + '/api/v2/status.json').then(function (r) { return r.json(); }).then(function (d) { render(targets, d); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
`
