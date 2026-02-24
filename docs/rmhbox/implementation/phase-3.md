# Phase 3: Game Lifecycle, State Synchronization & Reconnection

## Overview
This phase implements the complete minigame lifecycle state machine, the game coordinator that orchestrates game start/end, the voting system for minigame selection, state synchronization (action-based deltas + periodic heartbeats), the reconnection protocol with grace periods, duplicate session handling, spectator state delivery, the join-in-progress framework, and timer synchronization. By the end, lobbies can transition through all phases (WAITING → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING), players can reconnect mid-game, and spectators receive the correct state.

## Prerequisites
- Phase 1 complete (server, auth, types, schemas, constants)
- Phase 2 complete (lobby system fully operational)

---

## 1. Vote Manager

### 1.1 Create `server/rmhbox/vote-manager.ts`
- [ ] Define `VoteManager` class with constructor accepting `io: Server`, `lobbyManager: LobbyManager`, `gameCoordinator: GameCoordinator`
- [ ] Define `ActiveVote` interface: `candidates: VoteCandidate[]`, `votes: Map<string, string>` (userId → minigameId), `timer: NodeJS.Timeout`, `startedAt: number`, `endsAt: number`
- [ ] Create private `activeVotes: Map<string, ActiveVote>` (lobbyId → vote session)
- [ ] **Verification:** Instantiate VoteManager — no errors, empty internal state.

### 1.2 Implement Vote Initiation
- [ ] Implement `startVote(socket, payload)` handler for `rmhbox:game:start_vote`
- [ ] Validate the requesting socket is the host
- [ ] Validate lobby is in `WAITING` state
- [ ] Validate there are at least `MIN_PLAYERS` (2) players in the lobby
- [ ] Query `getEligibleMinigames(playerCount)` from the minigame registry to get games eligible for current player count
- [ ] Randomly select `VOTE_CANDIDATE_COUNT` (5) candidates from the eligible pool (or all if fewer than 5)
- [ ] Create `ActiveVote` with the candidates, empty votes map, and a timer set for `VOTE_DURATION_SECONDS` (30s)
- [ ] Store in `activeVotes` map
- [ ] Transition lobby state to `VOTING`
- [ ] Broadcast `rmhbox:game:vote_started` with `VoteStartedPayload`:
  - `candidates`: array of `{ minigameId, displayName, description, category, icon, playerRange }`
  - `durationSeconds: 30`
  - `endsAt: Date.now() + 30000`
- [ ] Broadcast `STATE_CHANGED` action with `{ newState: 'VOTING' }`
- [ ] Start the vote timer — when it expires, call `resolveVote(lobbyId)`
- [ ] **Verification:** Start a vote with 4 players — 5 candidates are selected (or fewer if not enough eligible), lobby transitions to VOTING, all players receive the vote_started event.

### 1.3 Implement Vote Casting
- [ ] Implement `castVote(socket, payload)` handler for `rmhbox:game:cast_vote`
- [ ] Validate lobby is in `VOTING` state
- [ ] Validate user is a player (not a spectator)
- [ ] Validate the `minigameId` is one of the active vote's candidates
- [ ] Store/overwrite the vote: `activeVote.votes.set(userId, minigameId)`
- [ ] Compute current tallies: count votes per candidate
- [ ] Broadcast `rmhbox:game:vote_update` with `VoteCastPayload`:
  - `userId` (who voted — but NOT what they voted for, to preserve suspense)
  - `tallies`: `{ [minigameId]: count }` — shows totals but not who voted for what
  - `totalVoters`: count of unique voters
  - `totalPlayers`: total player count
- [ ] If all players have voted, cancel the timer and call `resolveVote(lobbyId)` immediately
- [ ] **Verification:** Cast a vote — tally is updated, broadcast received. Vote again — previous vote is overwritten. All players vote — vote resolves immediately without waiting for timer.

### 1.4 Implement Vote Resolution
- [ ] Implement `resolveVote(lobbyId)` method
- [ ] Clear the vote timer
- [ ] Count votes per candidate, determine the winner (highest count)
- [ ] On tie: break randomly (use `Math.random()`)
- [ ] Broadcast `rmhbox:game:vote_result` with `VoteResultPayload`:
  - `winnerId`: winning minigameId
  - `winnerName`: display name
  - `tallies`: final counts
  - `wasUnanimous`: boolean (all voted for the same game)
