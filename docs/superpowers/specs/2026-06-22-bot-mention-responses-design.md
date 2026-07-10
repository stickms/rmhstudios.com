# Bot Mention Responses (+ comment-mention notifications)

**Date:** 2026-06-22
**Status:** Approved — ready for implementation plan

## Goal

Make bot accounts **respond when their handle is @mentioned** on the public feed —
in both **top-level posts** and **comments/replies** — using the bot's existing persona
and DeepSeek reply generation. The bot replies in-thread, the same way it already replies
when someone replies directly to its own post/comment.

As a prerequisite (and standalone bug fix), make **comment/reply mentions notify humans**,
which they currently do not.

## Background / current state

- **Mention parsing** — `parseHandles(text)` in `lib/feed/mentions.ts` is the only feed
  mention parser (regex, dedupe, cap 10). Mentioned entities are `User` rows; bots are just
  `User` rows with `isBot = true` + a `botPersona`.
- **Post mentions → notifications: YES.** `app/routes/api/rmharks.ts:266-320` parses handles,
  resolves users, creates `MENTION` notifications, and fires a live SSE toast.
- **Comment mentions → notifications: NO.** `app/routes/api/rmharks/$id/comment.ts:169-216`
  only notifies the post owner (`COMMENT`) and parent-comment author (`REPLY`). It never calls
  `parseHandles`, so `@mentions` inside comments are silently dropped.
- **Bots responding to mentions: NO.** The bot-worker (`server/bot-worker/index.ts`) only
  auto-replies via `reactToComments` when someone replies **in-thread** to a bot's own
  post/comment (`targetIsBot`). There is zero handle/mention matching in the worker.
- **Reusable building blocks already exist:** `parseHandles` (`lib/feed/mentions.ts`),
  `createNotification` (`lib/notifications.server.ts`), the SSE mention event
  (`lib/feed-sse.ts`), and `generateReply` + `replyToComment` (`lib/rmhark-ai/generate.server.ts`,
  `server/bot-worker/index.ts:560`).

## Decisions (from brainstorming)

- **Scope:** bots respond to mentions in **both posts and comments**.
- **Response policy:** **always reply to a human's mention**; for bot-to-bot mention chains,
  **cap the depth** (stop after a few back-and-forths) plus a per-bot cooldown.
- **Detection:** **reuse `MENTION` notifications as the work queue.** Mentions already create
  `MENTION` notification rows for the mentioned user; bots are users, so they get these rows too.
  The worker polls for unprocessed `MENTION` notifications addressed to bot users.
- **Dedupe:** mark the bot's processed `MENTION` notification `read = true` (bots have no UI, so
  their notifications are never read by a human — this is a safe, schema-free processed-marker),
  with an "already replied to this entity" guard as backup.
- **No DB schema changes.**

## Part 1 — Human-side fix: comment mentions notify

In `app/routes/api/rmharks/$id/comment.ts`, after a comment/reply is created, mirror the
post path (`rmharks.ts:266-320`):

1. `parseHandles(content)` on the comment body.
2. Resolve handles → users (case-insensitive, excluding the comment author / self).
3. For each, `createNotification({ type: "MENTION", entityType: "rmhark", entityId: <postId>,
   link: /u/<handle>/post/<postId>, preview, actorId })` and publish the live SSE
   `notification.mention` event (same helper the post route uses).

This brings comment mentions to parity with posts, fixes the silent-drop bug for humans, **and**
produces the `MENTION` notification rows the bot-worker consumes in Part 2.

Notes:
- Reuse the existing notification-creation/SSE helpers from the post path; factor a small shared
  helper if the logic would otherwise be duplicated verbatim between `rmharks.ts` and `comment.ts`.
- `link` points at the post (optionally the comment anchor if the route supports it).

## Part 2 — Bots respond to mentions

All new logic lives in the **bot-worker** process, modeled on the existing `reactToComments`
tick. A new `reactToMentions()` orchestrator runs on its own interval (started in `startup()`,
cleared in `shutdown()`, wrapped in a re-entrancy guard like the other ticks).

### `reactToMentions()` behavior

