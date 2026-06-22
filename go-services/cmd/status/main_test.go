package main

import (
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/internal/status"
)

// TestBuildTargetsOmitsDatabaseWithoutDSN asserts that with DATABASE_URL unset
// the Database probe target is omitted, and the five HTTP targets are present.
func TestBuildTargetsOmitsDatabaseWithoutDSN(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", "7004", 4*time.Second)

	if len(targets) != 5 {
		t.Fatalf("expected 5 targets without DATABASE_URL, got %d", len(targets))
	}
	for _, name := range []string{"Website", "Realtime / Games", "RMHbox", "RMHtube", "Recap runner"} {
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

	targets := buildTargets("https://rmhstudios.com/", "7001", "7676", "7003", "7004", 4*time.Second)

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
	for _, name := range []string{"Website", "Realtime / Games", "RMHbox", "RMHtube", "Recap runner"} {
		if tg := findTarget(targets, name); tg != nil && tg.Probe != nil {
			t.Fatalf("HTTP target %q unexpectedly has a Probe func", name)
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
