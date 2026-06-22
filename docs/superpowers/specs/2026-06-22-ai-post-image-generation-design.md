# AI Image Generation for Posts — Design

**Date:** 2026-06-22
**Branch:** `bot-image-generation`
**Status:** Approved (brainstorming)

## Summary

Add AI image-generation to RMHark posts on two surfaces that share one core module:

1. **Bots** automatically attach an AI-generated image to ~5% of their posts.
2. **Human composer** gets a "generate image" button next to the existing ✨ AI-text
   button — available to **Starter tier and above** only.

Provider: **xAI Grok image API** (OpenAI-SDK compatible, base URL `https://api.x.ai/v1`),
default model **`grok-imagine-image`** at **$0.02/image** (cheapest tier), env-configurable.

The post model already supports images (`RMHark.imageUrls String[]`) — **no DB migration**.
Storage already exists (`putObject` / `feedImageKey` / `feedImageUrl`).

## Constraints

- **Tight budget:** ~$20 of xAI credits. Cheapest model + hard caps + kill switch.
- **Fail gracefully:** any image-gen failure must never block a post. Bots fall back to
  text-only; the human button shows a non-blocking error and the post still works.

## Components

### 1. Shared core — `lib/rmhark-ai/image.server.ts` (new)

Mirrors the existing `lib/rmhark-ai/generate.server.ts` (DeepSeek via OpenAI SDK) pattern.

- `isImageGenConfigured(): boolean` — true when `XAI_API_KEY` is set **and**
  `XAI_IMAGE_ENABLED !== 'false'` (master kill-switch).
- `generatePostImage({ text, userId }): Promise<string | null>`:
  1. **Derive prompt:** small DeepSeek chat call converts the post `text` into a concise,
     safe, literal visual prompt (reuse the existing deepseek client / `chat` helper from
     `generate.server.ts`; export it or replicate minimally). Strip/avoid unsafe content.
  2. **Budget guard:** check the global daily counter (see §2). Over cap → return `null`.
  3. **Generate:** xAI `images.generate({ model: XAI_IMAGE_MODEL ?? 'grok-imagine-image',
     prompt, n: 1 })` via an OpenAI client configured with `baseURL: 'https://api.x.ai/v1'`
     and `apiKey: XAI_API_KEY`. Read the JPG URL from `response.data[0].url`.
  4. **Re-host:** download the JPG, validate the buffer with the existing
     `validateImageBuffer` (`lib/slice-it/upload-validation.ts`), store via
     `putObject(feedImageKey(\`${userId}-${ts}-${rand}.jpg\`), buffer, 'image/jpeg')`,
     return `feedImageUrl(filename)`.
  5. **Increment** the daily counter on success.
  - **Returns `null` on ANY failure** (missing key, disabled, cap hit, API error, network
    error, invalid/oversized buffer). Never throws to callers. Errors are logged.
  - The `${userId}-` filename prefix makes the result pass `ownsFeedImageUrl` on the human
    create path.

### 2. Budget protection

- `XAI_API_KEY` — provider credential (never hardcoded; mirrors `DEEPSEEK_API_KEY`).
- `XAI_IMAGE_MODEL` — default `grok-imagine-image` ($0.02). Bump to
  `grok-imagine-image-quality` ($0.07) later if desired.
- `XAI_IMAGE_ENABLED` — master kill-switch; `false` disables all generation instantly.
- `XAI_IMAGE_DAILY_CAP` — global daily ceiling across bots + humans. **Default `50`**
  (~$1/day, ~20 days runway). Checked before every generation; over cap returns `null`
  (bots) / friendly 429 (humans).
- **Daily counter implementation:** a small persisted per-day counter (keyed by UTC date)
  so it survives bot-worker / server restarts and is shared across both processes. Reuse
  the existing rate-limit storage if it supports a global key + daily window; otherwise a
  tiny dedicated counter (DB row keyed by date, atomic increment). Fail-safe: if the
  counter read errors, treat as over-cap (deny) rather than allow.
- Per-user rate limit on the human endpoint, reusing the limiter already used by
  `app/routes/api/rmharks/ai-generate.ts`.

### 3. Bot integration — `server/bot-worker/index.ts` `postTick()`

After `content` is generated and before/within `prisma.rMHark.create`:

```ts
let imageUrls: string[] = [];
if (isImageGenConfigured() && Math.random() < BOT_IMAGE_PROBABILITY) {
  try {
    const url = await generatePostImage({ text: content, userId: bot.id });
    if (url) imageUrls = [url];
  } catch (err) {
    log('bot image gen failed', err); // never blocks the post
  }
}
await prisma.rMHark.create({
  data: { userId: bot.id, content, ...(imageUrls.length ? { imageUrls } : {}) },
});
```

- `BOT_IMAGE_PROBABILITY` — env, default `0.05`.

### 4. Human composer — endpoint + button

**New route `POST /api/rmharks/ai-image`:**
- Auth required (signed in).
- **Tier gate:** `const tier = await getUserTier(session.user.id);
  if (TIER_RANK[tier] < TIER_RANK.starter) return 403` — the established pattern from
  `app/routes/api/developer/keys/index.ts` (`hasApiAccess`).
