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

_Components will be documented here as they are implemented in Phase 2+._

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
