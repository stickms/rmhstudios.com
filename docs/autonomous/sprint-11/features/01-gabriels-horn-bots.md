# 01 — Bots at the Gabriel's Horn table

Surface: the Gabriel's Horn lobby and table (`/gabriels-horn`), the results panel. Wave 1. Namespace
`gabriels-horn-bots`. App tier (L8): Gabriel's Horn keeps its own look.

## User story

As someone who likes Gabriel's Horn but often finds nobody else at a table, I want to fill empty seats with computer
players that follow the same rules and cannot cheat, so that I can play a whole game alone or with one friend, and learn
the game before I sit down with strangers.

## Requirements elicitation

- **What exists (verified):**
  - The server is the game: `features/gabriels-horn/server/handlers.ts` (about 1,930 lines) owns the deck, the dice,
    every hand and the secret. `viewFor(lobby, seat)` builds each seat's own view, in which the roller's dice faces are
    `null` until the reveal (or until an Azure card buys the look); state is emitted per socket, never broadcast.
  - Seats are keyed by socket id (`Lobby.seats: Map<string, Seat>`); `MIN_PLAYERS = 2`, `MAX_PLAYERS = 6`
    (`engine/constants.ts`). Every phase runs on a timer with a non-punishing default: a claim that never comes is the
    truth, a call that never comes costs the roller a draw, a missed final turn is a pass (`onPhaseTimeout`).
  - Results are persisted for every standing with a `userId` (`persistResults`, `GabrielsHornPlayer`) and the per-seat
    table read (`persistTableRead`, `GabrielsHornTableRead`, R11).
  - There is no computer player anywhere in the game (`grep -ri bot features/gabriels-horn` finds none): one member
    cannot start a table, and two members wait for a third to make the game interesting.
- **Decisions:**
  - **The host adds bots** in the waiting lobby: "Add a bot" (up to `MAX_PLAYERS` seats in all) with a level, **Easy**,
    **Steady** or **Sharp**, and "Remove" on a bot's row. Bots count towards `MIN_PLAYERS`, so one member and one bot is
    a game. Only the host adds or removes, only while the lobby is `waiting`.
  - **A bot sees what its seat sees.** The decision module takes the bot seat's `GameView` (the same `viewFor` output a
    person gets), the house rules and a random source, and returns one action. It never reads `lobby.dice`, `lobby.deck`
    or another seat's hand; a test feeds it a view whose own dice are `null` and checks it still acts.
  - **The levels:** Easy claims the truth 70% of the time and otherwise a random total, calls at random, plays a card
    only when it would otherwise draw. Steady claims totals that are likely under the 3d6 distribution of what it can
    see, calls the claim least likely to be true, plays Verdant when its hand is the smallest and sounds the horn when
    it holds no more cards than anyone. Sharp adds the public table log: it weighs each seat's claims this game (the log
    every player already sees) and uses Amber, Crimson and the seven-swap when the counts favour it.
  - **Bots think, then act:** each action is scheduled 600–1,800 ms after the bot's turn or phase opens (random within
    that range), always inside the phase timer; a bot never waits for the timeout.
  - **A table with a bot is a practice table:** `persistResults` and `persistTableRead` write nothing for a game in
    which any seat was a bot at the start. The lobby, the table and the results say "Practice table: not on the board".
    No XP, achievement or leaderboard row comes from it.
  - **Names:** a bot's name is built in the client from `{ bot: { n, level } }` ("Bot 2 · Steady"), so it is translated;
    the server sends no English name for a bot.
  - **Bots never chat, never react and never hold a table open:** when the last person leaves, the lobby is destroyed as
    today (`destroyLobby`); a bot seat is never "dropped" and never reaped.
  - **Public lobbies** may hold bots; the lobby list shows "2 people, 2 bots". A person who wants a seat at a full table
    asks the host to remove a bot (no automatic replacement).
  - **Party rooms** (`registerPartyGame`) may add bots before the start, like any lobby.

