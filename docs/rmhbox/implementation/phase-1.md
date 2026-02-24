# Phase 1: Foundation & Server Setup

## Overview
This phase establishes the project scaffolding, shared types/interfaces, the standalone WebSocket server process, authentication middleware, and build/deployment integration. At the end of this phase, the RMHbox server boots on port 7676, authenticates connections via Better Auth session tokens, and responds to health checks.

## Prerequisites
- Existing Next.js 16 / React 19 / TypeScript 5 codebase
- PostgreSQL database with Better Auth tables
- PM2 in production
- Existing socket server on port 7001 for other games

---

## 1. Project Scaffolding

### 1.1 Create Directory Structure
- [ ] Create `app/rmhbox/` directory
- [ ] Create `app/rmhbox/layout.tsx` (placeholder auth gate)
- [ ] Create `app/rmhbox/page.tsx` (placeholder landing page)
- [ ] Create `app/rmhbox/[lobbyId]/page.tsx` (placeholder lobby page)
- [ ] Create `app/api/rmhbox/` directory
- [ ] Create `app/api/rmhbox/leaderboard/route.ts` (stub)
- [ ] Create `app/api/rmhbox/stats/route.ts` (stub)
- [ ] Create `app/api/rmhbox/history/route.ts` (stub)
- [ ] Create `components/rmhbox/` directory
- [ ] Create `components/rmhbox/minigames/` directory
- [ ] Create `lib/rmhbox/` directory
- [ ] Create `server/rmhbox/` directory
- [ ] Create `server/rmhbox/minigames/` directory
- [ ] **Verification:** Run `ls -R` / `Get-ChildItem -Recurse` on each directory to confirm all directories and stub files exist.

### 1.2 Install Dependencies
- [ ] Install `rfc6902` — JSON Patch generation and application for state diffs
- [ ] Install `nanoid` — compact room code generation
- [ ] Install `zod` — runtime schema validation for WebSocket payloads (may already exist; verify)
- [ ] Install `canvas-confetti` — confetti animations for win screens (client-side)
- [ ] Install `fuse.js` — fuzzy text matching for minigames (server-side)
- [ ] Verify `socket.io` and `socket.io-client` are already installed (v4.8+)
- [ ] Verify `zustand` is already installed (v5+)
- [ ] Verify `howler` / `howler.js` is already installed
- [ ] Verify `lucide-react` is already installed
- [ ] **Verification:** Run `pnpm ls rfc6902 nanoid zod canvas-confetti fuse.js socket.io socket.io-client zustand` and confirm all packages are listed with correct versions.

---

## 2. Shared Type Definitions

