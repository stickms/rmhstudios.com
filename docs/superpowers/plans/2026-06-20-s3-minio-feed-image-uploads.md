# S3 (MinIO) Object Storage + Feed Image Uploads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up S3-compatible object storage (MinIO) behind a provider-agnostic seam, and ship image uploads on the RMHark feed served through an app-proxied route.

**Architecture:** A single storage module (`lib/storage/s3.server.ts`) is the only code that talks to the object store via `@aws-sdk/client-s3`; everything else is provider-blind. Feed posts store stable internal URLs (`/api/feed/image/<filename>`) so swapping MinIO→Cloudflare R2 later is config-only. Pure helpers (key building, filename safety, content-type) live in `lib/storage/keys.ts` and are unit-tested; the upload/serve routes mirror the existing avatar routes exactly.

**Tech Stack:** TanStack React Router file routes, Node, Prisma/Postgres, `@aws-sdk/client-s3`, MinIO, Docker Compose, Helm (k3s), Vitest, pnpm.

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, `pnpm exec`, `pnpm run`). Never use npm/yarn.
- Path alias `@` resolves to the repo root (`vitest.config.ts` + tsconfig). Import libs as `@/lib/...`.
- Vitest only runs files matching `vitest.config.ts` `include` globs. New unit tests MUST live under `lib/__tests__/**/*.test.ts` to be picked up. Run with `node_modules/.bin/vitest run`.
- All provider/SDK knowledge stays inside `lib/storage/s3.server.ts`. No other file imports `@aws-sdk/*`.
- Server-only modules use the `.server.ts` suffix and `@/lib/prisma.server` / `@/lib/auth` conventions.
- Routes are TanStack `createFileRoute('/exact/path')({ server: { handlers: { GET/POST } } })`. Handlers receive `{ request, params }` and return a `Response`.
- Image validation is by magic bytes via `validateImageBuffer` from `@/lib/slice-it/upload-validation` (it has its own 10 MB ceiling; enforce the 5 MB feed cap BEFORE calling it, exactly like `app/routes/api/profile/avatar.ts`).
- Feed limits: **max 4 images per post**, **max 5 MB per image**. Allowed types: PNG, JPEG, GIF, WebP.
- Soft-deleted posts (`RMHark.deletedAt`) keep their objects; cleanup is a deferred future sweeper, NOT in this plan.

---

### Task 1: Pure storage helpers (key building, filename safety, content-type)

**Files:**
- Create: `lib/storage/keys.ts`
- Test: `lib/__tests__/storage-keys.test.ts`

**Interfaces:**
- Produces:
  - `FEED_IMAGE_PREFIX = "rmharks/"` (const string)
  - `isSafeFilename(name: string): boolean` — true only for `^[A-Za-z0-9._-]+$` (no slashes, no `..`)
  - `contentTypeForFilename(filename: string): string` — maps `.png/.jpg/.jpeg/.webp/.gif` → image MIME, else `application/octet-stream`
  - `feedImageKey(filename: string): string` — returns `rmharks/<filename>`
  - `feedImageUrl(filename: string): string` — returns `/api/feed/image/<filename>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/storage-keys.test.ts
import { describe, it, expect } from "vitest";
import {
  FEED_IMAGE_PREFIX,
  isSafeFilename,
  contentTypeForFilename,
  feedImageKey,
  feedImageUrl,
} from "@/lib/storage/keys";

describe("storage keys", () => {
  it("accepts safe filenames and rejects traversal/slashes", () => {
    expect(isSafeFilename("u1-123-456-pic.png")).toBe(true);
    expect(isSafeFilename("a_b.webp")).toBe(true);
    expect(isSafeFilename("../etc/passwd")).toBe(false);
    expect(isSafeFilename("dir/file.png")).toBe(false);
    expect(isSafeFilename("..")).toBe(false);
    expect(isSafeFilename("")).toBe(false);
  });

  it("maps extensions to content types", () => {
    expect(contentTypeForFilename("x.png")).toBe("image/png");
    expect(contentTypeForFilename("x.JPG")).toBe("image/jpeg");
    expect(contentTypeForFilename("x.jpeg")).toBe("image/jpeg");
    expect(contentTypeForFilename("x.webp")).toBe("image/webp");
    expect(contentTypeForFilename("x.gif")).toBe("image/gif");
    expect(contentTypeForFilename("x.bin")).toBe("application/octet-stream");
  });

  it("builds bucket keys and public urls", () => {
    expect(FEED_IMAGE_PREFIX).toBe("rmharks/");
    expect(feedImageKey("u1-1-2-p.png")).toBe("rmharks/u1-1-2-p.png");
    expect(feedImageUrl("u1-1-2-p.png")).toBe("/api/feed/image/u1-1-2-p.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/storage-keys.test.ts`
