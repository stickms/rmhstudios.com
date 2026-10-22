package status

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// Per-request cost of the status service's read endpoints through the real
// handler stack (mux + gzip), against the rich fixture (90 days of rollups,
// 8 services, incidents). Run with:
//
//	go test ./internal/status -run '^$' -bench Endpoint -benchmem
func benchEndpoint(b *testing.B, path string, gzip bool) { benchEndpointTTL(b, path, gzip, 0) }

func benchEndpointTTL(b *testing.B, path string, gzip bool, ttl time.Duration) {
	svc := richService(b)
	svc.cfg.ResponseCacheTTL = ttl
	h := svc.Handler()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if gzip {
		req.Header.Set("Accept-Encoding", "gzip")
	}
	b.ReportAllocs()
	b.ResetTimer()
	var n int
	for i := 0; i < b.N; i++ {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		n = rec.Body.Len()
	}
	b.ReportMetric(float64(n), "bytes/resp")
}

func BenchmarkEndpointRoot(b *testing.B)      { benchEndpoint(b, "/", false) }
func BenchmarkEndpointRootGzip(b *testing.B)  { benchEndpoint(b, "/", true) }
func BenchmarkEndpointAPIStatus(b *testing.B) { benchEndpoint(b, "/api/status", false) }
func BenchmarkEndpointDashboard(b *testing.B) { benchEndpoint(b, "/api/dashboard", false) }
func BenchmarkEndpointSLO(b *testing.B)       { benchEndpoint(b, "/api/slo", false) }
func BenchmarkEndpointHistory(b *testing.B)   { benchEndpoint(b, "/history", false) }
func BenchmarkEndpointMetrics(b *testing.B)   { benchEndpoint(b, "/metrics", false) }
func BenchmarkEndpointHealth(b *testing.B)    { benchEndpoint(b, "/health", false) }

// Persistence cost: saveHistoryLocked runs after EVERY probe cycle (15 s) and
// saveExtendedLocked once a minute, both under the prober's write lock.
func benchSave(b *testing.B, ext bool) {
	svc := richService(b)
	p := svc.prober
	p.EnableHistoryPersistence(b.TempDir()+"/status-history.json", nil)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		p.mu.Lock()
		if ext {
			p.saveExtendedLocked()
		} else {
			p.saveHistoryLocked()
		}
		p.mu.Unlock()
	}
	path := p.historyPath
	if ext {
		path = p.extPath
	}
	if st, err := os.Stat(path); err == nil {
		b.ReportMetric(float64(st.Size()), "file-bytes")
	}
}

func BenchmarkSaveHistory(b *testing.B)  { benchSave(b, false) }
func BenchmarkSaveExtended(b *testing.B) { benchSave(b, true) }

// The same endpoints with the production cache TTL: a warm hit.
func BenchmarkCachedRoot(b *testing.B)     { benchEndpointTTL(b, "/", false, 2*time.Second) }
func BenchmarkCachedRootGzip(b *testing.B) { benchEndpointTTL(b, "/", true, 2*time.Second) }
func BenchmarkCachedDashboard(b *testing.B) {
	benchEndpointTTL(b, "/api/dashboard", false, 2*time.Second)
}
func BenchmarkCachedMetrics(b *testing.B) { benchEndpointTTL(b, "/metrics", false, 2*time.Second) }