- [ ] Remove from `activeVotes` map
- [ ] Call `gameCoordinator.startGameFlow(lobbyId, winnerId)` to begin the game lifecycle
- [ ] **Verification:** Vote resolves — winner is correctly determined, broadcast received. Tie is broken randomly. After resolution, `activeVotes` no longer has the entry.

### 1.5 Implement Host Force-Skip During Vote
- [ ] In the `forceSkip(socket, payload)` handler:
  - If lobby is in `VOTING` state: immediately resolve the vote (tallies as-is, even if no votes cast, random selection in that case)
- [ ] **Verification:** Host force-skips a vote with 0 votes cast — a random game is selected. Force-skip with partial votes — current tallies determine the winner.

---

## 2. Game Coordinator

### 2.1 Create `server/rmhbox/game-coordinator.ts`
- [ ] Define `GameCoordinator` class with constructor accepting `io: Server`, `lobbyManager: LobbyManager`, `stateSyncService: StateSyncService`
- [ ] Import `BaseMinigame` and a `MINIGAME_SERVER_REGISTRY` that maps minigameId → server-side game class (stub for now — populated when minigames are implemented in Phases 5-8)
- [ ] **Verification:** Instantiate GameCoordinator — no errors.

### 2.2 Implement `startGameFlow(lobbyId, minigameId)`
- [ ] This is the main orchestration method that drives the lifecycle from INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING.
- [ ] Validate minigame exists in registry
- [ ] Validate player count meets minigame's min/max requirements
- [ ] If validation fails, broadcast an error action and return lobby to `WAITING`

#### Step 1: INSTRUCTIONS Phase
- [ ] Transition lobby state to `INSTRUCTIONS`
- [ ] Broadcast `STATE_CHANGED` action
- [ ] Broadcast `rmhbox:game:instructions` with `InstructionsPayload`:
  - `minigameId`, `title`, `description`, `rules[]`, `tips[]`, `controls[]`
  - `durationSeconds`: from minigame definition's `instructionDurationSeconds` (default 15)
  - `estimatedGameDuration`: from minigame definition
  - `playerCount: { min, max, current }`
  - `teams`: boolean
- [ ] Start instruction timer (15 seconds default)
- [ ] When timer expires OR host force-skips: proceed to PRELOADING
- [ ] **Verification:** Instructions phase starts — all clients receive instructions payload with correct data. After 15 seconds, moves to preloading.

#### Step 2: PRELOADING Phase
- [ ] Transition lobby state to `PRELOADING`
- [ ] Broadcast `STATE_CHANGED` action
- [ ] Broadcast `rmhbox:game:preload_start` with `{ manifest: PreloadManifest }` from the minigame definition
- [ ] Track which players have emitted `rmhbox:game:ready_to_render` in a `Set<string>`
- [ ] Register a temporary listener for `rmhbox:game:ready_to_render`:
  - Add userId to the ready set
  - Broadcast `rmhbox:game:preload_progress` with `{ players: [...], allReady: boolean }`
  - If `allReady`: cancel timeout, proceed to COUNTDOWN
- [ ] Start preload timeout (30 seconds):
  - When timeout expires: force-mark all unready players as ready, add system chat warning, proceed to COUNTDOWN
- [ ] **Verification:** All players send ready_to_render — moves to countdown immediately. One player doesn't send it — after 30s, force-proceeds.

#### Step 3: COUNTDOWN Phase
- [ ] Transition lobby state to `COUNTDOWN`
- [ ] Broadcast `STATE_CHANGED` action
- [ ] Broadcast `rmhbox:game:countdown` with `{ seconds: 3 }`
- [ ] Wait 3 seconds (via setTimeout)
- [ ] Proceed to PLAYING
- [ ] **Verification:** Countdown phase lasts exactly 3 seconds, then transitions.

#### Step 4: PLAYING Phase
- [ ] Transition lobby state to `PLAYING`
- [ ] Broadcast `STATE_CHANGED` action
- [ ] Broadcast `rmhbox:game:started` with `{ minigameId }`
- [ ] Instantiate the minigame handler:
  - Look up the class in `MINIGAME_SERVER_REGISTRY`
  - Create `MinigameContext` with all the broadcasting functions, lobbyId, player snapshot, etc.
  - Wrap in try-catch for fault isolation
  - Set `lobby.currentGame = { minigameId, handler: gameInstance, startedAt: Date.now() }`
  - Call `gameInstance.start()`
