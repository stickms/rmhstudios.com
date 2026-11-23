# 16 — Report a puzzle grid, a public deck, a persona or a listing

Surface: a "Report" item on a Connections grid's page, a public flashcard deck's page, a public AI persona's page and a
community home listing's page; the admin reports queue (titles and "Resolve & remove content"); "Your reports" in
settings. Wave 4. Namespace `member-reports`. Site tier (Steel).

## User story

As a member who finds something hateful, spammy or harmful that another member published — a Connections grid, a
public flashcard deck, an AI persona anyone can chat with, a home listing — I want to report it as I can report a post,
so that a moderator sees it and can take it down; and as a moderator, I want "remove" to actually remove it and keep it
removed.

## Requirements elicitation

- **What exists (verified):**
  - Reports: `REPORT_ENTITY_TYPES` and `REMOVABLE_REPORT_ENTITY_TYPES` (`lib/moderation/report-constants.ts`), the
    report route's `resolveTargetUser` switch (`lib/moderation/api/moderation.report.server.ts`), the takedown chain
    `takedownReportedContent` and the admin snippet block (`lib/moderation/triage.server.ts`), the reporter's view
    (`lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx` with its `kind-…` and `gone-…`
    label maps) and the dialog (`components/moderation/ReportDialog.tsx`). Sprint 11 added `lights-out-board` and
    `studio-share` under anchors there; `lib/moderation/__tests__/music-reports.test.ts` holds that every removable type
    has a takedown branch.
  - Four member-made, public things have **no report path**:
    - `ConnectionsGrid` (`prisma/schema/games.prisma`; public page `/connections/u/$id`; a `hidden` flag only an admin
      sets, already honoured by every read in `lib/party/connections.server.ts`) — the follow-up sprint 11 recorded
      ("A report path for Connections grids").
    - `FlashcardDeck` with `isPublic` (`prisma/schema/rmhstudy.prisma`; `/study/browse` and `/study/$deckId`). The owner
      toggles `isPublic` freely.
    - `AiPersona` with `isPublic` (`prisma/schema/moderation.prisma`: `name`, `tagline`, `systemPrompt`, `greeting`,
      `avatarUrl`; listed by `lib/personas/api/personas.server.ts`, chatted with at `/personas/$id`). Personas have no
      update route (`lib/personas/api/personas.$id.server.ts` is GET and DELETE; create is `POST /api/personas`), so a
      public persona stays public until deleted.
    - `HomeListing` with `source = COMMUNITY` (`prisma/schema/hearth.prisma`; `/homes/listing/$id`). The author sets the
      status with `setListingStatus` (`lib/homes/listings.server.ts`), `REMOVED` included, and back again.
