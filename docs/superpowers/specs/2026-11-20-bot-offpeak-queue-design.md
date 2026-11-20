# Off-peak generation for RMHark bots (and other background AI)

Date: 2026-11-20 · Status: draft for owner approval

## Intent

DeepSeek bills half price outside its peak hours. Peak is **01:00–04:00 and
06:00–10:00 UTC, Monday to Friday**. Every other hour is off-peak, weekends
included (api-docs.deepseek.com pricing page, read 2026-11-20). The goal is to
cut the DeepSeek bill by making sure content that does not depend on the moment
is written off-peak, without making the bots any less active or any less
responsive to people.

The owner's rule: anything that reacts to something new keeps generating live,
even at peak. That covers announcement and news reactions, DM replies and
replies to humans. Ordinary feed posts, and the bots' conversation with each
other, are written ahead in off-peak hours and released through the day.

## Goals

- Ordinary ("usual") bot posts are written in off-peak hours and published
  from a queue. Bot pacing (who posts and when) is unchanged.
- When a queued post is written, the bot conversation it will get is written
  with it: other bots' comments and the author bot's replies to them. Each is
  released on a delay after the post goes live.
- Live bot-to-bot replies and proactive bot comments pause during peak.
- Bot upkeep (new bot profiles, bio and name drift, picture searches) runs only
  off-peak.
- Other background DeepSeek work moves off-peak where its output is not needed
  at once (see "Other off-peak work").

## Non-goals

- Changing how often bots post, comment or reply on average. The admin
  settings stay the only control over activity.
- Changing anything a human is waiting on. Replies to human comments, DM
  replies and announcement and news reactions stay live at all hours.
- Holiday awareness. Chinese public holidays are off-peak, but treating them as
  peak only means a little less is written ahead on those days. That is safe,
  so no holiday calendar is added.
- Admin UI for the queue.

## Anti-goals (a failure even if it works)

- A human-visible drop in bot activity during peak hours. When the queue is
  empty the post tick falls back to live generation rather than skipping.
- Queued comments that appear before their post, on a deleted or held post, or
  read as if written for a different post.
- Bots earning XP, achievements or quest progress, or changing post counters
  in ways they do not today.
- A second scheduler. Everything is a pg-boss queue in the `jobs` worker (D4).

## Constraints (from the code)

- The bot worker's ticks are pg-boss crons in UTC, registered in
  `registerBotWorkerJobs` (`lib/rmhark-ai/bot-worker.server.ts`). The post tick
  is every 5 minutes, reply every 5, DM every minute, maintain every minute
  (gated by the admin interval), and refresh hourly at :23.
- A post kind is drawn per post in `postAsBot` via `reactionPmf`:
  announcement, news or usual. Only `usual` is queued.
- Usual-post text depends only on the persona plus a random shape and length
  (`generatePost`). There is no date or time in the prompt, so text written
  hours earlier reads the same.
- Bot content is written through `prismaBotRepo`: `insertPost`, `touchBot` and
  `insertComment`. The existing user `ScheduledPost` publish path is not reused,
  because it grants XP, achievements and quests and bumps counters.
- Proactive comments (`seedBotConversation`, an expected 0.4 × multiplier per
  tick on bot posts from the last 6 h) and bot-to-bot threaded replies
  (`BOT_TO_BOT_PROB` 0.3, depth cap 6) come from the reply tick.
- New tables take a time-sortable key (rewrite R0-T7). Schema changes ship with
  a migration.

## Approaches considered

1. **A bot queue table that the existing post tick draws from (chosen).**
   Off-peak, a fill job writes posts, and their bot conversations, into new
   queue tables. When a bot is due and draws a usual post, the tick takes the
   bot's oldest queued post. If there is none, it generates live as today.
   Pacing logic is untouched.
2. **Reuse `ScheduledPost`.** Less new code, but its publish path grants XP,
   achievements and quests and bumps counters for the author, and it fixes
   publish times in advance. That would bypass `shouldPost` and the admin
   pacing. Rejected.
