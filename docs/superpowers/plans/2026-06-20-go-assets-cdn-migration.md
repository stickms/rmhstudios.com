# Go `assets` Service — Static Media CDN Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the heavy static media prefixes (`/library`, `/music`, `/models`, `/sprites`) from the S3-compatible bucket through a new dedicated Go `assets` service with HTTP Range support, fronted by the gateway and edge-cached by Cloudflare; sync the bytes from the repo at deploy time so the runtime image stops shipping ~720 MB.

**Architecture:** A new `go-services/cmd/assets` binary streams objects from the bucket via a new range-aware `go-services/pkg/objectstore` client (the Go analog of the TS `lib/storage/s3.server.ts` seam). The gateway proxies the four prefixes to it like the WS services. A `mc mirror` deploy step uploads `public/{library,music,models,sprites}` to the bucket. Cutover is phased and reversible (re-point one prefix at a time; rollback = one line).

**Tech Stack:** Go 1.23 (built/tested via Docker — `go-services/Dockerfile`, `golang:1.23-alpine`), `aws-sdk-go-v2/s3`, the existing `pkg/{config,httpx,log}` helpers, Helm (`deploy/helm/rmhstudios-go`) + `deploy/deploy-go.sh`, MinIO (→ R2), `mc`/`rclone`.

## Global Constraints

- Go module is `github.com/rmhstudios/rmh-go`; services live under `go-services/cmd/<svc>` + `go-services/internal/<svc>`; shared code under `go-services/pkg/<pkg>`. Follow the `cmd/recap` + `internal/recap` shape.
- Config is read via `pkg/config` (`config.GetString(key, fallback)`, `config.GetInt`); servers use `pkg/httpx` (`httpx.NewServer(addr, handler, logger).Run(grace)`, `httpx.Health(service, ready)`); logging via `pkg/log` (`log.New(service, level)`).
- The four prefixes and their bucket key roots are: `/library/`→`library/`, `/music/`→`music/`, `/models/`→`models/`, `/sprites/`→`sprites/`, in the **same bucket** as user uploads (`S3_BUCKET`), namespaced apart from `rmharks/`.
- S3 config env (already defined for the feed feature): `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (path-style when `!= "false"`).
- Cache headers must match Apache today: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` and `Accept-Ranges: bytes`; pass through `ETag`/`Last-Modified`.
- New service port: `ASSETS_PORT` default `7007`. Gateway upstream env: `ASSETS_UPSTREAM` default `http://assets:7007`.
- **Build/test runs on Docker, not Bazel** (the project is staying on the Docker path for now). There is no local Go toolchain — compile and test through a Go container. Canonical command (the `rmhgo-modcache` volume keeps re-runs fast):
  `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./<pkg>/...`
- Images are built by `go-services/Dockerfile` (generic over `SERVICE` → compiles `./cmd/$SERVICE`) and deployed by `deploy/deploy-go.sh`; a new service is registered by adding it to that script's `SERVICES` array. Do **not** add or maintain Bazel `BUILD.bazel`/`go_service_image` entries or run `gazelle` — if the project returns to Bazel later, `make gazelle` regenerates them in one pass.
- Adding a Go dependency: edit `go-services/go.mod`'s `require` block, then run `go mod tidy` in the container:
  `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go mod tidy`.

---

### Task 1: `pkg/objectstore` — range-aware S3 client

**Files:**
- Modify: `go-services/go.mod` (add `aws-sdk-go-v2` deps)
- Create: `go-services/pkg/objectstore/objectstore.go`
- Test: `go-services/pkg/objectstore/objectstore_test.go`

