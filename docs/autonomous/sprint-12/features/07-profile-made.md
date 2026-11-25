# 07 — "Made here": what a member has made, on their profile

Surface: a new profile showcase module "Made here" (chosen in the profile layout editor like the other modules), one
endpoint. Wave 5. Namespace `profile-made`. Site tier (Steel).

## User story

As a member who makes things on the site — puzzle grids, Lights Out boards, flashcard decks, Slice It charts, builds —
I want my profile to show what I have made, so that people who like one of my puzzles can find the rest; and as a
visitor, I want to find a maker's other work from their profile.

## Requirements elicitation

- **What exists (verified):**
  - Profile showcase modules: `MODULE_KINDS` and `MODULE_LABELS` in `lib/profile/modules.ts` (`about`, `stats`,
    `status`, `wishlist`, `slice-it`, and the lazy `PLUS_MODULE_KINDS`: `top-four`, `now`, `stamps`, `webrings`,
    `endorsements`, `counter`), their translated names in `components/profile/module-labels.ts` (held equal by
    `components/profile/__tests__/module-labels.test.ts`), rendered by `components/profile/ProfileShowcase.tsx` (the
    `slice-it` module is `components/profile/modules/SliceItModule.tsx`, one cached fetch). A member picks modules in
    the layout editor (`lib/profile/api/profile.layout.server.ts`, schema in `lib/profile/modules-schema.ts`).
  - Member-made, public things and their "not shown" flags: `ConnectionsGrid` (`hidden`; `draft` from 06),
    `LightsOutBoard` (`hidden`, sprint 11 05), `FlashcardDeck` (`isPublic`; the moderator lock from 16), `Chart` (Slice
    It, `status` `'draft' | 'public'`, with legacy rows still `'ranked'`, which every reader matches as
    `status: { in: ['public', 'ranked'] }`; `@@index([authorId, updatedAt])`), `UserBuild` (`visibility`
    `PUBLIC | UNLISTED | PRIVATE`, `publishedAt` set once published). Each has its own page
    (`/connections/u/$id`, `/lights-out/b/$id`, `/study/$deckId`, the Slice It song page, `/builds/$slug`) and none is
    linked from the maker's profile (the profile has a "Notify me about builds" toggle, `ProfileHero.tsx`, and no
    list of the member's builds; the Slice It showcase module, `SliceItModule.tsx`, shows play stats, not charts the
    member wrote).
- **Decisions:**
  - **A module, opt-in:** "Made here" is a new `ModuleKind` (`made`) in the lazy plus bundle; it shows nothing until the
    member adds it, as every module.
  - **What it lists:** up to four of each kind, newest first: published grids not hidden and not drafts, boards not
    hidden, public decks not locked by a moderator (`moderatedAt` null) and with at least one card, charts with
    `status` in `public | ranked`, builds with `visibility = PUBLIC` and `publishedAt` set (never UNLISTED or
    PRIVATE). Each row: the title (member text, `dir="auto"`), the kind, one figure (plays, plays, cards,
    difficulty, releases) in `t-meta`, and a link. No "See all" link (no per-member list exists for any of the five
    kinds; a full page is out of scope).
  - **The member chooses the kinds:** the module's settings let the member untick kinds (stored in the module's own
    config in the layout, as other modules store theirs), all ticked by default.
  - **Who sees it:** whoever can see the profile; a block either way hides the profile today, and the endpoint answers
    404 the same way; a deleted member's profile shows no module.
  - **No counts that are post counts:** plays are not quiet counts (those are likes, replies, reposts and views on
    posts); the module is classified honestly in the quiet-count scan's `EXEMPT` if the scan asks.

## Functional requirements

1. FR-1 `lib/profile/made.server.ts`: `madeBy(profileUserId, viewerId, kinds)` — five bounded queries in parallel, each
   with its visibility rule, mapped to one row shape; blocks and tombstones refuse first.
2. FR-2 Registered endpoint `lib/profile/api/profile.$id.made.server.ts` (`auth: 'optional'`, `rateLimit: 'read'`,
   `Cache-Control: private, max-age=60`) with `lib/profile/made.contract.ts`.
3. FR-3 `lib/profile/modules.ts`: `made` in `MODULE_KINDS`, `MODULE_LABELS` and `PLUS_MODULE_KINDS`; the module config
   schema in `lib/profile/modules-schema.ts` gains the kinds list.
4. FR-4 UI: `components/profile/plus/MadeModule.tsx` (rows on rules, an empty state "Nothing published yet" shown only
   to the owner; visitors see no module when it is empty), its label in `components/profile/module-labels.ts`, its
   settings in the layout editor.
5. FR-5 `USER_TEXT_RENDERERS` entry under the Wave 0 anchor.

## Non-functional requirements

- **Privacy:** a draft grid, a hidden board, a private or locked deck, a draft chart or a non-PUBLIC build never
  appears; a test covers each.
- **Performance:** five indexed queries of at most four rows; no N+1; one fetch per profile view.
- **Design:** rows on rules (R3), no cards or boxes, `t-meta` figures, no new CSS (B5).

## Data model and API

No schema change. `GET /api/profile/$id/made` → `{ items: [{ kind, id, title, href, figure }] }`.

## Testing requirements

- Main suite `lib/profile/__tests__/made.test.ts`: each visibility rule; a block either way is 404; a deleted member is
  404; the kinds filter; the four-per-kind cap.
- `components/profile/__tests__/made-module.test.tsx` (`renderToStaticMarkup`): `dir="auto"` titles; hidden when empty
  for a visitor.
- Existing tests that must stay green: `components/profile/__tests__/module-labels.test.ts`.
- Gates: route table, user-text direction, quiet counts, design consistency, Steel flat, arrival coverage.

## Acceptance criteria

- [ ] A member who published two grids, a board and a public deck adds "Made here" and a visitor sees all four, linked.
- [ ] A draft grid and a private deck are not listed.
- [ ] A visitor the member has blocked cannot read the module's endpoint.

## Out of scope

Studio shares (links, not public works), RMHBox packs, a full "everything by this member" page.
