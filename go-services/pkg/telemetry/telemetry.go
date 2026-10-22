// Package telemetry exposes Prometheus metrics for the fleet. PR #121's
// roadmap lists observability as Stage 2; this gives every Go service a
// uniform /metrics endpoint and a few standard instruments out of the box so
// that stage is wiring dashboards, not adding instrumentation.
package telemetry

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics is a small bundle of instruments shared across services.
type Metrics struct {
	reg *prometheus.Registry

	// ActiveConnections tracks live websocket connections (realtime services).
	ActiveConnections prometheus.Gauge
	// MessagesTotal counts inbound realtime messages by event.
	MessagesTotal *prometheus.CounterVec
	// DBQueries counts DB queries by outcome.
	DBQueries *prometheus.CounterVec
	// JobRuns counts background job executions by name and outcome (workers).
	JobRuns *prometheus.CounterVec
	// WorkerPanics counts panics the supervisor recovered from a worker's Run
	// (each one is followed by an in-place restart of that worker).
	WorkerPanics prometheus.Counter
	// WorkerUp is 1 while the supervisor has this worker's Run executing, 0
	// once it has panicked (until restarted) or returned.
	WorkerUp prometheus.Gauge
	// JobLastSuccess is the unix time of each job's last "ok" run (RecordJob).
	// Absent until a job first succeeds, so an idle/disabled job never looks stale.
	JobLastSuccess *prometheus.GaugeVec
	// GatewayConnected is 1 while a Discord gateway session is connected.
	GatewayConnected prometheus.Gauge
	// PuzzlesReadyFor is the unix time (UTC midnight) of the latest day whose
	// daily puzzles the doctrine worker has confirmed exist.
	PuzzlesReadyFor prometheus.Gauge
}

// RecordJob counts one job run; an "ok" run also stamps JobLastSuccess. Safe
// on a nil *Metrics (standalone binaries without metrics).
func (m *Metrics) RecordJob(job, outcome string) {
	if m == nil {
		return
	}
	m.JobRuns.WithLabelValues(job, outcome).Inc()
	if outcome == "ok" {
		m.JobLastSuccess.WithLabelValues(job).SetToCurrentTime()
	}
}

// New builds a Metrics bundle bound to a fresh registry labeled by service.
func New(service string) *Metrics {
	reg := prometheus.NewRegistry()
	factory := promauto.With(reg)
	labels := prometheus.Labels{"service": service}

	return &Metrics{
		reg: reg,
		ActiveConnections: factory.NewGauge(prometheus.GaugeOpts{
			Name: "rmh_active_connections", Help: "Live websocket connections.", ConstLabels: labels,
		}),
		MessagesTotal: factory.NewCounterVec(prometheus.CounterOpts{
			Name: "rmh_messages_total", Help: "Inbound realtime messages.", ConstLabels: labels,
		}, []string{"event"}),
		DBQueries: factory.NewCounterVec(prometheus.CounterOpts{
			Name: "rmh_db_queries_total", Help: "Database queries.", ConstLabels: labels,
		}, []string{"outcome"}),
		JobRuns: factory.NewCounterVec(prometheus.CounterOpts{
			Name: "rmh_job_runs_total", Help: "Background job executions.", ConstLabels: labels,
		}, []string{"job", "outcome"}),
		WorkerPanics: factory.NewCounter(prometheus.CounterOpts{
			Name: "rmh_worker_panics_total", Help: "Worker panics recovered by the supervisor.", ConstLabels: labels,
		}),
		WorkerUp: factory.NewGauge(prometheus.GaugeOpts{
			Name: "rmh_worker_up", Help: "1 while the worker's Run is executing.", ConstLabels: labels,
		}),
		JobLastSuccess: factory.NewGaugeVec(prometheus.GaugeOpts{
			Name: "rmh_job_last_success_timestamp_seconds", Help: "Unix time of the job's last ok run.", ConstLabels: labels,
		}, []string{"job"}),
		GatewayConnected: factory.NewGauge(prometheus.GaugeOpts{
			Name: "rmh_discord_gateway_connected", Help: "1 while the Discord gateway is connected.", ConstLabels: labels,
		}),
		PuzzlesReadyFor: factory.NewGauge(prometheus.GaugeOpts{
			Name: "rmh_doctrine_puzzles_ready_for_timestamp_seconds", Help: "UTC midnight of the latest day with its daily puzzles in place.", ConstLabels: labels,
		}),
	}
}

// Handler returns the /metrics HTTP handler for this service's registry.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{})
}

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
