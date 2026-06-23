# Developer API — Image Upload (Twitter-style media)

**Date:** 2026-06-22
**Status:** Design approved, pending implementation plan

## Goal

Let developers upload images through the public `/api/v1/*` developer API and attach
them to posts, modeled on Twitter/X's media flow: upload returns an opaque
`media_id`, and the post-create call references that id. Existing posts (which
already store image URLs) must keep working with zero migration.

## Background — what already exists

- **Developer API** at `app/routes/api/v1/*` (`posts`, `feed`, `me`), authenticated
  by API key via `withDeveloperApi` (`lib/api/with-developer-api.server.ts`) with
  per-tier rate limits. `POST /api/v1/posts` currently creates a **text-only** post.
- **In-app image upload** at `app/routes/api/rmharks/image.ts` — multipart, session
  auth, validates magic bytes, stores via `putObject`, returns
  `/api/feed/image/<filename>` URLs.
- **Storage** `lib/storage/s3.server.ts` — S3-or-local-filesystem fallback;
  `lib/storage/keys.ts` (`feedImageKey`, `feedImageUrl`, key/format helpers);
  `lib/slice-it/upload-validation.ts` (`validateImageBuffer`, `detectImageExt`);
  `lib/image-optimize.ts` (Sharp, available but unused by the in-app route).
- **`RMHark`** post model already has `imageUrls String[]` — posts can carry images;
  the v1 endpoint just doesn't accept them yet.
- Posts are **soft-deleted** (`app/routes/api/rmharks/$id.ts` sets `deletedAt`).
- **No cron framework.** Cleanup idioms in the repo: lazy-on-access
  (`lib/discord-avatar-refresh.server.ts`) and `setInterval` in long-running workers
  (`server/recap`, `server/doctrine-worker`).

## Core decisions

1. **Opaque `media_id`, not a URL.** Upload returns `{ "id": "media_abc123" }`. The
   developer never holds a raw origin URL, which keeps storage/serving swappable
   (CDN, signed URLs) without breaking clients.
2. **`media_id` is an API-surface abstraction only.** Under the hood, posts still
   store resolved URLs in `RMHark.imageUrls`, identical in format to the in-app
   uploader. This is the backward-compat keystone — see below.
3. **Single-use media.** One `media_id` attaches to exactly one post; orphans and
   deleted-post media are reclaimed by a reconciling sweep.

## Backward compatibility (existing posts never break)

- Existing posts hold `/api/feed/image/<filename>` URLs in `imageUrls`; untouched,
  and the `/api/feed/image/...` serving route stays. **Zero migration.**
- New API posts end up byte-identical in storage — a resolved URL in `imageUrls`.
  The feed renderer never sees a `media_id`; it only ever reads URLs.
- The `Media` table is purely additive — it sits in front of upload only.

## API surface

### `POST /api/v1/images`

- Auth: `withDeveloperApi` (API key), per-tier rate limit + a tighter upload limit.
- Body: `multipart/form-data`, single `image` field (one media → one id).
- Validate magic bytes (`validateImageBuffer` / `detectImageExt`); enforce size and
  format limits (below). Never trust the declared content-type.
- Store via `putObject(feedImageKey(filename), …)` with the existing unique
  filename scheme `<userId>-<ts>-<rand>.<ext>`.
- Write a `Media` row (`status: PENDING`), return:

  ```json
  { "id": "media_abc123", "type": "image", "expires_at": "2026-06-23T12:00:00.000Z" }
  ```

  No URL in the response — the id is the handle.

### `POST /api/v1/posts` (extended)

```json
{ "content": "hello", "media_ids": ["media_abc123"], "audience": "PUBLIC" }
```

- `media_ids` optional, max 4. `content` becomes optional when `media_ids` is
  present (image-only posts), else still required.