- **Decisions:**
  - **Four new types:** `connections-grid`, `study-deck`, `persona`, `home-listing`; all four removable.
  - **Takedown that sticks:** grids: `hidden = true` (as today's admin hide). Decks, personas and listings gain a
    nullable `moderatedAt` column: takedown sets it and sets `isPublic = false` (decks, personas) or `status = REMOVED`
    (listings); while `moderatedAt` is set, the owner's toggle back to public or active is refused with
    `CONTENT_REMOVED_BY_MODERATOR` ("A moderator removed this; you can appeal from Your reports' outcome notice"), and
    the owner still sees and keeps their own copy (a removed deck stays studiable by its owner and editors; a removed
    persona stays chat-able by its owner). Restoring is an admin action on the report (clearing `moderatedAt`), audited.
  - **Report button:** each page's overflow menu, signed-in members only, never on one's own item. External (scraped)
    listings are not reportable (they have no member author; 15 lets admins pause their feed).
  - **Admin snippets:** the reported item's title (grid title, deck title, persona name, listing title), member text,
    shown as `lights-out-board` does; the persona's system prompt is shown to the admin as well, since it is what a
    chat answers from.
  - **Reporter view:** the four kinds and their "gone" lines in `MyReportsPanel.tsx`; the existing outcome notices tell
    the reporter.
  - **Owner notice:** the existing decision message path in `triage.server.ts` (a moderator's message to the author)
    applies; no new notice key unless the path needs one (then under the Wave 0 notice anchor).
  - **Read paths:** a moderated deck leaves `listMarketplaceDecks`, the deck page for others, 07's profile module and
    `/api/v1` (sprint 06 13's decks endpoints already return only the key owner's decks); a moderated persona leaves the
    public list and is 404 to others' chats; a removed listing leaves browse, the map, the watch matcher and price-drop
    notices (check each reader for a `status: 'ACTIVE'` filter and add one where it is missing).

## Functional requirements

1. FR-1 Migration `20261202040200_s12_member_reports`: `moderatedAt TIMESTAMP(3)` on `flashcard_deck`, `ai_persona` and
   `home_listing`.
2. FR-2 The four types in both lists, `resolveTargetUser` cases, takedown branches and admin snippets, my-reports
   targets and both label maps — each under its file's place for sprint 12 (one feature edits them this sprint, so no
   anchor is needed; keep each block together with a `// s12-16 member-reports` comment).
3. FR-3 Takedown and restore helpers in each domain: `hideGridForReport` in `lib/party/connections.server.ts`,
   `moderateDeck` in `lib/study/deck-moderation.server.ts` (new, classified in `DECK_ACCESS_PATHS` under the Wave 0
   anchor), `moderatePersona` in `lib/personas/moderation.server.ts` (new), `moderateListing` in
   `lib/homes/listings.server.ts`.
4. FR-4 The owner's toggles refuse while moderated: the deck PATCH (`lib/study/api/study.decks.$id.server.ts`, its
   `public` field) and `setListingStatus`; personas have no update route, so a moderated persona stays non-public.
5. FR-5 UI: `ReportDialog` opened from `ConnectionsPages.tsx` (play page), `DeckStudyColumn.tsx`,
   `PersonaChatColumn.tsx`, `ListingDetailView.tsx`; "Removed by a moderator" on the owner's view of each.
6. FR-6 Refusal `CONTENT_REMOVED_BY_MODERATOR` under the Wave 0 anchor.

## Non-functional requirements

- **Integrity:** "Resolve & remove" never leaves the content public (the music-reports test's rule extended).
- **Privacy:** a reporter is never shown to the owner; the persona's system prompt is admin-only.
- **Accessibility:** the menu item and dialog are the existing ones.

## Data model and API

`FlashcardDeck.moderatedAt`, `AiPersona.moderatedAt`, `HomeListing.moderatedAt` (`DateTime?`). No new endpoints beyond
the existing report and triage routes.

## Testing requirements

- Main suite `lib/moderation/__tests__/member-reports.test.ts`: each type resolves its author; each takedown hides and
  sets the flag; own items cannot be reported; external listings refused; restore clears the flag (audited).
- Main suite `lib/study/__tests__/deck-moderation.test.ts`, `lib/personas/__tests__/persona-moderation.test.ts`,
  `lib/homes/__tests__/listing-moderation.test.ts`: the owner's toggle is refused while moderated; others' reads (list,
  page, chat, browse) exclude the item; the owner keeps their copy.
- Existing tests that must stay green: `lib/moderation/__tests__/music-reports.test.ts` (extend its removable list).
- Gates: `DECK_ACCESS_PATHS`, error-code catalogue, migration safety, design consistency.

## Acceptance criteria

- [ ] A member reports a public deck; a moderator resolves and removes it; it leaves `/study/browse`, and the owner
      cannot make it public again.
- [ ] A reported persona removed by a moderator answers 404 to other members' chats.
- [ ] A removed community listing leaves browse and the map.
- [ ] The reporter sees the outcome under "Your reports".

## Out of scope

Reports on private decks, personas' chat messages, external listings, Slice It charts (songs are reportable already).
