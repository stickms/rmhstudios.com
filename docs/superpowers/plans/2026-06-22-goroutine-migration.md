# Goroutine Supervisor + Straggler Ports + Reversible Runtime Cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the five background workers as goroutines in one Go supervisor process, port the two remaining Node services (`bot-worker`, `status`) to Go, and flip the compose + Helm runtime to the Go binaries with a reversible Node fallback.

**Architecture:** Each background worker's lifecycle is extracted from its `cmd/X/main.go` into a uniform `Run(ctx, worker.Deps) error` entrypoint in its `internal/` package. The existing `cmd/X` binaries become thin wrappers that call `Run`; a new `cmd/supervisor` opens one db pool + one merged metrics endpoint and launches all five `Run`s under an `errgroup`. `status` is ported but stays its own process; the WS hubs and gateway are untouched.

**Tech Stack:** Go 1.23, `golang.org/x/sync/errgroup`, `github.com/jackc/pgx/v5`, `github.com/prometheus/client_golang`, `github.com/bwmarrin/discordgo`, `github.com/chromedp/chromedp`. Spec: `docs/superpowers/specs/2026-06-22-goroutine-migration-design.md`.

## Global Constraints

- Module path: `github.com/rmhstudios/rmh-go` (all imports). Go version floor: `go 1.23`.
- Ports use raw `pgx` (`pkg/db`), never Prisma.
- Workers tolerate missing optional secrets and **idle harmlessly** rather than crash (parity with the Node services): no `DEEPSEEK_API_KEY` / no Discord token → run but skip that work.
- `Run(ctx, d)` functions **must not** bind an HTTP port and **must not** call `log.Fatal` — they return errors. Only `main()` wrappers and the supervisor own HTTP/health/metrics and process exit.
- Health/metrics handlers come from `pkg/httpx` (`httpx.Health`) and `pkg/telemetry`. A metrics-bind failure is fatal (an unprobeable pod is never restarted by k8s).
- The Node runtime path must remain runnable as a documented reversible fallback after wiring.
- Behavioral source of truth for the two ports is the existing Node file (`server/bot-worker/index.ts`, `server/status/index.ts`); the Go port must preserve its externally observable behavior (DB rows written, HTTP responses, Discord/HTTP side effects).
- Run all Go commands from the `go-services/` directory.

---

## File Structure

**New files:**
- `go-services/pkg/worker/worker.go` — shared `Deps` struct + `RunFunc` type used by every worker and the supervisor.
- `go-services/internal/{doctrine,vibeworker,recap,discordbot}/run.go` — extracted `Run(ctx, worker.Deps) error` per worker.
- `go-services/internal/botworker/` — new Go port of `server/bot-worker/index.ts` (`run.go`, `worker.go`, `personas.go`, `deepseek.go`, `repo.go`, `*_test.go`).
- `go-services/cmd/bot-worker/main.go` — thin standalone wrapper.
- `go-services/cmd/supervisor/main.go` — errgroup supervisor over the 5 `Run`s.
- `go-services/internal/status/` — new Go port of `server/status/index.ts` (`status.go`, `probe.go`, `dashboard.go`, `*_test.go`).
- `go-services/cmd/status/main.go` — status standalone process.

