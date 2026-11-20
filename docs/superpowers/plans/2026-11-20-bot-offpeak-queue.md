# Off-peak bot queue — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write ordinary RMHark bot posts, their bot conversations, bot upkeep
and other background DeepSeek work in DeepSeek's off-peak hours, without
changing bot activity or anything a human waits on.

**Architecture:** One peak helper (`isDeepseekPeak`) gates every deferrable job.
Two new tables hold queued posts and their pre-written comments. An hourly
off-peak fill job writes them. The existing post tick consumes queued posts
when a bot is due, and the reply tick releases queued comments on their
delays. The queue is an optional `BotDeps.queue`, so existing tests and fakes
are untouched when it is absent.

**Tech Stack:** TypeScript, Prisma 7 (Postgres), pg-boss crons in the `jobs`
worker, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-bot-offpeak-queue-design.md`

## Global Constraints

- Peak: Monday to Friday UTC, hours [1,4) and [6,10). Everything else is
  off-peak.
- Usual-post share constant: 0.7.
- Buffer target: `ceil(rate / 24 × 5) + 1`.
- Per-run generation cap (posts and comments together): 60.
- Queued posts expire 48 h after creation.
- Top-level comment delay: 5–180 min after the post. A reply's delay: 2–60 min
  after its parent.
- Pre-written top-level comments per post: an integer draw with mean
  `min(3, seedsPerHour / botPostsPerHour)`, where
  `seedsPerHour = proactiveProb × multiplier × (3_600_000 / replyTickMs)`.
- A post rate multiplier ≤ 0 means paused: no fill, no release.
- New tables use BigInt identity keys and ship with a migration. No hand edits
  to generated files.
- Every commit passes `pnpm check:consistency`, and each PR merges only on
  green CI.

## Review Focus

1. **Two post ticks overlap on one bot.** A queued post publishes at most once.
   The claim is a conditional update, tested in Task 4.
2. **A queued post's RMHark is deleted before its comments release.** The
   comments are discarded, never inserted. Tested in Task 6.
3. **A human replies inside a scripted chain.** The unreleased descendants of
   that comment are dropped. Tested in Task 6.
4. **Bots paused (multiplier 0) with a full queue.** Nothing publishes and
   nothing is written. Tested in Tasks 4 and 6.
5. **The peak boundaries at 01:00, 04:00, 06:00 and 10:00 UTC, and Monday
   versus Saturday.** Tested in Task 1.

---

## PR A: the peak helper and the off-peak gates

### Task 1: `isDeepseekPeak`

**Files:**
- Create: `lib/ai/deepseek-peak.ts`
- Test: `lib/ai/__tests__/deepseek-peak.test.ts`

**Interfaces:**
- Produces: `isDeepseekPeak(at: Date | number): boolean`

- [ ] **Test.** Peak for `2026-11-23T01:00Z`, `03:59Z`, `06:00Z` and `09:59Z`
  (a Monday). Not peak for `00:59Z`, `04:00Z`, `05:59Z` and `10:00Z`, nor for
  `2026-11-21T07:00Z` (a Saturday) or `2026-11-22T02:00Z` (a Sunday).
- [ ] **Implement** with `getUTCDay()` and `getUTCHours()`. Add a comment
  citing the pricing page and the date 2026-11-20.
- [ ] **Run** `pnpm exec vitest run lib/ai/__tests__/deepseek-peak.test.ts`.
  It passes.

### Task 2: gate upkeep and the other background jobs

**Files:**
- Modify: `lib/rmhark-ai/bot-worker.server.ts`. `runMaintainTick` and
  `runRefreshTick` return early with `isDeepseekPeak(d.now())`.
- Modify: `server/discord-bot/watch/summarizer.ts`. During peak, `summarize`
  skips periods that are not sealed. Sealed, never-written periods still run.
- Modify: `server/discord-bot/pet-service.ts`. When the ambient slot is due
  during peak, it is not consumed. The roll happens on the next off-peak tick.
- Modify: `lib/rmhladder/scheduler.ts`. The default schedule becomes
  `0 11,23 * * *`.
- Modify: `lib/wrapped/narrative.server.ts`. The defined cron becomes
  `10 4 * * *`. It stays unregistered.
- Create: a daily-puzzle prewarm job, `daily-puzzles.prewarm` at
  `45 4 * * *` UTC, registered in `server/jobs/index.ts` next to the existing
  registrations. It calls `getOrCreateDailyPuzzle` for today's America/New_York
  date key, using the same key function as the request path.
- Test: extend `lib/__tests__/bot-worker-jobs.test.ts`. With `now` at a peak
  instant, `runMaintainTick` returns false and makes no AI calls, and
  `runRefreshTick` returns 0. Off-peak, both behave as today. For the
  summarizer, add one case in its existing test file: an open period during
  peak makes no DeepSeek call.

- [ ] Write the tests and see them fail.
- [ ] Implement the gates.
- [ ] Run the affected test files, then `pnpm typecheck`. Both pass.
- [ ] Commit, push, and open PR A. Merge on green CI.

## PR B: the post queue

### Task 3: tables and repository

**Files:**
- Modify: `prisma/schema/social.prisma`. Add `BotQueuedPost` (`bot_queued_post`)
  and `BotQueuedComment` (`bot_queued_comment`).
  - `BotQueuedPost`: `id BigInt @id @default(autoincrement())`, `botId`
    (relation to User, cascade on delete), `content Text`,
    `imagePrompt Text?`, `createdAt`, `expiresAt`, `publishedPostId String?`,
    `publishedAt DateTime?`. Index `[botId, publishedAt, createdAt]`.
  - `BotQueuedComment`: `id BigInt` identity, `queuedPostId` (cascade),
    `botId` (User, cascade), `parentId BigInt?` (self relation, cascade),
    `content Text`, `delayMs Int`, `publishAt DateTime?`,
    `publishedCommentId String?`, `discardedAt DateTime?`. Index
    `[publishAt]`.
- Create: the migration `prisma/migrations/20261121000000_bot_queue/migration.sql`.
- Create: `lib/rmhark-ai/bot-queue.server.ts`. It holds the `BotQueueRepo`
  interface and `prismaBotQueueRepo`.
- Modify: `lib/rmhark-ai/bot-worker.server.ts`. Add `queue?: BotQueueRepo` to
  `BotDeps`. `defaultDeps` wires `prismaBotQueueRepo`.
- Modify: `lib/rmhark-ai/generate.server.ts` and `image.server.ts`.
  - `generatePostImage` accepts an optional `prompt`. When it is given, the
    image-prompt call is skipped.
  - Add `imagePrompt?(text: string): Promise<string>` to `BotAi`. Wire it to
    `generateImagePrompt` in `deepseekAi`.
  - `image` gains an optional third parameter, `prompt?: string`.

**Interfaces (produces), all in `bot-queue.server.ts`:**
```ts
export interface QueuedPostInput { botId: string; content: string; imagePrompt: string | null; expiresAt: Date;
  comments: QueuedCommentInput[] }
