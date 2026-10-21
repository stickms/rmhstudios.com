package status

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestBarSeverity pins the rule that replaced "any failed check paints the
// hour red": a bar is classified by the SHARE of its checks that failed.
func TestBarSeverity(t *testing.T) {
	for _, c := range []struct {
		name string
		b    Bucket
		want string
	}{
		{"no checks", Bucket{}, "empty"},
		{"maintenance only", Bucket{Maint: 30}, "maint"},
		{"all up", Bucket{Up: 240}, "up"},
		{"one timeout in an hour is a blip", Bucket{Up: 239, Down: 1}, "blip"},
		{"four failures is still a blip", Bucket{Up: 236, Down: 2, Degraded: 2}, "blip"},
		{"5% slow is a partial disruption", Bucket{Up: 228, Degraded: 12}, "degraded"},
		{"9% down is partial, not major", Bucket{Up: 218, Down: 22}, "degraded"},
		{"10% down is major", Bucket{Up: 216, Down: 24}, "down"},
		{"maintenance does not count against the bucket", Bucket{Up: 200, Maint: 40}, "up"},
	} {
		if got := BarSeverity(c.b); got != c.want {
			t.Errorf("%s: BarSeverity(%+v) = %q, want %q", c.name, c.b, got, c.want)
		}
	}
}

// TestStripAgreesWithUptime is the regression for the screenshot that started
// this: a service at ~99.4% uptime whose failures are scattered single-check
// timeouts must not render a single red bar.
func TestStripAgreesWithUptime(t *testing.T) {
	p := NewProber([]Target{{Name: "Website", Group: "Core"}})
	now := time.Now().UTC()
	h := p.hist["Website"]
	cur := floorTo(now.UnixMilli(), time.Hour.Milliseconds())
	for i := 89; i >= 0; i-- {
		b := Bucket{T: cur - int64(i)*time.Hour.Milliseconds(), Up: 239, Down: 1}
		if i%3 == 0 {
			b = Bucket{T: b.T, Up: 238, Down: 2}
		}
		h.buckets = append(h.buckets, b)
	}
	h.last = ServiceStatus{Name: "Website", Group: "Core", Status: StatusUp, CheckedAt: now.Format(isoMillis)}

	snap := p.Snapshot()
	if pct := *snap.Service("Website").UptimePct; pct < 99 || pct >= 100 {
		t.Fatalf("fixture uptime = %.2f, want ~99.4", pct)
	}
	out := renderFixture(p)
	strip := regexp.MustCompile(`(?s)data-range="hours" role="img"[^>]*>(.*?)</div>`).FindStringSubmatch(out)
	if strip == nil {
		t.Fatal("no hourly strip rendered")
	}
	if n := strings.Count(strip[1], `data-b="down"`); n != 0 {
		t.Errorf("%d red bars for a 99.4%% service made of single-check blips", n)
	}
	if n := strings.Count(strip[1], `data-b="blip"`); n != 90 {
		t.Errorf("want 90 blip bars, got %d", n)
	}
}

// TestStripAlignsToWallClock asserts a gap in the prober's own history shows
// as empty slots rather than compressing time.
func TestStripAlignsToWallClock(t *testing.T) {
	now := time.Now().UTC()
	hr := time.Hour.Milliseconds()
	cur := floorTo(now.UnixMilli(), hr)
	buckets := []Bucket{{T: cur - 5*hr, Up: 10}, {T: cur, Up: 10}}
	out := renderStrip(buckets, 6, time.Hour, now, "bar", "15:04")
	bars := regexp.MustCompile(`data-b="(\w+)"`).FindAllStringSubmatch(out, -1)
	var got []string
	for _, b := range bars {
		got = append(got, b[1])
	}
	want := []string{"up", "empty", "empty", "empty", "empty", "up"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("strip = %v, want %v", got, want)
	}
}

