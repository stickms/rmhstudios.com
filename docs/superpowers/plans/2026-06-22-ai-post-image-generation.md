# AI Post Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let bots attach an AI-generated image to ~5% of their posts, and give Starter+ human users a "generate image" button in the composer, using xAI's cheapest image model with hard budget protection and graceful failure everywhere.

**Architecture:** A single server-side core (`lib/rmhark-ai/image.server.ts`) derives a visual prompt from post text (via the existing DeepSeek client), generates an image through xAI's OpenAI-compatible `images.generate`, re-hosts the JPG into existing feed storage, and returns a `feedImageUrl` — returning `null` on any failure. A DB-backed daily counter (`lib/rmhark-ai/image-budget.server.ts`) caps total spend across both the web process and the bot-worker process. Two thin callers consume the core: the bot worker's `postTick()` and a new tier-gated route `POST /api/rmharks/ai-image` behind a new `AIImageButton`.

**Tech Stack:** TanStack Start (React + file routes), TypeScript ESM, Prisma 7 / PostgreSQL, `openai` SDK (pointed at `https://api.x.ai/v1`), Vitest (node env), existing S3-or-local storage layer.

## Global Constraints

- **Image provider/model:** xAI, default model `grok-imagine-image` ($0.02/image). Read from `XAI_IMAGE_MODEL`, base URL `https://api.x.ai/v1`, key `XAI_API_KEY`. Never hardcode the key.
- **Budget:** global daily cap via `XAI_IMAGE_DAILY_CAP` (default `50`). Master kill-switch `XAI_IMAGE_ENABLED` (`false` disables). All budget checks **fail closed** (deny on error).
- **Graceful failure:** `generatePostImage` must NEVER throw to callers — it returns `string | null`. A failed image generation must never block a post.
- **Bot probability:** `BOT_IMAGE_PROBABILITY` (default `0.05`).
- **Tier gate:** human image generation requires tier ≥ `starter` (`lib/entitlements.ts` `TIER_RANK`). Enforced server-side in the route; the button is hidden client-side as UX only.
- **Storage convention:** stored filenames are `<userId>-<ts>-<rand>.<ext>` via `feedImageKey`/`feedImageUrl`, identical to the in-app uploader, so results pass `ownsFeedImageUrl`.
- **Tests:** Vitest only auto-discovers `lib/__tests__/**`, `lib/rmhark-ai/__tests__/**`, `lib/dream-rift/__tests__/**`, `testing/**`. Put new unit tests under `lib/rmhark-ai/__tests__/`. Routes, components, and the worker have no automated tests in this repo (verify manually), matching existing conventions.
- Run a single test file with: `npx vitest run <path> -v`.

---

### Task 1: Daily budget counter (model + guard)

**Files:**
- Modify: `prisma/schema.prisma` (add `ImageGenBudget` model)
- Create: `lib/rmhark-ai/image-budget.server.ts`
- Create: `lib/rmhark-ai/__tests__/image-budget.test.ts`
- Modify: `.env.example` (document `XAI_IMAGE_DAILY_CAP`)

**Interfaces:**
- Produces:
  - `tryConsumeImageBudget(): Promise<boolean>` — atomically reserves one unit from today's global budget; `true` if under cap, `false` if at/over cap or on DB error.
  - `imageDailyCap(): number` — resolved cap (env `XAI_IMAGE_DAILY_CAP` or `50`).
  - `todayKey(now?: Date): string` — UTC `YYYY-MM-DD`.

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, add (place near other small standalone models):

```prisma
/// Global daily counter for AI image generations (cost guard). One row per UTC day.
model ImageGenBudget {
  day   String @id // UTC date, "YYYY-MM-DD"
  count Int    @default(0)

  @@map("image_gen_budget")
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name image_gen_budget`
Expected: a new migration under `prisma/migrations/`, Prisma Client regenerated, no errors.

- [ ] **Step 3: Write the failing test**

