package status

import (
	"crypto/subtle"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Machine-readable surfaces of the status service. Everything here is derived
// from the same View the dashboard renders, so the page, the JSON, the
// Statuspage-compatible API, the Prometheus metrics, the badges and the feeds
// all tell the same story.

const (
	jsonCT = "application/json; charset=utf-8"
	// maxAdminBody caps an admin request body. A postmortem is long; a
	// megabyte of one is not a postmortem.
	maxAdminBody = 64 << 10
)

func rfc(ms int64) string {
	if ms == 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(isoMillis)
}

func rfcPtr(ms int64) *string {
	if ms == 0 {
		return nil
	}
	s := rfc(ms)
	return &s
}

// cors marks a response as readable from any origin. Every public endpoint is
// anonymous, read-only data the HTML page already shows, so there is nothing a
// cross-origin read can learn that a visitor cannot — and an embed on another
// site is the point of most of them.
func cors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	cors(w)
	w.Header().Set("Content-Type", jsonCT)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// ── /api/dashboard, /api/services, /api/uptime, /api/history ───────────────

func (d *dashboard) handleAPIDashboard(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	if r.URL.Query().Get("compact") == "1" {
		for i := range v.Services {
			v.Services[i].Hourly, v.Services[i].Daily, v.Services[i].Recent = nil, nil, nil
		}
	}
	writeJSON(w, http.StatusOK, v)
}

// compactService drops the series a list view does not need.
func compactService(s ServiceView) ServiceView {
	s.Hourly, s.Daily, s.Recent = nil, nil, nil
	return s
}

func (d *dashboard) handleAPIServices(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	out := make([]ServiceView, 0, len(v.Services))
	for _, s := range v.Services {
		out = append(out, compactService(s))
	}
	writeJSON(w, http.StatusOK, map[string]any{"generatedAt": v.Generated, "services": out})
}

func (d *dashboard) handleAPIService(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	s := v.Service(r.PathValue("slug"))
	if s == nil {
		writeError(w, http.StatusNotFound, "unknown service")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (d *dashboard) handleAPIUptime(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	type row struct {
		Name    string         `json:"name"`
		Slug    string         `json:"slug"`
		Group   string         `json:"group,omitempty"`
		Display Status         `json:"display"`
		Windows []UptimeWindow `json:"windows"`
	}
	rows := make([]row, 0, len(v.Services))
	for _, s := range v.Services {
		rows = append(rows, row{s.Name, s.Slug, s.Group, s.Display, s.Windows})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generatedAt": v.Generated,
		"platform":    v.KPIs.Windows,
		"services":    rows,
	})
}

func (d *dashboard) handleAPIHistory(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	rng := r.URL.Query().Get("range")
	if rng == "" {
		rng = "hourly"
	}
	if rng != "hourly" && rng != "daily" && rng != "recent" {
		writeError(w, http.StatusBadRequest, "range must be hourly, daily or recent")
		return
	}
	want := r.URL.Query().Get("service")
	out := map[string]any{}
	for _, s := range v.Services {
		if want != "" && s.Slug != want && s.Name != want {
			continue
		}
		switch rng {
		case "hourly":
			out[s.Slug] = s.Hourly
		case "daily":
			out[s.Slug] = s.Daily
		default:
			out[s.Slug] = s.Recent
		}
	}
	if want != "" && len(out) == 0 {
		writeError(w, http.StatusNotFound, "unknown service")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"range": rng, "generatedAt": v.Generated, "history": out})
}

// handleHistoryCSV exports bucket history as CSV, one row per service-bucket.
func (d *dashboard) handleHistoryCSV(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	daily := r.URL.Query().Get("range") == "daily"
	name := "status-history-hourly.csv"
	if daily {
		name = "status-history-daily.csv"
	}
	cors(w)
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"service", "group", "bucket_start_utc", "up", "degraded", "down", "maintenance", "uptime_pct", "latency_avg_ms", "latency_min_ms", "latency_max_ms", "latency_p95_ms_est", "severity"})
	for _, s := range v.Services {
		series := s.Hourly
		if daily {
			series = s.Daily
		}
		for _, b := range series {
			uptime, avg, lmin, lmax, p95 := "", "", "", "", ""
			if b.Total() > 0 {
				uptime = strconv.FormatFloat(float64(b.Up)/float64(b.Total())*100, 'f', 3, 64)
			}
			if b.LatN > 0 {
				avg = strconv.FormatFloat(float64(b.LatSum)/float64(b.LatN), 'f', 1, 64)
				lmin = strconv.FormatInt(b.LatMin, 10)
				lmax = strconv.FormatInt(b.LatMax, 10)
				p95 = strconv.FormatFloat(histQuantile(b, 0.95), 'f', 1, 64)
			}
			_ = cw.Write([]string{
				s.Name, s.Group, time.UnixMilli(b.T).UTC().Format(time.RFC3339),
				strconv.Itoa(b.Up), strconv.Itoa(b.Degraded), strconv.Itoa(b.Down), strconv.Itoa(b.Maint),
				uptime, avg, lmin, lmax, p95, BarSeverity(b),
			})
		}
	}
	cw.Flush()
}

