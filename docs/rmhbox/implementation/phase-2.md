# Phase 2: Lobby System

## Overview
This phase implements the complete lobby lifecycle: creation, joining, leaving, host controls, chat, ready-up, spectator management, lobby browser, and garbage collection. By the end of this phase, players can create lobbies with room codes, join/leave, chat, toggle ready status, and browse public lobbies — all through the standalone WebSocket server established in Phase 1.

## Prerequisites
- Phase 1 complete (server boots, auth works, types/schemas/constants defined)
- `server/rmhbox/index.ts` running on port 7676 with auth middleware

---

## 1. Lobby Manager Core

### 1.1 Create `server/rmhbox/lobby-manager.ts`
- [ ] Import `nanoid` with custom alphabet from `lib/rmhbox/utils.ts` (the `generateRoomCode()` function)
- [ ] Import server types: `RMHboxLobby`, `RMHboxPlayer`, `RMHboxSpectator`, `LobbySettings`
- [ ] Import shared constants: `ROOM_CODE_LENGTH`, `DEFAULT_MAX_PLAYERS`, `DEFAULT_MAX_SPECTATORS`, `CHAT_HISTORY_LENGTH`, `CHAT_MAX_LENGTH`, `LOBBY_IDLE_TIMEOUT_MS`, `LOBBY_ABSOLUTE_TIMEOUT_MS`, `LOBBY_EMPTY_TIMEOUT_MS`, `LOBBY_GC_INTERVAL_MS`
- [ ] Define `LobbyManager` class with constructor accepting `io: Server`
- [ ] Create private `lobbies: Map<string, RMHboxLobby>` storage
- [ ] Create private `userToLobby: Map<string, string>` index (userId → lobbyId) for fast lookup
- [ ] **Verification:** Instantiate `LobbyManager` — no errors, internal maps are empty.

### 1.2 Implement Room Code Generation
- [ ] Implement private `generateUniqueLobbyId(): string` method
  - Calls `generateRoomCode()` to get a 6-char code
  - Checks against `this.lobbies` keys for uniqueness
  - Regenerates on collision (max 10 attempts, then throw)
- [ ] **Verification:** Call `generateUniqueLobbyId()` 100 times — all codes are unique, 6 chars, no ambiguous characters (I, O, 0, 1).

---

## 2. Lobby Creation

### 2.1 Implement `createLobby(socket, payload)`
- [ ] Validate that the user is not already in a lobby (check `userToLobby`)
  - If already in a lobby, emit `rmhbox:error` with `ALREADY_IN_LOBBY` code
- [ ] Generate unique lobby ID via `generateUniqueLobbyId()`
- [ ] Create default `LobbySettings` object, merging with any provided partial settings:
  - `isPublic: false`, `maxPlayers: 8`, `maxSpectators: 20`, `allowMidGameJoin: true`, `allowSpectatorPromotion: true`, `autoStartThreshold: null`, `gameDurationOverride: null`
- [ ] Create `RMHboxPlayer` for the creating user:
  - `userId: socket.data.userId`, `userName: socket.data.userName`, `avatarUrl: socket.data.avatarUrl`
  - `socketId: socket.id`, `isConnected: true`, `isReady: false`
  - `score: 0`, `roundScore: 0`, `joinedAt: Date.now()`, `lastSeenAt: Date.now()`, `role: 'player'`
- [ ] Create `RMHboxLobby` object with the player as host and only member
  - `state: 'WAITING'`, `chat: []`, `currentGame: null`, `matchHistory: []`, `roundNumber: 0`
- [ ] Store lobby in `this.lobbies` map
- [ ] Store `userId → lobbyId` in `this.userToLobby` map
- [ ] Join socket to Socket.io rooms: `lobby:{id}`, `lobby:{id}:players`, `lobby:{id}:player:{userId}`
- [ ] Build and emit `rmhbox:lobby:created` with `{ lobbyId, lobby: ClientLobbyState }` to the socket
- [ ] **Verification:** Create a lobby — response contains a valid 6-char lobbyId. The internal `lobbies` map has 1 entry. The `userToLobby` map maps the userId to the lobbyId. The socket is in the correct rooms.

