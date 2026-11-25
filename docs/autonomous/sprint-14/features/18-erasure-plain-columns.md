# 18 — Erasure that sees every member column, not only relations

Surface: account deletion (`anonymizeAccount`), the erasure registry and its coverage test, `docs/account-deletion.md`.
Wave 7. No namespace (no UI).

## User story

As a member who deletes their account, I want every row that names me to be erased or de-identified, including the
tables that store my id in a plain column, so that "deleted" means deleted wherever the site kept me.

## Requirements elicitation

- **What exists (verified):**
  - The erasure registry (`lib/account/erasure-registry.ts`, `ERASURE_REGISTRY`, `TODO_CEILING = 4`) classifies every
    model with a **relation to `User`**; `lib/account/__tests__/erasure-coverage.test.ts` parses `prisma/schema/**` and
    fails a related model with no entry. A model that holds a member's id in a plain `String` column with no relation
    is invisible to it. Sprint 13's README recorded this ("Erasure coverage cannot see plain `userId` columns") after
    06 had to add its own operation for `RmhTubeChatMessage` (17's `ChatMessageEdit` reaches the member only through
    `ChatMessage.senderId`, so it carries no member column and is out of this scan).
  - The design pass's scan of the schema (any `String` column named `userId`, `*UserId`, `authorId`, `ownerId`,
    `reporterId`, `actorId`, `creatorId`, … on a model with no `User` relation) finds these models; the operation
    column says what `lib/account/` already does (a grep for the model's Prisma accessor under `lib/account/`):

    | Model (file) | Column(s) | Already handled |
    | --- | --- | --- |
    | `SecurityReport` (auth) | `userId` | no |
    | `CommunityMemberEvent` (communities) | `userId` | yes (`deletion.server.ts`) |
    | `CommunityMemberNote` (communities) | `authorId` | no |
    | `CommunityModAction` (communities) | `actorId`, `targetUserId` | yes |
    | `TournamentPayout` (competitive) | `userId` | no |
    | `AccountErasureAttempt` (deletion) | `userId` | yes |
    | `ReleaseNote` (developer) | `authorId` | no |
    | `DiscordAlexCaretaker` (discord) | `userId` (a Discord id) | no |
    | `DiscordChatSession` (discord) | `discordUserId` | no |
    | `DoctrineIncident` (doctrine) | `firstReporterId` | no |
    | `DoctrineSafehouseContent` (doctrine) | `authorId` | no |
    | `EventUpdate` (events) | `authorId` | no |
    | `RMHboxMatch` (games/rmhbox) | `winnerUserId` | no |
    | `RMHboxMatchPlayer` (games/rmhbox) | `userId` | yes (`erasure-games.server.ts`) |
    | `SSLobby`, `SSLobbyMember`, `SSPlayerMatch` (games/synapse-storm) | `hostUserId`, `userId` | by feature 03 |
    | `BlogPostRevision` (library) | `authorId` | yes |
    | `ReadingHighlightPassage` (library) | `userId` | cascade from `ReadingHighlight` |
    | `ChatRemoval` (messaging) | `userId` | no |
    | `LadderWorkerLease` (rmhladder) | `ownerId` (a worker id) | not a member |
    | `RmhStudySession` (rmhstudy) | `userId` | cascade from `RmhStudyProfile` |
    | `RmhTubeChatMessage` (rmhtube) | `userId` | yes (sprint 13 06) |
    | `RmhTypeMatch` (rmhtype) | `winnerUserId` | no |
    | `RmhTypeMatchPlayer` (rmhtype) | `userId` | yes (`erasure-games.server.ts`) |
    | `PostLifecycle` (social) | `userId` | no |
    | `StudioProjectRevision` (studio) | `userId` | cascade from `StudioProject` |
    | `StudioProjectShareOpen` (studio) | `userId` | yes (sprint 11 07) |

    **Added by the validation pass** (a script over `prisma/schema/**` for `String` columns named `userId`,
    `*UserId`, `authorId`, `ownerId`, `actorId`, `createdById`, `followerId`, `followingId`, `firstReporterId`,
    `discordUserId` on models with no field typed `User`; the design pass's pattern had no `createdById` and no
    follow columns, so these nine were missing):

    | Model (file) | Column(s) | Already handled |
    | --- | --- | --- |
    | `FollowEvent` (social) | `followerId`, `followingId` | yes (`deleteFollowEventsFor`, `lib/social/follow-events.server.ts`: followed rows deleted, follower de-identified) |
    | `CommunityChallenge` (communities) | `createdById` | no |
    | `CommunityCensus` (communities) | `createdById` | no |
    | `ModMacro` (developer) | `createdById` | no |
    | `TargetedNotice` (developer) | `createdById` (optional) | no |
    | `CommunityGoal` (economy) | `createdById` | no |
    | `EventOccurrenceOverride` (events) | `createdById` (optional) | no |
    | `CanvasEvent` (games) | `createdById` | no |
    | `StudioChallenge` (moderation) | `createdById` | no |

- **Decisions:**
  - **A second registry:** `PLAIN_MEMBER_COLUMNS: Record<string, ErasureEntry & { columns: string[] }>` in
    `lib/account/erasure-registry.ts`, keyed by model, with the same decisions and one more, `not-member` (a column
    that holds something other than a site member's id, with the reason). The coverage test gains a parser pass: any
    model with a matching column name and no `User` relation must be in `PLAIN_MEMBER_COLUMNS`, and every `erase` or
    `deidentify` entry must be matched by an operation in `lib/account/` naming that model (the same check the
    relation registry makes). The column-name pattern is one exported list, `MEMBER_COLUMN_PATTERN`, so a future name
    joins it in one place.
  - **Default decisions** (each verified against its readers before it is written, and changed with a reason if the
    code disagrees):
    - `erase`: `ChatRemoval` (the member's own "removed from this chat" marks).
    - `keep` with the post's rule: `PostLifecycle` (it stays with the post, which `RMHark: deidentify` keeps under
      "Deleted user").
    - `deidentify` (null or tombstone the id, keep the row): `SecurityReport` (`userId`, `reporterName`,
      `reporterEmail`, `ipHash` nulled; the report stays for the security record), `DoctrineIncident.firstReporterId`,
      `RMHboxMatch.winnerUserId`, `RmhTypeMatch.winnerUserId` (the player rows already say "Deleted user").
    - `keep` with the rule: `TournamentPayout` (a ledger: Rule "ledgers stay", the coin rows are kept the same way),
      `ReleaseNote` and `EventUpdate` and `DoctrineSafehouseContent` (published content shown under "Deleted user"),
      `CommunityMemberNote` (a moderator's note about another member is the moderators' record; the open owner decision
      about moderator notes in the export is not touched).
    - `cascade` with its parent: `ReadingHighlightPassage` (`ReadingHighlight`), `RmhStudySession`
      (`RmhStudyProfile`), `StudioProjectRevision` (`StudioProject`).
    - `not-member`: `LadderWorkerLease.ownerId` (a worker process id), `DiscordAlexCaretaker.userId` and
      `DiscordChatSession.discordUserId` (Discord ids, not site accounts; the Discord bot's own data policy covers
      them).
    - `deidentify` (the author column of staff- or moderator-made content that stays up, nulled where optional,
      set to the shared deleted-user id, `DELETED_USER_ID`, where required): `CommunityChallenge`, `CommunityCensus`,
      `ModMacro`, `CommunityGoal`, `CanvasEvent`, `StudioChallenge` (required columns: the deleted-user id),
      `TargetedNotice`, `EventOccurrenceOverride` (optional: `null`). The content keeps serving its community or the
      site, as `Community` and `Event` do under rules 2 and 3; only the pointer to the person goes. The implementer
      verifies each against its readers (an admin page that joins `createdById` to a user must tolerate the
      deleted-user id, as the follow log's readers already do).
    - `FollowEvent` is classified with the decisions `deleteFollowEventsFor` already implements (`erase` for
      `followingId`, `deidentify` for `followerId`); the registry entry carries both columns and names that
      operation.
    - Already handled entries are classified with the decision their operation implements.
  - **Every decision is a real one:** no `todo`; `TODO_CEILING` stays 4 for the relation registry, and the plain
    registry has no `todo` at all.
  - **Docs:** `pnpm docs:deletion` lists the plain-column entries in their own section of `docs/account-deletion.md`.

## Functional requirements

1. FR-1 `PLAIN_MEMBER_COLUMNS`, `MEMBER_COLUMN_PATTERN` and the `not-member` decision in
   `lib/account/erasure-registry.ts`.
2. FR-2 The coverage test's plain-column pass (`lib/account/__tests__/erasure-coverage.test.ts`, or a sibling
   `erasure-plain-columns.test.ts` reusing its parser).
3. FR-3 New operations for the entries not yet handled (`SecurityReport`, `ChatRemoval`, `DoctrineIncident`,
   `RMHboxMatch`, `RmhTypeMatch`, the eight `createdById` models above, and any the verification adds) in
   `lib/account/erasure-plain.server.ts` (new), spread under `// s14-18 erasure-plain-columns` in `anonymizeAccount`.
   The column-name list `MEMBER_COLUMN_PATTERN` includes at least every name in the two tables above, so the test
   finds all 37 models; a test asserts the parser finds at least that many (a floor, so a broken parser fails loudly).
4. FR-4 The docs generator (`scripts/generate-account-deletion-doc.ts`, `pnpm docs:deletion`) renders the new section;
   `docs/account-deletion.md` regenerated.

## Non-functional requirements

- **Safety:** no operation deletes another member's row; tombstones never collide with a unique key (use the row's own
  id in the tombstone where a unique key covers the column).
- **Order:** the operations run inside the existing transaction array (Prisma operations only, no `$executeRaw`
  inside the array).
- **Query shapes (verify against the schema):** `SecurityReport.userId` is optional (`String?`), so `updateMany({ where:
  { userId }, data: { userId: null, … } })` is valid; `RMHboxMatch.winnerUserId` and `RmhTypeMatch.winnerUserId` are
  optional too; check each column's optionality before writing `null` to it.

## Data model and API

No schema change.

## Testing requirements

- Main suite `lib/account/__tests__/erasure-plain-columns.test.ts`: the parser finds every model in both tables above
  (37 at the design tip, 03's three among them); an unlisted model fails; an `erase` / `deidentify` entry
  without an operation fails; a fixture schema with a new `createdById` column and no entry fails, naming the model.
- Main suite `lib/account/__tests__/plain-erasure.test.ts`: each new operation (recording Proxy stub, as
  `study-erasure.test.ts`), and that no operation targets rows of another member.
- `lib/account/__tests__/erasure-coverage.test.ts` (unchanged count, `TODO_CEILING` 4), the deletion docs freshness
  check.

## Acceptance criteria

- [ ] Adding a model with a plain `authorId` column and no registry entry fails the coverage test, naming the model.
- [ ] After erasure, a member's security report keeps its text but not their id, name, e-mail or address hash.
- [ ] `docs/account-deletion.md` lists every plain-column model with its decision.

## Out of scope

Adding `User` relations to these models, changing the open owner decisions, the Discord bot's own data.