**Interfaces:**
- Produces:
  - `type Object struct { Body io.ReadCloser; ContentType string; ContentLength int64; ContentRange string; ETag string; LastModified string; Status int }`
  - `var ErrNotFound = errors.New("objectstore: not found")`
  - `var ErrRangeNotSatisfiable = errors.New("objectstore: range not satisfiable")`
  - `type S3 struct { ... }` with `func New(ctx context.Context) (*S3, error)` (reads `S3_*` env) and `func (s *S3) Get(ctx context.Context, key, rangeHeader string) (*Object, error)`.
  - An interface consumers can mock: callers depend on `Get(ctx, key, rangeHeader string) (*Object, error)`.

- [ ] **Step 1: Add the AWS SDK dependency**

Edit `go-services/go.mod` to add to the `require` block:
```
	github.com/aws/aws-sdk-go-v2 v1.30.3
	github.com/aws/aws-sdk-go-v2/config v1.27.27
	github.com/aws/aws-sdk-go-v2/credentials v1.17.27
	github.com/aws/aws-sdk-go-v2/service/s3 v1.58.2
```
Then resolve modules in a Go container:
```bash
cd "$(git rev-parse --show-toplevel)"
docker run --rm -v "$PWD/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go mod tidy
```
Expected: `go-services/go.sum` gains the aws-sdk-go-v2 modules.

- [ ] **Step 2: Write the failing test**

```go
// go-services/pkg/objectstore/objectstore_test.go
package objectstore

import (
	"errors"
	"testing"
)

func TestParseConfigDefaults(t *testing.T) {
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_REGION", "us-east-1")
	t.Setenv("S3_ACCESS_KEY_ID", "k")
	t.Setenv("S3_SECRET_ACCESS_KEY", "s")
	t.Setenv("S3_BUCKET", "rmh-media")
	t.Setenv("S3_FORCE_PATH_STYLE", "true")

	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if cfg.bucket != "rmh-media" {
		t.Errorf("bucket = %q, want rmh-media", cfg.bucket)
	}
	if !cfg.forcePathStyle {
		t.Errorf("forcePathStyle = false, want true")
	}
}

func TestLoadConfigMissingBucket(t *testing.T) {
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_BUCKET", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected error for missing S3_BUCKET")
	}
}

func TestSentinelsDistinct(t *testing.T) {
	if errors.Is(ErrNotFound, ErrRangeNotSatisfiable) {
		t.Fatal("sentinels must be distinct")
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./pkg/objectstore/...`
Expected: FAIL (compile error) — `loadConfig`, `ErrNotFound`, `ErrRangeNotSatisfiable` undefined.

- [ ] **Step 4: Write the implementation**

