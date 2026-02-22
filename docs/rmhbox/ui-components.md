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

_Components implemented in Phase 4. All components use `'use client'` directive and are located in `components/rmhbox/`._

---

### RoomCodeDisplay

**File:** `components/rmhbox/RoomCodeDisplay.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `code` | `string` | — | The 6-character room code to display |

**Usage:**
```tsx
<RoomCodeDisplay code="ABC123" />
```

---

### PlayerList

**File:** `components/rmhbox/PlayerList.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `players` | `ClientPlayerInfo[]` | — | Array of player info objects |
| `hostUserId` | `string` | — | User ID of the current host (shows crown icon) |

**Usage:**
```tsx
<PlayerList players={lobby.players} hostUserId={lobby.hostUserId} />
```

---

### ReadyButton

**File:** `components/rmhbox/ReadyButton.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isReady` | `boolean` | — | Current ready state |
| `onToggle` | `() => void` | — | Callback when button is clicked |

**Usage:**
```tsx
<ReadyButton isReady={false} onToggle={() => emit('rmhbox:lobby:toggle_ready', {})} />
```

---

### HostControls

**File:** `components/rmhbox/HostControls.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isHost` | `boolean` | — | Whether the current user is the host |
| `lobbyId` | `string` | — | Current lobby ID |
| `lobbyState` | `string` | — | Current lobby state |

**Usage:**
```tsx
<HostControls isHost={true} lobbyId="ABCDEF" lobbyState="WAITING" />
```

---

### ChatOverlay

**File:** `components/rmhbox/ChatOverlay.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `ChatMessage[]` | — | Array of chat messages |
| `onSend` | `(content: string) => void` | — | Callback when a message is sent |

**Usage:**
```tsx
<ChatOverlay messages={lobby.chat} onSend={(msg) => emit('rmhbox:lobby:chat', { content: msg })} />
```

---

### LeaderboardPanel

**File:** `components/rmhbox/LeaderboardPanel.tsx`

**Props:** None. Self-fetching component.

**Usage:**
```tsx
<LeaderboardPanel />
```

---

### LobbyView

**File:** `components/rmhbox/LobbyView.tsx`

**Props:** None. Reads from Zustand store.

Composes: RoomCodeDisplay, PlayerList, ReadyButton, HostControls, ChatOverlay.

**Usage:**
```tsx
<LobbyView />
```

---

### GameVoting

**File:** `components/rmhbox/GameVoting.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `candidates` | `VoteCandidate[]` | — | 5 candidate minigames |
| `durationSeconds` | `number` | — | Vote timer duration |
| `endsAt` | `number` | — | Unix timestamp when voting ends |
| `onVote` | `(minigameId: string) => void` | — | Callback on vote cast |

**Usage:**
```tsx
<GameVoting candidates={[...]} durationSeconds={30} endsAt={Date.now() + 30000} onVote={handleVote} />
```

---

### InstructionsScreen

**File:** `components/rmhbox/InstructionsScreen.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Minigame display name |
| `description` | `string` | — | Minigame description |
| `rules` | `string[]` | — | Bullet-point rules |
| `tips` | `string[]` | — | Helpful tips |
| `durationSeconds` | `number` | — | Countdown duration |
| `isHost` | `boolean` | — | Whether to show skip button |
| `onSkip` | `() => void` | — | Callback for host skip |

**Usage:**
```tsx
<InstructionsScreen title="Rhyme Time" description="..." rules={[...]} tips={[...]} durationSeconds={15} isHost={true} onSkip={handleSkip} />
```

---

### PreloadScreen

**File:** `components/rmhbox/PreloadScreen.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `players` | `{ userId: string; userName: string; ready: boolean }[]` | — | Player readiness list |

Auto-emits `rmhbox:game:ready_to_render` on mount.

**Usage:**
```tsx
<PreloadScreen players={preloadPlayers} />
```

---

### ResultsScreen

**File:** `components/rmhbox/ResultsScreen.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rankings` | `PlayerRanking[]` | — | Player rankings for the round |
| `sessionStandings` | `SessionStanding[]` | — | Cumulative session standings |
| `awards` | `Award[]` | — | Round awards |
| `roundNumber` | `number` | — | Current round number |

Uses framer-motion for staggered animations, canvas-confetti for winner celebration.

**Usage:**
```tsx
<ResultsScreen rankings={[...]} sessionStandings={[...]} awards={[...]} roundNumber={1} />
```

---

### SpectatorBanner

**File:** `components/rmhbox/SpectatorBanner.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `lobbyState` | `string` | — | Current lobby state |
| `onRequestPromotion` | `() => void` | — | Callback for "Join as Player" button |

Shows "Join as Player" button only during WAITING and ROUND_RESULTS states.

**Usage:**
```tsx
<SpectatorBanner lobbyState="WAITING" onRequestPromotion={handlePromotion} />
```

---

### MinigameRenderer

**File:** `components/rmhbox/minigames/MinigameRenderer.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `minigameId` | `string` | — | ID of the minigame to render |

Uses React.lazy() and Suspense for code-splitting. Shows loading fallback during load, error fallback for unknown games.

**Usage:**
```tsx
<MinigameRenderer minigameId="rhyme-time" />
```

---

### GameShell

**File:** `components/rmhbox/GameShell.tsx`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `gameName` | `string` | — | Display name of the minigame |
| `timeRemaining` | `number \| null` | — | Seconds remaining (null hides timer) |
| `roundNumber` | `number` | — | Current round number |
| `score` | `number` | — | Player's current score |
| `playerCount` | `number` | — | Number of players |
| `children` | `React.ReactNode` | — | Game content |

**Usage:**
```tsx
<GameShell gameName="Rhyme Time" timeRemaining={30} roundNumber={1} score={500} playerCount={4}>
  <MinigameRenderer minigameId="rhyme-time" />
</GameShell>
```

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
