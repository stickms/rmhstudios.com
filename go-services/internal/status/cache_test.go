package status

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func cachedService(t *testing.T) (*Service, http.Handler) {
	t.Helper()
	svc := richService(t)
	svc.cfg.ResponseCacheTTL = time.Hour // expiry is not under test; version is
	return svc, svc.Handler()
}

func doGet(h http.Handler, path string, hdr ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestResponseCacheReusesBodyAndHeaders(t *testing.T) {
	_, h := cachedService(t)
	a := doGet(h, "/api/dashboard")
	b := doGet(h, "/api/dashboard")
	if a.Code != 200 || a.Body.String() != b.Body.String() {
		t.Fatalf("hit differs from miss (code %d)", a.Code)
	}
	for _, k := range []string{"Content-Type", "Cache-Control", "Access-Control-Allow-Origin"} {
		if a.Header().Get(k) != b.Header().Get(k) || a.Header().Get(k) == "" {
			t.Errorf("header %s: %q vs %q", k, a.Header().Get(k), b.Header().Get(k))
		}
	}
}

func TestResponseCacheRunsHandlerOncePerKey(t *testing.T) {
	svc, _ := cachedService(t)
	n := 0
	h := withResponseCache(svc, time.Hour, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		_, _ = w.Write([]byte("x"))
	}))
	for i := 0; i < 5; i++ {
		doGet(h, "/api/uptime")
	}
	if n != 1 {
		t.Fatalf("inner handler ran %d times for 5 identical GETs, want 1", n)
	}
}

func TestResponseCacheExpires(t *testing.T) {
	svc, _ := cachedService(t)
	n := 0
	c := newResponseCache(svc, time.Second)
	clock := time.Now()
	c.now = func() time.Time { return clock }
	h := c.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { n++; _, _ = w.Write([]byte("x")) }))
	doGet(h, "/api/uptime")
	clock = clock.Add(500 * time.Millisecond)
	doGet(h, "/api/uptime")
	clock = clock.Add(600 * time.Millisecond)
	doGet(h, "/api/uptime")
	if n != 2 {
		t.Fatalf("inner handler ran %d times, want 2 (miss, hit, expired miss)", n)
	}
}

func TestResponseCacheInvalidatedByProbeCycle(t *testing.T) {
	svc, h := cachedService(t)
	a := doGet(h, "/api/services")
	svc.prober.ProbeOnce(context.Background())
	b := doGet(h, "/api/services")
	if a.Body.String() == b.Body.String() {
		t.Fatal("response served across a probe cycle")
	}
}

func TestResponseCacheInvalidatedByStoreWrite(t *testing.T) {
	svc, h := cachedService(t)
	before := doGet(h, "/api/incidents")
	title := "Cache invalidation canary"
	imp, st := ImpactMinor, StateInvestigating
	if _, err := svc.store.CreateIncident(IncidentInput{Title: &title, Impact: &imp, State: &st}, time.Now()); err != nil {
		t.Fatal(err)
	}
	after := doGet(h, "/api/incidents")
	if strings.Contains(before.Body.String(), title) || !strings.Contains(after.Body.String(), title) {
		t.Fatal("new incident not visible immediately after the write")
	}
}

func TestResponseCacheKeysOnQueryAndEncoding(t *testing.T) {
	_, h := cachedService(t)
	if doGet(h, "/api/history?range=daily").Body.String() == doGet(h, "/api/history").Body.String() {
		t.Fatal("query string ignored in cache key")
	}
	plain := doGet(h, "/")
	gz := doGet(h, "/", "Accept-Encoding", "gzip")
	if plain.Header().Get("Content-Encoding") != "" || gz.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("encodings mixed: %q / %q", plain.Header().Get("Content-Encoding"), gz.Header().Get("Content-Encoding"))
	}
	if again := doGet(h, "/", "Accept-Encoding", "gzip"); again.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("gzip hit lost its encoding header")
	}
}

func TestResponseCacheSkipsAdminHealthAndWrites(t *testing.T) {
	for _, p := range []string{"/health", "/api/admin/announcements"} {
		if cacheable(httptest.NewRequest(http.MethodGet, p, nil)) {
			t.Errorf("%s must not be cached", p)
		}
	}
	if cacheable(httptest.NewRequest(http.MethodPost, "/api/incidents", nil)) {
		t.Error("non-GET cached")
	}
}

func TestResponseCacheKeySpaceIsBounded(t *testing.T) {
	svc, _ := cachedService(t)
	c := newResponseCache(svc, time.Hour)
	h := c.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("x")) }))
	for i := 0; i < maxCachedResponses*3; i++ {
		doGet(h, fmt.Sprintf("/api/uptime?x=%d", i))
	}
	if len(c.entries) > maxCachedResponses {
		t.Fatalf("cache grew to %d entries, cap %d", len(c.entries), maxCachedResponses)
	}
}

// A handler panic (net/http recovers it) must not leave the key flying forever:
// a later request for the same key has to complete, and so must one that was
// already waiting on the panicking leader.
func TestResponseCachePanicDoesNotWedgeKey(t *testing.T) {
	svc, _ := cachedService(t)
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	parked := make(chan struct{}, 1)
	rc := newResponseCache(svc, time.Hour)
	rc.onWait = func() { parked <- struct{}{} }
	h := rc.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
			panic("boom")
		}
		_, _ = w.Write([]byte("fine"))
	}))

	leaderDone := make(chan any, 1)
	go func() {
		defer func() { leaderDone <- recover() }()
		doGet(h, "/api/uptime")
	}()
	<-started
	waiter := make(chan *httptest.ResponseRecorder, 1)
	go func() { waiter <- doGet(h, "/api/uptime") }()
	<-parked // the waiter is about to block on the leader's flight (no sleep)
	close(release)

	if r := <-leaderDone; r == nil {
		t.Fatal("leader panic must propagate so net/http logs it")
	}
	select {
	case rec := <-waiter:
		if rec.Body.String() != "fine" {
			t.Fatalf("waiter body %q, want it to serve itself", rec.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("waiter still blocked after leader panicked")
	}
	done := make(chan struct{})
	go func() { doGet(h, "/api/uptime"); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("later request for the key blocked")
	}
}

func TestResponseCacheWaiterHonoursContext(t *testing.T) {
	svc, _ := cachedService(t)
	started := make(chan struct{})
	release := make(chan struct{})
	h := withResponseCache(svc, time.Hour, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-started:
		default:
			close(started)
			<-release
		}
		_, _ = w.Write([]byte("x"))
	}))
	go doGet(h, "/api/uptime")
	<-started
	defer close(release)

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/uptime", nil).WithContext(ctx)
	done := make(chan struct{})
	go func() { h.ServeHTTP(httptest.NewRecorder(), req); close(done) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled waiter did not return")
	}
}