### 2.1 Create `lib/rmhbox/types.ts`
- [ ] Define `LobbyState` union type: `'WAITING' | 'VOTING' | 'INSTRUCTIONS' | 'PRELOADING' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_RESULTS' | 'SESSION_RESULTS' | 'DISBANDED'`
- [ ] Define `LobbySettings` interface with fields: `isPublic`, `maxPlayers`, `maxSpectators`, `allowMidGameJoin`, `allowSpectatorPromotion`, `autoStartThreshold`, `gameDurationOverride`
- [ ] Define `ClientLobbyState` interface with fields: `lobbyId`, `hostUserId`, `state`, `settings`, `players`, `spectators`, `currentGame`, `roundNumber`, `chat`, `myRole`, `myUserId`, `seq`, `matchHistory`
- [ ] Define `ClientPlayerInfo` interface: `userId`, `userName`, `avatarUrl`, `isConnected`, `isReady`, `score`, `roundScore`, `isHost`
- [ ] Define `ClientSpectatorInfo` interface: `userId`, `userName`, `avatarUrl`, `isConnected`
- [ ] Define `ClientGameInfo` interface: `minigameId`, `displayName`, `phase`, `timeRemaining`, `publicState`, `privateState`
- [ ] Define `ChatMessage` interface: `id`, `userId`, `userName`, `content`, `timestamp`, `type` ('user' | 'system')
- [ ] Define `GameAction` interface: `type`, `payload`, `seq`, `timestamp`
- [ ] Define `PlayerRanking` interface: `userId`, `userName`, `score`, `rank`, `deltas`
- [ ] Define `Award` interface: `userId`, `title`, `description`, `icon`
- [ ] Define `SessionStanding` interface: `userId`, `userName`, `totalScore`, `wins`, `rank`
- [ ] Define `RoundResultsPayload` interface: `minigameId`, `rankings`, `awards`, `roundNumber`, `sessionStandings`
- [ ] Define `MatchSummary` interface: `matchId`, `minigameId`, `minigameDisplayName`, `playerCount`, `winnerUserName`, `rankings`, `durationMs`, `playedAt`
- [ ] Define `MinigameCategory` type: `'word' | 'trivia' | 'action' | 'creative'`
- [ ] Define `JoinInProgressPolicy` type: `'spectate_only' | 'join_next_subround' | 'join_immediately'`
- [ ] Define `PreloadManifest` interface: `images`, `sounds`, `data`, `estimatedSizeBytes`
- [ ] Define `ControlHint` interface: `platform`, `action`, `description`
- [ ] Define `MinigameDefinition` interface: `id`, `displayName`, `description`, `category`, `icon`, `minPlayers`, `maxPlayers`, `estimatedDurationSeconds`, `supportsTeams`, `instructionDurationSeconds`, `preloadAssets`, `joinInProgressPolicy`, `tags`
- [ ] Define `VoteCandidate` interface
- [ ] Define `VoteStartedPayload`, `VoteCastPayload`, `VoteResultPayload` interfaces
- [ ] Define `LeaderboardEntry` interface: `rank`, `userId`, `userName`, `avatarUrl`, `value`, `gamesPlayed`, `wins`
- [ ] Define `RMHboxErrorCode` union type with all error codes: `'AUTH_REQUIRED'`, `'AUTH_FAILED'`, `'SESSION_EXPIRED'`, `'DUPLICATE_SESSION'`, `'LOBBY_NOT_FOUND'`, `'LOBBY_FULL'`, `'LOBBY_IN_GAME'`, `'NOT_HOST'`, `'NOT_IN_LOBBY'`, `'ALREADY_IN_LOBBY'`, `'INVALID_PAYLOAD'`, `'INVALID_GAME'`, `'INSUFFICIENT_PLAYERS'`, `'INTERNAL_ERROR'`, `'RATE_LIMITED'`
- [ ] Define `RMHboxError` interface: `code`, `message`, `details?`
- [ ] **Verification:** Import the file into a scratch test file and instantiate each type to confirm no TypeScript errors. Run `tsc --noEmit` targeting this file.

### 2.2 Create `server/rmhbox/types.ts` (Server-Only Types)
- [ ] Define `RMHboxLobby` interface: `id`, `hostUserId`, `settings`, `players` (Map), `spectators` (Map), `state`, `chat`, `createdAt`, `lastActivityAt`, `currentGame`, `matchHistory`, `roundNumber`
- [ ] Define `RMHboxPlayer` interface: `userId`, `userName`, `avatarUrl`, `socketId`, `isConnected`, `isReady`, `score`, `roundScore`, `joinedAt`, `lastSeenAt`, `role`
- [ ] Define `RMHboxSpectator` interface: `userId`, `userName`, `avatarUrl`, `socketId`, `isConnected`, `joinedAt`, `role`
- [ ] Define `ActiveGame` interface: `minigameId`, `handler` (BaseMinigame reference), `startedAt`
- [ ] Define `MinigameContext` interface: `lobbyId`, `players`, `settings`, `nsp`, `broadcastToLobby`, `broadcastToPlayers`, `sendToPlayer`, `sendToSpectators`, `onComplete`, `onError`
- [ ] Define `MinigameResults` interface: `rankings`, `awards`, `gameSpecificData`, `duration`
- [ ] **Verification:** Run `tsc --noEmit` on server types file — zero errors.

---

## 3. Constants & Configuration

### 3.1 Create `lib/rmhbox/constants.ts`
- [ ] Define lobby constants: `ROOM_CODE_LENGTH = 6`, `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`, `DEFAULT_MAX_PLAYERS = 8`, `MIN_PLAYERS = 2`, `ABSOLUTE_MAX_PLAYERS = 16`, `DEFAULT_MAX_SPECTATORS = 20`, `MAX_SPECTATORS = 50`, `CHAT_MAX_LENGTH = 200`, `CHAT_HISTORY_LENGTH = 100`
- [ ] Define timer constants: `HEARTBEAT_INTERVAL_MS = 10_000`, `LOBBY_IDLE_TIMEOUT_MS = 15 * 60 * 1000`, `LOBBY_ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000`, `LOBBY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000`, `DISCONNECT_GRACE_PERIOD_MS = 120_000`, `VOTE_DURATION_SECONDS = 30`, `DEFAULT_INSTRUCTION_DURATION_SECONDS = 15`, `PRELOAD_TIMEOUT_MS = 30_000`, `COUNTDOWN_SECONDS = 3`, `RESULTS_DISPLAY_SECONDS = 10`, `LOBBY_GC_INTERVAL_MS = 60_000`
- [ ] Define voting constant: `VOTE_CANDIDATE_COUNT = 5`
- [ ] Define rate limit map: `SOCKET_RATE_LIMITS` object with per-event limits
- [ ] **Verification:** Import constants in a test file and verify all values are correct.