```go
// go-services/pkg/objectstore/objectstore.go
//
// objectstore is the Go analog of the TS lib/storage/s3.server.ts seam: a thin,
// range-aware reader over an S3-compatible bucket (MinIO now, R2 later). It is
// the ONLY place in go-services that imports the AWS SDK.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ErrNotFound is returned by Get when the key does not exist.
var ErrNotFound = errors.New("objectstore: not found")

// ErrRangeNotSatisfiable is returned when the requested Range cannot be served.
var ErrRangeNotSatisfiable = errors.New("objectstore: range not satisfiable")

// Object is a streamable object plus the metadata needed to relay it to a client.
type Object struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	ContentRange  string // set on a 206 partial response
	ETag          string
	LastModified  string
	Status        int // 200 or 206
}

type config struct {
	endpoint, region, accessKey, secretKey, bucket string
	forcePathStyle                                 bool
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() (config, error) {
	c := config{
		endpoint:       os.Getenv("S3_ENDPOINT"),
		region:         envOr("S3_REGION", "us-east-1"),
		accessKey:      os.Getenv("S3_ACCESS_KEY_ID"),
		secretKey:      os.Getenv("S3_SECRET_ACCESS_KEY"),
		bucket:         os.Getenv("S3_BUCKET"),
		forcePathStyle: os.Getenv("S3_FORCE_PATH_STYLE") != "false",
	}
	if c.bucket == "" {
		return config{}, errors.New("objectstore: S3_BUCKET is required")
	}
	if c.endpoint == "" {
		return config{}, errors.New("objectstore: S3_ENDPOINT is required")
	}
	return c, nil
}

// S3 reads objects from an S3-compatible bucket.
type S3 struct {
	client *s3.Client
	bucket string
}

// New builds an S3 reader from the S3_* environment.
func New(ctx context.Context) (*S3, error) {
	c, err := loadConfig()
	if err != nil {
		return nil, err
	}
	awsConf, err := awscfg.LoadDefaultConfig(ctx,
		awscfg.WithRegion(c.region),
		awscfg.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(c.accessKey, c.secretKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("objectstore: aws config: %w", err)
	}
	client := s3.NewFromConfig(awsConf, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(c.endpoint)
		o.UsePathStyle = c.forcePathStyle
	})
	return &S3{client: client, bucket: c.bucket}, nil
}

// Get streams the object at key. If rangeHeader is non-empty it is forwarded to
// S3 and a 206 partial may be returned. Missing keys yield ErrNotFound; an
// unsatisfiable range yields ErrRangeNotSatisfiable.
func (s *S3) Get(ctx context.Context, key, rangeHeader string) (*Object, error) {
	in := &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}
	if rangeHeader != "" {
		in.Range = aws.String(rangeHeader)
	}
	out, err := s.client.GetObject(ctx, in)
	if err != nil {
		var nsk *types.NoSuchKey
		if errors.As(err, &nsk) {
			return nil, ErrNotFound
		}
		var apiErr interface{ ErrorCode() string }
		if errors.As(err, &apiErr) {
			switch apiErr.ErrorCode() {
			case "NoSuchKey", "NotFound":
				return nil, ErrNotFound
			case "InvalidRange":
				return nil, ErrRangeNotSatisfiable
			}
		}
		return nil, fmt.Errorf("objectstore: get %q: %w", key, err)
	}
	obj := &Object{
		Body:   out.Body,
		Status: http.StatusOK,
	}
	if out.ContentType != nil {
		obj.ContentType = *out.ContentType
	}
	if out.ContentLength != nil {
		obj.ContentLength = *out.ContentLength
	}
	if out.ETag != nil {
		obj.ETag = *out.ETag
	}
	if out.LastModified != nil {
		obj.LastModified = out.LastModified.UTC().Format(http.TimeFormat)
	}
	if out.ContentRange != nil {
		obj.ContentRange = *out.ContentRange
		obj.Status = http.StatusPartialContent
	}
	return obj, nil
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./pkg/objectstore/...`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add go-services/go.mod go-services/go.sum go-services/pkg/objectstore
git commit -m "feat(go): objectstore — range-aware S3 reader for go-services"
```

---

### Task 2: `internal/assets` — the HTTP handler

**Files:**
- Create: `go-services/internal/assets/handler.go`
- Test: `go-services/internal/assets/handler_test.go`

**Interfaces:**
- Consumes: `objectstore.Object`, `objectstore.ErrNotFound`, `objectstore.ErrRangeNotSatisfiable` (Task 1).
- Produces:
  - `type Store interface { Get(ctx context.Context, key, rangeHeader string) (*objectstore.Object, error) }`
  - `func NewHandler(store Store, logger *log.Logger) http.Handler`
  - Allowed prefixes constant set: `library`, `music`, `models`, `sprites`.

- [ ] **Step 1: Write the failing test**

```go
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./internal/assets/...`
Expected: FAIL (compile error) — `NewHandler` / `Store` undefined.

- [ ] **Step 3: Write the implementation**

```go
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./internal/assets/...`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add go-services/internal/assets
git commit -m "feat(go): assets HTTP handler — bucket streaming with Range + cache headers"
```

---

### Task 3: `cmd/assets` entrypoint + Docker deploy registration

**Files:**
- Create: `go-services/cmd/assets/main.go`
- Modify: `deploy/deploy-go.sh`