- For each id: verify ownership (`userId` matches the API key's user) and
  `status === PENDING`; otherwise `400` (`invalid_media` / not found / already used).
- Resolve each id → its `url`, flip `status: ATTACHED`, set `postId`/`attachedAt`,
  and write the resolved URLs into `RMHark.imageUrls`. Create the post.
- Preserve existing behavior: `awardXp`, `progressQuests`.

## Data model

```prisma
model Media {
  id          String      @id              // "media_" + cuid
  userId      String                       // owner (from API key)
  key         String                       // storage key, e.g. rmharks/<filename>
  url         String                       // resolved serving URL written into imageUrls
  contentType String
  bytes       Int
  status      MediaStatus @default(PENDING)
  postId      String?                      // set when ATTACHED
  createdAt   DateTime    @default(now())
  attachedAt  DateTime?

  user User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  post RMHark? @relation(fields: [postId], references: [id], onDelete: SetNull)

  @@index([status, createdAt])             // orphan sweep
  @@index([postId])                        // deleted-post sweep
  @@index([userId])
}

enum MediaStatus { PENDING ATTACHED }
```

`postId`/`onDelete: SetNull` is a convenience link; the sweep keys off
`post.deletedAt` + grace period, not the FK. Confirm the back-relation fields on
`User` and `RMHark` during implementation.

## Cleanup — reconciling sweep

A single periodic job, `sweepUnreferencedMedia()` in `lib/`, invoked hourly via
`setInterval` from an existing long-running worker (logic in `lib/`, testable in
isolation; worker is just the trigger). Handles all cases:

1. **Orphaned uploads** — `status = PENDING` and `createdAt < now − 24h`.
2. **Deleted-post media** — `Media` whose `post.deletedAt` is set **more than 7 days
   ago** (grace period gives undelete headroom and lets CDN purges batch).
3. **Defensive backstop** — `ATTACHED` media whose post row is gone.

Per hit: `deleteObject(key)` → `purgeFromCdn(key)` → delete the `Media` row.

Rationale for a sweep over hooking the delete handler: multiple delete paths (user,
admin, orphan expiry), soft-delete isn't a single hard event, and a reconciling job
is self-healing if any path forgets.

## CDN compatibility (future)

Deleting the S3 origin object does **not** evict CDN edge caches, so cleanup needs an
explicit purge:

1. **`purgeFromCdn(key)` in `lib/storage/`**, sibling to `deleteObject`. No-op when no
   CDN is configured; calls the CDN purge API when it is. The sweep stays
   CDN-agnostic. Adding/swapping a CDN later touches one file.
2. **Tag objects with a surrogate/cache key = `media_id`** (and/or owner) at upload,
   so cleanup purges by tag in one call (Cloudflare cache-tags / Fastly
   surrogate-keys / Bunny) — cheaper than per-URL CloudFront invalidations.
3. **Moderate `Cache-Control` (not `immutable`)** on deletable media so stale copies
   age out even if a purge call fails. Purge is the fast path; TTL is the safety net.
4. **Unique filenames** (`<userId>-<ts>-<rand>.<ext>`) mean objects are never
   overwritten — no "stale updated image" problem, only "deleted image still
   cached," solved by purge + TTL. No cache-busting query strings needed.

## Limits & validation (mirror the in-app uploader)

- **≤ 4 images per post** (`MAX_IMAGES`), enforced on `media_ids.length`.
- **≤ 5 MB per image** (`FEED_IMAGE_MAX_BYTES`).
- **Formats:** png / jpg / webp / gif, verified by magic bytes.
- **Stored as-is** (no Sharp re-encode), matching the in-app route. `image-optimize`
  remains available for future thumbnails.
- Reuse `feedImageKey` / `feedImageUrl`; resolved URLs are byte-identical to in-app
  uploads and served by the existing `/api/feed/image/<filename>` route.

## Abuse & rate limiting

Uploads are far more expensive than the existing JSON endpoints — the route buffers
the whole file into memory (`Buffer.from(await file.arrayBuffer())`), so the generic
per-key request budget (120/min starter, 600/min pro) is **not** sufficient: 120 × 5
MB = 600 MB/min of ingress per key, and a fixed-window counter lets a client burst the
whole budget instantly. Layered controls, specific to the upload route:

1. **Tier gate** — a dedicated `hasApiImageUpload(tier)` capability in
   `lib/entitlements.ts` (mirrors `hasApiAccess`), granting **starter and above**
   (`free` already has no API access). Separate from `hasApiAccess` so uploads can be
   scoped or disabled independently of the rest of the API. Reject with `403`
   `feature_not_available`.
2. **Size guard before buffering** — reject when `Content-Length > 5 MB` with **413**
   *before* `request.formData()` reads the body into memory. A reverse-proxy
   `client_max_body_size 5m` is the real backstop (app checks can be bypassed if the
   proxy fully buffers first) — documented, not enforced in app code.
3. **Dedicated tight per-key limit** — the upload route uses its own limiter at **15
   req/min per key**, far below the generic 120, reusing the existing
   `rateLimit`/`redisRateLimit` (fixed-window). This is what caps the acute burst.
   A token/leaky bucket is a noted future upgrade — not built now (YAGNI).
4. **Tier-scaled daily quota** — per-user cap on uploads per rolling 24h:
   **starter 200, pro 1 000, enterprise 5 000**. A Redis counter keyed
   `media-quota:<userId>:<dayBucket>` with a 24h TTL; when Redis is absent it
   degrades to an in-process counter (best-effort, per-instance) — acceptable because
   the dedicated 15/min limit already bounds single-instance damage. Reject with `429`
   `quota_exceeded`.

**Considered and dropped (YAGNI):** a full token-bucket limiter, a concurrent
pending-media cap, and an in-flight concurrency semaphore. The 15/min limit + daily
quota + size guard cover the stated threat (a targeted flood OOMing the server);
revisit if upload abuse is observed in practice.

## Out of scope

- Chunked upload (Twitter's INIT/APPEND/FINALIZE) — single-shot only; 5 MB cap.
- Video/audio media — images only.
- Server-side image transforms/thumbnails (infra exists; not wired here).
- Reusable media handles / reference counting (single-use by design).
- A real cron/k8s CronJob — the sweep function is cron-ready, but it's triggered by a
  worker `setInterval` for now (see infra-direction memory for the eventual k3s path).

## Testing

- **Upload:** valid image → `PENDING` `Media` row + stored object + `media_id`;
  oversize body (`Content-Length`) → 413; wrong magic bytes → 400; missing field →
  400; per-key rate limit → 429; bad/missing API key → 401/403.
- **Abuse controls:** `free`/non-entitled tier → 403 `feature_not_available`;
  16th upload within a minute → 429; daily quota exceeded → 429 `quota_exceeded`;
  daily quota scales by tier.
- **Attach:** valid `media_ids` → post with resolved `imageUrls`, media `ATTACHED`;
  foreign-owner id → 400; already-`ATTACHED` id → 400; > 4 ids → 400; image-only post
  (no `content`) → 201.
- **Backward compat:** an existing post with raw `imageUrls` still renders; feed
  output for an API post is identical in shape to an in-app upload.
- **Sweep:** orphaned PENDING > 24h removed (row + object + purge called);
  deleted-post media removed only after 7-day grace; live post's media untouched.
- **CDN abstraction:** `purgeFromCdn` is a no-op without config and is invoked once
  per deleted object during a sweep.