// TestRecordTracksLatencyAndRollups covers the per-check bookkeeping: latency
// aggregates and histogram, the daily rollup, the raw ring, code classes and
// failure categories.
func TestRecordTracksLatencyAndRollups(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer ok.Close()
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(502) }))
	defer bad.Close()

	p := NewProber([]Target{{Name: "ok", URL: ok.URL}, {Name: "bad", URL: bad.URL}})
	for i := 0; i < 3; i++ {
		p.ProbeOnce(context.Background())
	}
	h := p.hist["ok"]
	if len(h.daily) != 1 || h.daily[0].Up != 3 {
		t.Fatalf("daily rollup = %+v", h.daily)
	}
	if b := h.buckets[len(h.buckets)-1]; b.LatN != 3 || len(b.LatHist) != len(latencyBounds)+1 {
		t.Fatalf("latency aggregate missing: %+v", b)
	}
	if len(h.recent) != 3 || h.ctr.Codes["2xx"] != 3 || h.ctr.Checks != 3 {
		t.Fatalf("ring/counters wrong: ring=%d ctr=%+v", len(h.recent), h.ctr)
	}
	hb := p.hist["bad"]
	if hb.ctr.Errors[CatHTTP5xx] != 3 || hb.ctr.Codes["5xx"] != 3 {
		t.Fatalf("failure categories wrong: %+v", hb.ctr)
	}
	if hb.detail.Phases == nil || hb.detail.Code != 502 || hb.detail.Proto == "" {
		t.Fatalf("probe detail not captured: %+v", hb.detail)
	}
}

// TestRecentRingIsBounded asserts the raw ring never grows past its cap.
func TestRecentRingIsBounded(t *testing.T) {
	lat := int64(1)
	p := NewProber([]Target{{Name: "x", Probe: func(context.Context) ProbeResult { return ProbeResult{Status: StatusUp, LatencyMs: &lat} }}})
	p.recentCap = 5
	for i := 0; i < 12; i++ {
		p.ProbeOnce(context.Background())
	}
	if n := len(p.hist["x"].recent); n != 5 {
		t.Fatalf("ring holds %d samples, want 5", n)
	}
}

// flaky is a custom probe whose verdict the test controls.
type flaky struct{ st Status }

func (f *flaky) probe(context.Context) ProbeResult {
	lat := int64(5)
	if f.st == StatusUp {
		return ProbeResult{Status: StatusUp, LatencyMs: &lat, Detail: "ok"}
	}
	return ProbeResult{Status: f.st, Detail: "boom"}
}

// TestAutoIncidentLifecycle: a one-check failure is a blip, a streak of
// openAfter opens an incident dated from its FIRST failed check, and
// closeAfter good checks resolve it.
func TestAutoIncidentLifecycle(t *testing.T) {
	f := &flaky{st: StatusUp}
	svc := New(Config{Targets: []Target{{Name: "api", Group: "Core", Probe: f.probe}}})
	p, st := svc.prober, svc.store
	run := func(s Status) { f.st = s; p.ProbeOnce(context.Background()) }

	run(StatusUp)
	run(StatusDown)
	run(StatusUp)
	if n := len(st.Incidents()); n != 0 {
		t.Fatalf("a single failed check opened %d incidents", n)
	}
	if p.hist["api"].ctr.Blips != 1 {
		t.Fatalf("blip not counted: %+v", p.hist["api"].ctr)
	}

	run(StatusDown)
	firstFail := p.hist["api"].ctr.FailStreakStart
	run(StatusDown)
	run(StatusDown)
	incs := st.Incidents()
	if len(incs) != 1 || incs[0].Resolved() {
		t.Fatalf("want one open incident, got %+v", incs)
	}
	inc := incs[0]
	if inc.StartedAt != firstFail || inc.Kind != "auto" || inc.Impact != ImpactCritical || inc.FailedChecks != 3 {
		t.Fatalf("incident fields wrong: %+v (first fail %d)", inc, firstFail)
	}

	run(StatusUp)
	if st.Incidents()[0].Resolved() {
		t.Fatal("resolved after one good check; closeAfter is 2")
	}
	run(StatusUp)
	if got := st.Incidents()[0]; !got.Resolved() || got.ResolvedAt == 0 || len(got.Updates) != 2 {
		t.Fatalf("incident not resolved: %+v", got)
	}
}

// TestMaintenanceIsExcluded: failures inside a window cost no uptime, open no
// incident, and the component displays as under maintenance.
func TestMaintenanceIsExcluded(t *testing.T) {
	f := &flaky{st: StatusDown}
	svc := New(Config{Targets: []Target{{Name: "db", Group: "Core", Probe: f.probe}}})
	now := time.Now()
	title := "Upgrade"
	starts, ends := now.Add(-time.Minute).UnixMilli(), now.Add(time.Hour).UnixMilli()
	comps := []string{"db"}
	if _, err := svc.store.CreateMaintenance(MaintenanceInput{Title: &title, StartsAt: &starts, EndsAt: &ends, Components: &comps}, now); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		svc.prober.ProbeOnce(context.Background())
	}
	b := svc.prober.hist["db"].buckets[0]
	if b.Maint != 4 || b.Total() != 0 {
		t.Fatalf("maintenance checks counted against uptime: %+v", b)
	}
	if n := len(svc.store.Incidents()); n != 0 {
		t.Fatalf("maintenance opened %d incidents", n)
	}
	v := svc.View(time.Now())
	if s := v.Service("db"); s.Display != StatusMaintenance || !s.InMaintenance {
		t.Fatalf("display = %q, want maintenance", s.Display)
	}
	if v.Indicator != "maintenance" {
		t.Fatalf("indicator = %q", v.Indicator)
	}
}

