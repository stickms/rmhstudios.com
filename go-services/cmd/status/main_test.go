package main

import (
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/internal/status"
)

// default*URL mirror the corresponding env defaults in main(): everything a
// user touches is probed through the PUBLIC origin (so the probe traverses DNS
// → CDN → Apache → container, the same path a visitor takes), while the
// internal-only services use compose DNS names.
const (
	publicOrigin         = "https://rmhstudios.com"
	defaultReadyURL      = publicOrigin + "/api/ready"
	defaultFeedURL       = publicOrigin + "/blog.rss.xml"
	defaultSitemapURL    = publicOrigin + "/sitemap.xml"
	defaultSocketURL     = publicOrigin + "/socket/health"
	defaultRMHBoxURL     = publicOrigin + "/rmhbox-ws/health"
	defaultRMHTubeURL    = publicOrigin + "/rmhtube-ws/health"
	defaultAssetsURL     = "http://assets:7007/health"
	defaultSupervisorURL = "http://supervisor:9090/health"
)

// defaultURLs returns the default URL set used by main(), so each test starts
// from the same baseline and overrides only what it exercises.
func defaultURLs() probeURLs {
	return probeURLs{
		Website:    publicOrigin + "/",
		Ready:      defaultReadyURL,
		Feed:       defaultFeedURL,
		Sitemap:    defaultSitemapURL,
		Socket:     defaultSocketURL,
		RMHBox:     defaultRMHBoxURL,
		RMHTube:    defaultRMHTubeURL,
		Assets:     defaultAssetsURL,
		Supervisor: defaultSupervisorURL,
	}
}

// httpTargetNames are every HTTP (non-Database) target buildTargets emits.
var httpTargetNames = []string{
	"Website", "App readiness", "Realtime / Games", "RMHbox", "RMHtube",
	"Content feed", "Sitemap", "Assets", "Background workers",
}

// TestBuildTargetsOmitsDatabaseWithoutDSN asserts that with DATABASE_URL unset
// the Database probe target is omitted, and the HTTP targets are all present.
func TestBuildTargetsOmitsDatabaseWithoutDSN(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)

	if len(targets) != len(httpTargetNames) {
		t.Fatalf("expected %d targets without DATABASE_URL, got %d", len(httpTargetNames), len(targets))
	}
	for _, name := range httpTargetNames {
		if findTarget(targets, name) == nil {
			t.Fatalf("missing expected target %q", name)
		}
	}
	if findTarget(targets, "Database") != nil {
		t.Fatalf("Database target must be omitted when DATABASE_URL is unset")
	}
}

// TestBuildTargetsIncludesDatabaseWithDSN asserts that with DATABASE_URL set the
// Database probe target is appended with an injected Probe func, and that HTTP
// targets carry no Probe func.
func TestBuildTargetsIncludesDatabaseWithDSN(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db")

	targets := buildTargets(defaultURLs(), 4*time.Second)

	if len(targets) != len(httpTargetNames)+1 {
		t.Fatalf("expected %d targets with DATABASE_URL, got %d", len(httpTargetNames)+1, len(targets))
	}

	db := findTarget(targets, "Database")
	if db == nil {
		t.Fatal("Database target missing when DATABASE_URL is set")
	}
	if db.Probe == nil {
		t.Fatal("Database target must have an injected Probe func")
	}
	if db.Group != "Core" {
		t.Fatalf("Database target group = %q, want Core", db.Group)
	}
	for _, name := range httpTargetNames {
		if tg := findTarget(targets, name); tg != nil && tg.Probe != nil {
			t.Fatalf("HTTP target %q unexpectedly has a Probe func", name)
		}
	}
}

// TestRemovedTopologyTargetsAreGone is the regression guard for the reason this
// service was retargeted: it used to probe a Go `gateway` and a standalone
// `RMHmusic` hub, both DELETED with the Go realtime topology (rewrite §5.2).
// A probe for a service that does not exist is either dead config or a green
// tile for nothing — neither belongs on a status page.
func TestRemovedTopologyTargetsAreGone(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)

	for _, gone := range []string{"Gateway", "RMHmusic", "Recap runner"} {
		if findTarget(targets, gone) != nil {
			t.Fatalf("target %q belongs to the removed Go realtime topology and must not be probed", gone)
		}
	}
	for _, tg := range targets {
		for _, dead := range []string{"gateway", "rmhmusic-ws", "recap", ":7004", ":7002"} {
			if strings.Contains(tg.URL, dead) {
				t.Fatalf("target %q still points at removed infrastructure: %q", tg.Name, tg.URL)
			}
		}
	}
}

// TestFunctionalProbesAssertContent is the core of the "actually test the
// website" change: the user-path targets must assert on RESPONSE BODY, not just
// on a status code. Without these, a web container serving a 200 empty shell
// with a dead database reads as fully operational.
func TestFunctionalProbesAssertContent(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)

	for _, c := range []struct{ name, want string }{
		{"Website", `id="main-content"`},
		{"App readiness", `"status":"ok"`},
		{"Content feed", "<rss"},
		{"Sitemap", "<urlset"},
	} {
		tg := findTarget(targets, c.name)
		if tg == nil {
			t.Fatalf("missing functional target %q", c.name)
		}
		if tg.Expect != c.want {
			t.Fatalf("%q Expect = %q, want %q", c.name, tg.Expect, c.want)
		}
	}
}

