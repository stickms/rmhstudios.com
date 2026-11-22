# 07 — Vote on a game jam's theme

Surface: `/jams/$slug` before the jam starts, the admin create form on
`/jams` (`components/competitive/JamsList.tsx`), the jobs worker. Wave 2. Namespace `jam-themes`.

## User story

As a member planning to enter a game jam, I want to vote for the theme from a
shortlist in the days before it starts, so that the jam is about something
entrants chose and nobody knows the winner early.

As the admin running the jam, I want to offer a shortlist instead of picking
one theme, and have the winner become the theme on its own at the start.

## Requirements elicitation

- **What exists (verified):**
  - `GameJam` (`prisma/schema/competitive.prisma`) has one required `theme`,
    set by an admin at creation (`createJam`, `lib/competitive/jams.server.ts`;
    `POST /api/jams` is `auth: 'admin'` in `lib/competitive/api/jams.server.ts`).
    "`theme` is only ever sent to clients once startsAt passes" — `summary()`
    and `themeVisible` hide it until then.
  - Phases are pure (`jamPhase` in `lib/competitive/jam.ts`: upcoming, open,
    rating, done). Entries, ratings (with a `theme` category), teams (sprint 05
    15) and written feedback (sprint 06 07) exist; there is no vote on themes
    (`grep -ri "theme.vote\|JamTheme" lib prisma` finds nothing).
  - The page is `app/routes/_site/jams.$slug.tsx` with
    `components/competitive/JamDetail.tsx`.
- **Decisions:**
  - **Opt-in per jam.** The admin form gains "Let members vote on the theme"
    with 3–12 candidate themes (each ≤ 120 characters, unique ignoring case)
    and a voting opening time (default: now; must be before `startsAt`).
    `GameJam.theme` stays required (so every read keeps working): for a voting
    jam it holds the first candidate until the vote resolves, and is **never
    sent** before `startsAt` exactly as today.
  - **Approval voting**: during voting (opening time → `startsAt`) any
    signed-in member who is not banned may mark up to 3 candidates; changing
    marks is allowed until the start. Votes are private (never listed by
    voter); counts are hidden until the start, so the vote cannot be steered by
    early results.
  - **Resolution at `startsAt`:** the candidate with most votes wins; ties go
    to the candidate the admin listed first; with no votes at all the first
    candidate wins. A per-minute cron in the `jobs` worker resolves jams whose
    `startsAt` has passed and `themeResolvedAt` is null, claiming each with a
    conditional `updateMany` (compare-and-set) and writing `theme` and
    `themeResolvedAt` in one statement. Reads never wait for the cron: the
    page computes the same winner (pure function over the counts) when it
    renders a started jam whose claim has not run yet, so the theme appears at
    the start even if the worker is down.
  - After the start the page shows the theme as today and, below it, the
    shortlist with each candidate's vote count (`t-meta`) and the winner marked.
  - Candidates cannot be edited once the first vote exists; before that the
    admin can edit them.
  - Voters get one notification when the theme is revealed ("The theme of
    {{jam}} is {{theme}}"), sent by the same cron after the claim, only to
    members who voted (they asked to be involved); no one else is notified.
  - Banned and deleted members' votes are not counted (filtered at count time).

## Functional requirements

1. FR-1 The admin jam form's theme-voting section (switch, candidate list with
   add/remove/reorder, opening time).
