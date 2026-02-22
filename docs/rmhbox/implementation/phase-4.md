# Phase 4: Database Persistence, REST APIs, Client Architecture & UI

## Overview
This phase implements the database schema (Prisma models for RMHbox profiles, matches, and match players), async match-end persistence, the leaderboard/stats/history REST APIs, the complete client-side architecture (Zustand store, Socket.io client wrapper, minigame component loader), all page scaffolding (landing page, lobby page), the shared UI shell and design system, sounds, and game registration. By the end of this phase, the platform is fully functional end-to-end — minus the actual minigames.

## Prerequisites
- Phases 1–3 complete (server with lobbies, game lifecycle, state sync, reconnection)

---

## 1. Database Schema

### 1.1 Add Prisma Models to `prisma/schema.prisma`
- [ ] Add `RMHboxProfile` model:
  - `id: String @id @default(cuid())`
  - `userId: String @unique`
  - `user: User @relation(fields: [userId], references: [id], onDelete: Cascade)`
  - `totalGamesPlayed: Int @default(0)`
  - `totalWins: Int @default(0)`
  - `totalScore: Int @default(0)`
  - `totalPlayTimeMs: Int @default(0)`
  - `minigameStats: Json @default("{}")`
  - `currentWinStreak: Int @default(0)`
  - `bestWinStreak: Int @default(0)`
  - `createdAt: DateTime @default(now())`
  - `updatedAt: DateTime @updatedAt`
  - `matches: RMHboxMatchPlayer[]`
  - Index on `totalWins` descending, index on `totalScore` descending
  - `@@map("rmhbox_profile")`
- [ ] Add `RMHboxMatch` model:
  - `id: String @id @default(cuid())`
  - `minigameId: String`
  - `lobbyId: String`
  - `startedAt: DateTime @default(now())`
  - `endedAt: DateTime?`
  - `durationMs: Int?`
  - `winnerUserId: String?`
  - `playerCount: Int`
  - `gameLog: Json?`
  - `results: Json`
  - `players: RMHboxMatchPlayer[]`
  - Indexes on `minigameId`, `startedAt(sort: Desc)`, `lobbyId`
  - `@@map("rmhbox_match")`
- [ ] Add `RMHboxMatchPlayer` model:
  - `id: String @id @default(cuid())`
  - `matchId: String` + relation to RMHboxMatch (onDelete: Cascade)
  - `profileId: String` + relation to RMHboxProfile (onDelete: Cascade)
  - `userId: String`
  - `userName: String`
  - `rank: Int`
  - `score: Int`
  - `wasWinner: Boolean @default(false)`
  - `stats: Json @default("{}")`
  - `createdAt: DateTime @default(now())`
  - `@@unique([matchId, userId])`
  - Indexes on `profileId`, `userId`, `createdAt(sort: Desc)`
  - `@@map("rmhbox_match_player")`
- [ ] Add `rmhboxProfile: RMHboxProfile?` relation to the existing `User` model
- [ ] **Verification:** Run `pnpm prisma validate` — schema is valid, no errors.

### 1.2 Run Database Migration
- [ ] Generate and run migration: `pnpm prisma migrate dev --name add-rmhbox-models`
- [ ] Verify the migration SQL creates the three tables with all columns, indexes, and constraints
- [ ] Regenerate Prisma client: `pnpm prisma generate`
- [ ] **Verification:** Run `pnpm prisma db push --dry-run` or inspect the migration file to confirm all tables, columns, indexes, and foreign keys are present. Query the database to list new tables.

---

## 2. Match-End Persistence

### 2.1 Create `server/rmhbox/leaderboard.ts`
- [ ] Define `LeaderboardService` class
- [ ] Import Prisma client (use `pg.Pool` for direct queries since this is the standalone server — no Prisma client in the standalone process context)
  - Alternative: If Prisma client can be imported in the standalone server (needs `@prisma/client` in the dep tree), use that. If not, use raw SQL via `pg.Pool`.
  - Recommended approach: Create a separate Prisma client instance in the standalone server (`new PrismaClient()`)
- [ ] **Verification:** Verify database connection works from the standalone server process.

