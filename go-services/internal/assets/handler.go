// go-services/internal/assets/handler.go
//
// Package assets serves the heavy static media prefixes (/library, /music,
// /models, /sprites) by streaming objects from the bucket, replacing the
// Apache-off-disk "self-hosted CDN". Range requests are passed through for
// audio seeking and large PDFs.
package assets

import (
	"context"
	"errors"
	"io"
	"net/http"
	"path"
	"strings"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/objectstore"
)

// cacheControl mirrors the Apache vhost policy these assets are served with today.
const cacheControl = "public, max-age=86400, stale-while-revalidate=604800"

// allowedPrefixes is the set of top-level path segments this service owns.
var allowedPrefixes = map[string]struct{}{
	"library": {}, "music": {}, "models": {}, "sprites": {},
}

// Store is the read dependency (satisfied by *objectstore.S3).
type Store interface {
	Get(ctx context.Context, key, rangeHeader string) (*objectstore.Object, error)
}

type handler struct {
	store  Store
	logger *log.Logger
}

// NewHandler returns an http.Handler serving the four media prefixes from store.
func NewHandler(store Store, logger *log.Logger) http.Handler {
	return &handler{store: store, logger: logger}
}

// keyForPath validates the request path and maps it to a bucket key, or returns
// ok=false if the path is not an allowed, traversal-free media path.
func keyForPath(urlPath string) (key string, ok bool) {
	clean := path.Clean(urlPath)
	if !strings.HasPrefix(clean, "/") || strings.Contains(clean, "..") {
		return "", false
	}
	trimmed := strings.TrimPrefix(clean, "/")
	top := trimmed
	if i := strings.IndexByte(trimmed, '/'); i >= 0 {
		top = trimmed[:i]
	}
	if _, allowed := allowedPrefixes[top]; !allowed {
		return "", false
	}
	if trimmed == top { // bare "/library" with no object — not a media object
		return "", false
	}
	return trimmed, true
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	key, ok := keyForPath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	obj, err := h.store.Get(r.Context(), key, r.Header.Get("Range"))
	if err != nil {
		switch {
		case errors.Is(err, objectstore.ErrNotFound):
			http.NotFound(w, r)
		case errors.Is(err, objectstore.ErrRangeNotSatisfiable):
			http.Error(w, "range not satisfiable", http.StatusRequestedRangeNotSatisfiable)
		default:
			h.logger.Error("assets get", "key", key, "error", err)
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
		}
		return
	}
	defer obj.Body.Close()

	hdr := w.Header()
	if obj.ContentType != "" {
		hdr.Set("Content-Type", obj.ContentType)
	}
	// Library PDFs are stored gzip-compressed with Content-Encoding: gzip metadata;
	// relay it so the client inflates them. (S3 still honours Range on the stored
	// bytes, but the library's own /api/library/file route is the canonical,
	// range-free path for these objects.)
	if obj.ContentEncoding != "" {
		hdr.Set("Content-Encoding", obj.ContentEncoding)
	}
	hdr.Set("Cache-Control", cacheControl)
	hdr.Set("Accept-Ranges", "bytes")
	if obj.ETag != "" {
		hdr.Set("ETag", obj.ETag)
	}
	if obj.LastModified != "" {
		hdr.Set("Last-Modified", obj.LastModified)
	}
	if obj.ContentRange != "" {
		hdr.Set("Content-Range", obj.ContentRange)
	}
	w.WriteHeader(obj.Status)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, obj.Body); err != nil {
		h.logger.Warn("assets stream interrupted", "key", key, "error", err)
	}
}