Create `lib/rmhark-ai/__tests__/image-budget.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { upsertMock, updateManyMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  updateManyMock: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { imageGenBudget: { upsert: upsertMock, updateMany: updateManyMock } },
}));

import {
  tryConsumeImageBudget,
  imageDailyCap,
  todayKey,
} from '@/lib/rmhark-ai/image-budget.server';

beforeEach(() => {
  upsertMock.mockReset();
  updateManyMock.mockReset();
  delete process.env.XAI_IMAGE_DAILY_CAP;
});

describe('tryConsumeImageBudget', () => {
  it('allows when under cap (one row incremented)', async () => {
    upsertMock.mockResolvedValueOnce({});
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    expect(await tryConsumeImageBudget()).toBe(true);
  });

  it('denies when at cap (no row matched the count<cap filter)', async () => {
    upsertMock.mockResolvedValueOnce({});
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    expect(await tryConsumeImageBudget()).toBe(false);
  });

  it('fails closed on DB error', async () => {
    upsertMock.mockRejectedValueOnce(new Error('db down'));
    expect(await tryConsumeImageBudget()).toBe(false);
  });
});

describe('imageDailyCap', () => {
  it('defaults to 50', () => {
    expect(imageDailyCap()).toBe(50);
  });
  it('reads a positive env override', () => {
    process.env.XAI_IMAGE_DAILY_CAP = '10';
    expect(imageDailyCap()).toBe(10);
  });
  it('ignores invalid env and uses default', () => {
    process.env.XAI_IMAGE_DAILY_CAP = 'nope';
    expect(imageDailyCap()).toBe(50);
  });
});

describe('todayKey', () => {
  it('formats a UTC date as YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-06-22T23:59:00Z'))).toBe('2026-06-22');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/rmhark-ai/__tests__/image-budget.test.ts -v`
Expected: FAIL — cannot resolve `@/lib/rmhark-ai/image-budget.server`.

- [ ] **Step 5: Implement the budget guard**

Create `lib/rmhark-ai/image-budget.server.ts`:

```ts
/**
 * Global daily spend guard for AI image generation.
 *
 * A single row per UTC day holds the count of generations attempted that day.
 * Shared across the web process and the bot-worker process via the DB, so the
 * cap holds no matter who is generating. Fails closed: any DB error denies the
 * request rather than risk overspending the (small) xAI credit balance.
 */

import { prisma } from '@/lib/prisma.server';

const DEFAULT_DAILY_CAP = 50;

/** Resolved global daily cap (env `XAI_IMAGE_DAILY_CAP`, else 50). */
export function imageDailyCap(): number {
  const raw = Number(process.env.XAI_IMAGE_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_CAP;
}

/** UTC day key, e.g. "2026-06-22". */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Atomically reserve one image-generation unit from today's global budget.
 * Returns true if the day was under cap (and a slot was reserved), false if at
 * or over cap. Fails closed (false) on any DB error.
 */
export async function tryConsumeImageBudget(): Promise<boolean> {
  const day = todayKey();
  const cap = imageDailyCap();
  try {
    // Ensure today's row exists (no-op update if present)...
    await prisma.imageGenBudget.upsert({
      where: { day },
      create: { day, count: 0 },
      update: {},
    });
    // ...then conditionally increment ONLY while under cap. updateMany returns
    // the number of rows it changed: 1 => we were under cap and reserved a
    // slot; 0 => already at cap.
    const res = await prisma.imageGenBudget.updateMany({
      where: { day, count: { lt: cap } },
      data: { count: { increment: 1 } },
    });
    return res.count === 1;
  } catch (err) {
    console.error('image budget check failed (failing closed):', err);
    return false;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/rmhark-ai/__tests__/image-budget.test.ts -v`
Expected: PASS (all cases).

- [ ] **Step 7: Document the cap env var**

In `.env.example`, near the `DEEPSEEK_API_KEY` / `RMHARK_AI_MODEL` block (~line 131–179), add:

```bash
# Max AI image generations per UTC day across bots + users (cost guard). Default 50.
# XAI_IMAGE_DAILY_CAP=50
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/rmhark-ai/image-budget.server.ts lib/rmhark-ai/__tests__/image-budget.test.ts .env.example
git commit -m "feat: DB-backed daily budget guard for AI image generation"
```

---

### Task 2: Image-prompt derivation (DeepSeek)

**Files:**
- Modify: `lib/rmhark-ai/generate.server.ts` (add `generateImagePrompt`)
- Create: `lib/rmhark-ai/__tests__/generate-image-prompt.test.ts`