### 2.2 Implement `persistMatchResults()`
- [ ] Accept parameters: `lobbyId`, `minigameId`, `results: MinigameResults`, `players: Map<string, RMHboxPlayer>`, `gameLog: GameLog | null`
- [ ] Wrap entire function body in try-catch — errors are logged but NEVER thrown (fire-and-forget)
- [ ] Step 1: Create `RMHboxMatch` record with `minigameId`, `lobbyId`, `startedAt`, `endedAt`, `durationMs`, `winnerUserId`, `playerCount`, `gameLog`, `results`
- [ ] Step 2: For each player ranking:
  - Upsert `RMHboxProfile`: create if not exists, update with incremented stats
  - Use read-modify-write for `minigameStats` JSON field:
    - Read existing stats, merge new game-specific stats from `ranking.deltas`
    - Update `gamesPlayed`, `wins`, `bestScore`, `totalScore`, `averageRank`
  - Update win streak: if rank === 1, increment `currentWinStreak` and update `bestWinStreak`; else reset `currentWinStreak` to 0
  - Create `RMHboxMatchPlayer` record with `matchId`, `profileId`, `userId`, `userName`, `rank`, `score`, `wasWinner`, `stats`
- [ ] Log success: `[RMHbox] Match ${matchId} persisted (${minigameId}, ${count} players)`
- [ ] **Verification:** Run a test game to completion → check database:
  - `rmhbox_match` table has 1 new row with correct minigameId and results
  - `rmhbox_profile` table has entries for each player with updated stats
  - `rmhbox_match_player` table has entries linking players to match
  - Win streaks are calculated correctly

### 2.3 Integrate Persistence into Game Coordinator
- [ ] In `handleGameComplete()` (from Phase 3):
  - After broadcasting round results, call `leaderboardService.persistMatchResults(...)` WITHOUT awaiting (fire-and-forget)
  - Catch errors and log them — never let persistence failures affect the game flow
- [ ] **Verification:** Complete a game → results are broadcast immediately, database write happens asynchronously, no delay for players.

---

## 3. REST API Endpoints

### 3.1 Create `app/api/rmhbox/leaderboard/route.ts`
- [ ] Implement `GET` handler
- [ ] Parse query parameters: `period` ('all-time' | 'weekly' | 'monthly'), `minigame` (optional string), `metric` ('score' | 'wins' | 'games'), `limit` (default 20, max 50), `offset` (default 0)
- [ ] Apply rate limiting: 30 requests per 60 seconds (using existing `rateLimit()` from `lib/rate-limit.ts`)
- [ ] Query logic:
  - **All-time, global:** Query `RMHboxProfile` ordered by `totalScore`, `totalWins`, or `totalGamesPlayed`
  - **Weekly/monthly:** Query `RMHboxMatchPlayer` with date filter on `createdAt`, aggregate by userId
  - **Per-minigame:** Filter `RMHboxMatch` by `minigameId`, join with `RMHboxMatchPlayer`