// TestLatencyBudgetsSet asserts every HTTP target on the user path carries a
// DegradedAfter budget, so a service that answers but crawls is reported
// degraded rather than green. The two internal-only targets are exempt.
func TestLatencyBudgetsSet(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)
	exempt := map[string]bool{"Assets": true, "Background workers": true}

	for _, tg := range targets {
		if tg.Probe != nil || exempt[tg.Name] {
			continue
		}
		if tg.DegradedAfter <= 0 {
			t.Fatalf("user-path target %q has no latency budget", tg.Name)
		}
	}
}

// TestEveryTargetIsGrouped asserts the dashboard's section headings have data
// to work with — an ungrouped target would silently render in the wrong block.
func TestEveryTargetIsGrouped(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db")

	valid := map[string]bool{"Core": true, "Realtime": true, "Content": true, "Platform": true}
	for _, tg := range buildTargets(defaultURLs(), 4*time.Second) {
		if !valid[tg.Group] {
			t.Fatalf("target %q has unexpected group %q", tg.Name, tg.Group)
		}
	}
}

// TestBuildTargetsSupervisorURLOverride asserts STATUS_SUPERVISOR_URL is honored
// (passed through buildTargets) — a custom URL appears on the supervisor target.
func TestBuildTargetsSupervisorURLOverride(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	const custom = "http://localhost:19090/health"
	urls := defaultURLs()
	urls.Supervisor = custom
	targets := buildTargets(urls, 4*time.Second)

	bg := findTarget(targets, "Background workers")
	if bg == nil || bg.URL != custom {
		t.Fatalf("supervisor override not honored: %+v", bg)
	}
}

// TestBuildTargetsURLsFlowThrough asserts every target carries the resolved URL
// passed in (default → STATUS_<svc>_URL override) unchanged.
func TestBuildTargetsURLsFlowThrough(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)
	for _, c := range []struct{ name, want string }{
		{"Website", publicOrigin + "/"},
		{"App readiness", defaultReadyURL},
		{"Realtime / Games", defaultSocketURL},
		{"RMHbox", defaultRMHBoxURL},
		{"RMHtube", defaultRMHTubeURL},
		{"Content feed", defaultFeedURL},
		{"Sitemap", defaultSitemapURL},
		{"Assets", defaultAssetsURL},
	} {
		if tg := findTarget(targets, c.name); tg == nil || tg.URL != c.want {
			t.Fatalf("%q URL = %+v, want %q", c.name, tg, c.want)
		}
	}

	// Overrides (e.g. probing a staging origin) flow through unchanged.
	overridden := buildTargets(probeURLs{
		Website:    "https://staging.rmhstudios.com/",
		Ready:      "https://staging.rmhstudios.com/api/ready",
		Feed:       "https://staging.rmhstudios.com/blog.rss.xml",
		Sitemap:    "https://staging.rmhstudios.com/sitemap.xml",
		Socket:     "http://socket-server:7001/health",
		RMHBox:     "http://rmhbox:7676/health",
		RMHTube:    "http://rmhtube:7003/health",
		Assets:     defaultAssetsURL,
		Supervisor: defaultSupervisorURL,
	}, 4*time.Second)
	for _, c := range []struct{ name, want string }{
		{"Website", "https://staging.rmhstudios.com/"},
		{"Realtime / Games", "http://socket-server:7001/health"},
		{"RMHbox", "http://rmhbox:7676/health"},
		{"RMHtube", "http://rmhtube:7003/health"},
	} {
		if tg := findTarget(overridden, c.name); tg == nil || tg.URL != c.want {
			t.Fatalf("override %q URL = %+v, want %q", c.name, tg, c.want)
		}
	}
}

// TestOriginOf asserts the public-origin derivation used to build the public
// probe URLs from STATUS_WEBSITE_URL: scheme://host with any path/slash dropped.
func TestOriginOf(t *testing.T) {
	cases := []struct{ in, want string }{
		{"https://rmhstudios.com/", "https://rmhstudios.com"},
		{"https://rmhstudios.com", "https://rmhstudios.com"},
		{"https://staging.rmhstudios.com/some/path", "https://staging.rmhstudios.com"},
		{"http://localhost:7005/", "http://localhost:7005"},
		// Not a parseable scheme+host → trimmed as-is.
		{"rmhstudios.com/", "rmhstudios.com"},
	}
	for _, c := range cases {
		if got := originOf(c.in); got != c.want {
			t.Errorf("originOf(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func findTarget(targets []status.Target, name string) *status.Target {
	for i := range targets {
		if targets[i].Name == name {
			return &targets[i]
		}
	}
	return nil
}
