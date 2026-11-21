# 08 — Poll results: end early, extend, and hear the outcome

Surface: polls on RMHarks (`components/feed/PollDisplay.tsx`), the post menu
for the author, and notifications. Wave 5. Namespace `poll-lifecycle`.

## User story

As a member who posts a poll, I want to end it early once it has its answer
or give it more time, and to be told the result when it closes; and as a
member who voted, I want to hear how it turned out — so that a poll is a
question that gets answered, not one that quietly stops taking votes.

## Requirements elicitation

- **What exists (verified):** `RMHarkPoll { closesAt }`
  (`prisma/schema/social.prisma`), set from `durationHours` (1..720) at post
  time (`lib/feed/api/rmharks.server.ts`); the vote endpoint
  (`lib/feed/api/rmharks.$id.vote.server.ts`) refuses votes after `closesAt`,
  and `map-feed-item.server.ts` sends `closesAt` to the client. Once posted, a
  poll's end cannot be changed; nobody is told when a poll ends (no job, no
  notification — `grep` for poll-ended finds nothing); a poll without a
  duration never ends. Scheduled posts carry a poll too
  (`lib/scheduled/publish.server.ts`).
- **Decisions:** the author can **end now** any open poll (including one
  with no duration) and **extend** an open timed poll by 1, 3 or 7 days, as
  long as the end stays within 30 days of the post (the composer's own
  maximum). An ended poll cannot be reopened. When a poll ends — by time or by
  the author — a per-minute job notifies the author ("Your poll ended:
  {{option}} won with 54%") and every voter ("A poll you voted in ended"),
  once, grouped per poll, respecting blocks, mutes and notification
  preferences through `createNotification`. Voters are notified only for
  polls with at most 2,000 votes; above that, only the author (a pile-on
  guard). Ties name every tied option.

## Functional requirements

1. FR-1 The author's post menu on a post with an open poll gains "End poll
   now" (confirm) and, for a timed poll, "Extend poll" (1 / 3 / 7 days,
   options that would pass 30 days are disabled with a hint).
2. FR-2 An ended poll shows "Final results" with the winning option marked in
   text ("Winner") and the total ("1,204 votes · ended 2 hours ago"); the
   viewer's own vote stays marked.
3. FR-3 The open poll shows "Ends in 3 hours" (or "Ends on 4 Dec"), and
   "Extended" once extended.
4. FR-4 When the poll ends the author and the voters are notified once
   (FR rules above); the notification links to the post.
5. FR-5 The vote endpoint refuses votes on an ended poll whichever way it
   ended (HTTP 409, `POLL_CLOSED`), and the client shows "This poll has
   ended".

## Non-functional requirements

- **Security:** end and extend are session-only and require the post's
  author; rate limit `write`; extend's `days` is a zod enum. A deleted post's
  poll is never notified.
- **Correctness:** the effective end is `closedAt ?? closesAt`; every read
  (feed, post detail, profile posts, `/api/v1/posts`, embeds, search hits)
  uses one helper so none shows a stale "open". The job claims polls with a
  conditional `updateMany` (`endNotifiedAt: null` → now) on rows whose
  effective end has passed, then notifies, at most 200 polls per run — run it
  twice and nobody is notified twice.
- **Performance:** `@@index([endNotifiedAt, closesAt])` and
  `@@index([endNotifiedAt, closedAt])`; voter ids read in pages of 500.
- **Accessibility:** results are text with percentages; the winner is a word,
  not only weight; the end/extend actions are menu items with clear labels.
- **i18n:** strings in `poll-lifecycle`; percentages and relative times via
  `Intl`.
- **Steel:** results keep the existing poll rows; "Winner" is `t-label`; no
  colour-only marking.

## Data model and API

- `RMHarkPoll` gains `closedAt DateTime?`, `extendedAt DateTime?`,
  `endNotifiedAt DateTime?` and the two indexes. Migration
  `20261124050000_s04_poll_lifecycle`.
- `lib/feed/poll-lifecycle.ts` (pure: effective end, extension limit,
  winners and ties, whether voters are notified),
  `lib/feed/poll-lifecycle-schema.ts`, `lib/feed/poll-lifecycle.contract.ts`,
  `lib/feed/poll-lifecycle.server.ts` (`endPoll`, `extendPoll`,
  `runPollEndNotices`), `lib/feed/poll-lifecycle-jobs.server.ts` registered
  in `server/jobs/index.ts` under `s04-08` (queue `feed.poll-ended`, every
  minute).
- Modules `lib/feed/api/rmharks.$id.poll.end.server.ts` and
  `rmharks.$id.poll.extend.server.ts` (`POST`).
- `map-feed-item.server.ts` and every other poll serialiser send
  `closesAt` as the effective end plus `ended: boolean`.
- `components/feed/NotificationsColumn.tsx`: a `poll_result` label under the
  `s04-08` anchor.

## Testing requirements

- Main suite `lib/feed/__tests__/poll-lifecycle.test.ts`: only the author can
  end or extend; extension past 30 days is refused; a vote after ending is
  409; the job run twice notifies once; voters of a blocked author are not
  notified; polls over 2,000 votes notify only the author.
- Product suite `lib/feed/__tests__/poll-lifecycle.product.test.ts`: effective
  end, ties, extension limits.
- The existing feed characterization tests stay green.

## Acceptance criteria

- [ ] The author ends a poll early; it shows final results and votes are
      refused.
- [ ] A 1-day poll extended by 3 days closes on day 4 and notifies its author
      and voters once.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Reopening a poll, changing options after posting, announcement polls
(`FeedAnnouncementPoll`), community census polls.
