# RMHbox — Codebase Reference for Coding Agents

> **Maintenance Requirement:** This document must be kept up-to-date whenever changes are made to the core design, structure, patterns, or architecture of the RMHbox codebase. Any agent working on RMHbox should verify that this document still accurately reflects the codebase after their changes, and update it if anything has changed.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Directory Structure](#directory-structure)
4. [Technology Stack](#technology-stack)
5. [Shared Type System](#shared-type-system)
6. [WebSocket Protocol](#websocket-protocol)
7. [Server Architecture](#server-architecture)
8. [Client Architecture](#client-architecture)
9. [Minigame System](#minigame-system)
10. [Adding a New Minigame — Checklist](#adding-a-new-minigame--checklist)
11. [Game Settings System](#game-settings-system)
12. [Spectator System](#spectator-system)
13. [History & Leaderboard System](#history--leaderboard-system)
14. [Database Models](#database-models)
15. [Theming & Styling](#theming--styling)
16. [Sound System](#sound-system)
17. [Testing Conventions](#testing-conventions)
18. [Code Standards & Maintainability Guidelines](#code-standards--maintainability-guidelines)

---

## Overview

RMHbox is a real-time multiplayer party game platform built on Next.js (frontend) and a standalone Socket.io WebSocket server (backend). Players create or join lobbies via room codes, vote on or select minigames, and play together in real time. The platform supports 7 implemented minigames, spectator modes, host controls, match history, leaderboards, and reconnection.

The seven currently implemented minigames are:
- **Rhyme Time** — Speed-based vocabulary rhyming game
- **Undercover Agent** — Team-based word-association deduction (like Codenames)
- **Category Crash** — Brainstorming showdown with peer review. Phases: REVEAL → INPUT → PEER_REVIEW → ROUND_RESULTS. Voting is crash/safe; points come only from unique safe answers (no voting bonuses).
- **Wiki-Race** — Navigate Wikipedia from a start article to a target
- **Minimalist Masterpiece** — Draw with limited strokes, then art auction. Drawing phase supports auto-save (`SAVE_DRAWING`) and explicit submit (`SUBMIT_DRAWING`). Auto-save preserves drawings for reconnection and spectator live updates without locking. Explicit submit locks the drawing and ends the phase early if all players submit.
- **Emoji Cinema** — Describe movies with emojis, others guess
- **Wit-War** — Battle of wits with head-to-head voting

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                         │
│  app/rmhbox/          — Pages (landing, lobby, minigames)   │
│  components/rmhbox/   — React components                     │
│  lib/rmhbox/          — Shared types, store, socket, utils   │
├─────────────────────────────────────────────────────────────┤
│                  WebSocket (Socket.io)                        │
│            ws://host/rmhbox-ws (port 7676)                   │
├─────────────────────────────────────────────────────────────┤
│               Standalone RMHbox Server                       │
│  server/rmhbox/       — Server logic, lobby, game, auth      │
│  server/rmhbox/minigames/ — Server-side minigame handlers   │
├─────────────────────────────────────────────────────────────┤
│                   PostgreSQL (Prisma)                         │
│  RMHboxProfile, RMHboxMatch, RMHboxMatchPlayer              │
└─────────────────────────────────────────────────────────────┘
```

The client and server are **separate processes**. The RMHbox WebSocket server runs independently on port 7676 (configurable via `RMHBOX_PORT`), separate from the main Next.js server. Communication is exclusively via Socket.io WebSocket events.

---

## Directory Structure

### Core Platform Files

```
lib/rmhbox/
├── types.ts                    # Shared type definitions (client + server)
├── events.ts                   # WebSocket event name constants (C2S, S2C)
├── constants.ts                # Shared tuning constants (timers, scoring, limits)
├── schemas.ts                  # Shared Zod validation schemas for event payloads
├── store.ts                    # Client-side Zustand store
├── socket.ts                   # Client-side Socket.io connection manager
├── minigame-client.ts          # Shared hooks/utils for minigame components
├── minigame-registry.ts        # Minigame metadata definitions + settings schemas
├── game-settings.ts            # Game settings validation & defaults
├── audio.ts                    # Sound effect manager (Howler.js)
├── toast-store.ts              # Toast notification store
├── utils.ts                    # Shared utilities (sanitize, room code gen)
├── history-display-registry.ts # History detail component registry
├── history-display-registrations.ts # All minigame history registrations
└── <minigame-id>/              # Per-minigame shared code (schemas, data loaders)
    ├── schemas.ts
    └── data-loader.ts
```

```
server/rmhbox/
├── index.ts                    # Server entry point — bootstraps all services
├── config.ts                   # Server configuration (env vars, defaults)
├── auth.ts                     # WebSocket auth middleware (Better Auth tokens)
├── lobby-manager.ts            # Lobby CRUD, joins, leaves, host controls, GC
├── game-coordinator.ts         # Game lifecycle state machine orchestration
├── vote-manager.ts             # Minigame voting system
├── state-sync.ts               # Heartbeat, phase sync, timer broadcasting
├── reconnection.ts             # Player reconnection & duplicate session handling
├── chat.ts                     # Chat message handling
├── leaderboard.ts              # Match persistence & leaderboard queries
├── rate-limit.ts               # Per-socket rate limiting
├── schemas.ts                  # Re-exports shared schemas + `validated()` wrapper
├── logger.ts                   # Structured JSON logger
├── prisma-client.ts            # Prisma client singleton
├── types.ts                    # Server-only type definitions
└── minigames/
    ├── base-minigame.ts        # Abstract base class for all minigame handlers
    └── <minigame-id>/
        ├── index.ts            # Barrel export
        ├── handler.ts          # Minigame server handler (extends BaseMinigame)
        └── types.ts            # Minigame-specific server types
```

```
components/rmhbox/
├── RMHboxShell.tsx             # Theme wrapper + toast container
├── RMHboxHeader.tsx            # Shared header with timer ring, settings, controls
├── GameShell.tsx               # Game layout wrapper (footer with score/round/players)
├── LobbyView.tsx               # WAITING state lobby view
├── GameVoting.tsx              # VOTING state minigame selection
├── GameSettingsPhase.tsx       # GAME_SETTINGS state host settings
├── InstructionsScreen.tsx      # INSTRUCTIONS state game instructions
├── PreloadScreen.tsx           # PRELOADING state asset preload progress
├── ResultsScreen.tsx           # ROUND_RESULTS state results display
├── PlayerList.tsx              # Player list sidebar
├── ChatOverlay.tsx             # Chat overlay
├── SpectatorBanner.tsx         # Spectator mode banner with player selector
├── HostControls.tsx / HostControlModal.tsx  # Host management UI
├── GameSettingsForm.tsx / GameSettingsModal.tsx  # Settings configuration UI
├── GamePickerModal.tsx         # Minigame selection modal
├── LeaderboardPanel.tsx        # Leaderboard display
├── MinigameLeaderboardModal.tsx # Per-minigame leaderboard modal
├── ReadyButton.tsx             # Ready-up button
├── RoomCodeDisplay.tsx         # Room code display with copy
├── ToastContainer.tsx          # Toast notification renderer
├── SettingsMenu.tsx            # User settings (volume, theme)
└── minigames/
    ├── MinigameRenderer.tsx    # Dynamic lazy-loading of minigame components
    └── <minigame-id>/
        ├── <MinigameName>Game.tsx        # Main minigame component
        ├── <MinigameName>HistoryDetail.tsx # History detail view component
        └── <SubComponent>.tsx             # Game-specific sub-components
```

```
app/rmhbox/
├── layout.tsx                  # Auth gate + RMHboxShell wrapper
├── page.tsx                    # Landing page (create/join/browse/leaderboard)
├── rmhbox.css                  # Theme stylesheet (CSS custom properties)
├── [lobbyId]/page.tsx          # Lobby page (state machine view renderer)
└── minigames/
    ├── page.tsx                # Minigames catalog page
    └── [minigameId]/history/page.tsx  # Per-minigame match history
```

```
app/api/rmhbox/
├── history/route.ts            # Match history REST API
├── stats/route.ts              # Player stats REST API
└── leaderboard/route.ts        # Leaderboard REST API
```

```
data/rmhbox/<minigame-id>/     # Static JSON data files for minigames
testing/rmhbox/                 # Test suites organized by implementation phase
public/music/rmhbox/sfx/       # Sound effect files
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Next.js (App Router, React 18+) |
| State Management | Zustand (with `persist` middleware for user settings) |
| Real-time Communication | Socket.io (client + server) |
| Validation | Zod (shared schemas, both client and server) |
| Database | PostgreSQL via Prisma ORM |
| Authentication | Better Auth (session tokens validated against DB) |
| Styling | Tailwind CSS + CSS custom properties (design tokens) |
| Sound | Howler.js |
| Testing | Vitest |
| Package Manager | pnpm |
| Language | TypeScript (strict mode) |

---

## Shared Type System

Types are split between shared (client + server) and server-only:

### `lib/rmhbox/types.ts` — Shared Types

Key interfaces available to both client and server:

- **`LobbyState`** — Union type of all lobby state machine states: `'WAITING' | 'VOTING' | 'GAME_SETTINGS' | 'INSTRUCTIONS' | 'PRELOADING' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_RESULTS' | 'SESSION_RESULTS' | 'DISBANDED'`
- **`LobbySettings`** — Configurable lobby properties (isPublic, maxPlayers, etc.)
- **`ClientLobbyState`** — The complete state snapshot sent to clients (lobby info, players, spectators, current game, chat, match history)
- **`ClientPlayerInfo`** / **`ClientSpectatorInfo`** — Player/spectator data for the client
- **`ClientGameInfo`** — Active game state sent to client (minigameId, phase, timeRemaining, publicState, privateState, spectatorMode)
- **`GameAction`** — Sequenced game action with type, payload, seq, timestamp
- **`MinigameDefinition`** — Full minigame metadata (id, displayName, description, category, icon, player limits, settings schema, join-in-progress policy, preload assets, etc.)
- **`GameSettingDef`** / **`GameSettingsSchema`** / **`GameSettingValues`** — Host-configurable game settings types
- **`SpectatorMode`** — `'shared-privileged' | 'competitive-individual'`
- **`RoundResultsPayload`** / **`PlayerRanking`** / **`Award`** / **`SessionStanding`** — Results types
- **`VoteCandidate`** / **`VoteStartedPayload`** / **`VoteCastPayload`** / **`VoteResultPayload`** — Voting types
- **`LeaderboardEntry`** / **`MatchSummary`** — Leaderboard and history types
- **`RMHboxError`** / **`RMHboxErrorCode`** — Structured error types
- **`MinigameCategory`** — `'word' | 'trivia' | 'action' | 'creative'`
- **`JoinInProgressPolicy`** — `'spectate_only' | 'join_next_subround' | 'join_immediately'`

### `server/rmhbox/types.ts` — Server-Only Types

- **`RMHboxPlayer`** — Full server-side player state (includes socketId, joinedAt, lastSeenAt, role)
- **`RMHboxSpectator`** — Full server-side spectator state
- **`RMHboxLobby`** — Complete lobby state (Map-based players/spectators, active game handler, match history, pending settings)
- **`ActiveGame`** — Contains the minigame handler instance, minigameId, and start timestamp
- **`ServerMatchSummary`** — Internal match result tracking
- **`MinigameContext`** / **`MinigameResults`** — Re-exported from base-minigame.ts

---

## WebSocket Protocol

### Event Naming Convention

All events use the `rmhbox:` prefix for namespacing. Events are defined in `lib/rmhbox/events.ts` as two constant objects:

- **`C2S`** — Client-to-Server events (e.g., `rmhbox:lobby:create`, `rmhbox:game:input`)
- **`S2C`** — Server-to-Client events (e.g., `rmhbox:lobby:state_snapshot`, `rmhbox:game:action`)

### Key Events

**Lobby Management (C2S):**
- `LOBBY_CREATE`, `LOBBY_JOIN`, `LOBBY_LEAVE`, `LOBBY_KICK`, `LOBBY_TRANSFER_HOST`
- `LOBBY_UPDATE_SETTINGS`, `LOBBY_TOGGLE_READY`, `LOBBY_CHAT`, `LOBBY_BROWSE`
- `LOBBY_REQUEST_PROMOTION`, `LOBBY_PROMOTE_SPECTATOR`, `LOBBY_END_SESSION`

**Game Flow (C2S):**
- `GAME_PICK` — Host selects a game (or `__vote__` for vote mode)
- `GAME_SELECT` — Host selects a game directly
- `GAME_START_VOTE` — Host initiates voting
- `GAME_CAST_VOTE` — Player votes for a game
- `GAME_FORCE_SKIP` — Host skips current phase
- `GAME_FORCE_END` — Host force-ends the game
- `GAME_PAUSE_TIMER` — Host pauses/resumes timer
- `GAME_READY_TO_RENDER` — Client signals preload complete
- `GAME_INPUT` — Player sends game-specific input

**State Sync (S2C):**
- `LOBBY_STATE_SNAPSHOT` — Full client state (sent on join, reconnect, heartbeat)
- `GAME_ACTION` — Sequenced incremental action (reducer-applied on client)
- `GAME_STATE_SNAPSHOT` — Full game-specific state snapshot
- `GAME_INSTRUCTIONS`, `GAME_PRELOAD_START`, `GAME_COUNTDOWN`, `GAME_STARTED`
- `GAME_ROUND_RESULTS`, `GAME_SESSION_RESULTS`
- `GAME_VOTE_STARTED`, `GAME_VOTE_UPDATE`, `GAME_VOTE_RESULT`
- `GAME_SETTINGS_OPENED`, `GAME_SETTINGS_UPDATED`
- `SPECTATOR_TARGET_STATE` — Spectator target player info
- `ERROR` — Structured error with code and message

### Payload Validation

All C2S event payloads are validated using Zod schemas defined in `lib/rmhbox/schemas.ts`. The server uses the `validated()` wrapper from `server/rmhbox/schemas.ts` which combines:
1. Rate limiting (per-socket, per-event)
2. Zod schema validation
3. Error emission on failure
4. Try-catch wrapping for handler execution

Usage pattern:
```typescript
socket.on(C2S.SOME_EVENT, validated(socket, C2S.SOME_EVENT, SomeSchema, (s, data) => {
  this.handleSomeEvent(s, data);
}));
```

### State Synchronization Model

The client receives state via two mechanisms:
1. **Full snapshots** (`LOBBY_STATE_SNAPSHOT`) — Complete `ClientLobbyState` sent on join, reconnect, and periodic heartbeat during gameplay
2. **Incremental actions** (`GAME_ACTION`) — Sequenced `GameAction` objects applied by reducer functions in the Zustand store

Actions have a monotonically increasing `seq` number. The client's `applyAction()` skips any action with `seq <= lastSeq` to prevent out-of-order duplicates.

The store has two reducer functions:
- **`applyLobbyAction()`** — Handles lobby-level actions (PLAYER_JOINED, STATE_CHANGED, TIMER_TICK, etc.)
- **`applyGameAction()`** — Stores game-specific actions as raw payloads keyed by action type under `gameState`

---

## Server Architecture

### Entry Point (`server/rmhbox/index.ts`)

The server creates an HTTP server + Socket.io instance, applies auth middleware, and bootstraps these services:
- **`LobbyManager`** — Lobby CRUD, player management, GC
- **`StateSyncService`** — Heartbeat broadcasting, phase sync, timer broadcasts
- **`LeaderboardService`** — Match persistence, leaderboard queries
- **`GameCoordinator`** — Game lifecycle orchestration
- **`VoteManager`** — Voting system
- **`ChatHandler`** — Chat message handling
- **`ReconnectionHandler`** — Reconnection protocol

Each service implements a `handleConnection(socket)` method that registers its Socket.io event listeners on the socket.

### Lobby Manager

Manages all lobbies in memory using `Map<string, RMHboxLobby>`. Key features:
- **Room code generation** — 6-character codes using a custom alphabet (excludes ambiguous chars)
- **Player/spectator tracking** — `Map<string, RMHboxPlayer>` and `Map<string, RMHboxSpectator>`
- **User→Lobby index** — `Map<string, string>` for O(1) userId→lobbyId lookup
- **Sequence counters** — Per-lobby incrementing `seq` for GameActions
- **Grace timers** — For handling temporary disconnects
- **Garbage collection** — Periodic cleanup of idle/empty lobbies
- **Join-in-progress** — Pending join queue for `join_next_subround` policy
- **`buildClientState()`** — The ONLY function that constructs `ClientLobbyState` from internal state, ensuring data masking/scoping
- **`broadcastAction()`** — Emits sequenced `GameAction` to all lobby members

### Game Coordinator

Orchestrates the game lifecycle state machine:

```
WAITING → VOTING → GAME_SETTINGS → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
```

Key responsibilities:
- **Phase transitions** — Drives state transitions with timed phases
- **Minigame instantiation** — Uses `MINIGAME_SERVER_REGISTRY` to create handler instances
- **Input routing** — Routes `GAME_INPUT` to the active handler's `handleInput()`
- **Timer management** — Delegates to `StateSyncService.startTimerBroadcast()` for timed phases, or the minigame handler manages its own timers via `BaseMinigame`
- **Disconnect handling** — Grace timers for in-game disconnects
- **Spectator target tracking** — Manages which player each spectator is following
- **Results processing** — Calls `computeResults()` and persists via LeaderboardService

**`MINIGAME_SERVER_REGISTRY`** is a `Map<string, Constructor>` in `game-coordinator.ts` that maps minigame IDs to their server handler class constructors. New minigames must be registered here.

### State Sync Service

- **Heartbeat** — Periodic full state snapshots to all in-game lobbies (every 10s by default)
- **Phase transition sync** — Immediate full sync on state changes
- **Timer broadcasting** — `startTimerBroadcast()` creates a 1-second countdown that emits `TIMER_START` then `TIMER_TICK` actions; returns a `TimerHandle` with cancel/pause/resume

### Authentication

The `authMiddleware` validates Better Auth session tokens against PostgreSQL on every new connection. It attaches `userId`, `userName`, and `avatarUrl` to `socket.data`.

### Reconnection

The `ReconnectionHandler` identifies returning users by `userId` (not `socketId`), re-associates their socket with the existing lobby slot, sends a full state snapshot to resync, and handles duplicate sessions (same user, different tab).

---

## Client Architecture

### Zustand Store (`lib/rmhbox/store.ts`)

The `useRMHboxStore` is the central state for all RMHbox client-side data:

```typescript
interface RMHboxStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lobby: ClientLobbyState | null;
  gameState: Record<string, unknown>;
  lastSeq: number;
  settings: RMHboxUserSettings;      // Persisted to localStorage
  timerInfo: TimerInfo | null;         // Header timer ring state
  minigameRound: MinigameRoundInfo | null;  // Footer round counter
  gameSettingsState: GameSettingsState | null;
  spectatorTarget: SpectatorTargetInfo | null;
  // ... actions
}
```

Key patterns:
- Only `settings` is persisted to localStorage via Zustand's `persist` middleware
- `applyAction()` enforces sequence ordering via `lastSeq`
- `applyFullSync()` replaces the entire lobby state
- `leaveLobby()` clears all lobby/game state
- Timer and round state is written directly by store actions (not via reducers) for immediate reactivity

### Socket Client (`lib/rmhbox/socket.ts`)

Module-level singleton `socket` with these exports:
- **`connectToRMHbox()`** — Creates connection with auth token, sets up global event listeners, returns socket
- **`getSocket()`** — Returns current socket instance (may be null)
- **`disconnectFromRMHbox()`** — Disconnects and resets store
- **`emit()`** — Null-safe emit helper

The socket uses dynamic auth callbacks to refresh the session token on every reconnection attempt.

### Minigame Client Utilities (`lib/rmhbox/minigame-client.ts`)

Shared hooks and utilities used by all minigame components:
- **`emitGameInput(action, data)`** — Sends game input with lobbyId from store
- **`useGameSocket(handlers)`** — Subscribes to `GAME_ACTION` + `GAME_STATE_SNAPSHOT` events, hydrates from store on mount
- **`extractTimerTick(data)`** — Extracts timeRemaining from TIMER_TICK action payload

### Page Structure

- **Landing page** (`app/rmhbox/page.tsx`) — Connect, create/join lobby, browse public lobbies, view leaderboard
- **Lobby page** (`app/rmhbox/[lobbyId]/page.tsx`) — State machine renderer that shows the appropriate component based on `lobby.state`
- **Layout** (`app/rmhbox/layout.tsx`) — Auth gate (redirects unauthenticated users) + `RMHboxShell` theme wrapper

The lobby page renders different components based on `lobby.state`:
| State | Component |
|-------|-----------|
| `WAITING` | `LobbyView` |
| `VOTING` | `GameVoting` |
| `GAME_SETTINGS` | `GameSettingsPhase` |
| `INSTRUCTIONS` | `InstructionsScreen` |
| `PRELOADING` | `PreloadScreen` |
| `COUNTDOWN` | Countdown overlay |
| `PLAYING` | `GameShell` + `MinigameRenderer` |
| `ROUND_RESULTS` | `ResultsScreen` |
| `SESSION_RESULTS` | Session results view |

---

## Minigame System

### Server-Side Handler Pattern

Every minigame server handler extends `BaseMinigame` (in `server/rmhbox/minigames/base-minigame.ts`).

#### `MinigameContext` — Provided to Every Handler

```typescript
interface MinigameContext {
  lobbyId: string;
  players: Map<string, RMHboxPlayer>;
  settings: LobbySettings;
  gameSettings: GameSettingValues;           // Host-configured settings
  getHostId: () => string;
  broadcastToLobby: (event, data) => void;   // All members
  broadcastToPlayers: (event, data) => void; // Players only
  broadcastAction: (action) => void;          // Sequenced GameAction
  sendToPlayer: (userId, event, data) => void;
  sendToSpectators: (event, data) => void;
  sendToSpectatorFollowers: (targetPlayerId, event, data) => void;
  onComplete: (results) => void;              // Signal game end
  onError: (error) => void;
}
```

#### Abstract Methods to Implement

| Method | Description |
|--------|-------------|
| `start()` | Called when PLAYING begins. Initialize game state and start game logic. |
| `handleInput(userId, action, data)` | Called when a player sends game input. Route by action string. |
| `getStateForPlayer(userId)` | Return scoped state for a specific player (reconnection, heartbeat). |
| `getStateForSpectator()` | Return omniscient/privileged state for spectators. |
| `computeResults()` | Compute final `MinigameResults` (rankings, awards, gameSpecificData, duration). |
| `get spectatorMode` | Return `'shared-privileged'` or `'competitive-individual'`. |

#### Built-in Helpers from BaseMinigame

- **Timer management:**
  - `setTimeout(fn, ms)` — Tracked timeout, auto-cleaned, pausable
  - `clearTrackedTimeout(handle)` — Cancel a specific tracked timeout
  - `setInterval(fn, ms)` — Tracked interval, auto-cleaned
  - `startPhaseTimer(durationSeconds)` — Broadcasts TIMER_START + TIMER_TICK actions every second
  - `clearPhaseTimer()` — Stops the phase timer
  - `startInfinitePhaseTimer(showSkip?)` — Broadcasts infinite timer (no countdown, full ring + ∞ icon)
  - `pausePhaseTimer()` / `resumePhaseTimer()` — Pause/resume all tracked timers + broadcast
- **State management:**
  - `getSetting<T>(key, fallback)` — Read host-configured game setting with type-safe fallback
  - `broadcastRound(current, total)` — Broadcast minigame sub-round info to clients
  - `broadcastInitialState(snapshotEvent)` — Send per-player scoped initial state to all players
  - `broadcastGameAction(data)` — Convenience wrapper for broadcasting game actions
  - `buildReconnectionSnapshot(userId, isSpectator, targetPlayerId?)` — Unified reconnection state
- **Lifecycle:**
  - `forceEnd(reason)` — Force-end with cleanup + partial results
  - `cleanup()` — Clears all timers/intervals
  - `handlePlayerJoin(userId)` — Override for join-in-progress support
  - `handlePlayerDisconnect(userId)` — Override for disconnect handling
  - `handlePlayerReconnect(userId)` — Override for reconnection side effects
- **Spectator:**
  - `getSpectatorSnapshot(targetPlayerId?)` — Dispatches to correct spectator state method
  - `getStateForSpectatorViewingPlayer(targetPlayerId)` — Overridable per-player spectator view
  - `getViewablePlayers()` — List of players available for spectator selection

#### Minigame Handler File Structure

Each minigame lives in `server/rmhbox/minigames/<minigame-id>/`:
- **`index.ts`** — Barrel export (exports the handler class)
- **`handler.ts`** — The handler class extending `BaseMinigame`
- **`types.ts`** — Minigame-specific types (phase enums, state interfaces, submission types)

### Client-Side Component Pattern

Each minigame has components in `components/rmhbox/minigames/<minigame-id>/`:

#### Main Game Component (`<MinigameName>Game.tsx`)

This is the root component loaded by `MinigameRenderer`. It receives `MinigameProps`:

```typescript
interface MinigameProps {
  playerId: string;
  playerName: string;
}
```

Standard pattern used by all minigame components:
1. Define local state for the game's current phase, data, etc.
2. Use `useGameSocket()` hook to subscribe to `GAME_ACTION` and `GAME_STATE_SNAPSHOT` events
3. In the `onGameAction` callback, dispatch based on `data.type` to update local state
4. In the `onStateSnapshot` callback, hydrate full local state from the snapshot
5. Use `emitGameInput(action, data)` to send player input to the server
6. Render different views based on the current phase

#### MinigameRenderer (`components/rmhbox/minigames/MinigameRenderer.tsx`)

Dynamically lazy-loads minigame components using `React.lazy()`. The `MINIGAME_COMPONENTS` map associates minigame IDs to their lazy-loaded component imports. **New minigames must be added here.**

Also exports two hooks for minigame components:
- **`useHeaderTimer()`** — Control the header timer ring (startTimer, tickTimer, clearTimer)
- **`useMinigameRound()`** — Control the footer round counter (setRound, clearRound)

#### History Detail Component (`<MinigameName>HistoryDetail.tsx`)

Renders the expanded view of a past match's game log. Receives `HistoryDetailProps`:

```typescript
interface HistoryDetailProps {
  gameLog: GameLog;
  currentUserId: string;
  players: Array<{ userId: string; userName: string; rank: number; score: number }>;
}
```

### Shared Minigame Code in `lib/rmhbox/`

Per-minigame shared code lives in `lib/rmhbox/<minigame-id>/`:
- **`schemas.ts`** — Zod validation schemas for game-specific inputs
- **`data-loader.ts`** — Data loading functions (reading from `data/rmhbox/<minigame-id>/`)

Static data files live in `data/rmhbox/<minigame-id>/` as JSON files.

---

## Adding a New Minigame — Checklist

When adding a new minigame, the following files/registrations are required:

### 1. Shared Types & Constants

- [ ] Add game-specific constants to `lib/rmhbox/constants.ts` (use a consistent prefix, e.g., `XY_` for "XY Game")
- [ ] If the minigame has player input that needs validation, create `lib/rmhbox/<minigame-id>/schemas.ts` with Zod schemas
- [ ] If the minigame needs static data, create `data/rmhbox/<minigame-id>/` with JSON files and `lib/rmhbox/<minigame-id>/data-loader.ts`

### 2. Minigame Registry

- [ ] Add the `MinigameDefinition` entry to `MINIGAME_REGISTRY` in `lib/rmhbox/minigame-registry.ts`
  - Define id, displayName, description, category, icon (Lucide icon name), minPlayers, maxPlayers, estimatedDurationSeconds, supportsTeams, instructionDurationSeconds, preloadAssets, joinInProgressPolicy, tags
  - If the minigame has host-configurable settings, define a `GameSettingsSchema` array and assign it to `settingsSchema`

### 3. Server Handler

- [ ] Create `server/rmhbox/minigames/<minigame-id>/types.ts` — Phase enum, state interfaces, submission types
- [ ] Create `server/rmhbox/minigames/<minigame-id>/handler.ts` — Handler class extending `BaseMinigame`
  - Implement all abstract methods: `start()`, `handleInput()`, `getStateForPlayer()`, `getStateForSpectator()`, `computeResults()`, `get spectatorMode`
  - Use `this.getSetting(key, FALLBACK_CONSTANT)` for host-configurable settings
  - Use `this.setTimeout()` / `this.setInterval()` for tracked timers
  - Use `this.startPhaseTimer()` / `this.clearPhaseTimer()` for countdown phases
  - Use `this.broadcastRound()` for sub-round display
  - Use `this.context.broadcastAction()` for sequenced state updates
  - Use `this.context.sendToPlayer()` for per-player private state
  - Use `this.context.onComplete()` to signal game end with results
- [ ] Create `server/rmhbox/minigames/<minigame-id>/index.ts` — Barrel export
- [ ] Register the handler class in `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/game-coordinator.ts`
  - Add import and `Map` entry: `['<minigame-id>', MinigameHandlerClass]`

### 4. Client Components

- [ ] Create `components/rmhbox/minigames/<minigame-id>/<MinigameName>Game.tsx` — Main game component
  - Accept `MinigameProps` (`playerId`, `playerName`)
  - Use `useGameSocket()` for event subscription
  - Use `emitGameInput()` for sending input
  - Export as default for lazy loading
- [ ] Create game-specific sub-components as needed in the same directory
- [ ] Register the lazy import in `MINIGAME_COMPONENTS` in `components/rmhbox/minigames/MinigameRenderer.tsx`

### 5. History Display

- [ ] Create `components/rmhbox/minigames/<minigame-id>/<MinigameName>HistoryDetail.tsx`
- [ ] Register in `lib/rmhbox/history-display-registrations.ts` using `registerHistoryDisplay()`
  - Define `DetailComponent`, `searchableFields`, `filterableFields`, and `getSummary`

### 6. Game Settings (if applicable)

- [ ] Define a `GameSettingsSchema` array in `lib/rmhbox/minigame-registry.ts` (alongside the existing ones)
- [ ] Assign it to the `settingsSchema` field in the minigame's `MinigameDefinition`
- [ ] Use `this.getSetting(key, fallback)` in the handler to read settings

### 7. Testing

- [ ] Add tests following the existing patterns in `testing/rmhbox/`
- [ ] Test the handler in isolation (start, input, results, edge cases)

### 8. Verify Integration

- [ ] The game appears in the voting candidate pool (based on `MINIGAME_REGISTRY`)
- [ ] The host can pick the game directly
- [ ] Host-configured settings are passed to the handler
- [ ] The game lifecycle (instructions → preloading → countdown → playing → results) works
- [ ] Spectator mode works correctly
- [ ] Reconnection provides correct state
- [ ] Results and rankings display properly
- [ ] Match history and leaderboard persist correctly

---

## Game Settings System

The game settings system (`§12A`) allows hosts to configure minigame parameters before starting.

### Schema Definition

Settings are defined as `GameSettingsSchema` arrays (in `lib/rmhbox/minigame-registry.ts`):

```typescript
const EXAMPLE_SETTINGS: GameSettingsSchema = [
  { key: 'totalRounds', type: 'integer', label: 'Number of Rounds', description: '...', default: 3, min: 1, max: 5, step: 1 },
  { key: 'enableFeature', type: 'boolean', label: 'Feature Toggle', description: '...', default: true },
  { key: 'difficulty', type: 'select', label: 'Difficulty', description: '...', default: 'medium', options: ['easy', 'medium', 'hard'] },
];
```

### Flow

1. Host picks a game → `GAME_PICKED` action → client initializes `gameSettingsState` in store
2. Host opens settings modal → modifies values → emits `GAME_UPDATE_SETTINGS`
3. Server validates with `validateGameSettings()` → broadcasts `GAME_SETTINGS_UPDATED`
4. Host confirms → emits `GAME_CONFIRM_SETTINGS` → server resolves settings and starts game
5. Handler reads settings via `this.getSetting(key, fallback)`

### Validation

`lib/rmhbox/game-settings.ts` provides:
- `getDefaultSettings(schema)` — Build defaults object from schema
- `validateGameSettings(schema, values)` — Validate and sanitize all values
- `mergeGameSettings(schema, current, updates)` — Merge partial updates

---

## Spectator System

RMHbox supports two spectator viewing modes:

### `shared-privileged`
Spectators see an omniscient/privileged view (e.g., the spymaster's full grid in Undercover Agent). All spectators see the same state from `getStateForSpectator()`.

### `competitive-individual`
All players compete equally; spectators select a player to "follow" and see that player's individual state. Used for games like Rhyme Time and Wiki-Race where showing everything would be unfair.

Key API:
- `SPECTATOR_SELECT_PLAYER` (C2S) — Spectator chooses a player to follow
- `SPECTATOR_TARGET_STATE` (S2C) — Server sends target player info
- `sendToSpectatorFollowers(targetPlayerId, event, data)` — Forward per-player events to spectators following that player
- `getSpectatorSnapshot(targetPlayerId?)` — Dispatches to the correct state method based on mode
- `getPhaseTimerSnapshot()` — Returns current phase timer state; sent to the spectator on target switch so the timer immediately reflects the correct remaining time

---

## History & Leaderboard System

### Match Persistence

After each game completes, the `LeaderboardService` persists:
- `RMHboxMatch` — Match metadata (minigameId, lobbyId, duration, results, gameLog)
- `RMHboxMatchPlayer` — Per-player results (rank, score, wasWinner)
- `RMHboxProfile` — Updated aggregate stats (totalGamesPlayed, totalWins, totalScore, minigameStats)

### History Display Registry

`lib/rmhbox/history-display-registry.ts` defines the `HistoryDisplayConfig` interface:
- `DetailComponent` — React component for rendering game log details
- `searchableFields` — Fields extractable from game logs for search
- `filterableFields` — Fields for filtering (select, range, boolean)
- `getSummary()` — One-line summary from a game log

All minigames register their history display in `lib/rmhbox/history-display-registrations.ts`.

### History Page UI (`app/rmhbox/minigames/[minigameId]/history/page.tsx`)

The history page consumes the registered `HistoryDisplayConfig` to provide:
- **Search bar** — Searches player names, dates, and all `searchableFields` extracted from each match's `gameLog`. Placeholder text lists available searchable fields.
- **Filter controls** — Renders `select`-type `filterableFields` as dropdowns, with options aggregated from all loaded match game logs.
- **Summary display** — Each match entry row shows the `getSummary()` result from the game log for quick recall.
- **Detail expansion** — Clicking a match loads the full `gameLog` and renders the minigame's `DetailComponent`.

The list API (`GET /api/rmhbox/history`) includes `gameLog` in list responses to support client-side search, filtering, and summary computation.

### REST APIs

- `GET /api/rmhbox/history` — Paginated match history with optional match detail
- `GET /api/rmhbox/stats` — Player statistics
- `GET /api/rmhbox/leaderboard` — Leaderboard data

---

## Database Models

Defined in `prisma/schema.prisma`:

```prisma
model RMHboxProfile {
  id, userId (unique), totalGamesPlayed, totalWins, totalScore,
  minigameStats (Json), currentWinStreak, bestWinStreak, createdAt, updatedAt
  → matches: RMHboxMatchPlayer[]
}

model RMHboxMatch {
  id, minigameId, lobbyId, startedAt, endedAt, durationMs,
  winnerUserId, playerCount, gameLog (Json), results (Json)
  → players: RMHboxMatchPlayer[]
}

model RMHboxMatchPlayer {
  id, matchId, profileId, userId, userName, rank, score, wasWinner
}
```

---

## Theming & Styling

RMHbox uses CSS custom properties (design tokens) for a fully isolated visual identity. The theme stylesheet is `app/rmhbox/rmhbox.css`.

### Design Token Pattern

All RMHbox-specific colors, fonts, and spacing use the `--rmhbox-` prefix:

```css
.rmhbox-theme {
  --rmhbox-bg: #1a1b1e;
  --rmhbox-surface: #27282c;
  --rmhbox-text: #e8e8ec;
  --rmhbox-accent: #6ea8d9;
  --rmhbox-success: #7bc88a;
  --rmhbox-danger: #d98a8a;
  --rmhbox-warning: #d9c36e;
  /* ... */
}
```

### Dark/Light Theme

- Default is dark theme (`.rmhbox-theme`)
- Light theme activated by adding `.rmhbox-light` class (`.rmhbox-theme.rmhbox-light`)
- Theme toggle is in user settings, persisted via Zustand

### Usage in Components

Reference tokens via Tailwind arbitrary values:
```tsx
<div className="bg-(--rmhbox-surface) text-(--rmhbox-text) border-(--rmhbox-border)">
```

### Icons

The codebase uses [Lucide React](https://lucide.dev/) icons. Minigame icons in `MinigameDefinition` reference Lucide icon names (e.g., `'mic-vocal'`, `'shield-check'`, `'globe'`, `'brush'`, `'clapperboard'`).

---

## Sound System

`lib/rmhbox/audio.ts` provides a simple API using Howler.js:
- `playSound(name: SoundName)` — Play a sound effect at current volume settings
- `preloadSounds()` — Preload all sound files

Available sounds: `chime`, `click`, `countdownBeep`, `goFanfare`, `scoreDing`, `buzzer`, `victoryFanfare`, `swoosh`

Sound files are stored in `public/music/rmhbox/sfx/`. Volume respects the user's `masterVolume × sfxVolume` settings from the Zustand store.

---

## Testing Conventions

Tests are organized in `testing/rmhbox/` by implementation phase:
- `phase-1/` — Core types, schemas, constants, utils, auth, rate limiting, registry
- `phase-2/` — Lobby management (creation, join, leave, host controls, chat, ready-up)
- `phase-3/` — Game coordination (voting, state sync, reconnection, spectators)
- `phase-4/` — Client store, UI components, database, API routes, sound system
- `phase-5/` — Minigame implementations (Rhyme Time, Undercover Agent, Category Crash, Wiki-Race)
- `phase-6/` — Minigame implementations (Minimalist Masterpiece, Emoji Cinema)

Each phase has a `setup.ts` file for shared test utilities and mocking. Tests use **Vitest** as the test runner.

Security state masking tests (`security-state-masking.test.ts`) exist in each phase directory, verifying that sensitive server state is never leaked to clients.

---

## Code Standards & Maintainability Guidelines

### General Principles

1. **Modularity** — Every file should have a single, clear responsibility. The RMHbox codebase is organized by domain (lobby management, game coordination, per-minigame logic) with clean boundaries.

2. **Separation of Concerns**
   - Shared code (client + server) lives in `lib/rmhbox/`
   - Server-only code lives in `server/rmhbox/`
   - UI components live in `components/rmhbox/`
   - Page routes live in `app/rmhbox/`
   - Each minigame is self-contained in its own subdirectory at each layer

3. **No Cross-Minigame Dependencies** — Minigame implementations must never import from other minigames. All shared functionality lives in the base class or shared utilities.

### File Organization

- **Barrel exports** — Each minigame server handler directory must have an `index.ts` that exports the handler class
- **Consistent naming** — Files use kebab-case; React components use PascalCase; types/interfaces use PascalCase; constants use UPPER_SNAKE_CASE
- **File headers** — Every file begins with a JSDoc comment describing its purpose, responsibilities, and relevant reference sections
- **Section separators** — Use `// ─── Section Name ────` comment dividers within files to organize logical sections

### TypeScript Standards

- **Strict mode** — TypeScript strict mode is enabled
- **Explicit typing** — Use explicit types for function parameters, return types (on exported functions), and interface fields
- **`unknown` over `any`** — Always prefer `unknown` and narrow with type guards; never use `any` unless absolutely unavoidable
- **Readonly where possible** — Mark readonly fields and use `as const` for immutable constants
- **Import types with `type` keyword** — Use `import type { ... }` for type-only imports

### Validation

- **Zod everywhere** — All external inputs (WebSocket payloads, API request bodies, data files) must be validated with Zod schemas before use
- **Schema co-location** — Shared schemas go in `lib/rmhbox/schemas.ts`; minigame-specific schemas go in `lib/rmhbox/<minigame-id>/schemas.ts`
- **Transform in schemas** — Use Zod `.transform()` for normalization (trimming, lowercasing) at the schema level

### Error Handling

- **Structured errors** — All errors emitted to clients use `RMHboxError` with a typed `RMHboxErrorCode`
- **Try-catch isolation** — All handler callbacks and timer callbacks are wrapped in try-catch. The `validated()` wrapper handles this for event handlers
- **BaseMinigame error isolation** — All `setTimeout` and `setInterval` callbacks in BaseMinigame are wrapped to catch errors and route them to `context.onError()`
- **Fire-and-forget persistence** — Database writes (match persistence) are async and must not affect game flow on failure

### State Management

- **Single source of truth** — Server holds authoritative game state; client state is derived from server events
- **Sequence ordering** — All client state updates respect monotonic `seq` numbers
- **State masking** — `buildClientState()` in LobbyManager is the ONLY exit point for state data, ensuring internal fields are never leaked
- **Per-player scoping** — Game state sent to players is scoped via `getStateForPlayer(userId)` — never send a player another player's private state

### React Component Patterns

- **`'use client'`** — All interactive components must have the `'use client'` directive
- **Lazy loading** — Minigame components are loaded via `React.lazy()` in MinigameRenderer
- **Hooks for shared behavior** — Use custom hooks (`useGameSocket`, `useHeaderTimer`, `useMinigameRound`) for common patterns
- **Zustand selectors** — Use specific selectors like `useRMHboxStore((s) => s.lobby)` to minimize re-renders
- **Cleanup on unmount** — Hooks must clean up subscriptions and timers in their cleanup functions
- **No inline styles except for CSS variables** — Use Tailwind classes with CSS variable references; avoid hardcoded colors

### Constants

- **Centralized** — All tuning constants (timers, scoring, limits) live in `lib/rmhbox/constants.ts`
- **Per-minigame prefix** — Minigame constants use a 2-letter prefix (e.g., `RT_` for Rhyme Time, `UA_` for Undercover Agent, `CC_` for Category Crash, `WR_` for Wiki-Race, `MM_` for Minimalist Masterpiece, `EC_` for Emoji Cinema, `WW_` for Wit-War)
- **Server config** — Server-specific runtime configuration (env vars, ports) lives in `server/rmhbox/config.ts`

### Adding New Features

When adding new features to the RMHbox platform:
1. Define types in `lib/rmhbox/types.ts` (shared) or `server/rmhbox/types.ts` (server-only)
2. Add event names to `C2S` and `S2C` in `lib/rmhbox/events.ts`
3. Create Zod schemas in `lib/rmhbox/schemas.ts`
4. Implement server logic in the appropriate service
5. Update the Zustand store reducers if new actions are needed
6. Add socket event listeners in `lib/rmhbox/socket.ts` if new S2C events exist
7. Create/update UI components
8. Write tests
9. **Update this document** if the change affects core architecture or patterns
