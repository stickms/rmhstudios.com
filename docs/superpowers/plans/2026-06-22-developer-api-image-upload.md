# Developer API Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Twitter-style image upload to the public developer API — `POST /api/v1/images` returns an opaque `media_id`, and `POST /api/v1/posts` attaches those ids to a post, with a reconciling sweep that reclaims orphaned and deleted-post media.

**Architecture:** A new additive `Media` Prisma model tracks each upload (owner, storage key, resolved URL, status). The `media_id` is an API-surface abstraction only — posts still store resolved URLs in `RMHark.imageUrls`, so existing posts need zero migration. Core logic lives in small, dependency-injected `lib/media/*` modules (unit-testable without a DB); route handlers and a worker `setInterval` are thin glue. Cleanup is a reconciling sweep behind a `purgeFromCdn` storage abstraction so a future CDN is a one-file change.

**Tech Stack:** TanStack Start file routes, Prisma 7 (+ `@prisma/adapter-pg`), Zod, Vitest, `nanoid`, existing S3-or-local storage (`lib/storage/s3.server.ts`) and magic-byte validation (`lib/slice-it/upload-validation.ts`).

## Global Constraints

- **Auth:** every `/api/v1/*` endpoint goes through `withDeveloperApi` (`lib/api/with-developer-api.server.ts`); `ctx.userId` is the owner. Never trust client-supplied user ids.
- **Limits (verbatim, mirror the in-app uploader):** ≤ 4 images per post; ≤ 5 MB (`5 * 1024 * 1024`) per image; formats png/jpg/webp/gif verified by **magic bytes** (`validateImageBuffer` + `detectImageExt`), never the declared content-type.
- **Storage:** reuse `feedImageKey` / `feedImageUrl` / `contentTypeForFilename` from `lib/storage/keys.ts`; filename scheme `<userId>-<ts>-<rand><ext>`. Store image bytes **as-is** (no Sharp re-encode).
- **Id format:** `media_` + `nanoid()`. Ids are opaque; never expose a raw storage URL in the upload response.
- **Lifecycle:** media is single-use. Orphan TTL = 24h (`24 * 60 * 60 * 1000`). Deleted-post grace = 7 days (`7 * 24 * 60 * 60 * 1000`).
- **Abuse controls (upload route only):** tier-gated to **starter+** via a dedicated `hasApiImageUpload(tier)` capability (403 `feature_not_available` otherwise); reject `Content-Length > 5 MB` with **413** before reading the body; a dedicated **15 req/min per key** limit (reusing the existing `rateLimit`/`redisRateLimit`, prefix `dev-api-image`); a tier-scaled **daily quota** (starter 200, pro 1 000, enterprise 5 000) → 429 `quota_exceeded`. No token bucket / pending-cap / concurrency semaphore (dropped, YAGNI).
- **Test location:** unit tests go in `lib/__tests__/*.test.ts` (picked up by `vitest.config.ts`). Run with `pnpm exec vitest run <path>`.
- **Dependency injection:** `lib/media/*` server functions take their `prisma`/storage collaborators as an argument so they unit-test with plain mocks (no `vi.mock` of the prisma module). Route handlers pass the real `prisma` (`@/lib/prisma.server`) and storage functions.

---

## File Structure

**Create:**
- `lib/media/id.ts` — `media_id` format helpers (pure).
- `lib/media/policy.ts` — upload/attach validation + limit constants (pure).
- `lib/media/sweep-policy.ts` — TTL constants + `mediaExpiresAt` (pure).
- `lib/storage/cdn.server.ts` — `purgeFromCdn` / `cdnConfigured` (CDN abstraction).
- `lib/media/upload.server.ts` — `createMediaFromUpload` (DI: prisma + putObject).
- `lib/media/attach.server.ts` — `resolveMediaForPost` + `markMediaAttached` (DI: prisma).
- `lib/media/sweep.server.ts` — `sweepUnreferencedMedia` (DI: prisma + storage + now).
- `app/routes/api/v1/images.ts` — `POST /api/v1/images` route (thin).
- `lib/media/quota.server.ts` — `checkDailyUploadQuota` (DI: redis/in-process counter) + per-tier quota map.
- Tests: `lib/__tests__/media-id.test.ts`, `media-policy.test.ts`, `media-sweep-policy.test.ts`, `storage-cdn.test.ts`, `media-upload.test.ts`, `media-attach.test.ts`, `media-sweep.test.ts`, `media-quota.test.ts`, `entitlements-image-upload.test.ts`.

**Modify:**
- `prisma/schema.prisma` — add `Media` model + `MediaStatus` enum + back-relations on `User` and `RMHark`.
- `app/routes/api/v1/posts.ts` — accept `media_ids` in the POST handler.
- `lib/entitlements.ts` — add `hasApiImageUpload(tier)` capability.
- `app/routes/api/v1/images.ts` — wire abuse controls (capability gate, 413 guard, tight limit, daily quota) — built in Task 5, hardened in Task 9.
- `server/recap/index.ts` — add an hourly `setInterval` calling the sweep.
- `.env.example` — document CDN env vars.
- `docs/developer-api.md` — document the new endpoint + `media_ids`.

---

## Task 1: `Media` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model/enum near the `RMHark` model ~line 1138; add back-relations on `User` ~line 12 and `RMHark`)

**Interfaces:**
- Produces: Prisma `Media` model + `MediaStatus` enum. Fields: `id: String` (PK), `userId: String`, `key: String`, `url: String`, `contentType: String`, `bytes: Int`, `status: MediaStatus` (`PENDING`|`ATTACHED`), `postId: String?`, `createdAt: DateTime`, `attachedAt: DateTime?`. Relations: `user → User` (`onDelete: Cascade`), `post → RMHark?` (`onDelete: SetNull`).

- [ ] **Step 1: Add the model + enum to the schema**

Append after the `RMHark` model block in `prisma/schema.prisma`:

```prisma
enum MediaStatus {
  PENDING
  ATTACHED
}

/// Developer-API uploaded media. The `media_id` is an opaque handle; posts
/// still store the resolved `url` in RMHark.imageUrls. Reclaimed by the
/// reconciling sweep in lib/media/sweep.server.ts.
model Media {
  id          String      @id
  userId      String
  key         String
  url         String
  contentType String
  bytes       Int
  status      MediaStatus @default(PENDING)
  postId      String?
  createdAt   DateTime    @default(now())
  attachedAt  DateTime?

  user User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  post RMHark? @relation(fields: [postId], references: [id], onDelete: SetNull)

  @@index([status, createdAt])
  @@index([postId])
  @@index([userId])
}
```

- [ ] **Step 2: Add back-relations**

In the `User` model (~line 12), add a relation field alongside its other `[]` relations:

```prisma
  media         Media[]
```

In the `RMHark` model (~line 1138), add alongside its other relations (e.g. after `views   RMHarkView[]`):

```prisma
  media     Media[]
```

- [ ] **Step 3: Validate the schema**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create the migration and regenerate the client**

Run: `pnpm exec prisma migrate dev --name add_media_model`
Expected: a new folder under `prisma/migrations/` containing `CREATE TABLE "Media"` and `CREATE TYPE "MediaStatus"`, and `Generated Prisma Client` printed. (If no shadow DB is available locally, run `pnpm exec prisma db push` instead and note the migration must be generated in CI.)

- [ ] **Step 5: Verify the generated type exists**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -5` then in a node REPL or a scratch import confirm `import type { Media, MediaStatus } from '@prisma/client'` resolves.
Expected: no error referencing `Media`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(media): add Media model and MediaStatus enum"
```

---

## Task 2: `media_id` format helpers

**Files:**
- Create: `lib/media/id.ts`
- Test: `lib/__tests__/media-id.test.ts`

**Interfaces:**
- Produces:
  - `MEDIA_ID_PREFIX: 'media_'`
  - `newMediaId(): string` — returns `media_` + `nanoid()`.
  - `isMediaId(v: unknown): v is string` — true iff a non-empty string starting with `MEDIA_ID_PREFIX`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-id.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MEDIA_ID_PREFIX, newMediaId, isMediaId } from "@/lib/media/id";