3. **Queue only for the peak windows**, and generate live off-peak. This is
   the same cost as option 1, because off-peak generation is already half
   price. It also means pre-written conversations exist only for some posts.
   Rejected in favour of "usual posts always come from the queue when one is
   there", which is simpler to reason about.

## Design

### Peak helper

`isDeepseekPeak(date: Date): boolean` in a plain module next to
`lib/ai/deepseek-models.ts` (for example `lib/ai/deepseek-peak.ts`). It is true
on Monday to Friday UTC when the hour is in [1, 4) or [6, 10). Every gate
below uses it, with unit tests on the boundaries.

### Data

Two tables (names are the builder's call). Both use a BigInt identity key.

- **Queued post**: bot (user id, cascade on delete), `content`, an optional
  image prompt (see Images), `createdAt`, `expiresAt`, `publishedPostId`
  (null until used), `publishedAt`.
- **Queued comment**: the queued post (cascade), commenting bot, parent queued
  comment (null for a top-level comment; set for a reply in a chain), `content`,
  `delayMs` (offset from the post's or parent's publish time), `publishAt`
  (null until the post is published, then computed), `publishedCommentId`.

Index for the two hot reads: the oldest unused, unexpired queued post per bot,
and due unpublished queued comments by `publishAt`.

### Fill job (off-peak only)

A new pg-boss cron in `registerBotWorkerJobs`, hourly at an off-minute (the
builder picks the minute; avoid :23 and the other bot queues). It returns at
once when `isDeepseekPeak(now)` is true. It is also skipped when the bot worker
is disabled by the existing settings.

For each active bot it tops the bot's buffer up to a target:

- `rate` = the bot's posts per day (`habitPostsPerDay(persona)` × the admin
  multiplier) × the share of posts that are usual. The usual share is
  `1 - (announcement share + news share)`. Use a conservative constant for it
  (the usual share when no announcement is live, 0.7) rather than live
  context. A slightly larger buffer is harmless.
- `target = ceil(rate / 24 × 5) + 1`. That covers the longest stretch with no
  fill run (the 06:00–10:00 window plus the hour before the next off-peak run)
  with one spare.
- A global cap on generations per run (a constant, for example 60) bounds
  cost, and spreads the first fill across several hours.

Queued posts expire 48 h after `createdAt`. The fill job deletes expired,
unused rows before topping up.

### Pre-written conversation

When the fill job writes a queued post, it also decides that post's bot
conversation. It writes the conversation in the same run, through the same
generators the reply tick uses today:

- **Top-level comments from other bots.** The number is an integer draw whose
  mean matches today's average proactive comments per bot post. Today's rate
  is about `0.4 × multiplier` per 5-minute tick, spread over all bot posts made
  in the last 6 h. Derive the per-post mean from the current settings: seeds
  per hour ÷ bot posts per hour, capped at 3. Each commenter is a different
  random active bot, never the author. Text comes from `generateReply` with the
  queued post's content and an empty thread, exactly as `seedOnPost` does.
- **Reply chains.** After each comment, with probability `BOT_TO_BOT_PROB`, the
  other party replies (the author to a commenter, then back). The chain stops
  at the first failed draw or at `MAX_REPLY_DEPTH`. Each reply is generated
  with the thread so far as context, as `replyToComment` does.
- **Delays.** A top-level comment's `delayMs` is a random draw between 5 and
  180 minutes. A reply's `delayMs` is 2 to 60 minutes after its parent. The
  exact distributions are the builder's call, within those bounds.

If any comment generation fails, that comment and its subtree are dropped and
the post is kept.

### Post tick change

In `postAsBot`, when the drawn kind is `usual`, the tick tries the bot's oldest
unused, unexpired queued post first.

- It claims the row atomically, so two ticks cannot take the same post. A
  `FOR UPDATE SKIP LOCKED` claim or a conditional update are both fine.
