# rmh-go Foundation API (shared `pkg/`)

Module path: `github.com/rmhstudios/rmh-go`. Go 1.23. Every service is a binary
under `cmd/<service>/main.go` with its private code under `internal/<service>/`.

> **Scope note.** The current fleet is `status` + `assets` (see
> [`CLAUDE.md`](./CLAUDE.md)). The `pkg/events` (pub/sub backplane) and
> `pkg/realtime` (WebSocket framework) packages — and the realtime/HTTP-hub
> service skeleton that used them — were **removed in the rewrite** with the Go
> gateway/hub topology, and are no longer documented here. Surviving shared
> packages: `config`, `log`, `httpx`, `telemetry`, `objectstore`, `oncall`
> (`db` and `worker` went with the supervisor, D3; `auth` and `ratelimit`, whose
> only users were the gateway and the Go hubs, were deleted after them).

**Rules for service authors**
- Import shared packages; do **not** edit anything under `pkg/` or `go.mod`.
- Write only under `cmd/<your-service>/` and `internal/<your-service>/`.
- Code MUST compile with `go build ./...`. Prefer faithful ports; where a piece
  is genuinely out of scope, leave a clearly-marked `// TODO(migration):` stub
  that still compiles — never leave broken code.
- Use `context.Context` for cancellation; honor graceful shutdown.

## config
```go
cfg, err := config.LoadCommon("assets") // cfg: ServiceName, Env, DatabaseURL, RedisURL, MetricsAddr, LogLevel string
config.GetString(key, fallback string) string
config.GetInt(key string, fallback int) int
config.GetBool(key string, fallback bool) bool
config.GetDuration(key string, fallback time.Duration) time.Duration
config.GetCSV(key string) []string
```

## log
```go
logger := log.New(cfg.ServiceName, cfg.LogLevel) // *log.Logger
logger.Info("msg", "key", val, "key2", val2)     // slog key/value pairs
logger.Warn(...); logger.Error(...); logger.Debug(...)
logger.With("room", id) *log.Logger
logger.Fatal("boot failed", "error", err)        // logs + os.Exit(1)
```

## db (removed)
`pkg/db` went with the supervisor (D3). `status` opens its own small pgxpool
(`cmd/status/dbprobe.go`).

pgx usage reminder:
```go
row := pool.QueryRow(ctx, `SELECT "id" FROM "user" WHERE "id"=$1`, id)
err := row.Scan(&u.ID)
rows, err := pool.Query(ctx, `...`); defer rows.Close(); for rows.Next() {...}
tag, err := pool.Exec(ctx, `UPDATE ...`, args...)
```

## httpx
```go
mux := http.NewServeMux()
mux.HandleFunc("/health", httpx.Health(cfg.ServiceName, nil)) // ready func optional
httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
srv := httpx.NewServer(addr, mux, logger)
err := srv.Run(30 * time.Second) // blocks until SIGINT/SIGTERM, then drains
sig := httpx.WaitForSignal()     // workers without HTTP: block until signal
```

## telemetry
```go
metrics := telemetry.New(cfg.ServiceName)
mux.Handle("/metrics", metrics.Handler())
metrics.ActiveConnections.Inc()/.Dec()
metrics.MessagesTotal.WithLabelValues(event).Inc()
metrics.JobRuns.WithLabelValues("daily_puzzles", "ok").Inc()
metrics.DBQueries.WithLabelValues("ok").Inc()
```

## objectstore
```go
store, err := objectstore.New(ctx) // *S3 — range-aware S3/MinIO reader (the only pkg importing the AWS SDK)
// used by the `assets` service to stream /library /music /models /sprites
```

## Standard main() skeleton — HTTP service (status / assets)
```go
package main
func main() {
    cfg, err := config.LoadCommon("status")
    logger := log.New("status", cfg.LogLevel)
    if err != nil { logger.Fatal("config", "error", err) }
    ctx, cancel := httpx.SignalContext() // ctx cancelled on SIGINT/SIGTERM
    defer cancel()
    metrics := telemetry.New("status")
    mux := http.NewServeMux()
    mux.HandleFunc("/health", httpx.Health("status", nil))
    mux.Handle("/metrics", metrics.Handler())
    // ... register the service's own routes on mux ...
    addr := ":" + config.GetString("STATUS_PORT", "7008")
    srv := httpx.NewServer(addr, mux, logger)
    if err := srv.Run(30 * time.Second); err != nil { logger.Error("server", "error", err) }
}
```

## Standalone workers (removed)
There are none. The worker contract (`pkg/worker`), `cmd/supervisor` and the
last Go worker, the Discord bot, were deleted once it was ported to the Node
`jobs` worker (D3). New background work is a pg-boss cron there.
