# 20 — Close the gaps sprint 13 left open

Surface: seven small fixes recorded in `docs/autonomous/sprint-13/summary.md` ("Owner follow-ups" and "Found at
integration"): RMHBox pack reports, group-message takedowns, the RMHTube composer, the admin deletions page, Altair's
menu audio and "Your runs" focus, Vega's assist claim, and ranked tier names. Wave 7. Namespaces: each fix writes into
its file's existing namespace (`admin-deletions`, `ranked-standing`, `altair-runs`, `tube-chat-reports`), plus
`errors` if a refusal changes.

## User story

As a member and as a moderator, I want the rough edges sprint 13 found and wrote down to be fixed — a pack that stays
hidden after its report was resolved, a reply count that is wrong after a takedown, an English tier name in a
translated page — so that the features behave as their specifications said.

## Requirements elicitation

- **What exists (verified), one item each:**
  - **(a) S13-16, a resolved report leaves a pack hidden.** `restoreReportedPack` (`lib/party/pack-moderation.server.ts`)
    brings back an auto-hidden pack (`autoHiddenAt` set, `moderatedAt` null) when its last open report is dismissed or
    withdrawn; `decideReports` (`lib/moderation/triage.server.ts`) does not call it for a **resolve** without a
    takedown, so a pack the reports hid stays hidden for good after a moderator decides it was fine to keep.
  - **(b) S13-17, a group-message takedown leaves a stale reply count.** `takeDownDmMessage`
    (`lib/messages/dm-reports.server.ts`) hard-deletes a group message (cascading its thread replies, reactions and
    versions) without decrementing the parent message's `replyCount` (`ChatMessage.replyCount`,
    `prisma/schema/messaging.prisma`).
  - **(c) S13-06, the RMHTube composer keeps a removed reply target.** When a moderator removes a room message
    (`CHAT_REMOVED_CHANNEL`), `components/rmhtube/ChatPanel.tsx` replaces it with "Message removed" but the composer's
    reply target, if it is that message, stays and the reply sends a dangling `replyToId`.
  - **(d) Integration, `/admin/deletions`.** `components/admin/DeletionsAdmin.tsx` says "{{n}} accounts in their grace
    period" and "{{n}} accounts due more than 24 hours ago…" for any `n` (so "1 accounts"), and shows "No attempt
    failed yet" in `text-site-danger`.
  - **(e) Integration and S13-03, Altair.** The menu creates Howler sounds (`features/altair/engine/audio/music.ts`,
    `sfx.ts`), which create an `AudioContext` before any gesture, and Chrome logs an autoplay warning; opening "Your
    runs" (`features/altair/ui/screens/RunsScreen.tsx`) does not move focus into the screen.
  - **(f) S13-02, Vega's assist claim.** `POST /api/vega/score` (`features/vega/api/vega.score.server.ts`) returns 400
    for an invalid run **before** `consumeAssistRun` (`lib/game/assist-run.server.ts`), so the claim survives a
    rejected run and a re-POST after turning assists off ranks.
  - **(g) S13-13, tier names in English.** `tierForRating(rating).label` (`lib/ranked/tiers.ts`: Master, Diamond,
    Platinum, Gold, Silver, Bronze) is sent as English by `lib/ranked/season.server.ts` and shown as is by
    `components/feed/RankedColumn.tsx` (and `components/feed/RankedStanding.tsx`).