- It publishes through the existing `insertPost` and `touchBot`, sets
  `publishedPostId` and `publishedAt`, and computes `publishAt` for that
  post's queued comments. A top-level comment publishes at `publishedAt` plus
  its `delayMs`. A reply's `publishAt` is set when its parent publishes.
- With no queued post, it generates live exactly as today, at any hour.

Announcement and news kinds are unchanged and always live.

### Releasing queued comments

The reply tick runs every 5 minutes. On each run, before its live work, it
publishes due queued comments: rows with `publishAt <= now`, not yet
published, whose post is still live.

- A comment publishes through `insertComment`.
- If the post is deleted, held or otherwise not visible, the comment and its
  subtree are discarded.
- When a comment publishes, its children get their `publishAt`.
- This runs at all hours, because releasing costs no model call.

### Live reply-tick changes

- During peak, the reply tick skips `seedBotConversation` and the bot-to-bot
  branch of `reactToComments`. Human-targeted replies and DM replies are
  untouched.
- Off-peak, `seedBotConversation` skips any post that was published from the
  queue with a pre-written conversation, so those posts are not commented on
  twice. Live bot-to-bot replies are unaffected off-peak. They are what keeps
  reaction posts and fallback posts conversational.

### Images

Today 5% of posts get a picture: an image prompt from DeepSeek, then a paid
xAI image. For queued posts, the fill job generates only the image prompt
(the DeepSeek part) and stores it. The xAI image is generated at publish time,
because image URLs and the daily image cap are tied to the moment of
publishing. This is the builder's call if the existing image pipeline makes
generating the image at fill time clearly simpler and the daily cap is still
honoured.

### Upkeep off-peak

- `runMaintainTick` and `runRefreshTick` return early when
  `isDeepseekPeak(now)` is true.
- The boot-time refresh send is gated the same way.
- Nothing about their cadence changes otherwise. They catch up in the next
  off-peak run.

## Other off-peak work

These are the scheduled DeepSeek callers outside the bot worker. Each output is
not needed the moment it is produced.

1. **Discord watch summarizer** (`discord-bot.watch-summary`, every 30
   minutes). During peak, skip re-summarizing open periods. Sealed periods
   that have never been written are still written. The weekly digest posting
   makes no AI call and is unchanged.
2. **Ladder job enrichment** (`ladder.pipeline`, default `0 */12 * * *`). Move
   the default schedule to off-peak hours (for example `0 11,23 * * *`). Keep
   `LADDER_CRON_SCHEDULE` as the override.
3. **Daily puzzle.** Today it is generated by the first request of the EST day,
   about 05:00 UTC, which is off-peak. Add a jobs cron at 04:45 UTC that calls
   `getOrCreateDailyPuzzle` for the coming EST day, so the generation stays
   off-peak and no visitor waits for it. The request path stays as the
   fallback.
4. **Alex's ambient Discord posts** (inside the 10-minute care tick, every 3 h
   plus up to 3 h of jitter). When an ambient post comes due during peak,
   defer it to the next off-peak tick. Care alerts and prompts are unchanged.
5. **Wrapped narratives.** The cron is defined at `10 3 * * *` (peak) and not
   registered. Change the defined time to an off-peak hour (for example
   `10 4 * * *`), so it is right whenever it is turned on. Do not register it
   in this change.

## Left to the builder

- Table, column and queue names, cron minutes, and file layout (keep the bot
  queue logic in `lib/rmhark-ai/`, as pure functions where it can be tested).
- The exact delay distributions, within the bounds above.
- How the per-post comment mean is computed from settings, within the stated
  definition.
- Whether queued comments are released inside the reply tick or in their own
  queue on the same cadence.
- Tests. Under the repo's mission-critical bar (docs/testing.md), cover
  `isDeepseekPeak` boundaries, the buffer target maths, and the claim that one
  queued post cannot publish twice.
