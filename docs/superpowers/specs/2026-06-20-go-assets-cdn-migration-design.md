# Go `assets` Service — Static Media CDN Migration to Object Storage — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**Scope:** Move the heavy static media directories (`/library`, `/music`, `/models`, `/sprites`, ~720 MB) off local disk into the S3-compatible bucket, and serve them through a new dedicated Go `assets` service that streams from the bucket with HTTP Range support. Cloudflare keeps caching the edge. Retire the Apache disk-serve for these prefixes via a phased, reversible cutover.

## Background & motivation

Today these four directories are served as a "self-hosted CDN": the Apache vhost (`deploy/apache/rmhstudios.com.conf`) aliases each to `public/<dir>` and serves them straight off the VPS disk (`ProxyPass /library !` etc.), with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` + `Accept-Ranges: bytes`, and Cloudflare caching at the edge. Sizes (from `docs/opti/plan.md`): `library` 483–488 MB, `sprites` 123 MB, `music` 95 MB, `models` 20 MB.

This couples the origin to a single VPS disk on a `ReadWriteOnce` local-path PVC — a single point of failure and a throughput ceiling for cache misses, and 720 MB of image/PVC bloat. `docs/opti/plan.md` already recommends (and defers) moving this media to object storage (S3/R2/Spaces) and serving via CDN. This design executes that, reusing the S3 seam introduced for feed image uploads.

**What this improves, precisely:** the Cloudflare edge cache already serves the majority of requests from the nearest POP regardless of origin, so cached-request latency is unchanged. The win is at the **origin behind the cache**: cache misses are absorbed by durable, horizontally-scalable object storage + a stateless Go service (N replicas) instead of one disk, and the path to multi-region origin opens up (local-path PVC cannot do this; object storage + stateless Go can). A future option — letting Cloudflare serve **directly from R2** with no origin compute — is noted but out of scope; this design keeps Go in the path for origin control (access rules, logging, future on-the-fly optimization).

## Architecture

A new **`assets` Go service** (`go-services/cmd/assets`) owns the four path-prefixes and streams objects from the bucket (MinIO now → R2 later, reusing the `S3_*` env contract). It supports **HTTP Range** by forwarding the client `Range` header to S3 `GetObject` and relaying the partial (206) response — essential for audio seeking and large PDFs. It sets the same cache semantics Apache uses today.

The **gateway** proxies `/library`, `/music`, `/models`, `/sprites` to the `assets` service (exactly like the WS services), so the client-facing URLs are unchanged. **Cloudflare** keeps caching the edge via the existing "Cache Everything" rules.

The **bytes leave the runtime image**: a deploy-time sync mirrors `public/{library,music,models,sprites}` → bucket; the repo stays the authoring source; `.dockerignore` excludes these dirs from the build context.

The `assets` service depends only on the object-store seam and is otherwise stateless — independently testable (give it a bucket, request key+range, assert bytes/headers) and independently scalable.

## Components

1. **`go-services/pkg/objectstore`** — a small range-aware S3 client (`aws-sdk-go-v2/s3`), the Go analog of the TS `lib/storage/s3.server.ts` seam. Method: `Get(ctx, key, rangeHeader) → (body io.ReadCloser, meta{contentType, contentLength, contentRange, etag, lastModified, status}, err)`. The S3 API is wrapped behind an interface so the handler can be unit-tested with a mock. Reads `S3_*` via `pkg/config`. Adds `aws-sdk-go-v2` to `go-services/go.mod`; `make gazelle` regenerates BUILD files and `MODULE.bazel`'s `go_deps.from_file` picks it up.

2. **`go-services/internal/assets/handler.go`** — the HTTP handler. Maps request path → bucket key (the path *is* the key: `/library/x.pdf` → `library/x.pdf`); validates the top segment ∈ {`library`, `music`, `models`, `sprites`}; rejects `..`/encoded traversal after `path.Clean`; forwards `Range`; relays 200/206 with `Content-Range`/`Accept-Ranges`; sets `Content-Type` (by key extension, fallback to S3 metadata) and the Apache-matching `Cache-Control`; passes through `ETag`/`Last-Modified`; 404 on miss; 416 on unsatisfiable range. Streams the body with `io.Copy` (never buffers whole objects) and honors client disconnect via request context.

3. **`go-services/cmd/assets/main.go`** — entrypoint mirroring `cmd/recap/main.go` + `pkg/httpx`; loads config, builds the objectstore client + handler, serves on `ASSETS_PORT` (default 7007).

4. **`go-services/internal/assets/handler_test.go`** — unit tests against a mock objectstore (following `internal/recap/recap_test.go`).

5. **Gateway wiring** (`go-services/internal/gateway/proxy.go`) — add the four prefixes → `ASSETS_UPSTREAM` (default `http://assets:7007`) in the routing table, alongside the WS prefixes; streaming/range pass through the existing `httputil.ReverseProxy`.