**Modified files:**
- `go-services/pkg/telemetry/telemetry.go` — expose registry for merged `/metrics`.
- `go-services/pkg/httpx/httpx.go` — add a shared `SignalContext()` + `ServeMetrics()` helper to DRY the wrappers.
- `go-services/cmd/{doctrine-worker,vibe-worker,recap,discord-bot}/main.go` — reduced to thin `Run` wrappers.
- `go-services/go.mod` / `go.sum` — promote `golang.org/x/sync` to a direct dep.
- `docker-compose.yml` — point the 5 workers at the supervisor, `status` at the Go binary; Node fallback preserved.
- Helm chart under `deploy/` (PR #121) — Deployments switched to Go images with a `runtime` values toggle.
- `go-services/e2e/` — supervisor smoke test.

---

## Task 1: Shared worker contract + merged-metrics support

**Files:**
- Create: `go-services/pkg/worker/worker.go`
- Modify: `go-services/pkg/telemetry/telemetry.go`
- Modify: `go-services/pkg/httpx/httpx.go`
- Modify: `go-services/go.mod`
- Test: `go-services/pkg/telemetry/telemetry_merge_test.go`

**Interfaces:**
- Produces: `worker.Deps{DB *db.DB; Logger *log.Logger; Metrics *telemetry.Metrics; Cfg config.Common}`; `type worker.RunFunc = func(context.Context, worker.Deps) error`.
- Produces: `func (m *telemetry.Metrics) Registry() *prometheus.Registry`; `func telemetry.MergedHandler(ms ...*telemetry.Metrics) http.Handler`.
- Produces: `func httpx.SignalContext() (context.Context, context.CancelFunc)`; `func httpx.ServeMetrics(addr, service string, h http.Handler, logger *log.Logger)`.

- [ ] **Step 1: Promote x/sync to a direct dependency**

Run (from `go-services/`): `go get golang.org/x/sync/errgroup@v0.3.0 && go mod tidy`
Expected: `go.mod` now lists `golang.org/x/sync v0.3.0` without the `// indirect` comment.

- [ ] **Step 2: Write the shared worker contract**

Create `go-services/pkg/worker/worker.go`:

```go
// Package worker defines the uniform contract every background worker exposes
// so it can run either standalone (cmd/<worker>) or as a goroutine inside the
// supervisor (cmd/supervisor). A Run blocks until ctx is cancelled or an
// unrecoverable error occurs; it never binds HTTP or calls log.Fatal.
package worker

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Deps is the shared dependency set the supervisor (or a standalone wrapper)
// builds once and hands to each worker's Run.
type Deps struct {
	DB      *db.DB
	Logger  *log.Logger
	Metrics *telemetry.Metrics
	Cfg     config.Common
}

// RunFunc is the signature every worker's Run satisfies.
type RunFunc = func(ctx context.Context, d Deps) error
```

- [ ] **Step 3: Write the failing telemetry merge test**

Create `go-services/pkg/telemetry/telemetry_merge_test.go`:

```go
package telemetry

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMergedHandlerExposesEveryServiceLabel(t *testing.T) {
	a := New("worker-a")
	b := New("worker-b")
	a.JobRuns.WithLabelValues("job-a", "ok").Inc()
	b.JobRuns.WithLabelValues("job-b", "ok").Inc()

	rec := httptest.NewRecorder()
	MergedHandler(a, b).ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	body := rec.Body.String()

	if !strings.Contains(body, `service="worker-a"`) || !strings.Contains(body, `service="worker-b"`) {
		t.Fatalf("merged output missing a service label:\n%s", body)
	}
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `go test ./pkg/telemetry/ -run TestMergedHandler -v`
Expected: FAIL — `MergedHandler` and `Registry` undefined.

- [ ] **Step 5: Implement Registry + MergedHandler**

In `go-services/pkg/telemetry/telemetry.go` add (keep existing code; add the `prometheus.Gatherers` merge):

```go
// Registry returns the underlying registry so several services' metrics can be
// merged behind one /metrics endpoint (the supervisor case).
func (m *Metrics) Registry() *prometheus.Registry { return m.reg }

// MergedHandler serves the union of several services' registries on one
// endpoint. Each service keeps its own "service" ConstLabel, so per-worker
// attribution survives consolidation into the supervisor process.
func MergedHandler(ms ...*Metrics) http.Handler {
	g := make(prometheus.Gatherers, 0, len(ms))
	for _, m := range ms {
		g = append(g, m.reg)
	}
	return promhttp.HandlerFor(g, promhttp.HandlerOpts{})
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `go test ./pkg/telemetry/ -run TestMergedHandler -v`
Expected: PASS.

- [ ] **Step 7: Add the shared wrapper helpers to httpx**

In `go-services/pkg/httpx/httpx.go` add:

```go
// SignalContext returns a context cancelled on SIGINT/SIGTERM — the standalone
// wrapper equivalent of the WaitForSignal pattern.
func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

// ServeMetrics starts a background /health + /metrics server for a standalone
// worker. A bind failure is fatal (an unprobeable pod is never restarted).
func ServeMetrics(addr, service string, h http.Handler, logger *log.Logger) {
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", Health(service, nil))
		mux.Handle("/metrics", h)
		if err := http.ListenAndServe(addr, mux); err != nil {
			logger.Fatal("metrics server", "error", err)
		}
	}()
}
```

(Imports `context`, `os`, `os/signal`, `syscall` are already present in httpx.go.)

- [ ] **Step 8: Verify the module builds**

Run: `go build ./...`
Expected: builds clean.

- [ ] **Step 9: Commit**

```bash
git add go-services/pkg/worker go-services/pkg/telemetry go-services/pkg/httpx go-services/go.mod go-services/go.sum
git commit -m "feat(go): shared worker.Deps contract + merged telemetry + wrapper helpers"
```

---

## Task 2: Extract `Run` for doctrine-worker; thin wrapper

**Files:**
- Create: `go-services/internal/doctrine/run.go`
- Modify: `go-services/cmd/doctrine-worker/main.go`
- Test: `go-services/internal/doctrine/run_test.go`

**Interfaces:**
- Consumes: `worker.Deps` (Task 1); `doctrine.New(*db.DB, *log.Logger, *telemetry.Metrics) *Worker`, `(*Worker).Start(ctx)`, `(*Worker).Stop()` (existing).
- Produces: `func doctrine.Run(ctx context.Context, d worker.Deps) error`.

- [ ] **Step 1: Write the failing test**

Create `go-services/internal/doctrine/run_test.go`:

```go
package doctrine

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run must return promptly (nil) when its context is cancelled, with a nil DB.
func TestRunStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("doctrine", "error"), Metrics: telemetry.New("doctrine")}

	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil on clean shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/doctrine/ -run TestRunStops -v`
Expected: FAIL — `Run` undefined.

- [ ] **Step 3: Implement `Run`**

Create `go-services/internal/doctrine/run.go`:

```go
package doctrine

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run builds the scheduler, starts its tickers, and blocks until ctx is
// cancelled. It owns no HTTP surface — the caller (standalone main or the
// supervisor) serves health/metrics.
func Run(ctx context.Context, d worker.Deps) error {
	w := New(d.DB, d.Logger, d.Metrics)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/doctrine/ -run TestRunStops -v`
Expected: PASS.

- [ ] **Step 5: Reduce the standalone main to a thin wrapper**

Replace `go-services/cmd/doctrine-worker/main.go` with:

```go
// Command doctrine-worker runs the doctrine scheduler standalone. The worker
// logic lives in internal/doctrine.Run; this wrapper only wires config, db,
// metrics, and the /health + /metrics server. The supervisor runs the same Run.
package main

import (
	"time"

	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("doctrine-worker")
	logger := log.New("doctrine-worker", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("doctrine-worker")
	httpx.ServeMetrics(cfg.MetricsAddr, "doctrine-worker", metrics.Handler(), logger)

	if err := doctrine.Run(ctx, worker.Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
```

- [ ] **Step 6: Verify build + tests**

Run: `go build ./... && go test ./internal/doctrine/ -v`
Expected: builds clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add go-services/internal/doctrine go-services/cmd/doctrine-worker
git commit -m "refactor(go): extract doctrine.Run; doctrine-worker main is a thin wrapper"
```

---

## Task 3: Extract `Run` for vibe-worker; thin wrapper

**Files:**
- Create: `go-services/internal/vibeworker/run.go`
- Modify: `go-services/cmd/vibe-worker/main.go`
- Test: `go-services/internal/vibeworker/run_test.go`

**Interfaces:**
- Consumes: `worker.Deps`; `vibeworker.New(*db.DB, Capturer, *log.Logger, *telemetry.Metrics) *Worker`, `(*Worker).Start/Stop`, `vibeworker.NewChromedpCapturer(thumbDir, execPath string) *ChromedpCapturer` (existing).
- Produces: `func vibeworker.Run(ctx context.Context, d worker.Deps) error`.

- [ ] **Step 1: Write the failing test**

Create `go-services/internal/vibeworker/run_test.go` (same shape as Task 2's test, package `vibeworker`, `Metrics: telemetry.New("vibe-worker")`). The worker tolerates a nil DB at construction; `Start`'s poll loop exits on ctx cancel.

```go
package vibeworker

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("vibe", "error"), Metrics: telemetry.New("vibe-worker")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/vibeworker/ -run TestRunStops -v`
Expected: FAIL — `Run` undefined.

- [ ] **Step 3: Implement `Run`**

Create `go-services/internal/vibeworker/run.go`. It reproduces the thumbDir/execPath wiring from the old main so the standalone wrapper stays thin:

```go
package vibeworker

import (
	"context"
	"os"
	"path/filepath"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run wires the Chromium capturer and thumbnail directory, starts the poll
// loop, and blocks until ctx is cancelled.
func Run(ctx context.Context, d worker.Deps) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	thumbDir := filepath.Join(cwd, "db", "vibe-thumbs")
	execPath := os.Getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")

	capturer := NewChromedpCapturer(thumbDir, execPath)
	w := New(d.DB, capturer, d.Logger, d.Metrics)
	w.Start(ctx)
	<-ctx.Done()
	w.Stop()
	return nil
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/vibeworker/ -run TestRunStops -v`
Expected: PASS.

- [ ] **Step 5: Reduce the standalone main to a thin wrapper**

Replace `go-services/cmd/vibe-worker/main.go` with the same wrapper shape as Task 2 Step 5, service name `"vibe-worker"`, calling `vibeworker.Run(...)`. (Keep the `RUNTIME REQUIREMENT: Chromium` doc comment at the top.)

- [ ] **Step 6: Verify build + tests**

Run: `go build ./... && go test ./internal/vibeworker/ -v`
Expected: builds clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add go-services/internal/vibeworker go-services/cmd/vibe-worker
git commit -m "refactor(go): extract vibeworker.Run; vibe-worker main is a thin wrapper"
```

---

## Task 4: Extract `Run` for recap; thin wrapper

**Files:**
- Create: `go-services/internal/recap/run.go`
- Modify: `go-services/cmd/recap/main.go`
- Test: `go-services/internal/recap/run_test.go`

**Interfaces:**
- Consumes: `worker.Deps`; `recap.New(*db.DB, *discordgo.Session, Config, *log.Logger, *telemetry.Metrics) *Runner`, `(*Runner).Start/Stop`, `recap.Config{BotToken, AppID, SiteURL string}` (existing).
- Produces: `func recap.Run(ctx context.Context, d worker.Deps) error`. Move `stripTrailingSlash` and the env/session wiring out of `cmd/recap/main.go` into `run.go`.

- [ ] **Step 1: Write the failing test**

Create `go-services/internal/recap/run_test.go`. With no `DISCORD_ACTIVITY_BOT_TOKEN` set, `Run` builds a nil session (posting disabled) and must still return cleanly on cancel:

```go
package recap

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunStopsOnContextCancelNoToken(t *testing.T) {
	t.Setenv("DISCORD_ACTIVITY_BOT_TOKEN", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("recap", "error"), Metrics: telemetry.New("recap")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/recap/ -run TestRunStops -v`
Expected: FAIL — `Run` undefined.

- [ ] **Step 3: Implement `Run`** (move env/session/`stripTrailingSlash` from the old main)

Create `go-services/internal/recap/run.go`:

```go
package recap

import (
	"context"
	"strings"

	"github.com/bwmarrin/discordgo"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run builds the Discord session (skipped when no token is set, mirroring the
// Node `if (!BOT_TOKEN)` guard), starts the recap scheduler, and blocks until
// ctx is cancelled.
func Run(ctx context.Context, d worker.Deps) error {
	botToken := config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")
	appID := config.GetString("VITE_DISCORD_ACTIVITY_CLIENT_ID",
		config.GetString("DISCORD_ACTIVITY_CLIENT_ID", ""))
	siteURL := stripTrailingSlash(config.GetString("SITE_URL",
		config.GetString("VITE_BETTER_AUTH_URL", "https://rmhstudios.com")))

	var session *discordgo.Session
	if botToken != "" {
		s, err := discordgo.New("Bot " + botToken)
		if err != nil {
			return err
		}
		s.Identify.Intents = discordgo.IntentsNone
		s.Identify.Presence = discordgo.GatewayStatusUpdate{
			Status: "online",
			Game:   discordgo.Activity{Name: "RMHBox", Type: discordgo.ActivityTypeGame},
		}
		session = s
	} else {
		d.Logger.Warn("no DISCORD_ACTIVITY_BOT_TOKEN set — recap posting disabled")
	}

	runner := New(d.DB, session, Config{BotToken: botToken, AppID: appID, SiteURL: siteURL}, d.Logger, d.Metrics)
	runner.Start(ctx)
	<-ctx.Done()
	runner.Stop()
	return nil
}

// stripTrailingSlash ports lib/url.ts stripTrailingSlash.
func stripTrailingSlash(url string) string { return strings.TrimRight(url, "/") }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/recap/ -run TestRunStops -v`
Expected: PASS.

- [ ] **Step 5: Reduce the standalone main to a thin wrapper**

Replace `go-services/cmd/recap/main.go` with the Task 2 wrapper shape, service name `"recap"`. Standalone recap historically served health on `RECAP_PORT` (7004), not `MetricsAddr`; preserve that by passing `":"+config.GetString("RECAP_PORT", "7004")` as the addr to `httpx.ServeMetrics`. Call `recap.Run(...)`.

- [ ] **Step 6: Verify build + tests**

Run: `go build ./... && go test ./internal/recap/ -v`
Expected: builds clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add go-services/internal/recap go-services/cmd/recap
git commit -m "refactor(go): extract recap.Run; recap main is a thin wrapper"
```

---

## Task 5: Extract `Run` for discord-bot; thin wrapper

**Files:**
- Create: `go-services/internal/discordbot/run.go`
- Modify: `go-services/cmd/discord-bot/main.go`
- Test: `go-services/internal/discordbot/run_test.go`

**Interfaces:**
- Consumes: `worker.Deps`; `discordbot.Config{Token, DevGuildID, OwnerID, DeepSeekKey, DeepSeekMod, WorktreesDir, GithubToken string}`, `NewDeepSeekClient`, `NewChatService`, `NewRmhbotService`, `New(...) (*Bot, error)`, `(*Bot).Run(ctx) error` (existing).
- Produces: `func discordbot.Run(ctx context.Context, d worker.Deps) error`. Move `firstNonEmpty` + config assembly into `run.go`.
- Note: unlike the other workers, **a missing token is not fatal here** — the original main fatals, but in the supervisor a missing Discord token must not kill the whole process. `Run` logs a warning and returns nil (idles) when no token is set, per the Global Constraints idle-harmlessly rule.

- [ ] **Step 1: Write the failing test**

Create `go-services/internal/discordbot/run_test.go`:

```go
package discordbot

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// With no token configured, Run idles (no Discord connection) and returns nil
// on cancel rather than crashing the supervisor.
func TestRunIdlesWithoutToken(t *testing.T) {
	t.Setenv("DISCORD_BOT_TOKEN", "")
	t.Setenv("DISCORD_ACTIVITY_BOT_TOKEN", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("discord-bot", "error"), Metrics: telemetry.New("discord-bot")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil idle shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/discordbot/ -run TestRunIdles -v`
Expected: FAIL — `Run` undefined.

- [ ] **Step 3: Implement `Run`**

Create `go-services/internal/discordbot/run.go`:

```go
package discordbot

import (
	"context"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// Run assembles the bot's services and runs the discordgo session until ctx is
// cancelled. With no bot token configured it idles (returns nil on cancel) so a
// missing secret never takes down the supervisor.
func Run(ctx context.Context, d worker.Deps) error {
	cfg := Config{
		Token:        firstNonEmpty(config.GetString("DISCORD_BOT_TOKEN", ""), config.GetString("DISCORD_ACTIVITY_BOT_TOKEN", "")),
		DevGuildID:   config.GetString("DISCORD_DEV_GUILD_ID", ""),
		OwnerID:      config.GetString("OWNER_ID", ""),
		DeepSeekKey:  config.GetString("DEEPSEEK_API_KEY", ""),
		DeepSeekMod:  config.GetString("DEEPSEEK_MODEL", "deepseek-chat"),
		WorktreesDir: config.GetString("RMHBOT_WORKTREES_DIR", ""),
		GithubToken:  config.GetString("GITHUB_TOKEN", ""),
	}
	if cfg.Token == "" {
		d.Logger.Warn("no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set — discord bot disabled")
		<-ctx.Done()
		return nil
	}

	deepseek := NewDeepSeekClient(cfg.DeepSeekKey, cfg.DeepSeekMod)
	chat := NewChatService(deepseek, d.DB, d.Logger)
	rmhbot := NewRmhbotService(deepseek, d.Logger, cfg.WorktreesDir, cfg.GithubToken)

	bot, err := New(cfg, chat, rmhbot, d.Logger)
	if err != nil {
		return err
	}
	return bot.Run(ctx)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/discordbot/ -run TestRunIdles -v`
Expected: PASS.

- [ ] **Step 5: Reduce the standalone main to a thin wrapper**

Replace `go-services/cmd/discord-bot/main.go` with the Task 2 wrapper shape, service name `"discord-bot"`, addr `cfg.MetricsAddr`, calling `discordbot.Run(...)`. Remove the now-moved `firstNonEmpty`.

- [ ] **Step 6: Verify build + tests**

Run: `go build ./... && go test ./internal/discordbot/ -v`
Expected: builds clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add go-services/internal/discordbot go-services/cmd/discord-bot
git commit -m "refactor(go): extract discordbot.Run (idles without token); thin wrapper"
```

---

## Task 6: Port bot-worker to Go (`internal/botworker` + standalone wrapper)

**Behavioral source of truth:** `server/bot-worker/index.ts` (807 lines). Preserve its observable behavior exactly: it maintains a pool of AI-generated bot users (DeepSeek-invented name/handle/bio, online-sourced avatar, private persona = theme+temperament+voice) and, throughout the day, posts in-voice from those users paced per-bot by persona activity. Bots never reveal they are bots. Idles harmlessly with no `DEEPSEEK_API_KEY`. Uses Prisma in Node → **raw pgx** here.

**Files:**
- Create: `go-services/internal/botworker/types.go` — `Persona`, `BotUser` structs; pacing constants copied from the Node file.
- Create: `go-services/internal/botworker/deepseek.go` — DeepSeek client for name/persona/post generation (reuse the request shape from `internal/discordbot/deepseek.go`; do not import that package — extract shared bits only if trivial).
- Create: `go-services/internal/botworker/repo.go` — pgx queries: load existing bot users, insert a bot user, insert a post. Mirror the exact tables/columns the Node Prisma calls touch.
- Create: `go-services/internal/botworker/worker.go` — `New(d worker.Deps) *Worker`, `(*Worker).Start(ctx)`, `(*Worker).Stop()`; the per-bot scheduling loop.
- Create: `go-services/internal/botworker/run.go` — `func Run(ctx context.Context, d worker.Deps) error`.
- Create: `go-services/cmd/bot-worker/main.go` — thin wrapper (Task 2 shape, service `"bot-worker"`).
- Test: `go-services/internal/botworker/worker_test.go`, `go-services/internal/botworker/repo_test.go`.

**Interfaces:**
- Consumes: `worker.Deps`, `pkg/db`, `pkg/log`, `pkg/telemetry`, `pkg/config`.
- Produces: `func botworker.Run(ctx context.Context, d worker.Deps) error`; `botworker.New(worker.Deps) *Worker`; `(*Worker).Start(context.Context)`; `(*Worker).Stop()`.

**Pre-flight (do before writing code):**
Read `server/bot-worker/index.ts` end-to-end and the Prisma schema for the tables it writes (`grep -n "prisma\." server/bot-worker/index.ts` → enumerate every model/field). Read `prisma/schema.prisma` for the exact table + column names (note Prisma's `@@map`/`@map` → snake_case SQL identifiers). Read `internal/discordbot/deepseek.go` to reuse the DeepSeek request/response shape and error handling. Record the SQL identifiers in `repo.go` doc comments.

- [ ] **Step 1: Write the failing idle-without-key test**

Create `go-services/internal/botworker/worker_test.go`:

```go
package botworker

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func TestRunIdlesWithoutDeepSeekKey(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "")
	ctx, cancel := context.WithCancel(context.Background())
	d := worker.Deps{DB: nil, Logger: log.New("bot-worker", "error"), Metrics: telemetry.New("bot-worker")}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, d) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil idle shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/botworker/ -run TestRunIdles -v`
Expected: FAIL — package/`Run` undefined.

- [ ] **Step 3: Implement `types.go`, `deepseek.go`, `repo.go`, `worker.go`, `run.go`**

Port `server/bot-worker/index.ts` faithfully. Structure:
- `run.go`: read `DEEPSEEK_API_KEY` via `config.GetString`; if empty → `d.Logger.Warn(...)`, `<-ctx.Done()`, `return nil`. Otherwise `w := New(d); w.Start(ctx); <-ctx.Done(); w.Stop(); return nil`.
- `worker.go`: on `Start`, load the existing bot-user pool from `repo`, top it up to the target size (generating new personas via DeepSeek), then launch one goroutine per bot whose ticker interval derives from the persona's activity level (copy the exact pacing formula from the Node file). Each tick generates and inserts an in-voice post. All goroutines exit on `ctx.Done()`; `Stop()` waits on a `sync.WaitGroup`. Record `d.Metrics.JobRuns.WithLabelValues("bot-post", outcome).Inc()` per post attempt.
- `repo.go`: raw pgx for the exact tables the Node Prisma calls touched (from pre-flight). Each query method takes `ctx` and returns typed structs/errors.
- `deepseek.go`: mirror `internal/discordbot/deepseek.go`'s HTTP shape; methods for persona generation and post generation, each returning `(string, error)`.

- [ ] **Step 4: Run the idle test to verify it passes**

Run: `go test ./internal/botworker/ -run TestRunIdles -v`
Expected: PASS.

- [ ] **Step 5: Write a repo unit test for one query**

Create `go-services/internal/botworker/repo_test.go` covering the SQL-building / row-scan logic that does not need a live DB (e.g. a query-string builder or a row-mapper helper). If every repo method needs a DB, instead add a `TestPostText_NeverRevealsBot` unit test asserting the post-assembly helper never emits a bot-disclosure phrase (parity with the "never reveal" rule).

```go
func TestPostTextNeverRevealsBot(t *testing.T) {
	got := assemblePost(Persona{Theme: "coffee", Voice: "wry"}, "great latte today")
	for _, banned := range []string{"as an AI", "I am a bot", "language model"} {
		if strings.Contains(strings.ToLower(got), strings.ToLower(banned)) {
			t.Fatalf("post leaked bot disclosure: %q", got)
		}
	}
}
```

- [ ] **Step 6: Run package tests**

Run: `go test ./internal/botworker/ -v`
Expected: PASS.

- [ ] **Step 7: Add the standalone wrapper**

Create `go-services/cmd/bot-worker/main.go` (Task 2 wrapper shape, service `"bot-worker"`, addr `cfg.MetricsAddr`, calling `botworker.Run(...)`).

- [ ] **Step 8: Verify build + tests + vet**

Run: `go build ./... && go vet ./internal/botworker/... && go test ./internal/botworker/ -v`
Expected: builds clean; PASS.

- [ ] **Step 9: Commit**

```bash
git add go-services/internal/botworker go-services/cmd/bot-worker
git commit -m "feat(go): port bot-worker to Go (internal/botworker + standalone wrapper)"
```

---

## Task 7: Build the supervisor (`cmd/supervisor`)

**Files:**
- Create: `go-services/cmd/supervisor/main.go`
- Test: `go-services/cmd/supervisor/main_test.go` (uses an exported helper, see below)
- Create: `go-services/cmd/supervisor/run.go` — testable `runGroup` extracted from `main`.

**Interfaces:**
- Consumes: `worker.RunFunc`, all five `Run`s (`doctrine.Run`, `vibeworker.Run`, `recap.Run`, `discordbot.Run`, `botworker.Run`), `telemetry.MergedHandler`, `httpx.SignalContext`.
- Produces: `func runGroup(ctx context.Context, runs map[string]worker.RunFunc, deps func(name string) worker.Deps) error`.

- [ ] **Step 1: Write the failing supervisor test**

Create `go-services/cmd/supervisor/main_test.go`:

```go
package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func depsFor(string) worker.Deps {
	return worker.Deps{Logger: log.New("test", "error"), Metrics: telemetry.New("test")}
}

// All workers start; a single worker error cancels the group and runGroup
// returns that error.
func TestRunGroupPropagatesWorkerError(t *testing.T) {
	boom := errors.New("boom")
	started := make(chan string, 2)
	runs := map[string]worker.RunFunc{
		"ok": func(ctx context.Context, d worker.Deps) error {
			started <- "ok"; <-ctx.Done(); return nil
		},
		"bad": func(ctx context.Context, d worker.Deps) error {
			started <- "bad"; return boom
		},
	}
	err := runGroup(context.Background(), runs, depsFor)
	if !errors.Is(err, boom) {
		t.Fatalf("expected boom, got %v", err)
	}
	if len(started) != 2 {
		t.Fatalf("expected both workers to start, got %d", len(started))
	}
}

func TestRunGroupStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runs := map[string]worker.RunFunc{
		"a": func(ctx context.Context, d worker.Deps) error { <-ctx.Done(); return nil },
	}
	done := make(chan error, 1)
	go func() { done <- runGroup(ctx, runs, depsFor) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runGroup did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./cmd/supervisor/ -v`
Expected: FAIL — `runGroup` undefined.

- [ ] **Step 3: Implement `runGroup`**

Create `go-services/cmd/supervisor/run.go`:

```go
package main

import (
	"context"

	"golang.org/x/sync/errgroup"

	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// runGroup launches every worker's Run as a goroutine under one errgroup. The
// first worker to return a non-nil error cancels the shared context, unwinding
// the rest; runGroup then returns that error so main() can exit non-zero and
// the orchestrator restarts the supervisor.
func runGroup(ctx context.Context, runs map[string]worker.RunFunc, deps func(name string) worker.Deps) error {
	g, gctx := errgroup.WithContext(ctx)
	for name, run := range runs {
		name, run := name, run
		g.Go(func() error {
			if err := run(gctx, deps(name)); err != nil {
				return err
			}
			return nil
		})
	}
	return g.Wait()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./cmd/supervisor/ -v`
Expected: PASS.

- [ ] **Step 5: Implement `main.go` (wiring + merged metrics)**

Create `go-services/cmd/supervisor/main.go`:

```go
// Command supervisor runs the five background workers as goroutines in one
// process: it opens a single shared db pool, builds a per-worker metrics
// registry merged behind one /metrics endpoint, and launches each worker's Run
// under an errgroup. Any worker's unrecoverable error cancels the group and
// exits the process non-zero so the orchestrator restarts the whole supervisor.
// The WS hubs (gamehub/rmhmusic/rmhtube/rmhbox), gateway, and status run as
// their own processes — only the background workers are consolidated here.
package main

import (
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/botworker"
	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	cfg, err := config.LoadCommon("supervisor")
	logger := log.New("supervisor", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	runs := map[string]worker.RunFunc{
		"doctrine-worker": doctrine.Run,
		"vibe-worker":     vibeworker.Run,
		"recap":           recap.Run,
		"discord-bot":     discordbot.Run,
		"bot-worker":      botworker.Run,
	}

	// One metrics registry per worker so the merged /metrics keeps per-worker
	// "service" labels; one shared db pool across all of them.
	metricsByWorker := make(map[string]*telemetry.Metrics, len(runs))
	all := make([]*telemetry.Metrics, 0, len(runs))
	for name := range runs {
		m := telemetry.New(name)
		metricsByWorker[name] = m
		all = append(all, m)
	}
	httpx.ServeMetrics(cfg.MetricsAddr, "supervisor", telemetry.MergedHandler(all...), logger)

	deps := func(name string) worker.Deps {
		return worker.Deps{DB: database, Logger: logger.With("worker", name), Metrics: metricsByWorker[name], Cfg: cfg}
	}

	logger.Info("supervisor starting", "workers", len(runs))
	if err := runGroup(ctx, runs, deps); err != nil {
		logger.Error("supervisor exiting on worker error", "error", err)
		os.Exit(1)
	}
}
```

Note: if `log.Logger` has no `With` method, replace `logger.With("worker", name)` with `logger` (verify `grep -n "func (.*Logger) With" pkg/log/log.go` during implementation; drop the call if absent).

- [ ] **Step 6: Verify build + tests + vet**

Run: `go build ./... && go vet ./cmd/supervisor/... && go test ./cmd/supervisor/ -v`
Expected: builds clean; PASS.

- [ ] **Step 7: Commit**

```bash
git add go-services/cmd/supervisor
git commit -m "feat(go): supervisor runs the 5 background workers as goroutines (errgroup + merged metrics)"
```

---

## Task 8: Port status to Go (`internal/status` + `cmd/status`, separate process)

**Behavioral source of truth:** `server/status/index.ts` (591 lines). Preserve: periodic probing of every other service's `/health`; `GET /` self-contained auto-refreshing HTML dashboard; `GET /api/status` JSON snapshot of every probe + uptime history; `GET /health` for itself. The **web** app is probed via its PUBLIC URL (`https://rmhstudios.com`), not the container name, so status reflects what real users hit. Dependency-light, its own process/container — must stay up when the rest is down.

**Files:**
- Create: `go-services/internal/status/probe.go` — `Prober` that polls a list of `Target{Name, URL string}` and keeps rolling uptime history; `Snapshot()` returns the current state.
- Create: `go-services/internal/status/dashboard.go` — the HTML template + a `Handler` (mux) serving `/`, `/api/status`, `/health`.
- Create: `go-services/internal/status/status.go` — `New(cfg Config) *Service`, `(*Service).Start(ctx)`, `(*Service).Handler() http.Handler`.
- Create: `go-services/cmd/status/main.go` — standalone process binding `STATUS_PORT`.
- Test: `go-services/internal/status/probe_test.go`, `go-services/internal/status/dashboard_test.go`.

**Interfaces:**
- Produces: `status.New(status.Config) *Service`; `(*Service).Start(context.Context)`; `(*Service).Handler() http.Handler`; `status.Snapshot` (JSON-tagged struct matching the Node `/api/status` shape).

**Pre-flight:** Read `server/status/index.ts` end-to-end. Record: the exact target list + which URL each is probed at (note the web-via-public-URL rule), the probe interval, the uptime-history window/shape, and the exact JSON field names of `/api/status` (the JSON shape is a contract — keep field names identical).

- [ ] **Step 1: Write the failing probe test**

Create `go-services/internal/status/probe_test.go` — stand up two `httptest.Server`s (one healthy, one 503), point a `Prober` at them, run one probe cycle, assert the snapshot marks the first up and the second down:

```go
package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeMarksUpAndDown(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer up.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()

	p := NewProber([]Target{{Name: "up", URL: up.URL}, {Name: "down", URL: down.URL}})
	p.ProbeOnce(context.Background())
	snap := p.Snapshot()

	if !snap.Service("up").Up || snap.Service("down").Up {
		t.Fatalf("probe results wrong: %+v", snap)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/status/ -run TestProbe -v`
Expected: FAIL — package/`NewProber` undefined.

- [ ] **Step 3: Implement `probe.go`, `status.go`**

Port the probing model from the Node file: `NewProber(targets)`, `ProbeOnce(ctx)` (HTTP GET each target's URL with a short timeout, record up/down + latency + rolling history), `Snapshot()` returning a JSON-serialisable struct with a `Service(name)` accessor. `Service.Start(ctx)` runs `ProbeOnce` on a ticker until ctx cancel. Target list comes from `Config` (built in `cmd/status/main.go` from env, with the web target pinned to its public URL).

- [ ] **Step 4: Run the probe test to verify it passes**

Run: `go test ./internal/status/ -run TestProbe -v`
Expected: PASS.

- [ ] **Step 5: Write the failing dashboard test**

Create `go-services/internal/status/dashboard_test.go` — assert `/api/status` returns JSON with the expected top-level field and `/health` returns 200:

```go
func TestHandlerServesAPIAndHealth(t *testing.T) {
	svc := New(Config{Targets: []Target{{Name: "web", URL: "https://rmhstudios.com"}}})
	h := svc.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/status", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"services"`) {
		t.Fatalf("api/status wrong: %d %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/health", nil))
	if rec.Code != 200 {
		t.Fatalf("health wrong: %d", rec.Code)
	}
}
```

(Use the actual top-level JSON key from the Node `/api/status` — adjust `"services"` to match the pre-flight finding.)

- [ ] **Step 6: Implement `dashboard.go`; run dashboard test to pass**

Implement the mux + embedded HTML template (auto-refresh meta tag, matching the Node dashboard). Run: `go test ./internal/status/ -v`
Expected: PASS.

- [ ] **Step 7: Add the standalone process**

Create `go-services/cmd/status/main.go`: load config, build the target list (web → public URL), `svc := status.New(cfg); svc.Start(ctx)`, then serve `svc.Handler()` on `":"+config.GetString("STATUS_PORT", "7008")` via `httpx.NewServer(...).Run(30*time.Second)`. (Confirm the Node status port during pre-flight and use it.)

- [ ] **Step 8: Verify build + tests + vet**

Run: `go build ./... && go vet ./internal/status/... && go test ./internal/status/ -v`
Expected: builds clean; PASS.

- [ ] **Step 9: Commit**

```bash
git add go-services/internal/status go-services/cmd/status
git commit -m "feat(go): port status page to Go (internal/status + cmd/status, own process)"
```

---

## Task 9: Wire docker-compose.yml to the Go binaries (reversible)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile` (only if the Go binaries are not already built into the image — verify first)

**Pre-flight:** `grep -n "go-services\|supervisor\|/app/bin\|go build" Dockerfile` to learn how/whether Go binaries are built and where they land in the image. The existing Go services must already be buildable for this migration to make sense; confirm the build stage produces binaries for `supervisor`, `status`, and the hubs. If `cmd/supervisor`, `cmd/bot-worker`, `cmd/status` are new, ensure the Dockerfile's `go build` step compiles `./cmd/...` (it likely already globs).

- [ ] **Step 1: Confirm the Go build stage covers the new binaries**

Run: `grep -n "go build\|CGO\|cmd/" Dockerfile`
Expected: a build step like `go build ... ./cmd/...`. If it lists binaries explicitly, add `supervisor`, `bot-worker`, `status`.

- [ ] **Step 2: Repoint the five background services at the supervisor**

In `docker-compose.yml`, the four background services (`discord-bot`, `recap`, `doctrine-worker`, `vibe-worker`) collapse into one supervisor service, and `bot-worker` joins it. Replace their five service blocks with a single `supervisor` service, preserving each old block's env/volumes/`depends_on` (union them), and comment out the old `command: ["node", ...]` blocks with a `# FALLBACK (Node):` header above each so the Node path is restorable. The supervisor command is the Go binary, e.g. `command: ["/app/bin/supervisor"]` (use the actual in-image path from Step 1).

- [ ] **Step 3: Repoint status at the Go binary**

Change the `status` service `command` from `["node", "dist-server/server/status/index.cjs"]` to the Go binary (e.g. `["/app/bin/status"]`); keep the Node line commented as `# FALLBACK (Node):`.

- [ ] **Step 4: Validate compose**

Run: `docker compose config -q`
Expected: no errors (config parses).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Dockerfile
git commit -m "build: run background workers via Go supervisor + Go status in compose (Node fallback preserved)"
```

---

## Task 10: Wire the Helm chart to the Go binaries (reversible)

**Files:**
- Modify: Helm chart under `deploy/` (PR #121) — the Deployment templates + `values.yaml`.

**Pre-flight:** `find deploy -name '*.yaml' | xargs grep -l "kind: Deployment"` and read the values file. Identify the Deployments for `discord-bot`, `recap`, `doctrine-worker`, `vibe-worker`, `bot-worker`, `status`.

- [ ] **Step 1: Add a runtime toggle to values.yaml**

Add `runtime: go   # go | node — set to node for the reversible fallback` to `values.yaml`. Document that `node` restores the pre-migration command set.

- [ ] **Step 2: Collapse the background-worker Deployments into a supervisor Deployment**

Replace the four background-worker Deployments + `bot-worker` with a single `supervisor` Deployment running the supervisor binary, gated `{{- if eq .Values.runtime "go" }}`. Under `{{- else }}`, keep the original five Node Deployments so `runtime: node` reproduces the old topology. Carry over each worker's env/secret refs into the supervisor pod spec (union).

- [ ] **Step 3: Switch the status Deployment to the Go binary**

Gate the `status` Deployment's container command/image on the same `runtime` toggle (Go binary when `go`, Node command when `node`). Status stays its own Deployment either way.

- [ ] **Step 4: Lint/template the chart**

Run: `helm template deploy/<chart-path> | head -n 40` (and `helm lint deploy/<chart-path>` if available)
Expected: templates render for `runtime: go` and `runtime: node` without errors.

- [ ] **Step 5: Commit**

```bash
git add deploy
git commit -m "deploy: Helm runs Go supervisor + Go status with a runtime=go|node fallback toggle"
```

---

## Task 11: Supervisor e2e smoke + full verification

**Files:**
- Create/Modify: `go-services/e2e/supervisor_e2e_test.go` (follow the existing `e2e/harness.go` patterns).

**Pre-flight:** Read `go-services/e2e/harness.go` to learn how existing e2e tests boot a service and how they're gated (build tag / env flag). Match that exactly.

- [ ] **Step 1: Write the supervisor smoke test**

Following the harness conventions, boot `cmd/supervisor` with a reachable test DB (or the harness's standard DB fixture) and no Discord/DeepSeek keys, hit `/health` on `MetricsAddr`, and assert HTTP 200. If the harness exposes per-worker readiness, assert all five names are present.

- [ ] **Step 2: Run the e2e smoke (gated as the suite requires)**

Run: the project's e2e invocation for this test (e.g. `go test -tags e2e ./e2e/ -run Supervisor -v`, per `harness.go`).
Expected: PASS (or correctly SKIP when its env gate is unset — verify it does not error).

- [ ] **Step 3: Full module gate**

Run: `cd go-services && go build ./... && go vet ./... && go test ./...`
Expected: builds clean; vet clean; all unit tests PASS.

- [ ] **Step 4: Commit**

```bash
git add go-services/e2e
git commit -m "test(go): supervisor e2e smoke (health + all workers live)"
```

---

## Task 12: Prod cutover runbook

**Files:**
- Create: `docs/runbooks/2026-06-22-go-runtime-cutover.md`

This task produces the deliverable the user asked for: the ordered procedure to actually run the Go stack in prod, with a rollback at every step.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/2026-06-22-go-runtime-cutover.md` covering, in order:
1. **Pre-cutover** — build & push the Go images (`supervisor`, `status`, hubs, `gateway`); confirm `go test ./...` green on the release SHA.
2. **Env parity check** — for each Node service being replaced, diff its env/secret set against the supervisor/status pod spec; list every required key (`DATABASE_URL`, `DISCORD_*`, `DEEPSEEK_API_KEY`, `SITE_URL`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `STATUS_PORT`, `RECAP_PORT`, `METRICS_ADDR`, `DB_POOL_SIZE`). Note the shared-pool sizing floor.
3. **Staged flip behind the gateway** — order: `status` first (lowest blast radius, isolated) → background `supervisor` → hubs one at a time. After each, health-gate (`/health` 200 + `/metrics` scrape + a functional check) before proceeding.
4. **Rollback** — per stage: compose → restore the commented Node `command`; Helm → `--set runtime=node` and redeploy. State the expected recovery time and how to confirm.
5. **Post-cutover** — decommission criteria for the Node images, and what to watch for 24–48h (DB pool saturation, supervisor restart loops, per-worker `service` metric gaps).

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/2026-06-22-go-runtime-cutover.md
git commit -m "docs: prod cutover runbook for the Go runtime migration"
```

---

## Self-Review Notes

- **Spec coverage:** supervisor (Tasks 1,7), background-worker `Run` extraction (2–5), bot-worker port into supervisor (6,7), status port as own process (8), reversible compose+Helm wiring (9,10), error-handling/return-not-fatal contract (Global Constraints + each `Run`), merged per-worker metrics (1,7), shared pool (7), tests + e2e (each task + 11), runbook deliverable (12). All spec sections map to a task.
- **Type consistency:** `worker.Deps`/`worker.RunFunc` defined in Task 1 and consumed identically in 2–7; `telemetry.MergedHandler`/`Registry` defined in 1 and used in 7; `httpx.SignalContext`/`ServeMetrics` defined in 1 and used in every wrapper and the supervisor.
- **Known verify-during-implementation points (not placeholders — they require reading existing code the plan already names):** exact SQL identifiers for the bot-worker port (Task 6 pre-flight via `prisma/schema.prisma`); the status target list, JSON field names, and port (Task 8 pre-flight); the Dockerfile build-stage binary paths (Task 9 pre-flight); the Helm chart path + Deployment names (Task 10 pre-flight); `log.Logger.With` existence (Task 7 Step 5); the e2e harness gating convention (Task 11 pre-flight). Each names the precise file to read and what to extract.