**Interfaces:**
- Consumes: `objectstore.New` (Task 1), `assets.NewHandler` (Task 2), `pkg/{config,httpx,log}`.
- Produces: a `cmd/assets` binary (built by `go-services/Dockerfile` via `SERVICE=assets`) registered in the Docker deploy script.

- [ ] **Step 1: Write the entrypoint**

```go
// go-services/cmd/assets/main.go
//
// Command assets serves /library, /music, /models, /sprites by streaming objects
// from the S3-compatible bucket. It replaces the Apache-off-disk static CDN for
// those prefixes. Exposes /health and /metrics on ASSETS_PORT.
package main

import (
	"context"
	"net/http"
	"time"

	"github.com/rmhstudios/rmh-go/internal/assets"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/objectstore"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("assets")
	logger := log.New("assets", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	store, err := objectstore.New(ctx)
	if err != nil {
		logger.Fatal("objectstore", "error", err)
	}

	metrics := telemetry.New("assets")

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("assets", nil))
	mux.Handle("/metrics", metrics.Handler())
	// The four media prefixes route here; everything else 404s.
	mux.Handle("/library/", assets.NewHandler(store, logger))
	mux.Handle("/music/", assets.NewHandler(store, logger))
	mux.Handle("/models/", assets.NewHandler(store, logger))
	mux.Handle("/sprites/", assets.NewHandler(store, logger))

	addr := ":" + config.GetString("ASSETS_PORT", "7007")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
	cancel()
}
```

- [ ] **Step 2: Verify the binary builds (Docker)**

Run:
```bash
docker build -f go-services/Dockerfile --build-arg SERVICE=assets -t rmhstudios-go-assets:dev go-services
```
Expected: image builds successfully (the Dockerfile compiles `./cmd/assets` into a static binary).

- [ ] **Step 3: Register the service in the Docker deploy script**

In `deploy/deploy-go.sh`, add `assets` to the `SERVICES` array (around line 21):
```bash
SERVICES=(gateway gamehub rmhmusic rmhtube rmhbox recap doctrine-worker vibe-worker discord-bot assets)
```
The Dockerfile is generic over `SERVICE`, so no other build wiring is needed.

- [ ] **Step 4: Verify the deploy script references the service**

Run: `grep -n "assets" deploy/deploy-go.sh`
Expected: `assets` appears in the `SERVICES` array.

- [ ] **Step 5: Commit**

```bash
git add go-services/cmd/assets deploy/deploy-go.sh
git commit -m "feat(go): assets service entrypoint + docker deploy registration"
```

---

### Task 4: Gateway routing to the assets service

**Files:**
- Modify: `go-services/internal/gateway/proxy.go`
- Test: `go-services/internal/gateway/gateway_test.go`

**Interfaces:**
- Consumes: the gateway `Config`/`LoadConfig`/`NewRouter` (existing).
- Produces: gateway routes `/library/`, `/music/`, `/models/`, `/sprites/` → `cfg.AssetsUpstream`.

- [ ] **Step 1: Write the failing test**