6. **Sync tooling** — `scripts/assets-sync.sh` (`mc mirror` / `rclone sync` of `public/{library,music,models,sprites}` → `s3://$BUCKET/{…}`), idempotent (only changed/new files upload), plus a `make assets-sync` target. Runs after the build (so generated library covers are included).

7. **Deploy/config** — new `assets` Deployment + Service in `deploy/helm/rmhstudios-go`; an `assets` service in `docker-compose.go.yml`; a `go_service_image` entry in `go-services/images/BUILD.bazel`; gateway env `ASSETS_UPSTREAM`. Reuses `S3_*`/`S3_BUCKET`, with static assets under top-level prefixes (`library/`, `music/`, `models/`, `sprites/`) in the **same bucket**, namespaced apart from user-uploads (`rmharks/`).

## Data flow

**Read:** client → Cloudflare edge (HIT → served from POP, no origin) → on MISS, the front door (gateway, or Apache during transition) routes `/library/*` etc. → `assets` service → key `library/…` → `objectstore.Get` (forwarding any `Range`) → streams 200/206 with cache + range headers → Cloudflare caches per the rule.

**Write/sync (deploy-time):** `make assets-sync` runs `mc mirror public/{…} → bucket` after the build; idempotent.

## Caching & invalidation

Keep Apache's current policy verbatim: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`, `Accept-Ranges: bytes`, and pass through `ETag`/`Last-Modified` for conditional revalidation. Two asset classes:

- **Content-hashed build assets** — effectively immutable; safe to cache hard.
- **Stable-path media** (PDFs, mp3s, models) — a regenerated file keeps its path, so the edge may serve stale until TTL. Mitigated by the same stale-while-revalidate window in use today, with an **optional** deploy step that purges Cloudflare for only the paths the mirror changed (Cloudflare API). Not required for correctness.

## Cutover / rollout (phased, reversible)

The migration is independent of the Go gateway cutover — the prefix re-point is a one-line change in **either** Apache (`ProxyPass /<dir> http://<assets-host>:7007/<dir>`) **or** the gateway routing table.

- **Phase 1** — stand up the `assets` service + `objectstore` + sync; backfill the bucket; keep Apache serving from disk (zero client-visible change); smoke-test the service directly.
- **Phase 2** — flip routing for the **smallest prefix first (`/models`, 20 MB)** to the assets service; verify in prod behind Cloudflare; watch errors/latency/range behavior.
- **Phase 3** — roll the rest one at a time: `music` → `sprites` → `library`.
- **Phase 4** — remove the Apache `Alias`/disk-serve for migrated prefixes; confirm `.dockerignore` drops the 720 MB from the image.
- **Rollback** at any phase: re-point the prefix back to disk.

## Error handling

- Missing object → **404** (`NoSuchKey`).
- Unsatisfiable range → **416** with `Content-Range: bytes */<size>`.
- S3 error/timeout → **502/503**, logged, no internals leaked, bounded by request context/timeout.
- Invalid prefix or path traversal → **404** (clean + validate before building the key).
- Stream the body with `io.Copy`; never buffer whole objects; honor client disconnect via request context.

## Testing

- **`internal/assets` unit** (mock objectstore, per `recap_test.go`): prefix allow/deny, traversal reject (raw + encoded), key mapping, content-type by extension, full GET (200 + headers), range GET (206 + Content-Range + partial body), 404 on miss, 416 on bad range.
- **`pkg/objectstore` unit**: `Range` is forwarded to `GetObjectInput.Range`; 206/ContentRange mapped; `NoSuchKey` → typed not-found. S3 API mocked via interface (offline/deterministic).
- **Gateway routing**: extend the existing `pick()` test — the four prefixes resolve to `ASSETS_UPSTREAM`.
- **Sync script**: idempotency/dry-run check + count assertion (files under `public/library` == objects under `library/`).
- **e2e (gated on MinIO)**: via `go-services/scripts/e2e/run.sh` — put a fixture, request it incl. a `Range`, assert bytes + headers. Plus manual `curl` (full + range) through the deployed stack.

## Acceptance criteria

1. The `assets` service streams any object under the four prefixes from the bucket with correct content-type + cache headers; Range requests return **206** + `Content-Range`.
2. Traversal/invalid-prefix/missing requests → **404**; unsatisfiable range → **416**.
3. The gateway routes the four prefixes to the assets service; works behind Cloudflare.
4. `make assets-sync` mirrors `public/{…}` → bucket idempotently.
5. After cutover, the migrated prefixes serve from the bucket and the runtime image no longer ships the 720 MB; rollback is a one-line re-point.
6. Unit tests for the handler, `objectstore`, and gateway routing pass.

## Out of scope

- Migrating user-upload media (already on the bucket under `rmharks/` via the feed feature).
- Cloudflare-direct-from-R2 (no-origin) serving — a future optimization.
- Removing the asset directories from git history (the repo stays the authoring source; only the runtime image stops shipping them).
- The broader Node→Go front-door cutover (this works under either front door).
