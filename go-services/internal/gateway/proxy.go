// Package gateway implements the edge/BFF service. It is the single ingress
// target the Helm chart (PR #121) routes to: it fronts the React SSR/Nitro app
// and reverse-proxies the WebSocket path prefixes to the Go realtime services.
//
// The router is a plain http.Handler that selects an upstream by longest-
// matching path prefix, falling back to the web (SSR) upstream for everything
// that no Go service owns. WebSocket upgrades are passed through transparently
// (see Router.ServeHTTP and newProxy for the trust-boundary and 101 handling).
package gateway

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sort"

	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Default upstream targets. These mirror the Compose/Helm service names and the
// PORT_* family the Node services already use, so the gateway is a drop-in edge.
const (
	defaultWebUpstream      = "http://web:3000"
	defaultGamehubUpstream  = "http://gamehub:7001"
	defaultRmhboxUpstream   = "http://rmhbox:7676"
	defaultRmhtubeUpstream  = "http://rmhtube:7003"
	defaultRmhmusicUpstream = "http://rmhmusic:7002"
)

// upstream is a single proxy target keyed by the path prefix it serves.
type upstream struct {
	prefix string // e.g. "/socket/"; "" is the catch-all web upstream
	target *url.URL
	proxy  *httputil.ReverseProxy
}

// Router is the gateway's HTTP handler. It owns the upstream registry plus the
// optional static-asset file server, and dispatches each request to the
// upstream whose prefix is the longest match for the request path.
type Router struct {
	logger    *log.Logger
	web       *upstream   // catch-all for SSR pages + any API Go doesn't own
	prefixed  []*upstream // sorted longest-prefix-first
	static    http.Handler
	staticDir string
}

// Config captures the gateway's proxy configuration, resolved from env.
type Config struct {
	WebUpstream      string
	GamehubUpstream  string
	RmhboxUpstream   string
	RmhtubeUpstream  string
	RmhmusicUpstream string
	StaticDir        string
}

// LoadConfig reads the gateway's upstreams and static dir from the environment,
// applying the documented defaults.
func LoadConfig() Config {
	return Config{
		WebUpstream:      config.GetString("WEB_UPSTREAM", defaultWebUpstream),
		GamehubUpstream:  config.GetString("GAMEHUB_UPSTREAM", defaultGamehubUpstream),
		RmhboxUpstream:   config.GetString("RMHBOX_UPSTREAM", defaultRmhboxUpstream),
		RmhtubeUpstream:  config.GetString("RMHTUBE_UPSTREAM", defaultRmhtubeUpstream),
		RmhmusicUpstream: config.GetString("RMHMUSIC_UPSTREAM", defaultRmhmusicUpstream),
		StaticDir:        config.GetString("STATIC_DIR", ""),
	}
}

// NewRouter builds the prefix router from the resolved config. It returns an
// error only if an upstream URL fails to parse.
func NewRouter(cfg Config, logger *log.Logger) (*Router, error) {
	web, err := newProxy(cfg.WebUpstream, logger)
	if err != nil {
		return nil, err
	}
	r := &Router{
		logger: logger,
		web:    &upstream{prefix: "", target: web.target, proxy: web.proxy},
	}

	// Path-prefix routes to the Go realtime services. The realtime hubs serve
	// these exact prefixes (e.g. hub.ServeWS on "/rmhbox-ws/"), so we proxy the
	// full path through unchanged — no prefix stripping.
	routes := []struct {
		prefix string
		target string
	}{
		{"/socket/", cfg.GamehubUpstream},
		{"/rmhbox-ws/", cfg.RmhboxUpstream},
		{"/rmhtube-ws/", cfg.RmhtubeUpstream},
		{"/rmhmusic-ws/", cfg.RmhmusicUpstream},
	}
	for _, rt := range routes {
		u, err := newProxy(rt.target, logger)
		if err != nil {
			return nil, err
		}
		u.prefix = rt.prefix
		r.prefixed = append(r.prefixed, u)
	}
	// Longest prefix first so selection is deterministic and "most specific wins".
	sort.Slice(r.prefixed, func(i, j int) bool {
		return len(r.prefixed[i].prefix) > len(r.prefixed[j].prefix)
	})

	// Optional static-asset serving: when STATIC_DIR points at an existing
	// directory we serve built React assets directly from the gateway before
	// falling through to the web upstream (the "Go serves built assets" option).
	if cfg.StaticDir != "" {
		if info, err := os.Stat(cfg.StaticDir); err == nil && info.IsDir() {
			r.static = http.FileServer(http.Dir(cfg.StaticDir))
			r.staticDir = cfg.StaticDir
			logger.Info("serving static assets", "dir", cfg.StaticDir)
		} else {
			logger.Warn("STATIC_DIR set but unusable; ignoring", "dir", cfg.StaticDir)
		}
	}

	return r, nil
}

// newProxy builds a single-host reverse proxy for target.
//
// We deliberately do NOT install a Director that strips the Connection/Upgrade
// hop-by-hop headers: Go 1.23's httputil.ReverseProxy detects a WebSocket
// upgrade request, switches into bidirectional-copy mode on a 101 Switching
// Protocols response, and manages the hop-by-hop headers itself. Leaving the
// default Director in place is exactly what makes WebSocket pass-through work.
func newProxy(target string, logger *log.Logger) (*upstream, error) {
	u, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	p := httputil.NewSingleHostReverseProxy(u)
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Error("upstream proxy error", "path", r.URL.Path, "target", u.String(), "error", err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
	}
	return &upstream{target: u, proxy: p}, nil
}

// pick returns the upstream for path: the longest matching Go prefix, or the
// web catch-all. It is the core of the routing decision and is unit-tested.
func (r *Router) pick(path string) *upstream {
	for _, u := range r.prefixed {
		if hasPrefix(path, u.prefix) {
			return u
		}
	}
	return r.web
}

// ServeHTTP routes the request: Go path-prefixes win first; then, if a static
// dir is configured and the requested asset exists on disk, it is served
// locally; otherwise the request falls through to the web (SSR) upstream.
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if u := r.pick(req.URL.Path); u != r.web {
		u.proxy.ServeHTTP(w, req)
		return
	}
	if r.static != nil && r.staticAssetExists(req.URL.Path) {
		r.static.ServeHTTP(w, req)
		return
	}
	r.web.proxy.ServeHTTP(w, req)
}

// staticAssetExists reports whether path maps to a regular file under the
// static dir. We only short-circuit to the file server for real files so that
// unknown routes (SSR pages, client-side routes) still reach the web upstream
// instead of 404ing from the file server.
func (r *Router) staticAssetExists(path string) bool {
	if r.staticDir == "" {
		return false
	}
	clean := http.Dir(r.staticDir)
	f, err := clean.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		return false
	}
	return true
}

// hasPrefix is strings.HasPrefix inlined to keep the hot path import-light.
func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