### 3.2 Create `lib/rmhbox/events.ts`
- [ ] Define all client-to-server event name constants (21 events): `LOBBY_CREATE`, `LOBBY_JOIN`, `LOBBY_LEAVE`, `LOBBY_KICK`, `LOBBY_TRANSFER_HOST`, `LOBBY_UPDATE_SETTINGS`, `LOBBY_END_SESSION`, `LOBBY_TOGGLE_READY`, `LOBBY_REQUEST_PROMOTION`, `LOBBY_CHAT`, `LOBBY_BROWSE`, `GAME_SELECT`, `GAME_START_VOTE`, `GAME_CAST_VOTE`, `GAME_FORCE_SKIP`, `GAME_READY_TO_RENDER`, `GAME_INPUT`, `LEADERBOARD_FETCH`
- [ ] Define all server-to-client event name constants (18 events): `LOBBY_CREATED`, `LOBBY_STATE_SNAPSHOT`, `LOBBY_BROWSE_RESULT`, `LOBBY_KICKED`, `LOBBY_DISBANDED`, `GAME_ACTION`, `GAME_INSTRUCTIONS`, `GAME_PRELOAD_START`, `GAME_PRELOAD_PROGRESS`, `GAME_COUNTDOWN`, `GAME_STARTED`, `GAME_STATE_SNAPSHOT`, `GAME_ROUND_RESULTS`, `GAME_SESSION_RESULTS`, `GAME_VOTE_STARTED`, `GAME_VOTE_UPDATE`, `GAME_VOTE_RESULT`, `LEADERBOARD_DATA`, `ERROR`
- [ ] Use `rmhbox:` prefix for all event names (e.g., `rmhbox:lobby:create`)
- [ ] **Verification:** Log all event constants and confirm they match the design spec event catalog exactly.

### 3.3 Create `server/rmhbox/config.ts`
- [ ] Define `config` object reading from environment variables with fallbacks:
  - `PORT`: `parseInt(process.env.RMHBOX_PORT || '7676')`
  - `SOCKET_PATH`: `process.env.RMHBOX_SOCKET_PATH || '/rmhbox/'`
  - `CORS_ORIGIN`: `process.env.RMHBOX_CORS_ORIGIN || process.env.SOCKET_CORS_ORIGIN || '*'`
  - `HEARTBEAT_MS`: `parseInt(process.env.RMHBOX_HEARTBEAT_MS || '10000')`
  - `GRACE_MS`: `parseInt(process.env.RMHBOX_GRACE_MS || '120000')`
  - `GC_INTERVAL`: `parseInt(process.env.RMHBOX_GC_INTERVAL || '60000')`
  - `SHUTDOWN_TIMEOUT`: `parseInt(process.env.RMHBOX_SHUTDOWN_TIMEOUT || '10000')`
  - `MAX_HTTP_BUFFER_SIZE`: `1_000_000` (1 MB)
  - `PING_INTERVAL_MS`: `25_000`
  - `PING_TIMEOUT_MS`: `20_000`
- [ ] Export the config object as a typed constant
- [ ] **Verification:** Log `config` on startup and verify each field resolves correctly with both default and env-var-overridden values.

---

## 4. Zod Validation Schemas

