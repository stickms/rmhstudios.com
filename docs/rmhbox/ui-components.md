# RMHbox — Reusable UI Components

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft

This document catalogs all reusable UI components built for RMHbox. Each component is designed for reuse across minigames and core UI. Components will be documented here as they are built in subsequent phases.

---

## Planned Components

### Buttons
- **ReadyButton** — Animated ready/unready toggle
- **ActionButton** — Primary action button with loading/disabled states
- **HostControlButton** — Host-only action buttons with confirmation

### Modals
- **ConfirmModal** — Generic confirmation dialog (kick player, end session)
- **ResultsModal** — Post-game results overlay

### Timer Bars
- **TimerBar** — Horizontal countdown bar with configurable duration and styling
- **CircularTimer** — Circular countdown for compact displays

### Displays
- **RoomCodeDisplay** — Large room code with copy-to-clipboard
- **PlayerList** — Avatar + name list with connection status indicators
- **SpectatorBanner** — "You are spectating" persistent banner
- **ScoreBoard** — Session standings with rank changes

### Chat
- **ChatOverlay** — In-lobby text chat with auto-scroll and system messages

---

## Component API Documentation

_Front-end UI components will be documented here as they are implemented in later phases. Phase 2 established the server-side WebSocket APIs and client state types (`ClientLobbyState`, `ClientPlayerInfo`, `ClientSpectatorInfo`, `PublicLobbyInfo`) that these components will consume._

### Server-Side Data Contracts (Phase 2)

The following client-safe types are available for component development:

| Type | Source | Description |
|------|--------|-------------|
| `ClientLobbyState` | `lib/rmhbox/types.ts` | Full lobby state snapshot sent to clients |
| `ClientPlayerInfo` | `lib/rmhbox/types.ts` | Player info without internal fields (no socketId, joinedAt) |
| `ClientSpectatorInfo` | `lib/rmhbox/types.ts` | Spectator info for display |
| `ClientGameInfo` | `lib/rmhbox/types.ts` | Current game info with phase and public/private state |
| `PublicLobbyInfo` | `lib/rmhbox/types.ts` | Lobby browser entry with player count and status |
| `ChatMessage` | `lib/rmhbox/types.ts` | Chat message with id, userId, content, type |
| `GameAction` | `lib/rmhbox/types.ts` | Broadcast action with seq counter and type |
| `VoteCandidate` | `lib/rmhbox/types.ts` | Vote candidate with minigameId, displayName, description |
| `VoteStartedPayload` | `lib/rmhbox/types.ts` | Vote started event with candidates and duration |
| `VoteCastPayload` | `lib/rmhbox/types.ts` | Vote update with tallies and voter counts |
| `VoteResultPayload` | `lib/rmhbox/types.ts` | Vote result with winner and tallies |
| `RoundResultsPayload` | `lib/rmhbox/types.ts` | Round results with rankings and awards |
| `SessionStanding` | `lib/rmhbox/types.ts` | Cumulative session standings |
| `MatchSummary` | `lib/rmhbox/types.ts` | Match history entry |

### WebSocket Events (Phase 2–3)

Key events for UI component integration:

| Event | Direction | Description |
|-------|-----------|-------------|
| `rmhbox:lobby:created` | S→C | Lobby creation confirmation with lobbyId |
| `rmhbox:lobby:state_snapshot` | S→C | Full state snapshot on join/reconnect |
| `rmhbox:game:action` | S→C | Game actions (PLAYER_JOINED, CHAT_MESSAGE, TIMER_TICK, STATE_CHANGED, etc.) |
| `rmhbox:lobby:browse_result` | S→C | Public lobby browser results |
| `rmhbox:lobby:kicked` | S→C | Kicked notification |
| `rmhbox:lobby:disbanded` | S→C | Lobby disbanded notification |
| `rmhbox:game:vote_started` | S→C | Vote initiated with candidates and timer |
| `rmhbox:game:vote_update` | S→C | Vote tallies updated after a cast |
| `rmhbox:game:vote_result` | S→C | Vote resolved with winning minigame |
| `rmhbox:game:instructions` | S→C | Game instructions with rules, tips, controls |
| `rmhbox:game:preload_start` | S→C | Preload manifest for game assets |
| `rmhbox:game:preload_progress` | S→C | Player readiness during preloading |
| `rmhbox:game:countdown` | S→C | Countdown started with seconds |
| `rmhbox:game:started` | S→C | Game has started playing |
| `rmhbox:game:round_results` | S→C | Round results with rankings and awards |
| `rmhbox:game:state_snapshot` | S→C | Per-player game state snapshot (reconnection) |

### Game Lifecycle Phases (Phase 3)

Components should be aware of the game lifecycle state machine:

```
WAITING → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
```

The `ClientGameInfo.phase` field reflects the current phase:
- `'instructions'` — Show game rules, tips, controls
- `'preloading'` — Show asset loading progress
- `'countdown'` — Show countdown timer (3 seconds)
- `'playing'` — Show game UI
- `'results'` — Show round results and standings

### Game Action Types (Phase 3)

The following action types are broadcast via `rmhbox:game:action`:

| Action Type | Payload | Description |
|-------------|---------|-------------|
| `STATE_CHANGED` | `{ state: LobbyState }` | Lobby state transition |
| `TIMER_TICK` | `{ timeRemaining: number }` | 1-second countdown tick |
| `PLAYER_CONNECTED` | `{ userId, userName }` | Player reconnected |
| `PLAYER_DISCONNECTED` | `{ userId, userName }` | Player disconnected |
| `PLAYER_LEFT` | `{ userId, userName }` | Player left lobby |
| `PLAYER_JOINED` | `{ userId, userName }` | Player joined lobby |
| `SPECTATOR_JOINED` | `{ userId, userName }` | Spectator joined |
| `SPECTATOR_LEFT` | `{ userId, userName }` | Spectator left |
| `HOST_TRANSFERRED` | `{ newHostUserId, newHostUserName }` | Host changed |
| `PLAYER_KICKED` | `{ userId, userName }` | Player was kicked |
| `CHAT_MESSAGE` | `ChatMessage` | Chat message sent |
| `PLAYER_READY_CHANGED` | `{ userId, isReady }` | Player ready toggle |

### Template

```
### ComponentName

**File:** `components/rmhbox/ComponentName.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| ... | ... | ... | ... |

**Usage:**
\`\`\`tsx
<ComponentName prop="value" />
\`\`\`
```
