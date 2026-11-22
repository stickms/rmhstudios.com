# 13 — What each game supports, on its page and in the library

Surface: the games library (`/games`, app tier: `components/steam/`), each
game's page (`/games/$gameId`) and the photosensitivity warning. Wave 6.
Namespace `game-access`.

## User story

As a player who can only use a keyboard, or who needs games without flashing
or timed input, I want each game's page to say plainly what it supports and
the library to filter by it, so that I find the games I can play without
starting each one to find out.

## Requirements elicitation

- **What exists (verified):**
  - `lib/game-capabilities.ts` is an honest registry per game: genre,
    players, `maxPlayers`, `input.supported` / `input.required`,
    `sessionMinutes`, engine, low-end support, save scope, `accessibility`
    (`remappable-input`, `assist-mode`, `reduced-flashing`, `colorblind-safe`,
    `subtitles`, `no-timed-input`) and content descriptors (`flashing`,
    `gambling-themes`, `violence`, `user-content`, `ai-generated`), with the
    rule that claims are about code that exists today.
  - The registry is consumed by the developer API serialiser
    (`lib/api/games-serializers.server.ts`), the assist layer
    (`lib/game/assist.ts`) and `lib/low-end.ts` — **no member-facing page
    shows it** (`grep -rl game-capabilities components app` finds nothing).
  - The library is `components/steam/LibraryList.tsx` (`filterRail` in
    `lib/games/library.ts`: kind and search, plus Following) and each game's
    page is `components/steam/GamePage.tsx` via
    `app/routes/games/_library/$gameId.tsx`.
  - 06 (wave 3) adds Dream Rift and Nightrail to the assist layer, so their
    claims grow before this feature reads them.
- **Decisions:**
  - **On the game page:** a "Playing this game" section with three short
    lists — *Controls* ("Keyboard, mouse or touch"; "Needs a keyboard" from
    `required`), *Players* ("1 player · up to 8 online"), *Accessibility*
    (each claimed feature as a sentence, e.g. "Can turn off flashing",
    "Works without timed input", with "Assists: set them once in Game
    assists" linking `/settings/game-assists` when the game is in
    `ASSIST_CAPABLE`, and "Assists are in this game's own settings" for the
    games in `OWN_ASSIST_IMPLEMENTATION` (`lib/game/assist.ts`: Slice It),
    whose `assist-mode` claim is its own modifiers, not the shared page)
    and *Content* (descriptors as words; `flashing` with the WCAG sentence
    "This game contains flashing lights."). A game with no accessibility
    claims says "No accessibility features are listed for this game yet."
    — honest, never "not accessible".
  - **In the library:** a "Can be played with" filter (keyboard only, touch,
    gamepad) and an "Accessibility" filter (no flashing — meaning *does not*
    have the `flashing` descriptor *or* claims `reduced-flashing`; no timed
    input; assists; remappable controls; colour-blind safe; subtitles), as
    toggle buttons (`aria-pressed`) in the steam shell's own control style
    (L8), combined with the existing kind and search.
    The filter state is in the URL search params (shareable), not storage.
  - **Coverage test:** every game in the catalogue (`lib/catalog`) that has a
    page has a capabilities entry, and `assist-mode` is claimed exactly by the
    games in `ASSIST_CAPABLE` ∪ `OWN_ASSIST_IMPLEMENTATION` (Slice It claims
    it today through its own assist family; the assist tests already hold the
    reverse join). The page shows claims as written; making a claim truer is each
    game's own change, not this one.
  - Labels for the enums live in one client-safe map
    `lib/games/capability-labels.ts` returning **literal keys** (no key built
    from the enum value — the computed-key ratchet), translated in the
    components.

## Functional requirements

1. FR-1 The "Playing this game" section on every game page.
2. FR-2 The two library filters, combinable, in the URL.
3. FR-3 The coverage test.
4. FR-4 The developer API's games payload unchanged (already carries the
   fields).

## Non-functional requirements

- **Accessibility:** the section is a list with headings; filters are
  labelled toggle groups reachable by keyboard; the number of matching games
  is announced politely.
- **Performance:** the registry is static data; filtering is client-side over
  the rail already in memory.
- **Design:** app tier (steam shell, `components/steam/steam.css`).
- **i18n:** `game-access`; plain `t` with literal keys.

## Data model and API

- No schema or API change.
- New `lib/games/capability-labels.ts`, `lib/games/access-filter.ts` (pure:
  `matchesAccess(caps, filter)`), `components/steam/PlayingThisGame.tsx`,
  `components/steam/AccessFilters.tsx`.
- Edits: `components/steam/GamePage.tsx`, `LibraryList.tsx`,
  `lib/games/library.ts` (`filterRail` gains the filter).

## Testing requirements

- Product suite `lib/games/__tests__/access-filter.product.test.ts`.
- Main suite `lib/__tests__/game-capabilities-coverage.test.ts` (every
  catalogue game with a page has an entry; `assist-mode` ⇔ `ASSIST_CAPABLE`).
- Component test `components/steam/__tests__/PlayingThisGame.test.tsx`.
- Existing: `lib/__tests__/catalog-contract.test.ts`, the assist tests,
  `i18n-computed-key-ratchet`.

## Acceptance criteria

- [ ] Void Breaker's page lists its assists and links to Game assists.
- [ ] Filtering the library by "No timed input" and "Keyboard" shows only
      games that claim both, and the URL can be shared.
- [ ] A game with the `flashing` descriptor and no `reduced-flashing` is
      excluded by "No flashing".
- [ ] 390 px and 1280 px, the library's light and dark looks, `ar`.

## Out of scope

New capability claims (06 adds two games' assists), ratings by players, an
accessibility statement for the site.
