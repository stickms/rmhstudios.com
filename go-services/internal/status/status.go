package status

import (
	"context"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

// Config holds the runtime parameters for the status service.
type Config struct {
	Targets       []Target
	ProbeInterval time.Duration
	ProbeTimeout  time.Duration
	BucketDur     time.Duration
	MaxBuckets    int
	// MaxDays is how many daily rollups are retained (default 90).
	MaxDays int
	// RecentSamples is the size of each service's raw-check ring (default 240).
	RecentSamples int
	// IncidentOpenAfter / IncidentCloseAfter debounce automatic incidents
	// (defaults 2 and 2): a failure streak shorter than OpenAfter checks is a
	// blip, and CloseAfter good checks in a row resolve an incident.
	IncidentOpenAfter  int
	IncidentCloseAfter int
	// HistoryPath, when non-empty, enables persistence of the rolling uptime
	// history to that file (Node's status-history.json) so percentages survive
	// restarts. Existing history is loaded on New. The extended history and the
	// incident store are persisted beside it.
	HistoryPath string
	// Logger receives non-fatal warnings (e.g. history persistence problems).
	// nil disables logging.
	Logger Warner
	// SLO parameterises the multi-window burn-rate report (E14) served at
	// /api/slo and rendered on the dashboard. The zero value takes the defaults
	// in SLOConfig.normalise (99.9% over 1h/6h windows, a 30-day budget).
	SLO SLOConfig

	// PageURL is the status page's own public URL (feeds, badges and webhooks
	// link back to it). PageName is its display name.
	PageURL  string
	PageName string
	// AdminToken enables the write API under /api/admin/ (incidents,
	// maintenance, announcements). Empty disables it entirely.
	AdminToken string
	// WebhookURLs receive incident and maintenance notifications; Discord and
	// Slack URLs get their native formats. WebhookSecret signs generic ones.
	WebhookURLs   []string
	WebhookSecret string
	// Oncall, when non-nil, gets a heartbeat after each probe cycle and every
	// automatic incident as an alarm (oncall.go). nil = on-call not configured.
	Oncall *oncall.Client
	// Announcement is an optional static banner (STATUS_ANNOUNCEMENT).
	Announcement      string
	AnnouncementLevel string
	AnnouncementLink  string
}

// Service orchestrates probing and HTTP serving.
type Service struct {
	cfg       Config
	prober    *Prober
	store     *Store
	notifier  *WebhookNotifier
	oncall    *OncallNotifier
	heartbeat *heartbeater
	startedAt time.Time
}

// New constructs a Service from the given config.
func New(cfg Config) *Service {
	if cfg.ProbeInterval == 0 {
		cfg.ProbeInterval = 15 * time.Second
	}
	if cfg.ProbeTimeout == 0 {
		cfg.ProbeTimeout = 4 * time.Second
	}
	if cfg.BucketDur == 0 {
		cfg.BucketDur = time.Hour
	}
	if cfg.MaxBuckets == 0 {
		cfg.MaxBuckets = 90
	}
	if cfg.MaxDays <= 0 {
		cfg.MaxDays = 90
	}
	if cfg.RecentSamples <= 0 {
		cfg.RecentSamples = 240
	}
	if cfg.IncidentOpenAfter <= 0 {
		cfg.IncidentOpenAfter = 2
	}
	if cfg.IncidentCloseAfter <= 0 {
		cfg.IncidentCloseAfter = 2
	}
	if cfg.PageName == "" {
		cfg.PageName = "RMH Studios"
	}
	cfg.PageURL = strings.TrimRight(cfg.PageURL, "/")

	p := NewProber(cfg.Targets)
	p.timeout = cfg.ProbeTimeout
	p.bucketDur = cfg.BucketDur
	p.maxBuckets = cfg.MaxBuckets
	p.interval = cfg.ProbeInterval
	p.maxDays = cfg.MaxDays
	p.recentCap = cfg.RecentSamples
	p.openAfter = cfg.IncidentOpenAfter
	p.closeAfter = cfg.IncidentCloseAfter

	// Enable history persistence (load existing buckets now) before any probe
	// runs, so the first /api/status already reflects pre-restart uptime.
	if cfg.HistoryPath != "" {
		p.EnableHistoryPersistence(cfg.HistoryPath, cfg.Logger)
	}

	notifier := NewWebhookNotifier(cfg.WebhookURLs, cfg.WebhookSecret, cfg.PageURL, cfg.Logger)
	storePath := ""
	if cfg.HistoryPath != "" {
		storePath = filepath.Join(filepath.Dir(cfg.HistoryPath), IncidentsFileName)
	}
	oncallNotifier := NewOncallNotifier(cfg.Oncall, cfg.PageURL, cfg.Logger)
	var fan multiNotifier
	if notifier != nil {
		fan = append(fan, notifier)
	}
	if oncallNotifier != nil {
		fan = append(fan, oncallNotifier)
	}
	var n Notifier
	switch len(fan) {
	case 0:
	case 1:
		n = fan[0]
	default:
		n = fan
	}
	store := NewStore(cfg.Targets, storePath, cfg.Logger, n)
	store.SetStaticAnnouncement(cfg.Announcement, cfg.AnnouncementLevel, cfg.AnnouncementLink)

	p.inMaintenance = store.InMaintenance
	p.onEvents = store.HandleEvents

	var hb *heartbeater
	if cfg.Oncall != nil {
		hb = &heartbeater{client: cfg.Oncall, logger: cfg.Logger, interval: HeartbeatInterval}
	}
	return &Service{cfg: cfg, prober: p, store: store, notifier: notifier, oncall: oncallNotifier, heartbeat: hb, startedAt: time.Now()}
}

// Store exposes the incident store (tests, cmd wiring).
func (s *Service) Store() *Store { return s.store }

// Prober exposes the prober (tests).
func (s *Service) Prober() *Prober { return s.prober }

// Start fires an initial probe immediately then probes on the configured interval
// until ctx is cancelled. It runs in a goroutine and returns immediately.
func (s *Service) Start(ctx context.Context) {
	if s.notifier != nil {
		go s.notifier.Run(ctx)
	}
	if s.oncall != nil {
		go s.oncall.Run(ctx)
	}
	go func() {
		s.prober.ProbeOnce(ctx)
		s.store.Tick(time.Now())
		// Checked in only after a completed cycle, so a wedged prober goes
		// silent and the watchdog pages.
		s.heartbeat.afterCycle(ctx, time.Now())
		ticker := time.NewTicker(s.cfg.ProbeInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				// Final flush on shutdown, matching Node's SIGTERM saveHistory().
				// Best-effort: SaveHistory tolerates and logs any error.
				s.prober.SaveHistory()
				return
			case <-ticker.C:
				s.prober.ProbeOnce(ctx)
				s.store.Tick(time.Now())
				s.heartbeat.afterCycle(ctx, time.Now())
			}
		}
	}()
}

// View computes the page model at now.
func (s *Service) View(now time.Time) *View {
	v := BuildView(s.prober, s.store, s.cfg.SLO, s.startedAt, now)
	if s.notifier != nil {
		v.Self.Notifiers = len(s.notifier.URLs)
	}
	v.Self.AdminEnabled = s.cfg.AdminToken != ""
	return v
}

// Handler returns the HTTP mux for the status service.
func (s *Service) Handler() http.Handler {
	return withGzip(newDashboard(s))
}