- [ ] Register `rmhbox:game:input` handler for this lobby:
  - Validate user is a player (not spectator)
  - Route action/data to `gameInstance.handleInput(userId, action, data)`
  - Wrap in try-catch (fault isolation — game errors don't crash the server)
- [ ] Configure `MinigameContext.onComplete` callback → calls `handleGameComplete(lobbyId, results)`
- [ ] Configure `MinigameContext.onError` callback → calls `handleGameError(lobbyId, error)`
- [ ] **Verification:** Game starts — lobby state is PLAYING, game handler is instantiated, players can send game inputs that reach the handler.

### 2.3 Implement `handleGameComplete(lobbyId, results)`
#### Step 5: ROUND_RESULTS Phase
- [ ] Clean up the game handler (call `cleanup()`)
- [ ] Increment `lobby.roundNumber`
- [ ] Update player scores: add each player's round score to their cumulative session score
- [ ] Transition lobby state to `ROUND_RESULTS`
- [ ] Broadcast `STATE_CHANGED` action
- [ ] Broadcast `rmhbox:game:round_results` with `RoundResultsPayload`:
  - `minigameId`, `rankings` (sorted by rank), `awards[]`, `roundNumber`
  - `sessionStandings[]`: cumulative scores sorted by total
- [ ] Add match summary to `lobby.matchHistory`
- [ ] Fire async persistence: `persistMatchResults(...)` (Phase 4 will implement this — for now, log a placeholder)
- [ ] Start results display timer (`RESULTS_DISPLAY_SECONDS` = 10 seconds)
- [ ] When timer expires OR host force-skips: transition back to WAITING
  - Set `lobby.currentGame = null`
  - Reset all players' `isReady = false` and `roundScore = 0`
  - Broadcast `STATE_CHANGED` with `{ newState: 'WAITING' }`
- [ ] **Verification:** Game completes — results are broadcast, scores are updated, lobby returns to WAITING after 10 seconds.

### 2.4 Implement `handleGameError(lobbyId, error)`
- [ ] Log the error with `console.error`
- [ ] Clean up the broken game handler (call `cleanup()` in try-catch)
- [ ] Set `lobby.currentGame = null`
- [ ] Transition lobby state to `WAITING`
- [ ] Broadcast `STATE_CHANGED` action with `{ newState: 'WAITING', reason: 'GAME_ERROR', message: 'The game encountered an error and was ended. Sorry about that!' }`
- [ ] Add system chat message about the error
- [ ] **Verification:** Simulate a game error — lobby returns to WAITING, error message is broadcast, no server crash.

### 2.5 Implement Host Direct Select (No Vote)
- [ ] Implement `selectGame(socket, payload)` handler for `rmhbox:game:select`
- [ ] Validate requesting socket is the host
- [ ] Validate lobby is in `WAITING` state
- [ ] Validate minigameId exists in registry and is eligible for current player count
- [ ] Call `startGameFlow(lobbyId, minigameId)` directly (skip voting)
- [ ] **Verification:** Host selects a game directly — instructions phase begins immediately without voting.

### 2.6 Implement `handleConnection(socket)`
- [ ] Register game-related event listeners:
  - `rmhbox:game:select` → `selectGame`
  - `rmhbox:game:input` → route to current game handler
  - `rmhbox:game:ready_to_render` → handled during preloading
  - `rmhbox:game:force_skip` → handle phase skipping
- [ ] **Verification:** All game events are registered on connection.

### 2.7 Implement Host Force-Skip for All Phases
- [ ] In `forceSkip(socket, payload)`:
  - `VOTING`: resolve vote immediately (handled by VoteManager)
  - `INSTRUCTIONS`: cancel instruction timer, proceed to PRELOADING
  - `PRELOADING`: cancel timeout, force-mark all as ready, proceed to COUNTDOWN
  - `COUNTDOWN`: (don't skip — it's only 3 seconds)
  - `ROUND_RESULTS`: cancel results timer, proceed to WAITING
- [ ] Validate only the host can force-skip
- [ ] **Verification:** Host force-skips each phase — transition occurs immediately.

### 2.8 Implement `handleDisconnect(socket)` on GameCoordinator
- [ ] When a player disconnects during `PLAYING`:
  - Notify the active minigame handler via `handler.handlePlayerDisconnect(userId)`
  - If remaining connected player count < minigame's `minPlayers`: call `forceEnd()`
- [ ] **Verification:** Player disconnects during game — handler is notified. Too few players remain — game force-ends.

---

## 3. State Synchronization Service

### 3.1 Create `server/rmhbox/state-sync.ts`
- [ ] Define `StateSyncService` class with constructor accepting `io: Server`, `lobbyManager: LobbyManager`
- [ ] **Verification:** Instantiate — no errors.

### 3.2 Implement Heartbeat
- [ ] Implement `startHeartbeat()` method
- [ ] Create a `setInterval` running every `HEARTBEAT_INTERVAL_MS` (10 seconds)
- [ ] On each tick, iterate all lobbies:
  - If lobby state is `PLAYING`:
    - For each connected player: build per-player `ClientLobbyState` via `lobbyManager.buildClientState(lobby, userId)`, emit `rmhbox:lobby:state_snapshot` to their personal room `lobby:{lobbyId}:player:{userId}`
    - For each connected spectator: build spectator state, emit `rmhbox:lobby:state_snapshot` to their personal room
- [ ] **Verification:** During gameplay, confirm heartbeat snapshots arrive every ~10 seconds to each connected client.

### 3.3 Implement Phase Transition Sync
- [ ] On every lobby state transition (WAITING → VOTING, VOTING → INSTRUCTIONS, etc.):
  - Send a full `ClientLobbyState` snapshot to every connected member (same logic as heartbeat, but triggered immediately)
- [ ] This ensures all clients are fully synchronized at phase boundaries
- [ ] **Verification:** Transition from WAITING to VOTING — every client receives a full state snapshot (not just the action delta).

### 3.4 Implement Action Sequence Counter
- [ ] Maintain a `seqCounter: Map<string, number>` (lobbyId → current seq)
- [ ] Every time `broadcastAction` is called, increment and attach the seq number
- [ ] Client-side: actions with `seq <= lastSeq` are ignored (duplicate protection)
- [ ] **Verification:** Send 10 actions in sequence — each has a seq 1 higher than the previous. Client receiving an old seq action ignores it.

### 3.5 Implement Timer Tick Broadcasting
- [ ] Create a utility `startTimerBroadcast(lobbyId, durationSeconds, onComplete)`:
  - Emit a `TIMER_TICK` action every 1 second with `{ timeRemaining: seconds }`
  - When `timeRemaining` hits 0, call `onComplete()`
  - Return a cancel function
- [ ] Use this utility in all timed phases: voting (30s), instructions (15s), preloading timeout (30s), countdown (3s), results (10s)
- [ ] **Verification:** Start a 5-second timer — 5 TIMER_TICK actions are broadcast (5, 4, 3, 2, 1, then onComplete fires).

---

## 4. Reconnection Protocol

### 4.1 Create `server/rmhbox/reconnection.ts`
- [ ] Define `ReconnectionHandler` class with constructor accepting `io: Server`, `lobbyManager: LobbyManager`, `stateSyncService: StateSyncService`
- [ ] Maintain `gracePeriodTimers: Map<string, NodeJS.Timeout>` (userId → timeout)
- [ ] **Verification:** Instantiate — no errors.

### 4.2 Implement `attemptReconnect(socket)`
- [ ] Called at the START of every new connection (before lobby handlers)
- [ ] Extract `userId` from `socket.data.userId`
- [ ] Search for the user in any lobby via `lobbyManager.findLobbyByUserId(userId)`
- [ ] If not found: return (normal fresh connection, not a reconnect)
- [ ] If found:
  - Get the player or spectator record
  - Handle duplicate session: if there's already a connected socket for this user:
    - Get the old socket via `io.sockets.sockets.get(existingSocketId)`
    - Emit `rmhbox:error` with `{ code: 'DUPLICATE_SESSION', message: 'Connected from another device' }` to old socket
    - Force disconnect old socket: `oldSocket.disconnect(true)`
  - Update the member record: `socketId = socket.id`, `isConnected = true`, `lastSeenAt = Date.now()`
  - Cancel any active grace period timer for this user
  - Re-join the socket to all appropriate Socket.io rooms:
    - `lobby:{lobbyId}`
    - `lobby:{lobbyId}:players` or `lobby:{lobbyId}:spectators`
    - `lobby:{lobbyId}:player:{userId}`
  - Send full `rmhbox:lobby:state_snapshot` to the reconnecting socket
  - If lobby is `PLAYING` and user is a player:
    - Call `currentGame.handler.getStateForPlayer(userId)` and emit `rmhbox:game:state_snapshot`
    - Call `currentGame.handler.handlePlayerReconnect(userId)` to notify the game
  - If lobby is `PLAYING` and user is a spectator:
    - Call `currentGame.handler.getStateForSpectator()` and emit `rmhbox:game:state_snapshot`
  - Broadcast `PLAYER_CONNECTED` action to lobby: `{ userId, userName }`
  - Add system chat message: `"<userName> reconnected"`
- [ ] **Verification:**
  - Disconnect a player mid-game → reconnect within 120s → player resumes with full state, game state is intact, grace timer is canceled.
  - Connect from a second device while already connected → first socket is disconnected with DUPLICATE_SESSION, second takes over.

### 4.3 Implement `handleDisconnect(socket)` on ReconnectionHandler
- [ ] Extract userId from `socket.data`
- [ ] Find the user's lobby
- [ ] If not in a lobby: return
- [ ] Mark the member as disconnected: `socketId = null`, `isConnected = false`
- [ ] Broadcast `PLAYER_DISCONNECTED` action to lobby
- [ ] Start grace period timer (`DISCONNECT_GRACE_PERIOD_MS` = 120s):
  - Store in `gracePeriodTimers` map
  - On expiry: call `lobbyManager.leaveLobby()` logic (permanent leave)
- [ ] **Verification:** Player disconnects → PLAYER_DISCONNECTED action is broadcast. Wait 120s without reconnect → player is fully removed from lobby.

---

## 5. Spectator State Delivery

### 5.1 Implement Spectator-Specific State
- [ ] In `buildClientState()`:
  - When building state for a spectator (userId is in `spectators` map):
    - Set `myRole: 'spectator'`
    - If game is active: call `currentGame.handler.getStateForSpectator()` to get omniscient view
    - Set `ClientGameInfo.privateState = {}` (empty — spectators have no private state)
- [ ] Ensure spectators receive `rmhbox:game:action` broadcasts (they're in the `lobby:{id}` room)
- [ ] **Verification:** Connect a spectator and a player to a game — spectator sees omniscient state (e.g., all roles revealed in social deduction games), player sees masked state.

### 5.2 Implement Input Gating for Spectators
- [ ] In the `rmhbox:game:input` handler:
  - Before routing to the minigame handler, check that `socket.data.userId` exists in `lobby.players` (not in `spectators`)
  - If the user is a spectator: silently drop the input (no error emitted — just ignore)
- [ ] **Verification:** Spectator sends a game input → it is silently ignored. Player sends the same input → it reaches the game handler.

---

## 6. Join-in-Progress Framework

### 6.1 Implement JIP Policy Enforcement
- [ ] When a player joins a lobby that is in `PLAYING` state:
  - Look up the active minigame's `joinInProgressPolicy` from the registry
  - `spectate_only`: player becomes a spectator (handled in Phase 2's join logic)
  - `join_next_subround`: player becomes a temporary spectator, add to a `pendingJoinPlayers` list
    - The minigame handler should check this list at sub-round boundaries and add the player
  - `join_immediately`: add the player to the game immediately
    - Call `currentGame.handler.handlePlayerJoin(userId)` (new method on BaseMinigame — default implementation is no-op)
- [ ] Add `handlePlayerJoin(userId): void` to `BaseMinigame` with a default no-op implementation
- [ ] Add `getPendingJoinPlayers(lobbyId): string[]` to LobbyManager for games that support `join_next_subround`
- [ ] **Verification:** Join a `spectate_only` game → become spectator. Join a `join_immediately` game → appear in the active game instantly.

---

## 7. Wire Up Services in `server/rmhbox/index.ts`

### 7.1 Instantiate All Services
- [ ] Create service instances in the correct dependency order:
  1. `lobbyManager = new LobbyManager(io)`
  2. `stateSyncService = new StateSyncService(io, lobbyManager)`
  3. `gameCoordinator = new GameCoordinator(io, lobbyManager, stateSyncService)`
  4. `voteManager = new VoteManager(io, lobbyManager, gameCoordinator)`
  5. `chatHandler = new ChatHandler(io, lobbyManager)`
  6. `reconnectionHandler = new ReconnectionHandler(io, lobbyManager, stateSyncService)`
  7. `leaderboardService = new LeaderboardService()` (stub for Phase 4)
- [ ] In `io.on('connection', (socket) => { ... })`:
  - Call `reconnectionHandler.attemptReconnect(socket)` (FIRST — before any other handler)
  - Call `lobbyManager.handleConnection(socket)`
  - Call `gameCoordinator.handleConnection(socket)`
  - Call `voteManager.handleConnection(socket)`
  - Call `chatHandler.handleConnection(socket)`
- [ ] In `socket.on('disconnect')`:
  - Call `lobbyManager.handleDisconnect(socket)`
  - Call `gameCoordinator.handleDisconnect(socket)`
  - Call `reconnectionHandler.handleDisconnect(socket)`
- [ ] Start periodic tasks:
  - `stateSyncService.startHeartbeat()`
  - `lobbyManager.startGarbageCollector()`
- [ ] **Verification:** Server starts with all services initialized. Console logs confirm each service is ready.

---

## 8. Integration Testing

### 8.1 Full Game Lifecycle Test (with Stub Minigame)
- [ ] Create a test minigame class `TestGame extends BaseMinigame` that:
  - On `start()`: sets a 5-second timer, then calls `context.onComplete()` with dummy results
  - On `handleInput()`: logs the input
  - On `getStateForPlayer()`: returns `{ test: true }`
  - On `getStateForSpectator()`: returns `{ test: true, spectator: true }`
  - On `computeResults()`: returns 2 fake rankings
- [ ] Register `TestGame` as `'test-game'` in `MINIGAME_SERVER_REGISTRY`
- [ ] Connect 3 sockets, create a lobby, have 2 join
- [ ] Host starts a vote → vote phase works
- [ ] All vote for test-game → instructions phase starts
- [ ] All send ready_to_render → countdown starts → game starts
- [ ] After 5 seconds → round results appear → lobby returns to WAITING
- [ ] **Verification:** All lifecycle phases transition correctly. All event payloads match expected shapes.

### 8.2 Reconnection Test
- [ ] Player A disconnects during PLAYING
- [ ] Wait 10 seconds, reconnect Player A
- [ ] Player A receives full lobby state + game state
- [ ] Grace timer is canceled
- [ ] Other players see PLAYER_DISCONNECTED then PLAYER_CONNECTED actions
- [ ] **Verification:** All assertions pass, game state is preserved.

### 8.3 Duplicate Session Test
- [ ] Player A connects from Tab 1
- [ ] Player A connects from Tab 2 (same auth token)
- [ ] Tab 1 is force-disconnected with DUPLICATE_SESSION error
- [ ] Tab 2 takes over the player slot
- [ ] **Verification:** Only one socket per user is active.

### 8.4 Force-End Test
- [ ] Start a game with 3 players (minPlayers = 2)
- [ ] 2 players disconnect permanently (grace period expires)
- [ ] 1 player remains but below minPlayers → game force-ends, lobby returns to WAITING
- [ ] **Verification:** Game ends gracefully, remaining player sees error state.

---

## Phase 3 Completion Criteria
- [ ] Voting system works: start vote, cast votes, resolve winner, ties broken, host force-skip
- [ ] Host can directly select a game (bypassing vote)
- [ ] Game lifecycle orchestrates all phases: INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
- [ ] Instructions phase broadcasts correct payload, waitable/skippable
- [ ] Preloading phase tracks ready_to_render from all clients, with 30s timeout
- [ ] Countdown phase broadcasts 3-2-1 and transitions to PLAYING
- [ ] Game handler is instantiated inside try-catch for fault isolation
- [ ] Game inputs are routed through the coordinator to the active handler
- [ ] Game completion triggers score updates and round results broadcast
- [ ] Game errors are caught and lobby returns to WAITING safely
- [ ] Heartbeat sends full state snapshots every 10 seconds during gameplay
- [ ] Phase transitions trigger immediate full state sync to all members
- [ ] Action sequence numbers prevent duplicates and enable ordering
- [ ] Timer tick broadcast utility works for all timed phases
- [ ] Reconnection protocol identifies users by userId, re-maps socket, cancels grace timer
- [ ] Duplicate session handling disconnects old sockets
- [ ] Grace period (120s) removes players who don't reconnect
- [ ] Spectators receive omniscient game state, not player-specific state
- [ ] Spectator game inputs are silently dropped
- [ ] Join-in-progress framework supports all 3 policies
- [ ] All services wired in correct dependency order in index.ts
- [ ] End-to-end test passes with a stub minigame through the full lifecycle