**Interfaces:**
- Consumes: the existing private `chat()` and `cleanGeneratedText` already in `generate.server.ts`.
- Produces: `generateImagePrompt(postText: string): Promise<string>` — a concise, SFW, literal text-to-image prompt derived from a post. Throws `RmharkAIError` if DeepSeek is unconfigured (callers catch).

- [ ] **Step 1: Write the failing test**

Create `lib/rmhark-ai/__tests__/generate-image-prompt.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: createMock } } };
  }),
}));

import { generateImagePrompt } from '@/lib/rmhark-ai/generate.server';

beforeEach(() => {
  createMock.mockReset();
  process.env.DEEPSEEK_API_KEY = 'test-key';
});

it('derives a literal SFW prompt from the post and returns the model text', async () => {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content: 'a cozy coffee shop at golden hour, warm tones' } }],
  });
  const out = await generateImagePrompt('just had the best latte downtown');
  expect(out).toContain('coffee shop');

  const [{ messages }] = createMock.mock.calls[0];
  const system = messages.find((m: any) => m.role === 'system').content;
  const user = messages.find((m: any) => m.role === 'user').content;
  // Safety rails present.
  expect(system).toMatch(/no real|celebrit|brand|logo/i);
  // Post text is folded into the user prompt.
  expect(user).toContain('best latte downtown');
});

it('clamps overly long model output', async () => {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'x'.repeat(500) } }] });
  const out = await generateImagePrompt('whatever');
  expect(out.length).toBeLessThanOrEqual(300);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/rmhark-ai/__tests__/generate-image-prompt.test.ts -v`
Expected: FAIL — `generateImagePrompt` is not exported.

- [ ] **Step 3: Implement `generateImagePrompt`**

In `lib/rmhark-ai/generate.server.ts`, add a new exported function. Place it after `generatePost` (after line 122). It reuses the existing `chat()` and `cleanGeneratedText` already in this file:

```ts
/* ------------------------------------------------------------------ */
/*  Image prompts                                                      */
/* ------------------------------------------------------------------ */

/**
 * Turn a finished post into a concise, literal text-to-image prompt for the
 * image model. Kept deliberately safe and brand/person-free to minimize
 * provider refusals. Used by lib/rmhark-ai/image.server.ts.
 */
export async function generateImagePrompt(postText: string): Promise<string> {
  const text = postText.trim().slice(0, 600);

  const system = [
    'You turn a short social-media post into a prompt for a text-to-image model.',
    'Output ONE vivid, literal visual description of a single image that fits the post.',
    'Rules: under 40 words. Describe the subject, setting, style, and mood.',
    'Do NOT put any text or words in the image. Do NOT depict real, named people, celebrities, brands, or logos.',
    'Keep it safe-for-work and non-violent.',
    'Output ONLY the image prompt — no quotes, no labels, no markdown.',
  ].join('\n');

  const user = text
    ? `Post:\n"""${text}"""\n\nWrite the image prompt.`
    : 'Write a tasteful, interesting image prompt for a generic lifestyle social post.';

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 120, temperature: 0.9 },
  );
  return cleanGeneratedText(raw, 300);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/rmhark-ai/__tests__/generate-image-prompt.test.ts -v`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/rmhark-ai/generate.server.ts lib/rmhark-ai/__tests__/generate-image-prompt.test.ts
git commit -m "feat: derive text-to-image prompts from post text via DeepSeek"
```

---

### Task 3: Image generation core (`image.server.ts`)

**Files:**
- Create: `lib/rmhark-ai/image.server.ts`
- Create: `lib/rmhark-ai/__tests__/image.test.ts`
- Modify: `.env.example` (document `XAI_API_KEY`, `XAI_IMAGE_MODEL`, `XAI_IMAGE_ENABLED`)

**Interfaces:**
- Consumes: `generateImagePrompt` (Task 2), `tryConsumeImageBudget` (Task 1), `validateImageBuffer`/`detectImageExt` (`@/lib/slice-it/upload-validation`), `putObject` (`@/lib/storage/s3.server`), `feedImageKey`/`feedImageUrl`/`contentTypeForFilename` (`@/lib/storage/keys`).
- Produces:
  - `isImageGenConfigured(): boolean` — `XAI_API_KEY` set AND `XAI_IMAGE_ENABLED !== 'false'`.
  - `generatePostImage(opts: { text: string; userId: string }): Promise<string | null>` — a `feedImageUrl` on success, `null` on any failure. Never throws.

- [ ] **Step 1: Write the failing test**

Create `lib/rmhark-ai/__tests__/image.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { imagesMock } = vi.hoisted(() => ({ imagesMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { images: { generate: imagesMock } };
  }),
}));

