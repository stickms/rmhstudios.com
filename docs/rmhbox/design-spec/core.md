# RMHbox — Core Infrastructure Design Specification

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft  
> **Route:** `/rmhbox`

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [File Structure](#3-file-structure)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [WebSocket Architecture](#5-websocket-architecture)
6. [Lobby System](#6-lobby-system)
7. [Minigame Lifecycle](#7-minigame-lifecycle)
8. [State Synchronization Model](#8-state-synchronization-model)
9. [Reconnection Protocol](#9-reconnection-protocol)
10. [Spectator System](#10-spectator-system)
11. [Ready-Up & Join-in-Progress](#11-ready-up--join-in-progress)
12. [Voting System](#12-voting-system)
12A. [Minigame Game Settings](#12a-minigame-game-settings)
13. [Database Schema](#13-database-schema)
14. [Leaderboard & Stats API](#14-leaderboard--stats-api)
14A. [Minigame Browser & History Viewing](#14a-minigame-browser--history-viewing)
15. [Match-End Lifecycle & Persistence](#15-match-end-lifecycle--persistence)
16. [Error Handling & Fault Isolation](#16-error-handling--fault-isolation)
17. [Anti-Cheat Considerations](#17-anti-cheat-considerations)
18. [UI/UX Design Language](#18-uiux-design-language)
19. [Client-Side Architecture](#19-client-side-architecture)
20. [Type Definitions (Complete)](#20-type-definitions-complete)
21. [WebSocket Event Catalog (Complete)](#21-websocket-event-catalog-complete)
22. [Server Tick & Timers](#22-server-tick--timers)
23. [Configuration & Constants](#23-configuration--constants)
24. [Security Hardening](#24-security-hardening)
25. [Deployment & Build Integration](#25-deployment--build-integration)

---

## 1. Overview & Goals

**RMHbox** is a real-time multiplayer party game platform inspired by Jackbox Games. Players join lobbies via room codes (or public matchmaking), a host selects (or puts to a vote) a minigame, and all players play a short-form minigame together with results displayed afterward.

### 1.1 Design Pillars

| Pillar | Description |
|---|---|
| **Authoritative Server** | All game logic runs server-side. Clients are render-only terminals that send inputs and receive state deltas. |
| **Mobile-First** | Every minigame UI must be fully playable on a phone screen. Desktop is an enhanced experience, not the baseline. |
| **Modular & Extensible** | Adding a new minigame should require only: a server handler module, a client component, and a registry entry. Zero changes to core infrastructure. |
| **Low-Latency Sync** | Use action-based delta broadcasting. Full state syncs are periodic heartbeats, not the primary communication channel. |
| **Spectator-Friendly** | Any connected user can watch without playing. The "Jackbox couch" experience. |
| **Fault-Tolerant** | A crash in one minigame's handler must never bring down the WebSocket server or other lobbies. |

### 1.2 Non-Goals

- **Peer-to-peer networking.** All communication flows through the server.
- **Voice/video chat.** Out of scope; players use Discord or similar.
- **Persistent worlds.** Each minigame is a self-contained session lasting 1–5 minutes.
- **Monetization systems.** No microtransactions or premium currency.

---

## 2. Tech Stack & Dependencies

### 2.1 Existing Stack (Inherited)

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Framer Motion |
| State | Zustand 5 |
| Realtime | Socket.io 4.8 (standalone RMHbox server on port 7676 + client) |
| Database | PostgreSQL + Prisma 7 |
| Auth | Better Auth 1.4 (Discord OAuth + email/password) |
| Icons | Lucide React |
| Audio | Howler.js |
| Build | pnpm workspaces, concurrently, PM2 (production) |

### 2.2 New Dependencies for RMHbox

| Package | Purpose | Used By |
|---|---|---|
| `rfc6902` | JSON Patch (RFC 6902) generation & application for state diffs | Server + Client |
| `nanoid` | Compact, URL-friendly room code generation | Server |
| `zod` | Runtime schema validation for all WebSocket payloads | Server |
| `zustand` (existing) | Client-side lobby & game state stores | Client |
| `fuse.js` | Fuzzy text matching (Emoji Cinema movie guesses, Category Crash answers) | Server |
| `canvas-confetti` | Lightweight confetti animations for win screens | Client |

> Additional game-specific packages are detailed in `design-spec-minigames.md`.

---

## 3. File Structure

Following existing codebase conventions (`components/<game>/`, `lib/<game>/`, `app/<game>/`):

```
app/
  rmhbox/
    layout.tsx              # Auth gate wrapper + metadata
    page.tsx                # Landing / lobby browser / create lobby UI
    [lobbyId]/
      page.tsx              # Lobby room (waiting room + active game view)

components/
  rmhbox/
    RMHboxLanding.tsx       # Main landing page (create/join/browse)
    LobbyView.tsx           # Lobby waiting room
    LobbyBrowser.tsx        # Public lobby list
    GameVoting.tsx          # Minigame vote screen
    InstructionsScreen.tsx  # Pre-game instructions overlay
    PreloadScreen.tsx       # Asset preloading progress screen
    ResultsScreen.tsx       # Post-game results / scoreboard
    SpectatorBanner.tsx     # "You are spectating" persistent UI
    PlayerList.tsx          # Shared player avatar/name list
    ChatOverlay.tsx         # In-lobby text chat
    HostControls.tsx        # Host-only action panel
    ReadyButton.tsx         # Ready toggle with animation
    RoomCodeDisplay.tsx     # Large room code with copy button
    LeaderboardPanel.tsx    # Global/weekly leaderboard display
    minigames/
      MinigameRenderer.tsx  # Dynamic minigame component loader
      rhyme-time/
        RhymeTimeGame.tsx
        RhymeTimeInput.tsx
      undercover-agent/
        UndercoverAgentGame.tsx
        GridBoard.tsx
        SpymasterKey.tsx
      emoji-cinema/
        EmojiCinemaGame.tsx
        EmojiKeyboard.tsx
        GuessInput.tsx
      identity-crisis/
        IdentityCrisisGame.tsx
        QuestionPanel.tsx
        VoteButtons.tsx
      fact-or-friction/
        FactOrFrictionGame.tsx
        PointPotDisplay.tsx
      wiki-race/
        WikiRaceGame.tsx
        WikiFrame.tsx
      sequence-sam/
        SequenceSamGame.tsx
        GridDisplay.tsx
      category-crash/
        CategoryCrashGame.tsx
        CategoryInput.tsx
        PeerReview.tsx
      pixel-pushers/
        PixelPushersGame.tsx
        PhysicsCanvas.tsx
      human-keyboard/
        HumanKeyboardGame.tsx
        KeyAssignment.tsx
      cursor-curling/
        CursorCurlingGame.tsx
        CurlingCanvas.tsx
      scroll-soul/
        ScrollSoulGame.tsx
        ScrollViewport.tsx
      human-tetris/
        HumanTetrisGame.tsx
        WallCanvas.tsx
      undercover-editor/
        UndercoverEditorGame.tsx
        StoryEditor.tsx
      minimalist-masterpiece/
        MinimalistMasterpieceGame.tsx
        DrawingCanvas.tsx
        AuctionPanel.tsx
      ranking-file/
        RankingFileGame.tsx
        RankableList.tsx

lib/
  rmhbox/
    constants.ts            # All tuning constants (timers, limits, points)
    types.ts                # Shared TypeScript types (server + client)
    events.ts               # Event name constants (avoids magic strings)
    schemas.ts              # Zod schemas for payload validation
    store.ts                # Zustand store for client lobby/game state
    socket.ts               # Socket.io client wrapper (connect, emit, listen)
    utils.ts                # Shared utility functions
    minigame-registry.ts    # Maps minigame IDs to metadata + components
    rhyme-time/             # Rhyme Time data-loader + dictionary-loader
      dictionary-loader.ts
    wiki-race/              # Wiki-Race data-loader, schemas, wikipedia-proxy
      data-loader.ts
      schemas.ts
      wikipedia-proxy.ts
    category-crash/         # Category Crash data-loader
      data-loader.ts
    undercover-agent/       # (word pool loaded directly in handler)

data/
  rmhbox/                   # Static data files (NOT in public/, server-only)
    rhyme-time/
      root-words.json
    wiki-race/
      article-pairs.json
    category-crash/
      categories.json
    undercover-agent/
      word-pool.json

server/
  rmhbox/
    index.ts                # Standalone server entry point (port 7676)
    config.ts               # All env-driven tuning constants (port, timers, limits)
    auth.ts                 # Better Auth session token validation middleware
    lobby-manager.ts        # Lobby CRUD, player management, host logic
    game-coordinator.ts     # Minigame lifecycle orchestration
    state-sync.ts           # Delta broadcasting + heartbeat logic
    reconnection.ts         # Session-based reconnection handler
    leaderboard.ts          # DB writes & leaderboard queries (async)
    vote-manager.ts         # Minigame voting logic
    chat.ts                 # In-lobby chat handler
    types.ts                # Server-only type definitions
    schemas.ts              # Server-side Zod validation schemas
    logger.ts               # Structured logger using pino
    prisma-client.ts        # Prisma client singleton for server
    rate-limit.ts           # Server-side rate limiting
    minigames/
      base-minigame.ts      # Abstract base class with pausable timer system
      rhyme-time/           # Rhyme Time minigame handler + types
        handler.ts
        index.ts
        types.ts
      undercover-agent/     # Undercover Agent minigame handler + types
        handler.ts
        index.ts
        types.ts
      category-crash/       # Category Crash minigame handler + types  
        handler.ts
        index.ts
        types.ts
      wiki-race/            # Wiki-Race minigame handler + types
        handler.ts
        index.ts
        types.ts

app/api/rmhbox/
  leaderboard/
    route.ts                # GET /api/rmhbox/leaderboard
  stats/
    route.ts                # GET /api/rmhbox/stats?userId=...
  history/
    route.ts                # GET /api/rmhbox/history?userId=...&matchId=...
```

---

## 4. Authentication & Authorization

### 4.1 Auth Gate

The `/rmhbox` route is gated behind authentication. The layout wraps children with an auth check:

```typescript
// app/rmhbox/layout.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RMHboxLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhbox');
  }
  return <>{children}</>;
}
```

### 4.2 WebSocket Authentication

When a client connects to the standalone RMHbox WebSocket server (port 7676), they must provide their session token in the `auth` handshake payload. The server validates this against Better Auth's `session` table in PostgreSQL before allowing any lobby operations.

Because RMHbox runs as its own Socket.io server process (not a namespace on the main server), the auth middleware is applied server-wide via `io.use(...)`:

```typescript
// server/rmhbox/auth.ts — applied in index.ts via io.use(authMiddleware)
export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') {
    return next(new Error('AUTH_REQUIRED'));
  }
  try {
    const session = await validateSessionToken(token); // queries the session table
    if (!session) {
      return next(new Error('AUTH_FAILED'));
    }
    if (session.expiresAt < new Date()) {
      return next(new Error('SESSION_EXPIRED'));
    }
    // Attach user data to socket for downstream handlers
    socket.data.userId = session.userId;
    socket.data.userName = session.userName;
    socket.data.avatarUrl = session.avatarUrl;
    socket.data.sessionToken = token;
    next();
  } catch {
    next(new Error('AUTH_FAILED'));
  }
}
```

The `validateSessionToken()` function maintains its own `pg.Pool` connection to PostgreSQL (configured via the shared `DATABASE_URL` env var) and queries the `session` + `user` tables directly. It does **not** import from the Next.js app or Prisma client — the standalone server has zero coupling to the Next.js process.

### 4.3 Session Token Retrieval (Client-Side)

The client retrieves the session token from Better Auth before connecting to the **standalone RMHbox server** (separate from the main Socket.io server):

```typescript
// lib/rmhbox/socket.ts
import { authClient } from '@/lib/auth-client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export async function connectToRMHbox(): Promise<Socket> {
  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    throw new Error('Not authenticated');
  }

  // Connect to the standalone RMHbox WebSocket server.
  // In production, reverse-proxy wss://rmhstudios.com/rmhbox → localhost:7676
  // In development, connect directly to localhost:7676.
  socket = io(process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676', {
    path: '/rmhbox/',
    auth: { token: session.data.session.token },
  });

  return socket;
}
```

> **Environment Variables:**
> - `NEXT_PUBLIC_RMHBOX_SOCKET_URL` — The RMHbox WebSocket server URL. In production: `https://rmhstudios.com` (reverse-proxy handles the path-based routing). In development: `http://localhost:7676`.
> - The `path: '/rmhbox/'` must match the server's `config.SOCKET_PATH`.

> **Important:** The WebSocket server validates the token against the `session` table in PostgreSQL. It does NOT trust any client-supplied userId or userName — those are derived server-side from the authenticated session.

---

## 5. WebSocket Architecture

### 5.1 Standalone Server Process

RMHbox runs as a **dedicated, standalone Socket.io server process** on port **7676**, completely separate from the existing Socket.io server (port 7001) that handles Slice-It and Neon Driftway multiplayer. This provides:

- **Process-level isolation** — a crash or memory leak in RMHbox does not affect other games.
- **Independent scaling** — the RMHbox server can be allocated more CPU/RAM or horizontally scaled without touching the main server.
- **Clean codebase separation** — no namespace prefixing or shared connection lifecycle.
- **Independent deployment** — the RMHbox server can be restarted without downtime for other games.

Since this is not a namespace but an entire server, there is no `io.of('/rmhbox')` call. The `io` instance IS the RMHbox server. Auth middleware is applied server-wide via `io.use(authMiddleware)`.

```typescript
// server/rmhbox/index.ts — Standalone server bootstrap (simplified)
import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { authMiddleware } from './auth';
import { LobbyManager } from './lobby-manager';
import { GameCoordinator } from './game-coordinator';
import { StateSyncService } from './state-sync';
import { ReconnectionHandler } from './reconnection';
import { VoteManager } from './vote-manager';
import { ChatHandler } from './chat';
import { LeaderboardService } from './leaderboard';

// Health-check endpoint for PM2 / load balancer probes
function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
}

const httpServer = createServer(requestHandler);

const io = new Server(httpServer, {
  path: config.SOCKET_PATH,           // '/rmhbox/'
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: config.MAX_HTTP_BUFFER_SIZE,
  pingInterval: config.PING_INTERVAL_MS,
  pingTimeout: config.PING_TIMEOUT_MS,
});

// Server-wide auth — every connecting socket must pass
io.use(authMiddleware);

// Service layer
const lobbyManager     = new LobbyManager(io);
const stateSyncService = new StateSyncService(io, lobbyManager);
const gameCoordinator  = new GameCoordinator(io, lobbyManager, stateSyncService);
const voteManager      = new VoteManager(io, lobbyManager, gameCoordinator);
const chatHandler      = new ChatHandler(io, lobbyManager);
const reconnection     = new ReconnectionHandler(io, lobbyManager, stateSyncService);
const leaderboard      = new LeaderboardService();

io.on('connection', (socket) => {
  reconnection.attemptReconnect(socket);
  lobbyManager.handleConnection(socket);
  gameCoordinator.handleConnection(socket);
  voteManager.handleConnection(socket);
  chatHandler.handleConnection(socket);
  leaderboard.handleConnection(socket);

  socket.on('disconnect', (reason) => {
    lobbyManager.handleDisconnect(socket);
    gameCoordinator.handleDisconnect(socket);
    reconnection.handleDisconnect(socket);
  });
});

// Periodic tasks
stateSyncService.startHeartbeat();
lobbyManager.startGarbageCollector();

// Graceful shutdown on SIGINT / SIGTERM
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(config.PORT, () => {
  console.log(`[RMHbox] WebSocket server running on http://localhost:${config.PORT}`);
});
```

### 5.1.1 Configuration

All server tuning is centralized in `server/rmhbox/config.ts`. Every value has a sensible default and can be overridden via environment variables prefixed with `RMHBOX_`:

| Env Var | Default | Purpose |
|---|---|---|
| `RMHBOX_PORT` | `7676` | Listen port |
| `RMHBOX_SOCKET_PATH` | `/rmhbox/` | Socket.io handshake path |
| `RMHBOX_CORS_ORIGIN` | `$SOCKET_CORS_ORIGIN` or `*` | Allowed CORS origin |
| `RMHBOX_HEARTBEAT_MS` | `10000` | State snapshot interval |
| `RMHBOX_GRACE_MS` | `120000` | Disconnect grace period |
| `RMHBOX_GC_INTERVAL` | `60000` | Lobby garbage collection interval |
| `RMHBOX_SHUTDOWN_TIMEOUT` | `10000` | Force-kill timeout on shutdown |
| `DATABASE_URL` | (required) | PostgreSQL connection string (shared with Next.js) |

### 5.1.2 Health Check

The HTTP server exposes a `GET /health` endpoint that returns `{ "status": "ok", "uptime": <seconds> }`. This is used by PM2 for process monitoring and can be used  for upstream health probes.
```

### 5.2 Room Naming Convention

Socket.io rooms are used for routing messages to lobby members:

| Room Name | Members | Purpose |
|---|---|---|
| `lobby:{lobbyId}` | All connected players + spectators in a lobby | Lobby-wide broadcasts |
| `lobby:{lobbyId}:players` | Active players only (not spectators) | Game-relevant broadcasts |
| `lobby:{lobbyId}:spectators` | Spectators only | Spectator-specific updates |
| `lobby:{lobbyId}:team:{teamId}` | Team members | Team-scoped communication (e.g., Undercover Agent spymasters) |
| `lobby:{lobbyId}:player:{userId}` | Single player's socket(s) | Private information (hidden roles, secret words) |

### 5.3 Event Naming Convention

All events use a flat, colon-delimited format: `rmhbox:{domain}:{action}`

```
rmhbox:lobby:create
rmhbox:lobby:join
rmhbox:lobby:leave
rmhbox:lobby:kick
rmhbox:lobby:chat
rmhbox:game:vote
rmhbox:game:ready
rmhbox:game:input
rmhbox:game:action
```

Server-to-client events use the `S_` prefix convention in the event catalog (§21) to distinguish direction.

---

## 6. Lobby System

### 6.1 Lobby Data Structure (Server-Side)

```typescript
// server/rmhbox/types.ts

interface RMHboxLobby {
  id: string;                          // 6-character alphanumeric room code (nanoid)
  hostUserId: string;                  // userId of the current host
  settings: LobbySettings;
  players: Map<string, RMHboxPlayer>;  // keyed by userId
  spectators: Map<string, RMHboxSpectator>; // keyed by userId
  state: LobbyState;
  chat: ChatMessage[];                 // last 100 messages (ring buffer)
  createdAt: number;                   // Date.now()
  lastActivityAt: number;              // Updated on any event; used for GC
  currentGame: ActiveGame | null;      // null when in lobby/voting
  matchHistory: MatchSummary[];        // results from games played in this session (uses ServerMatchSummary on the server)
  selectedGame: { minigameId: string; displayName: string } | null; // currently selected game for pre-vote picking
  roundNumber: number;                 // increments each game played; reset to 0 at the start of each new minigame
}

interface LobbySettings {
  isPublic: boolean;                   // visible in lobby browser
  maxPlayers: number;                  // 2–16, default 8
  maxSpectators: number;               // 0–50, default 20
  allowMidGameJoin: boolean;           // whether new players can join during a game (as spectators)
  allowSpectatorPromotion: boolean;    // whether spectators can become players between rounds
  autoStartThreshold: number | null;   // if set, auto-start vote when this many players are ready
  gameDurationOverride: number | null; // optional override for round timer (seconds)
}

interface RMHboxPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;             // null when disconnected
  isConnected: boolean;
  isReady: boolean;
  score: number;                       // cumulative session score across rounds
  roundScore: number;                  // score for current round only
  joinedAt: number;
  lastSeenAt: number;
  role: 'player';
}

interface RMHboxSpectator {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  joinedAt: number;
  role: 'spectator';
}

type LobbyState =
  | 'WAITING'          // In lobby, waiting for players / host action
  | 'VOTING'           // Minigame vote in progress
  | 'INSTRUCTIONS'     // Showing instructions for the selected minigame
  | 'PRELOADING'       // Clients loading assets; waiting for all READY_TO_RENDER
  | 'COUNTDOWN'        // 3-2-1 countdown before gameplay
  | 'PLAYING'          // Active gameplay
  | 'ROUND_RESULTS'    // Showing results for the just-completed round
  | 'SESSION_RESULTS'  // Showing cumulative session standings (after N rounds or host ends)
  | 'DISBANDED';       // Lobby is being cleaned up

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;       // max 200 chars, sanitized
  timestamp: number;
  type: 'user' | 'system'; // system messages for joins/leaves/game events
}
```

### 6.2 Lobby Creation

**Client emits:** `rmhbox:lobby:create`

```typescript
// Payload
interface CreateLobbyPayload {
  settings?: Partial<LobbySettings>;
}
```

**Server logic:**

1. Generate a 6-character room code using `nanoid` with custom alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes ambiguous chars I, O, 0, 1).
2. Ensure uniqueness against active lobbies (regenerate if collision).
3. Create `RMHboxLobby` with the requesting user as host and first player.
4. Join the socket to rooms: `lobby:{id}`, `lobby:{id}:players`, `lobby:{id}:player:{userId}`.
5. Respond with `rmhbox:lobby:created` containing the lobby state.

**Server responds:** `rmhbox:lobby:created`

```typescript
interface LobbyCreatedPayload {
  lobbyId: string;
  lobby: ClientLobbyState; // sanitized lobby state (see §8.3)
}
```

### 6.3 Lobby Join

**Client emits:** `rmhbox:lobby:join`

```typescript
interface JoinLobbyPayload {
  lobbyId: string;
  asSpectator?: boolean; // default false
}
```

**Server logic:**

1. Validate `lobbyId` exists and is not `DISBANDED`.
2. If not `asSpectator`:
   a. Check `players.size < settings.maxPlayers`.
   b. If lobby state is `PLAYING` and `allowMidGameJoin` is false, auto-join as spectator instead.
   c. If lobby state is `PLAYING` and `allowMidGameJoin` is true, join as spectator (promotion handled by join-in-progress rules per minigame, §11).
   d. Add to `players` map, join `lobby:{id}:players` room.
3. If `asSpectator`:
   a. Check `spectators.size < settings.maxSpectators`.
   b. Add to `spectators` map, join `lobby:{id}:spectators` room.
4. Join the `lobby:{id}` room.
5. Broadcast `rmhbox:lobby:player_joined` to all in lobby.
6. Send `rmhbox:lobby:state_snapshot` to the joining socket (full state sync).
7. Add a system `ChatMessage` ("Player X joined").

**Server responds (to joiner):** `rmhbox:lobby:state_snapshot`  
**Server broadcasts (to lobby):** `rmhbox:lobby:player_joined`

### 6.4 Lobby Leave

**Client emits:** `rmhbox:lobby:leave`

```typescript
interface LeaveLobbyPayload {
  lobbyId: string;
}
```

**Server logic:**

1. Remove player/spectator from the lobby.
2. Leave all associated rooms.
3. If leaving player was host:
   a. Assign host to the next player by `joinedAt` order (earliest joiner).
   b. If no players remain but spectators exist, promote the earliest spectator to player and make them host.
   c. If nobody remains, mark lobby as `DISBANDED` and schedule cleanup.
4. If a game is `PLAYING`:
   a. Notify the active minigame handler that a player left (some games may need to adjust, e.g., remove from turn order).
   b. If player count drops below the minigame's `minPlayers`, the game coordinator force-ends the round.
5. Broadcast `rmhbox:lobby:player_left`.
6. Add system chat message.

### 6.5 Host Controls

Only the host (`lobby.hostUserId === socket.data.userId`) can:

| Action | Event | Effect |
|---|---|---|
| Kick player | `rmhbox:lobby:kick` | Remove a player; they receive `rmhbox:lobby:kicked` |
| Transfer host | `rmhbox:lobby:transfer_host` | Reassign `hostUserId` to another player |
| Change settings | `rmhbox:lobby:update_settings` | Modify `LobbySettings` (only while `WAITING`) |
| Pick game | `rmhbox:game:pick` | Host pre-selects a minigame (shown in lobby, before vote/start) |
| Start game (direct) | `rmhbox:game:select` | Host picks and immediately starts a minigame |
| Start vote | `rmhbox:game:start_vote` | Initiate a vote on minigames (see §12) |
| End session | `rmhbox:lobby:end_session` | Transition to `SESSION_RESULTS`, then disband |
| Force skip | `rmhbox:game:force_skip` | Skip the current phase. Advances to the next lifecycle phase (e.g., INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING). During PLAYING, force-ends the active minigame. |
| Force end | `rmhbox:game:force_end` | Immediately ends the active minigame and returns to WAITING. |
| Pause/Resume | `rmhbox:game:pause_timer` | Toggle pause on the current timer (both lifecycle and in-game phase timers). |
| Promote spectator | `rmhbox:lobby:promote_spectator` | Promote a spectator to player status (host-initiated) |

All host actions are validated server-side. If `socket.data.userId !== lobby.hostUserId`, the event is silently dropped.

### 6.6 Lobby Browser (Public Lobbies)

**Client emits:** `rmhbox:lobby:browse`

```typescript
interface BrowseLobbiesPayload {
  cursor?: string;  // pagination cursor
  limit?: number;   // default 20, max 50
}
```

**Server responds:** `rmhbox:lobby:browse_result`

```typescript
interface BrowseLobbiesResult {
  lobbies: PublicLobbyInfo[];
  nextCursor: string | null;
}

interface PublicLobbyInfo {
  lobbyId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  state: LobbyState;
  currentGame: string | null; // minigame display name if playing
  selectedGame: string | null; // pre-selected game name if picked
  roundNumber: number;
}
```

Only lobbies with `isPublic: true` and state not `DISBANDED` are returned. Sorted by player count descending (most active first).

### 6.7 Lobby Garbage Collection

A server-side interval (every 60 seconds) iterates all lobbies:

- If `lastActivityAt` is older than **15 minutes** and state is `WAITING`, disband.
- If `lastActivityAt` is older than **30 minutes** regardless of state, force-disband.
- If all players and spectators are disconnected for more than **2 minutes**, disband.
- On disband: emit `rmhbox:lobby:disbanded` to all remaining sockets, clean up rooms, delete from memory.

---

## 7. Minigame Lifecycle

### 7.1 Lifecycle State Machine

```
WAITING → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
           ↑                                                                    │
           └────────────────────────────────────────────────────────────────────┘
                                    (next round)

WAITING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
  ↑ (host direct-selects a game, skipping vote)
```

### 7.2 Phase Details

#### VOTING (§12)
- Duration: 30 seconds (configurable).
- Host can force-skip the vote at any time.
- See §12 for full voting logic.

#### INSTRUCTIONS
- Server broadcasts `rmhbox:game:instructions` with the minigame's instruction data.
- Duration: 15 seconds (configurable per minigame), or until host force-skips.
- Players can read the instructions; spectators see the same screen.
- **No gameplay occurs during this phase.**

```typescript
interface InstructionsPayload {
  minigameId: string;
  title: string;
  description: string;
  rules: string[];            // bullet-point rules
  tips: string[];             // optional strategy tips
  controls: ControlHint[];    // platform-specific control descriptions
  durationSeconds: number;    // how long the instructions screen stays
  estimatedGameDuration: number; // "This game lasts about 60 seconds"
  playerCount: { min: number; max: number; current: number };
  teams: boolean;             // whether this game uses teams
}

interface ControlHint {
  platform: 'mobile' | 'desktop' | 'all';
  action: string;             // e.g., "Tap to select"
  description: string;
}
```

#### PRELOADING
- Server transitions to `PRELOADING` after instructions phase ends.
- Server broadcasts `rmhbox:game:preload_start` with a manifest of assets the client should load.
- Each client loads the required assets (images, sounds, data) and emits `rmhbox:game:ready_to_render` when done.
- Server tracks which players have sent `READY_TO_RENDER`.
- Server broadcasts `rmhbox:game:preload_progress` updates to all clients (so everyone can see who's still loading).
- **The server does NOT transition to COUNTDOWN until ALL connected players have emitted `ready_to_render`.**
- Timeout: If a player hasn't emitted `ready_to_render` within **30 seconds**, they are force-marked as ready (to prevent griefing). A system chat message is added.

```typescript
// Client → Server
interface ReadyToRenderPayload {
  lobbyId: string;
}

// Server → All
interface PreloadProgressPayload {
  players: Array<{
    userId: string;
    userName: string;
    ready: boolean;
  }>;
  allReady: boolean;
}
```

#### COUNTDOWN
- Duration: 3 seconds (fixed).
- Server sends `rmhbox:game:countdown` with `{ seconds: 3 }`.
- After 3 seconds, server transitions to `PLAYING` and emits `rmhbox:game:started`.

#### PLAYING
- The active minigame handler takes control.
- Server processes inputs, runs game logic, and broadcasts state deltas (§8).
- Duration is governed by the minigame's own rules (timer, condition, etc.).
- When the minigame signals completion, the game coordinator transitions to `ROUND_RESULTS`.

#### ROUND_RESULTS
- Server computes final scores, rankings, and awards.
- Server broadcasts `rmhbox:game:round_results`.
- Duration: 10 seconds (configurable), or until host advances.
- During this phase, the match-end persistence pipeline fires asynchronously (§15).
- After the results timer, transition back to `WAITING` (or `VOTING` if auto-continue is set).
- **ResultsScreen** displays the title "Results" (not round-specific). The "All Players"
  panel shows every player's score (not just 4th place and beyond), so the full standings
  are always visible below the podium.

```typescript
interface RoundResultsPayload {
  minigameId: string;
  rankings: PlayerRanking[];
  awards: Award[];             // fun awards like "Speed Demon", "Close Call"
  roundNumber: number;
  sessionStandings: SessionStanding[]; // cumulative scores
}

interface PlayerRanking {
  userId: string;
  userName: string;
  score: number;
  rank: number;
  deltas: Record<string, number>; // stat breakdowns, e.g., { wordsFound: 5, bonusPoints: 100 }
}

interface Award {
  userId: string;
  title: string;
  description: string;
  icon: string; // emoji or lucide icon name
}

interface SessionStanding {
  userId: string;
  userName: string;
  totalScore: number;
  wins: number;
  rank: number;
}
```

### 7.3 Minigame Registry

```typescript
// lib/rmhbox/minigame-registry.ts

interface MinigameDefinition {
  id: string;                     // e.g., 'rhyme-time'
  displayName: string;            // e.g., 'Rhyme Time'
  description: string;            // one-liner
  category: MinigameCategory;
  icon: string;                   // lucide icon name
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationSeconds: number;
  supportsTeams: boolean;
  instructionDurationSeconds: number;
  preloadAssets: PreloadManifest;  // what assets clients need to fetch
  joinInProgressPolicy: JoinInProgressPolicy;
  tags: string[];                 // e.g., ['word', 'speed', 'competitive']
}

type MinigameCategory = 'word' | 'trivia' | 'action' | 'creative';

type JoinInProgressPolicy = 
  | 'spectate_only'        // new joins become spectators until next round
  | 'join_next_subround'   // can join at the start of the next sub-round (e.g., next question)
  | 'join_immediately';    // can join at any point (rare)

interface PreloadManifest {
  images: string[];
  sounds: string[];
  data: string[];           // URLs to JSON data files
  estimatedSizeBytes: number;
}

const MINIGAME_REGISTRY: Record<string, MinigameDefinition> = {
  'rhyme-time': { ... },
  'undercover-agent': { ... },
  // ... all 16 minigames
};
```

### 7.4 Server-Side Minigame Interface (Base Class)

```typescript
// server/rmhbox/minigames/base-minigame.ts

export interface MinigameContext {
  lobbyId: string;
  players: Map<string, RMHboxPlayer>;  // player snapshots at game start
  settings: LobbySettings;
  getHostId: () => string;             // returns current host userId
  broadcastToLobby: (event: string, data: unknown) => void;
  broadcastToPlayers: (event: string, data: unknown) => void;
  /** Emit a sequenced GameAction via LobbyManager (includes seq + timestamp). */
  broadcastAction: (action: { type: string; payload?: unknown }) => void;
  sendToPlayer: (userId: string, event: string, data: unknown) => void;
  sendToSpectators: (event: string, data: unknown) => void;
  onComplete: (results: MinigameResults) => void;
  onError: (error: Error) => void;
}

export interface MinigameResults {
  rankings: PlayerRanking[];
  awards: Award[];
  gameSpecificData: Record<string, unknown>; // for match history storage
  duration: number; // actual game duration in ms
}

/**
 * PausableTimer — wraps setTimeout so game timers can be paused/resumed
 * alongside the header timer when the host toggles pause.
 */
interface PausableTimer {
  id: string;
  callback: () => void;
  remaining: number;
  startedAt: number;
  handle: NodeJS.Timeout | null;
  completed: boolean;
}

export abstract class BaseMinigame {
  protected context: MinigameContext;
  protected pausableTimers: PausableTimer[] = [];
  protected intervals: NodeJS.Timeout[] = [];
  protected isRunning: boolean = false;
  private phaseTimerHandle: NodeJS.Timeout | null = null;
  private phaseTimerRemaining: number = 0;
  private phaseStartedAt: number = 0;
  private phaseIsPaused: boolean = false;
  private phaseIsInfinite: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;

  constructor(context: MinigameContext) {
    this.context = context;
  }

  /** Called when the PLAYING phase begins. Start game logic here. */
  abstract start(): void;

  /** Called when a player sends an input/action. */
  abstract handleInput(userId: string, action: string, data: unknown): void;

  /** Return the full game state for a specific player (used for reconnection). */
  abstract getStateForPlayer(userId: string): unknown;

  /** Return the full game state for spectators. */
  abstract getStateForSpectator(): unknown;

  /** Called when a new player joins during an active game (join-in-progress). */
  handlePlayerJoin(userId: string): void {
    // Default: send spectator state
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
  }

  /** Called when a player disconnects mid-game. */
  handlePlayerDisconnect(userId: string): void {
    // Default: mark player as inactive, don't remove from game
    // Subclasses can override for game-specific behavior (e.g., skip their turn)
  }

  /** Called when a player reconnects mid-game. */
  handlePlayerReconnect(userId: string): void {
    // Default: send them the full state snapshot
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));
  }

  /** Called to force-end the game (e.g., not enough players). */
  forceEnd(reason: string): void {
    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  /** Compute final results. Must be implemented by subclasses. */
  abstract computeResults(): MinigameResults;

  // ─── Pausable Timer System ───────────────────────────────────

  /**
   * Start a header timer that counts down and broadcasts TIMER_START + TIMER_TICK.
   * Does NOT auto-fire a callback — use setTimeout separately.
   */
  protected startPhaseTimer(durationSeconds: number): void { /* ... */ }

  /** Clear the current phase timer and stop tick broadcasts. */
  protected clearPhaseTimer(): void { /* ... */ }

  /**
   * Start an infinite timer (no countdown). Used for phases where
   * the host manually advances (e.g., UA_TEAM_SETUP).
   * @param showSkip - if true, host sees a "Skip" button in the header
   */
  protected startInfinitePhaseTimer(showSkip?: boolean): void { /* ... */ }

  /** Pause both the phase timer and all tracked pausable timers. */
  pausePhaseTimer(): void { /* ... */ }

  /** Resume the phase timer and all tracked pausable timers. */
  resumePhaseTimer(): void { /* ... */ }

  /** Broadcast the current sub-round info (e.g., "Round 2 of 3"). */
  protected broadcastRound(current: number, total: number): void { /* ... */ }

  /**
   * Create a tracked timeout that is pausable. All game timeouts should
   * use this instead of raw setTimeout to support host pausing.
   */
  protected setTimeout(fn: () => void, ms: number): string { /* returns timer ID */ }

  /** Cancel a specific tracked timeout. */
  protected clearTrackedTimeout(id: string): void { /* ... */ }

  /** Helper: create a tracked interval. */
  protected setInterval(fn: () => void, ms: number): NodeJS.Timeout { /* ... */ }

  /** Clean up all timers, intervals, and resources. */
  protected cleanup(): void {
    this.isRunning = false;
    this.clearPhaseTimer();
    this.pausableTimers.forEach(t => {
      if (t.handle) clearTimeout(t.handle);
    });
    this.intervals.forEach(i => clearInterval(i));
    this.pausableTimers = [];
    this.intervals = [];
  }
}
```

---

## 8. State Synchronization Model

### 8.1 Philosophy

The primary communication model is **action-based (event-driven)**. The server broadcasts discrete actions (state deltas) to clients. Clients maintain a local state store (Zustand) and apply these deltas to derive the current state. This minimizes bandwidth and latency.

A **full state sync (heartbeat)** is sent periodically to:
- Correct any drift between client and server state.
- Catch up clients that may have missed events due to brief connectivity issues.

### 8.2 Action Broadcasting

When the server's authoritative game state changes, it broadcasts an **action** describing what changed:

```typescript
// Server → Client
interface GameAction {
  type: string;           // e.g., 'PLAYER_SCORED', 'TIMER_TICK', 'TURN_CHANGED'
  payload: unknown;       // action-specific data
  seq: number;            // monotonically increasing sequence number per lobby
  timestamp: number;      // server timestamp (Date.now())
}
```

**Event:** `rmhbox:game:action`

Clients apply these actions to their local Zustand store via a reducer pattern:

```typescript
// lib/rmhbox/store.ts (client-side)
import { create } from 'zustand';

interface RMHboxStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  lobby: ClientLobbyState | null;
  gameState: Record<string, unknown>;
  lastSeq: number;
  timerInfo: TimerInfo | null;       // current phase timer state
  minigameRound: MinigameRoundInfo | null; // current round info (e.g., "Round 2 of 3")
  settings: UserSettings;            // persisted user preferences
  
  applyAction: (action: GameAction) => void;
  applyFullSync: (state: ClientLobbyState) => void;
  setTimerInfo: (info: TimerInfo | null) => void;
  setMinigameRound: (info: MinigameRoundInfo | null) => void;
  leaveLobby: () => void;
  reset: () => void;
}

interface TimerInfo {
  total: number;        // total duration in seconds (-1 for infinite)
  remaining: number;    // seconds remaining
  paused: boolean;
  infinite: boolean;    // true when total === -1
  showSkip: boolean;    // true when host should see a skip button
}

interface MinigameRoundInfo {
  current: number;      // 1-based current round
  total: number;        // total rounds
}

interface UserSettings {
  masterVolume: number;   // 0–1, default 0.7
  sfxVolume: number;      // 0–1, default 0.8
  musicVolume: number;    // 0–1, default 0.5
  showChat: boolean;      // default true
  chatPosition: 'left' | 'right'; // default 'right'
  theme: 'dark' | 'light'; // default 'dark'
}

export const useRMHboxStore = create<RMHboxStore>((set, get) => ({
  lobbyState: null,
  gameState: {},
  lastSeq: 0,
  
  applyAction: (action) => {
    const current = get();
    // Only apply if sequence is newer (prevents out-of-order / duplicate application)
    if (action.seq <= current.lastSeq) return;
    
    set((state) => ({
      ...applyGameAction(state, action), // game-specific reducer
      lastSeq: action.seq,
    }));
  },
  
  applyFullSync: (fullState) => {
    set({ lobbyState: fullState, lastSeq: fullState.seq });
  },
  
  reset: () => set({ lobbyState: null, gameState: {}, lastSeq: 0 }),
}));
```

### 8.3 Client-Visible State (Sanitized)

The server NEVER sends the full `RMHboxLobby` to a client. Instead, it computes a `ClientLobbyState` that strips all information the requesting player should not have:

```typescript
interface ClientLobbyState {
  lobbyId: string;
  hostUserId: string;
  state: LobbyState;
  settings: LobbySettings;
  players: ClientPlayerInfo[];
  spectators: ClientSpectatorInfo[];
  currentGame: ClientGameInfo | null;
  selectedGame: { minigameId: string; displayName: string } | null;
  matchHistory: MatchSummary[];
  roundNumber: number;
  chat: ChatMessage[];
  myRole: 'player' | 'spectator';
  myUserId: string;
  seq: number;                    // current sequence number
}

interface ClientPlayerInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isReady: boolean;
  score: number;
  roundScore: number;
  isHost: boolean;
}

interface ClientSpectatorInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
}

interface ClientGameInfo {
  minigameId: string;
  displayName: string;
  phase: 'instructions' | 'preloading' | 'countdown' | 'playing' | 'results';
  timeRemaining: number | null;   // seconds, null if no timer
  // Game-specific public state is included here, sanitized per-player
  publicState: Record<string, unknown>;
  // Player-specific private state (only sent to that player)
  privateState: Record<string, unknown>;
}
```

**Key sanitization rules:**
- In Undercover Agent: spymasters see the key card; operatives do not.
- In Identity Crisis: a player does not receive their own assigned identity.
- In Undercover Editor: the editor's identity is hidden; the secret keyword is only sent to the editor.
- In all games: other players' private inputs (typed but unsubmitted answers) are never broadcast.

### 8.4 Full State Sync (Heartbeat)

The server sends a full `ClientLobbyState` snapshot:
- **On connect/reconnect** (§9).
- **Every 10 seconds** during active gameplay (configurable via `HEARTBEAT_INTERVAL_MS`).
- **On phase transition** (e.g., WAITING → VOTING → PLAYING).

The heartbeat is sent individually to each player (since sanitization is per-player) using the `lobby:{lobbyId}:player:{userId}` room.

**Event:** `rmhbox:lobby:state_snapshot`

**Client reconciliation logic:**

```typescript
// When a heartbeat arrives:
// 1. Compare heartbeat.seq with local lastSeq
// 2. If heartbeat.seq > lastSeq, replace local state entirely (server is ahead)
// 3. If heartbeat.seq === lastSeq, state is consistent (no-op)
// 4. If heartbeat.seq < lastSeq, something is very wrong; replace anyway and log a warning
```

### 8.5 Action Types (Lobby-Level)

These actions are broadcast for lobby-level state changes:

```typescript
type LobbyActionType =
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_KICKED'
  | 'SPECTATOR_JOINED'
  | 'SPECTATOR_LEFT'
  | 'SPECTATOR_PROMOTED'       // spectator → player
  | 'HOST_TRANSFERRED'
  | 'SETTINGS_UPDATED'
  | 'PLAYER_READY_CHANGED'
  | 'STATE_CHANGED'            // LobbyState transition
  | 'CHAT_MESSAGE'
  | 'VOTE_STARTED'
  | 'VOTE_CAST'
  | 'VOTE_RESULT'
  | 'GAME_SELECTED'
  | 'GAME_PICKED'             // host pre-selected a game (before vote/start)
  | 'PLAYER_CONNECTED'        // reconnection
  | 'PLAYER_DISCONNECTED';    // temporary disconnect
```

### 8.6 Action Types (Game-Level)

These are game-specific and defined per minigame. Common patterns:

```typescript
type CommonGameActionType =
  | 'TIMER_START'              // { totalDuration: number, timeRemaining: number, showSkip?: boolean }
  | 'TIMER_TICK'               // { timeRemaining: number }
  | 'TIMER_PAUSED'             // {} — host paused the timer
  | 'TIMER_RESUMED'            // {} — host resumed the timer
  | 'MINIGAME_ROUND'           // { current: number, total: number }
  | 'ROUND_START'              // { roundNumber, roundData }
  | 'TURN_CHANGED'             // { activeUserId }
  | 'SCORE_UPDATED'            // { userId, newScore, delta }
  | 'PLAYER_ELIMINATED'        // { userId }
  | 'GAME_OVER'                // { rankings }
  | 'PHASE_CHANGED';           // { newPhase: string }
```

**`TIMER_START`** must be emitted before the first `TIMER_TICK` of any timed phase.
It sets the `totalDuration` baseline used by the header timer ring to calculate the
full-circle animation. A `totalDuration` of `-1` indicates an infinite timer (no countdown);
the timer ring hides and the optional `showSkip` flag controls whether the host sees a skip button.
All subsequent `TIMER_TICK` actions only carry `timeRemaining`.

**`TIMER_PAUSED`** and **`TIMER_RESUMED`** are broadcast when the host toggles pause.
All tracked pausable timers (including game-internal timeouts) freeze and resume alongside
the phase timer. The store sets `timerInfo.paused` accordingly.

**`MINIGAME_ROUND`** sets the sub-round display in the footer (e.g. "Round 2/3").
Minigame handlers call `this.broadcastRound(current, total)` at the start of each
internal round. The store's `minigameRound` field is automatically cleared on
game end / lobby leave.

Each minigame extends these with its own action types (detailed in `design-spec-minigames.md`).

---

## 9. Reconnection Protocol

### 9.1 Problem Statement

When a user's WebSocket connection drops (tab close, network hiccup, phone lock), their `socket.id` changes upon reconnect. The server must:

1. Recognize them via their auth session (not socket ID).
2. Map them back to their existing player slot.
3. Send a full state snapshot to resync their client.

### 9.2 Implementation

**Player identification is ALWAYS by `userId` (from auth session), never by `socket.id`.**

The `RMHboxPlayer.socketId` field is mutable. On disconnect, it is set to `null` and `isConnected` is set to `false`. On reconnect, it is updated to the new socket ID.

```typescript
// server/rmhbox/reconnection.ts

export class ReconnectionHandler {
  constructor(private lobbyManager: LobbyManager) {}

  handleReconnect(socket: Socket): void {
    const userId = socket.data.userId;
    
    // Search all lobbies for this userId
    const lobby = this.lobbyManager.findLobbyByUserId(userId);
    if (!lobby) return; // User wasn't in a lobby; normal fresh connect flow
    
    const player = lobby.players.get(userId);
    const spectator = lobby.spectators.get(userId);
    const member = player || spectator;
    
    if (!member) return;
    
    // Update socket mapping
    member.socketId = socket.id;
    member.isConnected = true;
    member.lastSeenAt = Date.now();
    
    // Re-join Socket.io rooms
    socket.join(`lobby:${lobby.id}`);
    if (player) {
      socket.join(`lobby:${lobby.id}:players`);
    } else {
      socket.join(`lobby:${lobby.id}:spectators`);
    }
    socket.join(`lobby:${lobby.id}:player:${userId}`);
    
    // Send full state snapshot
    const clientState = this.lobbyManager.buildClientState(lobby, userId);
    socket.emit('rmhbox:lobby:state_snapshot', clientState);
    
    // If a game is active, send game-specific state
    if (lobby.currentGame && lobby.state === 'PLAYING') {
      const gameState = player 
        ? lobby.currentGame.handler.getStateForPlayer(userId)
        : lobby.currentGame.handler.getStateForSpectator();
      socket.emit('rmhbox:game:state_snapshot', gameState);
      lobby.currentGame.handler.handlePlayerReconnect(userId);
    }
    
    // Broadcast to lobby that player reconnected
    this.lobbyManager.broadcastAction(lobby.id, {
      type: 'PLAYER_CONNECTED',
      payload: { userId, userName: member.userName },
    });
    
    // System chat message
    this.lobbyManager.addSystemChat(lobby.id, `${member.userName} reconnected`);
  }
}
```

### 9.3 Disconnect Grace Period

When a player disconnects:

1. Immediately: `socketId = null`, `isConnected = false`.
2. Broadcast `PLAYER_DISCONNECTED` action to lobby.
3. **Start a 120-second grace timer** (`DISCONNECT_GRACE_PERIOD_MS=120000`).
4. If the player reconnects within 120 seconds: cancel the timer, run reconnect flow (§9.2).
5. If the timer expires: treat as a permanent leave (§6.4 logic).
6. During the grace period, the player's slot is preserved. In-game, they are treated as AFK (minigame handles this — e.g., auto-pass their turn, submit empty answer).

**In-game disconnect grace:** A separate, shorter timer (`GAME_DISCONNECT_GRACE_MS=15000`) runs during active gameplay. When connected player count drops below `MIN_PLAYERS` (2) during a game, a 15-second grace timer starts. If any player reconnects, the timer is cancelled. If it expires, the game is force-ended and results are computed normally.

### 9.4 Multiple Tabs / Devices

If a user connects from a second tab/device while already in a lobby:

1. The new connection is recognized as the same `userId`.
2. The **old socket** is forcefully disconnected with reason `DUPLICATE_SESSION`.
3. The new socket takes over the player slot.
4. This prevents desync from having two active connections for the same player.

```typescript
// In handleConnection, after auth:
const existingSocketId = player?.socketId;
if (existingSocketId && existingSocketId !== socket.id) {
  const oldSocket = nsp.sockets.get(existingSocketId);
  if (oldSocket) {
    oldSocket.emit('rmhbox:error', { code: 'DUPLICATE_SESSION', message: 'Connected from another device' });
    oldSocket.disconnect(true);
  }
}
```

---

## 10. Spectator System

### 10.1 Spectator Capabilities

| Can Do | Cannot Do |
|---|---|
| View the full game board / public game state | Submit any game input |
| See player scores, rankings, progress | Vote on game selection |
| Read and send chat messages | Ready up |
| See the leaderboard | — |
| Request promotion to player (between rounds) | — |

### 10.2 Spectator State Delivery

Spectators receive the same `rmhbox:game:action` broadcasts as players, but:

- They receive the **spectator view** of the game state (via `getStateForSpectator()`), which may show more information than any single player sees (e.g., in Undercover Agent, spectators can see the full key).
- Their `ClientGameInfo.privateState` is always empty `{}`.
- Input events from spectator sockets are silently dropped at the server handler level.

```typescript
// In game-coordinator.ts, input handler:
socket.on('rmhbox:game:input', (payload) => {
  const lobby = this.lobbyManager.getLobbyBySocketId(socket.id);
  if (!lobby) return;
  
  // CRITICAL: Check that this socket belongs to a player, not a spectator
  const player = lobby.players.get(socket.data.userId);
  if (!player) return; // spectators can't submit input
  
  // ... handle input
});
```

### 10.3 Spectator UI

A persistent `<SpectatorBanner>` is shown at the top of the screen. It uses `h-16` to match the header height, `bg-.../75` for 75% transparency, and `pointer-events-none` on the container with `pointer-events-auto` on interactive elements so it doesn't block the game UI underneath:

```
┌─────────────────────────────────────────┐
│ 👁️ You are spectating  [Join as Player] │
│ [Join as Player] button only shows      │
│ between rounds if promotion is allowed  │
└─────────────────────────────────────────┘
```

---

## 11. Ready-Up & Join-in-Progress

### 11.1 Ready-Up System

During the `WAITING` state, each player has an `isReady` boolean. The UI shows a prominent ready button.

**Client emits:** `rmhbox:lobby:toggle_ready`

**Server logic:**
1. Toggle `player.isReady`.
2. Broadcast `PLAYER_READY_CHANGED` action.
3. If `settings.autoStartThreshold` is set and the number of ready players meets or exceeds it, automatically trigger the game selection flow (either vote or host's last selected game).

**Host override:** The host can start a game regardless of ready states. The ready system is informational / for auto-start, not a hard gate (the host is the authority).

### 11.2 Join-in-Progress Logic

Each minigame defines a `JoinInProgressPolicy`:

| Policy | Behavior | Used By |
|---|---|---|
| `spectate_only` | Players who join during a game become spectators. They cannot become players until the current round ends. | Most games (default) |
| `join_next_subround` | Players join as spectators initially, but are added to the player pool at the next sub-round boundary (e.g., next question in trivia, next drawing round). | Fact or Friction, Category Crash, Ranking File |
| `join_immediately` | Players are added to the active game immediately. Only viable for games with no turn order or per-player state setup. | Pixel Pushers (join the physics sim immediately) |

### 11.3 Spectator Promotion

Between rounds (during `WAITING` or `ROUND_RESULTS` states), if `settings.allowSpectatorPromotion` is true:

1. Spectators see a "Join as Player" button.
2. **Client emits:** `rmhbox:lobby:request_promotion`
3. Server checks `players.size < settings.maxPlayers`.
4. If space available: move the spectator from `spectators` map to `players` map, update their rooms, broadcast `SPECTATOR_PROMOTED` action. The client store reducer sets `myRole: 'player'` when the promoted user matches the local user.
5. If no space: respond with `rmhbox:error` (`LOBBY_FULL`).

---

## 12. Voting System

### 12.1 Vote Initiation

The host emits `rmhbox:game:start_vote`. The server:

1. Selects a pool of minigames eligible for the current player count (filtering by `minPlayers` / `maxPlayers`).
2. Randomly selects **5** candidates from the eligible pool (or all, if fewer than 5 are eligible).
3. Broadcasts `rmhbox:game:vote_started`:

```typescript
interface VoteStartedPayload {
  candidates: VoteCandidate[];
  durationSeconds: number; // 30
  endsAt: number;          // server timestamp
}

interface VoteCandidate {
  minigameId: string;
  displayName: string;
  description: string;
  category: MinigameCategory;
  icon: string;
  playerRange: string; // e.g., "3–8 players"
}
```

### 12.2 Casting Votes

**Client emits:** `rmhbox:game:cast_vote`

```typescript
interface CastVotePayload {
  lobbyId: string;
  minigameId: string;
}
```

**Server logic:**
- Only players can vote (not spectators).
- Each player gets exactly one vote. Voting again overwrites their previous vote.
- The server broadcasts `VOTE_CAST` action (with `userId` and new vote tally, but NOT who voted for what — to preserve suspense).

```typescript
// VOTE_CAST action payload
interface VoteCastPayload {
  userId: string;
  tallies: Record<string, number>; // minigameId → vote count
  totalVoters: number;
  totalPlayers: number;
  endsAt?: number;                 // if all voted, shortened deadline for grace period
}
```

### 12.3 Vote Resolution

When the timer expires or all players have voted:

1. The minigame with the most votes wins. Ties are broken randomly.
2. Server broadcasts `VOTE_RESULT` action:

```typescript
interface VoteResultPayload {
  winnerId: string;       // minigameId
  winnerName: string;
  tallies: Record<string, number>;
  wasUnanimous: boolean;
}
```

3. Transition to `INSTRUCTIONS` state with the winning minigame.

### 12.4 Host Direct Select (No Vote)

The host can bypass voting entirely:

**Client emits:** `rmhbox:game:select`

```typescript
interface SelectGamePayload {
  lobbyId: string;
  minigameId: string;
}
```

Server validates the minigame is eligible for the current player count, then transitions directly to `INSTRUCTIONS`.

---

## 12A. Minigame Game Settings

A unified system that lets the host configure game-specific settings (round count, time limits, difficulty toggles, etc.) **before** a minigame launches. Settings are typed, validated, persisted per-account, and surfaced in the lobby UI.

### 12A.1 Setting Schema Types

Every configurable setting is described by a **`GameSettingDef`** that declares its type, constraints, label, and default value. Four primitive types are supported:

```typescript
// lib/rmhbox/types.ts

type GameSettingType = 'boolean' | 'integer' | 'float' | 'string';

/** A single setting definition. */
interface GameSettingDef {
  key: string;                       // machine-readable identifier, e.g. 'totalRounds'
  type: GameSettingType;
  label: string;                     // human-readable label, e.g. 'Number of Rounds'
  description?: string;              // tooltip / help text
  defaultValue: boolean | number | string;

  // ─── Type-specific constraints ───
  /** Integer / Float: inclusive minimum. */
  min?: number;
  /** Integer / Float: inclusive maximum. */
  max?: number;
  /** Integer / Float: step increment for the UI slider/stepper. */
  step?: number;
  /** String: allowed values (renders as a dropdown). Empty = free text. */
  options?: Array<{ value: string; label: string }>;
  /** String: max length for free-text inputs. */
  maxLength?: number;
}

/** Resolved setting values — a flat Record keyed by `GameSettingDef.key`. */
type GameSettingValues = Record<string, boolean | number | string>;

/** Schema + defaults for a minigame. */
interface GameSettingsSchema {
  minigameId: string;
  settings: GameSettingDef[];
}
```

Examples:

| Key | Type | Default | Constraints | Label |
|---|---|---|---|---|
| `totalRounds` | `integer` | `3` | min=1, max=10, step=1 | Number of Rounds |
| `inputDuration` | `integer` | `45` | min=15, max=120, step=5 | Input Timer (seconds) |
| `enableSpeedBonus` | `boolean` | `true` | — | Speed Bonus |
| `difficulty` | `string` | `'mixed'` | options: easy/medium/hard/mixed | Difficulty |
| `scoringMultiplier` | `float` | `1.0` | min=0.5, max=3.0, step=0.5 | Scoring Multiplier |

### 12A.2 MinigameDefinition Extension

`MinigameDefinition` (§7.3) gains a new optional field:

```typescript
interface MinigameDefinition {
  // ... existing fields ...
  settingsSchema?: GameSettingDef[];  // if omitted, the game has no configurable settings
}
```

When a minigame is registered in `MINIGAME_REGISTRY`, it may include a `settingsSchema` array describing all host-configurable settings. The `defaultValue` on each `GameSettingDef` doubles as the fallback when the host has no saved preferences.

### 12A.3 Server-Side Interface: BaseMinigame

`MinigameContext` gains a new field:

```typescript
interface MinigameContext {
  // ... existing fields ...
  gameSettings: GameSettingValues;   // resolved settings for this match
}
```

`BaseMinigame` provides a typed helper for reading settings:

```typescript
abstract class BaseMinigame {
  // ... existing ...

  /** Read a game setting with type safety, falling back to the constant default. */
  protected getSetting<T extends boolean | number | string>(key: string, fallback: T): T {
    const val = this.context.gameSettings[key];
    return (val !== undefined ? val : fallback) as T;
  }
}
```

Game handlers use `this.getSetting('totalRounds', RT_TOTAL_ROUNDS)` instead of the raw constant, making every tuning knob overridable.

### 12A.4 Lifecycle Flow

The settings configuration phase occurs **after** the game is selected (by direct pick or vote result) but **before** instructions begin. A new `GAME_SETTINGS` lobby state is introduced:

```
WAITING → [VOTING] → GAME_SETTINGS → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
```

#### 12A.4.1 State Machine Update

```typescript
type LobbyState =
  | 'WAITING'
  | 'VOTING'
  | 'GAME_SETTINGS'      // ← NEW: host configuring game settings
  | 'INSTRUCTIONS'
  | 'PRELOADING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'ROUND_RESULTS'
  | 'SESSION_RESULTS'
  | 'DISBANDED';
```

#### 12A.4.2 Lobby Pre-Configuration (WAITING State)

While the lobby is in the `WAITING` state and a game is picked, the host may open a **Game Settings Modal** to pre-configure settings before launching the game. Non-host players can also view the same modal, updated in real-time, but all inputs are disabled.

1. Host picks a game via `GAME_PICK`. If the game has `settingsSchema`, `pendingGameSettings` is initialized with defaults.
2. Host (or any player) can open the pre-launch settings modal at any time.
3. When the host changes a setting, the client emits `rmhbox:game:update_settings` — the server validates, updates `pendingGameSettings`, and broadcasts `GAME_SETTINGS_UPDATED` to all clients.
4. Non-host players see settings values update live as the host makes changes. All inputs are disabled for non-hosts.
5. The host may also press **"Reset Defaults"** to revert all values.
6. Changes persist on the lobby until the game starts or the game selection changes.

#### 12A.4.3 Flow A — Host Direct-Select

1. Host picks a game and presses **Start**.
2. The `GAME_SETTINGS` phase is **skipped entirely** — the server resolves settings from `pendingGameSettings` (or defaults if empty) and proceeds directly to `INSTRUCTIONS`.
3. This applies whether or not the game has a `settingsSchema`. The host has already had the opportunity to configure settings in the lobby via the pre-launch modal.

#### 12A.4.4 Flow B — Vote Result

1. Vote completes → winning minigame determined.
2. If the winning game has `settingsSchema`:
   - Server transitions to `GAME_SETTINGS`.
   - Host sees a full-screen settings phase with editable controls.
   - Non-host players see the same view in real-time, but all inputs are disabled (read-only). A message says "Host is configuring settings…".
   - The host **cannot go back to the lobby** or to the vote — they can only configure and start, or skip.
   - If the host does not act within **30 seconds**, the game auto-starts with the current settings (defaults or host-modified).
3. If the winning game has NO `settingsSchema`:
   - Proceed directly to `INSTRUCTIONS`.

#### 12A.4.5 Host Force-Skip

The host can **force-skip** the `GAME_SETTINGS` phase (via `rmhbox:game:force_skip`), which starts the game with the current (potentially partially modified) settings.

### 12A.5 WebSocket Events

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `rmhbox:game:update_settings` | `{ lobbyId: string, settings: Partial<GameSettingValues> }` | [Host] Update one or more game settings. Accepted in both `WAITING` and `GAME_SETTINGS` states. |
| `rmhbox:game:confirm_settings` | `{ lobbyId: string }` | [Host] Confirm settings during `GAME_SETTINGS` phase and proceed to INSTRUCTIONS |
| `rmhbox:game:reset_settings` | `{ lobbyId: string }` | [Host] Reset all settings to minigame defaults. Accepted in both `WAITING` and `GAME_SETTINGS` states. |

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `rmhbox:game:game_settings_opened` | `GameSettingsOpenedPayload` | Game settings phase started; includes schema + current values |
| `rmhbox:game:game_settings_updated` | `{ settings: GameSettingValues }` | Settings changed (broadcast to all; players see live preview) |

```typescript
interface GameSettingsOpenedPayload {
  minigameId: string;
  displayName: string;
  schema: GameSettingDef[];
  currentValues: GameSettingValues;
  /** Whether this is a post-vote flow (affects button labels and timeout). */
  isPostVote: boolean;
  /** If post-vote, auto-start deadline (unix ms). Null for direct-select. */
  autoStartAt: number | null;
}
```

### 12A.6 Server-Side Logic (GameCoordinator)

#### 12A.6.1 Entering GAME_SETTINGS

When `startGameFlow()` determines the selected minigame has a `settingsSchema`:

```typescript
private async startGameSettings(lobby: RMHboxLobby, minigameId: string, isPostVote: boolean): Promise<void> {
  const def = this.getMinigameDef(minigameId);
  if (!def?.settingsSchema?.length) {
    // No settings — skip directly to instructions
    this.startInstructions(lobby, minigameId);
    return;
  }

  lobby.state = 'GAME_SETTINGS';
  lobby.lastActivityAt = Date.now();

  // Load host's saved preferences
  const hostPrefs = await this.loadHostGamePreferences(lobby.hostUserId, minigameId);
  const defaults = buildDefaults(def.settingsSchema);
  const currentValues = { ...defaults, ...hostPrefs };

  // Store pending settings on the lobby
  lobby.pendingGameSettings = {
    minigameId,
    schema: def.settingsSchema,
    values: currentValues,
    isPostVote,
  };

  // Broadcast
  this.lobbyManager.broadcastAction(lobby.id, {
    type: 'STATE_CHANGED',
    payload: { state: 'GAME_SETTINGS' },
  });

  const autoStartAt = isPostVote ? Date.now() + 30_000 : null;

  this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_SETTINGS_OPENED, {
    minigameId,
    displayName: def.displayName,
    schema: def.settingsSchema,
    currentValues,
    isPostVote,
    autoStartAt,
  });

  this.stateSync.broadcastFullSync(lobby.id);

  // Post-vote auto-start timer
  if (isPostVote) {
    const timerHandle = this.stateSync.startTimerBroadcast(lobby.id, 30, () => {
      const current = this.lobbyManager.getLobby(lobby.id);
      if (current?.state === 'GAME_SETTINGS') {
        this.confirmGameSettings(lobby.id);
      }
    });
    let lifecycle = this.lifecycles.get(lobby.id);
    if (!lifecycle) {
      lifecycle = { phaseTimer: null, timerHandle, readyPlayers: new Set() };
      this.lifecycles.set(lobby.id, lifecycle);
    } else {
      lifecycle.timerHandle = timerHandle;
    }
  }
}
```

#### 12A.6.2 Handling Setting Updates

```typescript
private onUpdateGameSettings(socket: Socket, payload: { lobbyId: string; settings: Partial<GameSettingValues> }): void {
  const userId = socket.data.userId as string;
  const lobby = this.lobbyManager.getLobbyByUserId(userId);
  if (!lobby || lobby.id !== payload.lobbyId) return;
  if (lobby.hostUserId !== userId) return; // Host only
  if (lobby.state !== 'GAME_SETTINGS' || !lobby.pendingGameSettings) return;

  const schema = lobby.pendingGameSettings.schema;
  const validated = validateSettings(schema, payload.settings);

  // Merge into pending
  Object.assign(lobby.pendingGameSettings.values, validated);

  // Broadcast updated values to all clients
  this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_SETTINGS_UPDATED, {
    settings: lobby.pendingGameSettings.values,
  });
}
```

#### 12A.6.3 Confirming Settings

```typescript
private async confirmGameSettings(lobbyId: string): Promise<void> {
  const lobby = this.lobbyManager.getLobby(lobbyId);
  if (!lobby || lobby.state !== 'GAME_SETTINGS' || !lobby.pendingGameSettings) return;

  const { minigameId, values } = lobby.pendingGameSettings;

  // Persist the host's preferences for this game
  await this.saveHostGamePreferences(lobby.hostUserId, minigameId, values);

  // Store resolved settings on the ActiveGame for the handler
  lobby.resolvedGameSettings = values;

  // Clear pending state
  lobby.pendingGameSettings = null;

  // Clear any auto-start timer
  this.clearLifecycleTimers(lobbyId);

  // Continue with the game flow
  this.startInstructions(lobby, minigameId);
}
```

#### 12A.6.4 Resetting to Defaults

```typescript
private onResetGameSettings(socket: Socket, payload: { lobbyId: string }): void {
  const userId = socket.data.userId as string;
  const lobby = this.lobbyManager.getLobbyByUserId(userId);
  if (!lobby || lobby.id !== payload.lobbyId) return;
  if (lobby.hostUserId !== userId) return;
  if (lobby.state !== 'GAME_SETTINGS' || !lobby.pendingGameSettings) return;

  const defaults = buildDefaults(lobby.pendingGameSettings.schema);
  lobby.pendingGameSettings.values = { ...defaults };

  this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_SETTINGS_UPDATED, {
    settings: lobby.pendingGameSettings.values,
  });
}
```

#### 12A.6.5 Validation Helper

Settings are validated against their schema constraints:

```typescript
function validateSettings(
  schema: GameSettingDef[],
  partial: Partial<GameSettingValues>,
): GameSettingValues {
  const result: GameSettingValues = {};
  for (const def of schema) {
    const raw = partial[def.key];
    if (raw === undefined) continue;

    switch (def.type) {
      case 'boolean':
        if (typeof raw === 'boolean') result[def.key] = raw;
        break;
      case 'integer':
        if (typeof raw === 'number' && Number.isInteger(raw)) {
          result[def.key] = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, raw));
        }
        break;
      case 'float':
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          result[def.key] = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, raw));
        }
        break;
      case 'string':
        if (typeof raw === 'string') {
          if (def.options?.length) {
            // Must be one of the allowed values
            if (def.options.some((o) => o.value === raw)) result[def.key] = raw;
          } else {
            result[def.key] = raw.slice(0, def.maxLength ?? 100);
          }
        }
        break;
    }
  }
  return result;
}

function buildDefaults(schema: GameSettingDef[]): GameSettingValues {
  const result: GameSettingValues = {};
  for (const def of schema) {
    result[def.key] = def.defaultValue;
  }
  return result;
}
```

### 12A.7 UI/UX Design

#### 12A.7.1 Host Controls Updates

The "Settings" button in `HostControls` is renamed to **"Lobby Settings"**. A new **"Game Settings"** button appears when a game is selected (i.e., `selectedGame !== null`). Pressing it opens the `GameSettingsModal` without starting the game — the host can pre-configure settings before pressing Start.

```
┌──────────────────────────────────────────────────┐
│              HOST CONTROLS                        │
│                                                   │
│  [🎮 Pick Game]  [⚙ Lobby Settings]             │
│                                                   │
│  [🔧 Game Settings]  ← visible when game picked  │
│                                                   │
│  Selected: Rhyme Time                             │
└──────────────────────────────────────────────────┘
```

#### 12A.7.2 Game Settings Modal (WAITING State — Pre-Launch)

When opened from the lobby (WAITING), the modal shows:

```
┌────────────────────────────────────────────────────┐
│  🔧  Rhyme Time — Game Settings            [✕]    │
│────────────────────────────────────────────────────│
│                                                    │
│  Number of Rounds            [  3  ] ← stepper    │
│  Input Timer (seconds)       [──●──] 45s ← slider │
│  Speed Bonus                 [■ ON ]  ← toggle    │
│  Scoring Multiplier          [──●──] 1.0× ← slider│
│                                                    │
│────────────────────────────────────────────────────│
│  [↺ Reset Defaults]                    [💾 Save]  │
└────────────────────────────────────────────────────┘
```

- **"Save"** persists the host's preferences and closes the modal. The game does NOT start.
- **"Reset Defaults"** reverts all values to the minigame's built-in defaults.
- Changes are broadcast live to all players via `GAME_SETTINGS_UPDATED`. Non-host players can open the same modal to view settings in real-time with all inputs disabled.

#### 12A.7.3 Game Settings Phase (GAME_SETTINGS State — Pre-Instructions)

When the game enters the `GAME_SETTINGS` phase (after direct-select or vote), **all** players transition to the settings screen:

**Host View:**

```
┌────────────────────────────────────────────────────┐
│  🔧  Rhyme Time — Game Settings            [✕]    │
│────────────────────────────────────────────────────│
│                                                    │
│  Number of Rounds            [  3  ] ← stepper    │
│  Input Timer (seconds)       [──●──] 45s ← slider │
│  Speed Bonus                 [■ ON ]  ← toggle    │
│  Scoring Multiplier          [──●──] 1.0× ← slider│
│                                                    │
│────────────────────────────────────────────────────│
│  [↺ Reset]      [← Back to Lobby] [▶ Start Game] │
│                                                    │
│  (Post-vote: [↺ Reset]  [▶ Use Defaults & Start]  │
│               [▶ Save & Start])                    │
│                          Auto-starting in: 0:25    │
└────────────────────────────────────────────────────┘
```

**Non-Host Player View:**

```
┌────────────────────────────────────────────────────┐
│  🔧  Rhyme Time — Game Settings                    │
│────────────────────────────────────────────────────│
│                                                    │
│  Number of Rounds                    3             │
│  Input Timer (seconds)               45s           │
│  Speed Bonus                         ON            │
│  Scoring Multiplier                  1.0×          │
│                                                    │
│         Host is configuring settings...            │
│       [settings update live as host changes]       │
│                                                    │
│                          Auto-starting in: 0:25    │
└────────────────────────────────────────────────────┘
```

- Non-host players see a **read-only** view of the current settings that updates live as the host makes changes.
- The post-vote flow has a **30-second auto-start timer** (shown for all players).
- The direct-select flow has **no auto-start timer**; the host controls the pace.

#### 12A.7.4 Setting Input Controls

Each setting type maps to a specific UI control:

| Type | Control | Details |
|---|---|---|
| `boolean` | Toggle switch | ON/OFF with colored fill |
| `integer` | Stepper or slider | If `max - min ≤ 20`, use a stepper (- / + buttons). Otherwise, use a slider with value label. In both modes, clicking the displayed value opens an inline `<input type="number">` for direct editing. Enter/blur commits (snapped to nearest step, clamped to range), Escape cancels. |
| `float` | Slider | Continuous slider with value label showing `step` precision |
| `string` (with `options`) | Dropdown select | Renders all options as a `<select>` |
| `string` (no `options`) | Text input | Free-form input with `maxLength` constraint |

#### 12A.7.5 GameSettingsModal Component

```typescript
// components/rmhbox/GameSettingsModal.tsx

interface GameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The minigame whose settings to display. */
  minigameId: string;
  displayName: string;
  /** Setting definitions from MinigameDefinition.settingsSchema. */
  schema: GameSettingDef[];
  /** Current values (may be host's saved prefs or defaults). */
  values: GameSettingValues;
  /** Whether the host can edit (true) or is viewing read-only (false). */
  editable: boolean;
  /** Callback when the host changes a setting. */
  onSettingChange?: (key: string, value: boolean | number | string) => void;
  /** Callback when the host presses Reset. */
  onReset?: () => void;
  /** Footer mode determines which buttons appear. */
  mode: 'lobby' | 'pre-launch' | 'post-vote';
  /** Callback for the primary action (Save / Start Game / Save & Start). */
  onPrimaryAction?: () => void;
  /** Callback for back-to-lobby (pre-launch only). */
  onBackToLobby?: () => void;
  /** Auto-start countdown remaining (seconds). Null if no countdown. */
  autoStartCountdown?: number | null;
}
```

### 12A.8 Database Persistence

Host game settings preferences are persisted so they carry across sessions. A new model stores per-user, per-minigame settings:

```prisma
model RMHboxGamePreference {
  id          String   @id @default(cuid())
  userId      String
  minigameId  String
  settings    Json     // GameSettingValues serialized
  updatedAt   DateTime @updatedAt

  @@unique([userId, minigameId])
  @@index([userId])
  @@map("rmhbox_game_preference")
}
```

The `RMHboxProfile` model gains a relation:

```prisma
model RMHboxProfile {
  // ... existing fields ...
  gamePreferences  RMHboxGamePreference[]
}
```

**Wait — actually**, `RMHboxGamePreference` references `userId` directly (not `profileId`), since we may want preferences even before a profile exists. The relation can be through `User` instead:

```prisma
model RMHboxGamePreference {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  minigameId  String
  settings    Json     // GameSettingValues serialized
  updatedAt   DateTime @updatedAt

  @@unique([userId, minigameId])
  @@index([userId])
  @@map("rmhbox_game_preference")
}

// Add to User model:
// rmhboxGamePreferences  RMHboxGamePreference[]
```

#### 12A.8.1 Load Preferences

```typescript
async function loadHostGamePreferences(userId: string, minigameId: string): Promise<GameSettingValues | null> {
  const pref = await prisma.rMHboxGamePreference.findUnique({
    where: { userId_minigameId: { userId, minigameId } },
  });
  return pref ? (pref.settings as GameSettingValues) : null;
}
```

#### 12A.8.2 Save Preferences

```typescript
async function saveHostGamePreferences(userId: string, minigameId: string, settings: GameSettingValues): Promise<void> {
  await prisma.rMHboxGamePreference.upsert({
    where: { userId_minigameId: { userId, minigameId } },
    create: { userId, minigameId, settings },
    update: { settings },
  });
}
```

#### 12A.8.3 Caching Strategy

To avoid a DB round-trip on every `GAME_SETTINGS` entry, the server maintains an in-memory LRU cache of host preferences:

```typescript
// server/rmhbox/game-settings-cache.ts

const PREFS_CACHE = new Map<string, { values: GameSettingValues; loadedAt: number }>();
const PREFS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PREFS_CACHE_MAX = 500;

function cacheKey(userId: string, minigameId: string): string {
  return `${userId}::${minigameId}`;
}
```

Cache is invalidated on save and evicted LRU when exceeding `PREFS_CACHE_MAX`.

### 12A.9 Server-Side Lobby Extensions

The `RMHboxLobby` interface gains two optional fields:

```typescript
interface RMHboxLobby {
  // ... existing fields ...
  /** Settings being configured during the GAME_SETTINGS phase. */
  pendingGameSettings: {
    minigameId: string;
    schema: GameSettingDef[];
    values: GameSettingValues;
    isPostVote: boolean;
  } | null;
  /** Resolved game settings to be passed to the minigame handler. */
  resolvedGameSettings: GameSettingValues | null;
}
```

When `startPlaying()` builds the `MinigameContext`, it includes `gameSettings`:

```typescript
const context: MinigameContext = {
  // ... existing fields ...
  gameSettings: lobby.resolvedGameSettings ?? {},
};
```

### 12A.10 Client Store Extensions

The Zustand store gains a field for game settings state:

```typescript
interface RMHboxStore {
  // ... existing fields ...
  /** Game settings for the GAME_SETTINGS phase. Null when not in that phase. */
  gameSettingsState: {
    minigameId: string;
    displayName: string;
    schema: GameSettingDef[];
    values: GameSettingValues;
    isPostVote: boolean;
    autoStartAt: number | null;
  } | null;
  setGameSettingsState: (state: RMHboxStore['gameSettingsState']) => void;
}
```

New actions in the lobby action reducer:

```typescript
case 'GAME_SETTINGS_UPDATED':
  // Update the settings values in the store  
  if (state.gameSettingsState) {
    return { ...state, gameSettingsState: { ...state.gameSettingsState, values: payload.settings } };
  }
  return state;
```

Socket listener for `GAME_SETTINGS_OPENED`:

```typescript
socket.on(S2C.GAME_SETTINGS_OPENED, (data: GameSettingsOpenedPayload) => {
  useRMHboxStore.getState().setGameSettingsState({
    minigameId: data.minigameId,
    displayName: data.displayName,
    schema: data.schema,
    values: data.currentValues,
    isPostVote: data.isPostVote,
    autoStartAt: data.autoStartAt,
  });
});
```

### 12A.11 Match History Integration

The resolved game settings used for a match are stored in the `RMHboxMatch.gameLog` JSON alongside the game actions. This allows match replays to know what settings were active:

```typescript
interface GameLog {
  // ... existing fields ...
  gameSettings: GameSettingValues;   // settings used for this match
}
```

The settings are also summarized in `RoundResultsPayload` so the results screen can show what configuration was used:

```typescript
interface RoundResultsPayload {
  // ... existing fields ...
  gameSettings?: GameSettingValues;  // optional: settings used (for display)
}
```

### 12A.12 Constants

```typescript
// lib/rmhbox/constants.ts

/** Duration of the auto-start timer during the post-vote GAME_SETTINGS phase. */
export const GAME_SETTINGS_POST_VOTE_TIMEOUT = 30;

/** Maximum number of settings a minigame can define. */
export const MAX_GAME_SETTINGS_PER_MINIGAME = 20;

/** Rate limit for game:update_game_settings events. */
// Added to SOCKET_RATE_LIMITS:
// 'rmhbox:game:update_game_settings': { max: 30, windowMs: 10_000 }
```

### 12A.13 Security & Validation

1. **Host-only mutation:** Only the current host (`lobby.hostUserId === userId`) can emit `update_settings`, `confirm_settings`, or `reset_settings`. All others are silently dropped.
2. **Schema validation:** Every value update is validated against the `GameSettingDef[]` schema. Unknown keys are ignored. Values outside `min`/`max` are clamped. Invalid types are rejected.
3. **State gating:** `update_settings` and `reset_settings` are accepted in both `WAITING` (pre-configuration) and `GAME_SETTINGS` (post-vote) states. `confirm_settings` is only accepted during the `GAME_SETTINGS` phase. Out-of-state events are dropped.
4. **Rate limiting:** `update_settings` is rate-limited to 30 events per 10 seconds to prevent spam.
5. **Payload size:** The `settings` JSON payload is validated to be under 10 KB.

---

## 13. Database Schema

### 13.1 New Prisma Models

```prisma
// Add to prisma/schema.prisma

// ─── RMHbox Models ───

model RMHboxProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Global aggregated stats
  totalGamesPlayed  Int      @default(0)
  totalWins         Int      @default(0)
  totalScore        Int      @default(0)
  totalPlayTimeMs   Int      @default(0)  // milliseconds
  
  // Per-minigame stats (JSON map: minigameId → stats)
  minigameStats     Json     @default("{}")
  
  // Streaks & achievements
  currentWinStreak  Int      @default(0)
  bestWinStreak     Int      @default(0)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  matches       RMHboxMatchPlayer[]
  
  @@index([totalWins(sort: Desc)], map: "idx_rmhbox_wins")
  @@index([totalScore(sort: Desc)], map: "idx_rmhbox_score")
  @@map("rmhbox_profile")
}

model RMHboxMatch {
  id            String   @id @default(cuid())
  
  minigameId    String              // e.g., 'rhyme-time'
  lobbyId       String              // room code at time of match
  
  // Timing
  startedAt     DateTime @default(now())
  endedAt       DateTime?
  durationMs    Int?                // actual game duration
  
  // Match outcome
  winnerUserId  String?             // null if draw
  playerCount   Int
  
  // Full game log (for replay / review)
  // Contains sanitized game state snapshots, actions, and results
  gameLog       Json?
  
  // Final results (for quick access without parsing gameLog)
  results       Json                // PlayerRanking[] serialized
  
  players       RMHboxMatchPlayer[]
  
  @@index([minigameId])
  @@index([startedAt(sort: Desc)])
  @@index([lobbyId])
  @@map("rmhbox_match")
}

model RMHboxMatchPlayer {
  id            String   @id @default(cuid())
  
  matchId       String
  match         RMHboxMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  
  profileId     String
  profile       RMHboxProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  
  userId        String
  userName      String              // snapshot at time of match
  
  rank          Int                 // final placement (1 = winner)
  score         Int
  wasWinner     Boolean @default(false)
  
  // game-specific stats for this match (JSON)
  stats         Json     @default("{}")
  
  createdAt     DateTime @default(now())
  
  @@unique([matchId, userId])
  @@index([profileId])
  @@index([userId])
  @@index([createdAt(sort: Desc)])
  @@map("rmhbox_match_player")
}

// Add to User model:
// rmhboxProfile  RMHboxProfile?
```

### 13.2 `minigameStats` JSON Schema

The `RMHboxProfile.minigameStats` field stores per-minigame stats as a JSON object:

```typescript
interface MinigameStatsMap {
  [minigameId: string]: MinigamePlayerStats;
}

interface MinigamePlayerStats {
  gamesPlayed: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  averageRank: number;        // running average
  // Game-specific stats (varies per minigame):
  [key: string]: number;
  // Examples:
  // 'rhyme-time': { rareRhymesFound: number, longestCombo: number }
  // 'undercover-agent': { correctGuesses: number, spymasterWins: number }
  // 'cursor-curling': { bullseyes: number, bestDistance: number }
}
```

### 13.3 `RMHboxMatch.gameLog` JSON Schema

The game log is an ordered array of actions that can be replayed for review:

```typescript
interface GameLog {
  minigameId: string;
  version: number;            // schema version for forward compat
  players: Array<{
    userId: string;
    userName: string;
  }>;
  gameSettings: GameSettingValues;  // settings used for this match (§12A.11)
  initialState: Record<string, unknown>;  // sanitized initial game state
  actions: Array<{
    seq: number;
    timestamp: number;          // ms offset from game start
    type: string;
    payload: Record<string, unknown>;
  }>;
  finalResults: PlayerRanking[];
}
```

> **Storage policy:** Game logs that are older than 90 days and not favorited/bookmarked are eligible for cleanup via a scheduled job. This keeps the `rmhbox_match` table lean.

### 13.4 Weekly Leaderboard Computation

Weekly leaderboards are computed via database queries with a `WHERE createdAt >= <monday_of_current_week>` filter on `RMHboxMatchPlayer`. No separate table is needed; the query uses existing indexes.

```sql
-- Example: Weekly top players by total score
SELECT mp."userId", mp."userName", 
       SUM(mp.score) as "weeklyScore",
       COUNT(*) as "gamesPlayed",
       SUM(CASE WHEN mp."wasWinner" THEN 1 ELSE 0 END) as "wins"
FROM rmhbox_match_player mp
JOIN rmhbox_match m ON mp."matchId" = m.id
WHERE m."startedAt" >= date_trunc('week', now())
GROUP BY mp."userId", mp."userName"
ORDER BY "weeklyScore" DESC
LIMIT 50;
```

---

## 14. Leaderboard & Stats API

### 14.1 REST Endpoints

#### `GET /api/rmhbox/leaderboard`

Query Parameters:
| Param | Type | Default | Description |
|---|---|---|---|
| `period` | `'all-time' \| 'weekly' \| 'monthly'` | `'all-time'` | Time period filter |
| `minigame` | `string \| undefined` | `undefined` | Filter by minigame ID (omit for global) |
| `metric` | `'score' \| 'wins' \| 'games'` | `'score'` | Ranking metric |
| `limit` | `number` | `20` | Results per page (max 50) |
| `offset` | `number` | `0` | Pagination offset |

Response:
```typescript
interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  period: string;
  minigame: string | null;
  metric: string;
  userRank: LeaderboardEntry | null; // requesting user's rank (if authenticated)
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  value: number;           // score, wins, or game count depending on metric
  gamesPlayed: number;
  wins: number;
}
```

#### `GET /api/rmhbox/stats`

Query Parameters:
| Param | Type | Required | Description |
|---|---|---|---|
| `userId` | `string` | Yes | User to fetch stats for |

Response:
```typescript
interface PlayerStatsResponse {
  global: {
    totalGamesPlayed: number;
    totalWins: number;
    totalScore: number;
    totalPlayTimeMs: number;
    winRate: number;              // percentage
    currentWinStreak: number;
    bestWinStreak: number;
    favoriteMinigame: string;    // most-played minigame ID
  };
  minigames: MinigameStatsMap;
  recentMatches: RecentMatch[];  // last 10 matches
}

interface RecentMatch {
  matchId: string;
  minigameId: string;
  minigameDisplayName: string;
  rank: number;
  score: number;
  playerCount: number;
  playedAt: string;            // ISO timestamp
}
```

#### `GET /api/rmhbox/history`

Query Parameters:
| Param | Type | Required | Description |
|---|---|---|---|
| `matchId` | `string` | No | Specific match to retrieve (detailed view with gameLog) |
| `userId` | `string` | No | Filter by user's matches |
| `minigame` | `string` | No | Filter by minigame |
| `limit` | `number` | No | Default 20, max 50 |
| `offset` | `number` | No | Pagination offset |

Response (list mode):
```typescript
interface MatchHistoryResponse {
  matches: MatchSummary[];
  total: number;
}

interface MatchSummary {
  matchId: string;
  minigameId: string;
  lobbyId: string;
  startedAt: string;
  durationMs: number;
  playerCount: number;
  winnerUserName: string | null;
  rankings: Array<{ userId: string; userName: string; rank: number; score: number }>;
}
```

Response (detail mode, when `matchId` is provided):
```typescript
interface MatchDetailResponse extends MatchSummary {
  gameLog: GameLog | null;  // null if expired/cleaned up
}
```

### 14.2 Rate Limiting

All RMHbox API endpoints use the existing `rateLimit()` from `lib/rate-limit.ts`:

| Endpoint | Limit | Window |
|---|---|---|
| `/api/rmhbox/leaderboard` | 30 requests | 60 seconds |
| `/api/rmhbox/stats` | 20 requests | 60 seconds |
| `/api/rmhbox/history` | 20 requests | 60 seconds |

### 14.3 WebSocket Leaderboard Events

For in-game display (e.g., during `ROUND_RESULTS` or on the landing page), leaderboard data can also be fetched via WebSocket:

**Client emits:** `rmhbox:leaderboard:fetch`
```typescript
interface FetchLeaderboardPayload {
  period: 'all-time' | 'weekly';
  minigame?: string;
  limit?: number; // default 10
}
```

**Server responds:** `rmhbox:leaderboard:data`
```typescript
interface LeaderboardDataPayload {
  entries: LeaderboardEntry[];
  period: string;
}
```

---

## 14A. Minigame Browser & History Viewing

### 14A.1 Overview

The Minigame Browser and History Viewing system provides a publicly accessible interface for users to explore all available minigames, view per-minigame leaderboards, and search through their personal game histories.

**User Flow:**

```
Landing Page (/rmhbox)
  └─ "View Minigames" button
       └─ Minigames List Page (/rmhbox/minigames)
            ├─ [Leaderboard] → Leaderboard Modal (All-Time + Weekly tabs)
            └─ [History] → History Page (/rmhbox/minigames/[minigameId]/history)
```

### 14A.2 Minigames List Page

**Route:** `/rmhbox/minigames`

Displays all registered minigames as responsive cards. Each card shows:

- **Icon** — Lucide icon from the `MinigameDefinition.icon` field
- **Name** — `MinigameDefinition.displayName`
- **Description** — `MinigameDefinition.description`
- **Category badge** — `MinigameDefinition.category` (word / trivia / action / creative)
- **Player range** — `minPlayers–maxPlayers`
- **Two action buttons:**
  - **Leaderboard** — Opens a modal showing the minigame's leaderboard
  - **History** — Navigates to `/rmhbox/minigames/[minigameId]/history`

**Header:** The `RMHboxHeader` back link reads "← Home" and links to `/rmhbox`.

**Data Source:** `getAllMinigames()` from `lib/rmhbox/minigame-registry.ts` — no API call needed, purely client-side registry data.

### 14A.3 Leaderboard Modal

When a user clicks the "Leaderboard" button on a minigame card, a modal overlay appears containing two tabs:

| Tab | API Call | Description |
|---|---|---|
| **All-Time** | `GET /api/rmhbox/leaderboard?minigame={id}&period=all-time` | Global all-time leaderboard for this minigame |
| **Weekly** | `GET /api/rmhbox/leaderboard?minigame={id}&period=weekly` | Top scores achieved within the last 7 days |

**Modal UI:**

```
┌──────────────────────────────────────┐
│  🏆 Rhyme Time Leaderboard     [✕]  │
│  ┌──────────┐ ┌──────────┐          │
│  │ All-Time │ │  Weekly  │          │
│  └──────────┘ └──────────┘          │
│  ┌──────────────────────────────┐   │
│  │ # │ Player     │ Score       │   │
│  │ 1 │ Alice      │ 4,520       │   │
│  │ 2 │ Bob        │ 3,180       │   │
│  │ 3 │ Charlie    │ 2,950       │   │
│  │...│            │             │   │
│  └──────────────────────────────┘   │
│                                      │
│  Your Rank: #7                       │
└──────────────────────────────────────┘
```

**Component:** `MinigameLeaderboardModal.tsx`

```typescript
interface MinigameLeaderboardModalProps {
  minigameId: string;
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
}
```

Reuses the existing `LeaderboardEntry` type and fetches data via the REST API (not WebSocket), since this page doesn't require a socket connection.

### 14A.4 History Viewing Page

**Route:** `/rmhbox/minigames/[minigameId]/history`

Displays a searchable, sortable, and filterable list of all matches for the given minigame that the authenticated user participated in.

**Header:** The `RMHboxHeader` back link reads "← Minigames" and links to `/rmhbox/minigames`.

**Data Source:** `GET /api/rmhbox/history?userId={currentUserId}&minigame={minigameId}&limit=20&offset=0`

**Common Display Fields (all minigames):**

| Field | Source | Description |
|---|---|---|
| Date | `match.startedAt` | Formatted game date/time |
| Duration | `match.durationMs` | Game length |
| Players | `match.playerCount` | Number of participants |
| Winner | `match.players[rank=1].userName` | Winner's name |
| Your Rank | `match.players[userId=me].rank` | User's placement |
| Your Score | `match.players[userId=me].score` | User's final score |

**Sorting Options:**

| Sort Key | Direction | Default |
|---|---|---|
| Date | Newest first / Oldest first | Newest first |
| Score | Highest / Lowest | — |
| Rank | Best / Worst | — |
| Duration | Longest / Shortest | — |

**Search & Filter:**

- **Text search** — Searches across player names and minigame-specific searchable fields
- **Date range filter** — Start/end date pickers
- **Result filter** — Win / Loss / All

Each minigame defines additional filterable and searchable properties via a `HistoryDisplayConfig` interface (see §14A.5).

**Expandable Detail View:**

Each history row can be expanded to show the full game log details. When expanded, the row renders a minigame-specific detail component that processes and displays the `gameLog` data. This detail view is lazy-loaded per minigame.

### 14A.5 Minigame History Display Configuration

Each minigame must define a `HistoryDisplayConfig` that specifies:

1. **How to render its game log** — A React component for the expanded detail view
2. **What properties are searchable** — Fields from the game log that can be text-searched
3. **What properties are filterable** — Fields that can be filtered via dropdowns or ranges

```typescript
interface HistoryDisplayConfig {
  /** Unique minigame ID */
  minigameId: string;

  /** React component that renders the expanded game log detail view */
  DetailComponent: React.ComponentType<HistoryDetailProps>;

  /** Fields from the game log that can be text-searched */
  searchableFields: HistorySearchField[];

  /** Fields that can be filtered via dropdowns or ranges */
  filterableFields: HistoryFilterField[];

  /** Function to extract a one-line summary from a game log */
  getSummary: (gameLog: GameLog) => string;
}

interface HistoryDetailProps {
  gameLog: GameLog;
  currentUserId: string;
  players: Array<{ userId: string; userName: string; rank: number; score: number }>;
}

interface HistorySearchField {
  key: string;
  label: string;
  /** Extractor function: given a gameLog, return all searchable string values */
  extract: (gameLog: GameLog) => string[];
}

interface HistoryFilterField {
  key: string;
  label: string;
  type: 'select' | 'range' | 'boolean';
  /** For 'select': extract available options from a gameLog */
  options?: (gameLog: GameLog) => string[];
  /** For 'range': field path to numeric value */
  valuePath?: string;
}
```

**Registry Pattern:**

```typescript
// lib/rmhbox/history-display-registry.ts
const HISTORY_DISPLAY_REGISTRY: Record<string, HistoryDisplayConfig> = {};

export function registerHistoryDisplay(config: HistoryDisplayConfig): void {
  HISTORY_DISPLAY_REGISTRY[config.minigameId] = config;
}

export function getHistoryDisplay(minigameId: string): HistoryDisplayConfig | null {
  return HISTORY_DISPLAY_REGISTRY[minigameId] ?? null;
}
```

Each minigame registers its history display config in its own module, following the same pattern as the minigame registry.

### 14A.6 Landing Page Integration

Add a "View Minigames" button to the RMHbox landing page (`app/rmhbox/page.tsx`) that navigates to `/rmhbox/minigames`.

**Placement:** Below the Create/Join section, above the Public Lobbies section.

**Button Style:** Full-width secondary action with a Gamepad2 icon, matching the existing card styling.

### 14A.7 Navigation & Header Backlinks

The header backlink hierarchy:

| Page | Back Link Text | Links To |
|---|---|---|
| Landing (`/rmhbox`) | `← Games` | `/games` |
| Minigames List (`/rmhbox/minigames`) | `← Home` | `/rmhbox` |
| History View (`/rmhbox/minigames/[id]/history`) | `← Minigames` | `/rmhbox/minigames` |
| Lobby (`/rmhbox/[lobbyId]`) | Settings/Host Controls | — |

---

## 15. Match-End Lifecycle & Persistence

### 15.1 Flow

When a minigame's `computeResults()` is called:

```
Game ends
  → computeResults() returns MinigameResults
  → GameCoordinator receives results
  → Transition lobby state to ROUND_RESULTS
  → Broadcast rmhbox:game:round_results (immediate, sync)
  → Fire async persistMatchResults() (non-blocking)
  → Start results display timer (10 seconds)
  → After timer: transition back to WAITING
```

### 15.2 Async Persistence

The database write is **fully asynchronous** and does not block the WebSocket event loop:

```typescript
// server/rmhbox/leaderboard.ts

import { prisma } from '@/lib/prisma';

export async function persistMatchResults(
  lobbyId: string,
  minigameId: string,
  results: MinigameResults,
  players: Map<string, RMHboxPlayer>,
  gameLog: GameLog | null,
): Promise<void> {
  try {
    const startedAt = new Date(/* tracked from game start */);
    const endedAt = new Date();
    
    // 1. Create the match record
    const match = await prisma.rMHboxMatch.create({
      data: {
        minigameId,
        lobbyId,
        startedAt,
        endedAt,
        durationMs: results.duration,
        winnerUserId: results.rankings[0]?.userId ?? null,
        playerCount: results.rankings.length,
        gameLog: gameLog ? JSON.parse(JSON.stringify(gameLog)) : null,
        results: JSON.parse(JSON.stringify(results.rankings)),
      },
    });
    
    // 2. Upsert player profiles and create match-player records
    for (const ranking of results.rankings) {
      // Upsert RMHboxProfile
      const profile = await prisma.rMHboxProfile.upsert({
        where: { userId: ranking.userId },
        create: {
          userId: ranking.userId,
          totalGamesPlayed: 1,
          totalWins: ranking.rank === 1 ? 1 : 0,
          totalScore: ranking.score,
          totalPlayTimeMs: results.duration,
          currentWinStreak: ranking.rank === 1 ? 1 : 0,
          bestWinStreak: ranking.rank === 1 ? 1 : 0,
          minigameStats: JSON.stringify({
            [minigameId]: buildMinigameStats(ranking, results),
          }),
        },
        update: {
          totalGamesPlayed: { increment: 1 },
          totalWins: { increment: ranking.rank === 1 ? 1 : 0 },
          totalScore: { increment: ranking.score },
          totalPlayTimeMs: { increment: results.duration },
          currentWinStreak: ranking.rank === 1 
            ? { increment: 1 }
            : 0, // Note: Prisma won't allow inline conditional reset here;
                  //   use a raw query or read-modify-write for streak logic
          // minigameStats: handled via read-modify-write below
        },
      });
      
      // Update minigameStats (read-modify-write for nested JSON)
      const existingStats: MinigameStatsMap = 
        (typeof profile.minigameStats === 'object' && profile.minigameStats !== null)
          ? profile.minigameStats as MinigameStatsMap
          : {};
      const gameStats = existingStats[minigameId] || {
        gamesPlayed: 0, wins: 0, bestScore: 0, totalScore: 0, averageRank: 0,
      };
      gameStats.gamesPlayed += 1;
      gameStats.wins += ranking.rank === 1 ? 1 : 0;
      gameStats.bestScore = Math.max(gameStats.bestScore, ranking.score);
      gameStats.totalScore += ranking.score;
      gameStats.averageRank = 
        (gameStats.averageRank * (gameStats.gamesPlayed - 1) + ranking.rank) / gameStats.gamesPlayed;
      
      // Merge game-specific stats from ranking.deltas
      for (const [key, value] of Object.entries(ranking.deltas)) {
        gameStats[key] = (gameStats[key] ?? 0) + value;
      }
      
      existingStats[minigameId] = gameStats;
      
      await prisma.rMHboxProfile.update({
        where: { userId: ranking.userId },
        data: { minigameStats: existingStats },
      });
      
      // Update win streak (needs read-modify-write for conditional reset)
      if (ranking.rank === 1) {
        await prisma.rMHboxProfile.update({
          where: { userId: ranking.userId },
          data: {
            currentWinStreak: { increment: 1 },
            bestWinStreak: Math.max(profile.bestWinStreak, profile.currentWinStreak + 1),
          },
        });
      } else {
        await prisma.rMHboxProfile.update({
          where: { userId: ranking.userId },
          data: { currentWinStreak: 0 },
        });
      }
      
      // 3. Create match-player record
      await prisma.rMHboxMatchPlayer.create({
        data: {
          matchId: match.id,
          profileId: profile.id,
          userId: ranking.userId,
          userName: ranking.userName,
          rank: ranking.rank,
          score: ranking.score,
          wasWinner: ranking.rank === 1,
          stats: ranking.deltas,
        },
      });
    }
    
    console.log(`[RMHbox] Match ${match.id} persisted (${minigameId}, ${results.rankings.length} players)`);
  } catch (error) {
    // Log error but DO NOT throw — this must not crash the socket server
    console.error('[RMHbox] Failed to persist match results:', error);
    // TODO: Queue for retry or write to a dead-letter log
  }
}
```

### 15.3 Key Design Decisions

- **Fire-and-forget:** `persistMatchResults` is called with `.catch()` but NOT `await`ed in the main game loop. The results are already broadcast to players; persistence is best-effort.
- **Idempotency:** The `@@unique([matchId, userId])` constraint on `RMHboxMatchPlayer` prevents duplicate entries if a retry mechanism is added later.
- **Batch operations:** For lobbies with many players, a `prisma.$transaction` could wrap the batch of writes. However, since each match has at most 16 players, sequential writes are acceptable.
- **Streak calculation:** Win streaks are maintained via read-modify-write. A future optimization could use a SQL `CASE WHEN` in a raw query.

---

## 16. Error Handling & Fault Isolation

### 16.1 Architecture: Isolated Game Sandboxes

Each minigame runs inside a try-catch boundary. Errors in one game NEVER propagate to:
- The Socket.io server process
- Other lobbies
- The lobby manager itself

```typescript
// server/rmhbox/game-coordinator.ts

class GameCoordinator {
  startGame(lobby: RMHboxLobby, minigameId: string): void {
    const MinigameClass = MINIGAME_SERVER_REGISTRY[minigameId];
    if (!MinigameClass) {
      this.lobbyManager.broadcastAction(lobby.id, {
        type: 'ERROR',
        payload: { message: 'Unknown minigame' },
      });
      return;
    }

    const context: MinigameContext = {
      lobbyId: lobby.id,
      players: new Map(lobby.players), // snapshot
      settings: lobby.settings,
      nsp: this.nsp,
      broadcastToLobby: (event, data) => this.nsp.to(`lobby:${lobby.id}`).emit(event, data),
      broadcastToPlayers: (event, data) => this.nsp.to(`lobby:${lobby.id}:players`).emit(event, data),
      sendToPlayer: (userId, event, data) => this.nsp.to(`lobby:${lobby.id}:player:${userId}`).emit(event, data),
      sendToSpectators: (event, data) => this.nsp.to(`lobby:${lobby.id}:spectators`).emit(event, data),
      onComplete: (results) => this.handleGameComplete(lobby.id, results),
      onError: (error) => this.handleGameError(lobby.id, error),
    };

    try {
      const game = new MinigameClass(context);
      lobby.currentGame = {
        minigameId,
        handler: game,
        startedAt: Date.now(),
      };
      game.start();
    } catch (error) {
      this.handleGameError(lobby.id, error as Error);
    }
  }

  handleGameError(lobbyId: string, error: Error): void {
    console.error(`[RMHbox] Game error in lobby ${lobbyId}:`, error);
    
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby) return;
    
    // Clean up the broken game
    if (lobby.currentGame) {
      try { lobby.currentGame.handler.cleanup(); } catch { /* swallow */ }
      lobby.currentGame = null;
    }
    
    // Return lobby to WAITING state
    lobby.state = 'WAITING';
    
    // Notify players
    this.lobbyManager.broadcastAction(lobbyId, {
      type: 'STATE_CHANGED',
      payload: { 
        newState: 'WAITING',
        reason: 'GAME_ERROR',
        message: 'The game encountered an error and was ended. Sorry about that!',
      },
    });
    
    // System chat
    this.lobbyManager.addSystemChat(lobbyId, 'Game ended due to an error. Returning to lobby.');
  }
}
```

### 16.2 Input Validation

All WebSocket payloads are validated using Zod schemas before processing:

```typescript
// server/rmhbox/schemas.ts
import { z } from 'zod';

export const JoinLobbySchema = z.object({
  lobbyId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+$/),
  asSpectator: z.boolean().optional().default(false),
});

export const CastVoteSchema = z.object({
  lobbyId: z.string().min(1).max(64),
  minigameId: z.string().min(1).max(64),
});

export const GameInputSchema = z.object({
  lobbyId: z.string().min(1).max(64),
  action: z.string().min(1).max(128),
  data: z.unknown(), // game-specific; validated by the minigame handler
});

// ... schemas for all other events
```

Validation wrapper:

```typescript
function validated<T>(schema: z.ZodSchema<T>, handler: (socket: Socket, data: T) => void) {
  return (socket: Socket, rawPayload: unknown) => {
    const result = schema.safeParse(rawPayload);
    if (!result.success) {
      socket.emit('rmhbox:error', {
        code: 'INVALID_PAYLOAD',
        message: result.error.issues[0]?.message || 'Invalid input',
      });
      return;
    }
    try {
      handler(socket, result.data);
    } catch (error) {
      console.error('[RMHbox] Unhandled handler error:', error);
      socket.emit('rmhbox:error', {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      });
    }
  };
}

// Usage:
socket.on('rmhbox:lobby:join', validated(JoinLobbySchema, (socket, data) => {
  lobbyManager.joinLobby(socket, data);
}));
```

### 16.3 Error Event Protocol

**Server → Client:** `rmhbox:error`

```typescript
interface RMHboxError {
  code: RMHboxErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type RMHboxErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'DUPLICATE_SESSION'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'LOBBY_IN_GAME'
  | 'NOT_HOST'
  | 'NOT_IN_LOBBY'
  | 'ALREADY_IN_LOBBY'
  | 'INVALID_PAYLOAD'
  | 'INVALID_GAME'
  | 'INSUFFICIENT_PLAYERS'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';
```

### 16.4 Server-Side Rate Limiting (WebSocket)

To prevent spam / abuse, the server tracks per-socket event rates:

```typescript
// Per-socket rate limits
const SOCKET_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'rmhbox:lobby:create': { max: 5, windowMs: 60_000 },
  'rmhbox:lobby:join': { max: 10, windowMs: 60_000 },
  'rmhbox:lobby:chat': { max: 20, windowMs: 60_000 },   // 1 msg per 3 sec
  'rmhbox:game:input': { max: 100, windowMs: 10_000 },   // 10/sec for action games
  'rmhbox:game:cast_vote': { max: 10, windowMs: 60_000 },
  'rmhbox:leaderboard:fetch': { max: 5, windowMs: 60_000 },
};
```

---

## 17. Anti-Cheat Considerations

### 17.1 Principles

1. **The server is the authority.** Clients never compute scores, determine winners, or validate game rules. They submit raw inputs; the server calculates outcomes.
2. **Information hiding.** Clients only receive information they're entitled to see. Hidden roles, secret words, other players' unsubmitted answers are NEVER sent to unentitled clients.
3. **Input validation.** All inputs are bounds-checked (e.g., position coordinates clamped, answer lengths limited, timing verified).
4. **Replay detection.** Sequence numbers on actions prevent replaying old events. Timestamps are server-generated, not client-supplied.

### 17.2 Per-Game Anti-Cheat

| Concern | Mitigation |
|---|---|
| Rhyme Time: dictionary manipulation | Rhyming validation is server-side only; clients never receive the dictionary |
| Undercover Agent: key card exposure | Key card data is sent only to spymaster sockets, never to operative rooms |
| Identity Crisis: identity leak | A player's own identity is excluded from their state snapshot |
| Fact or Friction: answer data | Correct answer is never sent until after all responses are in |
| Wiki-Race: direct URL navigation | Server tracks page transitions and validates they follow actual Wikipedia links |
| Pixel Pushers / Cursor Curling: speed hacks | Server-side physics simulation; client positions are cosmetic suggestions only |
| Undercover Editor: editor identity | Editor role is private to that player; other players see no indication |
| Drawing games: programmatic drawing | Stroke data is validated for humanistic patterns (min duration between strokes, max precision) |

---

## 18. UI/UX Design Language

### 18.1 Design Principles

- **Mobile-first.** All layouts use flexbox/grid with mobile breakpoints as the base. Desktop adds supplementary panels (chat, leaderboard sidebars).
- **Minimalist but playful.** Clean white/dark backgrounds, rounded corners, soft shadows, subtle animations. Cutesy touches via emoji, confetti, bouncy transitions.
- **Consistent across minigames.** Shared UI shell: header bar, player list, timer, score. Game content fills the center viewport.
- **Accessible.** Minimum touch targets of 44×44px. High contrast text. Readable fonts at mobile sizes.

### 18.2 Color Palette

```css
/* CSS custom properties */
--rmhbox-bg: #0f0f1a;           /* deep navy background */
--rmhbox-surface: #1a1a2e;      /* card/panel background */
--rmhbox-surface-hover: #252540;
--rmhbox-border: #2a2a4a;
--rmhbox-text: #e0e0f0;         /* primary text */
--rmhbox-text-muted: #8888aa;   /* secondary text */
--rmhbox-accent: #7c5cfc;       /* primary purple accent */
--rmhbox-accent-hover: #9b7eff;
--rmhbox-success: #4ade80;      /* green for correct/ready */
--rmhbox-danger: #f87171;       /* red for wrong/eliminated */
--rmhbox-warning: #fbbf24;      /* yellow for caution */
--rmhbox-info: #60a5fa;         /* blue for info */
```

### 18.3 Typography

```css
--rmhbox-font-display: 'Nunito', 'Segoe UI', sans-serif;  /* headings, titles */
--rmhbox-font-body: 'Inter', 'Segoe UI', sans-serif;      /* body text */
--rmhbox-font-mono: 'JetBrains Mono', monospace;           /* room codes, scores */
```

> Nunito provides the "cutesy" rounded feel. Inter provides clean readability for body text. Both are Google Fonts with excellent mobile rendering.

### 18.4 Component Design Tokens

```css
--rmhbox-radius-sm: 8px;
--rmhbox-radius-md: 12px;
--rmhbox-radius-lg: 16px;
--rmhbox-radius-full: 9999px;

--rmhbox-spacing-xs: 4px;
--rmhbox-spacing-sm: 8px;
--rmhbox-spacing-md: 16px;
--rmhbox-spacing-lg: 24px;
--rmhbox-spacing-xl: 32px;
```

### 18.5 Shared UI Shell (In-Game)

Every minigame renders inside a common layout wrapper:

```
┌──────────────────────────────────────┐
│ Header: [Game Name] [Timer] [Round]  │  ← Fixed top bar
├──────────────────────────────────────┤
│                                      │
│            Game Content              │  ← Minigame viewport (scrollable if needed)
│         (minigame-specific)          │
│                                      │
├──────────────────────────────────────┤
│ Footer: [Score: 1250] [Players: 6]   │  ← Fixed bottom bar (mobile)
└──────────────────────────────────────┘

Desktop adds:
┌──────────┬───────────────────┬──────────┐
│ Players  │   Game Content    │   Chat   │
│  List    │                   │ Overlay  │
└──────────┴───────────────────┴──────────┘
```

### 18.6 Animations

- **Page transitions:** Framer Motion `AnimatePresence` with fade + slide.
- **Score changes:** Number rolls up/down with spring animation.
- **Ready button:** Pulse animation when not ready, solid green when ready.
- **Timer:** Countdown ring animation (SVG circle `stroke-dashoffset`).
- **Results:** Staggered entrance animations for rankings, confetti for winner.
- **State transitions:** Smooth crossfade between lobby states.

### 18.7 Sound Design

Minimal sound palette using Howler.js:

| Sound | Trigger |
|---|---|
| Soft chime | Player joins lobby |
| Click | Button press |
| Countdown beeps (3-2-1) | Countdown phase |
| Go! fanfare | Game start |
| Score ding | Points awarded |
| Buzzer | Wrong answer / elimination |
| Victory fanfare | Round complete |
| Swoosh | Phase transitions |

All sounds are optional and respect a user volume setting persisted in Zustand.

---

## 19. Client-Side Architecture

### 19.1 Zustand Store

```typescript
// lib/rmhbox/store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RMHboxStore {
  // Connection state
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Lobby state (from server)
  lobby: ClientLobbyState | null;
  
  // Game state (from server, minigame-specific)
  gameState: Record<string, unknown>;
  
  // Sync tracking
  lastSeq: number;
  
  // Local settings (persisted)
  settings: RMHboxUserSettings;
  
  // Actions
  setConnectionStatus: (status: RMHboxStore['connectionStatus']) => void;
  applyAction: (action: GameAction) => void;
  applyFullSync: (state: ClientLobbyState) => void;
  setGameState: (state: Record<string, unknown>) => void;
  updateSettings: (settings: Partial<RMHboxUserSettings>) => void;
  reset: () => void;
}

interface RMHboxUserSettings {
  masterVolume: number;     // 0–1
  sfxVolume: number;        // 0–1
  musicVolume: number;      // 0–1
  showChat: boolean;
  chatPosition: 'left' | 'right';
}

export const useRMHboxStore = create<RMHboxStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      lobby: null,
      gameState: {},
      lastSeq: 0,
      settings: {
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.5,
        showChat: true,
        chatPosition: 'right',
      },
      
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      
      applyAction: (action) => {
        const { lastSeq } = get();
        if (action.seq <= lastSeq) return;
        set((state) => ({
          lobby: applyLobbyAction(state.lobby, action),
          gameState: applyGameAction(state.gameState, action),
          lastSeq: action.seq,
        }));
      },
      
      applyFullSync: (fullState) => {
        set({ lobby: fullState, lastSeq: fullState.seq });
        // If the lobby has a pre-selected game and is WAITING, reinitialize
        // gameSettingsState so the settings button appears (e.g. after force-end).
        if (fullState.selectedGame && fullState.state === 'WAITING') {
          const { minigameId, displayName } = fullState.selectedGame;
          // ... load settingsSchema from MINIGAME_REGISTRY, set gameSettingsState
        }
      },
      
      setGameState: (gameState) => set({ gameState }),
      
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      
      reset: () => set({ lobby: null, gameState: {}, lastSeq: 0, connectionStatus: 'disconnected' }),
    }),
    {
      name: 'rmhbox-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
```

### 19.2 Socket Client Wrapper

```typescript
// lib/rmhbox/socket.ts

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRMHboxStore } from './store';
import { addToast } from '@/lib/store/toast-store';

let socket: Socket | null = null;

/**
 * Connect to the standalone RMHbox WebSocket server.
 *
 * In production, the client connects to `https://rmhstudios.com` and
 * reverse-proxy maps the `/rmhbox/` path to localhost:7676.
 *
 * In development, the client connects directly to `http://localhost:7676`.
 *
 * The `NEXT_PUBLIC_RMHBOX_SOCKET_URL` env var controls the base URL.
 * The `path: '/rmhbox/'` must match the server's `config.SOCKET_PATH`.
 *
 * Authentication uses a dynamic `auth` callback that refreshes the session
 * token on every reconnect attempt, ensuring tokens don't expire during
 * long sessions.
 */
export async function connectToRMHbox(): Promise<Socket> {
  if (socket?.connected) return socket;
  
  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) throw new Error('Not authenticated');
  
  const store = useRMHboxStore.getState();
  store.setConnectionStatus('connecting');
  
  socket = io(
    process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676',
    {
      path: '/rmhbox/',
      auth: async (cb) => {
        // Dynamic auth: re-fetch token on each reconnect to prevent expiration
        const s = await authClient.getSession();
        cb({ token: s?.data?.session?.token ?? token });
      },
      reconnection: true,
      reconnectionAttempts: Infinity,    // never stop trying
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    }
  );
  
  socket.on('connect', () => {
    store.setConnectionStatus('connected');
  });
  
  socket.on('disconnect', (reason) => {
    store.setConnectionStatus(reason === 'io server disconnect' ? 'error' : 'connecting');
  });
  
  socket.on('connect_error', () => {
    // Handled by infinite reconnection; no max-attempts cutoff
  });
  
  // Global listeners
  socket.on('rmhbox:lobby:state_snapshot', (data) => {
    store.applyFullSync(data);
  });
  
  socket.on('rmhbox:game:action', (data) => {
    store.applyAction(data);
  });
  
  socket.on('rmhbox:game:state_snapshot', (data) => {
    store.setGameState(data);
  });
  
  socket.on('rmhbox:lobby:not_in_lobby', () => {
    // Server says we're not in any lobby (e.g., lobby disbanded while disconnected)
    store.leaveLobby();
  });
  
  socket.on('rmhbox:error', (data) => {
    addToast({ type: 'error', message: data.message ?? 'An error occurred' });
  });
  
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectFromRMHbox(): void {
  socket?.disconnect();
  socket = null;
  useRMHboxStore.getState().reset();
}
```

### 19.3 Minigame Component Loader

`MinigameRenderer` dynamically lazy-loads minigame components and provides two hooks
that minigame components use to drive the shared header timer ring and the footer
round counter. These write directly to the Zustand store, so both `RMHboxHeader`
and `GameShell` react automatically.

#### Hooks

```typescript
// useHeaderTimer — controls the header timer ring
const { startTimer, tickTimer, clearTimer } = useHeaderTimer();
startTimer(total, remaining?); // start a new timed phase
tickTimer(remaining);          // update remaining seconds
clearTimer();                  // hide the timer ring
// Auto-clears on component unmount.

// useMinigameRound — controls the footer round counter
const { setRound, clearRound } = useMinigameRound();
setRound(current, total);      // show "Round X/Y" in footer
clearRound();                  // revert to session-level round
// Auto-clears on component unmount.
```

> **Note:** Most minigames do NOT need to call these hooks directly because the
> server-side `startPhaseTimer()` and `broadcastRound()` helpers emit sequenced
> `TIMER_START`, `TIMER_TICK`, and `MINIGAME_ROUND` actions that the Zustand store
> processes automatically via `applyLobbyAction`. The hooks exist for client-side
> overrides when needed.

#### Store Fields

| Field | Type | Description |
|---|---|---|
| `timerInfo` | `TimerInfo \| null` | `{ total, remaining, paused, infinite, showSkip }` — set by `TIMER_START`, updated by `TIMER_TICK`, paused by `TIMER_PAUSED`, read by `RMHboxHeader`. |
| `minigameRound` | `MinigameRoundInfo \| null` | `{ current, total }` — set by `MINIGAME_ROUND`, read by `GameShell`. When `null`, the footer round counter is hidden entirely (used by single-round minigames that never call `broadcastRound`). |

#### Component Loader

```typescript
// components/rmhbox/minigames/MinigameRenderer.tsx

'use client';

import { lazy, Suspense } from 'react';
import { useRMHboxStore } from '@/lib/rmhbox/store';

const MINIGAME_COMPONENTS: Record<string, React.LazyExoticComponent<React.FC>> = {
  'rhyme-time': lazy(() => import('./rhyme-time/RhymeTimeGame')),
  'undercover-agent': lazy(() => import('./undercover-agent/UndercoverAgentGame')),
  'emoji-cinema': lazy(() => import('./emoji-cinema/EmojiCinemaGame')),
  'identity-crisis': lazy(() => import('./identity-crisis/IdentityCrisisGame')),
  'fact-or-friction': lazy(() => import('./fact-or-friction/FactOrFrictionGame')),
  'wiki-race': lazy(() => import('./wiki-race/WikiRaceGame')),
  'sequence-sam': lazy(() => import('./sequence-sam/SequenceSamGame')),
  'category-crash': lazy(() => import('./category-crash/CategoryCrashGame')),
  'pixel-pushers': lazy(() => import('./pixel-pushers/PixelPushersGame')),
  'human-keyboard': lazy(() => import('./human-keyboard/HumanKeyboardGame')),
  'cursor-curling': lazy(() => import('./cursor-curling/CursorCurlingGame')),
  'scroll-soul': lazy(() => import('./scroll-soul/ScrollSoulGame')),
  'human-tetris': lazy(() => import('./human-tetris/HumanTetrisGame')),
  'undercover-editor': lazy(() => import('./undercover-editor/UndercoverEditorGame')),
  'minimalist-masterpiece': lazy(() => import('./minimalist-masterpiece/MinimalistMasterpieceGame')),
  'ranking-file': lazy(() => import('./ranking-file/RankingFileGame')),
};

export function MinigameRenderer() {
  const currentGame = useRMHboxStore((s) => s.lobby?.currentGame);

  if (!currentGame) return null;

  const Component = MINIGAME_COMPONENTS[currentGame.minigameId];
  if (!Component) return <div className="text-rmhbox-danger">Unknown minigame</div>;

  return (
    <Suspense fallback={<MinigameLoadingFallback />}>
      <Component />
    </Suspense>
  );
}

function MinigameLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-rmhbox-text-muted">Loading game...</div>
    </div>
  );
}
```

---

## 20. Type Definitions (Complete)

All shared types are in `lib/rmhbox/types.ts`. Server-only types extend these in `server/rmhbox/types.ts`.

```typescript
// lib/rmhbox/types.ts — Shared between client and server

// ─── Lobby ───

export type LobbyState =
  | 'WAITING'
  | 'VOTING'
  | 'INSTRUCTIONS'
  | 'PRELOADING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'ROUND_RESULTS'
  | 'SESSION_RESULTS'
  | 'DISBANDED';

export interface LobbySettings {
  isPublic: boolean;
  maxPlayers: number;
  maxSpectators: number;
  allowMidGameJoin: boolean;
  allowSpectatorPromotion: boolean;
  autoStartThreshold: number | null;
  gameDurationOverride: number | null;
}

export interface ClientLobbyState {
  lobbyId: string;
  hostUserId: string;
  state: LobbyState;
  settings: LobbySettings;
  players: ClientPlayerInfo[];
  spectators: ClientSpectatorInfo[];
  currentGame: ClientGameInfo | null;
  roundNumber: number;
  chat: ChatMessage[];
  myRole: 'player' | 'spectator';
  myUserId: string;
  seq: number;
  matchHistory: MatchSummary[];
}

export interface ClientPlayerInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isReady: boolean;
  score: number;
  roundScore: number;
  isHost: boolean;
}

export interface ClientSpectatorInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
}

export interface ClientGameInfo {
  minigameId: string;
  displayName: string;
  phase: 'instructions' | 'preloading' | 'countdown' | 'playing' | 'results';
  timeRemaining: number | null;
  publicState: Record<string, unknown>;
  privateState: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
  type: 'user' | 'system';
}

// ─── Game Actions ───

export interface GameAction {
  type: string;
  payload: unknown;
  seq: number;
  timestamp: number;
}

// ─── Results ───

export interface PlayerRanking {
  userId: string;
  userName: string;
  score: number;
  rank: number;
  deltas: Record<string, number>;
}

export interface Award {
  userId: string;
  title: string;
  description: string;
  icon: string;
}

export interface SessionStanding {
  userId: string;
  userName: string;
  totalScore: number;
  wins: number;
  rank: number;
}

export interface RoundResultsPayload {
  minigameId: string;
  rankings: PlayerRanking[];
  awards: Award[];
  roundNumber: number;
  sessionStandings: SessionStanding[];
}

export interface MatchSummary {
  matchId: string;
  minigameId: string;
  minigameDisplayName: string;
  playerCount: number;
  winnerUserName: string | null;
  rankings: Array<{ userId: string; userName: string; rank: number; score: number }>;
  durationMs: number;
  playedAt: number;
}

// ─── Minigame Registry ───

export type MinigameCategory = 'word' | 'trivia' | 'action' | 'creative';

export type JoinInProgressPolicy =
  | 'spectate_only'
  | 'join_next_subround'
  | 'join_immediately';

export interface PreloadManifest {
  images: string[];
  sounds: string[];
  data: string[];
  estimatedSizeBytes: number;
}

export interface ControlHint {
  platform: 'mobile' | 'desktop' | 'all';
  action: string;
  description: string;
}

export interface MinigameDefinition {
  id: string;
  displayName: string;
  description: string;
  category: MinigameCategory;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationSeconds: number;
  supportsTeams: boolean;
  instructionDurationSeconds: number;
  preloadAssets: PreloadManifest;
  joinInProgressPolicy: JoinInProgressPolicy;
  tags: string[];
}

// ─── Voting ───

export interface VoteCandidate {
  minigameId: string;
  displayName: string;
  description: string;
  category: MinigameCategory;
  icon: string;
  playerRange: string;
}

export interface VoteStartedPayload {
  candidates: VoteCandidate[];
  durationSeconds: number;
  endsAt: number;
}

export interface VoteCastPayload {
  userId: string;
  tallies: Record<string, number>;
  totalVoters: number;
  totalPlayers: number;
}

export interface VoteResultPayload {
  winnerId: string;
  winnerName: string;
  tallies: Record<string, number>;
  wasUnanimous: boolean;
}

// ─── Leaderboard ───

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  value: number;
  gamesPlayed: number;
  wins: number;
}

// ─── Errors ───

export type RMHboxErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'DUPLICATE_SESSION'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'LOBBY_IN_GAME'
  | 'NOT_HOST'
  | 'NOT_IN_LOBBY'
  | 'ALREADY_IN_LOBBY'
  | 'INVALID_PAYLOAD'
  | 'INVALID_GAME'
  | 'INSUFFICIENT_PLAYERS'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

export interface RMHboxError {
  code: RMHboxErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

---

## 21. WebSocket Event Catalog (Complete)

### 21.1 Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `rmhbox:lobby:create` | `{ settings?: Partial<LobbySettings> }` | Create a new lobby |
| `rmhbox:lobby:join` | `{ lobbyId: string, asSpectator?: boolean }` | Join an existing lobby |
| `rmhbox:lobby:leave` | `{ lobbyId: string }` | Leave the current lobby |
| `rmhbox:lobby:kick` | `{ lobbyId: string, targetUserId: string }` | [Host] Kick a player |
| `rmhbox:lobby:transfer_host` | `{ lobbyId: string, targetUserId: string }` | [Host] Transfer host role |
| `rmhbox:lobby:update_settings` | `{ lobbyId: string, settings: Partial<LobbySettings> }` | [Host] Update lobby settings |
| `rmhbox:lobby:end_session` | `{ lobbyId: string }` | [Host] End the session |
| `rmhbox:lobby:toggle_ready` | `{ lobbyId: string }` | Toggle ready status |
| `rmhbox:lobby:request_promotion` | `{ lobbyId: string }` | [Spectator] Request to become a player |
| `rmhbox:lobby:promote_spectator` | `{ lobbyId: string, targetUserId: string }` | [Host] Promote a spectator to player |
| `rmhbox:lobby:chat` | `{ lobbyId: string, content: string }` | Send a chat message |
| `rmhbox:lobby:browse` | `{ cursor?: string, limit?: number }` | Browse public lobbies |
| `rmhbox:game:pick` | `{ lobbyId: string, minigameId: string }` | [Host] Pre-select a game (visible in lobby) |
| `rmhbox:game:select` | `{ lobbyId: string, minigameId: string }` | [Host] Directly select and start a minigame |
| `rmhbox:game:start_vote` | `{ lobbyId: string }` | [Host] Start a minigame vote |
| `rmhbox:game:cast_vote` | `{ lobbyId: string, minigameId: string }` | Cast a vote for a minigame |
| `rmhbox:game:force_skip` | `{ lobbyId: string }` | [Host] Skip/advance current phase |
| `rmhbox:game:force_end` | `{ lobbyId: string }` | [Host] Force-end the game, return to WAITING |
| `rmhbox:game:pause_timer` | `{ lobbyId: string }` | [Host] Toggle pause on current timer |
| `rmhbox:game:ready_to_render` | `{ lobbyId: string }` | Signal that local preloading is complete |
| `rmhbox:game:input` | `{ lobbyId: string, action: string, data: unknown }` | Submit a game input/action |
| `rmhbox:leaderboard:fetch` | `{ period: string, minigame?: string, limit?: number }` | Fetch leaderboard data |

### 21.2 Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `rmhbox:lobby:created` | `{ lobbyId: string, lobby: ClientLobbyState }` | Lobby created successfully |
| `rmhbox:lobby:state_snapshot` | `ClientLobbyState` | Full state sync (heartbeat, reconnect, join) |
| `rmhbox:lobby:browse_result` | `{ lobbies: PublicLobbyInfo[], nextCursor: string \| null }` | Public lobby list |
| `rmhbox:lobby:kicked` | `{ reason: string }` | You were kicked from the lobby |
| `rmhbox:lobby:disbanded` | `{ reason: string }` | The lobby was disbanded |
| `rmhbox:game:action` | `GameAction` | State delta broadcast |
| `rmhbox:game:instructions` | `InstructionsPayload` | Minigame instructions |
| `rmhbox:game:preload_start` | `{ manifest: PreloadManifest }` | Start preloading assets |
| `rmhbox:game:preload_progress` | `PreloadProgressPayload` | Preload status for all players |
| `rmhbox:game:countdown` | `{ seconds: number }` | Countdown before gameplay |
| `rmhbox:game:started` | `{ minigameId: string }` | Gameplay has begun |
| `rmhbox:game:state_snapshot` | `Record<string, unknown>` | Full game state (reconnection/heartbeat) |
| `rmhbox:game:round_results` | `RoundResultsPayload` | Round completion results |
| `rmhbox:game:session_results` | `{ standings: SessionStanding[], matchHistory: MatchSummary[] }` | Session-end cumulative results |
| `rmhbox:game:vote_started` | `VoteStartedPayload` | Minigame vote has begun |
| `rmhbox:game:vote_update` | `VoteCastPayload` | Vote tally updated |
| `rmhbox:game:vote_result` | `VoteResultPayload` | Vote completed |
| `rmhbox:leaderboard:data` | `{ entries: LeaderboardEntry[], period: string }` | Leaderboard data response |
| `rmhbox:lobby:not_in_lobby` | `{}` | Client is not in any lobby (e.g., lobby disbanded while disconnected) |
| `rmhbox:error` | `RMHboxError` | Error notification |

---

## 22. Server Tick & Timers

### 22.1 Heartbeat

A global interval runs every **10 seconds** (`HEARTBEAT_INTERVAL_MS = 10_000`):

```typescript
setInterval(() => {
  for (const [lobbyId, lobby] of lobbies) {
    if (lobby.state === 'PLAYING') {
      for (const [userId, player] of lobby.players) {
        if (player.isConnected && player.socketId) {
          const clientState = buildClientState(lobby, userId);
          io.to(`lobby:${lobbyId}:player:${userId}`).emit('rmhbox:lobby:state_snapshot', clientState);
        }
      }
      // Spectators get the spectator view
      for (const [userId, spectator] of lobby.spectators) {
        if (spectator.isConnected && spectator.socketId) {
          const clientState = buildClientState(lobby, userId);
          io.to(`lobby:${lobbyId}:player:${userId}`).emit('rmhbox:lobby:state_snapshot', clientState);
        }
      }
    }
  }
}, HEARTBEAT_INTERVAL_MS);
```

> **Note:** `io` here refers to the standalone RMHbox `Server` instance, not a namespace. In the actual codebase, this logic is encapsulated in the `StateSyncService` class (see `server/rmhbox/state-sync.ts`).

### 22.2 Game Timers

Each minigame manages its own timers via the `BaseMinigame.setTimeout` and `BaseMinigame.setInterval` helpers, which:
- Are tracked for cleanup on game end / error.
- Are wrapped in try-catch to prevent unhandled exceptions.
- Use server-side `Date.now()` for all timing (not client clocks).

Additionally, `BaseMinigame` provides two high-level helpers:

- **`startPhaseTimer(durationSeconds)`** — Emits `TIMER_START` (via `broadcastAction`),
  then emits `TIMER_TICK` every second. Automatically cancels any previous phase timer.
- **`clearPhaseTimer()`** — Stops the current phase timer interval.
- **`broadcastRound(current, total)`** — Emits `MINIGAME_ROUND` to update the footer
  sub-round counter (e.g. "Round 2/3").

Minigame handlers use `context.broadcastAction(...)` (routed through `LobbyManager.broadcastAction`)
to ensure timer actions are properly sequenced with `seq` and `timestamp`.

### 22.3 Timer Synchronization

The server sends a two-stage timer protocol for each timed phase:

1. **`TIMER_START`** — emitted once at the beginning of the phase. Carries both
   `totalDuration` (the full-circle baseline) and `timeRemaining` (initial seconds).
   The client store sets `timerInfo = { total, remaining }` which the header
   timer ring reads to compute `stroke-dashoffset`.
2. **`TIMER_TICK`** — emitted every 1 second thereafter. Carries only
   `timeRemaining`. The client store updates `timerInfo.remaining`.

```typescript
// Server sends TIMER_START at the beginning of each timed phase:
broadcastAction(lobbyId, {
  type: 'TIMER_START',
  payload: { totalDuration: durationSeconds, timeRemaining: durationSeconds },
});

// Then TIMER_TICK every 1 second:
broadcastAction(lobbyId, {
  type: 'TIMER_TICK',
  payload: { timeRemaining: remaining },
});
```

Clients display a local countdown using `requestAnimationFrame` between ticks
for smooth UI, but correct to the server's value whenever a tick arrives.

---

## 23. Configuration & Constants

```typescript
// lib/rmhbox/constants.ts

// ─── Lobby ───
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ABSOLUTE_MAX_PLAYERS = 16;
export const DEFAULT_MAX_SPECTATORS = 20;
export const MAX_SPECTATORS = 50;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LENGTH = 100;

// ─── Timers ───
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const LOBBY_IDLE_TIMEOUT_MS = 15 * 60 * 1000;       // 15 min
export const LOBBY_ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min
export const LOBBY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000;       // 2 min
export const DISCONNECT_GRACE_PERIOD_MS = 120_000;          // 2 min
export const VOTE_DURATION_SECONDS = 30;
export const DEFAULT_INSTRUCTION_DURATION_SECONDS = 15;
export const PRELOAD_TIMEOUT_MS = 30_000;                   // 30 sec
export const COUNTDOWN_SECONDS = 3;
export const RESULTS_DISPLAY_SECONDS = 10;
export const LOBBY_GC_INTERVAL_MS = 60_000;                 // 1 min

// ─── Voting ───
export const VOTE_CANDIDATE_COUNT = 5;

// ─── Rate Limits ───
export const SOCKET_RATE_LIMITS = {
  'rmhbox:lobby:create': { max: 5, windowMs: 60_000 },
  'rmhbox:lobby:join': { max: 10, windowMs: 60_000 },
  'rmhbox:lobby:chat': { max: 20, windowMs: 60_000 },
  'rmhbox:game:input': { max: 100, windowMs: 10_000 },
  'rmhbox:game:cast_vote': { max: 10, windowMs: 60_000 },
  'rmhbox:leaderboard:fetch': { max: 5, windowMs: 60_000 },
} as const;
```

---

## 24. Security Hardening

### 24.1 Input Sanitization

All string inputs from clients are sanitized:

```typescript
export function sanitizeString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[<>&"']/g, '') // strip HTML-dangerous chars
    .slice(0, maxLength);
}
```

### 24.2 Per-Player Information Scoping

The `buildClientState()` function is the ONLY exit point for state data to clients. It MUST:

1. Call the active minigame's `getStateForPlayer(userId)` or `getStateForSpectator()` to get the appropriate view.
2. Strip all internal fields (socket IDs, internal timers, other players' private data).
3. Never include raw server-side data structures (Maps, Sets) — serialize to plain objects/arrays.

### 24.3 Room Code Brute-Force Protection

The `rmhbox:lobby:join` event is rate-limited (10 attempts per 60 seconds per socket). Additionally, after 5 failed join attempts (lobby not found), the socket receives a warning and further join attempts are throttled to 1 per 30 seconds for 5 minutes.

### 24.4 Payload Size Limits

Socket.io maxHttpBufferSize is set to **1 MB** (default). Individual event payloads are validated against Zod schemas with string length and array size constraints to prevent abuse.

---

## 25. Deployment & Build Integration

### 25.1 Server Build

The RMHbox server code lives in `server/rmhbox/`. It is compiled by a **separate** TypeScript server build config alongside the existing socket server:

```jsonc
// tsconfig.server.json — include RMHbox server files
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist-server",
    "rootDir": ".",
    "noEmit": false,
    "isolatedModules": false
  },
  "include": [
    "server/socket-server.ts",
    "server/rmhbox/**/*.ts"
  ]
}
```

After `tsc --project tsconfig.server.json`, the compiled output lives at `dist-server/server/rmhbox/index.js`.

### 25.2 Standalone Server Startup

The RMHbox server runs as its own Node.js process managed by PM2 in production. It does **not** register as a namespace on the existing socket server — it is a completely independent process.

**Development:**

```jsonc
// package.json scripts
{
  "dev": "concurrently \"next dev -p 7000\" \"pnpm run socket-server\" \"pnpm run rmhbox-server\"",
  "rmhbox-server": "npx tsx server/rmhbox/index.ts",
  "start": "concurrently \"next start -p 7000\" \"node dist-server/server/socket-server.js\" \"node dist-server/server/rmhbox/index.js\""
}
```

**Production (PM2 via deploy.sh):**

```bash
APP_RMHBOX="rmhstudios-rmhbox"
PORT_RMHBOX=7676

# In stop_apps():
"$PM2_BIN" stop   "$APP_RMHBOX"  2>/dev/null || true
"$PM2_BIN" delete "$APP_RMHBOX"  2>/dev/null || true

# In start_apps():
log "Starting RMHbox WebSocket server on port $PORT_RMHBOX..."
"$PM2_BIN" start "$NODE_BIN" \
    --name "$APP_RMHBOX" \
    --restart-delay=3000 \
    --max-restarts=5 \
    -- dist-server/server/rmhbox/index.js

# Verify port:
check_port "$PORT_RMHBOX" || ok=1
```

### 25.2.1 Reverse Proxy 

Apache must route WebSocket upgrade requests on the `/rmhbox/` path to the RMHbox server. This is already done.

### 25.2.2 Environment Variables

The following env vars must be set in the production environment:

| Variable | Example Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string (shared across all processes) |
| `RMHBOX_PORT` | `7676` | RMHbox WebSocket server port (defaults to 7676) |
| `RMHBOX_CORS_ORIGIN` | `https://rmhstudios.com` | CORS origin for the RMHbox server |
| `NEXT_PUBLIC_RMHBOX_SOCKET_URL` | `https://rmhstudios.com` | Client-side URL for RMHbox WebSocket connection |
| `SOCKET_CORS_ORIGIN` | `https://rmhstudios.com` | CORS origin for the main socket server (existing) |

### 25.3 Database Migration

After adding the new Prisma models:

```bash
pnpm db:migrate -- --name add-rmhbox-models
```

### 25.4 Game Registry

Add RMHbox to `lib/games.ts`:

```typescript
{
  id: 'rmhbox',
  title: 'RMHbox',
  description: 'Party game madness! Join a lobby and play 16+ minigames with friends.',
  longDescription: 'A real-time multiplayer party game inspired by Jackbox Games...',
  href: '/rmhbox',
  status: 'Playable',
  cta: 'Play Now',
  gradient: 'from-purple-500 to-pink-500',
  iconName: 'Gamepad2',
  color: '#7c5cfc',
  tags: ['multiplayer', 'party', 'minigames'],
  imagePath: '/images/rmhbox-cover.png',
}
```

### 25.5 Process Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Process Map                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │   Next.js    │    │  Socket.io       │    │   RMHbox      │  │
│  │   (PM2)      │    │  Main Server     │    │   WS Server   │  │
│  │              │    │  (PM2)           │    │   (PM2)       │  │
│  │  port 7000   │    │  port 7001       │    │  port 7676    │  │
│  │              │    │                  │    │               │  │
│  │  Web UI,     │    │  Slice-It,       │    │  Lobbies,     │  │
│  │  API routes, │    │  Neon Driftway   │    │  Minigames,   │  │
│  │  SSR, Auth   │    │  multiplayer     │    │  Chat, etc.   │  │
│  └──────┬───────┘    └──────┬───────────┘    └──────┬────────┘  │
│         │                   │                       │            │
│  ───────┴───────────────────┴───────────────────────┴────────── │
│                    (reverse proxy)                                │
│              rmhstudios.com :443                                 │
│         /*        → 7000                                         │
│         /socket/* → 7001                                         │
│         /rmhbox/* → 7676                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Sequence Diagrams

### A.1 Full Game Session Flow

```
Client A (Host)          Server                    Client B (Player)
     │                      │                            │
     ├──lobby:create────────►│                            │
     │◄──lobby:created──────┤                            │
     │                      │                            │
     │                      │◄──lobby:join───────────────┤
     │◄──action(PLAYER_JOINED)│──state_snapshot──────────►│
     │                      │                            │
     ├──toggle_ready────────►│                            │
     │◄──action(READY)──────┤──action(READY)────────────►│
     │                      │◄──toggle_ready─────────────┤
     │                      │                            │
     ├──game:select─────────►│                            │
     │◄──instructions────────┤──instructions─────────────►│
     │       (15 sec)        │        (15 sec)            │
     │◄──preload_start───────┤──preload_start────────────►│
     │                      │                            │
     ├──ready_to_render─────►│                            │
     │                      │◄──ready_to_render──────────┤
     │◄──preload_progress───┤──preload_progress─────────►│
     │                      │ (allReady: true)            │
     │◄──countdown(3)───────┤──countdown(3)──────────────►│
     │       (3 sec)         │       (3 sec)               │
     │◄──game:started────────┤──game:started──────────────►│
     │                      │                            │
     │  ◄─action(TICK)──────┤──action(TICK)──────────────►│
     ├──game:input──────────►│                            │
     │◄──action(SCORED)──────┤──action(SCORED)────────────►│
     │                      │◄──game:input───────────────┤
     │◄──action(SCORED)──────┤──action(SCORED)────────────►│
     │                      │                            │
     │◄──round_results──────┤──round_results─────────────►│
     │                      │ (async: persistMatchResults) │
     │       (10 sec)        │                            │
     │◄──action(WAITING)─────┤──action(WAITING)──────────►│
```

### A.2 Reconnection Flow

```
Client A                   Server                    
     │                      │
     ╳ (disconnect)         │
     │                      ├─ action(PLAYER_DISCONNECTED) → lobby
     │                      ├─ start 120s grace timer
     │                      │
     │  (reconnect after    │
     │   30 seconds)        │
     ├──connect (auth)──────►│
     │                      ├─ validate session token
     │                      ├─ find lobby by userId
     │                      ├─ update socketId
     │                      ├─ cancel grace timer
     │                      ├─ re-join rooms
     │◄──state_snapshot─────┤
     │◄──game:state_snapshot┤ (if game is active)
     │                      ├─ action(PLAYER_CONNECTED) → lobby
```

---

*End of Core Infrastructure Design Specification*
