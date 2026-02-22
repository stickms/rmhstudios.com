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
| `PublicLobbyInfo` | `lib/rmhbox/types.ts` | Lobby browser entry with player count and status |
| `ChatMessage` | `lib/rmhbox/types.ts` | Chat message with id, userId, content, type |
| `GameAction` | `lib/rmhbox/types.ts` | Broadcast action with seq counter and type |

### WebSocket Events (Phase 2)

Key events for UI component integration:

| Event | Direction | Description |
|-------|-----------|-------------|
| `rmhbox:lobby:created` | S→C | Lobby creation confirmation with lobbyId |
| `rmhbox:lobby:state_snapshot` | S→C | Full state snapshot on join/reconnect |
| `rmhbox:game:action` | S→C | Game actions (PLAYER_JOINED, CHAT_MESSAGE, etc.) |
| `rmhbox:lobby:browse_result` | S→C | Public lobby browser results |
| `rmhbox:lobby:kicked` | S→C | Kicked notification |
| `rmhbox:lobby:disbanded` | S→C | Lobby disbanded notification |

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
