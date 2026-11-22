# 09 — Recurring community threads

Surface: the community mod tools (`ModPanel.tsx`, a new "Recurring" tab), the
jobs worker, the community feed. Wave 2. Namespace `recurring-threads`.

## User story

As a moderator of a fifty-member art community, I want to set up "Weekly
showcase — share what you made" to post itself every Monday at 09:00 in our
time zone, so that the thread the community relies on does not depend on me
remembering, and so that the community has a rhythm when I am away.

## Requirements elicitation

- **What exists (verified):**
  - Community posts are made through the one gate: `prepareCommunityPost`
    (`lib/communities/post-gate.server.ts`, sprint 07 11) and scheduled posts
    through `publishScheduledPost` (`lib/scheduled/publish.server.ts`), which
    re-checks sanctions (`activeSanction`) and the image-description rule
    (sprint 07 16) and is published by the posts-plus due sweep
    (`lib/posts-plus/capsules.server.ts`).
  - Moderators are checked with `requireMod` (`lib/communities/guard.server.ts`)
    and `canModerate` (`access.server.ts`); mod actions are logged in the mod
    log (`lib/communities/modlog.ts`, `MOD_ACTIONS_BY_GROUP`, with
    `announcement_posted` in the `content` group).
  - Nothing repeats: `ScheduledPost.scheduledAt` is one time;
    `grep -ri recurr lib/communities` finds nothing. Event recurrence exists
    for calendars (`lib/calendar/recurrence.ts`) and time zones in
    `lib/calendar/tz.ts`.
