# rmh-go Foundation API (shared `pkg/`)

Module path: `github.com/rmhstudios/rmh-go`. Go 1.23. Every service is a binary
under `cmd/<service>/main.go` with its private code under `internal/<service>/`.

> **Scope note.** The current fleet is workers + `status` + `assets` (see
> [`CLAUDE.md`](./CLAUDE.md)). The `pkg/events` (pub/sub backplane) and
> `pkg/realtime` (WebSocket framework) packages — and the realtime/HTTP-hub
> service skeleton that used them — were **removed in the rewrite** with the Go
> gateway/hub topology, and are no longer documented here. Surviving shared
> packages: `config`, `log`, `db`, `auth`, `httpx`, `ratelimit`, `telemetry`,
> `objectstore`, `worker`.

**Rules for service authors**
- Import shared packages; do **not** edit anything under `pkg/` or `go.mod`.
- Write only under `cmd/<your-service>/` and `internal/<your-service>/`.
- Code MUST compile with `go build ./...`. Prefer faithful ports; where a piece
  is genuinely out of scope, leave a clearly-marked `// TODO(migration):` stub
  that still compiles — never leave broken code.
- Use `context.Context` for cancellation; honor graceful shutdown.

## config
```go
cfg, err := config.LoadCommon("rmhbox") // cfg: ServiceName, Env, DatabaseURL string; DBPoolSize int32; RedisURL, MetricsAddr, LogLevel string
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

## db
```go
database, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize) // *db.DB
defer database.Close()
database.Pool // *pgxpool.Pool — run queries with database.Pool.Query/QueryRow/Exec
db.WaitForReachable(ctx, dsn string, attempts int, interval time.Duration) (*db.DB, error) // workers: 10, 5*time.Second
```
Typed models live in package `db` (use or ignore as convenient): `db.User`,
`db.Session`, `db.Account`, `db.DoctrinePuzzle`, `db.DoctrineReputation`,
`db.DoctrineSahurSession`, `db.VibePage`, `db.DiscordActivityChannel`,
`db.DiscordDailyParticipant`, `db.RMHboxProfile`, `db.RmhTubeRoom`,
`db.RmhMusicRoom`. Run raw pgx SQL for anything else.

pgx usage reminder:
```go
row := database.Pool.QueryRow(ctx, `SELECT "id" FROM "user" WHERE "id"=$1`, id)
err := row.Scan(&u.ID)
rows, err := database.Pool.Query(ctx, `...`); defer rows.Close(); for rows.Next() {...}
tag, err := database.Pool.Exec(ctx, `UPDATE ...`, args...)
```

## auth
```go
v := auth.NewValidator(database.Pool)
id, err := v.ValidateSession(ctx, token)        // auth.Identity{UserID,Name,Image string; IsAdmin bool}
id, err := v.ResolveDiscordAccount(ctx, discordUserID)
// err == auth.ErrUnauthenticated for unknown/expired
```

## httpx
```go
mux := http.NewServeMux()
mux.HandleFunc("/health", httpx.Health(cfg.ServiceName, nil)) // ready func optional
httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
token := httpx.SessionToken(r) // Bearer header or better-auth cookie
srv := httpx.NewServer(addr, mux, logger)
err := srv.Run(30 * time.Second) // blocks until SIGINT/SIGTERM, then drains
sig := httpx.WaitForSignal()     // workers without HTTP: block until signal
```

## ratelimit
```go
rl := ratelimit.New(map[string]ratelimit.Rule{"chat": {Max: 5, Window: time.Second}}, 50000, 120*time.Second)
if !rl.Allow(conn.ID, "chat") { return }
rl.Forget(conn.ID) // on disconnect
rl.Close()
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

## worker (uniform worker contract)
```go
// A worker is just a RunFunc; it returns errors and NEVER calls log.Fatal inside Run.
type Deps struct { DB *db.DB; Logger *log.Logger; Metrics *telemetry.Metrics; Cfg config.Common }
type RunFunc = func(ctx context.Context, d worker.Deps) error

// Wire the same RunFunc into BOTH cmd/<svc> (standalone) and cmd/supervisor.
func Run(ctx context.Context, d worker.Deps) error { /* ... tickers / loops ... */ return nil }
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
    database, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
    if err != nil { logger.Fatal("db", "error", err) }
    defer database.Close()
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

## Standard main() skeleton — standalone worker
```go
package main
// The thin wrapper: RunStandalone owns config/log/db/metrics/signals and the
// :9090 metrics+health server, then calls your RunFunc. In production the same
// RunFunc runs inside cmd/supervisor instead.
func main() {
    worker.RunStandalone("doctrine-worker", "", doctrine.Run) // "" => METRICS_ADDR default :9090
}
```
