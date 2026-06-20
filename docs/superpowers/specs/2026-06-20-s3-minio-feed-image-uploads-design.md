# S3 (MinIO) Object Storage + Feed Image Uploads — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**Scope:** Stand up S3-compatible object storage (MinIO), build a provider-agnostic storage layer, and ship image uploads on the RMHark feed on top of it. No migration of existing on-disk media in this slice.

## Background & motivation

Today the app has **no object storage**. All user-generated media is written to local disk under `db/` via Node `fs` and served back through app routes:

- Avatars → `db/avatars/`, served via `/api/profile/avatar/<file>` (`app/routes/api/profile/avatar.ts`)
- Songs/covers → `db/music/`, `db/music/covers/` (`app/routes/api/slice-it/songs/upload.ts`)
- Build images → `db/builds/` (`app/routes/api/admin/curated-builds/image.ts`)

Static build assets (`public/library`, `public/music`, `public/models`, `public/sprites`) are served straight off disk by a self-hosted Apache vhost (`deploy/apache/rmhstudios.com.conf`) and cached at the Cloudflare edge. Persistence is a single local-path PVC in k3s (`deploy/helm/rmhstudios/templates/pvc.yaml`), which is `ReadWriteOnce` / single-node — a known blocker for the multi-region scaling roadmap ([[infra-direction]]).

The immediate driver is a **new feature: image uploads on the RMHark feed**. Rather than add another local-disk write path, we introduce object storage now, behind a provider-agnostic seam, so this feature and all future media land on S3.

## Provider decision: MinIO now, R2-ready

- **Now: self-hosted MinIO** — S3-compatible, keeps media on our own infra, no new vendor, good for proving the path.
- **Later: Cloudflare R2** — Cloudflare is already our edge (TLS termination + CDN). R2 has zero egress and binds to a custom domain through Cloudflare.

Migration MinIO → R2 is intended to be **config-only**, guaranteed by three design choices:

1. **One SDK, one seam.** All provider interaction goes through a single storage module using `@aws-sdk/client-s3`. MinIO and R2 both speak the S3 API, so `PutObject`/`GetObject`/`DeleteObject` are identical. Swapping providers changes env vars, not code.
2. **App-proxied reads.** Posts store a stable internal URL (`/api/feed/image/<key>`), never a provider-specific URL. Swapping the backend changes only what that route fetches; every DB row and client stays valid.
3. **`forcePathStyle` from env.** MinIO uses path-style addressing; R2/AWS prefer virtual-hosted style. The SDK flag is read from env so addressing is pure config.

Data move later = an `rclone` one-shot copy (both S3-compatible) + an env flip.

**Caveat (acknowledged, not solved here):** a single MinIO node on one PVC has the same single-disk durability limit as today's local-path. MinIO unblocks the *code architecture*; the eventual R2 swap (or distributed MinIO) is what delivers multi-region durability — with zero app changes thanks to the seam.

## Components

### 1. Storage module — the single provider seam
`app/lib/storage/s3.server.ts`. One shared `S3Client` plus thin helpers:

- `putObject(key, buffer, contentType): Promise<void>`
- `getObjectStream(key): Promise<{ body, contentType, contentLength } | null>`
- `deleteObject(key): Promise<void>`
- `objectExists(key): Promise<boolean>`

All config comes from env. **This is the only file that knows the provider exists**; every other module is provider-blind. The client is instantiated once and reused.

### 2. Configuration / env
New environment variables:

| Var | Purpose | MinIO dev default |
|---|---|---|
| `S3_ENDPOINT` | Object-store endpoint URL | `http://minio:9000` |
| `S3_REGION` | Region (MinIO ignores, SDK requires) | `us-east-1` |
| `S3_ACCESS_KEY_ID` | Access key | (dev creds) |
| `S3_SECRET_ACCESS_KEY` | Secret key | (dev creds) |
| `S3_BUCKET` | Bucket name | `rmh-media` |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO, `false` for R2/AWS | `true` |

Added to `.env.example`, `docker-compose.yml`, and `deploy/k8s/secret.example.env` / the Helm secret, documented with MinIO defaults.

### 3. MinIO deployment
- **Local/dev:** a `minio` service in `docker-compose.yml` plus a one-shot init (e.g. `mc mb`) that creates the bucket on first run.
- **k3s:** a Helm template (Deployment + Service + PVC) mirroring the existing `pvc.yaml` pattern. Small footprint; single replica for now.

### 4. Feed image upload route
`app/routes/api/rmharks/image.ts` (POST). Mirrors `app/routes/api/profile/avatar.ts` exactly:

1. `auth.api.getSession` — 401 if unauthenticated.
2. `rateLimit` keyed by client IP (reuse `lib/rate-limit`).
3. Parse multipart form; accept up to **4 images per post**.
4. Per-image cap **5 MB**; reject empty/oversized.
5. `validateImageBuffer` (reuse `@/lib/slice-it/upload-validation`) — magic-byte/type check.
6. Generate key `rmharks/<userId>-<timestamp>-<rand>.<ext>`.
7. `putObject` to the bucket.
8. Return `{ urls: ["/api/feed/image/<key>", ...] }`.

### 5. Feed image read route
`app/routes/api/feed/image/$key` (GET). Public (feed images are public content). Streams the object via `getObjectStream` with the stored content-type and long-lived immutable cache headers (`Cache-Control: public, max-age=31536000, immutable` — keys are content-unique). Returns 404 when the object is absent. A Cloudflare "Cache Everything" rule on `/api/feed/image/*` provides edge caching and survives the R2 swap.

### 6. Data model + wiring
- Add `imageUrls String[]` to the `RMHark` model (`prisma/schema.prisma:990`) + a Prisma migration. (`gifUrl` stays as-is for external GIF links.)
- Wire into the create-post route (`app/routes/api/rmharks.ts`): accept and persist `imageUrls`.
- Composer UI: image picker, client-side preview, upload-before-post flow calling the upload route.
- Post rendering: display `imageUrls` in the feed item.

### 7. Lifecycle & limits
- Reuse `validateImageBuffer`; enforce 4 images/post and 5 MB/image.
- Optionally retain a global storage-cap aggregation if desired (matching the avatar pattern), otherwise rely on per-post limits.
- Posts are **soft-deleted** (`deletedAt` on `RMHark`). Object cleanup for deleted posts is **deferred to a later sweeper job**, out of scope here, to keep this slice focused.

### 8. Testing
- Unit tests for the storage module (`putObject`/`getObjectStream`/`deleteObject`/`objectExists`) against MinIO (or a mocked S3 client).
- Upload-route tests covering: unauthenticated (401), rate-limit (429), oversized (400), invalid type (400), too-many-images (400), happy path (returns URLs).
- Read-route test: known key streams with correct content-type; missing key → 404.

## Out of scope (clean follow-ups)
- Migrating existing `db/` media (avatars, songs, builds) to S3.
- Migrating static `public/` assets (library, music, models, sprites) off Apache.
- Deleted-post image sweeper.
- Cloudflare R2 cutover (config-only when chosen).

## Acceptance criteria
1. MinIO runs locally via `docker-compose up` with the bucket auto-created, and a Helm template exists for k3s.
2. A logged-in user can attach up to 4 images to an RMHark post; images upload to MinIO and render in the feed.
3. Images are served via `/api/feed/image/<key>` with correct content-type and cache headers; the route is provider-agnostic.
4. All provider knowledge is confined to `app/lib/storage/s3.server.ts`; swapping to R2 requires only env changes.
5. Tests for the storage module and both routes pass.
