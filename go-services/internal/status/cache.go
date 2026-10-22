package status

import (
	"bytes"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Response cache for the read-only GET surface.
//
// Every public page and API here is a pure function of (URL, probe state,
// incident-store state, clock). The state only changes when a probe cycle ends
// (every 15 s) or an admin write lands, yet each request used to re-run
// BuildView and re-render, then re-compress: ~13-20 ms and ~9 MB of garbage
// for the dashboard alone, repeated for every open tab's 30-second refresh.
//
// Staleness, written down: a cached response is reused for at most
// `ttl` (default 2 s in cmd/status) and is NEVER reused across a probe cycle
// or an incident/maintenance/announcement write — both bump a version that is
// part of the validity check. The TTL only bounds fields derived from the wall
// clock (uptime seconds, "x minutes ago", a maintenance window opening), on a
// page whose underlying data moves every 15 s and which refreshes itself every
// 30 s. Key space is bounded (maxCachedResponses) so arbitrary query strings
// cannot grow memory; when full, new keys bypass the cache.

const (
	maxCachedResponses = 64
	maxCachedBodyBytes = 4 << 20
)

type cachedResponse struct {
	status  int
	header  http.Header
	body    []byte
	version uint64
	expires time.Time
}

type inflight struct {
	done chan struct{}
	resp *cachedResponse
}

type responseCache struct {
	svc *Service
	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	entries map[string]*cachedResponse
	flying  map[string]*inflight
	hits    atomic.Uint64
	misses  atomic.Uint64

	// onWait, when set (tests only), runs just before a request blocks on an
	// in-flight leader, so a test can synchronise on "the waiter is parked"
	// instead of sleeping.
	onWait func()
}

// stateVersion changes whenever the probe results or the incident store do.
func (s *Service) stateVersion() uint64 {
	return uint64(s.prober.Cycles())<<32 ^ s.store.Version()
}

// withResponseCache serves GETs from a short-lived cache. ttl <= 0 disables it.
func withResponseCache(s *Service, ttl time.Duration, next http.Handler) http.Handler {
	if ttl <= 0 {
		return next
	}
	return newResponseCache(s, ttl).wrap(next)
}

func newResponseCache(s *Service, ttl time.Duration) *responseCache {
	return &responseCache{svc: s, ttl: ttl, now: time.Now,
		entries: map[string]*cachedResponse{}, flying: map[string]*inflight{}}
}

func (c *responseCache) wrap(next http.Handler) http.Handler {
	s := c.svc
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !cacheable(r) {
			next.ServeHTTP(w, r)
			return
		}
		key := r.URL.RequestURI()
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			key = "gz|" + key
		}
		ver := s.stateVersion()
		now := c.now()

		c.mu.Lock()
		if e := c.entries[key]; e != nil && e.version == ver && now.Before(e.expires) {
			c.mu.Unlock()
			c.hits.Add(1)
			replay(w, e)
			return
		}
		if f := c.flying[key]; f != nil {
			c.mu.Unlock()
			if c.onWait != nil {
				c.onWait()
			}
			select {
			case <-f.done:
			case <-r.Context().Done():
				return
			}
			if f.resp != nil {
				c.hits.Add(1)
				replay(w, f.resp)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		f := &inflight{done: make(chan struct{})}
		c.flying[key] = f
		c.mu.Unlock()
		c.misses.Add(1)

		rec := &recorder{header: http.Header{}, status: http.StatusOK}
		// Leader cleanup is deferred so a handler panic (recovered by
		// net/http) still clears the flight and releases waiters; they see
		// resp == nil and serve themselves. The panic then propagates.
		finished := false
		defer func() {
			if finished {
				return
			}
			c.mu.Lock()
			delete(c.flying, key)
			c.mu.Unlock()
			close(f.done)
		}()
		next.ServeHTTP(rec, r)
		finished = true
		var resp *cachedResponse
		if rec.status == http.StatusOK && rec.body.Len() <= maxCachedBodyBytes {
			resp = &cachedResponse{status: rec.status, header: rec.header, body: rec.body.Bytes(),
				version: ver, expires: now.Add(c.ttl)}
		}

		c.mu.Lock()
		delete(c.flying, key)
		if resp != nil {
			c.store(key, resp, now)
		}
		c.mu.Unlock()
		f.resp = resp
		close(f.done)

		if resp != nil {
			replay(w, resp)
			return
		}
		copyHeader(w.Header(), rec.header)
		w.WriteHeader(rec.status)
		_, _ = w.Write(rec.body.Bytes())
	})
}

// store inserts under c.mu, dropping expired entries first; a full cache of
// live entries refuses the new key (it is served uncached next time too).
func (c *responseCache) store(key string, resp *cachedResponse, now time.Time) {
	if _, ok := c.entries[key]; !ok && len(c.entries) >= maxCachedResponses {
		for k, e := range c.entries {
			if !now.Before(e.expires) {
				delete(c.entries, k)
			}
		}
		if len(c.entries) >= maxCachedResponses {
			return
		}
	}
	c.entries[key] = resp
}

func cacheable(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	p := r.URL.Path
	// Admin reads carry a bearer token and must never be shared; /health
	// reports a live uptime and is the liveness probe.
	return p != "/health" && !strings.HasPrefix(p, "/api/admin")
}

func replay(w http.ResponseWriter, e *cachedResponse) {
	copyHeader(w.Header(), e.header)
	w.WriteHeader(e.status)
	_, _ = w.Write(e.body)
}

func copyHeader(dst, src http.Header) {
	for k, v := range src {
		dst[k] = append([]string(nil), v...)
	}
}

// recorder captures a handler's response.
type recorder struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (r *recorder) Header() http.Header         { return r.header }
func (r *recorder) WriteHeader(code int)        { r.status = code }
func (r *recorder) Write(b []byte) (int, error) { return r.body.Write(b) }
