# GIF Picker (Tenor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search Tenor and insert GIFs in-app across posts, comments, and chat, replacing the paste-a-URL field.

**Architecture:** One server proxy (`/api/gif/search`) calls Tenor v2 with a server-only key and returns normalized results. One reusable client component (`GifPicker`) renders a searchable grid whose entire contract is `onSelect(url)`. Each surface reuses the picker: structured-`gifUrl` surfaces (posts) set state; text surfaces (comments, chat) insert the URL and render it via the existing `ChatMediaEmbed` auto-embed.

**Tech Stack:** TanStack Start file routes, React 19, TypeScript, Tailwind v4, Zod, vitest (node env), react-i18next.

## Global Constraints

- **Provider:** Tenor only. No Giphy integration, no provider toggle.
- **Tenor key is server-only.** Never expose `TENOR_API_KEY` to the client; all Tenor calls go through `/api/gif/search`.
- **SFW:** Always send `contentfilter=high` to Tenor.
- **Graceful degradation:** If `TENOR_API_KEY` is unset, `/api/gif/search` returns `503 {"error":"GIF search unavailable"}` and the picker hides its trigger — never crash a composer.
- **No DOM test environment.** `vitest.config.ts` uses `environment: 'node'` with explicit include globs; only `lib/__tests__/**/*.test.ts` (among others) runs, and there is no `testing-library`/`jsdom`. Therefore: all unit-tested logic lives in pure `lib/` modules tested under `lib/__tests__/`; React components are verified with `pnpm exec tsc --noEmit` + `pnpm lint` + a manual check. Do NOT write `.test.tsx` DOM tests — they won't run.
- **i18n:** User-facing strings use the inline pattern `t("key", { defaultValue: "..." })` with `useTranslation('feed')` (or the surface's existing namespace). Match surrounding code.
- **Reuse, don't duplicate:** Comments and DMs render GIFs by reusing `extractMediaEmbeds` / `stripEmbedUrls` / `ChatMediaEmbed` from `components/shared/ChatMediaEmbed.tsx`. Do not write a new media-URL parser.
- **Commands:** unit tests `pnpm exec vitest run <file>`; typecheck `pnpm exec tsc --noEmit`; lint `pnpm lint`.

---

### Task 1: Tenor request/normalize helpers + env

**Files:**
- Create: `lib/tenor.server.ts`
- Test: `lib/__tests__/tenor.test.ts`
- Modify: `.env.example` (add Tenor keys near other API keys)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TenorGif = { id: string; description: string; preview: string; url: string; width: number; height: number }`
  - `buildTenorRequestUrl(opts: { q: string; pos: string | null; key: string; clientKey?: string; limit?: number }): string` — returns a full `https://tenor.googleapis.com/v2/...` URL. Empty/whitespace `q` → `/v2/featured`; otherwise `/v2/search` with `q`. Always includes `media_filter=tinygif,gif`, `contentfilter=high`, `limit` (default 24), `key`, and `client_key` + `pos` when provided.
  - `normalizeTenorResponse(json: unknown): { results: TenorGif[]; next: string | null }` — maps Tenor's `results[]` (`media_formats.gif` and `media_formats.tinygif`) to `TenorGif`, skipping entries missing either format; reads `next` (string, `''` → null).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/tenor.test.ts
import { describe, it, expect } from "vitest";
import { buildTenorRequestUrl, normalizeTenorResponse } from "@/lib/tenor.server";

describe("buildTenorRequestUrl", () => {
  it("uses /v2/featured when query is empty", () => {
    const url = new URL(buildTenorRequestUrl({ q: "  ", pos: null, key: "K" }));
    expect(url.pathname).toBe("/v2/featured");
    expect(url.searchParams.get("key")).toBe("K");
    expect(url.searchParams.get("contentfilter")).toBe("high");
    expect(url.searchParams.get("media_filter")).toBe("tinygif,gif");
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("uses /v2/search with q and pos when provided", () => {
    const url = new URL(buildTenorRequestUrl({ q: "cat", pos: "20", key: "K", clientKey: "rmh", limit: 10 }));
    expect(url.pathname).toBe("/v2/search");
    expect(url.searchParams.get("q")).toBe("cat");
    expect(url.searchParams.get("pos")).toBe("20");
    expect(url.searchParams.get("client_key")).toBe("rmh");
    expect(url.searchParams.get("limit")).toBe("10");
  });
});

describe("normalizeTenorResponse", () => {
  it("maps gif + tinygif formats and reads next", () => {
    const out = normalizeTenorResponse({
      next: "30",
      results: [
        {
          id: "abc",
          content_description: "happy cat",
          media_formats: {
            gif: { url: "https://media.tenor.com/abc/full.gif", dims: [320, 240] },
            tinygif: { url: "https://media.tenor.com/abc/tiny.gif", dims: [150, 112] },
          },
        },
      ],
    });
    expect(out.next).toBe("30");
    expect(out.results).toEqual([
      { id: "abc", description: "happy cat", preview: "https://media.tenor.com/abc/tiny.gif", url: "https://media.tenor.com/abc/full.gif", width: 320, height: 240 },
    ]);
  });

  it("skips entries missing a required format and maps empty next to null", () => {
    const out = normalizeTenorResponse({
      next: "",
      results: [
        { id: "x", media_formats: { gif: { url: "https://media.tenor.com/x/g.gif", dims: [1, 1] } } },
        { id: "y", media_formats: {} },
      ],
    });
    expect(out.next).toBeNull();
    expect(out.results).toEqual([]);
  });

  it("returns empty results for malformed input", () => {
    expect(normalizeTenorResponse(null)).toEqual({ results: [], next: null });
    expect(normalizeTenorResponse({ results: "nope" })).toEqual({ results: [], next: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/tenor.test.ts`
Expected: FAIL — cannot resolve `@/lib/tenor.server` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tenor.server.ts
/**
 * Pure helpers for talking to the Tenor v2 API. No network here — the route
 * (app/routes/api/gif/search.ts) does the fetch; these build the request URL
 * and normalize the response so they can be unit-tested without HTTP.
 */

export type TenorGif = {
  id: string;
  description: string;
  preview: string; // tinygif thumbnail for the grid
  url: string; // full gif inserted on select
  width: number;
  height: number;
};

const TENOR_BASE = "https://tenor.googleapis.com/v2";
const DEFAULT_LIMIT = 24;

export function buildTenorRequestUrl(opts: {
  q: string;
  pos: string | null;
  key: string;
  clientKey?: string;
  limit?: number;
}): string {
  const q = opts.q.trim();
  const endpoint = q ? "search" : "featured";
  const url = new URL(`${TENOR_BASE}/${endpoint}`);
  url.searchParams.set("key", opts.key);
  if (opts.clientKey) url.searchParams.set("client_key", opts.clientKey);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("media_filter", "tinygif,gif");
  url.searchParams.set("contentfilter", "high");
  url.searchParams.set("limit", String(opts.limit ?? DEFAULT_LIMIT));
  if (opts.pos) url.searchParams.set("pos", opts.pos);
  return url.toString();
}

export function normalizeTenorResponse(json: unknown): { results: TenorGif[]; next: string | null } {
  const root = json as { results?: unknown; next?: unknown } | null;
  const raw = root && Array.isArray(root.results) ? root.results : [];
  const results: TenorGif[] = [];

  for (const item of raw as Array<Record<string, any>>) {
    const formats = item?.media_formats;
    const gif = formats?.gif;
    const tiny = formats?.tinygif;
    if (!gif?.url || !tiny?.url) continue;
    const dims = Array.isArray(gif.dims) ? gif.dims : [0, 0];
    results.push({
      id: String(item.id ?? gif.url),
      description: String(item.content_description ?? ""),
      preview: String(tiny.url),
      url: String(gif.url),
      width: Number(dims[0]) || 0,
      height: Number(dims[1]) || 0,
    });
  }

  const next = typeof root?.next === "string" && root.next !== "" ? root.next : null;
  return { results, next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/tenor.test.ts`
Expected: PASS (3 suites, all green).

- [ ] **Step 5: Add env vars**

In `.env.example`, add near other third-party API keys:

```bash
# Tenor (Google) GIF search — powers the in-app GIF picker.
# Create a key: https://developers.google.com/tenor/guides/quickstart
# If unset, the GIF picker is hidden and posting still works.
TENOR_API_KEY=
# Optional integration identifier sent to Tenor for analytics/rate buckets.
TENOR_CLIENT_KEY=rmhstudios
```

- [ ] **Step 6: Commit**

```bash
git add lib/tenor.server.ts lib/__tests__/tenor.test.ts .env.example
git commit -m "feat(gif): tenor request/normalize helpers + env"
```

---

### Task 2: GIF search proxy route

**Files:**
- Create: `app/routes/api/gif/search.ts`

**Interfaces:**
- Consumes: `buildTenorRequestUrl`, `normalizeTenorResponse` from `@/lib/tenor.server`; `rateLimit`, `getClientIp` from `@/lib/rate-limit`.
- Produces: `GET /api/gif/search?q=&pos=` → `200 { results: TenorGif[]; next: string | null }`. Errors: `503 { error }` (no key), `429 { error }` (rate limited), `502 { error }` (Tenor failure).

This route is a thin wrapper over Task 1's tested helpers; it is verified by typecheck + a manual curl, not a unit test (no HTTP test harness in this repo).

- [ ] **Step 1: Write the route**

```ts
// app/routes/api/gif/search.ts
import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { buildTenorRequestUrl, normalizeTenorResponse } from '@/lib/tenor.server';

/**
 * Server-side Tenor proxy for the in-app GIF picker. Keeps TENOR_API_KEY off the
 * client. Empty `q` returns trending (Tenor /v2/featured); `pos` paginates.
 */
export const Route = createFileRoute('/api/gif/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.TENOR_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: 'GIF search unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'gif-search' });
        if (!allowed) {
          return new Response(JSON.stringify({ error: 'Rate limited' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
          });
        }

        const params = new URL(request.url).searchParams;
        const q = params.get('q') ?? '';
        const pos = params.get('pos');

        const tenorUrl = buildTenorRequestUrl({
          q,
          pos,
          key,
          clientKey: process.env.TENOR_CLIENT_KEY,
        });

        try {
          const res = await fetch(tenorUrl, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            return new Response(JSON.stringify({ error: 'GIF provider error', results: [], next: null }), {
              status: 502,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const json = await res.json();
          return Response.json(normalizeTenorResponse(json));
        } catch {
          return new Response(JSON.stringify({ error: 'GIF provider error', results: [], next: null }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new errors referencing `app/routes/api/gif/search.ts`).

- [ ] **Step 3: Manual smoke (optional, needs a key)**

With `TENOR_API_KEY` set and the dev server running (`pnpm dev`):
Run: `curl -s 'http://localhost:3000/api/gif/search?q=cat' | head -c 300`
Expected: JSON `{"results":[...],"next":"..."}`. Without a key: `{"error":"GIF search unavailable"}` (503).

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/gif/search.ts
git commit -m "feat(gif): /api/gif/search tenor proxy route"
```

---

### Task 3: GifPicker component + search-path helper

**Files:**
- Create: `lib/gif-search.ts`
- Test: `lib/__tests__/gif-search.test.ts`
- Create: `components/feed/GifPicker.tsx`

**Interfaces:**
- Consumes: `TenorGif` type from `@/lib/tenor.server` (type-only import).
- Produces:
  - `buildGifSearchPath(q: string, pos: string | null): string` (in `lib/gif-search.ts`) — returns `/api/gif/search?...` with `q` set only when non-empty and `pos` set only when truthy.
  - `GifPicker` (default + named export) with props `{ onSelect: (url: string) => void; onClose?: () => void; className?: string }`.

- [ ] **Step 1: Write the failing test for the path helper**

```ts
// lib/__tests__/gif-search.test.ts
import { describe, it, expect } from "vitest";
import { buildGifSearchPath } from "@/lib/gif-search";

describe("buildGifSearchPath", () => {
  it("omits q and pos when empty", () => {
    expect(buildGifSearchPath("", null)).toBe("/api/gif/search");
  });
  it("includes q when present", () => {
    expect(buildGifSearchPath("happy cat", null)).toBe("/api/gif/search?q=happy+cat");
  });
  it("includes q and pos when both present", () => {
    expect(buildGifSearchPath("cat", "20")).toBe("/api/gif/search?q=cat&pos=20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/gif-search.test.ts`
Expected: FAIL — `@/lib/gif-search` not found.

- [ ] **Step 3: Implement the path helper**

```ts
// lib/gif-search.ts
/** Build the client fetch path for the GIF search proxy. */
export function buildGifSearchPath(q: string, pos: string | null): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (pos) params.set("pos", pos);
  const qs = params.toString();
  return qs ? `/api/gif/search?${qs}` : "/api/gif/search";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/gif-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement GifPicker**

```tsx
// components/feed/GifPicker.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ImageOff } from 'lucide-react';
import type { TenorGif } from '@/lib/tenor.server';
import { buildGifSearchPath } from '@/lib/gif-search';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose?: () => void;
  className?: string;
}

export function GifPicker({ onSelect, onClose, className = '' }: GifPickerProps) {
  const { t } = useTranslation('feed');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorGif[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch a page. pos === null starts a fresh result set.
  const fetchPage = useCallback(async (q: string, pos: string | null) => {
    setLoading(true);
    if (pos === null) setError(null);
    try {
      const res = await fetch(buildGifSearchPath(q, pos));
      if (res.status === 503) { setError('unavailable'); setResults([]); setNext(null); return; }
      if (!res.ok) { setError('failed'); return; }
      const data: { results: TenorGif[]; next: string | null } = await res.json();
      setResults((prev) => (pos === null ? data.results : [...prev, ...data.results]));
      setNext(data.next);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced query → fresh fetch (trending when empty).
  useEffect(() => {
    const id = setTimeout(() => { void fetchPage(query, null); }, 300);
    return () => clearTimeout(id);
  }, [query, fetchPage]);

  // Infinite scroll: load the next page when the sentinel enters view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !next || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchPage(query, next);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loading, query, fetchPage]);

  if (error === 'unavailable') return null; // feature off → hide entirely

  return (
    <div className={`border border-site-border rounded-xl bg-site-bg p-2 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('gif-search-placeholder', { defaultValue: 'Search Tenor GIFs...' })}
            className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg pl-8 pr-2 py-2 border border-site-border outline-none focus:border-site-accent transition-colors"
          />
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}
            className="p-1.5 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {error === 'failed' && (
          <div className="flex items-center justify-center gap-2 py-6 text-site-text-dim text-xs">
            <ImageOff className="w-4 h-4" />
            {t('gif-search-failed', { defaultValue: 'Could not load GIFs. Try again.' })}
          </div>
        )}
        {!error && results.length === 0 && !loading && (
          <div className="py-6 text-center text-xs text-site-text-dim">
            {t('gif-search-empty', { defaultValue: 'No GIFs found' })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1">
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onSelect(g.url); onClose?.(); }}
              className="block rounded-lg overflow-hidden border border-site-border hover:border-site-accent transition-colors"
            >
              <img src={g.preview} alt={g.description || 'GIF'} loading="lazy" className="w-full h-auto" />
            </button>
          ))}
        </div>
        {loading && (
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div className="h-24 rounded-lg bg-site-surface animate-pulse" />
            <div className="h-24 rounded-lg bg-site-surface animate-pulse" />
          </div>
        )}
        <div ref={sentinelRef} className="h-2" />
      </div>

      <div className="pt-1.5 text-[10px] text-site-text-dim text-right">
        {t('powered-by-tenor', { defaultValue: 'Powered by Tenor' })}
      </div>
    </div>
  );
}

export default GifPicker;
```

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS (no errors in `components/feed/GifPicker.tsx` or `lib/gif-search.ts`).

- [ ] **Step 7: Commit**

```bash
git add lib/gif-search.ts lib/__tests__/gif-search.test.ts components/feed/GifPicker.tsx
git commit -m "feat(gif): reusable GifPicker component + search-path helper"
```

---

### Task 4: Wire GifPicker into ComposeBox

**Files:**
- Modify: `components/feed/ComposeBox.tsx` (replace the gif `<input>` block at ~419-451; import `GifPicker`)

**Interfaces:**
- Consumes: `GifPicker` (`onSelect`), existing `gifUrl` state + `GifEmbed`.
- Produces: no new exports. Picking a GIF sets `gifUrl`; submit body unchanged (`buildBody` already sends `gifUrl`).

This is UI wiring; verified by typecheck/lint + manual check (no DOM test env).

- [ ] **Step 1: Add the import**

At the top of `components/feed/ComposeBox.tsx`, alongside `import { GifEmbed } from './GifEmbed';`, add:

```tsx
import { GifPicker } from './GifPicker';
```

- [ ] **Step 2: Replace the GIF input block**

Replace the entire block currently at lines ~419-451 (`{/* GIF input */} ... )}`) with:

```tsx
          {/* GIF picker */}
          {attachment === 'gif' && (
            <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">{t("gif-heading", { defaultValue: "GIF" })}</span>
                <button
                  onClick={() => {
                    setAttachment(null);
                    setGifUrl('');
                  }}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {gifUrl.trim() ? (
                <div className="relative">
                  <GifEmbed url={gifUrl.trim()} />
                  <button
                    type="button"
                    onClick={() => setGifUrl('')}
                    aria-label={t("remove-gif-aria", { defaultValue: "Remove GIF" })}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <GifPicker onSelect={(u) => setGifUrl(u)} />
              )}
            </div>
          )}
```

- [ ] **Step 3: Remove the now-unused URL validator (if unused elsewhere)**

`isValidMediaUrl` / `IMAGE_EXT_REGEX` were only used by the old input and by `hasGif`. Update `hasGif` (line ~116) to no longer require client URL validation (the server's `gifUrlSchema` validates; picked Tenor URLs always pass):

```tsx
  const hasGif = attachment === 'gif' && gifUrl.trim().length > 0;
```

Then delete the now-unused `IMAGE_EXT_REGEX` const and `isValidMediaUrl` function (lines ~33-44). If `pnpm lint` reports either still used, leave it; otherwise remove.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS, no unused-var warnings for `isValidMediaUrl`/`IMAGE_EXT_REGEX`.

- [ ] **Step 5: Manual check**

Run `pnpm dev` (with `TENOR_API_KEY` set), open the feed composer, click **＋ → Add Image**, confirm the picker shows trending GIFs, search works, clicking one shows the GIF preview with a remove button, and posting creates a post with the GIF.

- [ ] **Step 6: Commit**

```bash
git add components/feed/ComposeBox.tsx
git commit -m "feat(gif): GifPicker in feed ComposeBox"
```

---

### Task 5: Wire GifPicker into ComposeModal

**Files:**
- Modify: `components/feed/ComposeModal.tsx`

**Interfaces:**
- Consumes: `GifPicker`, mirrors ComposeBox's gif state/handling.
- Produces: none.

- [ ] **Step 1: Inspect the modal's GIF block**

Run: `grep -n "gif\|Gif\|GifEmbed\|isValidMediaUrl\|attachment === 'gif'\|setGifUrl" components/feed/ComposeModal.tsx`
Identify the modal's GIF input block and `hasGif` line (it mirrors ComposeBox).

- [ ] **Step 2: Apply the same replacement as Task 4**

Add `import { GifPicker } from './GifPicker';`. Replace the modal's GIF `<input>` block with the same picker/preview markup from Task 4 Step 2, and simplify its `hasGif` to `attachment === 'gif' && gifUrl.trim().length > 0`. Remove the modal's local `isValidMediaUrl`/`IMAGE_EXT_REGEX` if now unused.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

Open the full-screen compose modal, repeat Task 4 Step 5's checks.

- [ ] **Step 5: Commit**

```bash
git add components/feed/ComposeModal.tsx
git commit -m "feat(gif): GifPicker in ComposeModal"
```

---

### Task 6: GIF support when editing a post

**Files:**
- Modify: `lib/rmhark-schema.ts` (add `editRMHarkSchema`)
- Test: `lib/__tests__/rmhark-schema.test.ts` (add cases)
- Modify: `app/routes/api/rmharks/$id.ts` (PATCH handler ~196-245)
- Modify: `components/feed/EditPostModal.tsx`

**Interfaces:**
- Consumes: `gifUrlSchema` (already defined in `lib/rmhark-schema.ts`), `GifPicker`, `GifEmbed`.
- Produces:
  - `editRMHarkSchema` = `z.object({ content: z.string().max(MAX_RMHARK_LENGTH).optional().default(""), gifUrl: gifUrlSchema.nullish() })` exported from `lib/rmhark-schema.ts`.
  - PATCH `/api/rmharks/$id` accepts optional `gifUrl` (string | null) and persists it.

- [ ] **Step 1: Write the failing schema test**

Add to `lib/__tests__/rmhark-schema.test.ts`:

```ts
import { editRMHarkSchema } from "@/lib/rmhark-schema";

describe("editRMHarkSchema", () => {
  it("accepts content with a tenor gifUrl", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: "https://media.tenor.com/x/full.gif" });
    expect(r.success).toBe(true);
  });
  it("accepts null gifUrl (removing a gif)", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: null });
    expect(r.success).toBe(true);
  });
  it("rejects a non-media gifUrl", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: "https://evil.example/page" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/rmhark-schema.test.ts`
Expected: FAIL — `editRMHarkSchema` is not exported.

- [ ] **Step 3: Add the schema**

In `lib/rmhark-schema.ts`, after `createRMHarkSchema`, add:

```ts
export const editRMHarkSchema = z.object({
  content: z
    .string()
    .max(MAX_RMHARK_LENGTH, `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`)
    .optional()
    .default(""),
  // null clears an existing GIF; undefined leaves it unchanged.
  gifUrl: gifUrlSchema.nullish(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/rmhark-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the PATCH handler**

In `app/routes/api/rmharks/$id.ts`, replace the manual content parsing in the PATCH handler (~205-209) with schema validation that also handles `gifUrl`. The current body read is `const content = typeof body.content === "string" ? body.content.trim() : "";`. Replace the parse + validation lead-in with:

```ts
    const parsed = editRMHarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const content = parsed.data.content.trim();
    const gifUrlProvided = Object.prototype.hasOwnProperty.call(body, "gifUrl");
    const nextGifUrl = parsed.data.gifUrl ?? null;
```

Add the import at the top: `import { editRMHarkSchema, MAX_RMHARK_LENGTH } from "@/lib/rmhark-schema";` (merge with the existing `MAX_RMHARK_LENGTH` import).

Update the "must have content" guard: a post may now be text-only OR gif-only. Replace the empty-content rejection (~206-210) so it only rejects when BOTH are empty:

```ts
    if (!content && !(gifUrlProvided ? nextGifUrl : existingHasGif)) {
      return Response.json({ error: "Post cannot be empty" }, { status: 400 });
    }
```

To know `existingHasGif`, extend the `select` at ~215 to include `gifUrl: true`, then before the guard: `const existingHasGif = !!existing.gifUrl;`.

Update the unchanged-check (~223) and the `prisma.rMHark.update` (~230-231) to include the GIF:

```ts
    if (existing.content === content && (!gifUrlProvided || existing.gifUrl === nextGifUrl)) {
      return Response.json({ success: true, content, gifUrl: existing.gifUrl ?? undefined, editedAt: null });
    }

    const editedAt = new Date();
    await prisma.$transaction([
      prisma.rMHarkEdit.create({ data: { rmheetId: id, content: existing.content } }),
      prisma.rMHark.update({
        where: { id },
        data: { content, editedAt, ...(gifUrlProvided ? { gifUrl: nextGifUrl } : {}) },
      }),
    ]);
```

And include `gifUrl` in the success response (~245): `return Response.json({ success: true, content, gifUrl: gifUrlProvided ? nextGifUrl ?? undefined : existing.gifUrl ?? undefined, editedAt: editedAt.toISOString() });`

> Note: keep the existing `$transaction`/broadcast shape; only the fields above change. If the existing code uses `prisma.$transaction([...])` already (it does at ~229-231), edit those array entries in place rather than re-declaring.

- [ ] **Step 6: Add the picker to EditPostModal**

In `components/feed/EditPostModal.tsx`:
- Import: `import { GifPicker } from './GifPicker';` and `import { GifEmbed } from './GifEmbed';`.
- Add state seeded from the post being edited: `const [gifUrl, setGifUrl] = useState<string>(post.gifUrl ?? '');` (use the modal's existing prop name for the post; check via `grep -n "function EditPostModal\|props\|content\|post" components/feed/EditPostModal.tsx`).
- Render, below the content textarea, a GIF section mirroring Task 4 Step 2's preview/picker (reuse the same markup; `onSelect={(u) => setGifUrl(u)}`).
- In the save handler (the `fetch(... method: 'PATCH' ... body: JSON.stringify({ content: trimmed }))` at ~34), include the GIF: `body: JSON.stringify({ content: trimmed, gifUrl: gifUrl.trim() || null })`.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Manual check**

Edit a post: add a GIF where there was none, swap it, and remove it; confirm each persists after reload.

- [ ] **Step 9: Commit**

```bash
git add lib/rmhark-schema.ts lib/__tests__/rmhark-schema.test.ts app/routes/api/rmharks/\$id.ts components/feed/EditPostModal.tsx
git commit -m "feat(gif): edit posts can add/swap/remove a GIF"
```

---

### Task 7: GIFs in comments (picker + inline render)

**Files:**
- Modify: `components/feed/CommentThread.tsx` (reply input — add GIF button + picker)
- Modify: `components/feed/CommentItem.tsx` (reply input + render embed)

**Interfaces:**
- Consumes: `GifPicker`; `extractMediaEmbeds`, `stripEmbedUrls`, default `ChatMediaEmbed` from `@/components/shared/ChatMediaEmbed`; existing `RMHarkContent`.
- Produces: none. The GIF rides in the comment's `content` (a URL), so the POST body (`{ content }`) is unchanged.

UI wiring + reuse of an already-shipped renderer; verified by typecheck/lint + manual.

- [ ] **Step 1: Render GIFs inside comments**

In `components/feed/CommentItem.tsx`, the comment body renders at ~302:
`<RMHarkContent text={comment.content} className="..." />`.
Replace with a media-aware render that strips embed URLs from the text and shows the embed below. Add imports at the top:

```tsx
import ChatMediaEmbed, { stripEmbedUrls, extractMediaEmbeds } from '@/components/shared/ChatMediaEmbed';
```

Replace the single `RMHarkContent` line with:

```tsx
                  <RMHarkContent text={stripEmbedUrls(comment.content)} className="text-sm text-site-text mt-0.5 whitespace-pre-wrap break-words" />
                  {extractMediaEmbeds(comment.content).length > 0 && (
                    <ChatMediaEmbed content={comment.content} themePrefix="site" />
                  )}
```

> Verify `ChatMediaEmbed`'s prop names with `grep -n "function ChatMediaEmbed\|themePrefix\|content" components/shared/ChatMediaEmbed.tsx` and match them exactly (it takes `content` and a theme prefix). If the prop is named differently, use the actual name.

- [ ] **Step 2: Add a GIF button to the comment reply input**

In the reply composer (find it with `grep -n "replyContent\|setReplyContent\|reply.*input\|textarea" components/feed/CommentItem.tsx components/feed/CommentThread.tsx`), add a small GIF button and a toggleable picker. Add state near the other reply state: `const [showGifPicker, setShowGifPicker] = useState(false);` and import `GifPicker` + an icon `import { Image as ImageIcon } from 'lucide-react';`.

Near the reply submit button, add:

```tsx
                <button
                  type="button"
                  onClick={() => setShowGifPicker((v) => !v)}
                  aria-label={t("add-gif-aria", { defaultValue: "Add a GIF" })}
                  className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
```

And render the picker conditionally above/below the input:

```tsx
              {showGifPicker && (
                <GifPicker
                  className="mt-2"
                  onClose={() => setShowGifPicker(false)}
                  onSelect={(u) => {
                    setReplyContent((c) => (c ? `${c} ${u}` : u));
                    setShowGifPicker(false);
                  }}
                />
              )}
```

> Use the actual reply-content state setter name found via grep (e.g. `setReplyContent`). The picker appends the GIF URL to the comment text; `stripEmbedUrls` (Step 1) removes it from the displayed text while `ChatMediaEmbed` renders it.

- [ ] **Step 3: Apply the same reply-input change in CommentThread if it has its own composer**

If `CommentThread.tsx` renders the top-level comment composer (not just `CommentItem`), repeat Step 2 there using its content state setter.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Manual check**

Add a GIF to a comment via the picker; confirm the comment shows the GIF inline and the raw `https://media.tenor.com/...` URL is NOT visible in the text.

- [ ] **Step 6: Commit**

```bash
git add components/feed/CommentItem.tsx components/feed/CommentThread.tsx
git commit -m "feat(gif): GIF picker + inline render in comments"
```

---

### Task 8: GIF picker in rmhtube chat

**Files:**
- Modify: `components/rmhtube/ChatPanel.tsx`

**Interfaces:**
- Consumes: `GifPicker`. rmhtube already renders GIFs via its `ChatMediaEmbed` (line ~418) — no render change.
- Produces: none. GIF URL is appended to the message `content`.

- [ ] **Step 1: Add picker state + import**

In `components/rmhtube/ChatPanel.tsx`, import `import { GifPicker } from '@/components/feed/GifPicker';` and an icon `import { Image as ImageIcon } from 'lucide-react';` (merge with the existing lucide import). Add `const [showGifPicker, setShowGifPicker] = useState(false);` near the other input state.

- [ ] **Step 2: Add a GIF button + picker to the chat input form**

In the input `<form>` (~547-570), add a GIF toggle button before the submit button:

```tsx
        <button
          type="button"
          onClick={() => setShowGifPicker((v) => !v)}
          aria-label={t("add-gif-aria", { defaultValue: "Add a GIF" })}
          className="shrink-0 rounded-lg px-2 py-2 text-(--rmhtube-text-dim) hover:text-(--rmhtube-accent) transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
        </button>
```

Above the form, render the picker when open:

```tsx
      {showGifPicker && (
        <div className="px-1.5 pb-2">
          <GifPicker
            onClose={() => setShowGifPicker(false)}
            onSelect={(u) => {
              setMessage((m) => (m ? `${m} ${u}` : u));
              setShowGifPicker(false);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        </div>
      )}
```

> Uses the existing `message`/`setMessage` state and `inputRef` (confirmed in ChatPanel). The send path already trims and posts `content`; `ChatMediaEmbed` already auto-embeds the Tenor URL.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

In an rmhtube watch room, open the GIF picker, pick a GIF, send; confirm it renders inline.

- [ ] **Step 5: Commit**

```bash
git add components/rmhtube/ChatPanel.tsx
git commit -m "feat(gif): GIF picker in rmhtube chat"
```

---

### Task 9: GIF picker + inline render in DMs

**Files:**
- Modify: `components/feed/ConversationView.tsx`

**Interfaces:**
- Consumes: `GifPicker`; `ChatMediaEmbed`, `stripEmbedUrls`, `extractMediaEmbeds` from `@/components/shared/ChatMediaEmbed`.
- Produces: none. DMs currently render `content` as plain text and do NOT auto-embed — this task adds both the picker and the render path.

- [ ] **Step 1: Render media in DM messages**

In `components/feed/ConversationView.tsx`, find where a message's `content` is rendered (grep `grep -n "msg.content\|content}" components/feed/ConversationView.tsx`). Add imports:

```tsx
import ChatMediaEmbed, { stripEmbedUrls, extractMediaEmbeds } from '@/components/shared/ChatMediaEmbed';
```

Wrap the message text so embed URLs are stripped and rendered as media. Replace the plain `{msg.content}` render with:

```tsx
                  <span className="whitespace-pre-wrap break-words">{stripEmbedUrls(msg.content)}</span>
                  {extractMediaEmbeds(msg.content).length > 0 && (
                    <ChatMediaEmbed content={msg.content} themePrefix="site" />
                  )}
```

> Match `ChatMediaEmbed`'s actual prop names (verify via grep as in Task 7). Keep the existing message-bubble wrapper element; only the inner content render changes.

- [ ] **Step 2: Add the GIF picker to the DM input**

The DM composer uses `input`/`setInput` and `inputRef` (a `<textarea>`, confirmed ~35/43/291). Import `GifPicker` + `import { Image as ImageIcon } from 'lucide-react';`, add `const [showGifPicker, setShowGifPicker] = useState(false);`, add a GIF toggle button next to the send button, and render the picker when open:

```tsx
      {showGifPicker && (
        <GifPicker
          className="mx-2 mb-2"
          onClose={() => setShowGifPicker(false)}
          onSelect={(u) => {
            setInput((m) => (m ? `${m} ${u}` : u));
            setShowGifPicker(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      )}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

Open a DM conversation, pick a GIF, send; confirm it renders inline and the raw URL is hidden.

- [ ] **Step 5: Commit**

```bash
git add components/feed/ConversationView.tsx
git commit -m "feat(gif): GIF picker + inline render in DMs"
```

---

### Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run all affected unit tests**

Run: `pnpm exec vitest run lib/__tests__/tenor.test.ts lib/__tests__/gif-search.test.ts lib/__tests__/rmhark-schema.test.ts`
Expected: PASS, all green.

- [ ] **Step 2: Typecheck + lint the whole project**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build completes without errors.

- [ ] **Step 4: End-to-end manual sweep** (dev server, `TENOR_API_KEY` set)

Confirm GIF insert works in: feed ComposeBox, ComposeModal, EditPostModal (add/swap/remove), a comment, an rmhtube chat, and a DM. Then unset `TENOR_API_KEY`, restart, and confirm every picker hides itself and posting/commenting/chatting still works (graceful degradation).

- [ ] **Step 5: Commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(gif): verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** endpoint (Task 1–2), picker (Task 3), posts (Task 4–5), edit (Task 6), comments (Task 7), rmhtube chat (Task 8), DMs (Task 9), env + graceful degradation (Task 1 + endpoint + picker `error==='unavailable'`), Tenor attribution (Task 3), rate limiting (Task 2). All spec sections map to a task.
- **Type consistency:** `TenorGif` defined in Task 1, consumed (type-only) in Tasks 2–3; `buildTenorRequestUrl`/`normalizeTenorResponse` names match across Tasks 1–2; `buildGifSearchPath` Task 3 matches its test; `editRMHarkSchema` Task 6 matches its test and route import; `GifPicker` prop `onSelect(url:string)` is identical across Tasks 4–9.
- **No placeholders:** every code step shows real code; grep-to-confirm notes are for prop/state names that vary by file and must be matched exactly, not invented.
