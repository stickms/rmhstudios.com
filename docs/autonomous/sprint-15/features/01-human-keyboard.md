# 01 — Human Keyboard, a new RMHBox minigame

Surface: RMHBox lobby game picker, the Human Keyboard round screens, results and match history. Wave 1. Namespace
`human-keyboard`. App tier (L8).

## User story

As a group playing RMHBox, I want a cooperative round where the alphabet is shared out between us and we type one
sentence together, each pressing only the letters we hold, so that we have a loud, fast game we win or lose as a table
rather than against each other.

## Requirements elicitation

- **What exists (verified):**
  - RMHBox runs twelve minigames (`MINIGAME_REGISTRY` in `lib/rmhbox/minigame-registry.ts`; Identity Crisis was
    sprint 14 01). Five are still commented out there and render `createStub(...)` in
    `components/rmhbox/minigames/MinigameRenderer.tsx`; `'human-keyboard'` is one (`createStub('Human Keyboard')`),
    commented as category `action`, 3–10 players, 120 s, teams, `spectate_only`, tags `action`, `cooperative`.
  - The other four stubs (Cursor Curling, Human Tetris, Pixel Pushers, Scroll Soul) need physics or continuous input
    sync. Human Keyboard is the one left whose every input is a discrete key press the server can judge alone.
  - The design spec `docs/rmhbox/design-spec/minigames-3.md` §2 describes the game: sentence reveal, typing, results;
    the alphabet dealt round-robin, a reshuffle every 8 s, automatic spaces, a 500 ms lock on a wrong key, five
    presses a second per player, and its scoring. Its sentence file `data/rmhbox/human-keyboard/sentences.json` does
    not exist.
  - A minigame is a server class extending `BaseMinigame` (`server/rmhbox/minigames/base-minigame.ts`), registered in
    `server/rmhbox/game-coordinator.ts` (the `['identity-crisis', IdentityCrisisGame]` row is the model), with a lazy
    client in `components/rmhbox/minigames/minigame-loaders.ts`, a history detail registered in
    `lib/rmhbox/history-display-registrations.ts`, a settings schema (`lib/rmhbox/sequence-sam/settings.ts` is the
    model), an icon in `components/rmhbox/minigame-icons.ts`, and bundled content read through a per-game
    `data-loader.ts` (`lib/rmhbox/identity-crisis/data-loader.ts` is the model).
  - Every input is the one socket event `rmhbox:game:input`, rate-limited at 100 per 10 s per socket
    (`SOCKET_RATE_LIMITS`, `server/rmhbox/config.ts`); the per-player five-a-second limit is the handler's own.
  - The phase tests (`testing/rmhbox/phase-*/`) and the masking tests hold what each viewer may see.
