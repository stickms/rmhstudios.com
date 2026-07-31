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
	// it to the service's /health on the VPS.
	websiteURL := config.GetString("STATUS_WEBSITE_URL", "https://rmhstudios.com/")
	publicOrigin := config.GetString("STATUS_PUBLIC_ORIGIN", "")
	if publicOrigin == "" {
		publicOrigin = originOf(websiteURL)
	}

	// Internal-only services have no public route by design — the background
	// workers (supervisor) face nothing user-facing, and the Go assets origin
	// sits behind the CDN — so they are probed on their internal /health, at
	// compose DNS names by default with a STATUS_<svc>_URL override.
	//
	// The Gateway and standalone-RMHmusic probes are GONE. They described the
	// k3s/Helm Go realtime topology, which was deleted in the rewrite (design
	// §5.2): there is no Go gateway, and RMHmusic is a namespace inside the Node
	// socket-server rather than its own service, so both are covered by the
	// Website and Realtime probes respectively. Probing them was either dead
	// configuration or — worse — a green tile for a service that does not exist.
	urls := probeURLs{
		Website:    websiteURL,
		Ready:      config.GetString("STATUS_READY_URL", publicOrigin+"/api/ready"),
		Feed:       config.GetString("STATUS_FEED_URL", publicOrigin+"/blog.rss.xml"),
		Sitemap:    config.GetString("STATUS_SITEMAP_URL", publicOrigin+"/sitemap.xml"),
		Socket:     config.GetString("STATUS_SOCKET_URL", publicOrigin+"/socket/health"),
		RMHBox:     config.GetString("STATUS_RMHBOX_URL", publicOrigin+"/rmhbox-ws/health"),
		RMHTube:    config.GetString("STATUS_RMHTUBE_URL", publicOrigin+"/rmhtube-ws/health"),
		Assets:     config.GetString("STATUS_ASSETS_URL", fmt.Sprintf("http://assets:%s/health", portAssets)),
		// The five background workers (recap, discord-bot, doctrine, vibe,
		// bot-worker) plus streak-saver are consolidated as goroutines inside the
		// supervisor process, which serves /health on its METRICS_ADDR
		// (default :9090). There is no standalone recap:7004.
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

// probeURLs holds the resolved URL for every HTTP probe target. Each is
// resolved by main() from a default plus a STATUS_<svc>_URL override. The
// user-facing ones point at the PUBLIC origin (DNS → edge → active container);
// the internal-only ones (assets, supervisor) at compose DNS names.
//
// Ready/Feed/Sitemap are FUNCTIONAL probes, not liveness ones: they exercise
// the database, the render path and the SEO surface through the same route a
// visitor takes, so the dashboard can tell "the process is up" apart from "the
// website works".
//
// Every functional probe target must be reachable ANONYMOUSLY. That rules out
// the obvious candidates — /api/pulse and /api/search both require a session
// and would pin a probe at HTTP 401 (a permanent false "degraded") — which is
// why the content probe is the public blog feed rather than the search API.
type probeURLs struct {
	Website    string
	Ready      string
	Feed       string
	Sitemap    string
	Socket     string
	RMHBox     string
	RMHTube    string
	Assets     string
	Supervisor string
}

// Latency budgets. Past these a target is reported `degraded` even though it
// answered: an SSR page that takes 4s or a hub health check that takes 2s is a
// user-visible problem, and a status page that calls it "Operational" is the
// one telling the lie. Values are deliberately generous — they mark
// pathological slowness, not a missed performance target (docs/performance-slo.md
// owns those).
const (
	websiteBudget = 4 * time.Second
	apiBudget     = 2500 * time.Millisecond
	hubBudget     = 1500 * time.Millisecond
)

// buildTargets assembles the probe target list for the topology that actually
// runs (docker-compose on the VPS behind Apache/Cloudflare):
//
//   - Core: the SSR web app, its readiness endpoint, and Postgres. These probe
//     the real user path through the public origin, and assert on CONTENT — a
//     200 with an empty shell is degraded, not up.
//   - Realtime: the three Node hubs, via their edge-exposed health prefixes.
//   - Content: the public feed + sitemap, which prove the DB-backed render and
//     the SEO surface still work. These break independently of the homepage and
//     used to fail silently.
//   - Platform: the Go assets origin and the supervisor running the six
//     background workers, both internal-only.
//
// When DATABASE_URL is set the Database probe (same SELECT 1 check) is
// appended; unset, it is omitted so cmd/status starts cleanly without a DB.
func buildTargets(u probeURLs, probeTimeout time.Duration) []status.Target {
	targets := []status.Target{
		{
			Name:        "Website",
			Description: "Main rmhstudios.com web app (server-rendered)",
			Group:       "Core",
			URL:         u.Website,
			// The site shell's skip-link target. Present in every server-rendered
			// page under the site layout, absent from an error page or a blank
			// shell — so this is the cheapest honest "did the app render?" check.
			Expect:        `id="main-content"`,
			DegradedAfter: websiteBudget,
		},
		{
			Name:        "App readiness",
			Description: "Web tier's dependencies: database connectivity and client/schema agreement",
			Group:       "Core",
			URL:         u.Ready,
			// /api/ready reports its own aggregate; anything but "ok" (slow
			// component, unreachable dependency) fails the assertion and lands
			// here as degraded.
			Expect:        `"status":"ok"`,
			DegradedAfter: apiBudget,
		},
	}

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		targets = append(targets, status.Target{
			Name:        "Database",
			Description: "PostgreSQL (direct connection, SELECT 1)",
			Group:       "Core",
			Probe:       newDBProbe(dsn, probeTimeout),
		})
	}

	targets = append(targets,
		status.Target{
			Name:          "Realtime / Games",
			Description:   "Socket server: multiplayer games, presence, RMHmusic",
			Group:         "Realtime",
			URL:           u.Socket,
			DegradedAfter: hubBudget,
		},
		status.Target{
			Name:          "RMHbox",
			Description:   "Party-game WebSocket server",
			Group:         "Realtime",
			URL:           u.RMHBox,
			DegradedAfter: hubBudget,
		},
		status.Target{
			Name:          "RMHtube",
			Description:   "Watch-together WebSocket server",
			Group:         "Realtime",
			URL:           u.RMHTube,
			DegradedAfter: hubBudget,
		},

		status.Target{
			Name:          "Content feed",
			Description:   "Public blog RSS — proves the database-backed render path",
			Group:         "Content",
			URL:           u.Feed,
			Expect:        "<rss",
			DegradedAfter: apiBudget,
		},
		status.Target{
			Name:          "Sitemap",
			Description:   "Generated sitemap.xml — the discovery surface search engines read",
			Group:         "Content",
			URL:           u.Sitemap,
			Expect:        "<urlset",
			DegradedAfter: apiBudget,
		},

		status.Target{
			Name:        "Assets",
			Description: "Media origin: library / music / models / sprites (Go)",
			Group:       "Platform",
			URL:         u.Assets,
		},
		// The six background workers run as goroutines inside the supervisor
		// process — probe its shared /health.
		status.Target{
			Name:        "Background workers",
			Description: "Supervisor: discord-bot, recap, doctrine, vibe, bot-worker, streak-saver",
			Group:       "Platform",
			URL:         u.Supervisor,
		},
	)

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
