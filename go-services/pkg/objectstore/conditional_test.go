package objectstore

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Against a fake S3 endpoint: the validators reach the wire as If-None-Match /
// If-Modified-Since and a 304 surfaces as ErrNotModified (no body), while an
// unconditional Get is unchanged.
func TestGetConditionalAgainstFakeS3(t *testing.T) {
	var gotINM, gotIMS, gotRange string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotINM, gotIMS, gotRange = r.Header.Get("If-None-Match"), r.Header.Get("If-Modified-Since"), r.Header.Get("Range")
		if gotINM == `"v1"` {
			w.Header().Set("ETag", `"v1"`)
			w.Header().Set("Last-Modified", "Wed, 21 Oct 2026 07:00:00 GMT")
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("DATA"))
	}))
	defer srv.Close()
	t.Setenv("S3_ENDPOINT", srv.URL)
	t.Setenv("S3_BUCKET", "b")
	t.Setenv("S3_ACCESS_KEY_ID", "k")
	t.Setenv("S3_SECRET_ACCESS_KEY", "s")
	s, err := New(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	_, err = s.Get(context.Background(), "music/a.mp3", GetOptions{IfNoneMatch: `"v1"`, IfModifiedSince: "Wed, 21 Oct 2026 07:28:00 GMT"})
	if !errors.Is(err, ErrNotModified) {
		t.Fatalf("err = %v, want ErrNotModified", err)
	}
	var nm *NotModifiedError
	if !errors.As(err, &nm) || nm.ETag != `"v1"` || nm.LastModified != "Wed, 21 Oct 2026 07:00:00 GMT" {
		t.Errorf("304 validators not carried: %+v", nm)
	}
	if gotINM != `"v1"` || gotIMS != "Wed, 21 Oct 2026 07:28:00 GMT" {
		t.Errorf("validators on the wire: INM=%q IMS=%q", gotINM, gotIMS)
	}

	obj, err := s.Get(context.Background(), "music/a.mp3", GetOptions{Range: "bytes=0-3"})
	if err != nil || obj.ETag != `"v1"` || gotRange != "bytes=0-3" {
		t.Fatalf("plain get: %v %+v range=%q", err, obj, gotRange)
	}
	_ = obj.Body.Close()
}