// TestExtendedStateRoundTrip: daily rollups, the ring and counters survive a
// restart, and a pre-existing hourly history with no extended file has its
// daily view rebuilt from the hourly one.
func TestExtendedStateRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, HistoryFileName)
	f := &flaky{st: StatusUp}
	targets := []Target{{Name: "x", Probe: f.probe}}

	p1 := NewProber(targets)
	p1.EnableHistoryPersistence(path, nil)
	p1.ProbeOnce(context.Background())
	f.st = StatusDown
	p1.ProbeOnce(context.Background())
	p1.SaveHistory()

	p2 := NewProber(targets)
	p2.EnableHistoryPersistence(path, nil)
	h := p2.hist["x"]
	if len(h.daily) != 1 || h.daily[0].Up != 1 || h.daily[0].Down != 1 {
		t.Fatalf("daily not restored: %+v", h.daily)
	}
	if len(h.recent) != 2 || h.ctr.Checks != 2 || h.ctr.ConsecFail != 1 {
		t.Fatalf("ring/counters not restored: ring=%d ctr=%+v", len(h.recent), h.ctr)
	}

	// Backfill: same hourly file, extended file gone.
	if err := writeFileAtomic(filepath.Join(dir, ExtendedFileName), []byte("{}")); err != nil {
		t.Fatal(err)
	}
	p3 := NewProber(targets)
	p3.EnableHistoryPersistence(path, nil)
	if d := p3.hist["x"].daily; len(d) != 1 || d[0].Total() != 2 {
		t.Fatalf("daily not rebuilt from hourly history: %+v", d)
	}
}

// TestIncidentStorePersists: incidents, maintenance and announcements survive
// a restart.
func TestIncidentStorePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), IncidentsFileName)
	targets := []Target{{Name: "web"}}
	s1 := NewStore(targets, path, nil, nil)
	now := time.Now()
	title := "Broken"
	if _, err := s1.CreateIncident(IncidentInput{Title: &title}, now); err != nil {
		t.Fatal(err)
	}
	if _, err := s1.CreateAnnouncement(AnnouncementInput{Message: "hello"}, now); err != nil {
		t.Fatal(err)
	}
	s2 := NewStore(targets, path, nil, nil)
	if len(s2.Incidents()) != 1 || len(s2.Announcements(now)) != 1 {
		t.Fatalf("store not restored: %d incidents, %d announcements", len(s2.Incidents()), len(s2.Announcements(now)))
	}
}

