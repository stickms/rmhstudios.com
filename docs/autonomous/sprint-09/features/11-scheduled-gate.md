# 11 — Scheduled posts through the same gate, once

Surface: the scheduled-post publisher (`lib/scheduled/publish.server.ts`), the drafts page, recurring threads' "Post
now". Wave 2. Namespace `scheduled-gate`.

## User story

As a moderator, I want a post that was scheduled into my community to meet the same AutoMod rules a live post meets, and
as its author I want to be told when it was held instead of finding it missing; and as a moderator pressing "Post now"
on a recurring thread, I want one thread, not two.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 08's follow-up: "site scheduled community posts never run AutoMod (`publishScheduledPost` skips holds)".
    `publishScheduledPost` checks an active community sanction (s06-01) and the image-description rule (s07-16, with a
    deduplicated `SYSTEM` notice `scheduled-alt-required`), then materialises the post under a row lock
    (`SELECT … FOR UPDATE` on `scheduled_post` where `"publishedId" IS NULL`). It never calls the community gate
    `prepareCommunityPost` (`lib/communities/post-gate.server.ts`), which a live post and the API's scheduled create
    (s08-03, "runs the full community gate, AutoMod included … a held outcome is refused") both run. So a post AutoMod
    would hold goes out live if it is scheduled.
  - AutoMod's queue is `community_mod_item` (`lib/communities/automod.server.ts`, `recordModItem`; the held post carries
    the `deletedBy` hold marker).
  - Sprint 08 09's follow-up: "'Post now' double-click posts twice (no claim)". `postRecurringNow`
    (`lib/communities/recurring.server.ts`) calls `postOccurrence` with no claim, so two quick requests post two
    threads; the cron path claims its occurrence first.
  - Publishing paths: lazily from `publishDueForUser`, the `posts.publish-scheduled` job
    (`lib/posts-plus/capsules.server.ts`), and `POST /api/scheduled/$id/publish`.
- **Decisions:**
  - **One gate at publish.** For a community post, `publishScheduledPost` runs `prepareCommunityPost` (membership,
    sanctions, flair, challenge, image descriptions, AutoMod) with the stored fields, **inside** the claim: take the row
    lock, re-check `publishedId`, run the gate, then either publish, hold, or leave the draft:
    - **allowed** → publish as today;
    - **held** → publish as a held post exactly as a live held post is created (into the mod queue with the gate's
      reason), set `publishedId`, and tell the author once: `SYSTEM` notification `scheduled-held` "Your scheduled post
      to <community> is waiting for a moderator" (label under the `s09-11` anchor);
    - **refused** (not a member any more, banned, a rule broken that the author must fix) → stays a draft and the author
      is told once with the refusal's reason (`scheduled-refused`), deduplicated on the draft id like
      `notifyAltRequired`. The existing alt-text notice keeps its key.
  - The image-description and sanction checks that already exist move into the gate's result (no double check, no change
    in outcome).
  - **The drafts page** (`/drafts`) shows a refused draft's reason as one line on its row ("Not published: you are no
    longer a member of …"), never a tinted box (D8). No column stores it: `listScheduled`
    (`lib/scheduled/list.server.ts`) reads, in one query on the member's notifications (`userId`, `type: 'SYSTEM'`,
    `entityType` in `scheduled-refused` / `scheduled-alt-required`, `entityId` in the listed draft ids), the newest
    notice per draft, and returns its preview as `blockedReason` only when the notice is newer than the draft's
    `updatedAt` — so editing the draft (01, wave 5) clears the line, and the next due pass decides again. The notice's
    dedupe is on the draft id **and** `updatedAt`, so a draft refused, edited and refused again tells the author again.
  - **Post now, once.** `postOccurrence` creates the post outside any transaction, so an advisory transaction lock
    cannot cover it. Instead `postRecurringNow` claims with one compare-and-set on the existing
    `CommunityRecurringThread.lastPostedAt`:
    `updateMany({ where: { id, communityId, OR: [{ lastPostedAt: null }, { lastPostedAt: { lt: now − 60 s } }] }, data: { lastPostedAt: now } })`.
    A count of 0 is `409 just_posted` ("This thread was posted a moment ago"); otherwise it posts. If posting fails, the
    claim is put back (`lastPostedAt` restored to the value read before) before the existing pause path runs. The "Post
    now" button disables while its request runs.
  - The site's `POST /api/scheduled/$id/publish` ("Post now" on a draft) already relies on the row lock; a double click
    returns 409 "Already published" for the second request — confirm with a test.

## Functional requirements

1. FR-1 `publishScheduledPost` runs the community gate under its lock and handles allowed / held / refused.
2. FR-2 The two notices and their labels; the drafts page reason line.
3. FR-3 The "Post now" claim and the button's busy state.
4. FR-4 Tests for each publishing path (lazy, job, publish-now).

## Non-functional requirements

- **Correctness:** the gate runs once per publish attempt, inside the lock; a held post counts as published (it is never
  re-attempted); a refused one is re-attempted on the next due pass only if the refusal can lift (a sanction ending),
  and its notice is sent once.
- **Performance:** one extra gate call per due community post.
- **Design:** the reason line is `t-meta` text on the row.

## Data model and API

- No schema change. Edits: `lib/scheduled/publish.server.ts`, `lib/scheduled/list.server.ts` (`blockedReason`),
  `lib/communities/recurring.server.ts`, the recurring "Post now" control, `components/feed/DraftsColumn.tsx` (the
  reason line only; 01 adds editing in wave 5), `components/feed/notification-labels.ts` and its test (anchor). New
  `lib/scheduled/gate.server.ts` (adapter from a stored draft to `PrepareCommunityPostInput` and back).

## Testing requirements

- Main suite `lib/scheduled/__tests__/scheduled-gate.test.ts` (mock Prisma and the gate): allowed publishes; held
  creates a held post and one notice; refused stays a draft with one notice; the alt-text outcome unchanged; two racing
  publishers produce one post.
- Main suite `lib/communities/__tests__/recurring-post-now.test.ts`: two calls within 60 s post once (the second's
  compare-and-set updates nothing and it is 409); a failed post restores `lastPostedAt`.
- Main suite `lib/scheduled/__tests__/blocked-reason.test.ts`: the reason shows for a notice newer than the draft and
  not for an older one.
- `components/feed/__tests__/notification-labels.test.ts`; existing scheduled and recurring tests stay green.

## Acceptance criteria

- [ ] A scheduled post containing a word the community's AutoMod holds lands in the mod queue at its time, not in the
      feed, and its author is told.
- [ ] A scheduled post by a member who left the community stays a draft with the reason on the drafts page.
- [ ] Double-clicking "Post now" on a recurring thread posts one thread.

## Out of scope

Running AutoMod on profile (non-community) posts, changing AutoMod rules, re-checking posts already published.
