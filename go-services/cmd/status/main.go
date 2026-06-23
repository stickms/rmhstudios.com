// Command status is the Go port of server/status/index.ts: the standalone
// RMH Studios status page service. It periodically probes every other service's
// /health endpoint and serves an auto-refreshing HTML dashboard at / and a JSON
// API at /api/status. It runs as its own process so the status page stays up
// even when the rest of the stack is down.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/rmhstudios/rmh-go/internal/status"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

func main() {
	logger := log.New("status", config.GetString("LOG_LEVEL", "info"))

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	websiteURL := config.GetString("STATUS_WEBSITE_URL", "https://rmhstudios.com/")
	portSocket := config.GetString("PORT_SOCKET", "7001")
	portRMHBox := config.GetString("PORT_RMHBOX", "7676")
	portRMHTube := config.GetString("PORT_RMHTUBE", "7003")
	// The five background workers (recap, discord-bot, doctrine, vibe,
	// bot-worker) are consolidated as goroutines inside the supervisor process,
	// which serves /health on its METRICS_ADDR (default :9090). There is no
	// standalone recap:7004 in the Go topology, so probe the supervisor instead.
	supervisorURL := config.GetString("STATUS_SUPERVISOR_URL", "http://supervisor:9090/health")

	probeInterval := time.Duration(config.GetInt("STATUS_PROBE_INTERVAL_MS", 15000)) * time.Millisecond
	probeTimeout := time.Duration(config.GetInt("STATUS_PROBE_TIMEOUT_MS", 4000)) * time.Millisecond
	bucketDur := time.Duration(config.GetInt("STATUS_BUCKET_MS", 60*60*1000)) * time.Millisecond
	maxBuckets := config.GetInt("STATUS_MAX_BUCKETS", 90)

	targets := buildTargets(websiteURL, portSocket, portRMHBox, portRMHTube, supervisorURL, probeTimeout)

	cfg := status.Config{
		Targets:       targets,
		ProbeInterval: probeInterval,
		ProbeTimeout:  probeTimeout,
		BucketDur:     bucketDur,
		MaxBuckets:    maxBuckets,
		HistoryPath:   status.ResolveHistoryPath(config.GetString("STATUS_DATA_DIR", "")),
		Logger:        logger,
	}

	svc := status.New(cfg)
	svc.Start(ctx)

	addr := ":" + config.GetString("STATUS_PORT", "7008")
	if err := httpx.NewServer(addr, svc.Handler(), logger).Run(30 * time.Second); err != nil {
		logger.Error("server error", "error", err)
	}
}

// buildTargets assembles the probe target list. It always probes the HTTP
// services (the web app via its PUBLIC origin; the standalone WS/socket
// services by their compose DNS names; the consolidated background workers via
// the supervisor's shared /health) and, when DATABASE_URL is set, appends the
// Database probe (Node's `kind: 'database'` service) running the same SELECT 1
// health check. With DATABASE_URL unset the Database target is omitted entirely
// so cmd/status starts cleanly without a DB.
func buildTargets(websiteURL, portSocket, portRMHBox, portRMHTube, supervisorURL string, probeTimeout time.Duration) []status.Target {
	targets := []status.Target{
		{Name: "Website", Description: "Main rmhstudios.com web app", URL: websiteURL},
		{Name: "Realtime / Games", Description: "Socket.IO server (multiplayer + live apps)", URL: fmt.Sprintf("http://socket:%s/health", portSocket)},
		{Name: "RMHbox", Description: "Party-game WebSocket server", URL: fmt.Sprintf("http://rmhbox:%s/health", portRMHBox)},
		{Name: "RMHtube", Description: "Watch-together WebSocket server", URL: fmt.Sprintf("http://rmhtube:%s/health", portRMHTube)},
		// Background workers run as goroutines inside the supervisor process
		// (recap, discord-bot, doctrine, vibe, bot-worker) — probe its shared
		// /health (2xx = up, same as the other HTTP probes).
		{Name: "Background workers", Description: "Supervisor: discord-bot, recap, doctrine, vibe, bot-worker", URL: supervisorURL},
	}

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		targets = append(targets, status.Target{
			Name:        "Database",
			Description: "PostgreSQL (via Prisma)",
			Probe:       newDBProbe(dsn, probeTimeout),
		})
	}

	return targets
}