// ── Incidents, maintenance, announcements ──────────────────────────────────

func (d *dashboard) handleAPIIncidents(w http.ResponseWriter, r *http.Request) {
	all := d.svc.store.Incidents()
	filter := r.URL.Query().Get("status")
	limit := 100
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 500 {
		limit = n
	}
	out := make([]Incident, 0, len(all))
	for _, inc := range all {
		if filter == "open" && inc.Resolved() || filter == "resolved" && !inc.Resolved() {
			continue
		}
		if c := r.URL.Query().Get("component"); c != "" && !containsStr(inc.Components, c) && !containsSlug(inc.Components, c) {
			continue
		}
		out = append(out, inc)
		if len(out) >= limit {
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"incidents": out})
}

func containsSlug(names []string, slug string) bool {
	for _, n := range names {
		if Slugify(n) == slug {
			return true
		}
	}
	return false
}

func (d *dashboard) handleAPIIncident(w http.ResponseWriter, r *http.Request) {
	inc, ok := d.svc.store.Incident(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "unknown incident")
		return
	}
	writeJSON(w, http.StatusOK, inc)
}

func (d *dashboard) handleAPIMaintenance(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	type row struct {
		Maintenance
		State string `json:"state"`
	}
	var out []row
	for _, m := range d.svc.store.Maintenances() {
		out = append(out, row{m, m.State(now)})
	}
	if out == nil {
		out = []row{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"maintenance": out})
}

func (d *dashboard) handleAPIAnnouncements(w http.ResponseWriter, r *http.Request) {
	out := d.svc.store.Announcements(time.Now())
	if out == nil {
		out = []Announcement{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"announcements": out})
}

// ── Statuspage.io-compatible API (v2) ──────────────────────────────────────
//
// The de-facto status API: Slack's and Datadog's status integrations, most
// "is X down" aggregators and a long tail of dashboards speak exactly this
// shape. Serving it means any of them can consume this page unchanged.

const pageID = "rmhstudios"

func (d *dashboard) v2Page(v *View) map[string]any {
	url := d.svc.cfg.PageURL
	if url == "" {
		url = "https://status.rmhstudios.com"
	}
	return map[string]any{
		"id":         pageID,
		"name":       d.svc.cfg.PageName,
		"url":        url,
		"time_zone":  "Etc/UTC",
		"updated_at": v.Generated,
	}
}

func v2StatusDescription(indicator string) string {
	switch indicator {
	case "none":
		return "All Systems Operational"
	case "minor":
		return "Minor Service Outage"
	case "major":
		return "Partial System Outage"
	case "critical":
		return "Major Service Outage"
	case "maintenance":
		return "Service Under Maintenance"
	}
	return "Status Unknown"
}

// V2ComponentStatus maps a display state onto the Statuspage vocabulary.
func V2ComponentStatus(s ServiceView) string {
	switch s.Display {
	case StatusMaintenance:
		return "under_maintenance"
	case StatusDegraded:
		return "degraded_performance"
	case StatusDown:
		// Flapping between up and down is a partial outage (some requests get
		// through); a service that is simply down is a major one.
		if s.Flapping {
			return "partial_outage"
		}
		return "major_outage"
	}
	return "operational"
}

func (d *dashboard) v2Components(v *View) []map[string]any {
	created := rfc(d.svc.startedAt.UnixMilli())
	var out []map[string]any
	groupMembers := map[string][]string{}
	for i, s := range v.Services {
		gid := any(nil)
		if s.Group != "" {
			gid = "group-" + Slugify(s.Group)
			groupMembers[s.Group] = append(groupMembers[s.Group], s.Slug)
		}
		out = append(out, map[string]any{
			"id": s.Slug, "name": s.Name, "status": V2ComponentStatus(s),
			"created_at": created, "updated_at": s.CheckedAt, "position": i + 1,
			"description": s.Description, "showcase": true, "start_date": nil,
			"group_id": gid, "page_id": pageID, "group": false, "only_show_if_degraded": false,
		})
	}
	for i, g := range v.Groups {
		if g.Name == "" {
			continue
		}
		worst := "operational"
		rank := map[string]int{"operational": 0, "under_maintenance": 1, "degraded_performance": 2, "partial_outage": 3, "major_outage": 4}
		for _, s := range v.Services {
			if s.Group == g.Name && rank[V2ComponentStatus(s)] > rank[worst] {
				worst = V2ComponentStatus(s)
			}
		}
		out = append(out, map[string]any{
			"id": "group-" + g.Slug, "name": g.Name, "status": worst,
			"created_at": created, "updated_at": v.Generated, "position": len(v.Services) + i + 1,
			"description": nil, "showcase": false, "start_date": nil, "group_id": nil,
			"page_id": pageID, "group": true, "only_show_if_degraded": false,
			"components": groupMembers[g.Name],
		})
	}
	return out
}