const { promptMock } = vi.hoisted(() => ({ promptMock: vi.fn() }));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({ generateImagePrompt: promptMock }));

const { budgetMock } = vi.hoisted(() => ({ budgetMock: vi.fn() }));
vi.mock('@/lib/rmhark-ai/image-budget.server', () => ({ tryConsumeImageBudget: budgetMock }));

const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: putObjectMock }));

import { isImageGenConfigured, generatePostImage } from '@/lib/rmhark-ai/image.server';

// 12 bytes starting with the PNG magic signature so validateImageBuffer/detectImageExt pass.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function pngArrayBuffer(): ArrayBuffer {
  return PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
}

beforeEach(() => {
  imagesMock.mockReset();
  promptMock.mockReset();
  budgetMock.mockReset();
  putObjectMock.mockReset();
  process.env.XAI_API_KEY = 'xai-test';
  delete process.env.XAI_IMAGE_ENABLED;
  promptMock.mockResolvedValue('a calm mountain lake at dawn');
  budgetMock.mockResolvedValue(true);
  putObjectMock.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => pngArrayBuffer() })),
  );
});

describe('isImageGenConfigured', () => {
  it('false without a key', () => {
    delete process.env.XAI_API_KEY;
    expect(isImageGenConfigured()).toBe(false);
  });
  it('false when disabled by kill switch', () => {
    process.env.XAI_IMAGE_ENABLED = 'false';
    expect(isImageGenConfigured()).toBe(false);
  });
  it('true with a key and not disabled', () => {
    expect(isImageGenConfigured()).toBe(true);
  });
});

