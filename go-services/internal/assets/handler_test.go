// go-services/internal/assets/handler_test.go
package assets

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/objectstore"
)

type fakeStore struct {
	gotKey, gotRange string
	obj              *objectstore.Object
	err              error
}

func (f *fakeStore) Get(_ context.Context, key, rng string) (*objectstore.Object, error) {
	f.gotKey, f.gotRange = key, rng
	return f.obj, f.err
}

func body(s string) io.ReadCloser { return io.NopCloser(strings.NewReader(s)) }

func newReq(method, path, rng string) *http.Request {
	r := httptest.NewRequest(method, path, nil)
	if rng != "" {
		r.Header.Set("Range", rng)
	}
	return r
}

func TestServesObjectWithCacheHeaders(t *testing.T) {
	fs := &fakeStore{obj: &objectstore.Object{
		Body: body("PDFDATA"), ContentType: "application/pdf",
		ContentLength: 7, ETag: `"abc"`, Status: http.StatusOK,
	}}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/library/book.pdf", ""))

	if fs.gotKey != "library/book.pdf" {
		t.Errorf("key = %q, want library/book.pdf", fs.gotKey)
	}
	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if got := w.Header().Get("Cache-Control"); got != "public, max-age=86400, stale-while-revalidate=604800" {
		t.Errorf("Cache-Control = %q", got)
	}
	if w.Header().Get("Accept-Ranges") != "bytes" {
		t.Errorf("missing Accept-Ranges")
	}
	if w.Body.String() != "PDFDATA" {
		t.Errorf("body = %q", w.Body.String())
	}
}

func TestForwardsRangeAndReturns206(t *testing.T) {
	fs := &fakeStore{obj: &objectstore.Object{
		Body: body("DATA"), ContentType: "audio/mpeg",
		ContentRange: "bytes 0-3/100", Status: http.StatusPartialContent,
	}}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/music/song.mp3", "bytes=0-3"))

	if fs.gotRange != "bytes=0-3" {
		t.Errorf("range forwarded = %q, want bytes=0-3", fs.gotRange)
	}
	if w.Code != http.StatusPartialContent {
		t.Errorf("status = %d, want 206", w.Code)
	}
	if w.Header().Get("Content-Range") != "bytes 0-3/100" {
		t.Errorf("Content-Range = %q", w.Header().Get("Content-Range"))
	}
}

func TestRejectsUnknownPrefix(t *testing.T) {
	fs := &fakeStore{}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/secrets/passwd", ""))
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
	if fs.gotKey != "" {
		t.Errorf("store should not be called for bad prefix, got key %q", fs.gotKey)
	}
}

func TestRejectsTraversal(t *testing.T) {
	fs := &fakeStore{}
	h := NewHandler(fs, log.New("assets", "error"))
	for _, p := range []string{"/library/../secrets", "/library/%2e%2e/secrets"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, newReq("GET", p, ""))
		if w.Code != 404 {
			t.Errorf("path %q: status = %d, want 404", p, w.Code)
		}
	}
	if fs.gotKey != "" {
		t.Errorf("store should not be called on traversal, got key %q", fs.gotKey)
	}
}

func TestMissingKeyReturns404(t *testing.T) {
	fs := &fakeStore{err: objectstore.ErrNotFound}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/models/missing.glb", ""))
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestBadRangeReturns416(t *testing.T) {
	fs := &fakeStore{err: objectstore.ErrRangeNotSatisfiable}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/music/song.mp3", "bytes=999999-"))
	if w.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Errorf("status = %d, want 416", w.Code)
	}
}
