# rmh-go Foundation API (shared `pkg/`)

Module path: `github.com/rmhstudios/rmh-go`. Go 1.23. Every service is a binary
under `cmd/<service>/main.go` with its private code under `internal/<service>/`.

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

## events (cross-instance pub/sub backplane)
```go
host, _ := os.Hostname()
bus, err := events.FromURL(host, cfg.RedisURL) // Local bus if RedisURL=="" else Redis
defer bus.Close()
```

## realtime (WebSocket framework — replaces Socket.IO)
```go
hub := realtime.NewHub(ctx, realtime.Options{
    Origin: host, Logger: logger, Metrics: metrics,
    Validator: v, Bus: bus,
    AllowOrigins: config.GetCSV("SOCKET_CORS_ORIGIN"), // empty => allow all
    RequireAuth: false, // true for rmhmusic
})
hub.On("room:join", func(c *realtime.Conn, e realtime.Envelope) {
    var p struct{ RoomID string `json:"roomId"` }
    if err := e.Bind(&p); err != nil { return }
    room := hub.Join(c, p.RoomID)
    hub.BroadcastSeq(p.RoomID, realtime.MustEnvelope("room:action", map[string]any{"type":"MEMBER_JOINED","userId":c.UserID()}))
    _ = room
})
hub.OnConnect(func(c *realtime.Conn) {})
hub.OnDisconnect(func(c *realtime.Conn) {})
mux.HandleFunc("/rmhbox-ws/", hub.ServeWS)

// Conn: c.ID string; c.Identity auth.Identity; c.Anonymous bool; c.UserID() string
//       c.Send(env); c.Set(k,v)/c.Get(k)(any,bool); c.Rooms() []string
// Hub:  hub.Join(c, roomID) *Room; hub.Leave(c, roomID); hub.Room(id)(*Room,bool)
//       hub.Broadcast(roomID, env); hub.BroadcastSeq(roomID, env) // stamps room seq
//       hub.Count() int
// Room: room.ID; room.NextSeq() uint64; room.Size() int; room.Members() []*Conn
// Envelope: realtime.MustEnvelope(event string, payload any) Envelope
//           realtime.NewEnvelope(event, payload)(Envelope,error); env.Bind(&v); env.Event/.Payload/.Seq/.TS
// GraceTimers: g := realtime.NewGraceTimers(); g.Schedule(key, d, fn); g.Cancel(key) bool; g.CancelAll()
```

## Standard main() skeleton (HTTP/realtime service)
```go
package main
func main() {
    cfg, err := config.LoadCommon("rmhbox")
    logger := log.New("rmhbox", cfg.LogLevel)
    if err != nil { logger.Fatal("config", "error", err) }
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    database, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
    if err != nil { logger.Fatal("db", "error", err) }
    defer database.Close()
    metrics := telemetry.New("rmhbox")
    host, _ := os.Hostname()
    bus, _ := events.FromURL(host, cfg.RedisURL)
    defer bus.Close()
    v := auth.NewValidator(database.Pool)
    hub := realtime.NewHub(ctx, realtime.Options{Origin: host, Logger: logger, Metrics: metrics, Validator: v, Bus: bus})
    mgr := rmhbox.NewManager(hub, database, logger) // your internal package
    mgr.Register()
    mux := http.NewServeMux()
    mux.HandleFunc("/health", httpx.Health("rmhbox", nil))
    mux.Handle("/metrics", metrics.Handler())
    mux.HandleFunc("/rmhbox-ws/", hub.ServeWS)
    addr := ":" + config.GetString("RMHBOX_PORT", "7676")
    srv := httpx.NewServer(addr, mux, logger)
    if err := srv.Run(30 * time.Second); err != nil { logger.Error("server", "error", err) }
}
```

## Worker skeleton (no client HTTP, just metrics + jobs)
```go
func main() {
    cfg, _ := config.LoadCommon("doctrine-worker")
    logger := log.New("doctrine-worker", cfg.LogLevel)
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
    if err != nil { logger.Fatal("db", "error", err) }
    defer database.Close()
    metrics := telemetry.New("doctrine-worker")
    go func() {
        mux := http.NewServeMux()
        mux.HandleFunc("/health", httpx.Health("doctrine-worker", nil))
        mux.Handle("/metrics", metrics.Handler())
        _ = http.ListenAndServe(cfg.MetricsAddr, mux)
    }()
    w := worker.New(database, logger, metrics)
    w.Start(ctx)              // launches goroutine tickers
    httpx.WaitForSignal()     // block
    cancel(); w.Stop()
}
```