---

## 3. Lobby Join

### 3.1 Implement `joinLobby(socket, payload)`
- [ ] Validate lobby exists (check `this.lobbies.get(payload.lobbyId)`)
  - If not found, emit `rmhbox:error` with `LOBBY_NOT_FOUND`
- [ ] Validate lobby is not `DISBANDED`
- [ ] Validate user is not already in a lobby
  - If already in a lobby, emit `rmhbox:error` with `ALREADY_IN_LOBBY`
- [ ] Determine join role (player vs spectator):
  - If `asSpectator === true`: join as spectator
  - If lobby state is `PLAYING` and `allowMidGameJoin === false`: force join as spectator
  - If lobby state is `PLAYING` and `allowMidGameJoin === true`: join as spectator
  - If `players.size >= settings.maxPlayers`: force join as spectator
  - Otherwise: join as player
- [ ] If joining as player:
  - Check `players.size < settings.maxPlayers`, else emit `LOBBY_FULL` error
  - Create `RMHboxPlayer` object with all fields populated
  - Add to `lobby.players` Map
  - Join rooms: `lobby:{id}`, `lobby:{id}:players`, `lobby:{id}:player:{userId}`
- [ ] If joining as spectator:
  - Check `spectators.size < settings.maxSpectators`, else emit `LOBBY_FULL` error
  - Create `RMHboxSpectator` object
  - Add to `lobby.spectators` Map
  - Join rooms: `lobby:{id}`, `lobby:{id}:spectators`, `lobby:{id}:player:{userId}`
- [ ] Update `userToLobby` map
- [ ] Update `lobby.lastActivityAt`
- [ ] Broadcast `PLAYER_JOINED` or `SPECTATOR_JOINED` game action to all members in `lobby:{id}`
- [ ] Send full `rmhbox:lobby:state_snapshot` to the joining socket
- [ ] Add system chat message: `"<userName> joined"`
- [ ] **Verification:** 
  - Join an existing lobby — new player appears in the lobby's `players` map, all existing sockets receive the `PLAYER_JOINED` action, joining socket receives state snapshot.
  - Try to join a full lobby — error is emitted, player is not added.
  - Join during a game — player is added as spectator.

---

## 4. Lobby Leave

### 4.1 Implement `leaveLobby(socket, payload)`
- [ ] Find the lobby the user is in (via `userToLobby`)
- [ ] Determine if user is a player or spectator
- [ ] Remove from the appropriate map (`players` or `spectators`)
- [ ] Remove from `userToLobby`
- [ ] Leave all Socket.io rooms for this lobby
- [ ] Handle host succession if the leaving player was the host:
  - Find the next player by earliest `joinedAt`
  - If no players remain but spectators exist, promote earliest spectator to player and make them host
  - If nobody remains, mark lobby as `DISBANDED` and schedule cleanup
  - Broadcast `HOST_TRANSFERRED` action if host changed
- [ ] If a game is `PLAYING`:
  - Notify the active minigame handler via `handlePlayerDisconnect(userId)`
  - If player count drops below the minigame's `minPlayers`, call `gameCoordinator.forceEndGame(lobbyId)`
- [ ] Broadcast `PLAYER_LEFT` or `SPECTATOR_LEFT` action to remaining lobby members
- [ ] Add system chat message: `"<userName> left"`
- [ ] Update `lobby.lastActivityAt`
- [ ] **Verification:**
  - Leave a lobby — player is removed, remaining players see `PLAYER_LEFT` action.
  - Last player leaves — lobby is marked `DISBANDED`.
  - Host leaves — next earliest player becomes host, `HOST_TRANSFERRED` is broadcast.
  - Leave during game with too few remaining — game force-ends.