describe("media id", () => {
  it("newMediaId is prefixed and unique", () => {
    const a = newMediaId();
    const b = newMediaId();
    expect(a.startsWith(MEDIA_ID_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(MEDIA_ID_PREFIX.length);
    expect(a).not.toBe(b);
  });

  it("isMediaId accepts our ids and rejects junk", () => {
    expect(isMediaId(newMediaId())).toBe(true);
    expect(isMediaId("media_")).toBe(true);
    expect(isMediaId("nope")).toBe(false);
    expect(isMediaId("")).toBe(false);
    expect(isMediaId(null)).toBe(false);
    expect(isMediaId(123)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-id.test.ts`
Expected: FAIL — cannot find module `@/lib/media/id`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/id.ts`:

```typescript
import { nanoid } from "nanoid";

export const MEDIA_ID_PREFIX = "media_";

/** Opaque, developer-facing media handle. */
export function newMediaId(): string {
  return `${MEDIA_ID_PREFIX}${nanoid()}`;
}

export function isMediaId(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(MEDIA_ID_PREFIX);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-id.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/media/id.ts lib/__tests__/media-id.test.ts
git commit -m "feat(media): add media_id helpers"
```

---

## Task 3: Upload + attach validation policy

**Files:**
- Create: `lib/media/policy.ts`
- Test: `lib/__tests__/media-policy.test.ts`

**Interfaces:**
- Consumes: `validateImageBuffer`, `detectImageExt` from `@/lib/slice-it/upload-validation`.
- Produces:
  - `MEDIA_MAX_BYTES = 5 * 1024 * 1024`
  - `MAX_MEDIA_PER_POST = 4`
  - `validateUpload(buffer: Buffer): { ok: true; ext: ".png" | ".jpg" | ".webp" | ".gif" } | { ok: false; error: string }`
  - `attachError(media: { userId: string; status: string } | null, ownerId: string): string | null` — returns an error message, or `null` when the media is attachable.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-policy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  MEDIA_MAX_BYTES,
  MAX_MEDIA_PER_POST,
  validateUpload,
  attachError,
} from "@/lib/media/policy";

// Minimal valid magic-byte buffers.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
const JUNK = Buffer.from([0x00, 0x01, 0x02, 0x03]);

describe("validateUpload", () => {
  it("accepts a png and returns its ext", () => {
    expect(validateUpload(PNG)).toEqual({ ok: true, ext: ".png" });
  });

  it("rejects oversize buffers", () => {
    const big = Buffer.alloc(MEDIA_MAX_BYTES + 1);
    PNG.copy(big); // valid signature, but too large
    const res = validateUpload(big);
    expect(res.ok).toBe(false);
  });

  it("rejects unknown formats", () => {
    const res = validateUpload(JUNK);
    expect(res.ok).toBe(false);
  });
});

describe("attachError", () => {
  it("returns null when owned and pending", () => {
    expect(attachError({ userId: "u1", status: "PENDING" }, "u1")).toBeNull();
  });
  it("rejects missing media", () => {
    expect(attachError(null, "u1")).toMatch(/not found/i);
  });
  it("rejects foreign-owned media", () => {
    expect(attachError({ userId: "u2", status: "PENDING" }, "u1")).toMatch(/not found/i);
  });
  it("rejects already-attached media", () => {
    expect(attachError({ userId: "u1", status: "ATTACHED" }, "u1")).toMatch(/already/i);
  });

  it("MAX_MEDIA_PER_POST is 4", () => {
    expect(MAX_MEDIA_PER_POST).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-policy.test.ts`
Expected: FAIL — cannot find module `@/lib/media/policy`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/policy.ts`:

```typescript
import { validateImageBuffer, detectImageExt } from "@/lib/slice-it/upload-validation";

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_MEDIA_PER_POST = 4;

export type ImageExt = ".png" | ".jpg" | ".webp" | ".gif";

export function validateUpload(
  buffer: Buffer
): { ok: true; ext: ImageExt } | { ok: false; error: string } {
  if (buffer.length > MEDIA_MAX_BYTES) {
    return { ok: false, error: `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const valid = validateImageBuffer(buffer);
  if (!valid.ok) return valid;
  const ext = detectImageExt(buffer);
  if (!ext) return { ok: false, error: "Unsupported image format." };
  return { ok: true, ext };
}

/** Returns an error message if this media can't be attached by `ownerId`, else null. */
export function attachError(
  media: { userId: string; status: string } | null,
  ownerId: string
): string | null {
  // Treat foreign-owned the same as missing — don't leak existence.
  if (!media || media.userId !== ownerId) return "Media not found.";
  if (media.status !== "PENDING") return "Media already attached to a post.";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-policy.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/media/policy.ts lib/__tests__/media-policy.test.ts
git commit -m "feat(media): add upload/attach validation policy"
```

---

## Task 4: CDN purge abstraction

**Files:**
- Create: `lib/storage/cdn.server.ts`
- Test: `lib/__tests__/storage-cdn.test.ts`

**Interfaces:**
- Produces:
  - `cdnConfigured(): boolean` — true iff `CDN_PURGE_URL` and `CDN_PURGE_TOKEN` are set.
  - `purgeFromCdn(key: string): Promise<void>` — no-op when unconfigured; otherwise POSTs `{ key }` to `CDN_PURGE_URL` with a bearer token. Best-effort: never throws (logs and swallows), so a purge failure can't abort a sweep.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/storage-cdn.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  delete process.env.CDN_PURGE_URL;
  delete process.env.CDN_PURGE_TOKEN;
  vi.unstubAllGlobals();
});

describe("purgeFromCdn", () => {
  it("is a no-op and does not fetch when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { cdnConfigured, purgeFromCdn } = await import("@/lib/storage/cdn.server");
    expect(cdnConfigured()).toBe(false);
    await purgeFromCdn("rmharks/a.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the key with a bearer token when configured", async () => {
    process.env.CDN_PURGE_URL = "https://cdn.example/purge";
    process.env.CDN_PURGE_TOKEN = "secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { cdnConfigured, purgeFromCdn } = await import("@/lib/storage/cdn.server");
    expect(cdnConfigured()).toBe(true);
    await purgeFromCdn("rmharks/a.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cdn.example/purge");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual({ key: "rmharks/a.png" });
  });

  it("swallows fetch errors (best-effort)", async () => {
    process.env.CDN_PURGE_URL = "https://cdn.example/purge";
    process.env.CDN_PURGE_TOKEN = "secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { purgeFromCdn } = await import("@/lib/storage/cdn.server");
    await expect(purgeFromCdn("rmharks/a.png")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/storage-cdn.test.ts`
Expected: FAIL — cannot find module `@/lib/storage/cdn.server`.

- [ ] **Step 3: Write minimal implementation**

`lib/storage/cdn.server.ts`:

```typescript
/**
 * CDN purge abstraction. Deleting an S3 origin object does not evict CDN edge
 * caches, so cleanup must explicitly purge. This is a no-op until a CDN is
 * configured (CDN_PURGE_URL + CDN_PURGE_TOKEN), keeping callers CDN-agnostic.
 * Best-effort: a purge failure must never abort a sweep, so errors are logged
 * and swallowed (a short Cache-Control TTL is the safety net).
 */
export function cdnConfigured(): boolean {
  return Boolean(process.env.CDN_PURGE_URL && process.env.CDN_PURGE_TOKEN);
}

export async function purgeFromCdn(key: string): Promise<void> {
  if (!cdnConfigured()) return;
  try {
    await fetch(process.env.CDN_PURGE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CDN_PURGE_TOKEN!}`,
      },
      body: JSON.stringify({ key }),
    });
  } catch (err) {
    console.error("[cdn] purge failed for", key, err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/storage-cdn.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/cdn.server.ts lib/__tests__/storage-cdn.test.ts
git commit -m "feat(storage): add CDN purge abstraction"
```

---

## Task 5: Upload service + `POST /api/v1/images`

**Files:**
- Create: `lib/media/upload.server.ts`
- Create: `app/routes/api/v1/images.ts`
- Test: `lib/__tests__/media-upload.test.ts`

**Interfaces:**
- Consumes: `newMediaId` (Task 2); `validateUpload` (Task 3); `feedImageKey`, `feedImageUrl`, `contentTypeForFilename` from `@/lib/storage/keys`; `ORPHAN_TTL_MS` (Task 6 — but defined inline here to avoid a forward dep; see note).
- Produces:
  - `createMediaFromUpload(deps, args): Promise<{ id: string; expiresAt: Date }>`
    - `deps`: `{ prisma: { media: { create(args): Promise<unknown> } }; putObject(key, body, contentType): Promise<void> }`
    - `args`: `{ userId: string; buffer: Buffer; now?: Date }`
    - Throws `Error` with a user-safe `.message` when `validateUpload` fails.

**Note on `ORPHAN_TTL_MS`:** define the constant in Task 6's `lib/media/sweep-policy.ts` first if executing in order; this task imports `mediaExpiresAt` from there. If executing out of order, Task 6's file is tiny — create it first.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-upload.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createMediaFromUpload } from "@/lib/media/upload.server";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

function makeDeps() {
  const created: any[] = [];
  const put: any[] = [];
  return {
    created,
    put,
    deps: {
      prisma: { media: { create: vi.fn(async ({ data }: any) => { created.push(data); return data; }) } },
      putObject: vi.fn(async (key: string, body: Buffer, ct: string) => { put.push({ key, body, ct }); }),
    },
  };
}

describe("createMediaFromUpload", () => {
  it("validates, stores, writes a PENDING row, returns id + expiry", async () => {
    const { deps, created, put } = makeDeps();
    const now = new Date("2026-06-22T00:00:00.000Z");
    const res = await createMediaFromUpload(deps, { userId: "u1", buffer: PNG, now });

    expect(res.id).toMatch(/^media_/);
    expect(res.expiresAt.toISOString()).toBe("2026-06-23T00:00:00.000Z"); // +24h

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: res.id,
      userId: "u1",
      status: "PENDING",
      contentType: "image/png",
      bytes: PNG.length,
    });
    expect(created[0].key).toMatch(/^rmharks\/u1-/);
    expect(created[0].url).toMatch(/^\/api\/feed\/image\/u1-/);

    expect(put).toHaveLength(1);
    expect(put[0].key).toBe(created[0].key);
    expect(put[0].ct).toBe("image/png");
  });

  it("throws a user-safe error on an unsupported format", async () => {
    const { deps } = makeDeps();
    await expect(
      createMediaFromUpload(deps, { userId: "u1", buffer: Buffer.from([0, 1, 2, 3]) })
    ).rejects.toThrow(/format|image/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-upload.test.ts`
Expected: FAIL — cannot find module `@/lib/media/upload.server`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/upload.server.ts`:

```typescript
import { newMediaId } from "@/lib/media/id";
import { validateUpload } from "@/lib/media/policy";
import { mediaExpiresAt } from "@/lib/media/sweep-policy";
import { feedImageKey, feedImageUrl, contentTypeForFilename } from "@/lib/storage/keys";

export interface UploadDeps {
  prisma: { media: { create(args: { data: Record<string, unknown> }): Promise<unknown> } };
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
}

export async function createMediaFromUpload(
  deps: UploadDeps,
  args: { userId: string; buffer: Buffer; now?: Date }
): Promise<{ id: string; expiresAt: Date }> {
  const validated = validateUpload(args.buffer);
  if (!validated.ok) throw new Error(validated.error);

  const now = args.now ?? new Date();
  const uniqueSuffix = `${now.getTime()}-${Math.round(Math.random() * 1e9)}`;
  const filename = `${args.userId}-${uniqueSuffix}${validated.ext}`;
  const key = feedImageKey(filename);
  const url = feedImageUrl(filename);
  const contentType = contentTypeForFilename(filename);

  await deps.putObject(key, args.buffer, contentType);

  const id = newMediaId();
  await deps.prisma.media.create({
    data: {
      id,
      userId: args.userId,
      key,
      url,
      contentType,
      bytes: args.buffer.length,
      status: "PENDING",
      createdAt: now,
    },
  });

  return { id, expiresAt: mediaExpiresAt(now) };
}
```

> If Task 6 isn't done yet, create `lib/media/sweep-policy.ts` now with at least `ORPHAN_TTL_MS` and `mediaExpiresAt` (full content in Task 6).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-upload.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route handler**

`app/routes/api/v1/images.ts`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma.server";
import { putObject } from "@/lib/storage/s3.server";
import { withDeveloperApi, apiJson, apiError, apiOptions } from "@/lib/api/with-developer-api.server";
import { createMediaFromUpload } from "@/lib/media/upload.server";
import { MEDIA_MAX_BYTES } from "@/lib/media/policy";

/**
 * POST /api/v1/images — upload one image, get an opaque media_id back.
 * Attach it to a post via POST /api/v1/posts { media_ids: [...] }.
 */
export const Route = createFileRoute("/api/v1/images")({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request }) =>
        withDeveloperApi(request, async ({ userId }) => {
          // Reject oversize bodies before reading them into memory.
          const declared = Number(request.headers.get("content-length") ?? "0");
          if (declared > MEDIA_MAX_BYTES) {
            return apiError("payload_too_large", `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`, 413);
          }

          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return apiError("invalid_request", "Expected multipart/form-data with an `image` field.", 400);
          }
          const file = form.get("image");
          if (!(file instanceof File) || file.size === 0) {
            return apiError("invalid_request", "No image provided. Send one file in the `image` field.", 400);
          }
          if (file.size > MEDIA_MAX_BYTES) {
            return apiError("invalid_request", `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`, 400);
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          try {
            const { id, expiresAt } = await createMediaFromUpload({ prisma, putObject }, { userId, buffer });
            return apiJson({ id, type: "image", expires_at: expiresAt.toISOString() }, 201);
          } catch (err) {
            return apiError("invalid_request", err instanceof Error ? err.message : "Invalid image.", 400);
          }
        }),
    },
  },
});
```

- [ ] **Step 6: Regenerate the route tree and typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "images|media" | head`
Expected: no errors. (If the project regenerates `routeTree.gen.ts` via a dev/build step, run that — e.g. `pnpm dev` once or the configured generate command — so `/api/v1/images` is registered.)

- [ ] **Step 7: Manual smoke (with a dev server running and a real API key)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/v1/images \
  -H "Authorization: Bearer rmh_live_<key>" \
  -F "image=@./some.png"
```
Expected: `201` JSON like `{"id":"media_...","type":"image","expires_at":"..."}`.

- [ ] **Step 8: Commit**

```bash
git add lib/media/upload.server.ts app/routes/api/v1/images.ts lib/__tests__/media-upload.test.ts app/routeTree.gen.ts
git commit -m "feat(api): add POST /api/v1/images upload endpoint"
```

---

## Task 6: Sweep policy constants

**Files:**
- Create: `lib/media/sweep-policy.ts`
- Test: `lib/__tests__/media-sweep-policy.test.ts`

**Interfaces:**
- Produces:
  - `ORPHAN_TTL_MS = 24 * 60 * 60 * 1000`
  - `DELETED_POST_GRACE_MS = 7 * 24 * 60 * 60 * 1000`
  - `mediaExpiresAt(createdAt: Date): Date` — `createdAt + ORPHAN_TTL_MS`.
  - `orphanCutoff(now: Date): Date` — `now − ORPHAN_TTL_MS` (PENDING older than this is orphaned).
  - `deletedPostCutoff(now: Date): Date` — `now − DELETED_POST_GRACE_MS`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-sweep-policy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  ORPHAN_TTL_MS,
  DELETED_POST_GRACE_MS,
  mediaExpiresAt,
  orphanCutoff,
  deletedPostCutoff,
} from "@/lib/media/sweep-policy";

const now = new Date("2026-06-22T00:00:00.000Z");

describe("sweep policy", () => {
  it("constants are 24h and 7d", () => {
    expect(ORPHAN_TTL_MS).toBe(86_400_000);
    expect(DELETED_POST_GRACE_MS).toBe(604_800_000);
  });
  it("mediaExpiresAt adds 24h", () => {
    expect(mediaExpiresAt(now).toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
  it("orphanCutoff subtracts 24h", () => {
    expect(orphanCutoff(now).toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });
  it("deletedPostCutoff subtracts 7d", () => {
    expect(deletedPostCutoff(now).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-sweep-policy.test.ts`
Expected: FAIL — cannot find module `@/lib/media/sweep-policy`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/sweep-policy.ts`:

```typescript
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const DELETED_POST_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

/** When a never-attached upload becomes eligible for cleanup. */
export function mediaExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ORPHAN_TTL_MS);
}

/** PENDING media created before this is orphaned. */
export function orphanCutoff(now: Date): Date {
  return new Date(now.getTime() - ORPHAN_TTL_MS);
}

/** Media whose post was soft-deleted before this is eligible for cleanup. */
export function deletedPostCutoff(now: Date): Date {
  return new Date(now.getTime() - DELETED_POST_GRACE_MS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-sweep-policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/media/sweep-policy.ts lib/__tests__/media-sweep-policy.test.ts
git commit -m "feat(media): add sweep policy constants"
```

---

## Task 7: Attach service + wire `media_ids` into `POST /api/v1/posts`

**Files:**
- Create: `lib/media/attach.server.ts`
- Modify: `app/routes/api/v1/posts.ts`
- Test: `lib/__tests__/media-attach.test.ts`

**Interfaces:**
- Consumes: `attachError`, `MAX_MEDIA_PER_POST` (Task 3); `isMediaId` (Task 2).
- Produces:
  - `resolveMediaForPost(deps, args): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }>`
    - `deps`: `{ prisma: { media: { findMany(args): Promise<Array<{ id: string; url: string; userId: string; status: string }>> }; updateMany(args): Promise<{ count: number }> } }`
    - `args`: `{ userId: string; mediaIds: string[]; postId: string; now?: Date }`
    - Validates count (≤ `MAX_MEDIA_PER_POST`), that every id is owned + PENDING (via `attachError`), then flips them to `ATTACHED` with `postId`/`attachedAt` via a guarded `updateMany` (only rows still `PENDING`), and returns the resolved `urls` in the **input order**. If the guarded update doesn't flip every id (race), returns `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-attach.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveMediaForPost } from "@/lib/media/attach.server";

function deps(rows: Array<{ id: string; url: string; userId: string; status: string }>) {
  return {
    prisma: {
      media: {
        findMany: vi.fn(async () => rows),
        updateMany: vi.fn(async () => ({ count: rows.filter((r) => r.status === "PENDING").length })),
      },
    },
  };
}

describe("resolveMediaForPost", () => {
  it("resolves urls in input order and flips to ATTACHED", async () => {
    const d = deps([
      { id: "media_b", url: "/api/feed/image/u1-2.png", userId: "u1", status: "PENDING" },
      { id: "media_a", url: "/api/feed/image/u1-1.png", userId: "u1", status: "PENDING" },
    ]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a", "media_b"], postId: "p1" });
    expect(res).toEqual({ ok: true, urls: ["/api/feed/image/u1-1.png", "/api/feed/image/u1-2.png"] });
    expect(d.prisma.media.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects more than 4 ids", async () => {
    const d = deps([]);
    const res = await resolveMediaForPost(d, {
      userId: "u1",
      mediaIds: ["media_1", "media_2", "media_3", "media_4", "media_5"],
      postId: "p1",
    });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/at most 4/i) });
    expect(d.prisma.media.findMany).not.toHaveBeenCalled();
  });

  it("rejects a foreign-owned id", async () => {
    const d = deps([{ id: "media_a", url: "/x", userId: "u2", status: "PENDING" }]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a"], postId: "p1" });
    expect(res.ok).toBe(false);
  });

  it("rejects a missing id", async () => {
    const d = deps([]); // findMany returns nothing
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a"], postId: "p1" });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not found/i) });
  });

  it("rejects a non-media-id string", async () => {
    const d = deps([]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["nope"], postId: "p1" });
    expect(res.ok).toBe(false);
    expect(d.prisma.media.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-attach.test.ts`
Expected: FAIL — cannot find module `@/lib/media/attach.server`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/attach.server.ts`:

```typescript
import { isMediaId } from "@/lib/media/id";
import { attachError, MAX_MEDIA_PER_POST } from "@/lib/media/policy";

interface MediaRow { id: string; url: string; userId: string; status: string }

export interface AttachDeps {
  prisma: {
    media: {
      findMany(args: { where: { id: { in: string[] } } }): Promise<MediaRow[]>;
      updateMany(args: {
        where: { id: { in: string[] }; status: "PENDING" };
        data: { status: "ATTACHED"; postId: string; attachedAt: Date };
      }): Promise<{ count: number }>;
    };
  };
}

export async function resolveMediaForPost(
  deps: AttachDeps,
  args: { userId: string; mediaIds: string[]; postId: string; now?: Date }
): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  const { userId, mediaIds, postId } = args;
  if (mediaIds.length === 0) return { ok: true, urls: [] };
  if (mediaIds.length > MAX_MEDIA_PER_POST) {
    return { ok: false, error: `At most ${MAX_MEDIA_PER_POST} images per post.` };
  }
  if (!mediaIds.every(isMediaId)) return { ok: false, error: "Media not found." };

  const rows = await deps.prisma.media.findMany({ where: { id: { in: mediaIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of mediaIds) {
    const err = attachError(byId.get(id) ?? null, userId);
    if (err) return { ok: false, error: err };
  }

  // Guarded flip: only rows still PENDING move. If the count doesn't match, a
  // concurrent attach won the race for one of them.
  const { count } = await deps.prisma.media.updateMany({
    where: { id: { in: mediaIds }, status: "PENDING" },
    data: { status: "ATTACHED", postId, attachedAt: args.now ?? new Date() },
  });
  if (count !== mediaIds.length) {
    return { ok: false, error: "One or more media were already attached." };
  }

  // Preserve caller's order.
  return { ok: true, urls: mediaIds.map((id) => byId.get(id)!.url) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-attach.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into the posts route**

In `app/routes/api/v1/posts.ts`, update the imports and the `POST` handler. Change the schema and create flow:

Replace the `createSchema` (lines ~9-12) with:

```typescript
const createSchema = z
  .object({
    content: z.string().max(MAX_RMHARK_LENGTH).optional(),
    media_ids: z.array(z.string()).max(4).optional(),
    audience: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
  })
  .refine((v) => (v.content?.trim().length ?? 0) > 0 || (v.media_ids?.length ?? 0) > 0, {
    message: "A post needs text content or at least one image.",
  });
```

Add the import near the top:

```typescript
import { resolveMediaForPost } from "@/lib/media/attach.server";
```

Replace the body of the `POST` handler's create logic (the `prisma.rMHark.create` block, lines ~57-66) with:

```typescript
          const content = parsed.data.content?.trim() ?? "";
          const mediaIds = parsed.data.media_ids ?? [];

          // Create the post first so we have its id to attach media to.
          const post = await prisma.rMHark.create({
            data: { userId, content, audience: parsed.data.audience ?? "PUBLIC" },
            select: { id: true, content: true, createdAt: true, audience: true },
          });

          if (mediaIds.length > 0) {
            const attached = await resolveMediaForPost({ prisma }, { userId, mediaIds, postId: post.id });
            if (!attached.ok) {
              // Roll back the just-created post so a bad media ref doesn't leave an empty post.
              await prisma.rMHark.delete({ where: { id: post.id } }).catch(() => {});
              return apiError("invalid_media", attached.error, 400);
            }
            await prisma.rMHark.update({ where: { id: post.id }, data: { imageUrls: attached.urls } });
          }

          await awardXp(userId, 25).catch(() => {});
          await progressQuests(userId, "post").catch(() => {});

          return apiJson(
            { id: post.id, content: post.content, audience: post.audience, createdAt: post.createdAt },
            201
          );
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "posts|attach|media" | head`
Expected: no errors.

- [ ] **Step 7: Manual smoke (dev server + a real key + a media_id from Task 5)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/v1/posts \
  -H "Authorization: Bearer rmh_live_<key>" -H "Content-Type: application/json" \
  -d '{"content":"hi","media_ids":["media_..."]}'
```
Expected: `201` with the post; the post's `imageUrls` now holds the resolved `/api/feed/image/...` URL, and the media row is `ATTACHED`.

- [ ] **Step 8: Commit**

```bash
git add lib/media/attach.server.ts app/routes/api/v1/posts.ts lib/__tests__/media-attach.test.ts
git commit -m "feat(api): attach media_ids to posts in POST /api/v1/posts"
```

---

## Task 8: Reconciling sweep + hourly trigger + docs

**Files:**
- Create: `lib/media/sweep.server.ts`
- Modify: `server/recap/index.ts`
- Modify: `.env.example`, `docs/developer-api.md`
- Test: `lib/__tests__/media-sweep.test.ts`

**Interfaces:**
- Consumes: `orphanCutoff`, `deletedPostCutoff` (Task 6).
- Produces:
  - `sweepUnreferencedMedia(deps): Promise<{ deleted: number }>`
    - `deps`: `{ prisma: { media: { findMany(args): Promise<Array<{ id: string; key: string }>>; deleteMany(args): Promise<{ count: number }> } }; deleteObject(key): Promise<void>; purgeFromCdn(key): Promise<void>; now?: Date }`
    - Selects media to reclaim in one `findMany` with an OR of: (a) `status=PENDING` and `createdAt < orphanCutoff(now)`; (b) `post.deletedAt` not null and `< deletedPostCutoff(now)`. For each: `deleteObject(key)` then `purgeFromCdn(key)`, then a single `deleteMany` of all collected ids. Returns the deleted count.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/media-sweep.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { sweepUnreferencedMedia } from "@/lib/media/sweep.server";

describe("sweepUnreferencedMedia", () => {
  it("deletes objects, purges CDN, and removes rows for each target", async () => {
    const targets = [
      { id: "media_1", key: "rmharks/a.png" },
      { id: "media_2", key: "rmharks/b.png" },
    ];
    const deps = {
      prisma: {
        media: {
          findMany: vi.fn(async () => targets),
          deleteMany: vi.fn(async () => ({ count: targets.length })),
        },
      },
      deleteObject: vi.fn(async () => {}),
      purgeFromCdn: vi.fn(async () => {}),
      now: new Date("2026-06-22T00:00:00.000Z"),
    };

    const res = await sweepUnreferencedMedia(deps);

    expect(res).toEqual({ deleted: 2 });
    expect(deps.deleteObject).toHaveBeenCalledWith("rmharks/a.png");
    expect(deps.deleteObject).toHaveBeenCalledWith("rmharks/b.png");
    expect(deps.purgeFromCdn).toHaveBeenCalledTimes(2);
    expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["media_1", "media_2"] } },
    });

    // Sanity-check the selection query shape (OR of orphan + deleted-post).
    const where = deps.prisma.media.findMany.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(2);
  });

  it("is a no-op when nothing matches", async () => {
    const deps = {
      prisma: { media: { findMany: vi.fn(async () => []), deleteMany: vi.fn() } },
      deleteObject: vi.fn(),
      purgeFromCdn: vi.fn(),
    };
    const res = await sweepUnreferencedMedia(deps);
    expect(res).toEqual({ deleted: 0 });
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.prisma.media.deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/media-sweep.test.ts`
Expected: FAIL — cannot find module `@/lib/media/sweep.server`.

- [ ] **Step 3: Write minimal implementation**

`lib/media/sweep.server.ts`:

```typescript
import { orphanCutoff, deletedPostCutoff } from "@/lib/media/sweep-policy";

interface Target { id: string; key: string }

export interface SweepDeps {
  prisma: {
    media: {
      findMany(args: { where: unknown; select: { id: true; key: true } }): Promise<Target[]>;
      deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    };
  };
  deleteObject(key: string): Promise<void>;
  purgeFromCdn(key: string): Promise<void>;
  now?: Date;
}

/**
 * Reclaim media no longer referenced by a live post:
 *  (a) PENDING uploads never attached within the orphan TTL, and
 *  (b) media whose post was soft-deleted past the grace period.
 * Self-healing — keys off post.deletedAt, not a delete-handler hook.
 */
export async function sweepUnreferencedMedia(deps: SweepDeps): Promise<{ deleted: number }> {
  const now = deps.now ?? new Date();

  const targets = await deps.prisma.media.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: orphanCutoff(now) } },
        { post: { deletedAt: { not: null, lt: deletedPostCutoff(now) } } },
      ],
    },
    select: { id: true, key: true },
  });

  if (targets.length === 0) return { deleted: 0 };

  for (const t of targets) {
    await deps.deleteObject(t.key);
    await deps.purgeFromCdn(t.key);
  }

  await deps.prisma.media.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
  return { deleted: targets.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/media-sweep.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the hourly trigger into the recap worker**

In `server/recap/index.ts`, add imports near the other `lib` imports:

```typescript
import { sweepUnreferencedMedia } from "../../lib/media/sweep.server";
import { deleteObject } from "../../lib/storage/s3.server";
import { purgeFromCdn } from "../../lib/storage/cdn.server";
```

Inside `main()`, after the existing recap `setInterval` is set up (~line 280), add an hourly sweep that reuses the worker's own `prisma` client:

```typescript
    const MEDIA_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
    const runMediaSweep = () =>
      sweepUnreferencedMedia({ prisma: prisma as any, deleteObject, purgeFromCdn })
        .then((r) => { if (r.deleted) log(`Media sweep removed ${r.deleted} object(s).`); })
        .catch((e) => log(`Media sweep error: ${e}`));
    const mediaSweepInterval = setInterval(runMediaSweep, MEDIA_SWEEP_INTERVAL_MS);
    runMediaSweep(); // run once on boot
```

And in the existing `shutdown` handler (~line 290, alongside `clearInterval(interval)`), add:

```typescript
        clearInterval(mediaSweepInterval);
```

- [ ] **Step 6: Document env vars and the endpoint**

In `.env.example`, add a CDN section:

```bash
# Optional CDN cache purge for media cleanup. When set, the media sweep purges
# deleted objects from the CDN edge. Leave unset to skip (S3 origin delete only).
CDN_PURGE_URL=
CDN_PURGE_TOKEN=
```

In `docs/developer-api.md`, under `## Endpoints` (after the `POST /api/v1/posts` section ~line 152), add:

````markdown
### `POST /api/v1/images`

Upload one image and receive an opaque `media_id` to attach to a post. Send
`multipart/form-data` with a single `image` field. Max 5 MB; png/jpg/webp/gif.

```bash
curl -X POST https://rmhstudios.com/api/v1/images \
  -H "Authorization: Bearer rmh_live_..." \
  -F "image=@./photo.png"
# → 201 { "id": "media_...", "type": "image", "expires_at": "..." }
```

Unattached media expires ~24h after upload. Attach within that window:

```bash
curl -X POST https://rmhstudios.com/api/v1/posts \
  -H "Authorization: Bearer rmh_live_..." -H "Content-Type: application/json" \
  -d '{"content":"hello","media_ids":["media_..."]}'
```

`POST /api/v1/posts` now accepts `media_ids` (array, max 4). `content` is
optional when at least one `media_id` is supplied.
````

Also add a line under `## Changelog` (~line 186).

- [ ] **Step 7: Typecheck the worker + full test run**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json 2>&1 | grep -E "recap|sweep|media" | head`
Expected: no errors.
Run: `pnpm exec vitest run lib/__tests__/media-*.test.ts lib/__tests__/storage-cdn.test.ts`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/media/sweep.server.ts server/recap/index.ts .env.example docs/developer-api.md lib/__tests__/media-sweep.test.ts
git commit -m "feat(media): reconciling sweep + hourly worker trigger + docs"
```

---

## Task 9: Upload abuse controls (capability gate + tight limit + daily quota)

Hardens the `POST /api/v1/images` route from Task 5. Until this task lands, the
endpoint is still gated to starter+ at 120/min (via `withDeveloperApi` +
`hasApiAccess`) and 413-guarded, but not yet tier-capability-gated, tight-limited, or
quota-capped.

**Files:**
- Modify: `lib/entitlements.ts` (add `hasApiImageUpload`)
- Create: `lib/media/quota.server.ts`
- Modify: `app/routes/api/v1/images.ts` (wire the three controls)
- Test: `lib/__tests__/entitlements-image-upload.test.ts`, `lib/__tests__/media-quota.test.ts`

**Interfaces:**
- Consumes: `Tier`, `TIER_RANK` from `@/lib/entitlements`; `redisRateLimit` from `@/lib/redis.server`; `rateLimit` from `@/lib/rate-limit`.
- Produces:
  - `hasApiImageUpload(tier: Tier): boolean` — true for starter and above.
  - `DAILY_UPLOAD_QUOTA: Record<Tier, number>` — `{ free: 0, starter: 200, pro: 1000, enterprise: 5000 }`.
  - `keyedLimit(key: string, max: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number }>` — Redis limiter with in-process fallback (same composition as `withDeveloperApi`'s private `limit`).
  - `checkDailyUploadQuota(deps, args): Promise<{ allowed: boolean; retryAfter: number }>` — `deps: { limit: typeof keyedLimit }`, `args: { userId: string; tier: Tier }`. Calls `limit(\`media-quota:\${userId}\`, DAILY_UPLOAD_QUOTA[tier], 24h)`.

- [ ] **Step 1: Write the failing entitlements test**

`lib/__tests__/entitlements-image-upload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasApiImageUpload } from "@/lib/entitlements";

describe("hasApiImageUpload", () => {
  it("grants starter and above, denies free", () => {
    expect(hasApiImageUpload("free")).toBe(false);
    expect(hasApiImageUpload("starter")).toBe(true);
    expect(hasApiImageUpload("pro")).toBe(true);
    expect(hasApiImageUpload("enterprise")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it (fails), then add the capability**

Run: `pnpm exec vitest run lib/__tests__/entitlements-image-upload.test.ts`
Expected: FAIL — `hasApiImageUpload` is not exported.

In `lib/entitlements.ts`, add next to `hasApiAccess`:

```typescript
/** Image upload via the developer API — starter and above. */
export function hasApiImageUpload(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.starter;
}
```

Run again — Expected: PASS.

- [ ] **Step 3: Write the failing quota test**

`lib/__tests__/media-quota.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { DAILY_UPLOAD_QUOTA, checkDailyUploadQuota } from "@/lib/media/quota.server";

describe("daily upload quota", () => {
  it("quota map matches the spec", () => {
    expect(DAILY_UPLOAD_QUOTA).toEqual({ free: 0, starter: 200, pro: 1000, enterprise: 5000 });
  });

  it("limits per user with the tier's max over a 24h window", async () => {
    const limit = vi.fn(async () => ({ allowed: true, retryAfter: 0 }));
    const res = await checkDailyUploadQuota({ limit }, { userId: "u1", tier: "pro" });
    expect(res.allowed).toBe(true);
    expect(limit).toHaveBeenCalledWith("media-quota:u1", 1000, 24 * 60 * 60 * 1000);
  });

  it("propagates a deny", async () => {
    const limit = vi.fn(async () => ({ allowed: false, retryAfter: 3600 }));
    const res = await checkDailyUploadQuota({ limit }, { userId: "u1", tier: "starter" });
    expect(res).toEqual({ allowed: false, retryAfter: 3600 });
    expect(limit).toHaveBeenCalledWith("media-quota:u1", 200, 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 4: Run it (fails), then implement**

Run: `pnpm exec vitest run lib/__tests__/media-quota.test.ts`
Expected: FAIL — cannot find module `@/lib/media/quota.server`.

`lib/media/quota.server.ts`:

```typescript
import type { Tier } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { redisRateLimit } from "@/lib/redis.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DAILY_UPLOAD_QUOTA: Record<Tier, number> = {
  free: 0,
  starter: 200,
  pro: 1000,
  enterprise: 5000,
};

/** Cross-instance limiter (Redis) with per-instance fallback. */
export async function keyedLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter: number }> {
  const viaRedis = await redisRateLimit(key, max, windowMs);
  if (viaRedis) return viaRedis;
  return rateLimit(key, { limit: max, windowMs });
}

export interface QuotaDeps {
  limit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; retryAfter: number }>;
}

export async function checkDailyUploadQuota(
  deps: QuotaDeps,
  args: { userId: string; tier: Tier }
): Promise<{ allowed: boolean; retryAfter: number }> {
  return deps.limit(`media-quota:${args.userId}`, DAILY_UPLOAD_QUOTA[args.tier], DAY_MS);
}
```

Run again — Expected: PASS (3 tests).

- [ ] **Step 5: Wire the three controls into the route**

In `app/routes/api/v1/images.ts`, update the imports:

```typescript
import { hasApiImageUpload } from "@/lib/entitlements";
import { keyedLimit, checkDailyUploadQuota } from "@/lib/media/quota.server";
```

Change the handler signature to also destructure `tier`, and insert the gate, tight
limit, and quota checks immediately inside the `withDeveloperApi` callback — **before**
the 413 guard:

```typescript
      POST: ({ request }) =>
        withDeveloperApi(request, async ({ userId, tier }) => {
          // 1. Tier capability gate.
          if (!hasApiImageUpload(tier)) {
            return apiError("feature_not_available", "Image upload requires a Starter plan or higher.", 403);
          }

          // 2. Dedicated tight per-key limit (far below the generic 120/min).
          const burst = await keyedLimit(`dev-api-image:${userId}`, 15, 60_000);
          if (!burst.allowed) {
            return apiError("rate_limited", "Too many uploads. Slow down.", 429, { "Retry-After": String(burst.retryAfter) });
          }

          // 3. Tier-scaled daily quota.
          const quota = await checkDailyUploadQuota({ limit: keyedLimit }, { userId, tier });
          if (!quota.allowed) {
            return apiError("quota_exceeded", "Daily image upload limit reached.", 429, { "Retry-After": String(quota.retryAfter) });
          }

          // 4. Reject oversize bodies before reading them into memory.
          const declared = Number(request.headers.get("content-length") ?? "0");
          // ... (rest of the handler unchanged)
```

- [ ] **Step 6: Typecheck + run the abuse-control tests**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "images|quota|entitle" | head`
Expected: no errors.
Run: `pnpm exec vitest run lib/__tests__/entitlements-image-upload.test.ts lib/__tests__/media-quota.test.ts`
Expected: all PASS.

- [ ] **Step 7: Manual smoke**

Run (16th call within a minute on one key):
```bash
for i in $(seq 1 16); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/v1/images \
    -H "Authorization: Bearer rmh_live_<key>" -F "image=@./some.png"
done
```
Expected: the first 15 return `201`, the 16th returns `429`.

- [ ] **Step 8: Commit**

```bash
git add lib/entitlements.ts lib/media/quota.server.ts app/routes/api/v1/images.ts lib/__tests__/entitlements-image-upload.test.ts lib/__tests__/media-quota.test.ts
git commit -m "feat(api): tier-gate, tight-limit, and daily-quota image upload"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** upload endpoint (Task 5), opaque media_id (Task 2), attach into posts with URL storage = backward compat (Task 7), Media model (Task 1), single-use + orphan TTL (Tasks 3/6/8), deleted-post cleanup with 7-day grace (Tasks 6/8), CDN abstraction (Task 4 + Task 8 wiring), limits/magic-byte validation (Task 3), abuse controls — starter+ gate, 413 guard, 15/min limit, tier-scaled daily quota (Tasks 5/9), tests per the spec's Testing section (every task).
- **Backward compat is verified structurally:** posts store resolved URLs in `imageUrls` exactly as the in-app uploader does (Task 7 writes `attached.urls`), so existing posts and the feed renderer are untouched. No migration of existing rows.
- **Confirm during Task 1:** exact back-relation placement in `User`/`RMHark` (they have many relation fields; add `media Media[]` to each).
- **Route-tree regeneration:** `app/routeTree.gen.ts` is generated. If your build doesn't auto-run it, run the project's generate/dev step before the manual smoke tests in Tasks 5 and 7.