- **Decisions:**
  - (a) A resolve **without** takedown of the last open report of an auto-hidden pack restores it through
    `restoreReportedPack` (a resolve **with** takedown already stamps `moderatedAt`); a pack an admin hid by hand is
    never restored (unchanged rule).
  - (b) The takedown decrements the parent's `replyCount` in the same transaction, never below zero (the
    `gameThread` pattern: `updateMany` with `replyCount: { gt: 0 }`).
  - (c) The panel clears the reply target when the removal names it, and the hub ignores a `replyToId` that is no
    longer in the room (the reply sends as a plain message).
  - (d) Both sentences use `count` plurals (`_one` / `_other` keys, new keys since the wording changes), and "No attempt
    failed yet" is `text-site-text-muted`.
  - (e) Howls are created on the first pointer or key event (the sfx module's existing resume path is the hook), never
    at import or menu mount; "Your runs" focuses its heading (`tabIndex={-1}`) on open, without `requestAnimationFrame`.
  - (f) The claim is consumed first, then the run is validated: a rejected run spends the claim (an honest client
    never sends one), so a later re-POST is unranked only if it starts a new assisted run. The schema-invalid body
    (rejected by `implement()`'s `invalid` before the handler) is left as is; recorded.
  - (g) `season.server.ts` sends the tier `id` (a new `tierId` field beside the old `tier`, which stays for the
    developer API's shape), and the two components translate it with six literal keys in `ranked-standing`.
- **Not taken:** S13-09's all-day bucketing and `LadderJob.updatedAt` (a product and schema call), S13-12's two story
  follows (an owner decision), S13-14's payout rounding (a product call), S13-15's cancelled-trip report (needs a sync
  field), S13-17's concurrent-edit snapshot and erasure-under-report tradeoff, S13-18's webhook-dependent cases, S13-19's
  developer API "A player" (an API string, English by design of the envelope).

## Functional requirements

1. FR-1 (a) `lib/moderation/triage.server.ts` `decideReports`, resolve branch for `rmhbox-pack` only.
2. FR-2 (b) `lib/messages/dm-reports.server.ts` `takeDownDmMessage`.
3. FR-3 (c) `components/rmhtube/ChatPanel.tsx`; `server/rmhtube/chat-handler.ts` (`onChat`'s reply lookup).
4. FR-4 (d) `components/admin/DeletionsAdmin.tsx`.
5. FR-5 (e) `features/altair/engine/audio/music.ts`, `features/altair/engine/audio/sfx.ts`,
   `features/altair/ui/screens/RunsScreen.tsx`.
6. FR-6 (f) `features/vega/api/vega.score.server.ts`.
7. FR-7 (g) `lib/ranked/season.server.ts`, `lib/ranked/tiers.ts` (an exported id type), `components/feed/RankedColumn.tsx`,
   `components/feed/RankedStanding.tsx`.

## Non-functional requirements

- **Scope:** only these seven; anything else found is reported, not fixed.
- **Each item has a test** that fails before the fix.
- **Query shapes (verify against the schema):** `ChatMessage.replyCount` is required with a default; the parent is
  `threadParentId` (optional), read before the delete; a top-level message has none and nothing is decremented.

## Data model and API

No schema change. `GET /api/ranked/*` standing and ladder rows gain `tierId`.

## Testing requirements

- (a) `lib/party/__tests__/pack-resolve-restore.test.ts`; (b) `lib/messages/__tests__/dm-takedown-reply-count.test.ts`;
  (c) `server/rmhtube/__tests__/chat-dangling-reply.test.ts` and a pure test of the panel's reducer if it has one;
  (d) `components/admin/__tests__/deletions-plurals.test.tsx` (`renderToStaticMarkup`); (e)
  `features/altair/engine/audio/__tests__/deferred-audio.test.ts` (no Howl before a gesture) and
  `lib/__tests__/audio-context-ratchet.test.ts`, `lib/__tests__/raf-loop-allowlist.test.ts`; (f)
  `features/vega/api/__tests__/` a rejected run consumes the claim; (g) `lib/ranked/__tests__/tier-ids.test.ts` and the
  i18n computed-key gate.

## Acceptance criteria

- [ ] Resolving (without removing) the last report of a pack the reports hid brings the pack back.
- [ ] Taking down a reply in a group thread lowers the parent's reply count by one.
- [ ] A reply drafted to a message a moderator then removes sends as a plain message.
- [ ] `/admin/deletions` says "1 account" for one, and the no-failure line is not red.
- [ ] Opening Altair logs no autoplay warning before the first click.
- [ ] A rejected Vega run leaves no ranked claim behind.
- [ ] Ranked tier names follow the reader's language.

## Out of scope

The items listed under "Not taken".
