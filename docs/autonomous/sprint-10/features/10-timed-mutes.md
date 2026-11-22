# 10 — Mute an account for a day, a week or a month

Surface: the post menu's "Mute", `/settings/blocked`. Wave 5. Namespace `timed-mutes`. Site tier (Steel).

## User story

As a member who wants a break from an account during an election or from spoilers for a film I have not seen yet, I want
to mute an account for a day, a week or a month and have it come back on its own, as muted words already can, so that I
do not have to remember to undo a mute I only meant for a while.

## Requirements elicitation

- **What exists (verified):**
  - Account mutes: `UserMute (muterId, mutedId, createdAt)` (`prisma/schema/moderation.prisma`), toggled by
    `toggleMuteApi` (`lib/moderation/moderation.contract.ts`, `lib/moderation/api/moderation.mute.server.ts`) from
    `components/feed/RMHarkOverflowMenu.tsx` and `components/settings/BlockedMutedPage.tsx`; read by
    `getHiddenAuthorIds` (`lib/moderation.server.ts`, the helper most feed readers call) and directly by
    `lib/moderation/blocked-muted.server.ts`, `lib/discovery/watch.server.ts`, `lib/safety/view-as.server.ts`,
    `lib/communities/post-alerts.server.ts`, `lib/messages/away.server.ts` and `lib/feed/poll-lifecycle.server.ts`;
    written by `lib/moderation/api/moderation.mute.server.ts`; exported by `lib/account/api/account.export.server.ts`.
  - **Muted words already expire (validation pass 2; an earlier draft re-specced them).** `UserProfile.mutedWords` has
    `mutedWordExpiries Json` beside it (`prisma/schema/profile.prisma`), with `MUTE_DURATIONS` (`day`, `week`, `month` =
    30 days), `MAX_MUTE_MS` and `activeMutedWords` in `lib/feed/muted-expiry.ts`, applied by `getMutedWords` in
    `lib/feed/timeline.ts`, written by `lib/preferences/api/preferences.muted-words.server.ts` and offered in
    `components/site/MutedWordsPanel.tsx` (sprint 05). This feature does not touch words.
  - Account mutes have no end: a `UserMute` row lasts until undone.
- **Decisions:**
  - **Durations:** the muted-words durations, reused from `MUTE_DURATIONS` (`day`, `week`, `month`) so the two mute
    kinds offer the same choices, or "Until I unmute" (today's behaviour, the default). The menu item becomes a small
    menu ("Mute for 24 hours / 7 days / 30 days / until I unmute"); the settings lists show "until <date>" in the
    member's locale and an "Extend" action.
  - **Account mutes:** a nullable `UserMute.expiresAt`; every reader treats a row whose `expiresAt` is past as absent.
    The filter lives in one exported predicate, `activeMuteWhere(now)`, and `MUTE_READ_PATHS` lists the seven readers
    with a source-scan test (a new reader of `userMute` must use the predicate or be exempted with a reason). Exempt,
    with their reasons: the toggle endpoint (it writes), and the account export (`account.export.server.ts`, which
    implementers never edit: it exports the member's own rows with every column, `expiresAt` included, an expired one
    included until the job removes it).
  - **Clean-up:** a daily job deletes expired `UserMute` rows in batches of 1,000, so the table does not grow;
    correctness never depends on the job (read-time filtering does).
  - **No notice** when a mute ends (the muted account is never told about a mute either way).
  - **Export:** nothing to add: `account.export.server.ts` reads `prisma.userMute.findMany({ where: { muterId } })` with
    no `select`, so `expiresAt` appears in the export as soon as the column exists (a test asserts it); the sprint 10
    export anchor is not used. **Erasure:** unchanged: `UserMute` is already `erase` in the registry and the new column
    goes with its row; no new model, no `User` relation, no registry or deletion change.

## Functional requirements

1. FR-1 `UserMute.expiresAt DateTime?` plus an index for the clean-up.
2. FR-2 `activeMuteWhere(now)` in `lib/moderation/mute-expiry.ts` (pure, Prisma-where shaped) adopted by the seven
   `MUTE_READ_PATHS` readers.
3. FR-3 `toggleMuteApi` accepts an optional `duration` (`day | week | month | forever`, the `MuteDuration` names),
   additive; an existing mute's duration can be changed ("Extend").
4. FR-4 The post menu's duration submenu, the "until <date>" line and "Extend" in the muted accounts list.
5. FR-5 The clean-up job (jobs anchor).

## Non-functional requirements

- **Correctness:** a past `expiresAt` is never honoured, whether or not the job has run; time comparisons use the
  database's `now()` or the server clock, never the client's.
- **Performance:** the predicate adds `OR expiresAt IS NULL OR expiresAt > now` to queries already filtered by
  `muterId`; no new index on the read path.
- **Accessibility:** the submenu is the menu primitive; "until <date>" is text.

## Data model and API

- `prisma/schema/moderation.prisma`: `UserMute.expiresAt DateTime?` and `@@index([expiresAt])`; migrations
  `20261130050300_s10_timed_mutes` (the column), `20261130050301_s10_user_mute_expires_index` (one
  `CREATE INDEX CONCURRENTLY "user_mute_expiresAt_idx"`), `20261130050302_s10_user_mute_expires_index_ensure_valid`.
- New `lib/moderation/mute-expiry.ts`, `lib/moderation/mute-expiry-jobs.server.ts`,
  `components/feed/MuteDurationMenu.tsx`.
- Edits: the seven readers, `lib/moderation/api/moderation.mute.server.ts`, `lib/moderation/moderation.contract.ts`,
  `components/feed/RMHarkOverflowMenu.tsx`, `components/settings/BlockedMutedPage.tsx`, and the anchored files
  (`server/jobs/index.ts` only). Not `lib/feed/timeline.ts`, the muted-words files or `auth.prisma`.

## Testing requirements

- Main suite `lib/moderation/__tests__/timed-mutes.test.ts`: an expired mute does not hide the author in
  `getHiddenAuthorIds`; the job deletes expired rows only; extend changes the expiry; "forever" stores null; the
  durations are `MUTE_DURATIONS`' values.
- Main suite `lib/moderation/__tests__/mute-read-paths.test.ts`: the source scan for `MUTE_READ_PATHS`.
- Product suite `lib/moderation/__tests__/mute-duration.product.test.ts`: durations to instants.
- Migration safety; `lib/account/__tests__/export-sprint-10.test.ts` unchanged; a test that the export's `userMute` read
  has no `select` (so `expiresAt` is carried).

## Acceptance criteria

- [ ] Muting an account for 24 hours hides its posts now and shows them again a day later without any action.
- [ ] `/settings/blocked` shows "until <date>" and "Extend".
- [ ] Every reader of mutes uses the shared predicate (the scan passes).

## Out of scope

Timed blocks, muted words (they already expire), muting a community or a tag, muting notifications only, telling anyone
a mute ended.