Add to `go-services/internal/gateway/gateway_test.go` inside (or alongside) `TestPrefixRouterSelection`'s cases — add these cases to its table:
```go
		{path: "/library/book.pdf", wantPrefix: "/library/"},
		{path: "/music/song.mp3", wantPrefix: "/music/"},
		{path: "/models/x.glb", wantPrefix: "/models/"},
		{path: "/sprites/s.png", wantPrefix: "/sprites/"},
```
(If the test builds its `Config` literal, set `AssetsUpstream: "http://assets:7007"` there so `NewRouter` registers the prefixes.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./internal/gateway/...`
Expected: FAIL — those paths currently resolve to the web catch-all (and `AssetsUpstream` field doesn't exist).

- [ ] **Step 3: Implement the routing**

In `go-services/internal/gateway/proxy.go`:

Add a default const near the other `default*Upstream` consts:
```go
	defaultAssetsUpstream = "http://assets:7007"
```

Add the field to `Config`:
```go
type Config struct {
	WebUpstream      string
	GamehubUpstream  string
	RmhboxUpstream   string
	RmhtubeUpstream  string
	RmhmusicUpstream string
	AssetsUpstream   string
	StaticDir        string
}
```

Read it in `LoadConfig` (add the line):
```go
		AssetsUpstream:   config.GetString("ASSETS_UPSTREAM", defaultAssetsUpstream),
```

Add the four prefixes to the `routes` slice in `NewRouter` (after the WS entries):
```go
		{"/library/", cfg.AssetsUpstream},
		{"/music/", cfg.AssetsUpstream},
		{"/models/", cfg.AssetsUpstream},
		{"/sprites/", cfg.AssetsUpstream},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker run --rm -v "$(git rev-parse --show-toplevel)/go-services":/src -w /src -v rmhgo-modcache:/go/pkg/mod golang:1.23-alpine go test ./internal/gateway/...`
Expected: PASS (existing + 4 new cases).

- [ ] **Step 5: Commit**

```bash
git add go-services/internal/gateway/proxy.go go-services/internal/gateway/gateway_test.go
git commit -m "feat(gateway): route /library /music /models /sprites to assets service"
```

---

### Task 5: Deploy-time sync tooling

**Files:**
- Create: `scripts/assets-sync.sh`
- Modify: `Makefile` (add `assets-sync` target)

**Interfaces:**
- Produces: `make assets-sync` mirrors `public/{library,music,models,sprites}` → `s3://$S3_BUCKET/{…}` idempotently using `mc`.

- [ ] **Step 1: Write the sync script**

```bash
# scripts/assets-sync.sh
#!/usr/bin/env bash
# Mirror the heavy static media dirs into the S3-compatible bucket. Idempotent:
# `mc mirror` only uploads new/changed files. Reads the S3_* env (same contract
# as the app + the Go assets service). Run AFTER the frontend build so generated
# library covers are included.
set -euo pipefail

: "${S3_ENDPOINT:?S3_ENDPOINT required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"
: "${S3_BUCKET:?S3_BUCKET required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALIAS="rmh-sync"
DIRS=(library music models sprites)

mc alias set "$ALIAS" "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc mb --ignore-existing "$ALIAS/$S3_BUCKET" >/dev/null

for d in "${DIRS[@]}"; do
  src="$ROOT/public/$d"
  if [ ! -d "$src" ]; then
    echo "[assets-sync] skip $d (no $src)"
    continue
  fi
  echo "[assets-sync] mirroring public/$d -> $ALIAS/$S3_BUCKET/$d"
  mc mirror --overwrite --remove "$src" "$ALIAS/$S3_BUCKET/$d"
done
echo "[assets-sync] done"
```

Make it executable:
```bash
chmod +x scripts/assets-sync.sh
```

- [ ] **Step 2: Add the Makefile target**

In `Makefile`, add (near the other phony targets; keep the file's existing `.PHONY` style):
```make
assets-sync: ## Mirror public/{library,music,models,sprites} to the S3 bucket (reads S3_* env)
	./scripts/assets-sync.sh
```
If the Makefile has a `.PHONY:` line, add `assets-sync` to it.

- [ ] **Step 3: Verify the script parses and the target is wired**

Run:
```bash
bash -n scripts/assets-sync.sh && echo "syntax OK"
make -n assets-sync
```
Expected: `syntax OK`, and `make -n` prints `./scripts/assets-sync.sh`.

- [ ] **Step 4: Commit**

```bash
git add scripts/assets-sync.sh Makefile
git commit -m "feat(deploy): assets-sync — mirror static media to the bucket"
```

---

### Task 6: Helm wiring for the `assets` service

**Files:**
- Modify: `deploy/helm/rmhstudios-go/values.yaml`
- Modify: `deploy/helm/rmhstudios-go/templates/deployment.yaml`

**Interfaces:**
- Consumes: the chart's generic per-service `deployment.yaml`/`service.yaml` templating over `.Values.services`, and the gateway env block.
- Produces: an `assets` Deployment + Service on port 7007, and `ASSETS_PORT` + `ASSETS_UPSTREAM` env wiring.

- [ ] **Step 1: Add the service to `values.yaml`**

In `deploy/helm/rmhstudios-go/values.yaml`, under `services:`, add after the `recap:` block:
```yaml
  assets:
    port: 7007
    replicas: 2
    path: /library/
```

- [ ] **Step 2: Wire `ASSETS_PORT` and `ASSETS_UPSTREAM` in `deployment.yaml`**

In `deploy/helm/rmhstudios-go/templates/deployment.yaml`, in the per-service port `env` chain, add an `else if` branch for `assets` (place it before the `gateway` branch):
```yaml
            {{- else if eq $svc "assets" }}
            - name: ASSETS_PORT
              value: {{ $cfg.port | quote }}
```
Then, inside the `gateway` branch's upstream block (after the `rmhmusic` `with` block, before `WEB_UPSTREAM`), add:
```yaml
            {{- with $root.Values.services.assets }}
            - name: ASSETS_UPSTREAM
              value: "http://{{ $fn }}-assets:{{ .port }}"
            {{- end }}
```

- [ ] **Step 3: Render the chart and verify**

Run:
```bash
helm template deploy/helm/rmhstudios-go | grep -E "rmhstudios-go-assets|ASSETS_PORT|ASSETS_UPSTREAM"
```
Expected: shows the `assets` Deployment + Service, `ASSETS_PORT: "7007"` on the assets pod, and `ASSETS_UPSTREAM: http://rmhstudios-go-assets:7007` on the gateway pod.
(If `helm` is unavailable, run `python3 -c "import yaml,sys; list(yaml.safe_load_all(open('deploy/helm/rmhstudios-go/values.yaml')))" && echo "values OK"` and note that a real `helm template` must be run before deploy.)

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/rmhstudios-go/values.yaml deploy/helm/rmhstudios-go/templates/deployment.yaml
git commit -m "feat(deploy): helm wiring for the assets service (port 7007 + gateway upstream)"
```

---

### Task 7: Cutover runbook + build-context exclusion

**Files:**
- Modify: `docs/runbooks/go-backend-and-bazel.md` (add an "Assets / CDN cutover" section)
- Modify: `.dockerignore` (ensure the four dirs are excluded from the image once migrated)

**Interfaces:**
- Consumes: everything above (service, sync, routing, helm).
- Produces: the operator's phased, reversible cutover procedure and the image-slimming step.

- [ ] **Step 1: Confirm/extend `.dockerignore`**

Check current exclusions:
```bash
grep -nE "library|music|models|sprites" .dockerignore || echo "NOT EXCLUDED"
```
If any of `public/library`, `public/music`, `public/models`, `public/sprites` are not excluded, add them:
```
public/library
public/music
public/models
public/sprites
```
(Do this only as the final cutover step in practice — but record the lines now so the image stops shipping the 720 MB once serving is fully migrated. Note in the runbook that these lines are activated at Phase 4.)

- [ ] **Step 2: Add the cutover runbook section**

Append to `docs/runbooks/go-backend-and-bazel.md`:
```markdown
## Assets / CDN cutover (library, music, models, sprites)

The `assets` Go service streams these four prefixes from the bucket. The
front door (Apache today, or the gateway) re-points one prefix at a time;
rollback is a one-line revert. The migration is independent of the Node→Go
gateway cutover.

1. **Populate the bucket:** `make assets-sync` (after a frontend build, so
   generated library covers are included). Re-run on every deploy — it's
   idempotent (`mc mirror` uploads only changed/new files).
2. **Deploy the assets service:** it ships in the Go chart
   (`deploy/helm/rmhstudios-go`, service `assets`, port 7007) via
   `./deploy/deploy-go.sh production` (single-node) or
   `REGISTRY=… ./deploy/deploy-go.sh production` (multi-node).
3. **Smoke-test directly** (before routing public traffic):
   `curl -s -o /dev/null -w "%{http_code}\n" http://<assets-host>:7007/models/<known>.glb`
   and a Range request: `curl -s -D- -o /dev/null -H 'Range: bytes=0-1023' http://<assets-host>:7007/music/<known>.mp3` → expect `206` + `Content-Range`.
4. **Cut over the smallest prefix first (`/models`).**
   - Gateway front door: already routed (Task 4) once the gateway is the edge.
   - Apache front door: replace `Alias /models …` + `ProxyPass /models !` with
     `ProxyPass /models http://<assets-host>:7007/models` (+ `ProxyPassReverse`),
     then `apachectl configtest && systemctl reload apache2`.
   Verify behind Cloudflare; watch error rate, latency, and range behavior.
5. **Roll the rest** one at a time: `music` → `sprites` → `library`.
6. **Phase 4 — slim the image:** activate the `.dockerignore` exclusions for the
   four dirs, rebuild, and confirm the image is ~720 MB lighter.
7. **Rollback (any phase):** re-point the prefix back to the Apache `Alias` /
   disk (or remove the gateway prefix) and reload.
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/go-backend-and-bazel.md .dockerignore
git commit -m "docs(deploy): assets/CDN cutover runbook + image build-context exclusions"
```

---

## Self-Review

**Spec coverage:**
- `pkg/objectstore` range-aware S3 client → Task 1. ✓
- `internal/assets` handler (path→key, prefix validation, traversal, range, headers, errors) → Task 2. ✓
- `cmd/assets` entrypoint + Docker deploy registration → Task 3. ✓
- Gateway routes the four prefixes → Task 4. ✓
- Deploy-time `mc mirror` sync + `make assets-sync` → Task 5. ✓
- Helm `assets` Deployment/Service + `ASSETS_PORT`/`ASSETS_UPSTREAM` → Task 6. ✓
- Phased reversible cutover + `.dockerignore` image slimming → Task 7. ✓
- Cache policy (`max-age=86400, stale-while-revalidate=604800`, `Accept-Ranges`, ETag/Last-Modified passthrough) → Task 2 (`cacheControl` const + header sets). ✓
- Error handling (404/416/502) → Task 2. ✓
- Same bucket, distinct prefixes → Tasks 1–2 (key = path) + Task 5 (mirror to `<bucket>/<dir>`). ✓

**Acceptance criteria mapping:** (1) Task 2/3 + e2e; (2) Task 2 tests; (3) Task 4; (4) Task 5; (5) Task 7; (6) Tasks 1/2/4 tests. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The optional Cloudflare path-purge from the spec is intentionally not a task (marked optional in the spec); it can be a follow-up.

**Type consistency:** `Store.Get(ctx, key, rangeHeader) (*objectstore.Object, error)` is defined in Task 2 and satisfied by `*objectstore.S3.Get` from Task 1 (same signature). `objectstore.Object` fields used in Task 2's handler (`Body`, `ContentType`, `ETag`, `LastModified`, `ContentRange`, `Status`) all exist in Task 1's struct. `ErrNotFound`/`ErrRangeNotSatisfiable` defined in Task 1, consumed in Task 2. `AssetsUpstream`/`ASSETS_UPSTREAM`/`ASSETS_PORT`/port `7007` consistent across Tasks 3, 4, 6.

**Note on the build/test workflow:** the project is staying on Docker (not Bazel) for now, and there is no local Go toolchain — every red/green run executes `go test` inside a `golang:1.23-alpine` container (see Global Constraints; the `rmhgo-modcache` volume avoids re-downloading modules each run), and images build via `go-services/Dockerfile`. No `make gazelle`/`bazel` steps, and no `BUILD.bazel` files are created for the new packages. If the project returns to Bazel later, a one-shot `make gazelle` regenerates them.