### 4.2 Implement `handleDisconnect(socket)`
- [ ] Called when a socket disconnects (not an explicit leave)
- [ ] Find the lobby via `userToLobby` using `socket.data.userId`
- [ ] Set `player.socketId = null` and `player.isConnected = false`
- [ ] Broadcast `PLAYER_DISCONNECTED` action to lobby
- [ ] Start the grace period timer (120 seconds) — store timer reference on the lobby/player for cancellation
- [ ] If grace period expires without reconnect: call the same logic as `leaveLobby()`
- [ ] **Verification:** Disconnect a socket — player is marked disconnected but still in the lobby. After 120s, player is fully removed.

---

## 5. Host Controls

### 5.1 Implement `kickPlayer(socket, payload)`
- [ ] Validate the requesting socket is the host (`socket.data.userId === lobby.hostUserId`)
  - If not, emit `rmhbox:error` with `NOT_HOST`
- [ ] Validate the target user is in the lobby and is not the host themselves
- [ ] Remove the target player from the lobby (similar to leave logic)
- [ ] Emit `rmhbox:lobby:kicked` with `{ reason: 'Kicked by host' }` to the kicked player's socket
- [ ] Force-disconnect the kicked player's socket from the lobby rooms
- [ ] Broadcast `PLAYER_KICKED` action to remaining lobby members
- [ ] Add system chat message: `"<userName> was kicked by the host"`
- [ ] **Verification:** Host kicks a player — kicked player receives the kicked event, is removed from the lobby, remaining players see the action.

### 5.2 Implement `transferHost(socket, payload)`
- [ ] Validate requesting socket is the current host
- [ ] Validate target user is a player in the lobby
- [ ] Set `lobby.hostUserId = payload.targetUserId`
- [ ] Broadcast `HOST_TRANSFERRED` action with `{ newHostUserId, newHostUserName }`
- [ ] Add system chat message: `"Host transferred to <userName>"`
- [ ] **Verification:** Transfer host — `hostUserId` changes, all players receive the action.

### 5.3 Implement `updateSettings(socket, payload)`
- [ ] Validate requesting socket is the host
- [ ] Validate lobby is in `WAITING` state (settings can only be changed when not in a game)
- [ ] Merge partial settings into `lobby.settings` with validation:
  - `maxPlayers`: clamp between 2 and 16
  - `maxSpectators`: clamp between 0 and 50
  - Validate boolean fields are booleans
- [ ] Broadcast `SETTINGS_UPDATED` action with the new settings
- [ ] **Verification:** Update settings — new values are applied, broadcast received by all members. Attempt to update during `PLAYING` — rejected.

### 5.4 Implement `endSession(socket, payload)`
- [ ] Validate requesting socket is the host
- [ ] Transition lobby state to `SESSION_RESULTS`
- [ ] If a game is currently `PLAYING`, force-end it first
- [ ] Broadcast `rmhbox:game:session_results` with cumulative standings and match history
- [ ] Start a timer (e.g., 15 seconds), then transition to `DISBANDED`
- [ ] On disband: emit `rmhbox:lobby:disbanded` to all sockets, clean up all rooms, remove lobby from memory
- [ ] **Verification:** Host ends session — all players receive session results, then the disbanded event.

---

## 6. Chat System

### 6.1 Create `server/rmhbox/chat.ts`
- [ ] Define `ChatHandler` class with constructor accepting `io: Server, lobbyManager: LobbyManager`
- [ ] Implement `handleConnection(socket)`:
  - Register `rmhbox:lobby:chat` listener on the socket (validated with `ChatSchema`)
- [ ] Implement chat message handler:
  - Find the user's lobby
  - Validate the user is in the lobby (player or spectator)
  - Sanitize chat content with `sanitizeString(content, CHAT_MAX_LENGTH)`
  - Create `ChatMessage` object with unique `id` (nanoid), userId, userName, content, timestamp, type: 'user'
  - Add to `lobby.chat` array (ring buffer: if `chat.length > CHAT_HISTORY_LENGTH`, remove oldest)
  - Broadcast `CHAT_MESSAGE` game action to all in `lobby:{lobbyId}` room
  - Update `lobby.lastActivityAt`