- **Decisions:**
  - **Sentences:** at least 200 bundled sentences (`id`, `text`, `difficulty`, `category`), lowercase letters and
    single spaces only, 20–60 characters, checked by a product test (unique ids, the alphabet rule, no sentence twice).
    The sentence is chosen by player count: 3–4 players `easy` or `medium`, 5+ any; one sentence per round, a game of
    `rounds` rounds (setting 1–3, default 2) with a fresh deal each round.
  - **Deal:** the 26 letters are shuffled and dealt round-robin; letters the sentence never uses are dealt too (they
    are harmless). Each player is told only their own letters and the table sees how many letters each player holds,
    not which (so a player must watch their own keys rather than read someone else's). A reshuffle every
    `reshuffleSeconds` (setting 6–15, default 8) with a 3 s warning; the cursor never moves on a reshuffle.
  - **Presses:** the server judges every press. The expected letter by its holder advances the cursor; a letter the
    presser does not hold is ignored for everyone but the presser ("Not yours"); a letter they hold that is not the
    next one locks the cursor for 500 ms for the table and costs the presser 5 points. Spaces advance on their own
    after 200 ms. More than five presses a second from one player are dropped.
  - **Scoring (spec §2.3.6, kept):** 20 per correct press; 200 for a player with no wrong press who made at least one
    correct press; 100 to each player when the sentence completes, plus 5 per second left; 100 to the most correct
    presses (ties share). The spec's team multiplier (1.5× / 1× / 0.5×) is kept and computed once at the end.
  - **Disconnects:** a disconnected player's letters are re-dealt to the others after 5 s and dealt back on reconnect
    at the next reshuffle, so a dropped player never stalls the sentence.
  - **Phones:** the player's keyboard is an on-screen grid of their own letters only, 44 px targets, with the
    hardware keyboard also accepted; no full on-screen QWERTY.
  - **Secrecy:** a player's state carries their own letters only; the per-player letter counts are public; spectators
    see every deal.
  - **Accessibility:** the sentence is shown with typed and untyped letters distinguished by weight and an underline,
    never by colour alone; each completed word and each reshuffle is announced politely; key presses bound only while
    the game area has focus (no collision with `SITE_SHORTCUTS`).
  - **No member text:** the game has no free text, so no `message` or `comment` timeout applies (feature 17 of sprint 14);
    member-made sentence packs are feature 17 of this sprint.

## Functional requirements

1. FR-1 `lib/rmhbox/human-keyboard/` (new): `rules.ts` (deal, reshuffle, the cursor over a sentence with spaces,
   judging a press, scoring, the team multiplier; pure), `schemas.ts` (the zod input `{ key: /^[a-z]$/ }`),
   `settings.ts` (`HUMAN_KEYBOARD_SETTINGS`: `rounds`, `reshuffleSeconds`), `data-loader.ts` (the sentences).
2. FR-2 `data/rmhbox/human-keyboard/sentences.json` (new): at least 200 sentences.
3. FR-3 `server/rmhbox/minigames/human-keyboard/` (new): `handler.ts` (`HumanKeyboardGame extends BaseMinigame`:
   REVEAL 3 s → TYPING up to 90 s → ROUND_RESULT 5 s, per round), `types.ts`, `index.ts`; registered in
   `server/rmhbox/game-coordinator.ts`; `getStateForPlayer` / `getStateForSpectator` built field by field.
4. FR-4 `lib/rmhbox/minigame-registry.ts`: the `'human-keyboard'` entry uncommented with `settingsSchema`, icon
   `keyboard`, the spec's values; `components/rmhbox/minigame-icons.ts` gains the icon.
5. FR-5 `components/rmhbox/minigames/human-keyboard/` (new): `HumanKeyboardGame.tsx`, `SentenceLine.tsx`,
   `LetterPad.tsx`, `HumanKeyboardHistoryDetail.tsx`, loaded from `minigame-loaders.ts`; the stub row in
   `MinigameRenderer.tsx` is replaced; the history detail registered in `lib/rmhbox/history-display-registrations.ts`.
6. FR-6 The match log (`logAction`) records each round's sentence id, completion time, and per player the correct and
   wrong presses; the history detail renders them.

## Non-functional requirements

- **Server-authoritative:** the client never advances the cursor itself; the press's result arrives from the hub.
- **Latency:** one press costs one small broadcast (`cursor`, `presserId`); the full state is sent only on join,
  reshuffle and reconnect.
- **Timers** use `BaseMinigame`'s phase timers (pausable, restored on reconnect); no `setInterval` of its own.
- **Audio:** the press and reshuffle sounds use `getAudioContext()` from `lib/shared/platform.ts`, made after the
  first gesture (`lib/__tests__/audio-context-ratchet.test.ts`).
- **Motion and rest:** the reshuffle and a completed word fade 160 ms; nothing moves at rest. The client runs no
  `requestAnimationFrame` loop and no `setInterval`: the countdown is drawn from the phase's end time, re-rendered by
  one `setTimeout` a second only while TYPING is live (cleared on phase change and unmount), and REVEAL,
  ROUND_RESULT, the history detail and a paused game schedule nothing (`lib/__tests__/raf-loop-allowlist.test.ts` stays
  unchanged; a render test holds that ROUND_RESULT schedules no timer).
- **Query shapes:** no new Prisma query; the match write is the coordinator's existing one.

## Testing requirements

- Main suite `server/rmhbox/minigames/human-keyboard/__tests__/handler.test.ts`: a whole round with three fake
  sockets; a press by the holder advances, by a non-holder is ignored, a wrong held letter locks 500 ms; spaces
  auto-advance; the five-a-second limit; a reshuffle never moves the cursor; a disconnect re-deals after 5 s; no
  player's state contains another player's letters.
- Product suite `lib/rmhbox/human-keyboard/__tests__/rules.product.test.ts`: the deal covers 26 letters once, the
  cursor skips spaces, scoring and the multiplier on worked examples.
- Product suite `lib/rmhbox/human-keyboard/__tests__/sentences.product.test.ts`: the sentence file's rules.
- The RMHBox registry, renderer and history-registration tests that cover every minigame; `testing/rmhbox/` phase tests.

## Acceptance criteria

- [ ] Human Keyboard is offered in the RMHBox picker for 3–10 players.
- [ ] Each player sees only their own letters, and the sentence advances only when the holder presses the next letter.
- [ ] A wrong held letter locks the sentence briefly for everyone; a letter you do not hold does nothing.
- [ ] The keys are reshuffled on a timer with a warning, and the cursor stays where it was.
- [ ] A finished sentence shows the time, each player's presses and the score; the match history shows the same.
- [ ] On a 390 px phone the letter pad fits without scrolling and each key is at least 44 px.

## Out of scope

Member-written sentences (feature 17), punctuation or capitals, team-against-team play, the other four stubs.
