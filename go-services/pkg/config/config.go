// Package config centralizes environment-driven configuration for every
// rmhstudios Go service. It mirrors the conventions used by the legacy Node
// services (DATABASE_URL, the PORT_* family) so the Go
// fleet is a drop-in replacement that reads the SAME .env.production file the
// Helm chart from PR #121 already mounts as a Kubernetes Secret.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Common holds configuration shared by all services.
type Common struct {
	// ServiceName is used for structured logging and metrics labels.
	ServiceName string
	// Env is one of "development", "staging", "production".
	Env string
	// DatabaseURL is the single Postgres DSN used across the whole platform,
	// identical to the Node services' DATABASE_URL.
	DatabaseURL string
	// DBPoolSize is the Postgres pool a Go process opens (GO_DB_POOL_SIZE),
	// default DefaultGoDBPoolSize, never above MaxGoDBPoolSize. It is NOT the
	// Node hubs' SERVER_DB_POOL_SIZE: that knob belongs to a different fleet.
	DBPoolSize int32
	// RedisURL, when set, enables the cross-instance pub/sub backplane that
	// lets the realtime services scale horizontally (the Stage-1 work called
	// out in PR #121's scaling roadmap). Empty => single-instance in-memory.
	RedisURL string
	// MetricsAddr is the host:port the Prometheus endpoint binds to.
	MetricsAddr string
	// LogLevel is one of debug, info, warn, error.
	LogLevel string
}

// Go DB pool sizing.
//
// MaxGoDBPoolSize is the cap: the supervisor runs six workers (doctrine, vibe,
// recap, discord-bot, bot-worker, streak-saver), each with at least one
// goroutine that can be mid-query at the same moment, so six is the most
// connections that can ever be busy at once for the work done today; a pool
// larger than the concurrency only parks idle connections on the shared server.
//
// DefaultGoDBPoolSize is what runs unless GO_DB_POOL_SIZE says otherwise. It is
// the budget the Postgres connection plan already reserves for Go: the fleet
// arithmetic in scripts/db-connection-budget.mjs counts a supervisor pool of 3
// (GO_POOL_DEFAULT, and it reads GO_DB_POOL_SIZE) on top of the status probe's 2
// and 2 slack. Raising the default means raising GO_POOL_DEFAULT there too.
const (
	DefaultGoDBPoolSize = 3
	MaxGoDBPoolSize     = 6
)

// ClampDBPoolSize forces a configured pool size into [1, MaxGoDBPoolSize].
func ClampDBPoolSize(n int) int32 {
	if n < 1 {
		return 1
	}
	if n > MaxGoDBPoolSize {
		return MaxGoDBPoolSize
	}
	return int32(n)
}

// LoadCommon reads the shared configuration for a service.
func LoadCommon(serviceName string) (Common, error) {
	c := Common{
		ServiceName: serviceName,
		Env:         GetString("NODE_ENV", "production"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		DBPoolSize:  ClampDBPoolSize(GetInt("GO_DB_POOL_SIZE", DefaultGoDBPoolSize)),
		RedisURL:    os.Getenv("REDIS_URL"),
		MetricsAddr: GetString("METRICS_ADDR", ":9090"),
		LogLevel:    GetString("LOG_LEVEL", "info"),
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("config: DATABASE_URL is required for service %q", serviceName)
	}
	return c, nil
}

// GetString returns the env var or a fallback.
func GetString(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// GetInt returns the env var parsed as int, or a fallback.
func GetInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// GetBool returns the env var parsed as bool, or a fallback.
func GetBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

// GetDuration parses a duration like "30s", or returns fallback.
func GetDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

// GetFloat returns the env var parsed as float64, or a fallback.
func GetFloat(key string, fallback float64) float64 {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

// GetMillis reads an integer millisecond count (the Node services' `*_MS`
// convention) as a duration, or returns fallback. Non-positive values are
// ignored so a stray "0" can never produce a zero-interval ticker.
func GetMillis(key string, fallback time.Duration) time.Duration {
	if n := GetInt(key, 0); n > 0 {
		return time.Duration(n) * time.Millisecond
	}
	return fallback
}

// GetCSV splits a comma-separated env var into trimmed, non-empty parts.
func GetCSV(key string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
