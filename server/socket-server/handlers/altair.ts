/**
 * Altair Multiplayer — Handler for the unified socket server.
 *
 * Manages lobbies, game coordination, state sync, and chat
 * for the Altair co-op multiplayer mode.
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString } from '../utils';
import { config } from '../config';

// ── Event Constants ────────────────────────────────────────────────

const C2S = {
  LOBBY_CREATE:          'altair:lobby:create',
  LOBBY_JOIN:            'altair:lobby:join',
  LOBBY_LEAVE:           'altair:lobby:leave',
  LOBBY_BROWSE:          'altair:lobby:browse',
  LOBBY_UPDATE_SETTINGS: 'altair:lobby:update_settings',
  LOBBY_KICK:            'altair:lobby:kick',
  LOBBY_TRANSFER_HOST:   'altair:lobby:transfer_host',
  LOBBY_CHAT:            'altair:lobby:chat',
  CLASS_SELECT:          'altair:class:select',
  CLASS_READY:           'altair:class:ready',
  GAME_START:            'altair:game:start',
  GAME_INPUT:            'altair:game:input',
  GAME_LEVEL_UP_CHOICE:  'altair:game:level_up_choice',
  GAME_STATE_SNAPSHOT:   'altair:game:state_snapshot',
  GAME_PING:             'altair:game:ping',
  GAME_QUICK_CHAT:       'altair:game:quick_chat',
} as const;

const S2C = {
  LOBBY_CREATED:        'altair:lobby:created',
  LOBBY_STATE_SNAPSHOT:  'altair:lobby:state_snapshot',
  LOBBY_BROWSE_RESULT:   'altair:lobby:browse_result',
  LOBBY_KICKED:          'altair:lobby:kicked',
  LOBBY_DISBANDED:       'altair:lobby:disbanded',
  CLASS_SELECT_STATE:    'altair:class:select_state',
  GAME_COUNTDOWN:        'altair:game:countdown',
  GAME_STARTED:          'altair:game:started',
  GAME_STATE_SNAPSHOT:   'altair:game:state_snapshot',
  GAME_EVENT:            'altair:game:event',
  GAME_PLAYER_JOINED:    'altair:game:player_joined',
  GAME_PLAYER_LEFT:      'altair:game:player_left',
  GAME_RESULTS:          'altair:game:results',
  GAME_PING:             'altair:game:ping_broadcast',
  GAME_QUICK_CHAT:       'altair:game:quick_chat_broadcast',
  ERROR:                 'altair:error',
} as const;

// ── Types ──────────────────────────────────────────────────────────

type LobbyState = 'WAITING' | 'CLASS_SELECT' | 'COUNTDOWN' | 'PLAYING' | 'RESULTS' | 'DISBANDED';
type Visibility = 'public' | 'friends_only' | 'private';
type DropInWindow = 'first_5min' | 'first_10min' | 'anytime';

interface LobbySettings {
  maxPlayers: 2 | 3 | 4;
  visibility: Visibility;
  doubleTime: boolean;
  dropInAllowed: boolean;
  dropInWindow: DropInWindow;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

interface PlayerRunState {
  level: number;
  kills: number;
  coins: number;
  timeSurvived: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  wasAliveAtEnd: boolean;
  coinBreakdown: {
    enemyDrops: number;
    bossKills: number;
    chestDrops: number;
    survivalBonus: number;
    killMilestones: number;
    completionBonus: number;
    firstClearBonus: number;
  };
}

interface AltairPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  isReady: boolean;
  slot: number;
  classId: string | null;
  joinedAt: number;
  lastSeenAt: number;
  runState: PlayerRunState | null;
}

interface AltairLobby {
  id: string;
  hostUserId: string;
  settings: LobbySettings;
  players: Map<string, AltairPlayer>;
  state: LobbyState;
  chat: ChatMessage[];
  createdAt: number;
  lastActivityAt: number;
  gameStartedAt: number | null;
  lastSnapshot: unknown;
  bossesDefeated: string[];
  sharedKills: number;
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_LOBBIES = 100;
const MAX_PLAYERS_PER_LOBBY = 4;
const LOBBY_CODE_LENGTH = 6;
const LOBBY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const GC_INTERVAL_MS = 60 * 1000;
const DISCONNECT_GRACE_MS = 10_000;
const COUNTDOWN_SECONDS = 5;
const SLOT_COLORS = ['#4A9EFF', '#FF4A4A', '#4AFF7A', '#FFD84A'];

const DEFAULT_SETTINGS: LobbySettings = {
  maxPlayers: 4,
  visibility: 'private',
  doubleTime: false,
  dropInAllowed: true,
  dropInWindow: 'first_10min',
};

// ── State ──────────────────────────────────────────────────────────

const lobbies = new Map<string, AltairLobby>();
const userToLobby = new Map<string, string>();
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const countdownTimers = new Map<string, ReturnType<typeof setInterval>>();
let gcInterval: ReturnType<typeof setInterval> | null = null;
let ioRef: Server;

// ── Helpers ────────────────────────────────────────────────────────

let msgIdCounter = 0;
function genMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`;
}

function getSlotColor(slot: number): string {
  return SLOT_COLORS[slot % SLOT_COLORS.length];
}

function createInitialRunState(): PlayerRunState {
  return {
    level: 1, kills: 0, coins: 0, timeSurvived: 0,
    revivesGiven: 0, revivesReceived: 0, wasDowned: false, wasAliveAtEnd: true,
    coinBreakdown: {
      enemyDrops: 0, bossKills: 0, chestDrops: 0,
      survivalBonus: 0, killMilestones: 0, completionBonus: 0, firstClearBonus: 0,
    },
  };
}

function buildClientState(lobby: AltairLobby, userId: string) {
  const players = [];
  for (const [, p] of lobby.players) {
    players.push({
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      isConnected: p.isConnected,
      isHost: p.userId === lobby.hostUserId,
      slot: p.slot,
      classId: p.classId,
      isReady: p.isReady,
      color: getSlotColor(p.slot),
    });
  }
  return {
    lobbyId: lobby.id,
    hostUserId: lobby.hostUserId,
    state: lobby.state,
    settings: lobby.settings,
    players,
    chat: lobby.chat.slice(-50),
    myUserId: userId,
    seq: Date.now(),
  };
}

function broadcastToLobby(lobbyId: string, event: string, data: unknown): void {
  ioRef.to(`altair:${lobbyId}`).emit(event, data);
}

function broadcastFullSync(lobby: AltairLobby): void {
  for (const [, player] of lobby.players) {
    if (!player.socketId) continue;
    const socket = ioRef.sockets.sockets.get(player.socketId);
    if (socket) {
      socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, player.userId));
    }
  }
}

function addSystemChat(lobbyId: string, message: string): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const chatMsg: ChatMessage = {
    id: genMsgId(),
    userId: 'system',
    userName: 'System',
    text: message,
    isSystem: true,
    timestamp: Date.now(),
  };
  lobby.chat.push(chatMsg);
  if (lobby.chat.length > 100) lobby.chat.splice(0, lobby.chat.length - 100);
}

function generateUniqueLobbyId(): string {
  for (let i = 0; i < 10; i++) {
    const code = generateRoomCode(LOBBY_CODE_LENGTH);
    if (!lobbies.has(code)) return code;
  }
  throw new Error('Failed to generate unique lobby ID');
}

function disbandLobby(lobbyId: string): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  lobby.state = 'DISBANDED';
  broadcastToLobby(lobbyId, S2C.LOBBY_DISBANDED, {});
  for (const [userId] of lobby.players) {
    userToLobby.delete(userId);
  }
  lobbies.delete(lobbyId);
}

function removePlayer(lobby: AltairLobby, userId: string): void {
  const player = lobby.players.get(userId);
  if (!player) return;

  const userName = player.userName;
  lobby.players.delete(userId);
  userToLobby.delete(userId);

  if (player.socketId) {
    const socket = ioRef.sockets.sockets.get(player.socketId);
    if (socket) socket.leave(`altair:${lobby.id}`);
  }

  if (lobby.players.size === 0) {
    disbandLobby(lobby.id);
    return;
  }

  // Transfer host if needed
  if (lobby.hostUserId === userId) {
    const nextHost = [...lobby.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (nextHost) {
      lobby.hostUserId = nextHost.userId;
      addSystemChat(lobby.id, `Host transferred to ${nextHost.userName}`);
    }
  }

  addSystemChat(lobby.id, `${userName} left`);
  broadcastFullSync(lobby);

  if (lobby.state === 'PLAYING') {
    broadcastToLobby(lobby.id, S2C.GAME_PLAYER_LEFT, { userId });
  }
}

function broadcastClassSelections(lobby: AltairLobby): void {
  const selections: Record<string, string | null> = {};
  const readyStates: Record<string, boolean> = {};
  for (const [userId, player] of lobby.players) {
    selections[userId] = player.classId;
    readyStates[userId] = player.isReady;
  }
  broadcastToLobby(lobby.id, S2C.CLASS_SELECT_STATE, { selections, readyStates });
}

function buildCurrentResults(lobby: AltairLobby, victory: boolean) {
  const players = [];
  for (const [, player] of lobby.players) {
    const run = player.runState || createInitialRunState();
    players.push({
      userId: player.userId,
      userName: player.userName,
      classId: player.classId || 'knight',
      slot: player.slot,
      level: run.level,
      kills: run.kills,
      coinsEarned: run.coins,
      timeSurvived: run.timeSurvived,
      revivesGiven: run.revivesGiven,
      revivesReceived: run.revivesReceived,
      wasDowned: run.wasDowned,
      wasAliveAtEnd: run.wasAliveAtEnd,
      coinBreakdown: { ...run.coinBreakdown },
    });
  }
  return {
    lobbyId: lobby.id,
    victory,
    sharedKills: lobby.sharedKills,
    timeSurvived: lobby.gameStartedAt ? (Date.now() - lobby.gameStartedAt) / 1000 : 0,
    bossesDefeated: lobby.bossesDefeated,
    doubleTime: lobby.settings.doubleTime,
    players,
  };
}

function endGame(lobbyId: string, results: ReturnType<typeof buildCurrentResults>): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.state = 'RESULTS';
  broadcastToLobby(lobbyId, S2C.GAME_RESULTS, results);

  setTimeout(() => {
    if (lobby.state !== 'RESULTS') return;
    lobby.state = 'WAITING';
    lobby.gameStartedAt = null;
    lobby.lastSnapshot = null;
    for (const [, player] of lobby.players) {
      player.isReady = false;
      player.classId = null;
      player.runState = null;
    }
    broadcastFullSync(lobby);
  }, 15000);
}

function attemptHostMigration(lobby: AltairLobby): void {
  const remaining = [...lobby.players.values()]
    .filter((p) => p.isConnected && p.userId !== lobby.hostUserId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (remaining.length === 0) {
    endGame(lobby.id, buildCurrentResults(lobby, false));
    return;
  }

  const newHost = remaining[0];
  lobby.hostUserId = newHost.userId;

  if (lobby.lastSnapshot && newHost.socketId) {
    const hostSocket = ioRef.sockets.sockets.get(newHost.socketId);
    if (hostSocket) {
      hostSocket.emit(S2C.GAME_EVENT, {
        type: 'host_migration',
        data: { lastSnapshot: lobby.lastSnapshot },
        timestamp: Date.now(),
      });
    }
  }

  addSystemChat(lobby.id, `Host migrated to ${newHost.userName}`);
  broadcastFullSync(lobby);
}

// ── Lobby Event Handlers ───────────────────────────────────────────

function onLobbyCreate(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string | null) ?? null;

  if (!userId) {
    socket.emit(S2C.ERROR, { code: 'AUTH_REQUIRED', message: 'Must be logged in.' });
    return;
  }

  if (userToLobby.has(userId)) {
    // Self-heal: if the lobby no longer exists, clean up the stale entry
    const existingLobbyId = userToLobby.get(userId)!;
    const existingLobby = lobbies.get(existingLobbyId);
    if (!existingLobby || !existingLobby.players.has(userId)) {
      userToLobby.delete(userId);
    } else {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_LOBBY', message: 'Already in a lobby.' });
      return;
    }
  }

  if (lobbies.size >= MAX_LOBBIES) {
    socket.emit(S2C.ERROR, { code: 'INTERNAL_ERROR', message: 'Server full.' });
    return;
  }

  const lobbyId = generateUniqueLobbyId();
  const settings: LobbySettings = { ...DEFAULT_SETTINGS, ...payload?.settings };
  settings.maxPlayers = Math.max(2, Math.min(4, settings.maxPlayers)) as 2 | 3 | 4;

  const now = Date.now();
  const player: AltairPlayer = {
    userId, userName, avatarUrl, socketId: socket.id,
    isConnected: true, isReady: false, slot: 0, classId: null,
    joinedAt: now, lastSeenAt: now, runState: null,
  };

  const lobby: AltairLobby = {
    id: lobbyId, hostUserId: userId, settings,
    players: new Map([[userId, player]]),
    state: 'WAITING', chat: [], createdAt: now, lastActivityAt: now,
    gameStartedAt: null, lastSnapshot: null, bossesDefeated: [], sharedKills: 0,
  };

  lobbies.set(lobbyId, lobby);
  userToLobby.set(userId, lobbyId);
  socket.join(`altair:${lobbyId}`);
  socket.emit(S2C.LOBBY_CREATED, { lobbyId, lobby: buildClientState(lobby, userId) });
}

function onLobbyJoin(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string | null) ?? null;

  if (!userId) {
    socket.emit(S2C.ERROR, { code: 'AUTH_REQUIRED', message: 'Must be logged in.' });
    return;
  }

  const lobbyId = typeof payload?.lobbyId === 'string' ? payload.lobbyId.trim() : '';
  const lobby = lobbies.get(lobbyId);
  if (!lobby || lobby.state === 'DISBANDED') {
    socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
    return;
  }

  if (userToLobby.has(userId)) {
    const existingLobbyId = userToLobby.get(userId)!;
    const existingLobby = lobbies.get(existingLobbyId);
    if (!existingLobby || !existingLobby.players.has(userId)) {
      userToLobby.delete(userId);
    } else if (existingLobbyId === lobbyId) {
      // Already in this lobby (e.g. creator navigated to lobby page, or page refresh)
      // Treat as a reconnect: update socket and send current state
      const player = existingLobby.players.get(userId)!;
      player.isConnected = true;
      player.socketId = socket.id;
      player.lastSeenAt = Date.now();
      socket.join(`altair:${lobbyId}`);
      socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(existingLobby, userId));
      broadcastFullSync(existingLobby);
      return;
    } else {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_LOBBY', message: 'Already in a lobby.' });
      return;
    }
  }

  if (lobby.players.size >= lobby.settings.maxPlayers) {
    socket.emit(S2C.ERROR, { code: 'LOBBY_FULL', message: 'Lobby is full.' });
    return;
  }

  if (lobby.state === 'PLAYING') {
    if (!lobby.settings.dropInAllowed) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_IN_GAME', message: 'Game in progress, drop-in disabled.' });
      return;
    }
    if (lobby.gameStartedAt) {
      const elapsed = (Date.now() - lobby.gameStartedAt) / 1000;
      const windowMinutes = lobby.settings.dropInWindow === 'first_5min' ? 5
        : lobby.settings.dropInWindow === 'first_10min' ? 10 : Infinity;
      if (elapsed > windowMinutes * 60) {
        socket.emit(S2C.ERROR, { code: 'DROP_IN_CLOSED', message: 'Drop-in window has closed.' });
        return;
      }
    }
  } else if (lobby.state !== 'WAITING' && lobby.state !== 'CLASS_SELECT') {
    socket.emit(S2C.ERROR, { code: 'LOBBY_IN_GAME', message: 'Game in progress.' });
    return;
  }

  // Assign next available slot
  const usedSlots = new Set<number>();
  for (const [, p] of lobby.players) usedSlots.add(p.slot);
  let slot = 0;
  while (usedSlots.has(slot)) slot++;

  const now = Date.now();
  const player: AltairPlayer = {
    userId, userName, avatarUrl, socketId: socket.id,
    isConnected: true, isReady: false, slot, classId: null,
    joinedAt: now, lastSeenAt: now, runState: null,
  };

  lobby.players.set(userId, player);
  userToLobby.set(userId, lobby.id);
  socket.join(`altair:${lobby.id}`);
  lobby.lastActivityAt = now;

  socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, userId));
  broadcastFullSync(lobby);
  addSystemChat(lobby.id, `${userName} joined`);

  if (lobby.state === 'PLAYING') {
    broadcastToLobby(lobby.id, S2C.GAME_PLAYER_JOINED, {
      player: {
        userId, userName, avatarUrl, isConnected: true, isHost: false,
        slot, classId: null, isReady: false, color: getSlotColor(slot),
      },
    });
  }
}

function onLobbyLeave(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;
  removePlayer(lobby, userId);
  socket.leave(`altair:${lobby.id}`);
}

function onLobbyBrowse(io: Server, socket: Socket): void {
  const publicLobbies = [];
  for (const [, lobby] of lobbies) {
    if (lobby.settings.visibility !== 'public') continue;
    if (lobby.state === 'DISBANDED') continue;
    if (lobby.players.size >= lobby.settings.maxPlayers) continue;
    if (lobby.state === 'PLAYING' && !lobby.settings.dropInAllowed) continue;

    const host = lobby.players.get(lobby.hostUserId);
    publicLobbies.push({
      lobbyId: lobby.id,
      hostName: host?.userName ?? 'Unknown',
      playerCount: lobby.players.size,
      maxPlayers: lobby.settings.maxPlayers,
      doubleTime: lobby.settings.doubleTime,
      dropInAllowed: lobby.settings.dropInAllowed,
      state: lobby.state,
    });
  }
  socket.emit(S2C.LOBBY_BROWSE_RESULT, { lobbies: publicLobbies });
}

function onLobbyUpdateSettings(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;
  if (lobby.hostUserId !== userId) {
    socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can change settings.' });
    return;
  }
  Object.assign(lobby.settings, payload?.settings);
  lobby.settings.maxPlayers = Math.max(2, Math.min(4, lobby.settings.maxPlayers)) as 2 | 3 | 4;
  lobby.lastActivityAt = Date.now();
  broadcastFullSync(lobby);
}

function onLobbyKick(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;
  if (lobby.hostUserId !== userId) {
    socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can kick.' });
    return;
  }
  const targetUserId = payload?.targetUserId;
  if (!targetUserId || targetUserId === userId) return;

  const target = lobby.players.get(targetUserId);
  if (!target) return;

  if (target.socketId) {
    const targetSocket = ioRef.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(S2C.LOBBY_KICKED, { reason: 'Kicked by host' });
      targetSocket.leave(`altair:${lobby.id}`);
    }
  }

  lobby.players.delete(targetUserId);
  userToLobby.delete(targetUserId);
  lobby.lastActivityAt = Date.now();

  addSystemChat(lobby.id, `${target.userName} was kicked`);
  broadcastFullSync(lobby);
}

function onLobbyTransferHost(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.hostUserId !== userId) return;

  const target = lobby.players.get(payload?.targetUserId);
  if (!target) return;

  lobby.hostUserId = payload.targetUserId;
  lobby.lastActivityAt = Date.now();
  addSystemChat(lobby.id, `Host transferred to ${target.userName}`);
  broadcastFullSync(lobby);
}

function onLobbyChat(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;

  const player = lobby.players.get(userId);
  if (!player) return;

  const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 200) : '';
  if (!text) return;

  const msg: ChatMessage = {
    id: genMsgId(), userId, userName: player.userName,
    text, isSystem: false, timestamp: Date.now(),
  };
  lobby.chat.push(msg);
  if (lobby.chat.length > 100) lobby.chat.splice(0, lobby.chat.length - 100);
  lobby.lastActivityAt = Date.now();
  broadcastFullSync(lobby);
}

function onClassSelect(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;

  const player = lobby.players.get(userId);
  if (!player) return;

  player.classId = typeof payload?.classId === 'string' ? payload.classId : null;
  player.isReady = false;
  lobby.lastActivityAt = Date.now();
  broadcastClassSelections(lobby);
}

function onClassReady(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;

  const player = lobby.players.get(userId);
  if (!player) return;

  if (!player.classId) {
    socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Select a class first.' });
    return;
  }

  player.isReady = !!payload?.ready;
  lobby.lastActivityAt = Date.now();
  broadcastClassSelections(lobby);
}

// ── Game Event Handlers ────────────────────────────────────────────

function onGameStart(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;

  if (lobby.hostUserId !== userId) {
    socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can start.' });
    return;
  }

  for (const [, player] of lobby.players) {
    if (!player.classId) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'All players must select a class.' });
      return;
    }
    if (!player.isReady) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'All players must be ready.' });
      return;
    }
  }

  lobby.state = 'COUNTDOWN';
  broadcastFullSync(lobby);

  let countdown = COUNTDOWN_SECONDS;
  broadcastToLobby(lobby.id, S2C.GAME_COUNTDOWN, { seconds: countdown });

  const interval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      broadcastToLobby(lobby.id, S2C.GAME_COUNTDOWN, { seconds: countdown });
    } else {
      clearInterval(interval);
      countdownTimers.delete(lobby.id);

      // Start game
      lobby.state = 'PLAYING';
      lobby.gameStartedAt = Date.now();
      lobby.bossesDefeated = [];
      lobby.sharedKills = 0;
      for (const [, player] of lobby.players) {
        player.runState = createInitialRunState();
      }
      broadcastToLobby(lobby.id, S2C.GAME_STARTED, { tick: 0 });
      broadcastFullSync(lobby);
    }
  }, 1000);

  countdownTimers.set(lobby.id, interval);
}

function onGameInput(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;

  const hostPlayer = lobby.players.get(lobby.hostUserId);
  if (hostPlayer?.socketId && hostPlayer.userId !== userId) {
    const hostSocket = ioRef.sockets.sockets.get(hostPlayer.socketId);
    if (hostSocket) {
      hostSocket.emit(C2S.GAME_INPUT, { userId, ...payload });
    }
  }
}

function onHostSnapshot(io: Server, socket: Socket, snapshot: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId !== userId) return;

  lobby.lastSnapshot = snapshot;
  if (typeof snapshot?.sharedKills === 'number') {
    lobby.sharedKills = snapshot.sharedKills;
  }

  for (const [, player] of lobby.players) {
    if (player.userId === userId) continue;
    if (!player.socketId) continue;
    const clientSocket = ioRef.sockets.sockets.get(player.socketId);
    if (clientSocket) {
      clientSocket.emit(S2C.GAME_STATE_SNAPSHOT, snapshot);
    }
  }
}

function onLevelUpChoice(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;

  const hostPlayer = lobby.players.get(lobby.hostUserId);
  if (hostPlayer?.socketId) {
    const hostSocket = ioRef.sockets.sockets.get(hostPlayer.socketId);
    if (hostSocket) {
      hostSocket.emit(C2S.GAME_LEVEL_UP_CHOICE, { userId, choiceIndex: payload?.choiceIndex });
    }
  }
}

function onPing(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;

  broadcastToLobby(lobby.id, S2C.GAME_PING, {
    ...payload, playerId: userId, timestamp: Date.now(),
  });
}

function onQuickChat(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;

  broadcastToLobby(lobby.id, S2C.GAME_QUICK_CHAT, {
    playerId: userId, message: payload?.message, timestamp: Date.now(),
  });
}

// ── Reconnection ───────────────────────────────────────────────────

function handleReconnect(socket: Socket): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobbyId = userToLobby.get(userId);
  if (!lobbyId) return;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    // Lobby was disbanded while user was disconnected — clean up stale entry
    userToLobby.delete(userId);
    return;
  }

  const player = lobby.players.get(userId);
  if (!player) {
    // Player was removed from the lobby — clean up stale entry
    userToLobby.delete(userId);
    return;
  }

  // Cancel grace timer
  const timer = graceTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(userId);
  }

  player.isConnected = true;
  player.socketId = socket.id;
  player.lastSeenAt = Date.now();

  socket.join(`altair:${lobby.id}`);
  socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, userId));
  broadcastFullSync(lobby);
  addSystemChat(lobby.id, `${player.userName} reconnected`);
}

// ── Garbage Collection ─────────────────────────────────────────────

function startGarbageCollector(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, lobby] of lobbies) {
      if (now - lobby.lastActivityAt > LOBBY_IDLE_TIMEOUT_MS) {
        disbandLobby(id);
      }
    }
  }, GC_INTERVAL_MS);
}

// ── Public API ─────────────────────────────────────────────────────

export function registerAltairHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  // Start GC on first connection
  startGarbageCollector();

  // Attempt reconnection
  handleReconnect(socket);

  // Lobby events
  socket.on(C2S.LOBBY_CREATE, (payload) => onLobbyCreate(io, socket, payload));
  socket.on(C2S.LOBBY_JOIN, (payload) => onLobbyJoin(io, socket, payload));
  socket.on(C2S.LOBBY_LEAVE, (payload) => onLobbyLeave(io, socket, payload));
  socket.on(C2S.LOBBY_BROWSE, () => onLobbyBrowse(io, socket));
  socket.on(C2S.LOBBY_UPDATE_SETTINGS, (payload) => onLobbyUpdateSettings(io, socket, payload));
  socket.on(C2S.LOBBY_KICK, (payload) => onLobbyKick(io, socket, payload));
  socket.on(C2S.LOBBY_TRANSFER_HOST, (payload) => onLobbyTransferHost(io, socket, payload));
  socket.on(C2S.LOBBY_CHAT, (payload) => onLobbyChat(io, socket, payload));

  // Class selection
  socket.on(C2S.CLASS_SELECT, (payload) => onClassSelect(io, socket, payload));
  socket.on(C2S.CLASS_READY, (payload) => onClassReady(io, socket, payload));

  // Game events
  socket.on(C2S.GAME_START, (payload) => onGameStart(io, socket, payload));
  socket.on(C2S.GAME_INPUT, (payload) => onGameInput(io, socket, payload));
  socket.on(C2S.GAME_STATE_SNAPSHOT, (payload) => onHostSnapshot(io, socket, payload));
  socket.on(C2S.GAME_LEVEL_UP_CHOICE, (payload) => onLevelUpChoice(io, socket, payload));
  socket.on(C2S.GAME_PING, (payload) => onPing(io, socket, payload));
  socket.on(C2S.GAME_QUICK_CHAT, (payload) => onQuickChat(io, socket, payload));
}

export function handleAltairDisconnect(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobbyId = userToLobby.get(userId);
  if (!lobbyId) return;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    userToLobby.delete(userId);
    return;
  }

  const player = lobby.players.get(userId);
  if (!player) {
    userToLobby.delete(userId);
    return;
  }

  player.isConnected = false;
  player.socketId = null;
  player.isReady = false;
  player.lastSeenAt = Date.now();
  lobby.lastActivityAt = Date.now();

  // Start grace timer
  const timer = setTimeout(() => {
    graceTimers.delete(userId);
    removePlayer(lobby, userId);
  }, DISCONNECT_GRACE_MS);
  graceTimers.set(userId, timer);

  broadcastFullSync(lobby);
  addSystemChat(lobby.id, `${player.userName} disconnected`);

  // Host migration if needed
  if (lobby.state === 'PLAYING' && lobby.hostUserId === userId) {
    attemptHostMigration(lobby);
  }
}