- [ ] Return `LeaderboardResponse`: `entries[]`, `total`, `period`, `minigame`, `metric`, `userRank` (requesting user's rank if authenticated)
- [ ] To compute `userRank`: get the authenticated user's session, find their position in the leaderboard
- [ ] **Verification:** Call the endpoint with various parameter combinations:
  - `GET /api/rmhbox/leaderboard?period=all-time&metric=score` → ordered by score
  - `GET /api/rmhbox/leaderboard?period=weekly&metric=wins` → filtered to current week
  - `GET /api/rmhbox/leaderboard?minigame=rhyme-time` → filtered to one game
  - Exceeding rate limit → 429 response

### 3.2 Create `app/api/rmhbox/stats/route.ts`
- [ ] Implement `GET` handler
- [ ] Parse query parameter: `userId` (required)
- [ ] Apply rate limiting: 20 requests per 60 seconds
- [ ] Query `RMHboxProfile` by userId
- [ ] Query last 10 `RMHboxMatchPlayer` records for this user, joined with `RMHboxMatch`
- [ ] Compute derived stats: `winRate` (totalWins / totalGamesPlayed * 100), `favoriteMinigame` (most-played from minigameStats)
- [ ] Return `PlayerStatsResponse`: `global` (aggregate stats), `minigames` (per-game stats map), `recentMatches[]`
- [ ] **Verification:** Call with a valid userId → returns correctly aggregated stats. Call with nonexistent userId → returns empty/default stats or 404.

### 3.3 Create `app/api/rmhbox/history/route.ts`
- [ ] Implement `GET` handler
- [ ] Parse query parameters: `matchId` (optional), `userId` (optional), `minigame` (optional), `limit`, `offset`
- [ ] Apply rate limiting: 20 requests per 60 seconds
- [ ] If `matchId` is provided → return single match detail with full `gameLog` (if available)
- [ ] If `userId` is provided → return paginated list of that user's matches
- [ ] If `minigame` is provided → filter by minigameId
- [ ] Return `MatchHistoryResponse` (list) or `MatchDetailResponse` (single)
- [ ] **Verification:** Call with `matchId` → returns full match detail. Call with `userId` → returns paginated match list with correct order.

### 3.4 WebSocket Leaderboard Handler
- [ ] In `leaderboardService.handleConnection(socket)`:
  - Register `rmhbox:leaderboard:fetch` listener
  - Query leaderboard data and emit `rmhbox:leaderboard:data` to the requesting socket
- [ ] **Verification:** Emit leaderboard fetch via WebSocket → receive leaderboard data response.

---

## 4. Client-Side Store

### 4.1 Create `lib/rmhbox/store.ts`
- [ ] Import `create` from `zustand` and `persist` from `zustand/middleware`
- [ ] Define `RMHboxUserSettings` interface:
  - `masterVolume: number` (0–1, default 0.7)
  - `sfxVolume: number` (0–1, default 0.8)
  - `musicVolume: number` (0–1, default 0.5)
  - `showChat: boolean` (default true)
  - `chatPosition: 'left' | 'right'` (default 'right')
- [ ] Define `RMHboxStore` interface:
  - `connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'`
  - `lobby: ClientLobbyState | null`
  - `gameState: Record<string, unknown>`
  - `lastSeq: number`
  - `settings: RMHboxUserSettings`
  - Action methods: `setConnectionStatus`, `applyAction`, `applyFullSync`, `setGameState`, `updateSettings`, `reset`
- [ ] Implement `applyAction()`:
  - Check `action.seq > lastSeq` — skip if not newer
  - Apply via `applyLobbyAction()` and `applyGameAction()` reducer functions
  - Update `lastSeq`
- [ ] Implement `applyFullSync(fullState)`:
  - Replace `lobby` entirely, update `lastSeq`
- [ ] Use `persist` middleware for `settings` only (saved to localStorage as `rmhbox-settings`)
  - Use `partialize` to only persist the `settings` field
- [ ] **Verification:** Create the store, apply an action with seq=1 → state updates. Apply action with seq=0 → ignored. Apply full sync → state replaced.

### 4.2 Implement Reducer Functions
- [ ] Create `applyLobbyAction(lobby, action)` function:
  - Handle `PLAYER_JOINED`: add to players array
  - Handle `PLAYER_LEFT`: remove from players array
  - Handle `PLAYER_KICKED`: remove from players array
  - Handle `SPECTATOR_JOINED`: add to spectators array
  - Handle `SPECTATOR_LEFT`: remove from spectators array
  - Handle `SPECTATOR_PROMOTED`: move from spectators to players
  - Handle `HOST_TRANSFERRED`: update hostUserId
  - Handle `SETTINGS_UPDATED`: merge new settings
  - Handle `PLAYER_READY_CHANGED`: update player's isReady
  - Handle `STATE_CHANGED`: update lobby state
  - Handle `CHAT_MESSAGE`: append to chat array
  - Handle `PLAYER_CONNECTED`: update player's isConnected
  - Handle `PLAYER_DISCONNECTED`: update player's isConnected
  - Handle `VOTE_STARTED`, `VOTE_CAST`, `VOTE_RESULT`: update voting state
  - Handle `GAME_SELECTED`: update currentGame
- [ ] Create `applyGameAction(gameState, action)` function:
  - Forward game-specific actions to the appropriate handler based on minigame
  - Store raw payloads in gameState for the minigame component to consume
- [ ] **Verification:** Dispatch each lobby action type and confirm the store state is correct after each.

---

## 5. Socket Client Wrapper

### 5.1 Create `lib/rmhbox/socket.ts`
- [ ] Implement `connectToRMHbox(): Promise<Socket>`:
  - Get session token from `authClient.getSession()`
  - If no token, throw `'Not authenticated'`
  - Create Socket.io connection to `process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676'`
  - Options: `path: '/rmhbox/'`, `auth: { token }`, `reconnection: true`, `reconnectionAttempts: 10`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 10000`, `timeout: 10000`
  - Update store's connectionStatus
  - Set up global listeners:
    - `connect`: status → 'connected', reset reconnect attempts
    - `disconnect`: status → 'connecting' (or 'error' if server-forced)
    - `connect_error`: increment attempts, set 'error' if maxed out
    - `rmhbox:lobby:state_snapshot`: `store.applyFullSync()`
    - `rmhbox:game:action`: `store.applyAction()`
    - `rmhbox:game:state_snapshot`: `store.setGameState()`
    - `rmhbox:error`: log and surface to UI
  - Return the socket
- [ ] Implement `getSocket(): Socket | null`
- [ ] Implement `disconnectFromRMHbox(): void` — disconnect, null socket, reset store
- [ ] Implement helper `emit(event, data)` — wraps `socket.emit()` with null check
- [ ] **Verification:** Call `connectToRMHbox()` with valid auth → socket connects, status is 'connected'. Call without auth → throws error.

---

## 6. Page Scaffolding

### 6.1 Create `app/rmhbox/layout.tsx`
- [ ] Import `auth` from `@/lib/auth`
- [ ] Check session server-side: `const session = await auth.api.getSession({ headers: await headers() })`
- [ ] If no session, redirect to `/login?callbackURL=/rmhbox`
- [ ] Render children wrapped in appropriate providers
- [ ] **Verification:** Visit `/rmhbox` while logged out → redirected to login. Visit while logged in → page renders.

### 6.2 Create `app/rmhbox/page.tsx`
- [ ] Create `RMHboxLanding` component (client component)
- [ ] Three main sections:
  - **Create Lobby** button — opens settings dialog then calls `socket.emit('rmhbox:lobby:create')`
  - **Join Lobby** input — text field for 6-char room code, button to join
  - **Browse Public Lobbies** — calls `socket.emit('rmhbox:lobby:browse')`, renders results
  - **Leaderboard** panel — fetches from `/api/rmhbox/leaderboard`
- [ ] On lobby creation/join success: redirect to `/rmhbox/{lobbyId}`
- [ ] Connect to RMHbox WebSocket on mount via `connectToRMHbox()`
- [ ] **Verification:** Landing page renders with all sections. Create a lobby → navigated to lobby page. Join by code → navigated to lobby page. Browse shows public lobbies.

### 6.3 Create `app/rmhbox/[lobbyId]/page.tsx`
- [ ] Create `LobbyPage` component (client component)
- [ ] On mount: connect to WebSocket (if not connected), join the lobby
- [ ] Read lobby state from Zustand store
- [ ] Render based on `lobby.state`:
  - `WAITING`: render `<LobbyView>` (waiting room)
  - `VOTING`: render `<GameVoting>`
  - `INSTRUCTIONS`: render `<InstructionsScreen>`
  - `PRELOADING`: render `<PreloadScreen>`
  - `COUNTDOWN`: render countdown overlay
  - `PLAYING`: render `<MinigameRenderer>`
  - `ROUND_RESULTS`: render `<ResultsScreen>`
  - `SESSION_RESULTS`: render session results
- [ ] Show `<SpectatorBanner>` if `myRole === 'spectator'`
- [ ] **Verification:** Navigate to `/rmhbox/ABCDEF` with a valid lobby → correct state-based view renders. Lobby state changes → UI transitions smoothly.

---

## 7. Core UI Components

### 7.1 Create `components/rmhbox/LobbyView.tsx`
- [ ] Display room code prominently (large, monospace, with copy button)
- [ ] Player list with avatars, names, ready status indicators, host crown icon
- [ ] Host controls panel (visible only to host): Start Game, Start Vote, Settings gear, End Session
- [ ] Ready button with pulse animation (not ready) / solid green (ready)
- [ ] Chat panel (desktop: sidebar, mobile: overlay/bottom sheet)
- [ ] "Invite Link" share button (copies join URL)
- [ ] **Verification:** Lobby view renders all elements. Ready button toggles. Host sees controls, non-host doesn't.

### 7.2 Create `components/rmhbox/GameVoting.tsx`
- [ ] Display 5 candidate minigames as cards with icon, name, description, category badge
- [ ] Each card is clickable to cast a vote
- [ ] Show vote tally per candidate (bar or count)
- [ ] Timer countdown (30 seconds)
- [ ] Highlight the player's current vote
- [ ] Show "Waiting for votes..." with voter count
- [ ] **Verification:** Voting screen renders candidates. Clicking a card emits a vote. Tallies update in real-time.

### 7.3 Create `components/rmhbox/InstructionsScreen.tsx`
- [ ] Display minigame title, icon, description
- [ ] Bullet-point rules
- [ ] Platform-specific control hints (desktop vs mobile)
- [ ] Estimated duration
- [ ] Timer countdown (15 seconds or custom)
- [ ] Host skip button
- [ ] **Verification:** Instructions show correctly for a given minigame. Timer counts down. Host can skip.

### 7.4 Create `components/rmhbox/PreloadScreen.tsx`
- [ ] Show loading progress bar
- [ ] List players with check/loading indicators for who is ready
- [ ] "Waiting for: PlayerName, PlayerName..." text
- [ ] Auto-emit `ready_to_render` when assets are loaded (or immediately if no assets needed)
- [ ] **Verification:** Preload screen shows, emits ready_to_render. When all ready, transitions to countdown.

### 7.5 Create `components/rmhbox/ResultsScreen.tsx`
- [ ] Display player rankings (1st, 2nd, 3rd with podium styling)
- [ ] Score breakdowns per player (deltas)
- [ ] Awards section with icons and descriptions
- [ ] Session standings (cumulative leaderboard)
- [ ] Staggered entrance animations (Framer Motion)
- [ ] Confetti for the winner (`canvas-confetti`)
- [ ] **Verification:** Results screen renders with correct rankings. Confetti fires for winner. Animations play.

### 7.6 Create `components/rmhbox/minigames/MinigameRenderer.tsx`
- [ ] Import React `lazy` and `Suspense`
- [ ] Define `MINIGAME_COMPONENTS` map: `Record<string, React.LazyExoticComponent<React.FC>>`
- [ ] Add lazy imports for all 16 minigames (pointing to their game components — stubs for now)
- [ ] Render the correct component based on `lobby.currentGame.minigameId`
- [ ] Show loading fallback while component loads
- [ ] Show error fallback for unknown minigame IDs
- [ ] **Verification:** Set `currentGame.minigameId` to a known game → correct component lazy-loads. Set to unknown → error fallback shows.

### 7.7 Create `components/rmhbox/SpectatorBanner.tsx`
- [ ] Fixed banner at top: "👁️ You are spectating"
- [ ] "Join as Player" button (only visible during WAITING/ROUND_RESULTS when promotion is allowed)
- [ ] Button emits `rmhbox:lobby:request_promotion` on click
- [ ] **Verification:** Spectator sees the banner. Button appears/hides based on lobby state. Clicking it sends the promotion request.

### 7.8 Create Additional Shared Components
- [ ] `components/rmhbox/PlayerList.tsx` — reusable player avatar/name list with status indicators
- [ ] `components/rmhbox/RoomCodeDisplay.tsx` — large room code with copy-to-clipboard
- [ ] `components/rmhbox/HostControls.tsx` — host-only action panel
- [ ] `components/rmhbox/ReadyButton.tsx` — animated ready toggle
- [ ] `components/rmhbox/ChatOverlay.tsx` — in-lobby text chat (desktop sidebar / mobile bottom sheet)
- [ ] `components/rmhbox/LeaderboardPanel.tsx` — global/weekly leaderboard display
- [ ] **Verification:** Each component renders correctly in isolation with mock data.

---

## 8. UI Design System

### 8.1 Add CSS Custom Properties to `app/globals.css` (or RMHbox-specific CSS)
- [ ] Add RMHbox color palette:
  - `--rmhbox-bg: #0f0f1a`, `--rmhbox-surface: #1a1a2e`, `--rmhbox-surface-hover: #252540`
  - `--rmhbox-border: #2a2a4a`, `--rmhbox-text: #e0e0f0`, `--rmhbox-text-muted: #8888aa`
  - `--rmhbox-accent: #7c5cfc`, `--rmhbox-accent-hover: #9b7eff`
  - `--rmhbox-success: #4ade80`, `--rmhbox-danger: #f87171`, `--rmhbox-warning: #fbbf24`, `--rmhbox-info: #60a5fa`
- [ ] Add RMHbox typography:
  - `--rmhbox-font-display: 'Nunito', 'Segoe UI', sans-serif`
  - `--rmhbox-font-body: 'Inter', 'Segoe UI', sans-serif`
  - `--rmhbox-font-mono: 'JetBrains Mono', monospace`
- [ ] Add design tokens for spacing and border radius
- [ ] Import Google Fonts: Nunito (for display), Inter (existing or body), JetBrains Mono (codes/scores)
- [ ] **Verification:** Apply RMHbox classes to test elements — colors, fonts, spacing render correctly.

### 8.2 Implement Shared Game Shell Layout
- [ ] Create a `GameShell` wrapper component used by all minigames:
  - Fixed header: game name, timer (SVG countdown ring), round indicator
  - Flexible center: game content (passed as children)
  - Fixed footer (mobile): score, player count
  - Desktop layout: players list on left, game center, chat on right
- [ ] **Verification:** Wrap a placeholder game in GameShell — header/footer/layout renders correctly on mobile and desktop.

---

## 9. Sound System

### 9.1 Create `lib/rmhbox/audio.ts`
- [ ] Import Howler.js
- [ ] Define sound effects: `chime` (player join), `click` (button press), `countdownBeep` (3-2-1), `goFanfare` (game start), `scoreDing` (points), `buzzer` (wrong answer), `victoryFanfare` (game complete), `swoosh` (transitions)
- [ ] Create a `SoundManager` class or function that:
  - Loads sound files from `/public/music/rmhbox/` (or similar)
  - Respects volume settings from Zustand store (`masterVolume`, `sfxVolume`)
  - Provides `play(soundName)` method
- [ ] **Verification:** Call `play('click')` — sound plays at correct volume. Update volume setting — subsequent sounds respect it.

---

## 10. Game Registration

### 10.1 Update `lib/games.ts`
- [ ] Add RMHbox entry to the games array:
  - `id: 'rmhbox'`, `title: 'RMHbox'`, `description: 'Party game madness! Join a lobby and play 16+ minigames with friends.'`
  - `href: '/rmhbox'`, `status: 'Playable'`, `cta: 'Play Now'`
  - `gradient: 'from-purple-500 to-pink-500'`, `iconName: 'Gamepad2'`, `color: '#7c5cfc'`
  - `tags: ['multiplayer', 'party', 'minigames']`
- [ ] **Verification:** RMHbox appears on the homepage games list with correct styling and links to `/rmhbox`.

---

## 11. Integration Testing

### 11.1 Full End-to-End Flow
- [ ] Open the site → navigate to /rmhbox → landing page loads
- [ ] Create a lobby → redirected to lobby page with room code displayed
- [ ] Share room code → second player joins → both see each other in the player list
- [ ] Host starts a vote → candidates appear, both can vote
- [ ] Game runs (stub) → results display with scores and rankings
- [ ] Check database → match record, profiles, and match-player records exist
- [ ] View leaderboard on landing page → shows the player who just played
- [ ] Disconnect and reconnect → state is fully restored
- [ ] **Verification:** All assertions pass. Complete flow works from landing to results to persistence.

### 11.2 API Tests
- [ ] Hit `/api/rmhbox/leaderboard` → returns valid JSON with entries
- [ ] Hit `/api/rmhbox/stats?userId=xxx` → returns player stats
- [ ] Hit `/api/rmhbox/history?userId=xxx` → returns match history
- [ ] Hit `/api/rmhbox/history?matchId=xxx` → returns detailed match with gameLog
- [ ] **Verification:** All endpoints return correct data shapes.

---

## Phase 4 Completion Criteria
- [ ] Prisma schema includes RMHboxProfile, RMHboxMatch, RMHboxMatchPlayer models
- [ ] Migration runs successfully, tables exist with correct indexes
- [ ] Match results are persisted asynchronously after game completion
- [ ] Win streaks and per-minigame stats are computed correctly
- [ ] Leaderboard API supports all-time, weekly, monthly, per-minigame, by multiple metrics
- [ ] Stats API returns aggregated player statistics
- [ ] History API supports listing and detail views
- [ ] All API endpoints are rate-limited
- [ ] Zustand store correctly applies actions and full syncs
- [ ] Action reducers handle all lobby and game action types
- [ ] Socket client wrapper connects, reconnects, and manages connection state
- [ ] Landing page allows creating, joining, and browsing lobbies
- [ ] Lobby page renders all lifecycle states with correct components
- [ ] All shared UI components render correctly
- [ ] Design system (colors, typography, tokens) is applied
- [ ] Game shell wrapper provides consistent header/footer/layout
- [ ] Sound effects play at correct times with user volume control
- [ ] RMHbox appears in the site's game registry
- [ ] Full end-to-end flow works from landing to results to database persistence
