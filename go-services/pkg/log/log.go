// Package log is a thin wrapper over the standard library's structured logger
// (log/slog). It reproduces the JSON shape emitted by the Node services'
// server/shared/logger.ts (level / service / timestamp + arbitrary fields) so
// existing log-based dashboards and alerts keep working after the migration.
package log

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

// Logger is the platform logger. It is safe for concurrent use.
type Logger struct {
	*slog.Logger
	service string
}

// New builds a JSON logger bound to a service name at the given level.
func New(service, level string) *Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(level),
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			// Match the Node logger's field name: "timestamp" not "time".
			if a.Key == slog.TimeKey {
				a.Key = "timestamp"
			}
			return a
		},
	})
	l := slog.New(h).With(slog.String("service", service))
	return &Logger{Logger: l, service: service}
}

// With returns a child logger with extra structured fields.
func (l *Logger) With(args ...any) *Logger {
	return &Logger{Logger: l.Logger.With(args...), service: l.service}
}

// Service returns the bound service name.
func (l *Logger) Service() string { return l.service }

// Fatal logs at error level and exits non-zero. Used only for unrecoverable
// startup failures, mirroring the Node services' boot behavior.
func (l *Logger) Fatal(msg string, args ...any) {
	l.Logger.Error(msg, args...)
	os.Exit(1)
}

// FromContext is a placeholder for future request-scoped loggers; today it
// returns the default logger so call sites are stable.
func FromContext(_ context.Context, fallback *Logger) *Logger { return fallback }

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
