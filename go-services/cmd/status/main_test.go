package main

import (
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/internal/status"
)

// default*URL mirror the corresponding env defaults in main(): the user-facing
// realtime hubs are probed through the PUBLIC origin (each hub's health under
// its WS prefix), while the internal-only services use Service/compose DNS.
const (
	publicOrigin         = "https://rmhstudios.com"
	defaultGatewayURL    = publicOrigin + "/health"
	defaultSocketURL     = publicOrigin + "/socket/health"
	defaultRMHMusicURL   = publicOrigin + "/rmhmusic-ws/health"
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
		Gateway:    defaultGatewayURL,
		Socket:     defaultSocketURL,
		RMHMusic:   defaultRMHMusicURL,
		RMHBox:     defaultRMHBoxURL,
		RMHTube:    defaultRMHTubeURL,
		Assets:     defaultAssetsURL,
		Supervisor: defaultSupervisorURL,
	}
}

// httpTargetNames are every HTTP (non-Database) target buildTargets emits.
var httpTargetNames = []string{
	"Website", "Gateway", "Realtime / Games", "RMHmusic",
	"RMHbox", "RMHtube", "Assets", "Background workers",
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
// Database probe target is appended (under Node's exact name + description) with
// an injected Probe func, and HTTP targets carry no Probe func.
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
	if db.Description != "PostgreSQL (via Prisma)" {
		t.Fatalf("Database description mismatch: %q", db.Description)
	}
	// HTTP targets must not have a Probe func.
	for _, name := range httpTargetNames {
		if tg := findTarget(targets, name); tg != nil && tg.Probe != nil {
			t.Fatalf("HTTP target %q unexpectedly has a Probe func", name)
		}
	}
}

// TestBuildTargetsProbesSupervisorNotRecap asserts the collapsed-topology fix:
// there is a "Background workers" target pointing at the supervisor /health URL,
// and NO standalone recap:7004 target remains.
func TestBuildTargetsProbesSupervisorNotRecap(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets(defaultURLs(), 4*time.Second)

	bg := findTarget(targets, "Background workers")
	if bg == nil {
		t.Fatal("missing 'Background workers' (supervisor) target")
	}
	if bg.URL != defaultSupervisorURL {
		t.Fatalf("supervisor target URL = %q, want %q", bg.URL, defaultSupervisorURL)
	}
	if bg.Description != "Supervisor: discord-bot, recap, doctrine, vibe, bot-worker" {
		t.Fatalf("supervisor target description mismatch: %q", bg.Description)
	}
	// No standalone recap target / recap:7004 URL anywhere.
	if findTarget(targets, "Recap runner") != nil {
		t.Fatal("'Recap runner' target must be removed in the Go topology")
	}
	for _, tg := range targets {
		if strings.Contains(tg.URL, "recap") || strings.Contains(tg.URL, ":7004") {
			t.Fatalf("target %q still points at the collapsed recap service: %q", tg.Name, tg.URL)
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

// TestBuildTargetsGoServiceURLs asserts every Go-service target carries the
// resolved URL passed in (compose DNS default → STATUS_<svc>_URL override), so
// the same binary probes the right hosts under both compose and k3s.
func TestBuildTargetsGoServiceURLs(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	// Defaults (compose DNS) flow through unchanged.
	targets := buildTargets(defaultURLs(), 4*time.Second)
	for _, c := range []struct{ name, want string }{
		{"Gateway", defaultGatewayURL},
		{"Realtime / Games", defaultSocketURL},
		{"RMHmusic", defaultRMHMusicURL},
		{"RMHbox", defaultRMHBoxURL},
		{"RMHtube", defaultRMHTubeURL},
		{"Assets", defaultAssetsURL},
	} {
		if tg := findTarget(targets, c.name); tg == nil || tg.URL != c.want {
			t.Fatalf("%q URL = %+v, want %q", c.name, tg, c.want)
		}
	}

	// Overrides (k3s service names) flow through unchanged.
	overridden := buildTargets(probeURLs{
		Website:    "https://rmhstudios.com/",
		Gateway:    "http://rmhstudios-go-gateway:7005/health",
		Socket:     "http://rmhstudios-go-gamehub:7001/health",
		RMHMusic:   "http://rmhstudios-go-rmhmusic:7002/health",
		RMHBox:     "http://rmhstudios-go-rmhbox:7676/health",
		RMHTube:    "http://rmhstudios-go-rmhtube:7003/health",
		Assets:     "http://rmhstudios-go-assets:7007/health",
		Supervisor: defaultSupervisorURL,
	}, 4*time.Second)
	for _, c := range []struct{ name, want string }{
		{"Gateway", "http://rmhstudios-go-gateway:7005/health"},
		{"Realtime / Games", "http://rmhstudios-go-gamehub:7001/health"},
		{"RMHmusic", "http://rmhstudios-go-rmhmusic:7002/health"},
		{"RMHbox", "http://rmhstudios-go-rmhbox:7676/health"},
		{"RMHtube", "http://rmhstudios-go-rmhtube:7003/health"},
		{"Assets", "http://rmhstudios-go-assets:7007/health"},
	} {
		if tg := findTarget(overridden, c.name); tg == nil || tg.URL != c.want {
			t.Fatalf("override %q URL = %+v, want %q", c.name, tg, c.want)
		}
	}
}

// TestBuildTargetsOmitsK3sOnlyServicesWhenUnset asserts that Gateway and
// RMHmusic — the k3s-only services that don't run under docker-compose — are
// omitted when their URL is empty, so compose never shows a false "down".
func TestBuildTargetsOmitsK3sOnlyServicesWhenUnset(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	urls := defaultURLs()
	urls.Gateway = ""
	urls.RMHMusic = ""
	targets := buildTargets(urls, 4*time.Second)

	if findTarget(targets, "Gateway") != nil {
		t.Fatal("Gateway target must be omitted when STATUS_GATEWAY_URL is unset")
	}
	if findTarget(targets, "RMHmusic") != nil {
		t.Fatal("RMHmusic target must be omitted when STATUS_RMHMUSIC_URL is unset")
	}
	// The always-on core services remain.
	for _, name := range []string{"Website", "Realtime / Games", "RMHbox", "RMHtube", "Assets", "Background workers"} {
		if findTarget(targets, name) == nil {
			t.Fatalf("always-on target %q must remain present", name)
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
