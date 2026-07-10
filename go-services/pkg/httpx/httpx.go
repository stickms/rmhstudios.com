// Package httpx holds the small HTTP building blocks every service shares:
// a /health handler (the Compose + Helm probes from PR #121 hit this), a
// graceful-shutdown runner wired to SIGINT/SIGTERM (matching the Node
// services' shutdown hooks), and helpers to pull the Better Auth token out of
// a request (cookie or Authorization header).
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Health returns a handler that reports liveness as the Node services do:
// HTTP 200 with a small JSON body. It accepts an optional readiness probe.
func Health(service string, ready func(context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := ready(ctx); err != nil {
				WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
					"status": "unavailable", "service": service, "error": err.Error(),
				})
				return
			}
		}
		WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": service})
	}
}

// WriteJSON writes a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// SessionToken extracts a Better Auth session token from a request. It checks,
// in order: the Authorization: Bearer header, then the Better Auth cookie
// (better-auth.session_token, optionally __Secure- prefixed). The cookie value
// is URL-style "<token>.<signature>"; Better Auth validates against the part
// before the dot, which is what the "session".token column stores.
func SessionToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	for _, name := range []string{"better-auth.session_token", "__Secure-better-auth.session_token"} {
		if c, err := r.Cookie(name); err == nil && c.Value != "" {
			if i := strings.IndexByte(c.Value, '.'); i > 0 {
				return c.Value[:i]
			}
			return c.Value
		}
	}
	return ""
}

// Server wraps http.Server with a graceful Run helper.
type Server struct {
	*http.Server
	logger *log.Logger
}

// NewServer builds an HTTP server on addr with the given handler.
func NewServer(addr string, h http.Handler, logger *log.Logger) *Server {
	return &Server{
		Server: &http.Server{
			Addr:              addr,
			Handler:           h,
			ReadHeaderTimeout: 10 * time.Second,
		},
		logger: logger,
	}
}

// Run starts the server and blocks until SIGINT/SIGTERM, then drains
// connections within the grace period. This is the Go analog of the Node
// services' SIGTERM handlers (e.g. the discord-bot's 90s grace).
func (s *Server) Run(grace time.Duration) error {
	errc := make(chan error, 1)
	go func() {
		s.logger.Info("http listening", "addr", s.Addr)
		if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errc:
		return err
	case sig := <-stop:
		s.logger.Info("shutdown signal received", "signal", sig.String())
	}
	ctx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	return s.Shutdown(ctx)
}

// WaitForSignal blocks until SIGINT/SIGTERM. Worker services without an HTTP
// listener use this to drive graceful shutdown.
func WaitForSignal() os.Signal {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	return <-stop
}

// SignalContext returns a context cancelled on SIGINT/SIGTERM — the standalone
// wrapper equivalent of the WaitForSignal pattern.
func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

// ServeMetrics starts a background /health + /metrics server for a standalone
// worker. A bind failure is fatal (an unprobeable pod is never restarted).
func ServeMetrics(addr, service string, h http.Handler, logger *log.Logger) {
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", Health(service, nil))
		mux.Handle("/metrics", h)
		if err := http.ListenAndServe(addr, mux); err != nil {
			logger.Fatal("metrics server", "error", err)
		}
	}()
}
