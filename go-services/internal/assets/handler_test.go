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
	gotOpts          objectstore.GetOptions
	obj              *objectstore.Object
	err              error
}

func (f *fakeStore) Get(_ context.Context, key string, opts objectstore.GetOptions) (*objectstore.Object, error) {
	f.gotKey, f.gotRange, f.gotOpts = key, opts.Range, opts
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
	if got := w.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("Content-Encoding = %q, want empty for an unencoded object", got)
	}
}

func TestRelaysContentEncoding(t *testing.T) {
	fs := &fakeStore{obj: &objectstore.Object{
		Body: body("\x1f\x8bGZIP"), ContentType: "application/pdf",
		ContentEncoding: "gzip", Status: http.StatusOK,
	}}
	h := NewHandler(fs, log.New("assets", "error"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, newReq("GET", "/library/book.pdf", ""))

	if got := w.Header().Get("Content-Encoding"); got != "gzip" {
		t.Errorf("Content-Encoding = %q, want gzip", got)
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

func TestConditionalGetRelaysValidatorsAndReturns304(t *testing.T) {
	fs := &fakeStore{err: &objectstore.NotModifiedError{ETag: `"abc"`, LastModified: "Wed, 21 Oct 2026 07:28:00 GMT"}}
	h := NewHandler(fs, log.New("assets", "error"))
	r := newReq("GET", "/library/book.pdf", "")
	r.Header.Set("If-None-Match", `"abc"`)
	r.Header.Set("If-Modified-Since", "Wed, 21 Oct 2026 07:28:00 GMT")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if fs.gotOpts.IfNoneMatch != `"abc"` || fs.gotOpts.IfModifiedSince != "Wed, 21 Oct 2026 07:28:00 GMT" {
		t.Errorf("validators not relayed: %+v", fs.gotOpts)
	}
	if w.Code != http.StatusNotModified || w.Body.Len() != 0 {
		t.Errorf("status = %d, body %d bytes; want 304 with no body", w.Code, w.Body.Len())
	}
	if w.Header().Get("ETag") != `"abc"` || w.Header().Get("Last-Modified") != "Wed, 21 Oct 2026 07:28:00 GMT" ||
		w.Header().Get("Cache-Control") != cacheControl {
		t.Errorf("304 headers: %v", w.Header())
	}
}

// The 304 carries the UPSTREAM's validators, never the request's If-None-Match:
// "*" and a list must not come back as a bogus ETag, and an upstream that sent
// none yields no ETag at all.
func TestNotModifiedNeverEchoesRequestValidator(t *testing.T) {
	for name, tc := range map[string]struct {
		inm  string
		err  error
		etag string
	}{
		"star, upstream etag": {"*", &objectstore.NotModifiedError{ETag: `"v9"`}, `"v9"`},
		"list, upstream etag": {`"a", "b"`, &objectstore.NotModifiedError{ETag: `"b"`}, `"b"`},
		"star, no validators": {"*", &objectstore.NotModifiedError{}, ""},
		"bare sentinel":       {`"a"`, objectstore.ErrNotModified, ""},
	} {
		t.Run(name, func(t *testing.T) {
			h := NewHandler(&fakeStore{err: tc.err}, log.New("assets", "error"))
			r := newReq("GET", "/library/book.pdf", "")
			r.Header.Set("If-None-Match", tc.inm)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusNotModified {
				t.Fatalf("status = %d, want 304", w.Code)
			}
			if got := w.Header().Get("ETag"); got != tc.etag {
				t.Errorf("ETag = %q, want %q", got, tc.etag)
			}
		})
	}
}

func TestSetsContentLength(t *testing.T) {
	fs := &fakeStore{obj: &objectstore.Object{
		Body: body("PDFDATA"), ContentType: "application/pdf", ContentLength: 7, Status: http.StatusOK,
	}}
	h := NewHandler(fs, log.New("assets", "error"))
	for _, m := range []string{"GET", "HEAD"} {
		fs.obj.Body = body("PDFDATA")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, newReq(m, "/library/book.pdf", ""))
		if got := w.Header().Get("Content-Length"); got != "7" {
			t.Errorf("%s Content-Length = %q, want 7", m, got)
		}
	}
}
