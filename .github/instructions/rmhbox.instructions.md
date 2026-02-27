---
applyTo: "**/rmhbox/**"
---

# RMHbox — Copilot Instructions

## Overview

RMHbox is a real-time multiplayer party game platform within the rmhstudios.com project. It consists of:

- **Standalone WebSocket server** (`server/rmhbox/`) — Socket.io server on port 7676 handling lobby management, game coordination, voting, chat, reconnection, and leaderboards
- **Next.js frontend** (`app/rmhbox/`, `components/rmhbox/`) — React UI with Zustand state management, lazy-loaded minigame components, and a dedicated theme system
- **Shared library** (`lib/rmhbox/`) — Types, events, constants, schemas, and utilities shared between client and server
- **Static data** (`data/rmhbox/`) — JSON data files for minigames
- **Tests** (`testing/rmhbox/`) — Vitest test suites organized by implementation phase

## Essential Architecture

- **Client-server split:** The RMHbox server is a separate Node.js process. All communication is via Socket.io WebSocket events defined in `lib/rmhbox/events.ts` (C2S and S2C constants).
- **State synchronization:** The server sends full `ClientLobbyState` snapshots and incremental `GameAction` objects (with monotonic `seq` ordering). The client Zustand store applies these via reducer functions.
- **Minigame plugin system:** Minigames are modular. Each has a server handler (extending `BaseMinigame`), client component (lazy-loaded by `MinigameRenderer`), shared schemas/data, and history display registration. New minigames follow this pattern.
- **Validation:** All WebSocket payloads are validated with Zod schemas via the `validated()` wrapper.
- **Theming:** RMHbox uses CSS custom properties with `--rmhbox-` prefix, applied via `.rmhbox-theme` class.

## Key Registration Points for New Minigames

1. `lib/rmhbox/minigame-registry.ts` — `MINIGAME_REGISTRY` definition
2. `server/rmhbox/game-coordinator.ts` — `MINIGAME_SERVER_REGISTRY` handler class registration
3. `components/rmhbox/minigames/MinigameRenderer.tsx` — `MINIGAME_COMPONENTS` lazy import
4. `lib/rmhbox/history-display-registrations.ts` — History display registration

## Reference Document

**Always reference, follow, and update `docs/rmhbox/info.md`** when working on any RMHbox code. This comprehensive document contains:

- Complete directory structure and file responsibilities
- Shared type system and WebSocket protocol details
- Server architecture (LobbyManager, GameCoordinator, StateSyncService, etc.)
- Client architecture (Zustand store, socket client, component patterns)
- Full minigame system documentation (BaseMinigame API, handler pattern, component pattern)
- Step-by-step checklist for adding new minigames
- Game settings, spectator, history, and leaderboard systems
- Database models
- Theming, sound system, and testing conventions
- Code standards and maintainability guidelines

If your changes affect the core design, structure, or patterns of the RMHbox codebase, **you must update `docs/rmhbox/info.md`** to reflect those changes.
