package status

import (
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

// fixtureProber builds a prober with a realistic multi-tier snapshot and a half
// window of bucket history, so the render is exercised against real content
// (every tier, every state, a partly-filled uptime strip) rather than an empty
// page. One service is degraded and one is down, so the overall verdict, the
// tallies and the per-state styling all have something to say.
func fixtureProber(t *testing.T) (*Prober, Snapshot) {
	t.Helper()
	targets := []Target{
		{Name: "Website", Description: "Main rmhstudios.com web app (server-rendered)", Group: "Core"},
		{Name: "App readiness", Description: "Web tier's dependencies: database connectivity and client/schema agreement", Group: "Core"},
		{Name: "Database", Description: "PostgreSQL (direct connection, SELECT 1)", Group: "Core"},
		{Name: "Realtime / Games", Description: "Socket server: multiplayer games, presence, RMHmusic", Group: "Realtime"},
		{Name: "RMHbox", Description: "Party-game WebSocket server", Group: "Realtime"},
		{Name: "RMHtube", Description: "Watch-together WebSocket server", Group: "Realtime"},
		{Name: "Content feed", Description: "Public blog RSS — proves the database-backed render path", Group: "Content"},
		{Name: "Sitemap", Description: "Generated sitemap.xml — the discovery surface search engines read", Group: "Content"},
		{Name: "Background workers", Description: "Supervisor: discord-bot, recap, doctrine, vibe, bot-worker, streak-saver", Group: "Platform"},
	}
	p := NewProber(targets)

	now := time.Now().UTC()
	states := map[string]Status{
		"Content feed": StatusDegraded,
		"RMHtube":      StatusDown,
	}
	for i, tg := range targets {
		st := states[tg.Name]
		if st == "" {
			st = StatusUp
		}
		lat := int64(24 + i*17)
		h := p.hist[tg.Name]
		h.last = ServiceStatus{
			Name:        tg.Name,
			Description: tg.Description,
			Group:       tg.Group,
			Status:      st,
			LatencyMs:   &lat,
			Detail:      "HTTP 200",
			CheckedAt:   now.Format("2006-01-02T15:04:05.000Z07:00"),
			Up:          st == StatusUp,
		}
		start := now.Add(-time.Duration(p.maxBuckets/2) * p.bucketDur).UnixMilli()
		for b := 0; b < p.maxBuckets/2; b++ {
			bucket := Bucket{T: start + int64(b)*p.bucketDur.Milliseconds(), Up: 4}
			if b == 12 && i%3 == 0 {
				bucket = Bucket{T: bucket.T, Up: 3, Degraded: 1}
			}
			if b == 13 && i == 5 {
				bucket = Bucket{T: bucket.T, Down: 4}
			}
			h.buckets = append(h.buckets, bucket)
		}
	}
	return p, p.Snapshot()
}

// fixtureSLO is the burn-rate report these render tests pass to renderHTML.
//
// Empty on purpose. `renderHTML` grew a third parameter with the SLO work
// (E14) and these call sites were never updated, so the package's tests have
// not compiled since. This restores exactly what they asserted before that
// change: a populated report renders a per-service burn-rate row that the
// "one card per service" count also matches, which would turn a compile error
// into a wrong assertion.
//
// The SLO section's own rendering is therefore still uncovered. That test
// belongs with the SLO feature rather than being invented here.
func fixtureSLO(_ *Prober) SLOReport {
	return SLOReport{}
}

// TestRenderHTMLStructure covers the shape of the page every other assertion
// here depends on: the verdict in the title and the headline, one card per
// service with its state on it, a tier heading per group, and one globe pin per
// service (the script places pins by index, so a missing one silently shifts
// every later pin to the wrong place on the sphere).
func TestRenderHTMLStructure(t *testing.T) {
	p, snap := fixtureProber(t)
	out := renderHTML(snap, p, fixtureSLO(p))

	if !strings.HasPrefix(out, "<!doctype html>") {
		t.Fatal("render must be a complete document")
	}
	// One service is down, so the whole platform is.
	for _, want := range []string{
		`<html lang="en" data-status="down">`,
		"<title>Major outage — RMH Studios status</title>",
		"7 of 9 services responding",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q", want)
		}
	}

	for _, group := range []string{"Core", "Realtime", "Content", "Platform"} {
		if !strings.Contains(out, `<h2 class="tier__label">`+group+"</h2>") {
			t.Errorf("missing tier heading for %q", group)
		}
	}

	if got := strings.Count(out, `<li class="svc glass-fill"`); got != len(snap.Services) {
		t.Errorf("rendered %d service cards, want %d", got, len(snap.Services))
	}
	if got := strings.Count(out, `<li class="globe__pin"`); got != len(snap.Services) {
		t.Errorf("rendered %d globe pins, want one per service (%d)", got, len(snap.Services))
	}

	// The per-service state has to reach the markup: every colour on the page is
	// keyed off data-status, so a card that loses it renders in the neutral ink.
	for _, c := range []struct{ name, state string }{
		{"Website", "up"}, {"Content feed", "degraded"}, {"RMHtube", "down"},
	} {
		i := strings.Index(out, ">"+c.name+"</h3>")
		if i < 0 {
			t.Fatalf("missing card for %q", c.name)
		}
		start := i - 400
		if start < 0 {
			start = 0
		}
		if !strings.Contains(out[start:i], `data-status="`+c.state+`"`) {
			t.Errorf("card %q is not marked data-status=%q", c.name, c.state)
		}
	}

	// One bar per bucket in the window, for every service, so the strips line up
	// down the page instead of each ending wherever its own history does.
	wantBars := p.maxBuckets * len(snap.Services)
	if got := strings.Count(out, `<span class="bar"`); got != wantBars {
		t.Errorf("rendered %d bars, want %d (%d buckets x %d services)", got, wantBars, p.maxBuckets, len(snap.Services))
	}
}

