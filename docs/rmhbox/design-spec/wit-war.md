# RMHbox — Wit-War Design Specification

> **Version:** 1.0  
> **Last Updated:** 2026-02-27  
> **Status:** Implemented  
> **Parent Document:** [info.md](../info.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Game Concept](#2-game-concept)
3. [Detailed Mechanics](#3-detailed-mechanics)
4. [Phases](#4-phases)
5. [Scoring](#5-scoring)
6. [Constants](#6-constants)
7. [Server Handler](#7-server-handler)
8. [Client Components](#8-client-components)
9. [Spectator Mode](#9-spectator-mode)
10. [Sound Effects](#10-sound-effects)
11. [Game Settings](#11-game-settings)
12. [History & Awards](#12-history--awards)
13. [Data Files](#13-data-files)
14. [File Structure](#14-file-structure)

---

## 1. Overview

| Field | Value |
|---|---|
| **ID** | `wit-war` |
| **Display Name** | Wit-War |
| **Category** | `word` |
| **Icon** | `swords` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 16 |
| **Estimated Duration** | 240 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Spectator Mode** | `shared-privileged` |
| **Tags** | `['word', 'creative', 'voting', 'comedy']` |
| **Constant Prefix** | `WW_` |

---

## 2. Game Concept

Wit-War is a Quiplash-style party game where players write funny or clever answers to prompts, then answers face off in head-to-head matchups while other players vote for their favorite. Points are awarded based on vote percentage, and a unanimous vote triggers a special "Wit-War!" bonus.

The game emphasizes creativity, humor, and audience appeal. Players who don't submit answers receive a safety quip ("(no answer submitted)") that earns no points.

---

## 3. Detailed Mechanics

### 3.1 Prompt Assignment

At the start of each round:
- N prompts are selected from the prompt pool (where N = number of players)
- Each player receives exactly `WW_PROMPTS_PER_PLAYER` (2) prompts
- Each prompt is assigned to exactly 2 different players, creating head-to-head matchups
- A round-robin pairing algorithm ensures variety in opponent matchups
- Previously used prompts are excluded to prevent repetition across rounds

### 3.2 Writing Phase

- Players see their assigned prompts and write answers in text areas
- Each answer is submitted individually, with a "Lock In All Answers" button for convenience
- Maximum answer length: `WW_MAX_ANSWER_LENGTH` (200 characters)
- Answers are trimmed and validated via Zod schema (`SubmitAnswerSchema`)
- A live counter shows how many players have submitted all answers
- If a player doesn't submit before time expires, the safety quip is used

### 3.3 Voting Phase

- Matchups are presented one at a time to all players
- The prompt is shown with both answers displayed anonymously side by side
- Players vote for their preferred answer (the two authors cannot vote on their own matchup)
- Vote casting is validated via Zod schema (`CastVoteSchema`)
- A live counter shows voting progress
- Authors see a "sit back and watch" spectating message

### 3.4 Matchup Resolution

After voting closes for each matchup:
- Vote percentages are calculated for each answer
- The winner is the answer with more votes (ties result in no winner)
- A "Wit-War!" bonus is triggered when one answer gets 100% of the votes (minimum 2 voters)
- Points are awarded based on vote percentage (proportional to `WW_MAX_MATCHUP_POINTS`)
- Safety quip answers always receive 0 points
- Results are revealed with vote percentage bars and author names

---

## 4. Phases

Each round follows this sequence:

```
PROMPT_REVEAL → WRITING → VOTING (per matchup) → MATCHUP_RESULTS (per matchup) → ROUND_RESULTS
```

After the final round: `ROUND_RESULTS → GAME_OVER`

### 4.1 PROMPT_REVEAL

- Duration: `WW_PROMPT_REVEAL_DURATION` (3 seconds)
- Each player receives their assigned prompts via per-player action (`WW_PROMPT_REVEAL`)
- Animated entrance of prompt cards
- Phase change broadcasted to all players

### 4.2 WRITING

- Duration: `WW_WRITING_DURATION` (60 seconds, configurable)
- Phase timer displayed in header
- Players write and submit answers individually
- Submit count broadcasted in real-time (`WW_SUBMIT_COUNT`)
- Per-player acceptance confirmation (`WW_ANSWER_ACCEPTED`)

### 4.3 VOTING

- Duration: `WW_VOTING_DURATION` (15 seconds per matchup, configurable)
- Phase timer displayed per matchup
- One matchup at a time, cycled through sequentially
- Live vote count broadcasted (`WW_VOTE_COUNT`)

### 4.4 MATCHUP_RESULTS

- Duration: `WW_MATCHUP_RESULTS_DURATION` (5 seconds)
- Vote percentages revealed with animated bar
- Author names revealed
- Winner highlighted; "Wit-War!" banner for unanimous wins
- Updated cumulative scores broadcasted

### 4.5 ROUND_RESULTS

- Duration: `WW_ROUND_RESULTS_DURATION` (8 seconds)
- Phase timer displayed
- Leaderboard with cumulative scores
- Summary of all matchups from the round
- Automatic transition to next round or game end

### 4.6 GAME_OVER

- Final results computed (rankings, awards)
- Game completion signaled via `onComplete()`

---

## 5. Scoring

| Event | Points |
|---|---|
| Answer vote share | `(votePercent / 100) × WW_MAX_MATCHUP_POINTS` (up to 1000) |
| Wit-War! bonus (100% of votes, ≥2 voters) | `WW_QUIPLASH_BONUS` (500) |
| Safety quip (no answer) | 0 (always) |

Points are cumulative across rounds. Ties in voting result in a 50/50 split (500 points each if non-safety).

---

## 6. Constants

All constants are defined in `lib/rmhbox/constants.ts` with the `WW_` prefix:

| Constant | Value | Description |
|---|---|---|
| `WW_TOTAL_ROUNDS` | 2 | Default number of rounds |
| `WW_PROMPTS_PER_PLAYER` | 2 | Prompts assigned to each player per round |
| `WW_WRITING_DURATION` | 60 | Writing phase duration (seconds) |
| `WW_VOTING_DURATION` | 15 | Voting duration per matchup (seconds) |
| `WW_MATCHUP_RESULTS_DURATION` | 5 | Matchup results display duration (seconds) |
| `WW_ROUND_RESULTS_DURATION` | 8 | Round results display duration (seconds) |
| `WW_PROMPT_REVEAL_DURATION` | 3 | Prompt reveal animation duration (seconds) |
| `WW_MAX_ANSWER_LENGTH` | 200 | Maximum characters per answer |
| `WW_MAX_MATCHUP_POINTS` | 1000 | Maximum points per matchup |
| `WW_QUIPLASH_BONUS` | 500 | Bonus for unanimous victory |
| `WW_SAFETY_QUIP` | `'(no answer submitted)'` | Placeholder for missing answers |

---

## 7. Server Handler

### 7.1 Class: `WitWarMinigame`

- Extends `BaseMinigame`
- File: `server/rmhbox/minigames/wit-war/handler.ts`
- Registered in `MINIGAME_SERVER_REGISTRY` as `['wit-war', WitWarMinigame]`

### 7.2 Abstract Method Implementations

| Method | Implementation |
|---|---|
| `start()` | Initializes state, starts first round |
| `handleInput(userId, action, data)` | Routes `WW_SUBMIT_ANSWER` and `WW_CAST_VOTE` |
| `getStateForPlayer(userId)` | Returns phase-specific scoped state |
| `getStateForSpectator()` | Returns omniscient view with all prompts, answers, and votes |
| `computeResults()` | Computes rankings, awards, and game log |
| `get spectatorMode` | Returns `'shared-privileged'` |

### 7.3 Action Types (Server → Client)

| Action Type | Description |
|---|---|
| `WW_PROMPT_REVEAL` | Per-player prompt assignments |
| `WW_PHASE_CHANGE` | Phase transition notification |
| `WW_WRITING_START` | Writing phase begins |
| `WW_WRITING_END` | Writing phase ends |
| `WW_SUBMIT_COUNT` | Updated submission count |
| `WW_ANSWER_ACCEPTED` | Per-player answer confirmation |
| `WW_MATCHUP_START` | Voting matchup begins |
| `WW_VOTE_COUNT` | Updated vote count |
| `WW_MATCHUP_RESULT` | Matchup results with scores |
| `WW_ROUND_RESULTS` | Round results with leaderboard |

### 7.4 Input Actions (Client → Server)

| Action | Schema | Description |
|---|---|---|
| `WW_SUBMIT_ANSWER` | `SubmitAnswerSchema` | Submit answer for a prompt |
| `WW_CAST_VOTE` | `CastVoteSchema` | Vote on a matchup |

### 7.5 Phase Enum: `WitWarPhase`

```typescript
enum WitWarPhase {
  PROMPT_REVEAL = 'PROMPT_REVEAL',
  WRITING = 'WRITING',
  VOTING = 'VOTING',
  MATCHUP_RESULTS = 'MATCHUP_RESULTS',
  ROUND_RESULTS = 'ROUND_RESULTS',
  GAME_OVER = 'GAME_OVER',
}
```

### 7.6 Reconnection

Reconnection is handled by the base class `buildReconnectionSnapshot()`, which dispatches to `getStateForPlayer()` for players and `getStateForSpectator()` for spectators. The handler overrides `handlePlayerDisconnect()` for logging purposes only.

---

## 8. Client Components

### 8.1 WitWarGame.tsx (Main Component)

- Phase router that renders sub-components based on current phase
- Uses `useGameSocket()` hook for socket event subscription and state hydration
- Uses `emitGameInput()` from `minigame-client.ts` for sending input
- Uses `extractTimerTick()` for TIMER_TICK handling
- Uses `playSound()` from `audio.ts` for sound effects
- Accepts `MinigameProps` (`playerId`, `playerName`)

### 8.2 Sub-Components

| Component | Phase | Description |
|---|---|---|
| `PromptReveal.tsx` | PROMPT_REVEAL | Animated prompt card display |
| `WritingPhase.tsx` | WRITING | Text inputs with character counters |
| `VotingPhase.tsx` | VOTING | Head-to-head anonymous voting |
| `MatchupResult.tsx` | MATCHUP_RESULTS | Vote bar reveal with author names |
| `WitWarResults.tsx` | ROUND_RESULTS / GAME_OVER | Leaderboard and matchup summary |
| `WitWarHistoryDetail.tsx` | History | Per-round matchup replay |

---

## 9. Spectator Mode

Wit-War uses **shared-privileged** spectator mode. Spectators see the same omniscient view including:
- Current phase, round, and score information
- All prompt assignments and answers for all players
- Current matchup details with answers from both players
- Vote counts and percentages
- Full matchup results

Spectator state is sent during prompt reveals and is available via `getStateForSpectator()` for reconnection.

---

## 10. Sound Effects

The client plays sound effects at key moments using `playSound()` from `lib/rmhbox/audio.ts`:

| Moment | Sound |
|---|---|
| Prompt reveal (new round) | `swoosh` |
| Writing phase starts | `chime` |
| Answer accepted | `click` |
| New matchup starts | `swoosh` |
| Vote cast | `click` |
| Matchup result revealed | `scoreDing` |
| Wit-War! unanimous win | `victoryFanfare` |
| Round results | `scoreDing` |
| Timer countdown (≤5 seconds) | `countdownBeep` |

---

## 11. Game Settings

Host-configurable settings (defined as `WIT_WAR_SETTINGS` in `lib/rmhbox/minigame-registry.ts`):

| Setting | Type | Default | Range | Description |
|---|---|---|---|---|
| `totalRounds` | integer | 2 | 1–3 | Number of rounds |
| `writingDuration` | integer | 60 | 30–120 | Writing phase duration (seconds) |
| `votingDuration` | integer | 15 | 10–30 | Voting duration per matchup (seconds) |

Settings are read via `this.getSetting(key, fallback)` in the handler.

---

## 12. History & Awards

### 12.1 Game Log

The game log stored in match history has type `'wit-war'` and includes:
- `initialState` — `totalRounds`, `playerCount`
- `actions` — Sequenced log of `prompt_reveal`, `writing_end`, `answer_submitted`, `matchup_resolved` events

### 12.2 History Display

Registered in `lib/rmhbox/history-display-registrations.ts` with:
- **DetailComponent**: `WitWarHistoryDetail` — Per-round matchup replay viewer
- **Searchable fields**: Prompts, Answers
- **Filterable fields**: Had Quiplash (boolean), Matchup Wins (range)
- **getSummary**: "X matchups — Y quiplashes"

### 12.3 Awards

| Award | Criteria | Icon |
|---|---|---|
| **Crowd Pleaser** | Highest average vote percentage per matchup | `heart` |
| **Wit-War!** | Most unanimous matchup wins | `zap` |
| **Dark Horse** | Won a single matchup with >75% of the vote | `trending-up` |

---

## 13. Data Files

- **Location**: `data/rmhbox/wit-war/prompts.json`
- **Format**: JSON array of prompt strings
- **Loading**: `lib/rmhbox/wit-war/data-loader.ts` with filesystem caching
- **Selection**: Fisher-Yates shuffle with used-index exclusion

---

## 14. File Structure

```
lib/rmhbox/wit-war/
├── schemas.ts              # SubmitAnswerSchema, CastVoteSchema
└── data-loader.ts          # loadPrompts(), selectRoundPrompts(), assignPromptsToPlayers()

server/rmhbox/minigames/wit-war/
├── index.ts                # Barrel export
├── handler.ts              # WitWarMinigame (extends BaseMinigame)
└── types.ts                # WitWarPhase, WWMatchup, WWPromptAssignment, WitWarState

components/rmhbox/minigames/wit-war/
├── WitWarGame.tsx           # Main phase router
├── PromptReveal.tsx         # Animated prompt display
├── WritingPhase.tsx         # Answer text inputs
├── VotingPhase.tsx          # Head-to-head voting
├── MatchupResult.tsx        # Vote result reveal
├── WitWarResults.tsx        # Leaderboard + matchup summary
└── WitWarHistoryDetail.tsx  # History detail view

data/rmhbox/wit-war/
└── prompts.json            # Static prompt data
```

### Registration Points

1. `lib/rmhbox/constants.ts` — `WW_*` constants
2. `lib/rmhbox/minigame-registry.ts` — `MINIGAME_REGISTRY['wit-war']` + `WIT_WAR_SETTINGS`
3. `server/rmhbox/game-coordinator.ts` — `MINIGAME_SERVER_REGISTRY['wit-war']`
4. `components/rmhbox/minigames/MinigameRenderer.tsx` — `MINIGAME_COMPONENTS['wit-war']`
5. `lib/rmhbox/history-display-registrations.ts` — History display config