func (d *dashboard) v2Incident(inc Incident) map[string]any {
	var updates []map[string]any
	var monitoringAt *string
	for i := len(inc.Updates) - 1; i >= 0; i-- {
		u := inc.Updates[i]
		if u.State == StateMonitoring && monitoringAt == nil {
			monitoringAt = rfcPtr(u.At)
		}
		updates = append(updates, map[string]any{
			"id": fmt.Sprintf("%s-%d", inc.ID, i), "status": u.State, "body": u.Body,
			"incident_id": inc.ID, "created_at": rfc(u.At), "updated_at": rfc(u.At), "display_at": rfc(u.At),
			"affected_components": nil,
		})
	}
	var comps []map[string]any
	for _, c := range inc.Components {
		comps = append(comps, map[string]any{"id": Slugify(c), "name": c})
	}
	return map[string]any{
		"id": inc.ID, "name": inc.Title, "status": inc.State, "impact": inc.Impact,
		"created_at": rfc(inc.StartedAt), "updated_at": rfc(inc.UpdatedAt), "started_at": rfc(inc.StartedAt),
		"monitoring_at": monitoringAt, "resolved_at": rfcPtr(inc.ResolvedAt),
		"shortlink": d.svc.cfg.PageURL + "/incidents/" + inc.ID, "page_id": pageID,
		"incident_updates": updates, "components": comps, "postmortem_body": nilIfEmpty(inc.Postmortem),
	}
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (d *dashboard) v2Maintenance(m Maintenance, now time.Time) map[string]any {
	st := m.State(now)
	if st == MaintCancelled {
		st = "completed"
	}
	var updates []map[string]any
	for i := len(m.Updates) - 1; i >= 0; i-- {
		u := m.Updates[i]
		updates = append(updates, map[string]any{
			"id": fmt.Sprintf("%s-%d", m.ID, i), "status": u.State, "body": u.Body,
			"incident_id": m.ID, "created_at": rfc(u.At), "updated_at": rfc(u.At), "display_at": rfc(u.At),
		})
	}
	var comps []map[string]any
	for _, c := range m.Components {
		comps = append(comps, map[string]any{"id": Slugify(c), "name": c})
	}
	var resolvedAt *string
	if st == "completed" {
		resolvedAt = rfcPtr(m.EndsAt)
		if m.CancelledAt != 0 {
			resolvedAt = rfcPtr(m.CancelledAt)
		}
	}
	return map[string]any{
		"id": m.ID, "name": m.Title, "status": st, "impact": "maintenance",
		"created_at": rfc(m.CreatedAt), "updated_at": rfc(m.CreatedAt),
		"scheduled_for": rfc(m.StartsAt), "scheduled_until": rfc(m.EndsAt),
		"resolved_at": resolvedAt,
		"shortlink":   d.svc.cfg.PageURL + "/#maintenance", "page_id": pageID,
		"incident_updates": updates, "components": comps, "description": m.Description,
	}
}

func (d *dashboard) handleV2(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	now := v.GeneratedAt
	status := map[string]any{"indicator": v.Indicator, "description": v2StatusDescription(v.Indicator)}
	if v.Indicator == "maintenance" {
		// Statuspage's indicator enum has no "maintenance"; it reports none.
		status["indicator"] = "none"
	}
	incidents := func(onlyOpen bool) []map[string]any {
		out := []map[string]any{}
		for i, inc := range d.svc.store.Incidents() {
			if onlyOpen && inc.Resolved() {
				continue
			}
			if !onlyOpen && i >= 50 {
				break
			}
			out = append(out, d.v2Incident(inc))
		}
		return out
	}
	maint := func(states ...string) []map[string]any {
		out := []map[string]any{}
		for _, m := range d.svc.store.Maintenances() {
			st := m.State(now)
			if len(states) == 0 || containsStr(states, st) {
				out = append(out, d.v2Maintenance(m, now))
			}
		}
		return out
	}

	page := d.v2Page(v)
	switch r.PathValue("doc") {
	case "status.json":
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "status": status})
	case "summary.json":
		writeJSON(w, http.StatusOK, map[string]any{
			"page": page, "status": status, "components": d.v2Components(v),
			"incidents": incidents(true), "scheduled_maintenances": maint(MaintScheduled, MaintInProgress),
		})
	case "components.json":
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "components": d.v2Components(v)})
	case "incidents.json":
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "incidents": incidents(false)})
	case "scheduled-maintenances.json":
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "scheduled_maintenances": maint()})
	default:
		writeError(w, http.StatusNotFound, "unknown v2 document")
	}
}

