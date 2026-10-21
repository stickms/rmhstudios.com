package status

import (
	"compress/gzip"
	"net/http"
	"strings"
	"sync"
)

// The dashboard is large and extremely repetitive — a few thousand uptime-bar
// spans that differ by one attribute — and the live view re-fetches it every
// 30 seconds. Gzip takes it down by roughly an order of magnitude. Compressing
// here rather than trusting the edge to do it keeps that true on every path
// to the page, including the loopback one the healthcheck and operators use;
// an upstream proxy leaves an already-encoded response alone.

var gzipPool = sync.Pool{New: func() any { w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed); return w }}

type gzipWriter struct {
	http.ResponseWriter
	gz          *gzip.Writer
	wroteHeader bool
	skip        bool
}

func (g *gzipWriter) WriteHeader(code int) {
	if g.wroteHeader {
		return
	}
	g.wroteHeader = true
	h := g.Header()
	// Leave already-compact or already-encoded responses (and bodiless ones)
	// as they are.
	if h.Get("Content-Encoding") != "" || code == http.StatusNoContent || code == http.StatusNotModified {
		g.skip = true
	} else {
		h.Del("Content-Length")
		h.Set("Content-Encoding", "gzip")
	}
	h.Add("Vary", "Accept-Encoding")
	g.ResponseWriter.WriteHeader(code)
}

func (g *gzipWriter) Write(b []byte) (int, error) {
	if !g.wroteHeader {
		if g.Header().Get("Content-Type") == "" {
			g.Header().Set("Content-Type", http.DetectContentType(b))
		}
		g.WriteHeader(http.StatusOK)
	}
	if g.skip {
		return g.ResponseWriter.Write(b)
	}
	return g.gz.Write(b)
}

// withGzip compresses responses for clients that accept gzip.
func withGzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") || r.Method == http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		gz := gzipPool.Get().(*gzip.Writer)
		gz.Reset(w)
		gw := &gzipWriter{ResponseWriter: w, gz: gz}
		next.ServeHTTP(gw, r)
		if gw.wroteHeader && !gw.skip {
			_ = gz.Close()
		}
		gzipPool.Put(gz)
	})
}