1. **Find work.** Query `Notification` where `type = MENTION`, `read = false`, and `userId`
   belongs to an `isBot` user, ordered by `createdAt` asc, bounded `take`
   (`BOT_MAX_MENTION_REPLIES_PER_TICK`). (Join/filter on the recipient's `isBot`.)
2. **Load context** for each notification:
   - Recipient bot (the mentioned user).
   - Source entity from `entityType`/`entityId` — the `RMHark` post, and, when the mention came
     from a comment, the `RMHarkComment`.
   - The actor (`actorId`) — the human or bot who wrote the mentioning text.
3. **Loop guard (bot-to-bot depth):**
   - Actor is **human** → always proceed.
   - Actor is a **bot** → walk up the thread (comment `parent` chain, then the post author)
     counting **consecutive bot-authored ancestors**; if depth ≥ `MAX_BOT_MENTION_DEPTH`
     (default 3), **skip** (mark read, no reply). Lets bots banter a few turns then stop.
   - Per-bot **cooldown**: respect a minimum interval since the bot's last mention reply
     (reuse the existing pacing pattern / `botLastPostAt`-style gating) so one bot can't flood.
4. **Generate + post the reply** (reuse existing generation):
   - Mentioned in a **comment** → reply to that comment via `replyToComment` + `generateReply`.
   - Mentioned in a **post** → create a top-level **comment** on that post.
   - Pass the mention context (the mentioning text + thread) into the persona prompt so the reply
     is on-topic. Use `getPersona(botId)` like the other ticks.
5. **Mark processed:** set the source `MENTION` notification `read = true`. Guard with an
   "this bot already commented on this entity" check to avoid double-replies if a tick overlaps.
6. **Graceful no-op** when `DEEPSEEK_API_KEY` is unset / `isRmharkAIConfigured()` is false,
   matching the rest of the worker.

### Reply notifications

When a bot posts its reply comment, it flows through the **same comment-creation path** as any
comment, so the human it's replying to / mentions naturally get their `COMMENT`/`REPLY`/`MENTION`
notifications via Part 1. (Avoid the bot's own reply re-triggering an infinite self-loop: the
depth guard + the per-entity "already replied" check + `MENTION` self-skip in `createNotification`
cover this; verify a bot replying does not enqueue a new actionable mention for itself.)

## Loop / spam safety summary

Bounded entirely by: the human-vs-bot actor check, `MAX_BOT_MENTION_DEPTH`, the per-bot cooldown,
the per-tick cap, and the "already replied to this entity" guard. No schema migration; all state
derived from existing `Notification` / `RMHark` / `RMHarkComment` / `User.isBot` rows.

## New environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `BOT_MENTION_TICK_MS` | `60000` (60s) | How often the mention tick runs. |
| `BOT_MAX_MENTION_REPLIES_PER_TICK` | `4` | Cap mention replies per tick. |
| `MAX_BOT_MENTION_DEPTH` | `3` | Max consecutive bot-to-bot mention replies in a thread before stopping. |
| `BOT_MENTION_COOLDOWN_MS` | `30000` (30s) | Min interval between a single bot's mention replies (per bot). |

(Added to `.env.example` in the existing bot-worker / AI section style. Like `DEEPSEEK_API_KEY`,
the feature degrades to a no-op when keys are absent. Knobs use the existing `intEnv` helper.)

## Files touched

- `app/routes/api/rmharks/$id/comment.ts` — parse handles + create `MENTION` notifications + SSE
  (Part 1). Possibly a small shared helper extracted from `rmharks.ts`.
- `server/bot-worker/index.ts` — new `reactToMentions` tick, timer wiring, loop guard.
- `.env.example` — new knobs.
- Reuses (no change expected): `lib/feed/mentions.ts`, `lib/notifications.server.ts`,
  `lib/feed-sse.ts`, `lib/rmhark-ai/generate.server.ts`.

## Testing

- **Comment-mention notifications (Part 1):** unit/integration test that creating a comment with
  `@handle` resolves the user, creates a `MENTION` notification, excludes self, and respects the
  `MAX_MENTIONS` cap; verify the SSE event is published.
- **Loop guard (pure function):** extract the depth/actor decision into a pure predicate over
  (actor isBot, ancestor-author chain) → "should reply?"; cover human-actor always-reply,
  bot depth below cap replies, bot depth ≥ cap skips.
- **Dedupe:** processed notification is marked read; a second tick over the same notification
  does not produce a second reply ("already replied to this entity" guard).
- **Reply placement:** mention in a post → bot creates a top-level comment on that post; mention
  in a comment → bot replies to that comment.
- **No-op when unconfigured:** tick is a graceful no-op when `DEEPSEEK_API_KEY` is unset.
- Manual: from a human account, `@mention` a bot in a post and in a comment → the bot replies
  in-persona within a tick; mention one bot from another and confirm the chain stops at the cap.

## Out of scope

- Schema changes / dedicated mention-processed columns (deliberately avoided — `read` flag reused).
- Changing the existing in-thread `reactToComments` behavior.
- Mentions outside the RMHark feed (rmhtube watch-party, Discord bot).
- Cross-replica SSE delivery guarantees (pre-existing limitation, unrelated).
