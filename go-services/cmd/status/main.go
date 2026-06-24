// Command status is the Go port of server/status/index.ts: the standalone
// RMH Studios status page service. It periodically probes every other service's
// /health endpoint and serves an auto-refreshing HTML dashboard at / and a JSON
// API at /api/status. It runs as its own process so the status page stays up
// even when the rest of the stack is down.
package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
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

	portAssets := config.GetString("ASSETS_PORT", "7007")

	// The user-facing services are probed through the PUBLIC origin so the status
	// reflects the real user path (DNS → CDN → edge proxy → service), not just
	// internal container reachability. STATUS_PUBLIC_ORIGIN names that origin;
	// unset, it's derived from STATUS_WEBSITE_URL so a single env configures every
	// public probe (prod → rmhstudios.com, staging → its own host). The edge
	// exposes each realtime hub's health under its existing WS prefix
	// (/socket/health, /rmhbox-ws/health, /rmhtube-ws/health) — Apache rewrites
	// it to the service's /health on the VPS; the Go gateway passes the prefixed
	// path straight through to the hub under k3s — so the same public URL works
	// in both topologies.
	websiteURL := config.GetString("STATUS_WEBSITE_URL", "https://rmhstudios.com/")
	publicOrigin := config.GetString("STATUS_PUBLIC_ORIGIN", "")
	if publicOrigin == "" {
		publicOrigin = originOf(websiteURL)
	}

	// Internal-only services have no public route by design — the background
	// workers (supervisor) face nothing user-facing, and the Go assets origin
	// sits behind the CDN — so they are probed on their internal /health. Those
	// internal hostnames are compose DNS names by default and get a STATUS_<svc>_
	// URL override under k3s (where Services render as {release}-<svc>).
	//
	// Gateway and RMHmusic are part of the k3s/Helm Go topology but do NOT run
	// under docker-compose (where web/socket are still the Node services, and the
	// edge has no /rmhmusic-ws or gateway route). They are probed only when their
	// STATUS_<svc>_URL is explicitly set — the same "configure to enable" pattern
	// the Database probe uses for DATABASE_URL — so compose never shows a false
	// "down" (or, worse, a false "up" from the web catch-all) for a service it
	// doesn't run.
	urls := probeURLs{
		Website:    websiteURL,
		Gateway:    config.GetString("STATUS_GATEWAY_URL", ""),
		Socket:     config.GetString("STATUS_SOCKET_URL", publicOrigin+"/socket/health"),
		RMHMusic:   config.GetString("STATUS_RMHMUSIC_URL", ""),
		RMHBox:     config.GetString("STATUS_RMHBOX_URL", publicOrigin+"/rmhbox-ws/health"),
		RMHTube:    config.GetString("STATUS_RMHTUBE_URL", publicOrigin+"/rmhtube-ws/health"),
		Assets:     config.GetString("STATUS_ASSETS_URL", fmt.Sprintf("http://assets:%s/health", portAssets)),
		// The five background workers (recap, discord-bot, doctrine, vibe,
		// bot-worker) are consolidated as goroutines inside the supervisor
		// process, which serves /health on its METRICS_ADDR (default :9090).
		// There is no standalone recap:7004 in the Go topology, so probe the
		// supervisor instead.
		Supervisor: config.GetString("STATUS_SUPERVISOR_URL", "http://supervisor:9090/health"),
	}

	probeInterval := time.Duration(config.GetInt("STATUS_PROBE_INTERVAL_MS", 15000)) * time.Millisecond
	probeTimeout := time.Duration(config.GetInt("STATUS_PROBE_TIMEOUT_MS", 4000)) * time.Millisecond
	bucketDur := time.Duration(config.GetInt("STATUS_BUCKET_MS", 60*60*1000)) * time.Millisecond
	maxBuckets := config.GetInt("STATUS_MAX_BUCKETS", 90)

	targets := buildTargets(urls, probeTimeout)

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

// probeURLs holds the resolved /health URLs for every HTTP probe target. Each
// is resolved by main() from a compose-DNS default plus a STATUS_<svc>_URL
// override, so the same binary probes the right hosts under both compose and
// k3s. Website is the public origin (DNS → edge → active container). Gateway
// and RMHMusic are empty unless explicitly configured (k3s-only services).
type probeURLs struct {
	Website    string
	Gateway    string
	Socket     string
	RMHMusic   string
	RMHBox     string
	RMHTube    string
	Assets     string
	Supervisor string
}

// buildTargets assembles the probe target list covering the Go-service
// topology. It always probes the core HTTP services (the web app via its PUBLIC
// origin; the realtime hubs by their resolved URLs; the Go assets CDN; the
// consolidated background workers via the supervisor's shared /health). The
// gateway edge and the RMHmusic hub are k3s-only and are appended only when
// their URL is configured (Gateway/RMHMusic non-empty). When DATABASE_URL is
// set the Database probe (Node's `kind: 'database'` service, same SELECT 1
// check) is appended too; with it unset the Database target is omitted so
// cmd/status starts cleanly without a DB. Every URL is resolved by the caller
// (compose DNS default, STATUS_<svc>_URL override) so the same binary works
// under both compose and k3s.
func buildTargets(u probeURLs, probeTimeout time.Duration) []status.Target {
	targets := []status.Target{
		{Name: "Website", Description: "Main rmhstudios.com web app", URL: u.Website},
	}
	// Gateway edge sits in front of the web app — list it right after Website
	// when it's part of the deployment (k3s).
	if u.Gateway != "" {
		targets = append(targets, status.Target{Name: "Gateway", Description: "Edge ingress / reverse proxy (Go)", URL: u.Gateway})
	}
	targets = append(targets,
		status.Target{Name: "Realtime / Games", Description: "Gamehub WebSocket server (multiplayer + live apps)", URL: u.Socket},
	)
	if u.RMHMusic != "" {
		targets = append(targets, status.Target{Name: "RMHmusic", Description: "Collaborative music WebSocket server (Go)", URL: u.RMHMusic})
	}
	targets = append(targets,
		status.Target{Name: "RMHbox", Description: "Party-game WebSocket server", URL: u.RMHBox},
		status.Target{Name: "RMHtube", Description: "Watch-together WebSocket server", URL: u.RMHTube},
		status.Target{Name: "Assets", Description: "Media CDN: library / music / models / sprites (Go)", URL: u.Assets},
		// Background workers run as goroutines inside the supervisor process
		// (recap, discord-bot, doctrine, vibe, bot-worker) — probe its shared
		// /health (2xx = up, same as the other HTTP probes).
		status.Target{Name: "Background workers", Description: "Supervisor: discord-bot, recap, doctrine, vibe, bot-worker", URL: u.Supervisor},
	)

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		targets = append(targets, status.Target{
			Name:        "Database",
			Description: "PostgreSQL (via Prisma)",
			Probe:       newDBProbe(dsn, probeTimeout),
		})
	}

	return targets
}

// originOf returns the scheme://host origin of a URL (stripping any path/query),
// used to derive the public probe origin from STATUS_WEBSITE_URL. If raw can't
// be parsed into a scheme+host it is returned trimmed of any trailing slash, so
// a value that is already a bare origin still works.
func originOf(raw string) string {
	if u, err := url.Parse(raw); err == nil && u.Scheme != "" && u.Host != "" {
		return u.Scheme + "://" + u.Host
	}
	return strings.TrimRight(raw, "/")
}