describe('generatePostImage', () => {
  it('returns null when unconfigured (no budget spent)', async () => {
    delete process.env.XAI_API_KEY;
    expect(await generatePostImage({ text: 'hi', userId: 'u1' })).toBeNull();
    expect(budgetMock).not.toHaveBeenCalled();
  });

  it('returns a feed image url under the user-id prefix on success', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    const url = await generatePostImage({ text: 'lake day', userId: 'user42' });
    expect(url).toMatch(/^\/api\/feed\/image\/user42-/);
    expect(putObjectMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips the paid call when over budget', async () => {
    budgetMock.mockResolvedValueOnce(false);
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(imagesMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('returns null on an xAI error (nothing stored)', async () => {
    imagesMock.mockRejectedValueOnce(new Error('xai 500'));
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('returns null when the downloaded bytes are not a valid image', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(putObjectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/rmhark-ai/__tests__/image.test.ts -v`
Expected: FAIL — cannot resolve `@/lib/rmhark-ai/image.server`.

- [ ] **Step 3: Implement the core**

Create `lib/rmhark-ai/image.server.ts`:

```ts
/**
 * RMHark AI — server-side IMAGE generation via xAI (Grok image API).
 *
 * Single choke point used by both the bot-worker and the human composer route.
 * Flow: post text -> DeepSeek visual prompt -> xAI images.generate -> download
 * the JPG -> validate -> re-host into feed storage -> return a feedImageUrl.
 *
 * Returns null on ANY failure (unconfigured, disabled, over budget, API error,
 * bad bytes) so a failed image can never block a post. Server-only.
 */

import OpenAI from 'openai';
import { generateImagePrompt } from './generate.server';
import { tryConsumeImageBudget } from './image-budget.server';
import { validateImageBuffer, detectImageExt } from '@/lib/slice-it/upload-validation';
import { putObject } from '@/lib/storage/s3.server';
import { feedImageKey, feedImageUrl, contentTypeForFilename } from '@/lib/storage/keys';

// xAI is OpenAI-SDK compatible; just point the base URL at their endpoint.
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 1,
});

// Cheapest xAI image model by default ($0.02/image). Override only if needed.
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

/** True when a key is set and the kill switch is not engaged. */
export function isImageGenConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

/**
 * Generate an image for a post and return a feed image URL, or null on any
 * failure. The stored filename is prefixed with `userId` so the result passes
 * ownsFeedImageUrl on the human create path.
 */
export async function generatePostImage(opts: {
  text: string;
  userId: string;
}): Promise<string | null> {
  if (!isImageGenConfigured()) return null;

  try {
    const prompt = await generateImagePrompt(opts.text);
    if (!prompt.trim()) return null;

    // Reserve budget right before the paid call. If we're at the cap, stop.
    if (!(await tryConsumeImageBudget())) return null;

    const res = await xai.images.generate({ model: XAI_IMAGE_MODEL, prompt, n: 1 });
    const url = res.data?.[0]?.url;
    if (!url) return null;

    const fetched = await fetch(url);
    if (!fetched.ok) return null;
    const buffer = Buffer.from(await fetched.arrayBuffer());

    const validation = validateImageBuffer(buffer);
    if (!validation.ok) return null;
    const ext = detectImageExt(buffer);
    if (!ext) return null;

    const filename = `${opts.userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await putObject(feedImageKey(filename), buffer, contentTypeForFilename(filename));
    return feedImageUrl(filename);
  } catch (err) {
    console.error('generatePostImage failed:', err);
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/rmhark-ai/__tests__/image.test.ts -v`
Expected: PASS (all cases).

- [ ] **Step 5: Document the xAI env vars**

In `.env.example`, near the new `XAI_IMAGE_DAILY_CAP` line from Task 1, add:

```bash
# xAI (Grok) image generation for posts. If unset, image gen is silently skipped.
# XAI_API_KEY=
# XAI_IMAGE_MODEL=grok-imagine-image   # cheapest ($0.02/img); grok-imagine-image-quality is $0.07
# XAI_IMAGE_ENABLED=true               # set to false to hard-disable all image generation
```

- [ ] **Step 6: Commit**

```bash
git add lib/rmhark-ai/image.server.ts lib/rmhark-ai/__tests__/image.test.ts .env.example
git commit -m "feat: xAI image generation core (generatePostImage)"
```

---

### Task 4: Bot worker integration

**Files:**
- Modify: `server/bot-worker/index.ts` (imports, `BOT_IMAGE_PROBABILITY`, `postTick`)
- Modify: `.env.example` (document `BOT_IMAGE_PROBABILITY`)

**Interfaces:**
- Consumes: `isImageGenConfigured`, `generatePostImage` (Task 3); existing `probEnv`, `errlog`, `prisma`, `generatePost`.

- [ ] **Step 1: Add the image-core import**

In `server/bot-worker/index.ts`, extend the existing import from `@/lib/rmhark-ai/generate.server` (lines 26–34) by adding a new import block right after it:

```ts
import {
  isImageGenConfigured,
  generatePostImage,
} from '@/lib/rmhark-ai/image.server';
```

- [ ] **Step 2: Add the probability constant**

In the `// ─── Config ───` section, after the posting constants (after `MAX_POSTS_PER_TICK` on line 63), add:

```ts
// Chance a given bot post also gets an AI-generated image (0..1).
const BOT_IMAGE_PROBABILITY = probEnv('BOT_IMAGE_PROBABILITY', 0.05);
```

- [ ] **Step 3: Generate an image inside `postTick`**

In `postTick()` (lines 215–226), replace the body of the `for (const bot of due)` try-block. Current:

```ts
      const content = await generatePost({ persona: bot.botPersona ?? undefined });
      if (!content.trim()) continue;
      await prisma.rMHark.create({
        data: { userId: bot.id, content },
      });
```

Replace with:

```ts
      const content = await generatePost({ persona: bot.botPersona ?? undefined });
      if (!content.trim()) continue;

      // Occasionally attach an AI-generated image. Never let image failure
      // block the post — fall back to text-only.
      let imageUrls: string[] = [];
      if (isImageGenConfigured() && Math.random() < BOT_IMAGE_PROBABILITY) {
        try {
          const imageUrl = await generatePostImage({ text: content, userId: bot.id });
          if (imageUrl) imageUrls = [imageUrl];
        } catch (e) {
          errlog('bot image gen failed:', e);
        }
      }

      await prisma.rMHark.create({
        data: { userId: bot.id, content, ...(imageUrls.length ? { imageUrls } : {}) },
      });
```

- [ ] **Step 4: Document the probability env var**

In `.env.example`, near the other `BOT_*` worker vars, add:

```bash
# Chance (0..1) a bot post also gets an AI-generated image. Default 0.05.
# BOT_IMAGE_PROBABILITY=0.05
```

- [ ] **Step 5: Typecheck the worker entry**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `server/bot-worker/index.ts`. (If the repo's tsconfig excludes server files, instead run `npx vitest run lib/rmhark-ai/__tests__/image.test.ts -v` to confirm the imported core still resolves, and rely on Step 6 for runtime.)

- [ ] **Step 6: Manual verification (graceful + happy path)**

Note: there are no worker unit tests in this repo. Verify by running the worker.
1. With `XAI_API_KEY` UNSET and `DEEPSEEK_API_KEY` set, run `npm run bot-worker:dev`. Confirm bots still post text and no image errors appear (image step is skipped by `isImageGenConfigured()`).
2. With `XAI_API_KEY` set and `BOT_IMAGE_PROBABILITY=1` (temporary), confirm a new bot post in the feed shows an image and a `rmheet` row has a populated `imageUrls`. Reset the env var afterward.

- [ ] **Step 7: Commit**

```bash
git add server/bot-worker/index.ts .env.example
git commit -m "feat: bots attach AI-generated images to a fraction of posts"
```

---

### Task 5: Human image route (`POST /api/rmharks/ai-image`)

**Files:**
- Create: `app/routes/api/rmharks/ai-image.ts`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`), `rateLimit`/`getClientIp` (`@/lib/rate-limit`), `getUserTier`/`TIER_RANK` (`@/lib/entitlements`), `isImageGenConfigured`/`generatePostImage` (Task 3).
- Produces: `POST /api/rmharks/ai-image` → `{ url }` (200) or `{ error }` (401/403/429/502/503/500).

- [ ] **Step 1: Implement the route**

Create `app/routes/api/rmharks/ai-image.ts` (mirrors `ai-generate.ts` + `image.ts` conventions):

```ts
/**
 * POST /api/rmharks/ai-image — generate an image for the composer with xAI.
 *
 * Starter tier and above only. Returns { url } pointing at a re-hosted feed
 * image the client appends to its imageUrls, exactly like an uploaded image.
 * Nothing is persisted as a post here. Fails gracefully: any generation problem
 * returns a friendly error and the user can still post text/their own images.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier, TIER_RANK } from '@/lib/entitlements';
import { isImageGenConfigured, generatePostImage } from '@/lib/rmhark-ai/image.server';

const bodySchema = z.object({ draft: z.string().max(1000).optional() });

export const Route = createFileRoute('/api/rmharks/ai-image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          if (!isImageGenConfigured()) {
            return Response.json(
              { error: 'AI images are not available right now.' },
              { status: 503 },
            );
          }

          const tier = await getUserTier(session.user.id);
          if (TIER_RANK[tier] < TIER_RANK.starter) {
            return Response.json(
              { error: 'A Starter subscription or higher is required to generate images.' },
              { status: 403 },
            );
          }

          // Per-user cap (fall back to IP). Image calls are paid + slow.
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${ip}`, {
            limit: 6,
            windowMs: 60_000,
            prefix: 'rmhark-ai-image',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Slow down a moment before generating another image.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const parsed = bodySchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return Response.json({ error: 'Invalid request' }, { status: 400 });
          }

          const url = await generatePostImage({
            text: parsed.data.draft ?? '',
            userId: session.user.id,
          });
          if (!url) {
            return Response.json(
              { error: "Couldn't generate an image right now. Please try again." },
              { status: 502 },
            );
          }

          return Response.json({ url });
        } catch (error) {
          console.error('AI image error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `app/routes/api/rmharks/ai-image.ts`.

- [ ] **Step 3: Manual verification**

Start the app (`npm run dev`). With `XAI_API_KEY` set:
1. Signed out → `curl -s -X POST localhost:3000/api/rmharks/ai-image -H 'content-type: application/json' -d '{"draft":"a sunset"}'` returns 401.
2. Signed in as a **free** user (send the session cookie) → 403 with the Starter message.
3. Signed in as a **Starter+** user → 200 `{ "url": "/api/feed/image/<userId>-..." }`, and opening that URL serves the image.
4. Temporarily set `XAI_IMAGE_ENABLED=false` → 503. Reset afterward.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/rmharks/ai-image.ts
git commit -m "feat: tier-gated POST /api/rmharks/ai-image endpoint"
```

---

### Task 6: Expose tier on the session

**Files:**
- Modify: `lib/auth.ts` (add `customSession` plugin)
- Modify: `lib/auth-client.ts` (add `customSessionClient`)
- Modify: `components/Providers.tsx` (carry `tier` through the cached-session snapshot)

**Interfaces:**
- Consumes: `getUserTier` (`@/lib/entitlements`).
- Produces: `session.data.user.tier` (a `Tier` string) available to client components via `useSession()`.

- [ ] **Step 1: Add the server `customSession` plugin**

In `lib/auth.ts`, add the import at the top (with the other better-auth imports):

```ts
import { customSession } from 'better-auth/plugins';
import { getUserTier } from '@/lib/entitlements';
```

Then add `customSession` as the LAST entry in the `plugins` array (after the `stripe({...})` plugin, ~line 120). It wraps the resolved session to attach the user's tier:

```ts
    plugins: [
        stripe({
            // ...unchanged...
        }),
        customSession(async ({ user, session }) => {
            const tier = await getUserTier(user.id);
            return { user: { ...user, tier }, session };
        }),
    ],
```

Note: this runs `getUserTier` (two indexed queries) per resolved session. That's acceptable for a UX gate; the route in Task 5 is the authoritative enforcement. If session resolution latency becomes a concern later, enable better-auth's session cookie cache.

- [ ] **Step 2: Add the client plugin so the type/field flow through**

In `lib/auth-client.ts`, add the `customSessionClient` plugin, typed against the server `auth` instance (type-only import — erased at build, so no server code reaches the client bundle):

```ts
import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [
    stripeClient({
      subscription: true,
    }),
    customSessionClient<typeof auth>(),
  ],
});
```

- [ ] **Step 3: Carry `tier` through the persisted session snapshot**

In `components/Providers.tsx`, add `tier` to `CachedSessionUser` (after `isVerified?` on line 47):

```ts
  isVerified?: boolean;
  tier?: string | null;
```

And include it in the snapshot written when the live session resolves (in the `liveUser` effect, after the `isVerified` line ~188):

```ts
        isVerified: (liveUser as { isVerified?: boolean }).isVerified,
        tier: (liveUser as { tier?: string | null }).tier,
```

This keeps the button visible across reloads (the cached user already has the tier) instead of flashing until the live session resolves.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `lib/auth.ts`, `lib/auth-client.ts`, `components/Providers.tsx`.

- [ ] **Step 5: Manual verification**

Start the app. Signed in, in the browser console run:
`await (await fetch('/api/auth/get-session')).json()`
Expected: the returned `user` object includes a `tier` field (`"free"`, `"starter"`, `"pro"`, or `"enterprise"`).

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/auth-client.ts components/Providers.tsx
git commit -m "feat: expose subscription tier on the session"
```

---

### Task 7: Composer "generate image" button

**Files:**
- Create: `components/feed/AIImageButton.tsx`
- Modify: `components/feed/ComposeBox.tsx` (import, tier gate, render the button)

**Interfaces:**
- Consumes: `POST /api/rmharks/ai-image` (Task 5), `session.data.user.tier` (Task 6), the composer's existing `content`, `imageUrls`, `setImageUrls`, and `MAX_IMAGES`.

- [ ] **Step 1: Create the button component**

Create `components/feed/AIImageButton.tsx` (modeled on `AIGenerateButton.tsx`):

```tsx
'use client';

import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';

interface AIImageButtonProps {
  /** Current composer text — used to theme the generated image. */
  draft: string;
  /** Receives the generated image URL so the composer can append it. */
  onGenerated: (url: string) => void;
  /** Disable (e.g. when the image slots are full). */
  disabled?: boolean;
  title?: string;
}

/**
 * A wand button that asks xAI to generate an image for the post and hands the
 * resulting feed URL back to the composer. Starter+ only — the composer decides
 * whether to render it; the server re-checks the tier.
 */
export function AIImageButton({
  draft,
  onGenerated,
  disabled = false,
  title = 'Generate an image with AI',
}: AIImageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rmharks/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to generate image');
        return;
      }
      if (typeof data?.url === 'string' && data.url) {
        onGenerated(data.url);
      }
    } catch {
      setError('Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      title={error || title}
      aria-label={title}
      className={`p-1.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        error
          ? 'text-site-danger hover:bg-site-danger/10'
          : 'text-site-text-dim hover:text-site-accent hover:bg-site-accent/10'
      }`}
    >
      {loading ? (
        <Loader2 className="w-4.5 h-4.5 animate-spin" />
      ) : (
        <Wand2 className="w-4.5 h-4.5" />
      )}
    </button>
  );
}
```

- [ ] **Step 2: Import the button and compute the tier gate in ComposeBox**

In `components/feed/ComposeBox.tsx`, add the import next to `AIGenerateButton` (line 6):

```tsx
import { AIImageButton } from './AIImageButton';
```

Then, inside the `ComposeBox` component near the other hooks (after the `useFeedStore` line ~69), derive whether the user may generate images. `useSession` is already imported (line 9). Note: `TIER_RANK`/`entitlements` import `prisma` and must NOT be imported into this client file — inline the paid-tier check instead:

```tsx
  const { data: session } = useSession();
  // Starter and above can generate images. Server re-enforces this.
  const userTier = (session?.user as { tier?: string } | undefined)?.tier;
  const canGenerateImage =
    userTier === 'starter' || userTier === 'pro' || userTier === 'enterprise';
```

- [ ] **Step 3: Render the button next to the AI text button**

In the action row, immediately after the existing `<AIGenerateButton .../>` block (lines 540–545), add:

```tsx
              {/* AI image button (Starter+) */}
              {canGenerateImage && (
                <AIImageButton
                  draft={content}
                  disabled={imageUrls.length >= MAX_IMAGES}
                  onGenerated={(url) =>
                    setImageUrls((prev) => [...prev, url].slice(0, MAX_IMAGES))
                  }
                />
              )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `components/feed/AIImageButton.tsx` or `components/feed/ComposeBox.tsx`.

- [ ] **Step 5: Manual verification**

Start the app with `XAI_API_KEY` set.
1. As a **free** user: the wand button is NOT shown in the composer.
2. As a **Starter+** user: the wand button appears next to the ✨ button. Type a few words, click it, confirm a spinner shows, then a generated image appears in the preview strip and can be removed with the X. Post it and confirm the image renders in the feed.
3. With the preview strip already holding 4 images, confirm the wand button is disabled.
4. Temporarily set `XAI_IMAGE_ENABLED=false` and confirm clicking shows a non-blocking error (button turns red, hover shows the message) and the rest of the composer still works.

- [ ] **Step 6: Commit**

```bash
git add components/feed/AIImageButton.tsx components/feed/ComposeBox.tsx
git commit -m "feat: composer AI image generation button for Starter+ users"
```

---

## Self-Review Notes

**Spec coverage:**
- Shared core `generatePostImage` + `isImageGenConfigured` → Task 3. ✓
- Prompt derived from post text → Task 2. ✓
- Budget: model/kill-switch/daily-cap (50)/per-user rate limit → Tasks 1, 3, 5. ✓
- Bot 5% integration with text-only fallback → Task 4. ✓
- Human endpoint, Starter+ gate, graceful errors → Task 5. ✓
- `AIImageButton` next to ✨, reuses preview strip → Task 7. ✓
- Tier on session → Task 6. ✓
- No post-model migration; reuses `imageUrls` + storage helpers → Tasks 3, 4, 7. ✓ (Note: a *new* `ImageGenBudget` table is added in Task 1 — this is budget infra, not the post model.)
- Cheapest model default `grok-imagine-image` → Global Constraints + Task 3. ✓

**Deviations from spec, intentional:**
- The spec mentioned a 429 for the over-cap case on the human route. Because `generatePostImage` collapses all failures to `null` (so it never leaks why), the route returns a generic 502 instead. This keeps the single-choke-point design and a friendly message; distinguishing the cap would require threading a reason out of the core and was judged not worth the coupling. Over-cap on the bot side is silent (text-only), as specified.
- Budget is consumed just before the paid xAI call, so a failed generation still counts against the daily cap. This is deliberately conservative (protects the $20); documented in `image.server.ts`.

**Type consistency:** `generatePostImage({ text, userId })`, `tryConsumeImageBudget()`, `generateImagePrompt(postText)`, `isImageGenConfigured()` are referenced identically across Tasks 3–5 and the tests. The route uses `TIER_RANK`/`getUserTier` exactly as the existing `developer/keys` route does.
