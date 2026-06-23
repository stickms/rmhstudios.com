# Bot Mention Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bot accounts reply when their `@handle` is mentioned on the RMHark feed (posts and comments), and fix the existing bug where `@mentions` inside comments notify no one.

**Architecture:** Mentions already create persisted `MENTION` notification rows (posts do; comments don't yet). We extract a shared `notifyMentions` helper, wire it into the comment route to close the human-side gap, and add a `reactToMentions` tick to the bot-worker that consumes unread `MENTION` notifications addressed to bot users and replies in-context via the worker's existing reply generators. Loop-prevention logic is a pure, unit-tested module mirroring `dm-policy.ts`.

**Tech Stack:** TypeScript, TanStack Start (file routes), Prisma/PostgreSQL, Vitest, DeepSeek (via the existing `lib/rmhark-ai` generators). The bot-worker is a standalone Node process (`server/bot-worker/index.ts`).

## Global Constraints

- **Best-effort notifications:** notification/SSE fan-out must NEVER fail the originating post/comment write. All such code stays inside `try/catch` that only logs (existing convention in `lib/notifications.server.ts`).
- **No DB schema changes.** Reuse the `Notification.read` flag as the bot's processed-marker.
- **Graceful no-op when unconfigured:** the bot-worker already idles when `DEEPSEEK_API_KEY` is unset (`isRmharkAIConfigured()` gate in `startup()`); the new tick lives behind that same gate.
- **Env knobs** use the existing `intEnv` helper in `server/bot-worker/index.ts` and are documented in `.env.example`.
- **Pure decision logic** goes in a side-effect-free module (no Prisma/IO), like `lib/rmhark-ai/dm-policy.ts`, so it is unit-testable.
- **Mention parsing** is `parseHandles` from `lib/feed/mentions.ts` (regex, dedupe, cap 10). Do not reimplement it.
- **Architectural boundary (important):** bot-authored posts/comments are written directly through Prisma in the worker, NOT through the API routes — so they never run `notifyMentions` and never create `MENTION` notifications. Consequently the mention queue contains only **human- and admin-authored** mentions. The bot↔bot depth cap is therefore defensive/future-proofing, not a hot path. Keep it (it honors the approved spec) but do not expect it to fire in the current architecture.

---

### Task 1: Shared `notifyMentions` helper + comment-mention notifications

Close the human-side gap: `@mentions` inside comments currently notify nobody (`app/routes/api/rmharks/$id/comment.ts` never parses handles). Extract the post route's inline mention logic into a reusable server helper, use it in both routes. Posts tag the notification `entityType: "rmhark"`; comments tag it `entityType: "comment"` so Task 3 can tell where the mention lives.

**Files:**
- Create: `lib/feed/notify-mentions.server.ts`
- Modify: `app/routes/api/rmharks.ts:266-320` (replace inline block with helper call)
- Modify: `app/routes/api/rmharks/$id/comment.ts:169-216` (add helper call inside the existing notification `try`)

**Interfaces:**
- Produces: `notifyMentions(input: NotifyMentionsInput): Promise<void>` where
  ```ts
  interface MentionAuthor { id: string; name: string | null; image: string | null; handle: string | null }
  interface NotifyMentionsInput {
    content: string;                          // text to scan for @handles
    author: MentionAuthor;                    // who wrote it (never self-notified)
    postId: string;                           // RMHark the mention lives on (SSE deep-link target)
    entityType: "rmhark" | "comment";         // what the persisted notification points at
    entityId: string;                         // postId for posts, commentId for comments
    link: string;                             // notification navigation target (a post permalink)
    timestamp: string;                        // ISO timestamp for the SSE event
  }
  ```
- Consumes: `parseHandles` (`lib/feed/mentions.ts`), `createNotification` (`lib/notifications.server.ts`), `feedEventBus` (`lib/feed-sse.ts`), `prisma` (`lib/prisma.server`).

- [ ] **Step 1: Create the shared helper**

Create `lib/feed/notify-mentions.server.ts`:

```ts
/**
 * Shared @mention fan-out for feed writes (posts and comments).
 *
 * Resolves the @handles in a block of user text to users, then sends each a
 * persisted MENTION notification plus a live SSE toast (excluding the author /
 * self). Posts pass entityType "rmhark"/postId; comments pass entityType
 * "comment"/commentId so the bot-worker can tell where the mention lives and
 * reply in the right place.
 *
 * Best-effort: callers MUST wrap this in try/catch so a notification failure
 * never breaks the originating write.
 */

import { prisma } from "@/lib/prisma.server";
import { feedEventBus } from "@/lib/feed-sse";
import { createNotification } from "@/lib/notifications.server";
import { parseHandles } from "@/lib/feed/mentions";

export interface MentionAuthor {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

export interface NotifyMentionsInput {
  content: string;
  author: MentionAuthor;
  postId: string;
  entityType: "rmhark" | "comment";
  entityId: string;
  link: string;
  timestamp: string;
}

export async function notifyMentions(input: NotifyMentionsInput): Promise<void> {
  const handles = parseHandles(input.content);
  if (handles.length === 0) return;

  const mentioned = await prisma.user.findMany({
    where: {
      id: { not: input.author.id }, // never self-notify
      OR: handles.map((h) => ({ handle: { equals: h, mode: "insensitive" as const } })),
    },
    select: { id: true },
  });
  if (mentioned.length === 0) return;

  // Live toast for any mentioned user with an open stream.
  feedEventBus.publish({
    type: "notification.mention",
    rmharkId: input.postId,
    payload: { id: input.postId },
    timestamp: input.timestamp,
    authorId: input.author.id,
    targetUserIds: mentioned.map((m) => m.id),
    notification: {
      rmharkId: input.postId,
      preview: input.content.slice(0, 120),
      author: {
        id: input.author.id,
        name: input.author.name,
        image: input.author.image,
        handle: input.author.handle,
      },
    },
  });

  // Persist so it appears in the notification center — and, for bot recipients,
  // becomes the bot-worker's mention work queue.
  await Promise.all(
    mentioned.map((m) =>
      createNotification({
        userId: m.id,
        actorId: input.author.id,
        type: "MENTION",
        entityType: input.entityType,
        entityId: input.entityId,
        preview: input.content,
        link: input.link,
      })
    )
  );
}
```

- [ ] **Step 2: Refactor the post route to use the helper**

In `app/routes/api/rmharks.ts`, replace the entire mention block (the `try { ... } catch (err) { console.error("Mention notification error:", err); }` spanning lines 266-320) with:

```ts
    // Notify mentioned users (persisted MENTION notification + live SSE toast).
    // Best-effort: never let notification fan-out fail the post creation.
    try {
      const author = item.user;
      if (author) {
        await notifyMentions({
          content: rmhark.content,
          author: {
            id: author.id,
            name: author.name ?? null,
            image: author.image ?? null,
            handle: author.handle ?? null,
          },
          postId: item.id,
          entityType: "rmhark",
          entityId: item.id,
          link: `/u/${author.handle ?? author.id}/post/${item.id}`,
          timestamp: item.createdAt,
        });
      }
    } catch (err) {
      console.error("Mention notification error:", err);
    }
```

Then add the import near the other `@/lib` imports at the top of the file:

```ts
import { notifyMentions } from "@/lib/feed/notify-mentions.server";
```

- [ ] **Step 3: Wire the helper into the comment route**

In `app/routes/api/rmharks/$id/comment.ts`, add the import near the top (next to the existing `createNotification` import):

```ts
import { notifyMentions } from "@/lib/feed/notify-mentions.server";
```

Then, inside the existing notification `try` block, immediately AFTER the post-owner `COMMENT` notification (after the block that ends at line 213, before the closing `} catch (e) {`), add:

```ts
      // Also notify anyone @mentioned in the comment body (parity with posts;
      // this also feeds the bot-worker mention queue). `postLink` is defined
      // whenever the post exists.
      if (post && postLink) {
        await notifyMentions({
          content: comment.content,
          author: {
            id: comment.user.id,
            name: comment.user.name ?? null,
            image: comment.user.image ?? null,
            handle: comment.user.handle ?? null,
          },
          postId: id,
          entityType: "comment",
          entityId: comment.id,
          link: postLink,
          timestamp: comment.createdAt.toISOString(),
        });
      }
```

(`comment.user` is already selected via `userDisplaySelect` in the create call; `postLink` and `post` are already in scope from the existing block.)

- [ ] **Step 4: Remove the now-unused import in the post route**

In `app/routes/api/rmharks.ts`, `parseHandles` was only used by the block you replaced. Delete its import line:

```ts
import { parseHandles } from "@/lib/feed/mentions";
```

Leave `createNotification` and `feedEventBus` imports alone unless lint reports them unused (the post route still publishes `rmhark.created` via `feedEventBus`).

- [ ] **Step 5: Lint the changed files**

Run: `pnpm lint`
Expected: PASS with no new errors. In particular, no `no-unused-vars` for `parseHandles`/`createNotification` in `rmharks.ts`. If lint flags a still-unused import, remove it.

- [ ] **Step 6: Manual verification**

Start the app (`pnpm dev`) and, as a logged-in user:
1. Post `hey @someExistingHandle` → confirm that user gets a MENTION notification (unchanged behavior).
2. Comment `hey @someExistingHandle` on any post → confirm that user now ALSO gets a MENTION notification and (if they have the feed open) a toast. This is the bug fix — before this task they got nothing.
3. Mention yourself in a comment → confirm NO self-notification.

- [ ] **Step 7: Commit**

```bash
git add lib/feed/notify-mentions.server.ts app/routes/api/rmharks.ts "app/routes/api/rmharks/\$id/comment.ts"
git commit -m "feat(feed): notify @mentions in comments; extract shared notifyMentions helper"
```

---

### Task 2: Pure mention loop-cap policy (TDD)

A side-effect-free module (no Prisma, no IO) that decides whether a bot should answer a mention and computes bot↔bot chain depth. Mirrors `lib/rmhark-ai/dm-policy.ts`. Test-first.

**Files:**
- Create: `lib/rmhark-ai/mention-policy.ts`
- Test: `lib/rmhark-ai/__tests__/mention-policy.test.ts`

**Interfaces:**
- Produces:
  - `consecutiveBotDepth(tipToRootIsBot: boolean[]): number`
  - `shouldReplyToMention(opts: { actorIsBot: boolean; botChainDepth: number; maxBotMentionDepth: number }): boolean`
- Consumes: nothing (pure).

- [ ] **Step 1: Write the failing test**

Create `lib/rmhark-ai/__tests__/mention-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { consecutiveBotDepth, shouldReplyToMention } from '@/lib/rmhark-ai/mention-policy';

describe('consecutiveBotDepth', () => {
  it('counts the leading run of bot authors from the thread tip', () => {
    expect(consecutiveBotDepth([true, true, false, true])).toBe(2);
  });
  it('is 0 when the tip author is human', () => {
    expect(consecutiveBotDepth([false, true, true])).toBe(0);
  });
  it('is 0 for an empty thread', () => {
    expect(consecutiveBotDepth([])).toBe(0);
  });
  it('counts an all-bot chain fully', () => {
    expect(consecutiveBotDepth([true, true, true])).toBe(3);
  });
});

describe('shouldReplyToMention', () => {
  it('always replies to a human mention regardless of depth', () => {
    expect(
      shouldReplyToMention({ actorIsBot: false, botChainDepth: 99, maxBotMentionDepth: 3 }),
    ).toBe(true);
  });
  it('replies to a bot mention below the depth cap', () => {
    expect(
      shouldReplyToMention({ actorIsBot: true, botChainDepth: 2, maxBotMentionDepth: 3 }),
    ).toBe(true);
  });
  it('stops a bot mention at the depth cap', () => {
    expect(
      shouldReplyToMention({ actorIsBot: true, botChainDepth: 3, maxBotMentionDepth: 3 }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/rmhark-ai/__tests__/mention-policy.test.ts`
Expected: FAIL — cannot resolve `@/lib/rmhark-ai/mention-policy` (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/rmhark-ai/mention-policy.ts`:

```ts
/**
 * Pure decision logic for bot @mention replies — no Prisma, no I/O, no DeepSeek.
 * Side-effect-free so it is unit-testable, mirroring dm-policy.ts.
 */

/**
 * Given whether each comment author is a bot, walking from the thread tip (most
 * recent) toward the root, return the length of the leading run of bot authors.
 * Stops at the first human. Used to cap bot↔bot @mention ping-pong.
 *
 *   [true, true, false, true] -> 2
 *   [false, ...]              -> 0
 *   []                        -> 0
 */
export function consecutiveBotDepth(tipToRootIsBot: boolean[]): number {
  let depth = 0;
  for (const isBot of tipToRootIsBot) {
    if (!isBot) break;
    depth++;
  }
  return depth;
}

/**
 * Whether a bot should answer a mention. Humans are always answered. A mention
 * authored by a bot is answered only while the bot↔bot chain at the thread tip
 * is shorter than `maxBotMentionDepth`.
 */
export function shouldReplyToMention(opts: {
  actorIsBot: boolean;
  botChainDepth: number;
  maxBotMentionDepth: number;
}): boolean {
  if (!opts.actorIsBot) return true;
  return opts.botChainDepth < opts.maxBotMentionDepth;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/rmhark-ai/__tests__/mention-policy.test.ts`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rmhark-ai/mention-policy.ts lib/rmhark-ai/__tests__/mention-policy.test.ts
git commit -m "feat(bot): pure mention loop-cap policy (depth + should-reply)"
```

---

### Task 3: Bot-worker `reactToMentions` tick

Add a tick that consumes unread `MENTION` notifications addressed to bot users and replies in-context: a comment-mention → reply to that comment; a post-mention → top-level comment on the post. Mark each processed by setting `read = true`. Reuses the worker's existing `replyToComment`, `generateReply`, `getPersona`, and the Task 2 policy.

**Files:**
- Modify: `server/bot-worker/index.ts` (imports, env consts, `replyToPostMention`, `commentChainBotDepth`, `reactToMentions`, `mentionTick`, timer wiring, shutdown, config log)
- Modify: `.env.example` (document the new knobs)

**Interfaces:**
- Consumes: `consecutiveBotDepth`, `shouldReplyToMention` (Task 2); existing `replyToComment(botId, { id, rmheetId })`, `generateReply`, `getPersona`, `prisma`, `log`, `errlog`, `shuffle`, `intEnv` (same file); the `entityType` contract from Task 1 (`"rmhark"` = post mention, `"comment"` = comment mention).
- Produces: `reactToMentions(): Promise<number>` (count of replies made), scheduled by a new `mentionTimer`.

- [ ] **Step 1: Import the pure policy**

In `server/bot-worker/index.ts`, add to the imports near the other `@/lib/rmhark-ai` imports:

```ts
import { consecutiveBotDepth, shouldReplyToMention } from '@/lib/rmhark-ai/mention-policy';
```

- [ ] **Step 2: Add the env-tunable constants**

After the "Reply behaviour" const block (immediately after the `PROACTIVE_LOOKBACK_MS` line, ~line 87), add:

```ts
// ─── Mention-reply behaviour ────────────────────────────────────
// How often bots answer @mentions (default 60s — snappier than the post tick).
const MENTION_TICK_MS = intEnv('BOT_MENTION_TICK_MS', 60 * 1000);
// Only answer mentions whose notification is newer than this (default 24h) —
// bounds a backlog so a long-idle bot doesn't answer days of old mentions at once.
const MENTION_LOOKBACK_MS = intEnv('BOT_MENTION_LOOKBACK_MS', 24 * 60 * 60 * 1000);
// Cap mention replies created per tick (protects the DB + paid API).
const MAX_MENTION_REPLIES_PER_TICK = intEnv('BOT_MAX_MENTION_REPLIES_PER_TICK', 4);
// Stop bot↔bot @mention ping-pong: skip once this many consecutive bot-authored
// comments lead the thread (default 3). Human mentions are always answered.
// (Defensive: bot-authored content bypasses the API routes, so the queue is
// effectively human/admin mentions only — see plan's Global Constraints.)
const MAX_BOT_MENTION_DEPTH = intEnv('MAX_BOT_MENTION_DEPTH', 3);
// Min gap between a single bot's mention replies (default 30s).
const MENTION_COOLDOWN_MS = intEnv('BOT_MENTION_COOLDOWN_MS', 30 * 1000);
```

- [ ] **Step 3: Add the post-mention reply helper**

Immediately AFTER the `replyToComment` function (after its closing brace, ~line 588), add:

```ts
/**
 * Post an in-character top-level comment from `botId` onto `postId` — used when a
 * *post* @mentions the bot. Skips deleted posts and posts the bot already answered.
 */
async function replyToPostMention(botId: string, postId: string): Promise<boolean> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: {
      content: true,
      deletedAt: true,
      original: { select: { content: true } },
      comments: { where: { userId: botId }, take: 1, select: { id: true } },
    },
  });
  if (!post || post.deletedAt) return false;
  if (post.comments.length > 0) return false; // already answered this post

  const content = await generateReply({
    postContent: post.content,
    quotedPostContent: post.original?.content || undefined,
    thread: [],
    persona: await getPersona(botId),
  });
  if (!content.trim()) return false;

  await prisma.$transaction([
    prisma.rMHarkComment.create({ data: { rmheetId: postId, userId: botId, content } }),
    prisma.rMHark.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } }),
  ]);
  await prisma.user.update({ where: { id: botId }, data: { botLastPostAt: new Date() } });
  return true;
}

/**
 * Walk a comment thread tip→root collecting whether each author is a bot, then
 * return the leading run of bot authors (consecutiveBotDepth). Bounds the walk
 * so a deep thread can't stall the tick.
 */
async function commentChainBotDepth(commentId: string): Promise<number> {
  const tipToRootIsBot: boolean[] = [];
  let currentId: string | null = commentId;
  for (let i = 0; currentId && i < MAX_BOT_MENTION_DEPTH + 2; i++) {
    const node: { parentId: string | null; user: { isBot: boolean } } | null =
      await prisma.rMHarkComment.findUnique({
        where: { id: currentId },
        select: { parentId: true, user: { select: { isBot: true } } },
      });
    if (!node) break;
    tipToRootIsBot.push(node.user.isBot);
    currentId = node.parentId;
  }
  return consecutiveBotDepth(tipToRootIsBot);
}
```

- [ ] **Step 4: Add the `reactToMentions` orchestrator**

Immediately AFTER `reactToComments` (after its closing brace, ~line 645), add:

```ts
/**
 * Answer @mentions of bots. The post/comment routes persist mentions as MENTION
 * notifications; this consumes the unread ones addressed to bot users, replies
 * in-context, and marks them read (bots have no UI, so `read` is a safe
 * processed-marker). Humans are always answered; bot↔bot mention chains are
 * depth-capped so they don't ping-pong.
 */
async function reactToMentions(): Promise<number> {
  const since = new Date(Date.now() - MENTION_LOOKBACK_MS);
  const mentions = await prisma.notification.findMany({
    where: {
      type: 'MENTION',
      read: false,
      createdAt: { gte: since },
      user: { is: { isBot: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 60,
    select: {
      id: true,
      actorId: true,
      entityType: true,
      entityId: true,
      user: { select: { id: true, botPersona: true, botLastPostAt: true } },
    },
  });

  const markRead = (id: string) =>
    prisma.notification.update({ where: { id }, data: { read: true } });

  let made = 0;
  for (const n of mentions) {
    if (made >= MAX_MENTION_REPLIES_PER_TICK) break;
    const bot = n.user;
    if (!n.entityId) {
      await markRead(n.id);
      continue;
    }

    // Per-bot cooldown — leave the notification unread so it retries on a later tick.
    if (bot.botLastPostAt && Date.now() - bot.botLastPostAt.getTime() < MENTION_COOLDOWN_MS) {
      continue;
    }

    try {
      // Loop cap: how deep is the bot↔bot mention chain at the thread tip?
      const actor = n.actorId
        ? await prisma.user.findUnique({ where: { id: n.actorId }, select: { isBot: true } })
        : null;
      const actorIsBot = !!actor?.isBot;
      const depth =
        n.entityType === 'comment'
          ? await commentChainBotDepth(n.entityId)
          : actorIsBot
            ? 1 // post mention: chain is length 1 if the poster is a bot
            : 0;
      if (
        !shouldReplyToMention({
          actorIsBot,
          botChainDepth: depth,
          maxBotMentionDepth: MAX_BOT_MENTION_DEPTH,
        })
      ) {
        await markRead(n.id);
        continue;
      }

      let replied = false;
      if (n.entityType === 'comment') {
        const comment = await prisma.rMHarkComment.findUnique({
          where: { id: n.entityId },
          select: {
            id: true,
            rmheetId: true,
            deletedAt: true,
            replies: { where: { userId: bot.id }, take: 1, select: { id: true } },
          },
        });
        if (comment && !comment.deletedAt && comment.replies.length === 0) {
          replied = await replyToComment(bot.id, { id: comment.id, rmheetId: comment.rmheetId });
        }
      } else if (n.entityType === 'rmhark') {
        replied = await replyToPostMention(bot.id, n.entityId);
      }

      await markRead(n.id);
      if (replied) {
        made++;
        log(`bot ${bot.id} answered ${n.entityType} mention (${n.entityId})`);
      }
    } catch (e) {
      errlog('mention reply failed:', e);
    }
  }
  return made;
}
```

- [ ] **Step 5: Add the tick wrapper and re-entrancy guard**

After the `dmTick` function (~line 715), add:

```ts
async function mentionTick(): Promise<void> {
  personaCache.clear();
  await reactToMentions();
}
```

In the "Loops" section, alongside the other timer/flag declarations (~lines 718-725), add:

```ts
let mentionTimer: NodeJS.Timeout | undefined;
let mentionRunning = false;
```

After `safeDmTick` (~line 773), add:

```ts
async function safeMentionTick() {
  if (mentionRunning) return;
  mentionRunning = true;
  try {
    await mentionTick();
  } catch (e) {
    errlog('mention tick failed:', e);
  } finally {
    mentionRunning = false;
  }
}
```

- [ ] **Step 6: Schedule and tear down the timer**

In `startup()`, after the `dmTimer = setInterval(...)` line (~line 790), add:

```ts
  mentionTimer = setInterval(() => void safeMentionTick(), MENTION_TICK_MS);
```

Update the config log line (~line 782) to include the mention tick — change it to:

```ts
  log(
    `config: target=${TARGET_BOT_COUNT}, postTick=${POST_TICK_MS}ms, replyTick=${REPLY_TICK_MS}ms, dmTick=${DM_TICK_MS}ms, mentionTick=${MENTION_TICK_MS}ms, userCheck=${USER_CHECK_MS}ms`,
  );
```

In `shutdown()`, after `if (dmTimer) clearInterval(dmTimer);` (~line 802), add:

```ts
  if (mentionTimer) clearInterval(mentionTimer);
```

- [ ] **Step 7: Document the new env knobs**

In `.env.example`, in the bot-worker comment block, immediately AFTER the `BOT_PROACTIVE_PROB` line (the last "reply behaviour" knob, ~line 163) and before the DM knobs, add:

```
#
#   BOT_MENTION_TICK_MS              — how often bots answer @mentions (default: 60000 = 60s).
#   BOT_MENTION_LOOKBACK_MS          — only answer mentions newer than this (default: 86400000 = 24h).
#   BOT_MAX_MENTION_REPLIES_PER_TICK — cap mention replies created per tick (default: 4).
#   MAX_BOT_MENTION_DEPTH            — stop bot↔bot @mention chains past this depth (default: 3).
#   BOT_MENTION_COOLDOWN_MS          — min gap between a single bot's mention replies (default: 30000 = 30s).
```

- [ ] **Step 8: Verify the policy tests still pass**

Run: `pnpm exec vitest run lib/rmhark-ai/__tests__/mention-policy.test.ts`
Expected: PASS (Task 2's tests; unchanged).

- [ ] **Step 9: Verify the worker bundles (catches import/resolution errors)**

Run: `pnpm exec esbuild server/bot-worker/index.ts --bundle --platform=node --target=node20 --format=cjs --packages=external --tsconfig=tsconfig.server.json --outfile=/dev/null`
Expected: bundles with no resolution errors (no "Could not resolve" for `@/lib/rmhark-ai/mention-policy`).

- [ ] **Step 10: Lint the worker**

Run: `pnpm lint`
Expected: PASS with no new errors (no unused `mentionTimer`/imports, etc.).

- [ ] **Step 11: Manual verification**

With `DEEPSEEK_API_KEY` set and bots present, run `pnpm bot-worker:dev`:
1. Confirm the startup log line now shows `mentionTick=60000ms` and `Scheduled.`
2. From a human account, post `hey @<a bot's handle> what do you think?` → within ~60s the bot posts a top-level comment on that post. Verify exactly one reply (re-run a tick; it must not double-reply — the post-already-answered guard + `read=true` cover this).
3. From a human account, reply to a bot's comment with `@<that bot's handle> follow up?` → within ~60s the bot replies to that comment.
4. Check the DB: the consumed `MENTION` notifications for the bot are now `read = true`.

- [ ] **Step 12: Commit**

```bash
git add server/bot-worker/index.ts .env.example
git commit -m "feat(bot): reply to @mentions via the MENTION notification queue"
```

---

## Notes / Known boundaries

- **Queue is human/admin mentions only.** Bot posts/comments are written directly via Prisma in the worker, bypassing the API routes that run `notifyMentions`, so bot-authored `@mentions` never create `MENTION` notifications. The bot↔bot depth cap is retained as defensive/future-proofing (and honors the approved spec), but will not fire under the current architecture. If we later want bots to answer mentions inside *other bots'* content, that needs a separate worker scan (out of scope here).
- **Dedupe** relies on three guards: marking the notification `read = true` after processing, the re-entrancy flag (`mentionRunning`) preventing overlapping ticks, and the per-entity "already replied" check (`replyToPostMention` post-already-answered; the `replies` check before `replyToComment`).
- **No schema migration.** Everything derives from existing `Notification` / `RMHark` / `RMHarkComment` / `User.isBot` rows.
