# 19 — Quiz polls

Surface: the poll editor in the composer (`components/feed/compose/PollEditor.tsx`),
the poll on posts (`components/feed/PollDisplay.tsx`), every path that returns a
poll. Wave 7 (sweeping). Namespace `quiz-polls`.

## User story

As a member who runs a weekly trivia post in a community, I want to mark one
option as the right answer and add a line explaining it, so that people who
answer see at once whether they were right and why — and nobody can read the
answer before choosing.

## Requirements elicitation

- **What exists (verified):**
  - Polls: `RMHarkPoll` / `RMHarkPollOption` / `RMHarkPollVote`
    (`prisma/schema/social.prisma`): single choice, `multiSelect`, `ranked`
    (sprint 06 19, mutually exclusive with `multiSelect`), `closesAt`,
    `closedAt`/`extendedAt` (sprint 04 08), denormalised `voteCount`.
  - Created in `lib/feed/api/rmharks.server.ts` and scheduled posts
    (`lib/scheduled/scheduled-schema.ts`, `publish.server.ts`); voted in
    `lib/feed/api/rmharks.$id.vote.server.ts`; ended/extended in
    `rmharks.$id.poll.end.server.ts` / `.extend.server.ts`; serialised in
    `lib/feed/map-feed-item.server.ts`, `lib/api/serializers.server.ts`
    (developer API), `lib/feed/api/rmharks.$id.server.ts` (post detail),
    `lib/profile/api/profile.$id.rmharks.server.ts`, `lib/bookmarks.server.ts`,
    `lib/feed/timeline.ts`; typed in `lib/feed-types.ts` and validated in
    `lib/rmhark-schema.ts`; composed in `components/feed/compose/compose-state.ts`
    and `PollEditor.tsx`; rendered by `PollDisplay.tsx`. The SDK's poll type is
    spelled out in `scripts/generate-sdk.ts` `NULLABLE.poll`.
  - There is no correct answer on any poll (`grep -i "correct\|quiz"
    prisma/schema/social.prisma` finds nothing).
- **Decisions:**
  - A poll may be a **quiz**: single choice only (not `multiSelect`, not
    `ranked`), 2–4 options, exactly one correct option, an optional
    explanation ≤ 280 characters. Stored as `RMHarkPoll.correctOptionId` and
    `RMHarkPoll.explanation`.
  - **The answer is secret until earned.** `correctOptionId` and `explanation`
    are included in a payload only for: the author; a viewer who has voted on
    this poll; anyone once the poll has ended (`closedAt ?? closesAt` passed).
    Every other payload carries `quiz: true` and nothing else about the answer.
    The rule is one pure function `quizRevealFor(poll, viewer, voted, now)`,
    and every serialiser listed above calls it; they are listed in
    `QUIZ_READ_PATHS` and held by a source-scan test (the sprint 04 registry
    pattern), including the embed (`app/routes/embed.post.$id.tsx`), RSS
    (`lib/rss.ts`, which shows no answer ever), OG cards (`lib/og/`, never),
    the developer API and admin server functions that return posts.
    **Inventory** (`grep -rln "rMHarkPoll\|poll: {" lib app server --include=*.ts --include=*.tsx`
    at the sprint 06 tip, minus chat-plus and group-chat polls, which are out
    of scope): besides the files above, `app/routes/api/v1/posts.ts` and
    `app/routes/api/v1/posts/$id.ts` (developer API list and detail),
    `app/routes/_site/u/$userid/post/$postid.tsx` (its `head()` reads only the
    question; listed so the scan holds it), `lib/og/post-image.server.tsx` and
    `lib/og/api/og.post.$id.server.ts` (never the answer),
    `lib/scheduled/list.server.ts` (author only), `lib/feed-sse.ts` (never),
    and `lib/feed/poll-lifecycle.server.ts` — the poll-ended notifications go
    out only after the end, when the answer is public, but their preview text
    is built from the options and must still not name the correct option to
    a recipient before `closedAt` (it never runs before the end; the test
    holds that the preview is unchanged for quizzes). The implementer re-runs
    the grep on the wave base; any new hit joins `QUIZ_READ_PATHS` or the
    scan's documented exclusions.
  - **Voting on a quiz is final** (no change, no retract), so the answer cannot
    be fished for by voting and un-voting. The vote response includes the
    reveal.
  - Results (percentages) are shown as today after voting; the correct option
    is marked "Correct" in words and the viewer's wrong choice "Your answer";
    the explanation below.
  - Editing a post cannot change the correct option once any vote exists (the
    post edit path refuses with 409 `QUIZ_LOCKED`).
  - The author sees "{{n}}% answered correctly" (computed from `voteCount`)
    under the poll.
  - Quiet counts (sprint 04 14) hide the percentages exactly as for any poll;
    the reveal of right/wrong to a voter is not a count and still shows.
  - Developer API: the post payload's poll gains `quiz: boolean`,
    `correctOptionId: string | null` and `explanation: string | null`
    (additive, applying the same reveal rule for the key's owner);
    `NULLABLE.poll` updated; SDK and docs regenerated. Creating a quiz through
    `POST /api/v1/posts` accepts the same fields.

## Functional requirements

1. FR-1 The poll editor's "Quiz" switch (disabled with a reason when multiple
   choice or ranked is on), a "Correct answer" radio per option, and the
   explanation field.