- [ ] Implement `addSystemChat(lobbyId, message)`: create a system ChatMessage with type: 'system'
- [ ] **Verification:** Send a chat message — all lobby members receive it. Send >100 messages — oldest are trimmed. Send a message with HTML tags — they are stripped.

---

## 7. Ready-Up System

### 7.1 Implement Ready Toggle
- [ ] Register `rmhbox:lobby:toggle_ready` listener (validated with `ToggleReadySchema`)
- [ ] Find the user's lobby and player record
- [ ] Toggle `player.isReady = !player.isReady`
- [ ] Broadcast `PLAYER_READY_CHANGED` action with `{ userId, isReady }`
- [ ] Check auto-start threshold: if `settings.autoStartThreshold` is set and the count of ready players >= threshold, trigger game selection flow (emit to host or auto-start vote)
- [ ] **Verification:** Toggle ready — `isReady` flips, all players see the change. Set auto-start threshold to 2 with 2 players — when both ready, auto-start triggers.

---

## 8. Spectator Management

### 8.1 Implement Spectator Promotion
- [ ] Register `rmhbox:lobby:request_promotion` listener (validated with `RequestPromotionSchema`)
- [ ] Validate lobby is in `WAITING` or `ROUND_RESULTS` state
- [ ] Validate `settings.allowSpectatorPromotion` is true
- [ ] Validate `players.size < settings.maxPlayers`
- [ ] Move the spectator from `lobby.spectators` to `lobby.players`:
  - Create a new `RMHboxPlayer` from the spectator data
  - Remove from spectators map, add to players map
  - Leave `lobby:{id}:spectators` room, join `lobby:{id}:players` room
- [ ] Broadcast `SPECTATOR_PROMOTED` action with `{ userId, userName }`
- [ ] Add system chat message: `"<userName> joined as a player"`
- [ ] **Verification:** Spectator requests promotion during WAITING — they become a player. Request during PLAYING — rejected. Request when lobby is full — rejected with `LOBBY_FULL`.

---

## 9. Lobby Browser

### 9.1 Implement Public Lobby Browsing
- [ ] Register `rmhbox:lobby:browse` listener (validated with `BrowseLobbiesSchema`)
- [ ] Note: This event does NOT require the user to be in a lobby (can be called from the landing page)
- [ ] Filter all lobbies where `settings.isPublic === true` and `state !== 'DISBANDED'`
- [ ] Sort by `players.size` descending (most active first)
- [ ] Apply pagination using cursor/limit
  - If cursor is provided, skip lobbies until cursor lobby is found, then return next `limit` lobbies
  - Otherwise return first `limit` lobbies
