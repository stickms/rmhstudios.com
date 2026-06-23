package main

import (
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/internal/status"
)

// defaultSupervisorURL mirrors the STATUS_SUPERVISOR_URL default in main().
const defaultSupervisorURL = "http://supervisor:9090/health"

// TestBuildTargetsOmitsDatabaseWithoutDSN asserts that with DATABASE_URL unset
// the Database probe target is omitted, and the five HTTP targets are present.
func TestBuildTargetsOmitsDatabaseWithoutDSN(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", defaultSupervisorURL, 4*time.Second)

	if len(targets) != 5 {
		t.Fatalf("expected 5 targets without DATABASE_URL, got %d", len(targets))
	}
	for _, name := range []string{"Website", "Realtime / Games", "RMHbox", "RMHtube", "Background workers"} {
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

	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", defaultSupervisorURL, 4*time.Second)

	if len(targets) != 6 {
		t.Fatalf("expected 6 targets with DATABASE_URL, got %d", len(targets))
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
	for _, name := range []string{"Website", "Realtime / Games", "RMHbox", "RMHtube", "Background workers"} {
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

	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", defaultSupervisorURL, 4*time.Second)

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
	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", custom, 4*time.Second)

	bg := findTarget(targets, "Background workers")
	if bg == nil || bg.URL != custom {
		t.Fatalf("supervisor override not honored: %+v", bg)
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
