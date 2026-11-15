// Package telemetry exposes Prometheus metrics for the fleet. PR #121's
// roadmap lists observability as Stage 2; this gives every Go service a
// uniform /metrics endpoint and a few standard instruments out of the box so
// that stage is wiring dashboards, not adding instrumentation.
//
// The worker instruments (rmh_worker_up, rmh_worker_panics_total,
// rmh_job_last_success_timestamp_seconds, rmh_discord_gateway_connected) and
// the supervisor's merged handler left with the supervisor: the last Go worker,
// the Discord bot, runs in the Node jobs worker now (D3).
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

	// ActiveConnections tracks live connections.
	ActiveConnections prometheus.Gauge
	// MessagesTotal counts inbound messages by event.
	MessagesTotal *prometheus.CounterVec
	// DBQueries counts DB queries by outcome.
	DBQueries *prometheus.CounterVec
}

// New builds a Metrics bundle bound to a fresh registry labeled by service.
func New(service string) *Metrics {
	reg := prometheus.NewRegistry()
	factory := promauto.With(reg)
	labels := prometheus.Labels{"service": service}

	return &Metrics{
		reg: reg,
		ActiveConnections: factory.NewGauge(prometheus.GaugeOpts{
			Name: "rmh_active_connections", Help: "Live connections.", ConstLabels: labels,
		}),
		MessagesTotal: factory.NewCounterVec(prometheus.CounterOpts{
			Name: "rmh_messages_total", Help: "Inbound messages.", ConstLabels: labels,
		}, []string{"event"}),
		DBQueries: factory.NewCounterVec(prometheus.CounterOpts{
			Name: "rmh_db_queries_total", Help: "Database queries.", ConstLabels: labels,
		}, []string{"outcome"}),
	}
}

// Handler returns the /metrics HTTP handler for this service's registry.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{})
}
