package worker

import (
	"time"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// RunStandalone is the shared bootstrap sequence for every standalone cmd
// wrapper: config → logger → SignalContext → WaitForReachable → telemetry →
// ServeMetrics → run.
//
// metricsAddr is the host:port for /health and /metrics. Pass "" to use the
// default derived from cfg.MetricsAddr (i.e. the METRICS_ADDR env var, default
// ":9090"). Pass an explicit address for services with a custom port (e.g.
// recap uses ":"+config.GetString("RECAP_PORT","7004")).
func RunStandalone(name string, metricsAddr string, run RunFunc) {
	cfg, err := config.LoadCommon(name)
	logger := log.New(name, cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	if metricsAddr == "" {
		metricsAddr = cfg.MetricsAddr
	}

	ctx, cancel := httpx.SignalContext()
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New(name)
	httpx.ServeMetrics(metricsAddr, name, metrics.Handler(), logger)

	if err := run(ctx, Deps{DB: database, Logger: logger, Metrics: metrics, Cfg: cfg}); err != nil {
		logger.Error("run", "error", err)
	}
}
