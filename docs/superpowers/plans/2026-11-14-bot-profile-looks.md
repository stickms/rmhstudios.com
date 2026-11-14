# Bot profile looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give RMHark bots varied, online-sourced avatars and banners, and let their avatar, banner, bio and display name drift over time.

**Architecture:** A pure, client-safe module decides looks and drift (`bot-look.ts`); a server module searches Openverse, downloads and stores images (`stock-image.server.ts`); the bot worker gains an injectable `look` dependency, three DeepSeek text calls and an hourly `bot-worker.refresh` queue.

**Tech Stack:** TypeScript, pg-boss, Prisma, sharp, DeepSeek via the `openai` SDK, Openverse REST API.

**Spec:** `docs/superpowers/specs/2026-11-14-bot-profile-looks-design.md`

## Global Constraints

- No AI image generation anywhere in this path.
- Openverse queries use `license=cc0,pdm`, `mature=false`; every network call has a timeout; any failure returns null and is never thrown out of a tick.
- Handles are never changed. No schema migration.
- Downloads go through `safeFetch` (`lib/ssrf-guard.server.ts`), max 20 MB.

## Review Focus

- Openverse 504/timeout or 429: the tick logs and moves on; the bot keeps its current look.
- A search result whose image URL 404s or is not an image: next candidate, then null.
- A DiceBear URL with `backgroundColor=` is not treated as legacy (no endless re-upgrade loop).
- A bot under 14 days old is never refreshed.
- Replacing an image deletes only objects under our own avatar/banner prefixes.

---

### Task 1: Pure look and drift rules — `lib/rmhark-ai/bot-look.ts`

**Produces:** `rollAvatarKind(r): 'photo'|'cartoon'|'initials'`, `wantsBanner(r): boolean`,
`cartoonAvatarUrl(seed, r)`, `initialsAvatarUrl(seed)`, `isLegacyBotAvatar(url)`,
`GENERIC_AVATAR_QUERIES`, `GENERIC_BANNER_QUERIES`, `refreshPlan(input, cfg, random): RefreshPlan`.

- [ ] Test: `isLegacyBotAvatar` true for `https://api.dicebear.com/9.x/micah/svg?seed=x`, false with `&backgroundColor=`, false for initials and storage URLs; `refreshPlan` returns nothing under 14 days; returns `avatar` for a legacy avatar with `legacyUpgrade`; probabilities follow `1/(days*24)`.
- [ ] Implement; run `pnpm test lib/rmhark-ai/__tests__/bot-look.test.ts`.

### Task 2: Openverse source — `lib/rmhark-ai/stock-image.server.ts`

**Produces:** `searchStockImages(query, shape): Promise<StockCandidate[]>`, `fetchStockImage(query, shape, random): Promise<Buffer|null>`, `storeBotAvatar(userId, query, random): Promise<string|null>`, `storeBotBanner(userId, query, random): Promise<{url, sizeBytes}|null>`, `removeBotImage(url)`.

- [ ] Implement with `safeFetch`, `validateImageBuffer`, sharp cover crop (avatar), `renderBannerRendition` (banner); typecheck.

### Task 3: Text calls — `lib/rmhark-ai/generate.server.ts`

**Produces:** `generateBotImageQueries(persona, opts)`, `generateBotBio(persona, currentBio, opts)`, `generateBotNameVariant(persona, currentName, opts)`.

### Task 4: Worker wiring — `bot-worker.server.ts`, `bot-worker-config.ts`

- [ ] `createBotUser` returns the id; `createBot` applies a look through optional `d.look`.
- [ ] Repo: `botsForRefresh()`, `updateBotProfile(id, patch)`.
- [ ] `runRefreshTick(d)`, `BOT_REFRESH_QUEUE` hourly; config from env.
- [ ] Update `lib/__tests__/bot-worker-jobs.test.ts` for the fifth queue; add refresh tick tests with fakes.
- [ ] `pnpm check:consistency`, commit.