- [ ] Map each lobby to `PublicLobbyInfo`:
  - `lobbyId`, `hostName` (get from host player's userName), `playerCount`, `maxPlayers`, `spectatorCount`, `state`, `currentGame` (display name if playing, null otherwise), `roundNumber`
- [ ] Emit `rmhbox:lobby:browse_result` with `{ lobbies, nextCursor }` to the requesting socket
- [ ] **Verification:** Create 3 public lobbies and 2 private — browse returns only the 3 public ones. Pagination works correctly with limit=1.

---

## 10. Build Client State

### 10.1 Implement `buildClientState(lobby, userId): ClientLobbyState`
- [ ] Map `lobby.players` to `ClientPlayerInfo[]`: include `isHost: player.userId === lobby.hostUserId`
- [ ] Map `lobby.spectators` to `ClientSpectatorInfo[]`
- [ ] Determine `myRole: 'player' | 'spectator'` based on whether userId is in players or spectators map
- [ ] Build `ClientGameInfo` if `lobby.currentGame` is not null:
  - Call `currentGame.handler.getStateForPlayer(userId)` or `getStateForSpectator()` depending on role
  - Package into `publicState` and `privateState`
- [ ] Assemble `ClientLobbyState` with all fields including `seq` (incrementing sequence counter per lobby)
- [ ] Ensure no internal server data leaks (no Maps, no socketIds, no timer references)
- [ ] **Verification:** Build client state for a player and a spectator in the same lobby — player sees their role as 'player', spectator as 'spectator'. No `socketId` or internal fields appear in the output.

---

## 11. Lobby Garbage Collection

### 11.1 Implement GC Interval
- [ ] Create `startGarbageCollector()` method on `LobbyManager`
- [ ] Run every `LOBBY_GC_INTERVAL_MS` (60 seconds)
- [ ] For each lobby in `this.lobbies`:
  - If `state === 'WAITING'` and `lastActivityAt` is older than `LOBBY_IDLE_TIMEOUT_MS` (15 min): disband
  - If `lastActivityAt` is older than `LOBBY_ABSOLUTE_TIMEOUT_MS` (30 min) regardless of state: force-disband
  - If ALL players AND spectators have `isConnected === false` for more than `LOBBY_EMPTY_TIMEOUT_MS` (2 min): disband
- [ ] On disband:
  - Emit `rmhbox:lobby:disbanded` with `{ reason: 'Inactive lobby' }` to all remaining sockets
  - Remove all sockets from lobby rooms
  - Delete lobby from `this.lobbies` map
  - Delete all userId entries from `this.userToLobby` map
  - Cancel any active grace period timers
  - Log the cleanup
- [ ] **Verification:** Create a lobby, don't interact for 15 minutes — lobby is garbage collected. Create a lobby, have all players disconnect for 2 minutes — lobby is cleaned up.

---

## 12. Helper Methods

### 12.1 Implement Lookup Methods on LobbyManager
- [ ] `getLobby(lobbyId): RMHboxLobby | undefined`
- [ ] `getLobbyByUserId(userId): RMHboxLobby | undefined` — uses `userToLobby` index
- [ ] `getLobbyBySocketId(socketId): RMHboxLobby | undefined` — iterates players/spectators to find matching socketId
- [ ] `findLobbyByUserId(userId): RMHboxLobby | undefined` — alias for `getLobbyByUserId`
- [ ] **Verification:** Create a lobby, call each lookup method — correct lobby is returned. Call with nonexistent IDs — returns undefined.

### 12.2 Implement Broadcasting Methods on LobbyManager
- [ ] `broadcastAction(lobbyId, action: Partial<GameAction>)` — auto-assign `seq` and `timestamp`, emit `rmhbox:game:action` to `lobby:{lobbyId}`
  - Maintain a per-lobby `seq` counter that increments on every action
- [ ] `broadcastToPlayers(lobbyId, event, data)` — emit to `lobby:{lobbyId}:players`
- [ ] `broadcastToSpectators(lobbyId, event, data)` — emit to `lobby:{lobbyId}:spectators`
- [ ] `sendToPlayer(lobbyId, userId, event, data)` — emit to `lobby:{lobbyId}:player:{userId}`
- [ ] `addSystemChat(lobbyId, message)` — create system ChatMessage and broadcast
- [ ] **Verification:** Broadcast an action — all connected sockets in the lobby receive it with a valid `seq` and `timestamp`. Send to a specific player — only that player receives it.

---

## 13. Wire Up Event Handlers

### 13.1 Register All Lobby Events in `server/rmhbox/index.ts`
- [ ] In the `io.on('connection')` handler:
  - Call `lobbyManager.handleConnection(socket)` which registers all lobby event listeners on the socket
  - Call `chatHandler.handleConnection(socket)` which registers chat listeners
- [ ] In `handleConnection(socket)` on `LobbyManager`:
  - `socket.on('rmhbox:lobby:create', validated(CreateLobbySchema, (s, d) => this.createLobby(s, d)))`
  - `socket.on('rmhbox:lobby:join', validated(JoinLobbySchema, (s, d) => this.joinLobby(s, d)))`
  - `socket.on('rmhbox:lobby:leave', validated(LeaveLobbySchema, (s, d) => this.leaveLobby(s, d)))`
  - `socket.on('rmhbox:lobby:kick', validated(KickPlayerSchema, (s, d) => this.kickPlayer(s, d)))`
  - `socket.on('rmhbox:lobby:transfer_host', validated(TransferHostSchema, (s, d) => this.transferHost(s, d)))`
  - `socket.on('rmhbox:lobby:update_settings', validated(UpdateSettingsSchema, (s, d) => this.updateSettings(s, d)))`
  - `socket.on('rmhbox:lobby:end_session', validated(EndSessionSchema, (s, d) => this.endSession(s, d)))`
  - `socket.on('rmhbox:lobby:toggle_ready', validated(ToggleReadySchema, (s, d) => this.toggleReady(s, d)))`
  - `socket.on('rmhbox:lobby:request_promotion', validated(RequestPromotionSchema, (s, d) => this.requestPromotion(s, d)))`
  - `socket.on('rmhbox:lobby:browse', validated(BrowseLobbiesSchema, (s, d) => this.browseLobbies(s, d)))`
- [ ] In the `socket.on('disconnect')` handler in `index.ts`:
  - Call `lobbyManager.handleDisconnect(socket)`
- [ ] **Verification:** Connect a socket and emit each event — the correct handler is invoked. Emit with invalid payloads — Zod validation rejects with `INVALID_PAYLOAD` error.

---

## 14. Integration Testing

### 14.1 End-to-End Lobby Lifecycle Test
- [ ] Connect two authenticated sockets
- [ ] Socket A creates a lobby → receives `lobby:created` with valid lobbyId
- [ ] Socket B joins the lobby → Socket A receives `PLAYER_JOINED` action, Socket B receives `state_snapshot`
- [ ] Socket A sends a chat message → both sockets receive it
- [ ] Socket B toggles ready → both sockets see `PLAYER_READY_CHANGED`
- [ ] Socket A (host) kicks Socket B → Socket B receives `kicked`, Socket A sees `PLAYER_KICKED`
- [ ] Socket B joins again → succeeds
- [ ] Socket A transfers host to Socket B → both see `HOST_TRANSFERRED`
- [ ] Socket B (now host) updates settings → both see `SETTINGS_UPDATED`
- [ ] Socket A leaves → Socket B sees `PLAYER_LEFT`, Socket B is still host
- [ ] Socket B leaves → lobby is auto-disbanded
- [ ] **Verification:** All assertions pass. No memory leaks (lobbies map is empty after full lifecycle).

### 14.2 Edge Case Tests
- [ ] Attempt to join a non-existent lobby → `LOBBY_NOT_FOUND` error
- [ ] Attempt to create a lobby while already in one → `ALREADY_IN_LOBBY` error
- [ ] Attempt host actions from a non-host socket → `NOT_HOST` error
- [ ] Fill a lobby to `maxPlayers` then attempt to join → overflow joins as spectator or gets `LOBBY_FULL`
- [ ] All players disconnect → after 2 min, lobby is garbage collected
- [ ] **Verification:** All edge cases produce the correct error codes and no server crashes.

---

## Phase 2 Completion Criteria
- [ ] Players can create lobbies with unique 6-character room codes
- [ ] Players can join lobbies by room code (as player or spectator)
- [ ] Players can leave lobbies with proper host succession
- [ ] Host controls work: kick, transfer host, update settings, end session
- [ ] Chat system works with sanitization and ring buffer
- [ ] Ready toggle works with auto-start threshold support
- [ ] Spectator promotion works between rounds
- [ ] Public lobby browser works with pagination
- [ ] `buildClientState()` produces properly sanitized client state
- [ ] Garbage collection cleans up idle/empty lobbies
- [ ] All events are wired through the `validated()` wrapper with Zod schemas
- [ ] Per-socket rate limiting is applied to all lobby events
- [ ] All lobby operations are tested end-to-end
