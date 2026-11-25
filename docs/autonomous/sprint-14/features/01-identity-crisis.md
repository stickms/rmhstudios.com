# 01 — Identity Crisis, a new RMHBox minigame

Surface: RMHBox lobby game picker, the Identity Crisis round screens, results and match history. Wave 1. Namespace
`identity-crisis`. App tier (L8).

## User story

As a group playing RMHBox, I want a talking game where everyone can see who everybody else is except themselves, and
we take turns asking the table yes-or-no questions to work out our own identity, so that we have a social round that
rewards good questions and honest answers rather than speed.

## Requirements elicitation

- **What exists (verified):**
  - RMHBox runs eleven minigames (`MINIGAME_REGISTRY` in `lib/rmhbox/minigame-registry.ts`; Sequence Sam was sprint
    13 01). Six are still commented out there and render `createStub(...)` in
    `components/rmhbox/minigames/MinigameRenderer.tsx`; `'identity-crisis'` is one (`createStub('Identity Crisis')`),
    commented as category `word`, 3–10 players, 180 s, `spectate_only`, tags `word`, `deduction`.
  - The design spec `docs/rmhbox/design-spec/minigames-4.md` §1 describes the game in full: assignment reveal, ask and
    vote phases, early and final guesses, scoring, masking (`IC_TURN_START` to voters, `IC_TURN_START_SELF` to the
    asker) and reconnection. Its identity file `data/rmhbox/identity-crisis/identities.json` does not exist.
  - A minigame is a server class extending `BaseMinigame` (`server/rmhbox/minigames/base-minigame.ts`), registered in
    `server/rmhbox/game-coordinator.ts` (the `['sequence-sam', SequenceSamGame]` row is the model), with a lazy client in
    `components/rmhbox/minigames/minigame-loaders.ts`, a history detail registered in
    `lib/rmhbox/history-display-registrations.ts`, a `GameSettingsSchema` (`lib/rmhbox/sequence-sam/settings.ts` is the
    model) and an icon in `components/rmhbox/minigame-icons.ts`. Bundled content loads through a per-game
    `data-loader.ts` (`lib/rmhbox/emoji-cinema/data-loader.ts` is the model).
  - Every input is the one socket event `rmhbox:game:input`, already rate-limited (`SOCKET_RATE_LIMITS`,
    `server/rmhbox/config.ts`). `fuse.js` is a dependency (`package.json`).
  - The phase tests (`testing/rmhbox/phase-*/`) hold that no player's state carries what they must not see.
- **Decisions:**
  - **Identities:** a bundled list of at least 240 well-known people and characters (`data/rmhbox/identity-crisis/
    identities.json`: `id`, `name`, `aliases[]`, `category`, `difficulty`), checked by a product test for unique ids,
    names under 60 characters and no two entries sharing an alias. No member-written identities this sprint.
  - **Assignment:** the server draws one identity per player without replacement, no two from the same category while
    the pool allows it; the first game of a lobby session draws from `easy`, later games from `easy` and `medium`
    (`hard` only with the `hardIdentities` setting).
  - **Turns:** a random asking order; each player asks `questionsPerPlayer` questions (settings 2–5, default 3). Ask
    phase `askSeconds` (10–40, default 20); vote phase 15 s, simultaneous, `yes` / `no` / `maybe`; the result shows the
    three counts and the plurality (a tie reads "Split"), never who voted what. A timed-out ask skips that turn.
  - **Guesses:** an early guess may be sent during any ask or vote phase, except by the asker while the votes on
    their own question are open (so a guess never races the answer it depends on); it is matched with
    `fuse.js` (threshold 0.3) against the name and its aliases on the server. Correct: `200 + 300 × remaining / total`
    and the player stops asking (they keep voting). Wrong: `−100` and no more questions; one final guess with no bonus.
    The final-guess phase is 30 s for everyone not yet right; correct scores 200.
  - **The spec's "voting accuracy" bonus is dropped:** the server cannot know the true answer to a free-text question,
    so any accuracy score would be the majority judging itself. Recorded as a deliberate departure from the spec.
    The efficiency bonus stays: 20 points per question slot a correct guesser did not use.
  - **Question text is member text:** 3–200 characters, control characters stripped and whitespace collapsed on the
    server, shown with `dir="auto"`. RMHBox has no word filter for any minigame text (checked: none in
    `server/rmhbox/` or `lib/rmhbox/`); adding one is out of scope, as it is for Wit War's answers.
  - **Secrecy:** a player's state never carries their own identity (any phase, any reconnect); voters receive the
    asker's identity in `turnStart`, the asker receives `turnStartSelf` without it; an early guess's text reaches no
    other player; spectators see everything except who voted what.
  - **Accessibility:** the three vote buttons are labelled words, keys `y` / `n` / `m` bound only while the vote panel
    has focus; the turn change and each result are announced politely; no colour-only meaning.
  - **Awards and history:** the history shows, per player, their identity, whether and when they guessed it, the
    questions they asked and each result's counts.