2. FR-2 Server validation on create (site, scheduled, API) and the edit lock.
3. FR-3 The reveal rule on every read path in `QUIZ_READ_PATHS`.
4. FR-4 Final votes for quizzes; the vote response reveals.
5. FR-5 `PollDisplay` shows the quiz states: before voting (options, "Quiz"
   marker), after voting (right/wrong, results, explanation), after the end
   (answer for everyone), author view (answer and percentage correct).
6. FR-6 The developer API fields and the regenerated SDK and docs.

## Non-functional requirements

- **Secrecy:** no payload, cache, SSE event or prefetch leaks the answer to a
  viewer who may not see it — cached feed pages are viewer-independent today
  (check `map-feed-item.server.ts` and the micro-caches): the reveal is applied
  after the cache, per viewer, the way `isViewer` and quiet counts are
  re-stamped; SSE poll updates (`lib/feed-sse.ts`) carry no answer.
- **Correctness:** the vote transaction re-checks "already voted" for quizzes
  under the existing vote path's guard and refuses a second vote (409
  `ALREADY_ANSWERED`).
- **Known limit:** a member with a second account can vote once to learn
  the answer; that is true of every online quiz and is not defended against
  beyond the site's existing one-account rules (recorded, not solved).
- **Quiet counts:** the author's "{{n}}% answered correctly" is a count; it
  follows the author's quiet-counts setting like the percentages do.
- **Performance:** whether the viewer voted is already read for the existing
  "your vote" marker; no new query per post.
- **Steel:** "Correct" and "Your answer" are words and weight, not green and red
  fills (R1; `--site-success`/`--site-danger` may colour the word only).
- **Accessibility:** results announce right or wrong politely after voting.
- **i18n:** `quiz-polls`.

## Data model and API

- `RMHarkPoll.correctOptionId String? @db.VarChar(30)`, `explanation String?
  @db.VarChar(280)` (a plain ref, not a relation, so option deletion order does
  not matter). Migration `20261127070000_s07_quiz_polls`.
- `lib/feed/quiz-poll.ts` (pure: validation, `quizRevealFor`,
  `QUIZ_READ_PATHS`), `quiz-poll-schema.ts`; edits to the files listed under
  "What exists", `lib/feed-types.ts`, `lib/rmhark-schema.ts`,
  `lib/api/registry.ts` (poll fields in place), `scripts/generate-sdk.ts`
  (`NULLABLE.poll`), `PollEditor.tsx`, `compose-state.ts`, `PollDisplay.tsx`,
  `EditPostModal.tsx` (the lock message).

## Testing requirements

- Main suite `lib/feed/__tests__/quiz-polls.test.ts`: create validation (single
  choice only, one correct, 2–4 options); every path in `QUIZ_READ_PATHS`
  hides the answer from a non-voter and shows it to a voter, the author and
  everyone after the end; the developer API applies the rule for the key's
  owner; second vote refused; edit after a vote refused; SSE payload has no
  answer.
- `lib/feed/__tests__/quiz-read-paths.test.ts`: the source scan.
- Product suite `components/feed/compose/__tests__/quiz-poll.product.test.ts`.
- Existing tests that must stay green: poll lifecycle, ranked polls, quiet
  counts, the v1 posts tests, the compose-state tests.
- Gate tests: route table, OG coverage, design consistency.

## Acceptance criteria

- [ ] A quiz's answer is not in any network response to a member who has not
      voted, including the feed, the post page, the embed and the API.
- [ ] Voting shows right or wrong at once with the explanation; the vote cannot
      be changed.
- [ ] After the poll ends everyone sees the answer.
- [ ] The author sees the share who answered correctly.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Quiz scores across posts, leaderboards of quiz answers, quizzes in group chat
polls, several correct answers.
