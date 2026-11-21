# 15 — Game jam teams

Surface: game jams (`/jams/$slug`, `components/competitive/JamDetail.tsx`,
`lib/competitive/jams.server.ts`), notifications. Wave 5. Namespace `jam-teams`.

## User story

As a jam entrant who built a game with friends, I want to list my teammates on
our entry so they are credited, see the results as theirs, and cannot rate our
own game — and as an invited teammate I want to accept or decline being listed.

## Requirements elicitation

- **What exists (verified):** `GameJam`, `GameJamEntry` (one per member per jam:
  `@@unique([jamId, userId])`, and one per build), `GameJamRating` (four 1–5
  categories) in `prisma/schema/competitive.prisma`. `submitEntry` requires a
  public build owned by the submitter and made during the jam; `getJam` lists
  entries with one author; `rateEntry` refuses rating your own entry (read it
  for the exact rule). Builds have no co-authors either (`UserBuild` has one
  `userId`). Nothing about teams exists (`grep -ri "jamTeam\|teamMembers"` finds
  nothing).
- **Decisions:** the submitter owns the entry and may invite up to 3 teammates
  (a team of at most 4) while submissions are open. An invite is accepted or
  declined by the invitee; until accepted they are not listed. A member may be
  on only one entry per jam (as submitter or accepted teammate); accepting a
  second is refused. Accepted teammates are credited on the entry and in
  results, cannot rate their own entry, and may leave the team; they cannot
  change the build or remove others. Blocks either way refuse an invite; banned
  members cannot be invited. After submissions close the team is fixed (no
  invites, accepts or leaves), so results never change owners after rating
  starts.

## Functional requirements

1. FR-1 On the jam page, the submitter's own entry gains "Team": invite by
   member search (reuse the mention search), the list with Invited / Teammate
   and Remove.
2. FR-2 The invitee gets a notification ("{{name}} added you to their entry in
   {{jam}}", `SYSTEM`, `entityType: 'jam_team'`, link to the jam) and Accept /
   Decline on the jam page.
3. FR-3 Entries and results show "by A, B and C" (`Intl.ListFormat`).
4. FR-4 Rating is refused for the submitter and accepted teammates of that
   entry; the rate control is hidden for them.
5. FR-5 Accepting while already on another entry of the same jam is refused
   ("You are already on {{entry}}"); submitting an entry while an accepted
   teammate elsewhere in the jam is refused likewise.
6. FR-6 After `submitEndsAt`, team controls are read-only.

## Non-functional requirements

- **Correctness:** invites, accepts and submissions take
  `lockKey(tx, 'jam-team:' + jamId + ':' + userId)` for the member being placed
  and check "one entry per member per jam" inside the transaction; the team cap
  uses `lockKey(tx, 'jam-entry-team:' + entryId)`.
- **Security:** endpoints `auth: 'required'`, zod-validated; only the submitter
  invites or removes; only the invitee responds; the existing jam-page loader
  stays the source of what the viewer may do. Rating checks run on the server
  (`rateEntry`), not only in the UI.
- **Privacy:** pending invites are visible to the submitter and invitee only.
  Erasure deletes the member's team rows (their entries cascade as today through
  `GameJamEntry` handling — check whether `anonymizeAccount` erases jam entries;
  if it does not, this feature erases the member's team rows only and reports
  the entry gap).
- **i18n:** `jam-teams`.
- **Steel:** team rows on rules; Accept is the one ink primary on an invited
  viewer's view.
- **Accessibility:** search is a labelled combobox; live region for state
  changes.

## Data model and API

- `GameJamTeamMember { entryId, userId, jamId (copied for the one-entry rule),
  status VarChar(9) ('invited'|'accepted'), invitedAt, respondedAt? }`,
  `@@id([entryId, userId])`, `@@index([jamId, userId])`, relations to
  `GameJamEntry` (cascade) and `User`, `@@map("game_jam_team_member")`.
  Migration `20261125050200_s05_jam_teams`.
- `lib/competitive/jam-teams.server.ts` (`inviteTeammate`,
  `respondToTeamInvite`, `removeTeammate`, `leaveTeam`, `listTeam`,
  `jamTeamErasureOps`); `lib/competitive/jam-teams.ts` (pure: who may rate, the
  one-entry rule, credit list shaping). `getJam` rows gain `team: User[]`
  (accepted) and `viewerTeamState`.
- Contract `lib/competitive/jam-teams.contract.ts`; modules
  `lib/competitive/api/jams.$slug.entries.$entryId.team.server.ts` (GET, POST
  invite `{ userId }`, DELETE `?userId=`),
  `jams.$slug.entries.$entryId.team.respond.server.ts` (POST `{ accept }`).
- Notification label `jam_team` → "Game jams" in
  `components/feed/notification-labels.ts` under the anchor, with its test line.

## Testing requirements

- Main suite `lib/competitive/__tests__/jam-teams.test.ts`: cap of 3 teammates;
  one entry per member per jam (accept and submit paths, under the lock); a
  teammate cannot rate their entry (server); blocks and bans refused; nothing
  changes after submissions close.
- Main suite `lib/account/__tests__/jam-teams-erasure.test.ts`.
- Product suite `lib/competitive/__tests__/jam-teams.product.test.ts`.

## Acceptance criteria

- [ ] A submitter invites two friends; after they accept, results credit all
      three.
- [ ] A teammate cannot rate their own entry, even by calling the API.
- [ ] A member cannot be on two entries in one jam.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Co-authored builds, team pages, prize splitting (jams have no prizes).