### 4.1 Create `lib/rmhbox/schemas.ts` (Shared Schemas)
- [ ] Define `LobbySettingsSchema` as partial (for create/update payloads): `isPublic: z.boolean().optional()`, `maxPlayers: z.number().int().min(2).max(16).optional()`, etc.
- [ ] Define `CreateLobbySchema`: `{ settings: LobbySettingsSchema.optional() }`
- [ ] Define `JoinLobbySchema`: `{ lobbyId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+$/), asSpectator: z.boolean().optional().default(false) }`
- [ ] Define `LeaveLobbySchema`: `{ lobbyId: z.string() }`
- [ ] Define `KickPlayerSchema`: `{ lobbyId: z.string(), targetUserId: z.string() }`
- [ ] Define `TransferHostSchema`: `{ lobbyId: z.string(), targetUserId: z.string() }`
- [ ] Define `UpdateSettingsSchema`: `{ lobbyId: z.string(), settings: LobbySettingsSchema }`
- [ ] Define `ToggleReadySchema`: `{ lobbyId: z.string() }`
- [ ] Define `RequestPromotionSchema`: `{ lobbyId: z.string() }`
- [ ] Define `ChatSchema`: `{ lobbyId: z.string(), content: z.string().min(1).max(200).transform(s => s.trim()) }`
- [ ] Define `BrowseLobbiesSchema`: `{ cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional().default(20) }`
- [ ] Define `SelectGameSchema`: `{ lobbyId: z.string(), minigameId: z.string() }`
- [ ] Define `StartVoteSchema`: `{ lobbyId: z.string() }`
- [ ] Define `CastVoteSchema`: `{ lobbyId: z.string(), minigameId: z.string() }`
- [ ] Define `ForceSkipSchema`: `{ lobbyId: z.string() }`
- [ ] Define `ReadyToRenderSchema`: `{ lobbyId: z.string() }`
- [ ] Define `GameInputSchema`: `{ lobbyId: z.string(), action: z.string().min(1).max(128), data: z.unknown() }`
- [ ] Define `FetchLeaderboardSchema`: `{ period: z.enum(['all-time', 'weekly', 'monthly']), minigame: z.string().optional(), limit: z.number().optional() }`
- [ ] **Verification:** Write unit tests that parse valid and invalid payloads for each schema, confirming correct acceptance/rejection.

### 4.2 Create `server/rmhbox/schemas.ts` (Server-Only Schemas)
- [ ] Re-export all shared schemas from `lib/rmhbox/schemas.ts`
- [ ] Add the `validated()` wrapper function that takes a Zod schema and a handler function, returns a function that validates the payload before calling the handler, emitting `rmhbox:error` on validation failure
- [ ] **Verification:** Call `validated()` with a test schema and confirm it correctly gates bad input.

---

## 5. Shared Utilities

### 5.1 Create `lib/rmhbox/utils.ts`
- [ ] Implement `sanitizeString(raw: unknown, maxLength: number): string` — trims, strips `<>&"'` characters, truncates to maxLength
- [ ] Implement `generateRoomCode(): string` — uses `nanoid` with custom alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length 6
- [ ] **Verification:** Unit test `sanitizeString` with HTML injection attempts, empty strings, and overly long strings. Test `generateRoomCode()` generates valid 6-char codes with no ambiguous characters.

---

## 6. Authentication Middleware

### 6.1 Create `server/rmhbox/auth.ts`
- [ ] Import `pg` (the `pg` package), create a `Pool` instance using `process.env.DATABASE_URL`
- [ ] Implement `validateSessionToken(token: string)` function:
  - Query `session` + `user` tables: `SELECT s.*, u.name as "userName", u.image as "avatarUrl" FROM session s JOIN "user" u ON s."userId" = u.id WHERE s.token = $1`
  - Return `null` if no row found
  - Return `{ userId, userName, avatarUrl, expiresAt }` if found
- [ ] Implement `authMiddleware(socket, next)` function:
  - Extract `token` from `socket.handshake.auth?.token`
  - If missing or non-string, call `next(new Error('AUTH_REQUIRED'))`
  - Call `validateSessionToken(token)`
  - If null, call `next(new Error('AUTH_FAILED'))`
  - If expired (`expiresAt < new Date()`), call `next(new Error('SESSION_EXPIRED'))`
  - Attach `userId`, `userName`, `avatarUrl`, `sessionToken` to `socket.data`
  - Call `next()` on success
- [ ] **Verification:** Write integration tests:
  - Test with a valid session token → middleware calls `next()` without error, `socket.data.userId` is set
  - Test with missing token → middleware calls `next` with `AUTH_REQUIRED` error
  - Test with invalid token → middleware calls `next` with `AUTH_FAILED` error
  - Test with expired session → middleware calls `next` with `SESSION_EXPIRED` error

---

## 7. Standalone WebSocket Server Bootstrap