func (d *dashboard) handleV2Sub(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	now := v.GeneratedAt
	page := d.v2Page(v)
	switch r.PathValue("kind") + "/" + r.PathValue("doc") {
	case "incidents/unresolved.json":
		out := []map[string]any{}
		for _, inc := range d.svc.store.Incidents() {
			if !inc.Resolved() {
				out = append(out, d.v2Incident(inc))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "incidents": out})
	case "scheduled-maintenances/upcoming.json", "scheduled-maintenances/active.json":
		want := MaintScheduled
		if r.PathValue("doc") == "active.json" {
			want = MaintInProgress
		}
		out := []map[string]any{}
		for _, m := range d.svc.store.Maintenances() {
			if m.State(now) == want {
				out = append(out, d.v2Maintenance(m, now))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"page": page, "scheduled_maintenances": out})
	default:
		writeError(w, http.StatusNotFound, "unknown v2 document")
	}
}

// ── Prometheus exposition ──────────────────────────────────────────────────
//
// Hand-written text format rather than client_golang: these are gauges read
// from the View at scrape time, so a registry would only add a second copy of
// state that already exists.

func promEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`).Replace(s)
}

func (d *dashboard) handleMetrics(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	var b strings.Builder
	metric := func(name, help, typ string) {
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, typ)
	}
	lbl := func(s ServiceView, extra ...string) string {
		parts := []string{fmt.Sprintf(`service="%s"`, promEscape(s.Name)), fmt.Sprintf(`group="%s"`, promEscape(s.Group))}
		for i := 0; i+1 < len(extra); i += 2 {
			parts = append(parts, fmt.Sprintf(`%s="%s"`, extra[i], promEscape(extra[i+1])))
		}
		return "{" + strings.Join(parts, ",") + "}"
	}
	b01 := func(x bool) int {
		if x {
			return 1
		}
		return 0
	}

	metric("rmh_status_up", "1 when the service's last probe was up.", "gauge")
	for _, s := range v.Services {
		fmt.Fprintf(&b, "rmh_status_up%s %d\n", lbl(s), b01(s.Status == StatusUp))
	}
	metric("rmh_status_state", "Current display state, one series per state.", "gauge")
	for _, s := range v.Services {
		for _, st := range []Status{StatusUp, StatusDegraded, StatusDown, StatusMaintenance, StatusUnknown} {
			fmt.Fprintf(&b, "rmh_status_state%s %d\n", lbl(s, "state", string(st)), b01(s.Display == st))
		}
	}
	metric("rmh_status_latency_ms", "Latency of the last successful probe in milliseconds.", "gauge")
	for _, s := range v.Services {
		if s.LatencyMs != nil {
			fmt.Fprintf(&b, "rmh_status_latency_ms%s %d\n", lbl(s), *s.LatencyMs)
		}
	}
	metric("rmh_status_latency_quantile_ms", "Latency quantiles over the last hour in milliseconds.", "gauge")
	for _, s := range v.Services {
		for _, q := range []struct {
			name string
			v    *float64
		}{{"0.5", s.Latency1h.P50}, {"0.95", s.Latency1h.P95}, {"0.99", s.Latency1h.P99}} {
			if q.v != nil {
				fmt.Fprintf(&b, "rmh_status_latency_quantile_ms%s %g\n", lbl(s, "quantile", q.name), *q.v)
			}
		}
	}
	metric("rmh_status_uptime_ratio", "Fraction of checks up over a trailing window.", "gauge")
	for _, s := range v.Services {
		for _, win := range s.Windows {
			if win.UptimePct != nil {
				fmt.Fprintf(&b, "rmh_status_uptime_ratio%s %g\n", lbl(s, "window", win.Label), *win.UptimePct/100)
			}
		}
	}
	metric("rmh_status_checks_total", "Probes run against the service.", "counter")
	for _, s := range v.Services {
		fmt.Fprintf(&b, "rmh_status_checks_total%s %d\n", lbl(s), s.Counters.Checks)
	}
	metric("rmh_status_check_failures_total", "Failed probes by category.", "counter")
	for _, s := range v.Services {
		for _, k := range sortedKeys(s.Counters.Errors) {
			fmt.Fprintf(&b, "rmh_status_check_failures_total%s %d\n", lbl(s, "category", k), s.Counters.Errors[k])
		}
	}
	metric("rmh_status_http_responses_total", "HTTP responses by status class.", "counter")
	for _, s := range v.Services {
		for _, k := range sortedKeys(s.Counters.Codes) {
			fmt.Fprintf(&b, "rmh_status_http_responses_total%s %d\n", lbl(s, "class", k), s.Counters.Codes[k])
		}
	}
	metric("rmh_status_apdex", "Apdex score over the last hour (0-1).", "gauge")
	for _, s := range v.Services {
		if s.Apdex != nil {
			fmt.Fprintf(&b, "rmh_status_apdex%s %g\n", lbl(s), *s.Apdex)
		}
	}
	metric("rmh_status_flapping", "1 when the service changed state at least 4 times in the last hour.", "gauge")
	for _, s := range v.Services {
		fmt.Fprintf(&b, "rmh_status_flapping%s %d\n", lbl(s), b01(s.Flapping))
	}
	metric("rmh_status_in_maintenance", "1 inside a scheduled maintenance window.", "gauge")
	for _, s := range v.Services {
		fmt.Fprintf(&b, "rmh_status_in_maintenance%s %d\n", lbl(s), b01(s.InMaintenance))
	}
	metric("rmh_status_tls_cert_expiry_timestamp_seconds", "NotAfter of the certificate the service served.", "gauge")
	for _, s := range v.Services {
		if s.Probe.TLS != nil {
			fmt.Fprintf(&b, "rmh_status_tls_cert_expiry_timestamp_seconds%s %d\n", lbl(s), s.Probe.TLS.NotAfter/1000)
		}
	}
	metric("rmh_status_error_budget_remaining_ratio", "Unspent fraction of the error budget.", "gauge")
	metric("rmh_status_burn_rate", "Error-budget burn rate over the fast/slow windows.", "gauge")
	for _, s := range v.SLO.Services {
		l := fmt.Sprintf(`{service="%s",group="%s"}`, promEscape(s.Name), promEscape(s.Group))
		fmt.Fprintf(&b, "rmh_status_error_budget_remaining_ratio%s %g\n", l, s.BudgetRemaining)
		fmt.Fprintf(&b, "rmh_status_burn_rate{service=\"%s\",window=\"%s\"} %g\n", promEscape(s.Name), v.SLO.FastWindow, s.BurnFast)
		fmt.Fprintf(&b, "rmh_status_burn_rate{service=\"%s\",window=\"%s\"} %g\n", promEscape(s.Name), v.SLO.SlowWindow, s.BurnSlow)
	}
	metric("rmh_status_incidents_open", "Unresolved incidents.", "gauge")
	fmt.Fprintf(&b, "rmh_status_incidents_open %d\n", v.KPIs.OpenIncidents)
	metric("rmh_status_probe_cycles_total", "Probe cycles completed by this process.", "counter")
	fmt.Fprintf(&b, "rmh_status_probe_cycles_total %d\n", v.Self.Cycles)
	metric("rmh_status_probe_cycle_seconds", "Duration of the last probe cycle.", "gauge")
	fmt.Fprintf(&b, "rmh_status_probe_cycle_seconds %g\n", v.Self.LastCycleMs/1000)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.WriteString(w, b.String())
}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ── Badges ─────────────────────────────────────────────────────────────────
//
// Shields-style SVG badges for READMEs and other sites. These are images
// embedded on pages this one does not style, so their colours are the
// conventional badge palette rather than the page's tokens.

var badgeColors = map[string]string{
	"up": "#2ea44f", "degraded": "#dbab09", "down": "#d73a49",
	"maintenance": "#0969da", "unknown": "#8b949e",
}

// badgeTextWidth approximates the rendered width of 11px Verdana text.
func badgeTextWidth(s string) int {
	w := 0.0
	for _, r := range s {
		switch {
		case strings.ContainsRune("ijlI.,:;|! ", r):
			w += 3.5
		case strings.ContainsRune("mwMW%@", r):
			w += 10
		case r >= 'A' && r <= 'Z':
			w += 7.5
		default:
			w += 6.5
		}
	}
	return int(w) + 10
}

// RenderBadge draws a two-part badge.
func RenderBadge(label, message, state string) string {
	color := badgeColors[state]
	if color == "" {
		color = badgeColors["unknown"]
	}
	lw, mw := badgeTextWidth(label), badgeTextWidth(message)
	total := lw + mw
	esc := func(s string) string {
		var b strings.Builder
		_ = xml.EscapeText(&b, []byte(s))
		return b.String()
	}
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="20" role="img" aria-label="%s: %s">`+
		`<title>%s: %s</title>`+
		`<linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`+
		`<clipPath id="r"><rect width="%d" height="20" rx="3" fill="#fff"/></clipPath>`+
		`<g clip-path="url(#r)"><rect width="%d" height="20" fill="#555"/><rect x="%d" width="%d" height="20" fill="%s"/><rect width="%d" height="20" fill="url(#s)"/></g>`+
		`<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`+
		`<text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text>`+
		`<text x="%d" y="15" fill="#010101" fill-opacity=".3">%s</text><text x="%d" y="14">%s</text></g></svg>`,
		total, esc(label), esc(message), esc(label), esc(message),
		total, lw, lw, mw, color, total,
		lw/2, esc(label), lw/2, esc(label),
		lw+mw/2, esc(message), lw+mw/2, esc(message))
}

