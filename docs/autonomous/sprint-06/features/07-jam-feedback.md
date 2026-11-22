# 07 — Written feedback on jam entries

Surface: the jam page (`/jams/$slug`, `components/competitive/JamDetail.tsx`)
where entries are rated. Wave 2. Namespace `jam-feedback`.

## User story

As someone rating entries in a game jam, I want to leave a few sentences for the
team along with my scores — what worked, what broke — and as a team, I want to
read that feedback after the jam, so that a jam teaches us something and is not
just a number.

## Requirements elicitation

- **What exists (verified):**
  - `GameJamRating` (`prisma/schema/competitive.prisma`): `fun`, `creativity`,
    `theme`, `polish` (1–5), one per rater per entry
    (`@@unique([entryId, raterId])`). Rated through
    `POST /api/jams/$slug/rate` (`lib/competitive/api/jams.$slug.rate.server.ts`)
    and `rateEntry` (`lib/competitive/jams.server.ts`), which refuses rating
    your own entry and only during the rating window.
  - Sprint 05 15 added teams (`GameJamTeamMember`,
    `lib/competitive/jam-teams.server.ts`): accepted teammates are credited and
    cannot rate their own entry; `listTeam` returns the team.
  - Nothing stores text with a rating
    (`grep -i "comment\|feedback" lib/competitive/jam*` finds nothing).
- **Decisions:**
  - Feedback is optional text (20–1 000 characters) attached to a rating, so
    only people allowed to rate can write it, once per entry, editable until the
    rating window closes (`ratingEndsAt`).
  - **Who sees it:** the entry's submitter and accepted teammates see all
    feedback on their entry, from the moment it is written. The rater sees their
    own. Nobody else does, ever: feedback is private to the team (public
    feedback is a moderation surface this feature does not take on).
  - Feedback is shown with the rater's name, so teams can follow up; the rater
    can choose "Leave my name off" (stored, honoured in every payload; admins
    can still see the author for moderation).
  - The team is told by a `SYSTEM` notification (label `jam_feedback`) batched:
    at most one notification per entry per hour, saying how many new pieces of
    feedback arrived (a compare-and-set on the entry's `feedbackNotifiedAt`).
  - The team can mark a piece "Helpful" (one flag per piece, visible to the
    rater as "The team found this helpful"), and can report abusive feedback
    through the existing report flow with entity type `jam-feedback` (hyphenated like `ladder-interview` and `music-score`).
  - Blocks: a member blocked by any team member (either direction) cannot leave
    feedback on that entry (the rating itself follows today's rules).

## Functional requirements

1. FR-1 The rating form on an entry gains a "Feedback for the team (optional)"
   textarea with a counter and "Leave my name off" switch, saved with the
   scores in the same request.
2. FR-2 A rater re-opening the form sees their feedback and can edit it until
   `ratingEndsAt`.
3. FR-3 For the submitter and teammates, the entry shows "Feedback (n)" opening a
   list (rows on rules: author or "A rater", `t-meta` date, text, Helpful
   toggle, Report).
4. FR-4 Batched notification per FR decisions, linking to the entry.
5. FR-5 Reports of feedback reach `/admin/reports` with the text as the
   snapshot; an admin resolving "remove" soft-deletes the feedback
   (`removedAt`).

## Non-functional requirements

- **Correctness:** rating and feedback are written in one transaction (upsert
  by `ratingId`); the notification claim is a conditional `updateMany` on
  `GameJamEntry.feedbackNotifiedAt` being null or older than an hour.
- **Security:** zod length limits; the list endpoint checks the caller is the
  submitter or an accepted teammate (`listTeam`) or an admin; anonymity is
  enforced server-side (the author id is dropped from the payload, not hidden
  in the UI). Text is rendered as text.
- **Performance:** feedback is loaded only when the team opens the list;
  `@@index([entryId, createdAt])`.
- **Privacy:** erasure deletes feedback the member wrote and Helpful flags are
  on the row (no extra table). Export includes feedback the member wrote
  (entry title, text, date) — feedback received is other people's words and is
  not exported.
- **i18n:** `jam-feedback`; notification label in `feed`; the report entity
  label wherever report labels live (literal).
- **Steel:** the list is rows on rules in a dialog; one ink primary (the rating
  form's existing Submit).
- **Accessibility:** the textarea is labelled; the Helpful toggle is a
  `button` with `aria-pressed`.

## Data model and API

- `GameJamFeedback { id String @id @default(cuid()), ratingId String @unique,
  entryId, authorId, body VarChar(1000), anonymous Boolean @default(false),
  helpfulAt DateTime?, removedAt DateTime?, createdAt @default(now()),
  updatedAt @updatedAt }` with relations to `GameJamRating` and `GameJamEntry`
  (cascade), `@@index([entryId, createdAt])`, `@@index([authorId])`,
  `@@map("game_jam_feedback")`; `GameJamEntry.feedbackNotifiedAt DateTime?`;
  `User` back-relation under the auth anchor. Migration
  `20261126020100_s06_jam_feedback`.
- `lib/competitive/jam-feedback.ts` (pure: limits, visibility, batching window),
  `jam-feedback-schema.ts`, `jam-feedback.server.ts` (`saveFeedback` used by
  `rateEntry`, `listFeedback`, `markHelpful`, `jamFeedbackErasureOps`,
  `exportJamFeedback`), `jam-feedback.contract.ts`.
- `jams.$slug.rate.server.ts` accepts optional `feedback` and `anonymous`
  (additive to its schema); new modules
  `lib/competitive/api/jams.$slug.entries.$entryId.feedback.server.ts` (GET),
  `jams.$slug.feedback.$id.helpful.server.ts` (POST/DELETE).
- `REPORT_ENTITY_TYPES` (`lib/moderation/report-constants.ts`) gains `jam-feedback` and `REMOVABLE_REPORT_ENTITY_TYPES` with it (a `takedownReportedContent` branch in `lib/moderation/triage.server.ts` that sets `removedAt`; `lib/moderation/__tests__/music-reports.test.ts` holds that every removable type has one); the admin
  report view resolves its snapshot.
- `components/competitive/JamFeedbackField.tsx`, `JamFeedbackList.tsx`.

## Testing requirements

- Main suite `lib/competitive/__tests__/jam-feedback.test.ts`: only raters can
  write; no feedback on own or team entry; edit refused after `ratingEndsAt`;
  list refused to outsiders; anonymous author id absent from the payload;
  blocked pair refused; notification claimed at most once per hour.
- Main suite `lib/account/__tests__/jam-feedback-erasure.test.ts`.
- Product suite `lib/competitive/__tests__/jam-feedback.product.test.ts`:
  limits, batching window, visibility matrix.
- `notification-labels.test.ts` pins `jam_feedback`.

## Acceptance criteria

- [ ] A rater leaves scores and two sentences; the team sees them under
      Feedback (1) and gets one notification.
- [ ] Ten raters writing within an hour produce one notification.
- [ ] "Leave my name off" shows "A rater" to the team.
- [ ] Someone outside the team cannot read the feedback by id.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Public feedback, replies to feedback, feedback without a rating.