### 7.1 Create `server/rmhbox/index.ts`
- [ ] Import `dotenv/config` at top of file
- [ ] Import `createServer` from `http`
- [ ] Import `Server` from `socket.io`
- [ ] Import `config` from `./config`
- [ ] Import `authMiddleware` from `./auth`
- [ ] Create HTTP server with `requestHandler`:
  - `GET /health` returns `{ status: 'ok', uptime: process.uptime() }` with 200
  - All other routes return 404
- [ ] Create Socket.io `Server` instance with:
  - `path: config.SOCKET_PATH`
  - `cors: { origin: config.CORS_ORIGIN, methods: ['GET', 'POST'], credentials: true }`
  - `maxHttpBufferSize: config.MAX_HTTP_BUFFER_SIZE`
  - `pingInterval: config.PING_INTERVAL_MS`
  - `pingTimeout: config.PING_TIMEOUT_MS`
- [ ] Apply auth middleware globally: `io.use(authMiddleware)`
- [ ] Set up `io.on('connection', (socket) => { ... })` handler:
  - Log connection with userId
  - Set up `socket.on('disconnect')` handler that logs the reason
- [ ] Implement graceful shutdown function:
  - On `SIGINT` and `SIGTERM`: close io, close httpServer, exit after `config.SHUTDOWN_TIMEOUT`
- [ ] Call `httpServer.listen(config.PORT)` with startup log message
- [ ] **Verification:**
  - Start the server: `npx tsx server/rmhbox/index.ts`
  - Confirm startup log: `[RMHbox] WebSocket server running on http://localhost:7676`
  - `curl http://localhost:7676/health` returns `{"status":"ok","uptime":...}`
  - `curl http://localhost:7676/other` returns 404
  - Connect with Socket.io client without auth token → connection rejected with `AUTH_REQUIRED`
  - Connect with valid auth token → connection accepted, `socket.data.userId` populated

---

## 8. WebSocket Rate Limiting

### 8.1 Implement Per-Socket Rate Limiter
- [ ] Create rate limiting utility in `server/rmhbox/rate-limit.ts`
- [ ] Implement sliding window counter per socket per event type
- [ ] Store counters in a `Map<string, { count: number; windowStart: number }>` keyed by `${socketId}:${eventName}`
- [ ] Implement `checkRateLimit(socketId: string, eventName: string): boolean` — returns `true` if within limits, `false` if rate limited
- [ ] Clean up entries when sockets disconnect
- [ ] Integrate with the `validated()` wrapper so rate limiting is checked before schema validation
- [ ] **Verification:** Write a test that fires 6 `rmhbox:lobby:create` events in rapid succession from the same socket — first 5 should succeed, 6th should be rejected with `RATE_LIMITED` error code.

---

## 9. Build & Deployment Integration

### 9.1 Update `tsconfig.server.json`
- [ ] Add `server/rmhbox/**/*.ts` to the `include` array
- [ ] Verify `outDir` is set to `dist-server`
- [ ] **Verification:** Run `tsc --project tsconfig.server.json` — zero errors. Confirm `dist-server/server/rmhbox/index.js` is generated.

### 9.2 Update `package.json` Scripts
- [ ] Add `"rmhbox-server": "npx tsx server/rmhbox/index.ts"` script for development
- [ ] Update `"dev"` script to include RMHbox server: `concurrently "next dev -p 7000" "pnpm run socket-server" "pnpm run rmhbox-server"`
- [ ] Update `"start"` script to include RMHbox server: add `"node dist-server/server/rmhbox/index.js"` to concurrently list
- [ ] **Verification:** Run `pnpm run rmhbox-server` — server starts on port 7676. Run `pnpm run dev` — all three servers start (Next.js, socket server, RMHbox server).

### 9.3 Update `deploy.sh`
- [ ] Add `APP_RMHBOX="rmhstudios-rmhbox"` and `PORT_RMHBOX=7676` variables
- [ ] Add PM2 stop/delete for `$APP_RMHBOX` in `stop_apps()`
- [ ] Add PM2 start command for `dist-server/server/rmhbox/index.js` in `start_apps()` with `--name "$APP_RMHBOX" --restart-delay=3000 --max-restarts=5`
- [ ] Add `check_port "$PORT_RMHBOX"` verification
- [ ] **Verification:** Review the deploy script diff. In a staging environment, run the deploy script and confirm PM2 lists three processes (main app, socket server, RMHbox server).