// TestRenderHTMLIsSelfContained is the rule that matters most for THIS page: it
// is read precisely when the rest of the platform is unreachable, so it must not
// depend on any origin but its own. No stylesheet, script, font or image may be
// fetched — everything is inline. (The footer's link back to the site is a
// destination, not a dependency, and nothing loads from it.)
func TestRenderHTMLIsSelfContained(t *testing.T) {
	p, snap := fixtureProber(t)
	out := renderHTML(snap, p, fixtureSLO(p))

	for _, forbidden := range []string{
		"fonts.googleapis.com", "fonts.gstatic.com", "<script src", "unpkg.com", "jsdelivr",
	} {
		if strings.Contains(out, forbidden) {
			t.Errorf("page reaches off-origin for %q — a status page must load nothing but itself", forbidden)
		}
	}
	// Any <link> must be a data: URI (the inline favicon) — a stylesheet or an
	// icon file would be a network dependency.
	for _, m := range regexp.MustCompile(`<link[^>]*href="([^"]*)"`).FindAllStringSubmatch(out, -1) {
		if !strings.HasPrefix(m[1], "data:") {
			t.Errorf("<link> to %q is a network dependency", m[1])
		}
	}
}

// TestInlineAssetsAreWellFormed guards the one hazard of shipping a stylesheet
// and a script as Go raw string literals: nothing type-checks them, so a bad
// edit produces a page that still renders and still passes every markup
// assertion — with half its layout rules silently dropped, because a CSS parser
// that meets a line it cannot understand skips ahead to the next semicolon or
// brace and eats whatever real declarations were in between.
//
// The specific way that happens here is a Go comment convention leaking in:
// `//` is a comment in Go and in JavaScript, and is NOT one in CSS. So: every
// block comment must be closed, and the stylesheet must contain no line
// comments at all.
func TestInlineAssetsAreWellFormed(t *testing.T) {
	for _, c := range []struct{ name, src string }{
		{"stylesheet", dashboardCSS},
		{"script", dashboardJS},
	} {
		if open, closed := strings.Count(c.src, "/*"), strings.Count(c.src, "*/"); open != closed {
			t.Errorf("%s has %d block comments open and %d closed", c.name, open, closed)
		}
	}
	for i, line := range strings.Split(dashboardCSS, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "//") {
			t.Errorf("stylesheet line %d is a // comment, which CSS does not have: %q", i+1, line)
		}
	}
}

// TestRenderHTMLEscapesServiceText asserts service names, descriptions and probe
// details are escaped. Detail carries an upstream error string — the one field
// on this page whose content a remote server controls.
func TestRenderHTMLEscapesServiceText(t *testing.T) {
	p := NewProber([]Target{{Name: "Evil", Group: "Core"}})
	p.hist["Evil"].last = ServiceStatus{
		Name:        `Evil<script>alert(1)</script>`,
		Description: `desc " onload="alert(2)`,
		Group:       "Core",
		Status:      StatusDown,
		Detail:      `<img src=x onerror=alert(3)>`,
		CheckedAt:   "2026-08-01T00:00:00.000Z",
	}
	out := renderHTML(p.Snapshot(), p, fixtureSLO(p))

	for _, injected := range []string{"<script>alert(1)", `onload="alert(2)`, "<img src=x onerror"} {
		if strings.Contains(out, injected) {
			t.Errorf("unescaped service text reached the page: %q", injected)
		}
	}
	if !strings.Contains(out, "&lt;script&gt;alert(1)") {
		t.Error("expected the service name to be escaped, not dropped")
	}
}

// TestRenderHTMLNeverChecked asserts the not-yet-probed state reads as pending
// rather than as a 1970 timestamp — the epoch sentinel is a real value the page
// serves for the first few seconds of every restart.
func TestRenderHTMLNeverChecked(t *testing.T) {
	p := NewProber([]Target{{Name: "Website", Group: "Core"}})
	out := renderHTML(p.Snapshot(), p, fixtureSLO(p))

	if strings.Contains(out, "1970") {
		t.Error("the epoch sentinel leaked into the page as a date")
	}
	for _, want := range []string{"first check pending", "Last checked never", "no data"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in the never-checked render", want)
		}
	}
}

// TestDumpDashboard writes a rendered dashboard to STATUS_RENDER_DUMP so it can
// be opened in a browser. Skipped unless that env var is set.
func TestDumpDashboard(t *testing.T) {
	path := os.Getenv("STATUS_RENDER_DUMP")
	if path == "" {
		t.Skip("set STATUS_RENDER_DUMP=<file> to dump the rendered dashboard")
	}
	p, snap := fixtureProber(t)
	if err := os.WriteFile(path, []byte(renderHTML(snap, p, fixtureSLO(p))), 0o600); err != nil {
		t.Fatal(err)
	}
}