## Functional requirements

1. FR-1 `lib/rmhbox/identity-crisis/` (new): `schemas.ts` (zod: `ask`, `vote`, `guess` inputs and the settings),
   `rules.ts` (pure: the draw with the category rule, turn order, plurality and "Split", guess matching through an
   injected matcher, scoring), `settings.ts` (`IDENTITY_CRISIS_SETTINGS`: `questionsPerPlayer`, `askSeconds`,
   `hardIdentities`).
2. FR-2 `data/rmhbox/identity-crisis/identities.json` (new, at least 240 entries) loaded once per process by
   `lib/rmhbox/identity-crisis/data-loader.ts` (new, the emoji-cinema loader's shape).
3. FR-3 `server/rmhbox/minigames/identity-crisis/` (new): `handler.ts` (`IdentityCrisisGame extends BaseMinigame`:
   phases, timers, masking in `getStateForPlayer` / `getStateForSpectator`, the fuse matcher), `types.ts`, `index.ts`;
   registered in `server/rmhbox/game-coordinator.ts`.
4. FR-4 The registry entry restored in `lib/rmhbox/minigame-registry.ts` (uncommented, `settingsSchema`, category
   `word`, icon `user-search` added to the explicit lucide map in `components/rmhbox/minigame-icons.ts`), the stub row
   removed from `MinigameRenderer.tsx`, the loader added to `minigame-loaders.ts`.
5. FR-5 Client `components/rmhbox/minigames/identity-crisis/` (new): `IdentityCrisisGame.tsx` (phases),
   `IdentityBoard.tsx` (everyone else's identity, yours as "?"), `AskPanel.tsx`, `VotePanel.tsx`, `GuessPanel.tsx`,
   `IdentityCrisisHistoryDetail.tsx` (registered in `lib/rmhbox/history-display-registrations.ts`).
6. FR-6 No new socket event or rate-limit entry; the handler ignores an input from the wrong player, in the wrong
   phase, or a second vote.

## Non-functional requirements

- **Fairness:** a masking test proves no player state (all phases, a reconnect mid-vote) contains the player's own
  identity, and no state contains another player's early-guess text or anyone's individual vote.
- **Timeouts:** the `ask` text is a `message` surface; feature 17 (wave 6) adds the hub's restriction check to this
  handler, so the handler keeps its input handling in one `onAsk` method that 17 can guard without restructuring.
- **Accessibility:** keyboard-only play; every control labelled; turn and result announcements.
- **Motion (R5 spirit on the app tier):** no idle animation; a result arrives with the 160 ms fade.
- **Size:** the identity file is under 60 KB.

## Data model and API

No schema change: matches are recorded through RMHBox's existing match persistence (`RMHboxMatch`,
`RMHboxMatchPlayer`).

## Testing requirements

- Product suite `lib/rmhbox/identity-crisis/__tests__/rules.product.test.ts`: the draw (no repeated category while
  possible, difficulty by game number), plurality and "Split", scoring for early, wrong-early, final and efficiency.
- Product suite `lib/rmhbox/identity-crisis/__tests__/identities.product.test.ts`: the data file's shape and uniqueness.
- Main suite `server/rmhbox/minigames/identity-crisis/__tests__/handler.test.ts`: masking (own identity never sent,
  votes never attributed, guess text never broadcast), wrong-phase and wrong-player inputs ignored, a timed-out ask
  skips, the match ends after every turn or when every player has guessed.
- Gates: `lib/__tests__/server-bundle-copies.test.ts`, the i18n catalogue and computed-key gates,
  `lib/rmhbox/__tests__/rmhbox-presets.test.ts`, `lib/__tests__/shortcut-registry.test.ts`,
  `lib/__tests__/user-text-direction.test.ts`.

## Acceptance criteria

- [ ] A lobby of four plays a full game: each player asks three questions, votes on the others, and the results
      screen reveals every identity.
- [ ] No socket payload a player receives ever contains their own identity.
- [ ] "einstein" is accepted as a guess for "Albert Einstein"; a wrong early guess stops that player asking.
- [ ] A keyboard-only player can ask, vote with `y` / `n` / `m` and guess.
- [ ] The match appears in RMHBox history with each player's identity, questions and results.

## Out of scope

Member-written identity packs, team play, the voting-accuracy bonus, the other five stubbed minigames.