### 9.5 Environment Variables
- [ ] Document all required env vars:
  - `DATABASE_URL` (required, shared)
  - `RMHBOX_PORT` (optional, default 7676)
  - `RMHBOX_CORS_ORIGIN` (optional, default from `SOCKET_CORS_ORIGIN`)
  - `NEXT_PUBLIC_RMHBOX_SOCKET_URL` (required for client: production = `https://rmhstudios.com`, dev = `http://localhost:7676`)
- [ ] Add `NEXT_PUBLIC_RMHBOX_SOCKET_URL` to `.env.example` (or equivalent)
- [ ] **Verification:** Start the server with custom env vars (`RMHBOX_PORT=8888`) and confirm it listens on the overridden port.

---

## 10. Game Registry Stub

### 10.1 Create `lib/rmhbox/minigame-registry.ts`
- [ ] Define the `MINIGAME_REGISTRY` as a `Record<string, MinigameDefinition>` object
- [ ] Add placeholder entries for all 16 minigames with correct metadata:
  - `rhyme-time`: word, 2-10 players, 120s, no teams, spectate_only
  - `undercover-agent`: word, 4-16 players, 300s, teams, spectate_only
  - `category-crash`: word, 3-12 players, 150s, no teams, join_next_subround
  - `wiki-race`: trivia, 2-10 players, 193s, no teams, spectate_only
  - `fact-or-friction`: trivia, 2-16 players, 120s, no teams, join_next_subround
  - `undercover-editor`: creative, 4-10 players, 240s, no teams, spectate_only
  - `minimalist-masterpiece`: creative, 3-12 players, 150s, no teams, spectate_only
  - `emoji-cinema`: word, 3-12 players, 180s, no teams, join_next_subround
  - `sequence-sam`: action, 2-10 players, 120s, no teams, spectate_only
  - `human-keyboard`: action, 3-10 players, 120s, teams (cooperative), spectate_only
  - `cursor-curling`: action, 2-8 players, 150s, no teams, spectate_only
  - `human-tetris`: action, 4-10 players, 120s, teams (cooperative), spectate_only
  - `identity-crisis`: word, 3-10 players, 180s, no teams, spectate_only
  - `ranking-file`: trivia, 3-12 players, 120s, no teams, join_next_subround
  - `pixel-pushers`: action, 2-8 players, 120s, teams (cooperative), join_immediately
  - `scroll-soul`: action, 2-16 players, 90s, no teams, spectate_only
- [ ] Export `getEligibleMinigames(playerCount: number): MinigameDefinition[]` function that filters by min/max player count
- [ ] **Verification:** Call `getEligibleMinigames(4)` and confirm it returns all 16 games. Call `getEligibleMinigames(2)` and confirm it excludes games with `minPlayers > 2`.

### 10.2 Create `server/rmhbox/minigames/base-minigame.ts`
- [ ] Define abstract `BaseMinigame` class implementing the minigame interface:
  - Constructor takes `MinigameContext`
  - Abstract methods: `start()`, `handleInput(userId, action, data)`, `getStateForPlayer(userId)`, `getStateForSpectator()`, `computeResults()`
  - Concrete methods: `handlePlayerDisconnect(userId)`, `handlePlayerReconnect(userId)`, `forceEnd(reason)`, `cleanup()`
  - Helper methods: `setTimeout(fn, ms)` (tracked), `setInterval(fn, ms)` (tracked)
  - Track timers in `timers: NodeJS.Timeout[]` and `intervals: NodeJS.Timeout[]`
  - `cleanup()` clears all tracked timers/intervals
  - All tracked callbacks wrapped in try-catch that calls `context.onError`
- [ ] **Verification:** Create a minimal test subclass that extends `BaseMinigame`, implements all abstract methods as no-ops, call `start()` / `cleanup()` — no errors.

---

## Phase 1 Completion Criteria
- [ ] All directories and stub files created
- [ ] All npm dependencies installed
- [ ] Shared types compile without errors
- [ ] Constants, events, schemas defined and importable
- [ ] `server/rmhbox/index.ts` boots a standalone Socket.io server on port 7676
- [ ] Authentication middleware validates Better Auth session tokens against PostgreSQL
- [ ] Health check endpoint (`GET /health`) responds correctly
- [ ] Rate limiting utility is functional
- [ ] `tsconfig.server.json` compiles all server code to `dist-server/`
- [ ] `package.json` scripts updated for dev and production
- [ ] `deploy.sh` updated with PM2 config for RMHbox process
- [ ] Minigame registry populated with all 16 game stubs
- [ ] `BaseMinigame` abstract class defined and extensible
