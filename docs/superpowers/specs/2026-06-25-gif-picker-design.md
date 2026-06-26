# In-app GIF Picker (Tenor) — Design

**Date:** 2026-06-25
**Status:** Approved (design); ready for implementation planning
**Topic:** Let users search and insert GIFs into posts, comments, and chat from an in-app picker instead of pasting URLs.

## Problem

Today a user can only attach a GIF by **pasting a URL** (a Tenor/Giphy share link or a
direct image URL) into the compose box's "Add Image" field (`ComposeBox.tsx`). The app
already *renders* Tenor/Giphy GIFs well — `components/feed/GifEmbed.tsx` parses share and
direct-media URLs, and `components/shared/ChatMediaEmbed.tsx` auto-embeds media URLs found
in chat text. What's missing is a way to **discover and pick** a GIF in-app.

This adds a searchable GIF picker, powered by **Tenor** (Google), and wires it into every
surface that can carry a GIF.

## Provider decision

**Tenor**, not Giphy:
- Free API with a generous quota; no billing setup.
- `GifEmbed` already resolves `media*.tenor.com` and `tenor.com/view/...` URLs, so picked
  GIFs render with zero rendering changes.
- Single Google API key.

## Architecture

One picker component + one server proxy, reused across all surfaces. The picker's entire
contract is `onSelect(url: string)` — the caller decides what to do with the returned
direct GIF URL. This single abstraction is what lets posts, comments, and chat all reuse it
despite carrying GIFs differently.

### How each surface carries a GIF (existing behavior — do not change)

| Surface | Mechanism | Renderer |
|---|---|---|
| Post compose / modal | structured `gifUrl` field on the post | `GifEmbed` |
| Edit post | **not supported today** (edit only sends `content`) | — |
| Comments | only `content` is POSTed; URLs are linkified, **not** embedded | `RMHarkContent` (linkify only) |
| rmhtube chat | URL inline in message `content` | `ChatMediaEmbed` (auto-embed) |
| DMs | URL inline in `content`, but **not** auto-embedded today | plain text |

The picker returns a URL; for structured surfaces the caller sets `gifUrl`, for text
surfaces the caller inserts the URL into the message/comment text.

## Components

### 1. Server proxy — `app/routes/api/gif/search.ts`
- `GET /api/gif/search?q=<query>&pos=<cursor>`
- Empty `q` → Tenor `/v2/featured` (trending on open). Non-empty → `/v2/search`.
- Server-side call to Tenor v2 using `TENOR_API_KEY` (+ optional `TENOR_CLIENT_KEY`,
  `locale`). Key never reaches the client.
- Query params sent to Tenor: `media_filter=tinygif,gif`, `contentfilter=high` (SFW),
  `limit=24`.
- Normalizes each result to `{ id, description, preview, url, width, height }` where
  `preview` = `tinygif` URL (grid thumbnail) and `url` = `gif` URL (inserted on select).
- Returns `{ results, next }`; `next` is Tenor's pagination cursor for infinite scroll.
- Per-user rate limiting reusing the limiter pattern in
  `app/routes/api/feed/mention-search.ts` / `hashtag-search.ts`.
- If `TENOR_API_KEY` is unset: respond `503` with `{ error: "GIF search unavailable" }`.
  The picker treats this as "feature off" and hides its trigger.

### 2. Picker component — `components/feed/GifPicker.tsx`
- Props: `onSelect(url: string) => void`, optional `onClose?()`, optional `className?`.
- Behavior:
  - On open: fetch trending (`/api/gif/search` with no `q`).
  - Debounced (~300ms) search input.
  - 2-column preview grid of `preview` thumbnails (lazy-loaded `<img>`).
  - Infinite scroll via `next` cursor (IntersectionObserver sentinel).
  - Loading skeletons, empty state, error state.
  - "Powered by Tenor" attribution badge (Tenor TOS requirement).
  - i18n via `useTranslation('feed')`, matching surrounding components.
  - Click a GIF → `onSelect(result.url)` then `onClose?.()`.
- Self-contained panel; each caller positions it (popover above an input, or inline in the
  attachment area).

### 3. Env / config
- Add `TENOR_API_KEY` and `TENOR_CLIENT_KEY` to `.env.example` with comments and a link to
  the Tenor key console (Google Cloud → Tenor API). Setup is an operational step, documented
  in the spec; the feature degrades gracefully when the key is absent.

## Integration per surface

### A. Post composer — `ComposeBox.tsx` + `ComposeModal.tsx`
- Replace the gif URL `<input>` (and `isValidMediaUrl` gating) with
  `<GifPicker onSelect={(u) => setGifUrl(u)} />`.
- Show the selected GIF via the existing `GifEmbed` with a remove (×) button (already the
  pattern for the current preview).
- `gifUrl` state, `buildBody().gifUrl`, and the server endpoint are unchanged.

### B. Edit post — `EditPostModal.tsx`
- Add the picker + selected-GIF preview.
- Extend the post-update endpoint and the modal's PATCH body to accept and persist
  `gifUrl` (currently only `content` is sent). Supports add / swap / remove on existing
  posts.

### C. Comments — `CommentThread.tsx` reply box + `CommentItem.tsx` reply box + render
- Add a GIF button next to the reply input; on select, insert the URL into the comment text.
- Add an auto-embed render path: in `CommentItem`, run comment `content` through
  `extractMediaEmbeds` + `stripEmbedUrls` (from `components/shared/ChatMediaEmbed.tsx`),
  render the embed(s), and pass the stripped text to `RMHarkContent`. No comment schema
  change — the GIF rides in `content`, matching the chat pattern.

### D. Chat — `components/rmhtube/ChatPanel.tsx` + DMs `components/feed/ConversationView.tsx`
- Add the GIF button to both message inputs; insert the URL on select.
- rmhtube already renders media via `ChatMediaEmbed` — no render change.
- DMs do not auto-embed today: add the same `ChatMediaEmbed` render path
  (`extractMediaEmbeds` + `stripEmbedUrls`) to the DM message renderer.

## Error handling
- Endpoint: missing key → `503` "unavailable" (picker hides); Tenor error/timeout → `502`
  with empty results; rate limit exceeded → `429` (picker shows a brief "slow down" state).
- Picker: network/JSON failure → inline error with retry; empty results → "No GIFs found".
- Selected GIF that 404s at render time is already handled by `GifEmbed`/`ChatMediaEmbed`
  error states (broken-image fallback).

## Testing
- **Endpoint unit tests:** trending (no `q`) vs search (`q`) routing; Tenor response →
  normalized shape; missing key → 503; rate-limit path → 429. Tenor HTTP mocked.
- **Picker component tests:** renders trending on open; debounced search refetches;
  clicking a result calls `onSelect` with the `gif` URL; error and empty states render.
- **Integration smoke:** ComposeBox sets `gifUrl` from picker and submits; comment insert +
  `stripEmbedUrls` removes the raw URL from rendered text while the embed shows.
- Follow existing test conventions (vitest; see `vitest.config.ts`).

## Out of scope (YAGNI)
- Giphy as a second provider / provider toggle.
- Keeping the manual URL-paste field (the picker replaces it).
- GIF categories/emoji-trending tabs, favorites, or recently-used history.
- Animated stickers, video, or non-GIF Tenor media types.

## Rollout / phasing
Single plan, but implement in this order so the core ask lands first and de-risks the rest:
1. **Core:** endpoint + `GifPicker` + env (Section 1–3).
2. **Posts:** ComposeBox + ComposeModal (Section A).
3. **Edit / Comments / Chat / DMs:** Sections B–D, each a thin reuse of 1–2.
