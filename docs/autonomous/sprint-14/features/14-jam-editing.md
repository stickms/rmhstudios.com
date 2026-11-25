# 14 — Edit a game jam, and its theme shortlist, after creating it

Surface: a game jam's page (`/jams/$slug`, `app/routes/_site/jams.$slug.tsx`, `components/competitive/JamDetail.tsx`): an admin's "Edit jam" dialog and
"Edit shortlist" for a voting jam. Wave 4. Namespace `jam-editing`. Site tier (Steel).

## User story

As the admin running a game jam, I want to fix a typo in the title, move a deadline or change the theme shortlist after
I created the jam, so that a mistake does not mean deleting the jam and asking everyone to start again.

## Requirements elicitation

- **What exists (verified):**
  - Jams are created by admins only (`POST /api/jams`, `lib/competitive/api/jams.server.ts`, `createJam` in
    `lib/competitive/jams.server.ts`, the form `AdminForm` in `components/competitive/JamsList.tsx`); the jam has
    `title`, `description`, `theme`, `startsAt`, `submitEndsAt`, `ratingEndsAt`, `themeVoting`, `themeVoteOpensAt`,
    `themeResolvedAt` (`GameJam`, `prisma/schema/competitive.prisma`). `createJam` checks the date order and the
    candidates (`validateCandidates`, `resolveVoteOpensAt`).
  - **Nothing edits a jam.** `/api/jams/$slug` (`lib/competitive/api/jams.$slug.server.ts`) has only `GET`.
  - The shortlist can be replaced on the server: `PUT /api/jams/$slug/theme-candidates`
    (`lib/competitive/api/jams.$slug.theme-candidates.server.ts`, `auth: 'admin'`, "replace the shortlist (3 to 12)
    before the first mark exists", `setCandidates` in `lib/competitive/jam-themes.server.ts`) with a contract,
    `setJamThemeCandidatesApi` (`lib/competitive/jam-themes.contract.ts`) — and **no client calls it**.
  - Admin actions are audited with `recordAdminActionIn` (`lib/admin-audit.server.ts`).
- **Decisions:**
  - **What can change, and when:**
    - Before `startsAt`: title, description, the secret theme (non-voting jams only: a voting jam's theme is the vote's
      result, so `theme` in its patch is refused with `JAM_EDIT_LOCKED`), every date, and for a voting jam the
      vote-open time while the vote has not opened (`themeVoteOpensAt` in the future) and no mark exists, re-resolved
      through `resolveVoteOpensAt` against the new start; the slug never changes (links stay valid).
    - After `startsAt` and before `submitEndsAt`: description, `submitEndsAt` and `ratingEndsAt` (only later than now,
      only extended, so no entrant loses time) — never the theme or the start.
    - After `submitEndsAt`: description and `ratingEndsAt` (extended only). After `ratingEndsAt`: nothing.
    - Turning a jam's theme vote on or off after creation is not offered (it changes what members were told).
  - **Validation:** the same date-order rule as `createJam` (`start < submissions close < rating close`), moved into one
    shared pure function used by both; every refusal has a code.
  - **Shortlist:** "Edit shortlist" calls the existing contract; it is offered only before the first mark (the server
    already refuses after), and the dialog says "The shortlist locks when the first member votes".
  - **Audit:** each save is one `recordAdminActionIn` row in the jam's update transaction (`game-jam-edit`, the jam id
    and the changed field names, never the secret theme's text).
  - **Members going:** entrants and voters are not notified of an edit this sprint (a changed deadline is visible on
    the page); recorded.

## Functional requirements

1. FR-1 `lib/competitive/jam-edit.ts` (new, pure): `editableFields(jam, now)`, `validateJamEdit(jam, patch, now)` (the
   shared date rule, extension-only after the start); `createJam` uses the same date rule.
2. FR-2 `lib/competitive/jams.server.ts`: `updateJam(adminId, slug, patch)` in one transaction that first takes
   `lockKey(tx, 'game-jam:<jamId>')` (so two admins' saves serialise), re-reads the jam inside the transaction,
   computes the phase from the dates read there and the time read there, and refuses with `JAM_EDIT_LOCKED` if a field
   in the patch is not editable in that phase (a phase that moved since the dialog opened is caught here); then the
   `update` and the audit row.
3. FR-3 `updateJamApi` in `lib/competitive/jams.contract.ts` and `PATCH` on `lib/competitive/api/jams.$slug.server.ts`
   (`auth: 'admin'`, `rateLimit: 'write'`, zod body of optional fields).
4. FR-4 UI: `components/competitive/JamEditDialog.tsx` and `components/competitive/JamShortlistDialog.tsx` (new),
   opened from `JamDetail.tsx` for admins; fields the phase locks are shown read-only with the reason.
5. FR-5 Refusal codes under `// s14-14 jam-editing`: `JAM_EDIT_LOCKED` ("This can no longer change: the jam has
   started"), `JAM_DATES_ORDER` ("Dates must run: start, submissions close, rating close"), `JAM_DEADLINE_SHORTER`
   ("Deadlines can only move later once the jam has started").

## Non-functional requirements

- **Secrecy:** the edit response never returns the secret theme to anyone but the admin, and the public `GET` is
  unchanged (the theme is still withheld before the start).
- **Integrity:** a phase change between opening and saving the dialog is caught in the transaction; two concurrent
  saves are serialised by the jam's lock, so the second is validated against the first's result (an extension cannot
  be undone by a stale shortening).
- **Query shapes (verify against the schema):** `GameJam` has no `updatedAt` column; compare the phase from the
  dates read inside the transaction, never an `updatedAt` filter.

## Data model and API

No schema change. `PATCH /api/jams/$slug` `{ title?, description?, theme?, startsAt?, submitEndsAt?, ratingEndsAt?,
themeVoteOpensAt? }` → the jam view.

## Testing requirements

- Product suite `lib/competitive/__tests__/jam-edit.product.test.ts`: editable fields per phase, the date rule,
  extension-only after the start.
- Main suite `lib/competitive/__tests__/jam-update.test.ts`: admin only, audited, the theme not echoed, a phase
  change refused, the slug unchanged.
- `lib/errors/__tests__/error-codes-catalogue.test.ts`, `lib/__tests__/field-names.test.ts`, the route table test.

## Acceptance criteria

- [ ] An admin fixes a jam's title before it starts; the page shows the new title at the same address.
- [ ] After the jam starts, the admin extends the submission deadline but cannot shorten it or change the theme.
- [ ] Before anyone votes, the admin replaces a voting jam's shortlist from the page.
- [ ] Each edit is in the admin audit log without the secret theme's text.

## Out of scope

Deleting a jam, notifying entrants of an edit, letting members suggest themes.
