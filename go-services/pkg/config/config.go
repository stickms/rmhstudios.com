// Package config centralizes environment-driven configuration for every
// rmhstudios Go service. It mirrors the conventions used by the legacy Node
// services (DATABASE_URL, SERVER_DB_POOL_SIZE, the PORT_* family) so the Go
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
	// DBPoolSize mirrors SERVER_DB_POOL_SIZE (Node default 5).
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

// LoadCommon reads the shared configuration for a service.
func LoadCommon(serviceName string) (Common, error) {
	c := Common{
		ServiceName: serviceName,
		Env:         GetString("NODE_ENV", "production"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		DBPoolSize:  int32(GetInt("SERVER_DB_POOL_SIZE", 5)),
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
