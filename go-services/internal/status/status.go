package status

import (
	"context"
	"net/http"
	"time"
)

// Config holds the runtime parameters for the status service.
type Config struct {
	Targets       []Target
	ProbeInterval time.Duration
	ProbeTimeout  time.Duration
	BucketDur     time.Duration
	MaxBuckets    int
	// HistoryPath, when non-empty, enables persistence of the rolling uptime
	// history to that file (Node's status-history.json) so percentages survive
	// restarts. Existing history is loaded on New.
	HistoryPath string
	// Logger receives non-fatal warnings (e.g. history persistence problems).
	// nil disables logging.
	Logger Warner
}

// Service orchestrates probing and HTTP serving.
type Service struct {
	cfg    Config
	prober *Prober
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

	p := NewProber(cfg.Targets)
	p.timeout = cfg.ProbeTimeout
	p.bucketDur = cfg.BucketDur
	p.maxBuckets = cfg.MaxBuckets

	// Enable history persistence (load existing buckets now) before any probe
	// runs, so the first /api/status already reflects pre-restart uptime.
	if cfg.HistoryPath != "" {
		p.EnableHistoryPersistence(cfg.HistoryPath, cfg.Logger)
	}

	return &Service{cfg: cfg, prober: p}
}

// Start fires an initial probe immediately then probes on the configured interval
// until ctx is cancelled. It runs in a goroutine and returns immediately.
func (s *Service) Start(ctx context.Context) {
	go func() {
		s.prober.ProbeOnce(ctx)
		ticker := time.NewTicker(s.cfg.ProbeInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.prober.ProbeOnce(ctx)
			}
		}
	}()
}

// Handler returns the HTTP mux for the status service.
func (s *Service) Handler() http.Handler {
	return newDashboard(s.prober)
}