func (d *dashboard) handleBadge(w http.ResponseWriter, r *http.Request) {
	v := d.view()
	q := r.URL.Query()
	label := q.Get("label")
	state := string(v.Display)
	message := statusMetaMap[v.Display].label
	if v.Display == StatusUp {
		message = "operational"
	}
	if label == "" {
		label = "status"
	}

	slug := strings.TrimSuffix(r.PathValue("file"), ".svg")
	var s *ServiceView
	if slug != "" {
		s = v.Service(slug)
		if s == nil {
			http.NotFound(w, r)
			return
		}
		if q.Get("label") == "" {
			label = strings.ToLower(s.Name)
		}
		state = string(s.Display)
		message = strings.ToLower(statusMetaMap[s.Display].label)
	}

	if q.Get("style") == "uptime" {
		windowLabel := q.Get("window")
		if windowLabel == "" {
			windowLabel = "24h"
		}
		windows := v.KPIs.Windows
		if s != nil {
			windows = s.Windows
		}
		message = "no data"
		state = "unknown"
		for _, win := range windows {
			if win.Label == windowLabel && win.UptimePct != nil {
				message = fmt.Sprintf("%.2f%%", *win.UptimePct)
				switch {
				case *win.UptimePct >= v.SLO.Target*100:
					state = "up"
				case *win.UptimePct >= 99:
					state = "degraded"
				default:
					state = "down"
				}
			}
		}
		if q.Get("label") == "" {
			label = "uptime " + windowLabel
			if s != nil {
				label = strings.ToLower(s.Name) + " " + windowLabel
			}
		}
	}

	cors(w)
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	// Short cache: a badge is fetched by image proxies (GitHub's camo) that
	// honour max-age, and a stale "operational" an hour into an outage is the
	// one thing a status badge must not say.
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = io.WriteString(w, RenderBadge(label, message, state))
}