2. FR-2 Before the start, during voting, `/jams/$slug` shows "Vote for the
   theme" with the candidates as checkboxes (max 3, the fourth disabled with a
   reason), a Save button (the view's ink primary), and "Voting closes when
   the jam starts" with the time; before voting opens, "Theme voting opens
   {{time}}".
3. FR-3 After the start, the theme and the shortlist with counts.
4. FR-4 Signed-out visitors see the candidates and "Sign in to vote".
5. FR-5 The reveal notification to voters (literal label).
6. FR-6 The jam list (`JamsList.tsx`) marks voting jams "Theme vote open".

## Non-functional requirements

- **Secrecy:** before `startsAt` no endpoint returns vote counts or the
  winner; the candidate list is public (it is a shortlist, not the theme).
  Holds on every read path: the page loader, `GET /api/jams/$slug`, the jam
  list, OG cards (`lib/og/`), admin lookup — list them in
  `JAM_THEME_READ_PATHS` with a source-scan test.
- **Correctness:** vote writes run in a transaction with
  `lockKey(tx, 'jam-theme-vote:' + jamId + ':' + userId)` and re-check the
  3-mark cap and the phase; resolution is idempotent (claimed once).
- **Security:** voting `auth: 'required'`, `rateLimit: 'write'`; candidates
  admin-only (`auth: 'admin'`), audited with `recordAdminActionIn(tx, …)`.
- **Performance:** counts are one grouped query per page view after the start;
  `@@index([jamId, candidateId])` on votes.
- **Privacy:** erasure deletes the member's votes; export lists the jams and
  candidates they voted for.
- **Steel:** checkbox rows on rules; the winner marked in words ("Chosen"),
  not colour.
- **i18n:** `jam-themes`; label in `feed.json`.

## Data model and API

- `GameJam.themeVoting Boolean @default(false)`, `themeVoteOpensAt
  DateTime?`, `themeResolvedAt DateTime?`;
  `GameJamThemeCandidate { id, jamId, text VarChar(120), position Int,
  createdAt }` (`@@unique([jamId, position])`, relation cascade,
  `@@map("game_jam_theme_candidate")`);
  `GameJamThemeVote { jamId, candidateId, userId, createdAt }`
  (`@@id([candidateId, userId])`, `@@index([jamId, userId])`,
  `@@index([jamId, candidateId])`, relations cascade,
  `@@map("game_jam_theme_vote")`); `User` back-relation under the auth anchor.
  Migration `20261127020100_s07_jam_themes`. `jamId` on the vote is copied
  from the candidate so the cap is one indexed count.
- `lib/competitive/jam-themes.ts` (pure: candidate validation, `winnerOf`,
  `MAX_THEME_MARKS = 3`), `jam-themes-schema.ts`, `jam-themes.contract.ts`,
  `jam-themes.server.ts` (`setCandidates`, `castVotes`, `themeVoteView`,
  `resolveDueThemes`, `registerJamThemeCron`, `jamThemeErasureOps`,
  `exportJamThemeVotes`).
- Modules `lib/competitive/api/jams.$slug.theme-vote.server.ts` (GET view,
  PUT votes) and `jams.$slug.theme-candidates.server.ts` (PUT, admin).
- `createJam` and the admin form accept the voting fields.
- UI: `components/competitive/JamThemeVote.tsx`, `JamThemeResults.tsx`,
  edits to `JamDetail.tsx` and `JamsList.tsx` (which holds the admin create
  form).

## Testing requirements

- Main suite `lib/competitive/__tests__/jam-themes.test.ts`: votes only during
  voting; the 3 cap under two concurrent requests; no counts before start on
  every listed read path; winner by count, tie to first, none to first;
  resolution claimed once by two concurrent cron runs; banned voter not
  counted; candidates locked after the first vote; non-admin refused.
- Main suite `lib/account/__tests__/jam-themes-erasure.test.ts`.
- Product suite `lib/competitive/__tests__/jam-themes.product.test.ts`.
- `lib/competitive/__tests__/jam-theme-read-paths.test.ts` (source scan).
- Gate tests: notification labels, migration safety, OG coverage.

## Acceptance criteria

- [ ] An admin creates a jam with five candidate themes; members vote; nobody
      can see counts before the start.
- [ ] At the start the winning theme shows on the page, even with the jobs
      worker stopped; voters are told once the worker runs.
- [ ] A jam created without voting behaves exactly as before.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Members suggesting candidates (a moderation queue), ranked-choice theme
voting, multiple voting rounds, theme voting for Studio challenges.
