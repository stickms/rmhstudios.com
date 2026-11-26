# 13 — Suggest a theme for a game jam, and let admins delete a jam that has not started

Surface: a jam's page (`/jams/$slug`, `components/competitive/JamDetail.tsx`): "Suggest a theme" for members before
the vote opens, the suggestions in the admins' shortlist dialog, "Delete jam" for admins. Wave 6. Namespace
`jam-suggestions`. Site tier (Steel).

## User story

As a member looking forward to a theme-voted game jam, I want to suggest a theme before the vote opens, and as the
admin running it, I want to see the suggestions while I build the shortlist and to delete a jam I created by mistake,
so that members shape the jams they enter and a wrong jam does not sit on the calendar for good.

## Requirements elicitation

- **What exists (verified):**
  - `GameJam` (`prisma/schema/competitive.prisma`) with opt-in theme voting (sprint 07 07): `themeVoting`,
    `themeVoteOpensAt`, `themeResolvedAt`; the shortlist is `GameJamThemeCandidate` (`text` 120, `position`), votes
    are `GameJamThemeVote`. Admins create jams (`POST /api/jams`, `lib/competitive/api/jams.server.ts`), edit them and
    replace the shortlist (sprint 14 14: `PATCH /api/jams/$slug`, `lib/competitive/api/jams.$slug.theme-candidates.server.ts`,
    `components/competitive/JamEditDialog.tsx`, `JamShortlistDialog.tsx`, phase rules in `lib/competitive/jam-edit.ts`,
    under `lockKey(tx, 'game-jam:<id>')`).
  - Members have **no way to propose a theme**: the shortlist is the admin's alone. Sprint 14 14 recorded "letting
    members suggest themes" and "deleting a jam" as out of scope. There is **no delete** at all (no route, no
    `gameJam.delete` call).
  - `GameJamThemeCandidate` cascades from the jam; votes cascade from candidates and the jam.
- **Decisions:**
  - **Suggestions:** a new table `GameJamThemeSuggestion` (`jamId`, `userId`, `text` 120, `createdAt`;
    `@@unique([jamId, userId, text])`). A signed-in member may suggest up to 3 themes per jam
    (`JAM_SUGGESTION_LIMIT`, checked under `lockKey(tx, 'jam-suggestions:<jamId>:<userId>')`) while the jam has
    `themeVoting` and its vote has not opened (`JAM_SUGGESTIONS_CLOSED` otherwise); text trimmed, control characters
    stripped, 3–120 characters. A member can withdraw their own while the window is open.
  - **Who sees them:** the suggester (their own) and admins (all, with the suggester's name and a count of identical
    texts). Suggestions are never shown to other members, so they need no report path; banned or blocked-by-creator
    members cannot suggest.
  - **From suggestion to shortlist:** the shortlist dialog lists suggestions beside the candidates with "Add to
    shortlist" (copying the text into the dialog's list; saving goes through the existing shortlist contract and its
    rules). A suggestion that reaches the shortlist is marked "On the shortlist" for its suggester **only once the vote
    has opened** (when every member can see the candidates anyway); before that the suggester sees only their text, so
    no member learns the shortlist, and through it the secret theme (`GameJam.theme` is "never sent before
    startsAt"), early. The export applies the same rule.
  - **The `comment` timeout** applies to suggesting (member text an admin reads and may publish), checked in the route;
    the model joins `MEMBER_TEXT_MODELS` (`lib/moderation/restriction-paths.ts`) under the anchor.
  - **Delete a jam:** `DELETE /api/jams/$slug` (admins), only before `startsAt` and with no entries (`JAM_DELETE_STARTED`
    otherwise), under the jam's lock, with a `recordAdminActionIn` row naming the slug and title; candidates, votes and
    suggestions cascade (every relation to `GameJam` is `onDelete: Cascade`, checked at validation). The delete is one
    conditional `deleteMany` (`id`, `startsAt` in the future, `entries: { none: {} }`) inside the locked transaction, so
    a count of 0 answers the refusal. Notifications that named the jam keep their link, which then opens the jams
    list's not-found state. A confirm says it cannot be undone.
  - **Erasure:** the member's suggestions are deleted (registry `erase`), under the Wave 0 anchor. **Export:** their
    suggestions (jam title, text, time, whether shortlisted).

## Functional requirements

1. FR-1 Schema: `GameJamThemeSuggestion` with `@@index([jamId, createdAt])`, `User` and `GameJam` relations (the
   back-relation under the anchor in `prisma/schema/auth.prisma`); migration `20270105060200_s15_jam_suggestions`.
2. FR-2 `lib/competitive/jam-suggestions.server.ts` (new): suggest, withdraw, list (own, admin), export, erasure ops;
   `lib/competitive/jam-suggestions.contract.ts`, `lib/competitive/jam-suggestions-schema.ts`;
   `lib/competitive/api/jams.$slug.suggestions.server.ts`, `jams.$slug.suggestions.$id.server.ts` (new modules).
3. FR-3 `lib/competitive/api/jams.$slug.server.ts` gains `DELETE` (`deleteJam` in `lib/competitive/jams.server.ts`).
4. FR-4 UI: `components/competitive/JamSuggestions.tsx` (new) on the jam page; the shortlist dialog's suggestions
   column; "Delete jam" in the admin controls with `useConfirm`.
5. FR-5 Refusals `JAM_SUGGESTION_LIMIT` (`max`), `JAM_SUGGESTIONS_CLOSED`, `JAM_DELETE_STARTED` under the anchor.

## Non-functional requirements

- **The cap holds under concurrency** (count and insert in one transaction after the lock).
- **The delete and a first entry** serialise on the jam's lock; the entry route must take the same lock or re-check
  `startsAt` inside its transaction (check `lib/competitive/api/jams.$slug.entry.server.ts`; an entry before the start
  is already refused, which makes the race impossible if that check is inside the write).
- **Query shapes (verify against the schema):** the unique is a composite (`jamId_userId_text`); `GameJam.themeVoteOpensAt`
  is optional (a voting jam without it has no open window: suggestions are closed).
- **Steel:** suggestions are rows on rules with `t-meta` counts; the one primary is "Suggest".

## Testing requirements

- Main suite `lib/competitive/__tests__/jam-suggestions.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): the window, the cap under the lock, duplicates, withdraw, visibility (own vs admin), the timeout,
  ban and block refusals, "On the shortlist" hidden before the vote opens (own list and export), export and erasure.
- Main suite `lib/competitive/__tests__/jam-delete.test.ts`: admin only, before start, no entries, audit row, cascade.
- `lib/moderation/__tests__/restriction-paths.test.ts`, `lib/account/__tests__/erasure-coverage.test.ts`, the
  error-code catalogue, the existing jam suites.

## Acceptance criteria

- [ ] A member suggests two themes for an upcoming voting jam and sees them listed as theirs.
- [ ] A fourth suggestion is refused with the limit sentence; suggesting after the vote opens is refused.
- [ ] An admin opens "Edit shortlist", sees the suggestions with counts, and adds one to the shortlist.
- [ ] An admin deletes a jam that has not started; it is gone from the jam list.
- [ ] Deleting a jam with entries, or after its start, is refused.

## Out of scope

Voting on suggestions, public suggestion lists, suggestions for jams without theme voting, deleting a running jam.