- **Decisions:**
  - **A thread template** (`CommunityRecurringThread`): community, title line,
    body (the same limits as a post), optional flair, cadence `weekly`
    (weekday) or `monthly` (day 1–28) at a local time in a chosen IANA time
    zone (`isValidTimeZone`), `nextAt` (UTC), `active`, `createdById`
    (a moderator), `lastPostId`, `lastPostedAt`, `failures`. At most **5
    active** per community (check-then-insert under
    `lockKey(tx, 'recurring:<communityId>')`).
  - **Posting.** A cron every minute (`communities.recurring`) claims due rows
    with a compare-and-set on `nextAt` (moves it to the next occurrence before
    acting), then creates a `ScheduledPost` for the template's **current
    author** — the moderator who last saved it, who must still be a moderator
    and not banned or sanctioned — with `communityId`, `scheduledAt = now`,
    and publishes it at once with `publishScheduledPost`. **First** the job
    runs `prepareCommunityPost` (`lib/communities/post-gate.server.ts`:
    membership, bans and timeouts, flair, verification, image descriptions,
    AutoMod) for the author and the body, because `publishScheduledPost`
    re-checks only sanctions and the image rule; a refusal, or an outcome
    AutoMod would hold or flag, pauses the template (below) and creates
    nothing. If `publishScheduledPost` still returns `null` (a sanction
    landed in between), the job deletes the `ScheduledPost` row it created
    so it never sits in the moderator's drafts, and pauses. Post alerts and
    audience rules then apply as for a hand-written post. The published post
    links back (`lastPostId`).
  - **Text only.** A template has a title line, body and flair — no images,
    GIF or poll — so the community's image-description rule (sprint 07 16)
    cannot fail on it; the zod schema refuses media fields.
  - **When it cannot post** (the author is no longer a moderator, is
    sanctioned, the community is locked or deleted, the gate refuses): the
    template is paused (`active = false`), `failures` incremented, and the
    community's moderators get one `SYSTEM` notification
    (`entityType 'community-recurring-paused'`) naming the template.
  - **No pinning.** Communities have no post pin of their own
    (`RMHark.pinnedAt` is the author's profile pin, sprint 05 19); a rolling
    pin would need one, so it is out of scope.
  - **Mod log:** `recurring_created`, `recurring_updated`, `recurring_paused`,
    `recurring_deleted` in the `settings` group; each published post logs
    nothing extra (it is an ordinary post by a moderator).
  - **UI:** a "Recurring" tab in the mod tools (`components/ui/tabs.tsx`): a
    list of templates as rows on rules (title, cadence in words — "Every
    Monday at 09:00 (Europe/London)" — next post date in the reader's locale,
    last post link, status) and a form dialog (title, body, flair select,
    cadence, weekday or day, time, zone). "Post now" makes the
    next occurrence happen at once without moving the schedule.

## Functional requirements

1. FR-1 CRUD for templates (moderators only), with the cap.
2. FR-2 The cron with compare-and-set, posting through `publishScheduledPost`.
3. FR-3 Failure pause and moderator notification.
4. FR-4 Mod tools tab and dialog; mod log entries.
5. FR-5 Erasure and export (below).

## Non-functional requirements

- **Correctness:** next-occurrence maths across DST in the chosen zone
  (`wallToUtcMs`); a missed minute (worker down) posts once on recovery, never
  once per missed occurrence; a template posts at most once per occurrence.
- **Security:** `requireMod` on every write; zod on every input; body run
  through the same length and link checks as posts.
- **Privacy:** templates are visible to the community's moderators only.
- **Steel:** rows on rules, dialog as the overlay, one ink primary per view
  (Save in the dialog).
- **i18n:** `recurring-threads`; the label in `feed`.

## Data model and API

- `CommunityRecurringThread` in `prisma/schema/communities.prisma`
  (`@@map("community_recurring_thread")`, `@@index([active, nextAt])`,
  `@@index([communityId])`), relations to `Community` (cascade) and `User`
  (`createdById`, back-relation under the auth anchor). Migration
  `20261128020300_s08_recurring_threads`.
- `lib/communities/recurring.ts` (pure: `nextOccurrence`, `describeCadence`
  data for the UI, `MAX_ACTIVE = 5`), `recurring-schema.ts`,
  `recurring.contract.ts`, `recurring.server.ts`, `recurring-jobs.server.ts`
  (`RECURRING_QUEUE`, `registerRecurringThreadCron`); modules
  `lib/communities/api/communities.$slug.recurring.server.ts` (GET, POST) and
  `communities.$slug.recurring.$id.server.ts` (PATCH, DELETE, POST `now`).
- `components/communities/ModRecurring.tsx`, `RecurringThreadDialog.tsx`;
  edits to `ModPanel.tsx`, `lib/communities/modlog.ts`.
- Erasure: the member's templates are **de-identified** — `createdById` is
  reassigned to the community owner and the template is **paused**
  (`active = false`), so nothing is ever posted under the owner's name until
  a moderator saves it (saving makes that moderator the author); when the
  owner is the deleted member, or the community has no owner, the template
  is deleted — under the `s08-09` anchor (an `updateMany` then a
  `deleteMany`, both scoped by `createdById`). Registry entry `deidentify`
  with that reason. Export: the templates the member authored.

## Testing requirements

- Main suite `lib/communities/__tests__/recurring.test.ts`: mods only; cap
  under lock; the cron claims once with two runners; runs
  `prepareCommunityPost` before posting and pauses on a refusal or an
  AutoMod hold; posts through `publishScheduledPost` and deletes its row when
  that returns `null`; a non-moderator author pauses and notifies; media
  fields refused; mod log rows.
- Main suite `lib/account/__tests__/recurring-threads-erasure.test.ts`.
- Product suite `lib/communities/__tests__/recurring.product.test.ts`:
  weekly and monthly next occurrence across DST in two zones; catch-up posts
  once.
- Existing: post-alerts and scheduled publish tests; notification labels test
  (new line); erasure coverage.

## Acceptance criteria

- [ ] A weekly template for Monday 09:00 Europe/London posts on the Monday
      after the clocks change at 09:00 local time.
- [ ] Members with post alerts on get the usual alert.
- [ ] Demoting the template's author pauses it and tells the moderators.
- [ ] A sixth active template is refused.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Recurring posts on personal profiles, templated variables (dates in the
title), polls in templates, automatic archiving of old threads,
pinning the current thread in the community.