// ── Feeds ──────────────────────────────────────────────────────────────────

type feedEntry struct {
	ID, Title, Body, Link string
	At, Updated           int64
}

func (d *dashboard) feedEntries() []feedEntry {
	now := time.Now()
	var out []feedEntry
	for _, inc := range d.svc.store.Incidents() {
		var body strings.Builder
		for i := len(inc.Updates) - 1; i >= 0; i-- {
			u := inc.Updates[i]
			fmt.Fprintf(&body, "%s — %s: %s\n", time.UnixMilli(u.At).UTC().Format("2 Jan 15:04 UTC"), titleCase(u.State), u.Body)
		}
		if len(inc.Components) > 0 {
			fmt.Fprintf(&body, "Affected: %s\n", strings.Join(inc.Components, ", "))
		}
		out = append(out, feedEntry{
			ID: "incident-" + inc.ID, Title: fmt.Sprintf("[%s] %s", titleCase(inc.State), inc.Title),
			Body: body.String(), Link: d.svc.cfg.PageURL + "/incidents/" + inc.ID,
			At: inc.StartedAt, Updated: inc.UpdatedAt,
		})
	}
	for _, m := range d.svc.store.Maintenances() {
		body := fmt.Sprintf("Scheduled %s → %s.\n%s", time.UnixMilli(m.StartsAt).UTC().Format("2 Jan 2006 15:04"),
			time.UnixMilli(m.EndsAt).UTC().Format("2 Jan 2006 15:04 UTC"), m.Description)
		out = append(out, feedEntry{
			ID: "maintenance-" + m.ID, Title: fmt.Sprintf("[Maintenance · %s] %s", titleCase(strings.ReplaceAll(m.State(now), "_", " ")), m.Title),
			Body: body, Link: d.svc.cfg.PageURL + "/#maintenance", At: m.CreatedAt, Updated: m.CreatedAt,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Updated > out[j].Updated })
	if len(out) > 50 {
		out = out[:50]
	}
	return out
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func xmlEsc(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func (d *dashboard) handleRSS(w http.ResponseWriter, r *http.Request) {
	entries := d.feedEntries()
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>`)
	fmt.Fprintf(&b, `<title>%s status — incident history</title><link>%s/</link>`, xmlEsc(d.svc.cfg.PageName), xmlEsc(d.svc.cfg.PageURL))
	fmt.Fprintf(&b, `<atom:link href="%s/feed.rss" rel="self" type="application/rss+xml"/>`, xmlEsc(d.svc.cfg.PageURL))
	b.WriteString(`<description>Incidents and maintenance for every RMH Studios service.</description><language>en</language>`)
	fmt.Fprintf(&b, `<lastBuildDate>%s</lastBuildDate>`, time.Now().UTC().Format(time.RFC1123Z))
	for _, e := range entries {
		fmt.Fprintf(&b, `<item><title>%s</title><link>%s</link><guid isPermaLink="false">%s</guid><pubDate>%s</pubDate><description>%s</description></item>`,
			xmlEsc(e.Title), xmlEsc(e.Link), xmlEsc(e.ID), time.UnixMilli(e.Updated).UTC().Format(time.RFC1123Z), xmlEsc(e.Body))
	}
	b.WriteString(`</channel></rss>`)
	cors(w)
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = io.WriteString(w, b.String())
}

func (d *dashboard) handleAtom(w http.ResponseWriter, r *http.Request) {
	entries := d.feedEntries()
	updated := time.Now().UTC().Format(time.RFC3339)
	if len(entries) > 0 {
		updated = time.UnixMilli(entries[0].Updated).UTC().Format(time.RFC3339)
	}
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<feed xmlns="http://www.w3.org/2005/Atom">`)
	fmt.Fprintf(&b, `<id>%s/feed.atom</id><title>%s status — incident history</title><updated>%s</updated>`,
		xmlEsc(d.svc.cfg.PageURL), xmlEsc(d.svc.cfg.PageName), updated)
	fmt.Fprintf(&b, `<link rel="self" href="%s/feed.atom"/><link rel="alternate" href="%s/"/>`, xmlEsc(d.svc.cfg.PageURL), xmlEsc(d.svc.cfg.PageURL))
	fmt.Fprintf(&b, `<author><name>%s</name></author>`, xmlEsc(d.svc.cfg.PageName))
	for _, e := range entries {
		fmt.Fprintf(&b, `<entry><id>tag:status.rmhstudios.com,2026:%s</id><title>%s</title><link href="%s"/><published>%s</published><updated>%s</updated><content type="text">%s</content></entry>`,
			xmlEsc(e.ID), xmlEsc(e.Title), xmlEsc(e.Link),
			time.UnixMilli(e.At).UTC().Format(time.RFC3339), time.UnixMilli(e.Updated).UTC().Format(time.RFC3339), xmlEsc(e.Body))
	}
	b.WriteString(`</feed>`)
	cors(w)
	w.Header().Set("Content-Type", "application/atom+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = io.WriteString(w, b.String())
}

// icsEscape escapes an iCalendar TEXT value (RFC 5545 §3.3.11).
func icsEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`, "\r", "").Replace(s)
}

// handleICS serves maintenance windows as an iCalendar feed, so they land in
// the calendar of whoever has to plan around them.
func (d *dashboard) handleICS(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	stamp := func(ms int64) string { return time.UnixMilli(ms).UTC().Format("20060102T150405Z") }
	var b strings.Builder
	line := func(s string) { b.WriteString(s + "\r\n") }
	line("BEGIN:VCALENDAR")
	line("VERSION:2.0")
	line("PRODID:-//RMH Studios//Status//EN")
	line("CALSCALE:GREGORIAN")
	line("X-WR-CALNAME:" + icsEscape(d.svc.cfg.PageName+" maintenance"))
	for _, m := range d.svc.store.Maintenances() {
		line("BEGIN:VEVENT")
		line("UID:maintenance-" + m.ID + "@status.rmhstudios.com")
		line("DTSTAMP:" + stamp(now.UnixMilli()))
		line("DTSTART:" + stamp(m.StartsAt))
		line("DTEND:" + stamp(m.EndsAt))
		line("SUMMARY:" + icsEscape("Maintenance: "+m.Title))
		desc := m.Description
		if len(m.Components) > 0 {
			desc += "\nAffected: " + strings.Join(m.Components, ", ")
		}
		line("DESCRIPTION:" + icsEscape(desc))
		if d.svc.cfg.PageURL != "" {
			line("URL:" + d.svc.cfg.PageURL + "/#maintenance")
		}
		if m.State(now) == MaintCancelled {
			line("STATUS:CANCELLED")
		} else {
			line("STATUS:CONFIRMED")
		}
		line("END:VEVENT")
	}
	line("END:VCALENDAR")
	cors(w)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = io.WriteString(w, b.String())
}

// ── Admin API ──────────────────────────────────────────────────────────────
//
// Bearer-token writes for incidents, maintenance and announcements. With no
// STATUS_ADMIN_TOKEN configured every admin route is a 404: an unauthenticated
// status page must not even advertise that a write surface exists.

func (d *dashboard) admin(next func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := d.svc.cfg.AdminToken
		if token == "" {
			http.NotFound(w, r)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			w.Header().Set("WWW-Authenticate", `Bearer realm="status-admin"`)
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxAdminBody)
		next(w, r)
	}
}

func decode(r *http.Request, v any) error {
	if r.Body == nil {
		return errors.New("empty body")
	}
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}

func adminResult(w http.ResponseWriter, code int, v any, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case err != nil:
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeJSON(w, code, v)
	}
}

func (d *dashboard) adminCreateIncident(w http.ResponseWriter, r *http.Request) {
	var in IncidentInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	inc, err := d.svc.store.CreateIncident(in, time.Now())
	adminResult(w, http.StatusCreated, inc, err)
}

func (d *dashboard) adminIncidentUpdate(w http.ResponseWriter, r *http.Request) {
	var in IncidentInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	inc, err := d.svc.store.AddIncidentUpdate(r.PathValue("id"), in, time.Now())
	adminResult(w, http.StatusOK, inc, err)
}

func (d *dashboard) adminPatchIncident(w http.ResponseWriter, r *http.Request) {
	var in IncidentInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	inc, err := d.svc.store.PatchIncident(r.PathValue("id"), in, time.Now())
	adminResult(w, http.StatusOK, inc, err)
}

func (d *dashboard) adminDeleteIncident(w http.ResponseWriter, r *http.Request) {
	adminResult(w, http.StatusOK, map[string]bool{"deleted": true}, d.svc.store.DeleteIncident(r.PathValue("id")))
}

func (d *dashboard) adminCreateMaintenance(w http.ResponseWriter, r *http.Request) {
	var in MaintenanceInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	m, err := d.svc.store.CreateMaintenance(in, time.Now())
	adminResult(w, http.StatusCreated, m, err)
}

func (d *dashboard) adminPatchMaintenance(w http.ResponseWriter, r *http.Request) {
	var in MaintenanceInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	m, err := d.svc.store.UpdateMaintenance(r.PathValue("id"), in, time.Now())
	adminResult(w, http.StatusOK, m, err)
}

func (d *dashboard) adminCancelMaintenance(w http.ResponseWriter, r *http.Request) {
	m, err := d.svc.store.CancelMaintenance(r.PathValue("id"), time.Now())
	adminResult(w, http.StatusOK, m, err)
}

func (d *dashboard) adminDeleteMaintenance(w http.ResponseWriter, r *http.Request) {
	adminResult(w, http.StatusOK, map[string]bool{"deleted": true}, d.svc.store.DeleteMaintenance(r.PathValue("id")))
}

func (d *dashboard) adminCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	var in AnnouncementInput
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	a, err := d.svc.store.CreateAnnouncement(in, time.Now())
	adminResult(w, http.StatusCreated, a, err)
}

func (d *dashboard) adminListAnnouncements(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"announcements": d.svc.store.AllAnnouncements()})
}

func (d *dashboard) adminDeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	adminResult(w, http.StatusOK, map[string]bool{"deleted": true}, d.svc.store.DeleteAnnouncement(r.PathValue("id")))
}

// adminTestWebhook sends a test notification to every configured webhook.
func (d *dashboard) adminTestWebhook(w http.ResponseWriter, r *http.Request) {
	if d.svc.notifier == nil {
		writeError(w, http.StatusBadRequest, "no webhooks configured (STATUS_WEBHOOK_URLS)")
		return
	}
	d.svc.notifier.Notify(Notification{Event: "announcement.created", Announcement: &Announcement{
		ID: "test", Message: "Test notification from the status page.", Level: "info", CreatedAt: time.Now().UnixMilli(),
	}})
	writeJSON(w, http.StatusAccepted, map[string]any{"queued": len(d.svc.notifier.URLs)})
}