## Functional requirements

1. FR-1 `features/gabriels-horn/engine/bot.ts` (pure, client-safe): `decideBotAction(view, rules, level, rng)` for every
   phase a seat can act in (claim, call, card play, horn, final turn), returning a legal action or `null` (nothing to
   do).
2. FR-2 Socket events `C2S.ADD_BOT` (`{ level }`) and `C2S.REMOVE_BOT` (`{ seatId }`) in `engine/net/events.ts`,
   host-only, `waiting` only, rate-limited by `checkRateLimit` with new entries `'gh:add-bot'` and `'gh:remove-bot'` (20
   a minute each) in `SOCKET_RATE_LIMITS` (`server/socket-server/config.ts`): an event with no entry there is not
   limited at all (`server/shared/rate-limit.ts` returns `true` for an unknown name).
3. FR-3 The handler seats bots with socket ids `bot:<n>` and an empty `userId`, schedules their actions through the
   lobby's timers (cleared by `clearTimers`), and applies them through the same functions a person's event reaches (so
   every rule check runs for a bot too).
4. FR-4 `Lobby.hasBots` (set at start) makes `finishGame` skip both persistence calls.
5. FR-5 Lobby panel: "Add a bot" with the level picker, each bot row with its level and "Remove"; table seats show a bot
   badge; the results panel and the lobby show the practice line.
6. FR-6 The public lobby list (`PublicLobbyInfo`) carries `bots` beside the player count.

## Non-functional requirements

- **Fairness:** the decision function's only inputs are the seat view, the rules, the level and the random source.
- **Server load:** one decision is at most O(seats × totals) arithmetic; no timer outlives its lobby.
- **Accessibility:** bot rows and badges have text, never a colour alone; the level picker is a labelled radio group.
- **Design:** app tier; the game's own look; nothing animates at rest.

## Data model and API

- No schema change. No HTTP endpoint.
- New `features/gabriels-horn/engine/bot.ts`. Edits: `engine/constants.ts` (`BOT_LEVELS`, the think delays),
  `engine/net/events.ts`, `engine/store.ts`, `server/handlers.ts`, `ui/LobbyPanel.tsx`, `ui/TableScreen.tsx`,
  `ui/ResultsPanel.tsx`, `ui/MainMenu.tsx` (the lobby list count), `server/socket-server/config.ts` (two rate-limit
  entries).

## Testing requirements

- Product suite `features/gabriels-horn/engine/__tests__/bot.product.test.ts`: every level returns a legal action in
  every phase over 1,000 seeded random views; a view whose own dice are `null` still yields a claim or call; Steady's
  claim is never impossible under the visible dice; the horn is sounded only when the bot holds no more cards than any
  other seat.
- Main suite `features/gabriels-horn/engine/__tests__/bots-handler.test.ts` (beside `handler.test.ts`, same harness):
  add and remove are host-only and `waiting`-only and rate-limited (both names have a `SOCKET_RATE_LIMITS` entry); seats
  never exceed `MAX_PLAYERS`; one person and one bot can start; a bot acts before its phase times out; a game with a bot
  calls neither `gabrielsHornPlayer` nor `gabrielsHornTableRead` writes; the last person leaving destroys the lobby with
  bots in it; the state a bot's decision receives equals `viewFor` for its seat (dice faces `null` on its own roll).
- Existing `handler.test.ts` stays green unchanged.

## Acceptance criteria

- [ ] A member alone creates a table, adds two Steady bots, plays to the end and sees "Practice table: not on the
      board".
- [ ] A bot never reacts to its own dice before the reveal (the handler test proves its input).
- [ ] After a game with bots, the Gabriel's Horn leaderboard is unchanged.
- [ ] Removing a bot in the lobby frees its seat for a person.

## Out of scope

Bots in ranked or wagered play (there is none for this game), bots that chat, a bot joining a table already playing,
difficulty that learns from a member's past games.
