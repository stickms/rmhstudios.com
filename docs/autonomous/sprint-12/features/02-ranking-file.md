# 02 — Ranking File, a new RMHBox minigame

Surface: RMHBox lobby game picker, the Ranking File round screens, results and match history. Wave 3. Namespace
`ranking-file`. App tier (L8).

## User story

As a group playing RMHBox, I want a quick trivia game where everyone puts the same five things in order (planets by
size, rivers by length, inventions by year) and the closest order wins, so that we have a game that rewards knowing
roughly how things compare rather than one exact fact.

## Requirements elicitation

- **What exists (verified):**
  - RMHBox runs nine minigames (`MINIGAME_REGISTRY` in `lib/rmhbox/minigame-registry.ts`: Rhyme Time, Undercover Agent,
    Category Crash, Wiki Race, Wit War, Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema).
    Eight more are commented out in the registry and render a stub ("Minigame coming soon…") in
    `components/rmhbox/minigames/MinigameRenderer.tsx` (`createStub`): Sequence Sam, Human Keyboard, Cursor Curling,
    Human Tetris, Identity Crisis, **Ranking File**, Pixel Pushers, Scroll & Soul. Ranking File's commented entry
    already says what it is: "Rank items in the correct order — closest to the official ranking wins", trivia, 3–12
    players, `join_next_subround`.
  - A minigame is a server class extending `BaseMinigame` (`server/rmhbox/minigames/base-minigame.ts`: `start`,
    `handleInput`, `getStateForPlayer`, `getStateForSpectator`, `computeResults`, `spectatorMode`), registered in
    `server/rmhbox/game-coordinator.ts`; its content is JSON under `data/rmhbox/<id>/` loaded by a module in
    `lib/rmhbox/<id>/` (Fact or Friction: `data/rmhbox/fact-or-friction/questions.json`,
    `lib/rmhbox/fact-or-friction/question-loader.ts`, `schemas.ts`); its client is lazy-loaded from
    `components/rmhbox/minigames/minigame-loaders.ts`; its history detail is registered in
    `lib/rmhbox/history-display-registrations.ts`; settings are a `GameSettingsSchema` (`lib/rmhbox/game-settings.ts`).
  - The RMHBox phase tests (`testing/rmhbox/phase-*/security-state-masking.test.ts`) hold that a player's state never
    carries what they must not see yet.
- **Decisions:**
  - **A round:** five items from one set, shown to everyone in the same shuffled order, with the set's prompt ("Largest
    to smallest by diameter"). Each player drags or uses up and down buttons to order them and locks in; the round ends
    when all have locked or the timer runs out (an unlocked order counts as it stands). Then the official order is
    revealed with each item's value and unit, and each player's points.
  - **Scoring:** the footrule distance (the sum over items of how far each is from its true place; 0 to 12 for five
    items) gives `(12 - distance) × 50` points, plus 200 for a perfect order. Ties in the final score share the place.
  - **Settings:** rounds 3–8 (default 5), seconds per round 20–90 (default 45), categories (all, science, geography,
    history, culture).
  - **Content:** at least 60 sets in `data/rmhbox/ranking-file/sets.json`, each
    `{ id, category, prompt, unit, items: [{ label, value }] (6 to 8 items, five drawn per round), source }`, of stable,
    checkable facts (no values that change year to year, no populations, no prices). The loader refuses a set with two
    equal values; a test holds every set. Prompts and labels are English content like the other packs'
    (`data/rmhbox/*`), not interface strings.
  - **Secrecy:** the order and the values are on the server only until the reveal; a player's state carries only the
    shuffled labels and their own order.
  - **History:** the match history shows each round's prompt, the official order and each player's distance.

## Functional requirements

1. FR-1 `lib/rmhbox/ranking-file/` (`schemas.ts` zod for the pack and for the `order` input, `set-loader.ts`,
   `scoring.ts` pure: footrule, points, ties) and `data/rmhbox/ranking-file/sets.json`.
2. FR-2 `server/rmhbox/minigames/ranking-file/` (`handler.ts` `RankingFileGame extends BaseMinigame`, `types.ts`,
   `index.ts`), registered in `game-coordinator.ts`; input actions `reorder` and `lock` validated with zod; an action
   after lock or after the round is ignored.
3. FR-3 The registry entry restored (uncommented, with `settingsSchema`, icon `list-ordered`), the stub removed from
   `MinigameRenderer.tsx`, the loader in `minigame-loaders.ts`, the icon in `components/rmhbox/minigame-icons.ts`.
4. FR-4 Client `components/rmhbox/minigames/ranking-file/` (`RankingFileGame.tsx`, `OrderList.tsx` with keyboard
   reordering: focus an item, `Alt+ArrowUp` / `Alt+ArrowDown` or the buttons, announced politely; `RoundReveal.tsx`,
   `RankingFileHistoryDetail.tsx` registered in `history-display-registrations.ts`).
5. FR-5 No new rate-limit entry: every minigame action arrives as the one socket event `rmhbox:game:input`, already
   limited to 100 per 10 seconds per socket (`SOCKET_RATE_LIMITS` in `server/rmhbox/config.ts`, read by
   `server/rmhbox/rate-limit.ts`); the handler additionally ignores a `reorder` that does not change the order, so a
   flood of no-op moves costs nothing. (Validated: the limiter keys on event names, not on minigame actions.)

## Non-functional requirements

- **Fairness:** the official order is never in a player's or spectator's state before the reveal (a masking test).
- **Accessibility:** reordering works without a pointer; each move is announced ("Jupiter, now 2 of 5").
- **Content quality:** every set's values strictly ordered and sourced; no set repeats within a match.

## Data model and API

No schema change: matches are recorded through RMHBox's existing match persistence, as every minigame's are.

## Testing requirements

- Product suite `lib/rmhbox/ranking-file/__tests__/scoring.product.test.ts`: footrule 0 and 12, points, the perfect
  bonus, shared places.
- Main suite `lib/rmhbox/ranking-file/__tests__/sets.test.ts`: every set in the pack parses, has 6 to 8 items with
  distinct values, a known category and a source; ids are unique.
- Main suite `server/rmhbox/minigames/ranking-file/__tests__/handler.test.ts`: the reveal is the only state carrying
  values (players and spectators); `reorder` with a foreign label or a duplicate is ignored; a lock is final; the round
  ends early when all have locked; scores add up over rounds.
- Gates: `server-bundle-copies`, feature-free gates (i18n catalogues, computed keys), the RMHBox preset tests that list
  minigame ids (`lib/rmhbox/__tests__/rmhbox-presets.test.ts`).

## Acceptance criteria

- [ ] A lobby of three plays five rounds of Ranking File and sees a results screen with distances per round.
- [ ] No player's socket state before the reveal contains a value or the official order.
- [ ] A keyboard-only player can order and lock a round.
- [ ] The match appears in RMHBox history with each round's official order.

## Out of scope

Member-written sets, team play, the other seven stubbed minigames.