- Per-user rate limit (same limiter as the text route).
- Body: `{ draft?: string }` (the current composer content).
- Calls `generatePostImage({ text: draft ?? '', userId })`.
- Success → `{ url }`. Failure → graceful 4xx/5xx with `{ error }` message
  (429 when over the daily cap, 503 when not configured/disabled).

**New component `components/feed/AIImageButton.tsx`:**
- Modeled on `AIGenerateButton.tsx`. Icon (e.g. `ImagePlus`/`Sparkles` with spinner while
  loading). `title="Generate an image with AI"`.
- POSTs `{ draft: content }` to `/api/rmharks/ai-image`.
- On success: `setImageUrls(prev => [...prev, url].slice(0, MAX_IMAGES))` — reuses the
  existing preview/remove strip in `ComposeBox.tsx`.
- On error: sets the existing `imageError` state (non-blocking).
- Disabled while loading or when `imageUrls.length >= MAX_IMAGES` (4).
- **Rendered only when** the current user's `tier >= starter` (see §5). Server still
  enforces the gate regardless.

Wired into `ComposeBox.tsx` next to the existing `<AIGenerateButton>` (around line 540).

### 5. Tier signal to the client

Add `tier` to better-auth's `customSession` in `lib/auth.ts`, computed via
`getUserTier(user.id)`. This surfaces the resolved `Tier` on `session.user` everywhere,
lights up the currently-unused `components/billing/TierBadge.tsx`, and lets the composer
gate the `AIImageButton` on `tier >= starter`. Server-side enforcement in the route is the
real gate; this is UX only.

## Data flow

```
Bot:   postTick() -> generatePost() (text)
                  -> [5% & configured] generatePostImage() -> imageUrls -> rMHark.create

Human: ComposeBox AIImageButton -> POST /api/rmharks/ai-image
        -> auth + tier(starter+) + rate limit + daily cap
        -> generatePostImage() -> { url } -> setImageUrls() -> normal post submit
```

`generatePostImage` internally:
```
text -> DeepSeek (visual prompt) -> xAI images.generate -> JPG url
     -> download + validate buffer -> putObject(feedImageKey) -> feedImageUrl
```

## Error handling

| Failure | Bot behavior | Human behavior |
|---|---|---|
| `XAI_API_KEY` unset / disabled | text-only post | 503 + message; post still works |
| Daily cap reached | text-only post | 429 "daily image limit reached" |
| xAI API error / timeout | text-only post (logged) | 5xx + message; post still works |
| Invalid/oversized image buffer | text-only post | error message; post still works |
| Tier < starter | n/a | 403 (button hidden client-side) |

`generatePostImage` is the single choke point that converts all of these into `null` (bot)
or a caught error (human route maps to status + message).

## Testing

- **Unit:** `generatePostImage` returns `null` when unconfigured, when over cap, and on a
  mocked xAI error; returns a `feedImageUrl` on a mocked success; daily counter increments
  only on success and blocks at the cap.
- **Route:** `POST /api/rmharks/ai-image` → 401 unauth, 403 free tier, 429 over cap, 200
  `{ url }` on success (xAI mocked).
- **Bot:** `postTick` includes `imageUrls` only when the random gate passes and gen
  succeeds; always posts text when gen returns `null`.
- **Manual:** with a real key and cap set low, confirm an image appears on a bot post and
  via the composer button; flip `XAI_IMAGE_ENABLED=false` and confirm graceful fallback.

## Relationship to the Developer API image-upload feature

A separate, concurrent feature adds a developer-API image **upload** flow
(`POST /api/v1/images` → opaque `media_id` → attach to posts, backed by a new `Media`
table and a reconciling sweep). That feature and this one are **independent**:

- **Different purpose:** that one *uploads* developer-supplied bytes; this one *generates*
  images from text via xAI.
- **No shared budget / provider:** the upload endpoint never calls xAI, so this feature's
  budget guard (daily cap / kill-switch) is self-contained.
- **No route or table collision:** distinct routes (`/api/v1/images` vs
  `/api/rmharks/ai-image`); this feature does **not** read or write the `Media` table.
- **Shared only at the storage layer:** both use `feedImageKey` / `feedImageUrl` /
  `putObject` and the `<userId>-<ts>-<rand>.<ext>` filename scheme, and both deposit
  resolved URLs into `RMHark.imageUrls`. That is the entire intersection.
- **Known gap (not a regression):** like the existing in-app uploader, AI images written
  straight to `imageUrls` have no `Media` row, so the upload feature's sweep will not
  reclaim AI images that are generated but never posted (abandoned composer). This matches
  current in-app-upload behavior and is out of scope here; a future sweep could cover it.

## Out of scope

- Multiple images per generation (always `n: 1`).
- Regeneration / prompt-editing UI (button generates once; user can remove + retry).
- Image gen for comments/replies/DMs (posts only).
- Per-user monthly quotas (global daily cap only for now).

## Cost reference

- `grok-imagine-image`: **$0.02/image** → ~1,000 images per $20.
- `grok-imagine-image-quality`: $0.07/image → ~285 images per $20.
- DeepSeek prompt-derivation step: negligible (fractions of a cent).
- Default daily cap 50 → ~$1/day max → ~20 days runway at full cap.