Expected: FAIL — cannot resolve `@/lib/storage/keys`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/storage/keys.ts
export const FEED_IMAGE_PREFIX = "rmharks/";

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

export function isSafeFilename(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return SAFE_FILENAME_RE.test(name);
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function contentTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function feedImageKey(filename: string): string {
  return `${FEED_IMAGE_PREFIX}${filename}`;
}

export function feedImageUrl(filename: string): string {
  return `/api/feed/image/${filename}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/storage-keys.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/keys.ts lib/__tests__/storage-keys.test.ts
git commit -m "feat(storage): pure helpers for feed image keys + filename safety"
```

---

### Task 2: S3 client wrapper (the provider seam)

**Files:**
- Create: `lib/storage/s3.server.ts`
- Test: `lib/__tests__/storage-s3.test.ts`
- Modify: `package.json` (adds `@aws-sdk/client-s3` dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `putObject(key: string, body: Buffer, contentType: string): Promise<void>`
  - `getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>` — `null` when the object is missing (NoSuchKey)
  - `deleteObject(key: string): Promise<void>`
  - `objectExists(key: string): Promise<boolean>`
  - `getBucket(): string` — the configured bucket name

  (Note: this refines the spec's `getObjectStream` to a Buffer-returning `getObject`, matching the codebase's buffer-based serve routes in `app/routes/api/profile/avatar/$filename.ts`.)

- [ ] **Step 1: Install the SDK**

Run: `pnpm add @aws-sdk/client-s3`
Expected: `package.json` gains `@aws-sdk/client-s3` under dependencies; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the failing test**

The test mocks `@aws-sdk/client-s3` so it is deterministic and offline. It asserts the wrapper issues the right commands and maps a missing object to `null`.

```ts
// lib/__tests__/storage-s3.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }
  class NoSuchKey extends Error {
    name = "NoSuchKey";
  }
  return {
    S3Client,
    PutObjectCommand: vi.fn((input) => ({ __type: "Put", input })),
    GetObjectCommand: vi.fn((input) => ({ __type: "Get", input })),
    DeleteObjectCommand: vi.fn((input) => ({ __type: "Delete", input })),
    HeadObjectCommand: vi.fn((input) => ({ __type: "Head", input })),
    NoSuchKey,
  };
});

beforeEach(() => {
  sendMock.mockReset();
  process.env.S3_ENDPOINT = "http://minio:9000";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  process.env.S3_BUCKET = "rmh-media";
  process.env.S3_FORCE_PATH_STYLE = "true";
  vi.resetModules();
});

describe("s3 wrapper", () => {
  it("putObject sends a PutObjectCommand with bucket/key/body", async () => {
    sendMock.mockResolvedValue({});
    const { putObject, getBucket } = await import("@/lib/storage/s3.server");
    await putObject("rmharks/a.png", Buffer.from("x"), "image/png");
    expect(getBucket()).toBe("rmh-media");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("Put");
    expect(cmd.input).toMatchObject({
      Bucket: "rmh-media",
      Key: "rmharks/a.png",
      ContentType: "image/png",
    });
  });

  it("getObject returns body+contentType from the stream", async () => {
    sendMock.mockResolvedValue({
      ContentType: "image/png",
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const { getObject } = await import("@/lib/storage/s3.server");
    const result = await getObject("rmharks/a.png");
    expect(result?.contentType).toBe("image/png");
    expect(Array.from(result!.body)).toEqual([1, 2, 3]);
  });

  it("getObject returns null when the key is missing", async () => {
    const { NoSuchKey } = await import("@aws-sdk/client-s3");
    sendMock.mockRejectedValue(new NoSuchKey("missing"));
    const { getObject } = await import("@/lib/storage/s3.server");
    expect(await getObject("rmharks/missing.png")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/storage-s3.test.ts`
Expected: FAIL — cannot resolve `@/lib/storage/s3.server`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/storage/s3.server.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function getBucket(): string {
  return requireEnv("S3_BUCKET");
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const bytes = await (res.Body as {
      transformToByteArray: () => Promise<Uint8Array>;
    }).transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType || "application/octet-stream",
    };
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string })?.name === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export { getBucket };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/storage-s3.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/storage/s3.server.ts lib/__tests__/storage-s3.test.ts package.json pnpm-lock.yaml
git commit -m "feat(storage): provider-agnostic S3 wrapper (put/get/delete/head)"
```

---

### Task 3: Infra — env vars, MinIO in Docker Compose, MinIO Helm template

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Create: `deploy/helm/rmhstudios/templates/minio.yaml`
- Modify: `deploy/helm/rmhstudios/values.yaml`

**Interfaces:**
- Produces the runtime env contract consumed by Task 2: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`.

- [ ] **Step 1: Document the env contract in `.env.example`**

Append this block to `.env.example`:

```bash
# ─── Object storage (S3-compatible: MinIO now, Cloudflare R2 later) ──────────
# MinIO defaults match the docker-compose `minio` service below.
# To migrate to R2: change ENDPOINT to your R2 S3 API URL, set the R2 access
# keys, set S3_FORCE_PATH_STYLE=false, and copy objects with rclone.
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=rmhminio
S3_SECRET_ACCESS_KEY=rmhminio-dev-secret
S3_BUCKET=rmh-media
S3_FORCE_PATH_STYLE=true
```

- [ ] **Step 2: Add the `minio` + `minio-init` services to `docker-compose.yml`**

Add these two services under the existing `services:` map (after `bot-worker`). `minio-init` creates the bucket once on startup, then exits.

```yaml
  # ─── MinIO (S3-compatible object storage) ──────────────────────────────────
  minio:
    image: minio/minio:latest
    container_name: ${COMPOSE_PROJECT_NAME:-rmhstudios}-minio
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      - MINIO_ROOT_USER=${S3_ACCESS_KEY_ID:-rmhminio}
      - MINIO_ROOT_PASSWORD=${S3_SECRET_ACCESS_KEY:-rmhminio-dev-secret}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - ${MINIO_DATA_PATH:-./minio-data}:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # ─── MinIO bucket bootstrap (creates the bucket, then exits) ────────────────
  minio-init:
    image: minio/mc:latest
    container_name: ${COMPOSE_PROJECT_NAME:-rmhstudios}-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${S3_ACCESS_KEY_ID:-rmhminio} ${S3_SECRET_ACCESS_KEY:-rmhminio-dev-secret} &&
      mc mb --ignore-existing local/${S3_BUCKET:-rmh-media} &&
      echo 'bucket ready';
      "
    restart: "no"
```

- [ ] **Step 3: Verify the compose file parses**

Run: `docker compose -f docker-compose.yml config >/dev/null && echo OK`
Expected: prints `OK` (no YAML/interpolation errors). If Docker is unavailable in the environment, instead run `python3 -c "import yaml,sys; yaml.safe_load(open('docker-compose.yml'))" && echo OK`.

- [ ] **Step 4: Add the MinIO Helm template**

```yaml
# deploy/helm/rmhstudios/templates/minio.yaml
{{- if .Values.minio.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "rmhstudios.fullname" . }}-minio
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: {{ .Values.minio.storageClass | quote }}
  resources:
    requests:
      storage: {{ .Values.minio.size | quote }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "rmhstudios.fullname" . }}-minio
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
spec:
  replicas: 1
  selector:
    matchLabels:
      {{- include "rmhstudios.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: minio
  template:
    metadata:
      labels:
        {{- include "rmhstudios.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: minio
    spec:
      containers:
        - name: minio
          image: {{ .Values.minio.image | quote }}
          args: ["server", "/data", "--console-address", ":9001"]
          envFrom:
            - secretRef:
                name: {{ .Values.secretName }}
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.secretName }}
                  key: S3_ACCESS_KEY_ID
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.secretName }}
                  key: S3_SECRET_ACCESS_KEY
          ports:
            - containerPort: 9000
            - containerPort: 9001
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: {{ include "rmhstudios.fullname" . }}-minio
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "rmhstudios.fullname" . }}-minio
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
spec:
  selector:
    {{- include "rmhstudios.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: minio
  ports:
    - name: s3
      port: 9000
      targetPort: 9000
    - name: console
      port: 9001
      targetPort: 9001
{{- end }}
```

- [ ] **Step 5: Add MinIO defaults to `values.yaml`**

Insert this block after the `data:` block in `deploy/helm/rmhstudios/values.yaml`:

```yaml
# MinIO S3-compatible object storage (single-node). The app reaches it via the
# S3_ENDPOINT secret value, e.g. http://rmhstudios-minio:9000.
# MULTI-NODE/PROD: disable and point S3_ENDPOINT at Cloudflare R2 instead.
minio:
  enabled: true
  image: minio/minio:latest
  size: 20Gi
  storageClass: local-path
```

- [ ] **Step 6: Verify the chart templates render**

Run: `helm template deploy/helm/rmhstudios | grep -c "kind: Deployment"`
Expected: a count one higher than before (the new MinIO Deployment renders). If `helm` is unavailable, instead run `python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/helm/rmhstudios/templates/minio.yaml').read().replace('{{','#{{').replace('}}','}}#')))" ; echo "template authored"` as a smoke check and note manual `helm template` verification is required before deploy.

- [ ] **Step 7: Commit**

```bash
git add .env.example docker-compose.yml deploy/helm/rmhstudios/templates/minio.yaml deploy/helm/rmhstudios/values.yaml
git commit -m "feat(infra): MinIO in compose + helm; S3 env contract"
```

---

### Task 4: Data model + schema wiring (`imageUrls` everywhere)

**Files:**
- Modify: `prisma/schema.prisma:990` (RMHark model)
- Modify: `lib/rmhark-schema.ts`
- Modify: `lib/feed-types.ts`
- Test: `lib/__tests__/rmhark-schema.test.ts`

**Interfaces:**
- Consumes: `feedImageUrl` shape from Task 1 (`/api/feed/image/<filename>`).
- Produces:
  - `RMHark.imageUrls: String[]` column.
  - `createRMHarkSchema` accepts `imageUrls?: string[]` (each matching `^/api/feed/image/[A-Za-z0-9._-]+$`, max 4) and treats a non-empty `imageUrls` as valid post content.
  - `FeedItem.imageUrls?: string[]`.

- [ ] **Step 1: Add the column to the Prisma model**

In `prisma/schema.prisma`, in `model RMHark`, add `imageUrls` right after the `gifUrl` line:

```prisma
  gifUrl    String?  @db.Text
  imageUrls String[]
```

- [ ] **Step 2: Create and apply the migration**

Run: `pnpm exec prisma migrate dev --name rmhark_image_urls`
Expected: a new migration under `prisma/migrations/` adding `image_urls text[]`; Prisma Client regenerates. (If the dev DB is unreachable, run `pnpm exec prisma generate` and hand-write the migration SQL `ALTER TABLE "rmheet" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}';` in a new timestamped migration dir.)

- [ ] **Step 3: Write the failing schema test**

```ts
// lib/__tests__/rmhark-schema.test.ts
import { describe, it, expect } from "vitest";
import { createRMHarkSchema } from "@/lib/rmhark-schema";

describe("createRMHarkSchema imageUrls", () => {
  it("accepts a post with only images (no text/poll/gif)", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["/api/feed/image/u1-1-2-pic.png"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects more than 4 images", () => {
    const r = createRMHarkSchema.safeParse({
      content: "hi",
      imageUrls: [
        "/api/feed/image/a.png",
        "/api/feed/image/b.png",
        "/api/feed/image/c.png",
        "/api/feed/image/d.png",
        "/api/feed/image/e.png",
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects image urls that are not feed-image paths", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["https://evil.example/x.png"],
    });
    expect(r.success).toBe(false);
  });

  it("still rejects a fully empty post", () => {
    const r = createRMHarkSchema.safeParse({ imageUrls: [] });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/rmhark-schema.test.ts`
Expected: FAIL — `imageUrls` not yet in the schema (empty-only & image-only cases behave wrong).

- [ ] **Step 5: Update `createRMHarkSchema`**

In `lib/rmhark-schema.ts`, add the constant and field, and extend the refine. Add near the other limits:

```ts
export const MAX_RMHARK_IMAGES = 4;
const feedImageUrlSchema = z
  .string()
  .regex(/^\/api\/feed\/image\/[A-Za-z0-9._-]+$/, "Invalid image reference");
```

Change the object + refine to:

```ts
export const createRMHarkSchema = z
  .object({
    content: z
      .string()
      .max(MAX_RMHARK_LENGTH, `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`)
      .optional()
      .default(""),
    poll: pollSchema.optional(),
    gifUrl: gifUrlSchema.optional(),
    imageUrls: z
      .array(feedImageUrlSchema)
      .max(MAX_RMHARK_IMAGES, `At most ${MAX_RMHARK_IMAGES} images allowed`)
      .optional(),
  })
  .refine(
    (data) =>
      data.content.trim().length > 0 ||
      data.poll ||
      data.gifUrl ||
      (data.imageUrls?.length ?? 0) > 0,
    { message: "Post must have text, a poll, or an image/GIF" }
  );
```

- [ ] **Step 6: Add `imageUrls` to `FeedItem`**

In `lib/feed-types.ts`, in the `FeedItem` interface, add right after the `gifUrl?: string;` line (line ~58):

```ts
  imageUrls?: string[];
```

- [ ] **Step 7: Run the schema test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/rmhark-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/rmhark-schema.ts lib/feed-types.ts lib/__tests__/rmhark-schema.test.ts
git commit -m "feat(feed): add imageUrls to RMHark model, schema, and FeedItem"
```

---

### Task 5: Feed image upload route

**Files:**
- Create: `app/routes/api/rmharks/image.ts`
- Modify: `lib/slice-it/upload-validation.ts` (export `detectImageExt`)
- Test: `lib/__tests__/detect-image-ext.test.ts`

**Interfaces:**
- Consumes: `putObject` (Task 2); `feedImageKey`, `feedImageUrl` (Task 1); `validateImageBuffer` (existing); `detectImageExt` (this task).
- Produces: `POST /api/rmharks/image` accepting `multipart/form-data` with one or more `images` fields; returns `{ urls: string[] }` (200) of `/api/feed/image/<filename>` values.
- `detectImageExt(buffer: Buffer): ".png" | ".jpg" | ".webp" | ".gif" | null`

- [ ] **Step 1: Write the failing test for `detectImageExt`**

```ts
// lib/__tests__/detect-image-ext.test.ts
import { describe, it, expect } from "vitest";
import { detectImageExt } from "@/lib/slice-it/upload-validation";

describe("detectImageExt", () => {
  it("detects PNG by magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageExt(png)).toBe(".png");
  });
  it("detects JPEG", () => {
    expect(detectImageExt(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(".jpg");
  });
  it("detects GIF", () => {
    expect(detectImageExt(Buffer.from("GIF89a"))).toBe(".gif");
  });
  it("returns null for unknown", () => {
    expect(detectImageExt(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/detect-image-ext.test.ts`
Expected: FAIL — `detectImageExt` is not exported.

- [ ] **Step 3: Add `detectImageExt` to `lib/slice-it/upload-validation.ts`**

Append this export (it reuses the same signatures already defined in the file):

```ts
/** Detect a canonical image extension from magic bytes, or null if unknown. */
export function detectImageExt(
  buffer: Buffer
): ".png" | ".jpg" | ".webp" | ".gif" | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return ".png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return ".webp";
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) return ".gif";
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/detect-image-ext.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the upload route**

```ts
// app/routes/api/rmharks/image.ts
import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  validateImageBuffer,
  detectImageExt,
} from "@/lib/slice-it/upload-validation";
import { putObject } from "@/lib/storage/s3.server";
import { feedImageKey, feedImageUrl, contentTypeForFilename } from "@/lib/storage/keys";

const FEED_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
const MAX_IMAGES = 4;

export const Route = createFileRoute('/api/rmharks/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60_000,
            prefix: "rmhark-image-upload",
          });
          if (!allowed) {
            return Response.json(
              { error: "Too many uploads. Try again later." },
              { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
          }

          const formData = await request.formData();
          const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
          if (files.length === 0) {
            return Response.json({ error: "No file provided" }, { status: 400 });
          }
          if (files.length > MAX_IMAGES) {
            return Response.json(
              { error: `At most ${MAX_IMAGES} images per post.` },
              { status: 400 }
            );
          }

          const urls: string[] = [];
          for (const file of files) {
            if (file.size > FEED_IMAGE_MAX_BYTES) {
              return Response.json(
                { error: `Image too large. Maximum size is ${FEED_IMAGE_MAX_BYTES / 1024 / 1024} MB.` },
                { status: 400 }
              );
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            const validation = validateImageBuffer(buffer);
            if (!validation.ok) {
              return Response.json({ error: validation.error }, { status: 400 });
            }
            const ext = detectImageExt(buffer);
            if (!ext) {
              return Response.json({ error: "Unsupported image format." }, { status: 400 });
            }
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const filename = `${session.user.id}-${uniqueSuffix}${ext}`;
            await putObject(feedImageKey(filename), buffer, contentTypeForFilename(filename));
            urls.push(feedImageUrl(filename));
          }

          return Response.json({ urls });
        } catch (error) {
          console.error("Feed image upload error:", error);
          return Response.json({ error: "Internal Server Error" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 6: Typecheck the new route**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "rmharks/image|storage/(keys|s3)" || echo "no type errors in new files"`
Expected: prints `no type errors in new files`.

- [ ] **Step 7: Commit**

```bash
git add app/routes/api/rmharks/image.ts lib/slice-it/upload-validation.ts lib/__tests__/detect-image-ext.test.ts
git commit -m "feat(feed): POST /api/rmharks/image upload route -> MinIO"
```

---

### Task 6: Feed image serve route (app-proxied read)

**Files:**
- Create: `app/routes/api/feed/image/$filename.ts`

**Interfaces:**
- Consumes: `getObject` (Task 2); `feedImageKey`, `isSafeFilename`, `contentTypeForFilename` (Task 1).
- Produces: `GET /api/feed/image/<filename>` → streams the object with long-lived immutable cache headers, 404 when missing/unsafe.

- [ ] **Step 1: Create the serve route** (mirrors `app/routes/api/profile/avatar/$filename.ts`)

```ts
// app/routes/api/feed/image/$filename.ts
import { createFileRoute } from '@tanstack/react-router';
import { getObject } from "@/lib/storage/s3.server";
import { feedImageKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";

export const Route = createFileRoute('/api/feed/image/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response("Not Found", { status: 404 });
          }
          const object = await getObject(feedImageKey(filename));
          if (!object) {
            return new Response("Not Found", { status: 404 });
          }
          return new Response(object.body, {
            headers: {
              "Content-Type": object.contentType || contentTypeForFilename(filename),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          console.error("Feed image serve error:", error);
          return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "feed/image" || echo "no type errors in serve route"`
Expected: prints `no type errors in serve route`.

- [ ] **Step 3: Manual end-to-end verification (requires MinIO running)**

Run, with the dev stack up (`docker compose up -d minio minio-init` and `pnpm run dev`):

```bash
# Upload (replace COOKIE with a logged-in session cookie and ./pic.png with a real PNG)
curl -s -b "$COOKIE" -F "images=@./pic.png" http://localhost:7005/api/rmharks/image
# -> {"urls":["/api/feed/image/<id>.png"]}
# Then fetch the returned URL and confirm 200 + image/png:
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:7005/api/feed/image/<id>.png
```

Expected: upload returns a `urls` array; the GET prints `200 image/png`.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/feed/image/\$filename.ts
git commit -m "feat(feed): GET /api/feed/image/:filename serve route (app-proxied)"
```

---

### Task 7: Persist + return `imageUrls` in the RMHark create/read route

**Files:**
- Modify: `app/routes/api/rmharks.ts` (POST handler ~line 470+, GET handler item mappers)

**Interfaces:**
- Consumes: `createRMHarkSchema.imageUrls` (Task 4); `RMHark.imageUrls` column (Task 4).
- Produces: created/fetched `FeedItem`s carry `imageUrls`.

- [ ] **Step 1: Persist `imageUrls` on create**

In the POST handler, change the destructure and the `tx.rMHark.create` data:

```ts
    const { content, poll, gifUrl, imageUrls } = parsed.data;
```

```ts
      const created = await tx.rMHark.create({
        data: {
          content: content.trim(),
          gifUrl: gifUrl ?? null,
          imageUrls: imageUrls ?? [],
          userId: session.user.id,
        },
        include: {
          user: { select: userDisplaySelect },
        },
      });
```

- [ ] **Step 2: Return `imageUrls` in the created `FeedItem`**

In the POST handler's `const item: FeedItem = { ... }`, add after `gifUrl: rmhark.gifUrl ?? undefined,`:

```ts
      imageUrls: rmhark.imageUrls,
```

- [ ] **Step 3: Return `imageUrls` from the GET mappers**

In `app/routes/api/rmharks.ts` there are four `FeedItem` mappers building `ownItems`/`repostItems` (in both the `friends` branch and the default branch). In each, immediately after the existing `gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),` line, add:

```ts
          imageUrls: isDeleted ? undefined : r.imageUrls,
```

(There are exactly four occurrences of that `gifUrl:` line in the file — add the `imageUrls` line after each.)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "api/rmharks.ts" || echo "no type errors in rmharks route"`
Expected: prints `no type errors in rmharks route`.

- [ ] **Step 5: Verify the existing suite still passes**

Run: `node_modules/.bin/vitest run`
Expected: PASS (all suites green, including the new storage/schema tests).

- [ ] **Step 6: Commit**

```bash
git add app/routes/api/rmharks.ts
git commit -m "feat(feed): persist and return imageUrls on RMHark create/read"
```

---

### Task 8: Composer UI — attach/preview images; render images in the feed

**Files:**
- Modify: the RMHark composer component and the feed-item renderer (locate both before editing — see Step 1)

**Interfaces:**
- Consumes: `POST /api/rmharks/image` (Task 5); `FeedItem.imageUrls` (Task 4); the existing create-post call to `POST /api/rmharks`.

- [ ] **Step 1: Locate the composer and renderer**

Run:
```bash
grep -rln "gifUrl" app/components app/routes | grep -v "api/"
```
Expected: the files that read/write `gifUrl` on the client — the composer (where a GIF is attached before posting) and the feed item renderer (where `gifUrl` is displayed). Edit those same files. If multiple, the composer is the one issuing `fetch("/api/rmharks", { method: "POST" })`; the renderer is the one rendering `item.gifUrl` inside the feed card.

- [ ] **Step 2: Add an image picker + upload to the composer**

In the composer, mirror the existing GIF-attach UX. Add local state and an upload handler that posts selected files to `/api/rmharks/image` and stores the returned URLs:

```tsx
const [imageUrls, setImageUrls] = useState<string[]>([]);

async function handleImageFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const remaining = 4 - imageUrls.length;
  const form = new FormData();
  Array.from(files).slice(0, remaining).forEach((f) => form.append("images", f));
  const res = await fetch("/api/rmharks/image", { method: "POST", body: form });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Upload failed" }));
    // surface `error` via the composer's existing error toast/state
    return;
  }
  const { urls } = await res.json();
  setImageUrls((prev) => [...prev, ...urls].slice(0, 4));
}
```

Add a hidden file input (`accept="image/png,image/jpeg,image/gif,image/webp"` `multiple`) triggered by an image button next to the existing GIF button, a thumbnail preview strip for `imageUrls` with a remove control (`setImageUrls(prev => prev.filter(u => u !== url))`), and disable the image button once `imageUrls.length >= 4`.

- [ ] **Step 3: Include `imageUrls` in the create-post request**

In the composer's submit handler, add `imageUrls` to the JSON body sent to `POST /api/rmharks` (only when non-empty), and clear it (`setImageUrls([])`) on success alongside the existing content/gif reset:

```ts
body: JSON.stringify({
  content,
  ...(gifUrl ? { gifUrl } : {}),
  ...(imageUrls.length ? { imageUrls } : {}),
  ...(poll ? { poll } : {}),
}),
```

- [ ] **Step 4: Render `imageUrls` in the feed item**

In the feed-item renderer, near where `item.gifUrl` is rendered, render the image grid when `item.imageUrls?.length`:

```tsx
{item.imageUrls && item.imageUrls.length > 0 && (
  <div className={`mt-2 grid gap-1 ${item.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
    {item.imageUrls.map((url) => (
      <img
        key={url}
        src={url}
        alt=""
        loading="lazy"
        className="w-full rounded-lg object-cover max-h-80"
      />
    ))}
  </div>
)}
```

- [ ] **Step 5: Typecheck + lint the changed files**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5 ; pnpm run lint 2>&1 | tail -5`
Expected: no new type errors; lint clean on the edited files.

- [ ] **Step 6: Manual verification (dev stack up)**

With `docker compose up -d minio minio-init` and `pnpm run dev`: open the feed, attach 1–4 images to a new post, submit, and confirm the post renders with the images and that a hard refresh still shows them (served via `/api/feed/image/...`). Confirm a 5th image is blocked client-side and the server rejects >4 / >5 MB.

- [ ] **Step 7: Commit**

```bash
git add app/components app/routes
git commit -m "feat(feed): attach, preview, and render images on RMHark posts"
```

---

## Self-Review

**Spec coverage:**
- MinIO now / R2-ready seam → Tasks 2 (wrapper), 3 (env `S3_FORCE_PATH_STYLE`, docs). ✓
- Storage module as the only provider seam → Task 2 (Global Constraint enforces it). ✓
- Env/config (`S3_*`) in `.env.example`, compose, helm → Task 3. ✓
- MinIO deployment (compose + helm) → Task 3. ✓
- Upload route mirroring avatar (auth, rate-limit, 5 MB cap, `validateImageBuffer`, key format) → Task 5. ✓
- Read route (public, app-proxied, immutable cache, 404) → Task 6. ✓
- `imageUrls String[]` on RMHark + migration + create wiring + composer/render → Tasks 4, 7, 8. ✓
- Up to 4 images, 5 MB each → Tasks 4 (schema), 5 (route), 8 (UI). ✓
- Deferred deleted-post cleanup → stated out-of-scope in Global Constraints. ✓
- Tests for storage module + schema → Tasks 1, 2, 4, 5. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. Task 8 intentionally locates the composer/renderer at execution time (Step 1) because those component paths weren't enumerated during planning — the grep command and identifying criteria are explicit, so this is actionable, not a placeholder.

**Type consistency:** `getObject` returns `{ body: Buffer; contentType: string } | null` and is consumed that way in Task 6. `feedImageKey`/`feedImageUrl`/`isSafeFilename`/`contentTypeForFilename` signatures match across Tasks 1, 5, 6. `imageUrls` is `string[]` in Prisma, `string[] | undefined` in `FeedItem`, and persisted as `imageUrls ?? []` in Task 7 — consistent. `detectImageExt` return union matches its use in Task 5.

**Note on route testing:** This repo has no HTTP route test harness (Vitest `include` globs cover only `lib/`/`testing/` node units). Per existing convention, route correctness is covered by (a) unit-testing the extracted helpers (`storage-keys`, `storage-s3`, `rmhark-schema`, `detect-image-ext`) and (b) explicit manual curl/browser verification steps. This is a deliberate match to the codebase, not an omission.
