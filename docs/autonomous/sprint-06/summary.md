# Sprint 06 — summary

Twenty features shipped on `claude/autonomous-sprint-06`. Each was built from its brief in its own worktree, reviewed
by a fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)). This file records
what shipped, what review and integration changed, what was verified, the follow-ups for the owner and the size of the
work.

## What shipped

| #   | Feature                                                                     | In one line                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Community bans and timeouts](features/01-community-bans.md)                | Moderators ban a member (for a set time or until lifted) or time them out; one `activeSanction` check gates join, invite, join request, posting, commenting, scheduling and the developer API. |
| 02  | [Moderator notes](features/02-community-notes.md)                           | Private notes on a community member, visible to that community's moderators, editable by their author for 15 minutes; erased with the account.                                                |
| 03  | [Undo, redo and the clipboard in the Studio](features/03-studio-editing.md) | RMH Studio gains undo/redo history and copy, cut and paste for clips and notes.                                                                                                               |
| 04  | [Export a mix and MIDI](features/04-studio-export.md)                       | Render the song or loop to a 16- or 24-bit WAV, export MIDI and pattern notes as a Standard MIDI File, and import MIDI.                                                                       |
| 05  | [Feedback inbox](features/05-feedback-inbox.md)                             | A findable feedback form, "Your feedback" in Settings with status and reply, and `/admin/feedback` with search, filters, outcomes and replies.                                                 |
| 06  | [Secure a member's account](features/06-admin-secure-account.md)            | Admins sign a member out everywhere and revoke keys, tokens, webhooks and the calendar feed in one audited transaction, without a ban; the member is told what changed.                       |
| 07  | [Written feedback on jam entries](features/07-jam-feedback.md)              | Raters can leave written (optionally anonymous) feedback with their scores; the entry's team reads it, marks it helpful and can report it.                                                    |
| 08  | [Copied decks get their author's changes](features/08-deck-updates.md)      | A copied study deck shows what the author changed, added and removed; the owner applies a selection, keeping review progress and never overwriting their own edits.                           |
| 09  | [Invite links for group chats](features/09-group-invites.md)                | Group owners create expiring, use-limited invite links; `/groups/join/<code>` previews the group and joins atomically.                                                                        |
| 10  | [Change or skip one date](features/10-event-occurrences.md)                 | Hosts skip or move one date of a repeating event; feeds, cards, answers and reminders follow the change.                                                                                      |
| 11  | [Updates to the people coming](features/11-event-updates.md)                | Hosts post short updates to an event's (or one date's) attendees, delivered by a pg-boss fan-out that skips blocked and banned accounts.                                                      |
| 12  | [Game webhooks](features/12-game-webhooks.md)                               | Developer webhooks for personal bests and achievements, documented in the SDK and docs.                                                                                                       |
| 13  | [Flashcards in the developer API](features/13-api-flashcards.md)            | `/api/v1/me/decks` and its cards: list, create, edit, upsert by `externalId`, and due counts, under a write budget.                                                                           |
| 14  | [Build comments](features/14-build-comments.md)                             | Authors edit (within a window) and delete their comments; build creators hide comments and lock the thread; comments can be reported.                                                         |
| 15  | [Describe GIFs](features/15-gif-descriptions.md)                            | Every posted GIF carries a description, written in every composer and announced wherever the GIF shows.                                                                                       |
| 16  | [Say what a content warning is for](features/16-content-warnings.md)        | A warning carries a short reason; readers choose to cover warned posts or show them with the reason as a label; embeds, RSS, share cards and quotes respect it.                               |
| 17  | [Read receipts and typing](features/17-read-receipts.md)                    | Account-wide switches for read receipts and the typing indicator in every conversation, both reciprocal, plus a fix for a search leak.                                                        |
| 18  | [Away message](features/18-away-message.md)                                 | An automatic away reply in direct messages, sent once per conversation per period, never to bots or banned senders.                                                                           |
| 19  | [Ranked-choice polls](features/19-ranked-polls.md)                          | Polls gain a Rank method, a ranking ballot and an instant-runoff result stored once when the poll ends.                                                                                       |
| 20  | [Confirm or dispute a result](features/20-match-results.md)                 | A participant's reported result becomes a claim the opponent confirms or disputes; hosts decide disputes; unanswered claims settle on their own after the window, except a prize-deciding one. |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The fixes that changed behaviour:

- **01:** closed ban bypasses through scheduled posts and pending join requests; the community-page notices became
  localised.
- **03:** a held pointer keeps a paused drag as one undo step; listeners are released on blur and on hot reload; the
  dialog guard was narrowed; note selection is announced.
- **05:** client error messages are scrubbed before storage; the removed GET endpoint, its test and docs, and unused
  keys were dropped.
- **07:** only the entry's team, or an admin, may report a piece of feedback.
- **09:** the join preview respects profile privacy; an import cycle between manage and invites was broken.
- **10:** the "every time" reminder chain survives a skipped date; the card refreshes after a change.
- **11:** banned accounts are left out of the update fan-out; admins see "Post an update"; ICS updates appear only when
  the feed owner can view the event.
- **12:** `previousScore` is nullable in the SDK.
- **14:** a deleted comment that has replies keeps a tombstone that no longer carries its author; the report form loads
  on demand; component reads moved from `useEffect` to React Query.
- **15:** the GIF description is kept in the autosaved composer draft.
- **16:** quote cards are covered by the quoted post's warning; the preference is in the export.
- **17:** the receipt and typing switches are pinned in the export test.
- **18:** bot and banned senders are skipped; voice notes are covered.
- **19:** scheduled ranked polls keep their method; a lifecycle/ballot import cycle was broken.

## Fixes made at integration

- **01, refusal text.** A refused join, join request, invite, post, reply or scheduled post showed the server's
  English `error` with the end date in UTC. The UI now builds the sentence from the response's `code` and `endsAt`,
  through `t()` and `useLocaleFormat` (`components/communities/useSanctionRefusal.ts`, four new `community-bans` keys).
- **01, re-request after a ban.** A ban marks the member's join request REMOVED, which carries a seven-day cooldown.
  `requestToJoin` now waives the cooldown when the REMOVED row was written by a ban that has expired or been lifted; a
  plain removal keeps it. Tested both ways.
- **20, starved claims.** The settlement job only reads claims in live tournaments and pages past claims it cannot
  settle (bounded at 500 per run), so prize-deciding claims no longer starve the rest.
- **06, push subscriptions.** "Sign out everywhere" also deletes the member's web-push subscriptions. Email-change
  verifications are not keyed by user, so a pending email change is not revoked; this is noted in the code and the
  feature doc.
- **Branch ratchets during the sprint.** The error scrubber moved to a zod-free module so zod stays off the hot routes;
  nine components moved their reads from `useEffect` to React Query to hold the ratchet at its baseline; the build
  comment report form loads on demand; the prepaint script was regenerated; a private-community test mock gained the
  ban lookup.
- **Typecheck.** 26 errors appeared only after the merges, among them two real bugs: the ranked-poll result's
  compare-and-set filtered a `Json` column with a bare `Prisma.DbNull` (now `{ equals: Prisma.DbNull }`), and editing
  only a GIF description read `imageAlts` without selecting it, which would have blanked the post's image descriptions.
- **Gates.** A FOUC fixture for `/groups/join/$code`; the RSS content-warning line dropped an unsupported per-call
  interpolation option; the developer explorer knows the new `study` docs page; a hook in RequestToJoin moved above its
  early return.
- **Browser pass.** In `ar`, the Studio export file name reads left to right; the Settings > Privacy "Messages" section
  passes its explanation as the section description.
- **Generated files.** The route tree (official generator) and `facts.json` were regenerated; extractor drift outside
  sprint 06 was reverted.

## Verification

- `tsc -b --checkers 1`: clean. `pnpm typecheck:strict`: clean.
- `pnpm lint`: 0 errors; no new warnings against `main`.
- `pnpm test`: 14,910 passed. `pnpm test:product`: 1,699 passed.
- `pnpm build` and the bundle budget: pass. `pnpm check:consistency --base main`: pass.
- **Postgres 16 smoke** against a throwaway database: all 417 migrations applied; the three `CONCURRENTLY` indexes
  valid and no index invalid; `migrate diff` shows only drift from objects outside the Prisma schema that predate this
  sprint. Run against the real functions, all passing: the ban gate, the group invite join compare-and-set (two
  concurrent joins on a one-use link, one succeeds), event skip and move overrides and their pg-boss reminder keys,
  update recipients, the feedback raw-SQL search, the build-comment and community-note edit windows, the ranked-poll
  result, the match-claim job query and flashcard due counts.
- **Browser pass** with the production build over nine new surfaces, each in Day and Night at 390 and 1280 px and in
  `ar` at 390: 45 screenshots, no hydration warnings, no horizontal page scroll.

## Owner follow-ups

- **Moderator notes in the data export** remain excluded and open (sprint 03's decision). This now covers 02's community
  notes and 01's private sanction reasons too.
- **Prize-deciding claims (20)** never settle on their own: an unanswered claim on a final waits for the opponent or the
  host.
- **Read receipts (17)** were rescoped to two account-wide switches; the per-conversation switches stay.
- **Studio editing (03):** after saving and then undoing back to the saved state, `projectDirty` still reads true.
- **Event occurrences (10):** a moved date is only checked against its original neighbours, not against other moved
  dates.
- **Event updates (11):** the fan-out is at-most-once if the worker is killed mid-send, and an update's audience is
  fixed when it is posted.
- **Secure account (06):** pending email-change verifications are not revoked.
- **Found in the browser pass, not fixed:** at 390 px a bracket match card's second winner button sits partly
  off-screen inside the bracket's horizontal scroll area; the Studio's mobile header toggle has no accessible name
  (predates the sprint); in `ar` with English fallback strings, "24-bit" renders as "bit-24".
- **Schema drift outside the Prisma schema** (pgvector `embedding`, trigram and tsv indexes) shows in `migrate diff`,
  as before this sprint.
- Sprint 03, 04 and 05's open decisions still stand.

## Size

Measured with `git diff --numstat origin/main` over the sprint branch, excluding generated files
(`lib/api/route-table*`, `app/routeTree.gen.ts`, `docs/_generated`, `lib/prepaint/generated.ts`, `docs/site-reference`,
`packages/sdk`).

| Kind                                                 | Added  | Removed |
| ---------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts) | 83,182 | 1,709   |
| of which tests                                       | 36,010 | 71      |
| Documentation                                        | 11,191 | 4       |
| English catalogs (`locales/en`)                      | 722    | 14      |

Per feature, code and tests as merged (from each `Merge branch 'autonomous/s06-*'` commit, before the integration
fixes; generated files, docs and catalogs excluded):

| #   | Feature              | Code  | Tests |
| --- | -------------------- | ----- | ----- |
| 01  | community-bans       | 3,341 | 1,946 |
| 02  | community-notes      | 1,060 | 569   |
| 03  | studio-editing       | 2,713 | 2,378 |
| 04  | studio-export        | 5,507 | 3,676 |
| 05  | feedback-inbox       | 4,851 | 2,132 |
| 06  | admin-secure-account | 1,919 | 1,249 |
| 07  | jam-feedback         | 1,039 | 545   |
| 08  | deck-updates         | 3,400 | 1,909 |
| 09  | group-invites        | 2,838 | 2,398 |
| 10  | event-occurrences    | 3,399 | 3,020 |
| 11  | event-updates        | 1,035 | 441   |
| 12  | game-webhooks        | 823   | 1,277 |
| 13  | api-flashcards       | 2,981 | 2,882 |
| 14  | build-comments       | 2,302 | 1,970 |
| 15  | gif-descriptions     | 1,040 | 2,694 |
| 16  | content-warnings     | 992   | 592   |
| 17  | read-receipts        | 691   | 1,171 |
| 18  | away-message         | 870   | 440   |
| 19  | ranked-polls         | 2,605 | 1,787 |
| 20  | match-results        | 3,491 | 2,478 |