export interface QueuedCommentInput { botId: string; content: string; delayMs: number; replies: QueuedCommentInput[] }
export interface BotQueueRepo {
  pendingCounts(now: Date): Promise<Map<string, number>>;          // unpublished, unexpired, per bot
  deleteExpired(now: Date): Promise<number>;
  enqueue(p: QueuedPostInput): Promise<void>;                       // post + comment tree in one transaction
  claimNext(botId: string, now: Date): Promise<{ id: bigint; content: string; imagePrompt: string | null; hasComments: boolean } | null>;
  markPublished(id: bigint, postId: string, at: Date): Promise<void>; // also sets publishAt on top-level comments
  dueComments(now: Date, limit: number): Promise<DueComment[]>;
  markCommentPublished(id: bigint, commentId: string, at: Date): Promise<void>; // also sets children's publishAt
  discardSubtree(id: bigint, at: Date): Promise<void>;
  scriptedPostIds(postIds: string[]): Promise<Set<string>>;         // RMHark ids published from the queue with comments
}
export interface DueComment { id: bigint; botId: string; content: string; postId: string; parentCommentId: string | null;
  publishedCommentIdOfParent: string | null }
```
- `claimNext` is atomic. The pattern is an `UPDATE … SET publishedAt = now`
  on the oldest unexpired row with `publishedAt IS NULL`, filtered so that a
  second caller gets null. Use `$queryRaw` with `FOR UPDATE SKIP LOCKED`, or
  an `updateMany` on id and `publishedAt: null` that checks `count === 1`.

- [ ] Write the schema and migration, then run `pnpm exec prisma generate`.
- [ ] Implement the repository, add `queue` to `BotDeps`, and do the image
  split.
- [ ] Run `pnpm typecheck`. It passes.

### Task 4: the fill job and post-tick consumption

**Files:**
- Create: `lib/rmhark-ai/bot-queue-plan.ts`. Pure functions:
  - `bufferTarget(perDay: number): number`
  - `commentMean(cfg: BotConfig, multiplier: number, botPostsPerHour: number): number`
  - `commentDelayMs(rnd: number): number` for 5–180 min
  - `replyDelayMs(rnd: number): number` for 2–60 min
- Modify: `lib/rmhark-ai/bot-worker.server.ts`.
  - Add `runFillTick(d: BotDeps): Promise<number>`, which returns the number of
    generations. It skips when peak, when paused, or when `d.queue` is absent.
    It deletes expired rows, then tops up bots in shuffled order until the cap
    of 60. Conversations are left empty in this task.
  - Add the queue `bot-worker.fill` with cron `41 * * * *`.
  - In `postAsBot`, when the kind is `usual` and `d.queue` exists, try
    `claimNext` first. On success, publish (image through `d.ai.image(content,
    b.id, imagePrompt)` when `imagePrompt` is set), then `markPublished`, then
    `touchBot`. On null, fall back to live generation.
- Test: `lib/rmhark-ai/__tests__/bot-queue.test.ts`, with an in-memory
  `BotQueueRepo` fake:
  - `bufferTarget(10)` is `ceil(10 × 0.7 / 24 × 5) + 1`, which is 3.
  - The fill job makes no AI calls during peak or when the multiplier is 0.
  - The fill job stops at 60 generations.
  - `postAsBot` publishes the claimed queued content, with no `ai.post` call.
  - It falls back to `ai.post` when the queue is empty.
  - Two concurrent `postAsBot` calls for one bot with one queued post insert
    exactly one post from the queue.

- [ ] Write the tests and see them fail.
- [ ] Implement.
- [ ] Run the tests, typecheck, and the consistency gate.
- [ ] Commit, push, and open PR B. Merge on green CI.

## PR C: pre-written conversations

### Task 5: write conversations at fill time

**Files:**
- Modify: `runFillTick` in `bot-worker.server.ts`. For each queued post:
  - Draw a count `n` from `commentMean`, using `scaledCount`.
  - Each comment is by a distinct random bot other than the author. Its text is
    `ai.reply({ persona, postContent, quotedPostContent: '', thread: [] })` and
    its delay is `commentDelayMs`.
  - Then, while `random() < botToBotProb` and the depth is below
    `maxReplyDepth`, the other party replies. The reply text is `ai.reply` with
    the thread so far, and its delay is `replyDelayMs`.
  - A failed generation drops that subtree.
  - Every call counts toward the cap of 60.
- Test, in `bot-queue.test.ts`:
  - with `botToBotProb` 1 and depth 3, the chain alternates commenter → author
    → commenter
  - the author never comments at top level
  - a thrown reply drops only its subtree

### Task 6: release and the live reply-tick changes

**Files:**
- Modify: `bot-worker.server.ts`.
  - Add `releaseQueuedComments(d)`. It is paused at multiplier 0. Otherwise it
    takes `dueComments(now, 50)`. For each row:
    - If the post is gone (`postForReply` is null), `discardSubtree`.
    - If a human has commented under the parent since the post published,
      `discardSubtree`.
    - Otherwise `insertComment`, then `markCommentPublished`.
  - `insertComment` must return the new comment id. Change the `BotRepo`
    signature to `Promise<string>` and update `prismaBotRepo` and the test
    fakes.
  - `runReplyTick` calls `releaseQueuedComments` first, at all hours.
  - During peak, `runReplyTick` skips `seedBotConversation`, and
    `reactToComments` skips bot-authored candidates.
  - At all hours, `reactToComments` skips bot-authored candidates on scripted
    posts (`scriptedPostIds`), and `seedBotConversation` excludes scripted
    posts. Its expected count is scaled by the non-scripted share of the posts
    in its window.
- Test, in `bot-queue.test.ts`:
  - a due comment on a deleted post is discarded
  - a human reply under the parent discards the descendants
  - a reply's `publishAt` is set only after its parent publishes
  - nothing releases at multiplier 0
  - during peak, `seedBotConversation` makes no AI call and bot-to-bot replies
    are skipped, while human-targeted replies still happen
  - the seeding count on a window that is all scripted posts is 0

- [ ] Write the tests and see them fail.
- [ ] Implement.
- [ ] Run the tests, typecheck, and the consistency gate.
- [ ] Commit, push, and open PR C. Merge on green CI.
