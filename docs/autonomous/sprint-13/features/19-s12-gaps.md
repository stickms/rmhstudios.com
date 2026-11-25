# 19 — Close the gaps sprint 12 left open

Surface: RMHCharacters parties (the party view and its sheets), a community's mod logs (moderators' and public), a public
deck's suggestions, the route announcer. Wave 7. Namespaces: the fixed files' existing ones (no new namespace). Hardening.

## User story

As a member, I want the small faults recorded at the end of sprint 12 fixed: a banned or blocked player still reading a
party, mod-log pages that can skip an entry, a removed deck that still takes suggestions, and page announcements that
can go silent.

## Requirements elicitation

Each item was re-checked against the sprint 12 tip (`e5e8bb911`); each is re-checked at wave start, and an item already
fixed by then is reported, not redone.

- **(a) S12-01 — the party view checks no ban or block.** `getParty` in
  `features/rmhcharacters/engine/party.server.ts` returns the party to any member (`OR: [{ ownerId }, { members: { some:
  { userId } } }]`); so do `readPartySheet`, `writeOrder`, `swapCharacter` and `setSheetShared`. The roll log beside it
  already shuts out a player under a ban or blocked either way with the game master (`shutOut` in
  `features/rmhcharacters/engine/party-rolls.server.ts`), and `joinParty` refuses both. The developer API's
  `/api/v1/me/parties*` (sprint 12 13) reads through `getParty`, so it inherits the gap.
- **(b) S12-20 — both mod logs page by `id` while ordering by `createdAt`.** `listModLog` (`whereFor`: `id: { lt:
  BigInt(cursor) }`) and `listPublicModLog` (`AND m."id" < ${BigInt(cursor)}` … `ORDER BY m."createdAt" DESC, m."id"
  DESC`) in `lib/communities/modlog.server.ts`: a row whose id order differs from its time order (two transactions that
  commit out of order) can be skipped or repeated across a page boundary.
- **(c) S12-16 — a removed deck still takes suggestions from its copiers.** `createSuggestion` in
  `lib/study/suggestions.server.ts` lets a member who holds a copy suggest to a deck that is no longer public
  (`copyOf`) and never reads `moderatedAt`, so a deck a moderator took down (`lib/study/deck-moderation.server.ts`:
  `isPublic: false`, `moderatedAt` set) keeps collecting suggestions and notifying its author.
- **(d) S12-11 — two announcer residuals.** In `lib/router/route-announce-client.ts`, the single live region is cleared
  and rewritten in one task (`region.textContent = ''; region.textContent = text;`), which some screen readers coalesce,
  so a repeated title on a different path can be silent; and the announcer is installed after a dynamic import
  (`app/router.tsx`), so a navigation made before that chunk arrives is not announced.
- **Checked and dropped:** S10-04's suggester-scoped duplicate check and the decline-and-block race (fixed: the
  duplicate query has `suggesterId: userId`, and a lost "Decline and block" still blocks); S10-07's private event in the
  public mod log (fixed: the public query keeps only `PUBLIC` events); S10-08's `RepostMutesSection.tsx` names (fixed:
  `<bdi>`); S11-11's `layout-label` (used by `components/rmhtype/LayoutPicker.tsx`). S11-01's socket ids in Gabriel's
  Horn views are not taken: the socket id is the seat identity throughout the engine (`features/gabriels-horn/engine/bot.ts`),
  so replacing it is a refactor of its own (recorded in the README).
- **Decisions:**
  - **(a)** one `partyAccess(userId, party)` in a new `features/rmhcharacters/engine/party-access.server.ts` (moved from
    `shutOut`): a viewer under a ban, or blocked either way with the game master, gets `null` (a 404) from every party
    read and write; the roll log uses the same function. A block between two players hides each from the other inside
    the party: the other's line reads "A player", with no summary or sheet state.
  - **(b)** the cursor becomes `(createdAt, id)` encoded as one opaque string (`<ms>.<id>`), the queries use
    `(createdAt, id) < (cursor)`; an old numeric cursor is read as "from the top" (one repeated page at worst, never a
    skipped row).
  - **(c)** `createSuggestion` refuses a deck with `moderatedAt` set as not found (the copier's own copy is untouched);
    `listMine` still shows their past suggestions on it.
  - **(d)** two alternating live regions (`route-announcer` and `route-announcer-alt`), the second rendered by
    `components/shell/RouteAnnouncer.tsx`, so each announcement is a fresh insertion into an emptied region; and a small
    synchronous recorder in `app/router.tsx` keeps the last pathname change seen before the announcer loads, which
    `installRouteAnnouncer` announces once on install.

## Functional requirements

1. FR-1 (a) `party-access.server.ts`; `party.server.ts` reads and writes and `party-rolls.server.ts` call it; the
   player-to-player block in `getParty`'s member mapping.
2. FR-2 (b) `lib/communities/modlog.server.ts` (both lists, one cursor codec in `lib/communities/modlog.ts`), `lib/communities/modlog.contract.ts` (the cursor type stays a string).
3. FR-3 (c) `lib/study/suggestions.server.ts` `createSuggestion`.
4. FR-4 (d) `lib/router/route-announce-client.ts`, `components/shell/RouteAnnouncer.tsx`, `app/router.tsx`.

## Non-functional requirements

- **Scope:** only the four items; anything else found is reported, not fixed.
- **No visible change** except (a)'s "A player" and (d)'s second hidden region (visually hidden, in flow, not fixed).

## Data model and API

No schema change. The mod-log cursor's format changes (opaque string, still a string in the contract and the API).

## Testing requirements

- (a) `features/rmhcharacters/engine/__tests__/party-access.test.ts`: banned and blocked (either way with the game
  master) get null from each read and write; a player-to-player block shows "A player"; the API's party read follows.
- (b) `lib/communities/__tests__/modlog-pages.test.ts` (extended): rows whose ids and times disagree page without a gap
  or repeat in both lists; an old numeric cursor starts from the top.
- (c) `lib/study/__tests__/suggestions-moderated.test.ts`: a copier's suggestion to a moderated deck is refused.
- (d) `lib/router/__tests__/route-announce-client.test.ts` (extended): repeated titles alternate regions; a navigation
  before install is announced once on install.

## Acceptance criteria

- [ ] A player the game master has blocked gets "not found" for the party and its sheets.
- [ ] A mod log whose rows commit out of order pages through every row exactly once.
- [ ] A copier cannot suggest a correction to a deck a moderator removed.
- [ ] Navigating twice to two paths with the same title announces both; a navigation before the announcer loads is
  announced.

## Out of scope

Gabriel's Horn's socket ids (S11-01), RMHType's hub settlement retry (S11-12), the room-page cache of S12-17.