func TestIncidentValidation(t *testing.T) {
	s := NewStore([]Target{{Name: "web"}}, "", nil, nil)
	now := time.Now()
	empty, title, bogus := "", "x", "catastrophic"
	unknown := []string{"nope"}
	for name, in := range map[string]IncidentInput{
		"missing title":     {Title: &empty},
		"bad impact":        {Title: &title, Impact: &bogus},
		"bad state":         {Title: &title, State: &bogus},
		"unknown component": {Title: &title, Components: &unknown},
	} {
		if _, err := s.CreateIncident(in, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if _, err := s.CreateAnnouncement(AnnouncementInput{Message: "x", Link: "javascript:alert(1)"}, now); err == nil {
		t.Error("announcement accepted a javascript: link")
	}
}

// TestAdminAPI covers the token gate and a full incident lifecycle over HTTP.
func TestAdminAPI(t *testing.T) {
	do := func(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	off := New(Config{Targets: []Target{{Name: "web", URL: "http://x"}}}).Handler()
	if rec := do(off, "POST", "/api/admin/incidents", "anything", `{"title":"x"}`); rec.Code != 404 {
		t.Fatalf("admin API reachable with no token configured: %d", rec.Code)
	}

	svc := New(Config{Targets: []Target{{Name: "web", URL: "http://x"}}, AdminToken: "s3cret"})
	h := svc.Handler()
	if rec := do(h, "POST", "/api/admin/incidents", "wrong", `{"title":"x"}`); rec.Code != 401 {
		t.Fatalf("wrong token: %d", rec.Code)
	}
	rec := do(h, "POST", "/api/admin/incidents", "s3cret", `{"title":"Login errors","impact":"major","components":["web"],"body":"Looking into it."}`)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	var inc Incident
	_ = json.Unmarshal(rec.Body.Bytes(), &inc)
	if inc.ID == "" || inc.Impact != ImpactMajor || inc.State != StateInvestigating {
		t.Fatalf("created incident wrong: %+v", inc)
	}
	rec = do(h, "POST", "/api/admin/incidents/"+inc.ID+"/updates", "s3cret", `{"state":"resolved","body":"Fixed."}`)
	if rec.Code != 200 {
		t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
	}
	got, _ := svc.store.Incident(inc.ID)
	if !got.Resolved() || len(got.Updates) != 2 {
		t.Fatalf("incident not resolved: %+v", got)
	}
	if rec := do(h, "PATCH", "/api/admin/incidents/"+inc.ID, "s3cret", `{"postmortem":"Root cause: DNS."}`); rec.Code != 200 {
		t.Fatalf("patch: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/admin/incidents/nope/updates", "s3cret", `{"body":"x"}`); rec.Code != 404 {
		t.Fatalf("unknown incident: %d", rec.Code)
	}
	if rec := do(h, "POST", "/api/admin/maintenance", "s3cret", `{"title":"m","startsAt":1,"endsAt":0}`); rec.Code != 400 {
		t.Fatalf("invalid window accepted: %d", rec.Code)
	}

	// The incident page and the feeds now carry it.
	for path, want := range map[string]string{
		"/incidents/" + inc.ID: "Root cause: DNS.",
		"/feed.rss":            "Login errors",
		"/feed.atom":           "Login errors",
		"/history":             "Login errors",
	} {
		rec := do(h, "GET", path, "", "")
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), want) {
			t.Errorf("GET %s: %d, missing %q", path, rec.Code, want)
		}
	}
}

// TestPublicEndpoints smoke-tests every read surface against the rich fixture.
func TestPublicEndpoints(t *testing.T) {
	h := richService(t).Handler()
	for path, want := range map[string]string{
		"/":                        "Major outage",
		"/api/dashboard":           `"indicator"`,
		"/api/dashboard?compact=1": `"windows"`,
		"/api/services":            `"services"`,
		"/api/services/website":    `"slug": "website"`,
		"/api/uptime":              `"platform"`,
		"/api/history?range=daily&service=rmhbox":      `"rmhbox"`,
		"/api/history.csv":                             "service,group,bucket_start_utc",
		"/api/incidents?status=open":                   "RMHbox outage",
		"/api/maintenance":                             "PostgreSQL 18",
		"/api/announcements":                           "Statuspage-compatible",
		"/api/v2/status.json":                          `"indicator"`,
		"/api/v2/summary.json":                         `"scheduled_maintenances"`,
		"/api/v2/components.json":                      `"major_outage"`,
		"/api/v2/incidents.json":                       `"incident_updates"`,
		"/api/v2/incidents/unresolved.json":            "RMHbox outage",
		"/api/v2/scheduled-maintenances/upcoming.json": "PostgreSQL 18",
		"/metrics":   `rmh_status_up{service="Website",group="Core"} 1`,
		"/badge.svg": "<svg",
		"/badge/website.svg?style=uptime&window=7d": "website 7d",
		"/feed.rss":             "<rss",
		"/feed.atom":            "<feed",
		"/maintenance.ics":      "BEGIN:VEVENT",
		"/history":              "Every incident",
		"/report":               "met target",
		"/embed":                "operational",
		"/embed.js":             "data-rmh-status",
		"/manifest.webmanifest": `"start_url"`,
		"/robots.txt":           "User-agent",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 {
			t.Errorf("GET %s: HTTP %d", path, rec.Code)
			continue
		}
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("GET %s: missing %q", path, want)
		}
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/badge/nope.svg", nil))
	if rec.Code != 404 {
		t.Errorf("unknown badge: %d", rec.Code)
	}
}

// TestAPIStatusShapeUnchanged guards the Node-compatible contract: every new
// statistic went to a NEW endpoint, and /api/status's per-service keys are
// exactly the original eight.
func TestAPIStatusShapeUnchanged(t *testing.T) {
	h := richService(t).Handler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/status", nil))
	var body struct {
		Services []map[string]any `json:"services"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	var keys []string
	for k := range body.Services[0] {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	want := "checkedAt,description,detail,group,latencyMs,name,status,uptimePct"
	if got := strings.Join(keys, ","); got != want {
		t.Fatalf("/api/status service keys = %s, want %s", got, want)
	}
}

func TestGzip(t *testing.T) {
	h := richService(t).Handler()
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("dashboard not compressed")
	}
	plain := httptest.NewRecorder()
	h.ServeHTTP(plain, httptest.NewRequest("GET", "/", nil))
	if rec.Body.Len()*4 > plain.Body.Len() {
		t.Fatalf("gzip saved too little: %d vs %d", rec.Body.Len(), plain.Body.Len())
	}
}

func TestLatencyStats(t *testing.T) {
	ls := exactLatency("1h", []int64{10, 20, 30, 40, 50, 60, 70, 80, 90, 100})
	if *ls.P50 != 50 || *ls.P95 != 100 || *ls.Avg != 55 || *ls.Min != 10 {
		t.Fatalf("exact stats wrong: p50=%v p95=%v avg=%v", *ls.P50, *ls.P95, *ls.Avg)
	}
	var b Bucket
	for _, l := range []int64{40, 45, 60, 80, 90, 120, 150, 180, 190, 900} {
		b.addLatency(l)
	}
	for _, q := range []float64{0.5, 0.95, 0.99} {
		v := histQuantile(b, q)
		if v < float64(b.LatMin) || v > float64(b.LatMax) {
			t.Errorf("q%.2f = %v outside [%d, %d]", q, v, b.LatMin, b.LatMax)
		}
	}
	if p50 := histQuantile(b, 0.5); p50 < 50 || p50 > 200 {
		t.Errorf("p50 estimate %v implausible", p50)
	}
}

func TestApdex(t *testing.T) {
	l := func(v int64) *int64 { return &v }
	s := []Sample{
		{T: 10, S: StatusUp, L: l(100)},        // satisfied
		{T: 10, S: StatusUp, L: l(1500)},       // tolerating
		{T: 10, S: StatusDegraded, L: l(9000)}, // frustrated
		{T: 10, S: StatusDown},                 // failure
	}
	got := apdex(s, 0, 500*time.Millisecond)
	if got == nil || *got != 0.38 {
		t.Fatalf("apdex = %v, want 0.38", got)
	}
}

func TestWebhookPayloads(t *testing.T) {
	var got []map[string]any
	var sigs []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		got = append(got, m)
		sigs = append(sigs, r.Header.Get("X-Status-Signature"))
		if want := "sha256=" + SignPayload("k", b); r.Header.Get("X-Status-Signature") != want {
			t.Errorf("bad signature")
		}
	}))
	defer srv.Close()
	n := NewWebhookNotifier([]string{srv.URL, "ftp://ignored"}, "k", "https://status.example", nil)
	if len(n.URLs) != 1 {
		t.Fatalf("non-http URL kept: %v", n.URLs)
	}
	inc := &Incident{ID: "abc", Title: "API down", Impact: ImpactMajor, Updates: []IncidentUpdate{{Body: "Investigating"}}}
	n.deliver(context.Background(), srv.URL, Notification{Event: "incident.created", Incident: inc})
	if len(got) != 1 || got[0]["event"] != "incident.created" || got[0]["url"] != "https://status.example/incidents/abc" {
		t.Fatalf("generic payload wrong: %+v", got)
	}

	discord, _ := n.payload("https://discord.com/api/webhooks/1/x", Notification{Event: "incident.created", Incident: inc})
	if !strings.Contains(string(discord), `"embeds"`) {
		t.Errorf("discord payload has no embeds: %s", discord)
	}
	slack, _ := n.payload("https://hooks.slack.com/services/x", Notification{Event: "incident.resolved", Incident: inc})
	if !strings.Contains(string(slack), `"text":"*Resolved: API down*`) {
		t.Errorf("slack payload wrong: %s", slack)
	}
}

func TestHumanDuration(t *testing.T) {
	for d, want := range map[time.Duration]string{
		45 * time.Second:             "45s",
		90 * time.Second:             "1m 30s",
		12 * time.Minute:             "12m",
		3*time.Hour + 20*time.Minute: "3h 20m",
		50 * time.Hour:               "2d 2h",
	} {
		if got := HumanDuration(d); got != want {
			t.Errorf("HumanDuration(%v) = %q, want %q", d, got, want)
		}
	}
}

func TestSlugify(t *testing.T) {
	for in, want := range map[string]string{"Realtime / Games": "realtime-games", "App readiness": "app-readiness", "!!!": "service"} {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
