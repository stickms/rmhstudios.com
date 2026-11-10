/**
 * Altair Multiplayer — Handler for the unified socket server.
 *
 * Manages lobbies, game coordination, state sync, and chat
 * for the Altair co-op multiplayer mode.
 *
 * Lobby state machine (see docs/altair-multiplayer.md):
 *
 *   WAITING --start--> COUNTDOWN --5s--> PLAYING --end--> RESULTS --15s--> WAITING
 *      ^                   |  (a roster change cancels it)
 *      +-------------------+
 *
 * Class choice and ready-up both happen in WAITING (LobbyWaiting). The
 * CLASS_SELECT state exists in the shared type but is never entered: a
 * separate class-select screen was the original plan and nothing ever drove
 * it, so Start could not succeed.
 */

import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString } from '../../../server/socket-server/utils';
import { config } from '../../../server/socket-server/config';
import { CLASSES } from '../engine/data/classes';
import { decodeRunLog } from '../engine/verify/log-codec.server';
import { submitToVerifyQueue } from '../engine/verify/submit.server';
import type { CoopRunJob, JobPlayer } from '../engine/verify/job';

const VALID_CLASS_IDS = new Set<string>(CLASSES.map((c) => c.id));

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
  GAME_END:              'altair:game:end',
  GAME_LEVEL_UP_OFFER:   'altair:game:level_up_offer',
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
  GAME_LEVEL_UP_OFFER:   'altair:game:level_up_offer',
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
  /**
   * Seed for every random roll of the current run, chosen HERE (never by a client) when the
   * countdown ends. The host sim plays from it and the server replays from it, so a host cannot
   * pick a favourable one. Null outside PLAYING/RESULTS.
   */
  runSeed: number | null;
  /** Hub-issued id of the current run: the dedupe key of its persisted result. */
  runId: string | null;
  /** Who was in the match, with which class and slot, when it started (the verifier's trusted roster). */
  startRoster: JobPlayer[];
  /** Everyone admitted mid-run (a log may only add players from this list). */
  admitted: JobPlayer[];
  /** Classes of players whose disconnect grace expired mid-match, so they can rejoin as that class. */
  departedClasses: Map<string, string>;
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
/** Live sockets per user (any feature's): a player only counts as gone when the LAST one closes. */
const liveSockets = new Map<string, Set<string>>();
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
    // Only the host runs the simulation, so only the host is told the seed.
    runSeed: lobby.state === 'PLAYING' && lobby.hostUserId === userId ? lobby.runSeed : null,
  };
}

function broadcastToLobby(lobbyId: string, event: string, data: unknown): void {
  ioRef.to(`altair:${lobbyId}`).emit(event, data);
}

/**
 * A player is reached through a per-user room, never a single remembered socket
 * id. One browser tab holds SEVERAL sockets to this hub (the site-wide call
 * socket and every other feature connect with the same session), and
 * registerAltairHandlers runs for each of them: a "last socket wins" id pointed
 * at whichever connected last, which routinely was not the one listening for
 * Altair events, so snapshots and input went to a socket with no handlers.
 */
function userRoom(lobbyId: string, userId: string): string {
  return `altair:${lobbyId}:u:${userId}`;
}

function emitToUser(lobby: AltairLobby, userId: string, event: string, data: unknown): void {
  ioRef.to(userRoom(lobby.id, userId)).emit(event, data);
}

function joinLobbyRooms(socket: Socket, lobbyId: string, userId: string): void {
  socket.join(`altair:${lobbyId}`);
  socket.join(userRoom(lobbyId, userId));
}

function leaveLobbyRooms(socket: Socket, lobbyId: string, userId: string): void {
  socket.leave(`altair:${lobbyId}`);
  socket.leave(userRoom(lobbyId, userId));
}

function broadcastFullSync(lobby: AltairLobby): void {
  for (const [, player] of lobby.players) {
    emitToUser(lobby, player.userId, S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, player.userId));
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

function removePlayer(lobby: AltairLobby, userId: string, graceExpired = false): void {
  const player = lobby.players.get(userId);
  if (!player) return;
  // A guest who timed out mid-match may come back: remember their class (not a deliberate leave).
  if (graceExpired && lobby.state === 'PLAYING' && player.classId && lobby.hostUserId !== userId) {
    lobby.departedClasses.set(userId, player.classId);
  }

  const userName = player.userName;
  const wasHost = lobby.hostUserId === userId;
  const resultsIfHostLeft =
    wasHost && lobby.state === 'PLAYING' ? buildCurrentResults(lobby, false) : null;
  lobby.players.delete(userId);
  userToLobby.delete(userId);
  const grace = graceTimers.get(userId);
  if (grace) {
    clearTimeout(grace);
    graceTimers.delete(userId);
  }

  for (const sid of liveSockets.get(userId) ?? []) {
    const socket = ioRef.sockets.sockets.get(sid);
    if (socket) leaveLobbyRooms(socket, lobby.id, userId);
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
  if (lobby.state === 'COUNTDOWN') {
    cancelCountdown(lobby, `${userName} left, countdown cancelled`);
  } else {
    broadcastFullSync(lobby);
  }

  if (lobby.state === 'PLAYING') {
    // The host client owns the simulation: without it there is no match to
    // continue (the world cannot be rebuilt from a snapshot), so end the run
    // cleanly for everyone and say why.
    if (resultsIfHostLeft) {
      endGame(lobby.id, { ...resultsIfHostLeft, endedReason: 'host_left' });
      return;
    }
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

function endGame(
  lobbyId: string,
  results: ReturnType<typeof buildCurrentResults> & { endedReason?: 'host_left' },
): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby || lobby.state === 'RESULTS' || lobby.state === 'DISBANDED') return;

  lobby.state = 'RESULTS';
  broadcastToLobby(lobbyId, S2C.GAME_RESULTS, results);
  // Clients route on lobby.state, so they must learn it changed to RESULTS.
  broadcastFullSync(lobby);

  setTimeout(() => {
    if (lobby.state !== 'RESULTS' || lobbies.get(lobbyId) !== lobby) return;
    lobby.state = 'WAITING';
    lobby.gameStartedAt = null;
    lobby.lastSnapshot = null;
    lobby.runSeed = null;
    lobby.runId = null;
    lobby.startRoster = [];
    lobby.admitted = [];
    for (const [, player] of lobby.players) {
      player.isReady = false;
      player.classId = null;
      player.runState = null;
    }
    broadcastFullSync(lobby);
  }, 15000);
}

/** Un-ready everyone (a roster or class change invalidates a ready check). */
function unreadyAll(lobby: AltairLobby): void {
  for (const [, p] of lobby.players) p.isReady = false;
}

/**
 * Abort a running countdown and return to WAITING. A roster change (leave,
 * kick, disconnect) during the countdown must not launch a match with a
 * different party than the one that readied up.
 */
function cancelCountdown(lobby: AltairLobby, reason: string): void {
  const timer = countdownTimers.get(lobby.id);
  if (timer) {
    clearInterval(timer);
    countdownTimers.delete(lobby.id);
  }
  if (lobby.state !== 'COUNTDOWN') return;
  lobby.state = 'WAITING';
  unreadyAll(lobby);
  addSystemChat(lobby.id, reason);
  broadcastToLobby(lobby.id, S2C.GAME_COUNTDOWN, { seconds: null });
  broadcastFullSync(lobby);
}

/** TEST ONLY: drop all hub state between cases. */
export function __resetAltairLobbies(): void {
  for (const t of countdownTimers.values()) clearInterval(t);
  for (const t of graceTimers.values()) clearTimeout(t);
  countdownTimers.clear();
  graceTimers.clear();
  lobbies.clear();
  userToLobby.clear();
  liveSockets.clear();
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}

export const ALTAIR_DISCONNECT_GRACE_MS = DISCONNECT_GRACE_MS;

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
    gameStartedAt: null, lastSnapshot: null, bossesDefeated: [], sharedKills: 0, runSeed: null, departedClasses: new Map(),
    runId: null, startRoster: [], admitted: [],
  };

  lobbies.set(lobbyId, lobby);
  userToLobby.set(userId, lobbyId);
  joinLobbyRooms(socket, lobbyId, userId);
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
      joinLobbyRooms(socket, lobbyId, userId);
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

  // A guest whose grace expired mid-match is a returning player, not a new drop-in.
  const returningClass = lobby.state === 'PLAYING' ? lobby.departedClasses.get(userId) : undefined;
  if (lobby.state === 'PLAYING' && !returningClass) {
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
  } else if (!returningClass && lobby.state !== 'WAITING' && lobby.state !== 'CLASS_SELECT') {
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
  if (returningClass) {
    player.classId = returningClass;
    player.isReady = true;
    player.runState = createInitialRunState();
    lobby.departedClasses.delete(userId);
  }

  lobby.players.set(userId, player);
  userToLobby.set(userId, lobby.id);
  joinLobbyRooms(socket, lobby.id, userId);
  lobby.lastActivityAt = now;

  socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, userId));
  broadcastFullSync(lobby);
  addSystemChat(lobby.id, `${userName} joined`);

  if (lobby.state === 'PLAYING') {
    // A returning player (class already known) is spawned by the host right now: the verifier must expect it.
    if (player.classId) lobby.admitted.push({ userId, userName, classId: player.classId, slot });
    broadcastToLobby(lobby.id, S2C.GAME_PLAYER_JOINED, {
      player: {
        userId, userName, avatarUrl, isConnected: true, isHost: false,
        slot, classId: player.classId, isReady: player.isReady, color: getSlotColor(slot),
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
  leaveLobbyRooms(socket, lobby.id, userId);
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

  emitToUser(lobby, targetUserId, S2C.LOBBY_KICKED, { reason: 'Kicked by host' });
  for (const sid of liveSockets.get(targetUserId) ?? []) {
    const targetSocket = ioRef.sockets.sockets.get(sid);
    if (targetSocket) leaveLobbyRooms(targetSocket, lobby.id, targetUserId);
  }

  lobby.players.delete(targetUserId);
  userToLobby.delete(targetUserId);
  lobby.lastActivityAt = Date.now();

  addSystemChat(lobby.id, `${target.userName} was kicked`);
  if (lobby.state === 'COUNTDOWN') {
    cancelCountdown(lobby, 'A player was kicked, countdown cancelled');
  } else {
    broadcastFullSync(lobby);
  }
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

  // A drop-in joins a running match without a class: they may pick exactly once.
  const dropInPick = lobby.state === 'PLAYING' && player.classId === null;
  if (!dropInPick && lobby.state !== 'WAITING' && lobby.state !== 'CLASS_SELECT') {
    socket.emit(S2C.ERROR, { code: 'WRONG_STATE', message: 'Classes are locked once the countdown starts.' });
    return;
  }
  const classId = payload?.classId;
  if (typeof classId !== 'string' || !VALID_CLASS_IDS.has(classId)) {
    socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Unknown class.' });
    return;
  }

  if (dropInPick) {
    player.classId = classId;
    player.isReady = true;
    player.runState = createInitialRunState();
    lobby.lastActivityAt = Date.now();
    broadcastFullSync(lobby);
    lobby.admitted.push({ userId, userName: player.userName, classId, slot: player.slot });
    // The host's page spawns them now that the class is known.
    broadcastToLobby(lobby.id, S2C.GAME_PLAYER_JOINED, {
      player: {
        userId, userName: player.userName, avatarUrl: player.avatarUrl, isConnected: true, isHost: false,
        slot: player.slot, classId, isReady: true, color: getSlotColor(player.slot),
      },
    });
    return;
  }

  player.classId = classId;
  player.isReady = false;
  lobby.lastActivityAt = Date.now();
  broadcastClassSelections(lobby);
  broadcastFullSync(lobby);
}

function onClassReady(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby) return;

  const player = lobby.players.get(userId);
  if (!player) return;

  if (!player.classId) {
    socket.emit(S2C.ERROR, { code: 'NOT_READY', message: 'Select a class first.' });
    return;
  }

  if (lobby.state !== 'WAITING' && lobby.state !== 'CLASS_SELECT') {
    socket.emit(S2C.ERROR, { code: 'WRONG_STATE', message: 'Classes are locked once the countdown starts.' });
    return;
  }

  player.isReady = !!payload?.ready;
  lobby.lastActivityAt = Date.now();
  broadcastClassSelections(lobby);
  broadcastFullSync(lobby);
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

  if (lobby.state !== 'WAITING' && lobby.state !== 'CLASS_SELECT') {
    socket.emit(S2C.ERROR, { code: 'WRONG_STATE', message: 'A game is already starting or running.' });
    return;
  }
  if (lobby.players.size < 2) {
    socket.emit(S2C.ERROR, { code: 'NEED_MORE_PLAYERS', message: 'Co-op needs at least 2 players.' });
    return;
  }
  for (const [, player] of lobby.players) {
    if (!player.isConnected) {
      socket.emit(S2C.ERROR, { code: 'NOT_READY', message: 'A player is disconnected.' });
      return;
    }
    if (!player.classId) {
      socket.emit(S2C.ERROR, { code: 'NOT_READY', message: 'All players must select a class.' });
      return;
    }
    if (!player.isReady) {
      socket.emit(S2C.ERROR, { code: 'NOT_READY', message: 'All players must be ready.' });
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
      if (lobbies.get(lobby.id) !== lobby || lobby.state !== 'COUNTDOWN') return;

      // Start game
      lobby.state = 'PLAYING';
      lobby.departedClasses.clear();
      lobby.gameStartedAt = Date.now();
      lobby.bossesDefeated = [];
      lobby.sharedKills = 0;
      lobby.runSeed = randomInt(0, 2 ** 32);
      lobby.runId = randomUUID();
      lobby.startRoster = [...lobby.players.values()].map((p) => ({
        userId: p.userId, userName: p.userName, classId: p.classId ?? 'knight', slot: p.slot,
      }));
      lobby.admitted = [];
      for (const [, player] of lobby.players) {
        player.runState = createInitialRunState();
      }
      broadcastToLobby(lobby.id, S2C.GAME_STARTED, { tick: 0 });
      broadcastFullSync(lobby);
    }
  }, 1000);

  countdownTimers.set(lobby.id, interval);
}

/**
 * Guest movement intent -> host. Intent only (never positions or damage), so the
 * shape is checked here and re-built field by field: whatever else the client
 * sent is not forwarded. The host's own input is never relayed (it drives itself
 * locally) and nothing is broadcast.
 */
function onGameInput(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId === userId) return;
  if (!payload || typeof payload !== 'object') return;
  const { seq, dx, dy } = payload as { seq?: unknown; dx?: unknown; dy?: unknown };
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return;
  if (typeof dx !== 'number' || typeof dy !== 'number') return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) return;

  emitToUser(lobby, lobby.hostUserId, C2S.GAME_INPUT, { userId, seq, dx, dy });
}

/** Largest flat entity array the hub will relay (the host encoder caps are well below these). */
const MAX_SNAPSHOT_ARRAY = 4000;
const MAX_SNAPSHOT_PLAYERS = 4;

/** A host snapshot is relayed verbatim to guests, so it must at least be well-formed and bounded. */
function isRelayableSnapshot(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const snapshot = raw as Record<string, unknown>;
  if (typeof snapshot.tick !== 'number' || !Number.isFinite(snapshot.tick)) return false;
  if (typeof snapshot.time !== 'number' || !Number.isFinite(snapshot.time)) return false;
  if (!Array.isArray(snapshot.players) || snapshot.players.length > MAX_SNAPSHOT_PLAYERS) return false;
  for (const key of ['enemies', 'projectiles', 'pickups'] as const) {
    const arr = snapshot[key];
    if (!Array.isArray(arr) || arr.length > MAX_SNAPSHOT_ARRAY) return false;
  }
  return true;
}

function onHostSnapshot(io: Server, socket: Socket, snapshot: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId !== userId) return;
  if (!isRelayableSnapshot(snapshot)) return;

  lobby.lastSnapshot = snapshot;
  if (typeof snapshot.sharedKills === 'number' && Number.isFinite(snapshot.sharedKills)) {
    lobby.sharedKills = Math.max(0, Math.min(10_000_000, Math.floor(snapshot.sharedKills)));
  }

  for (const [, player] of lobby.players) {
    if (player.userId === userId) continue;
    emitToUser(lobby, player.userId, S2C.GAME_STATE_SNAPSHOT, snapshot);
  }
}

/**
 * Host-only end of run. The host's browser owns the simulation, so it reports
 * how the run ended and the per-player counters; the hub clamps every number (a
 * client is untrusted) and builds the results screen itself; `coinsEarned` there
 * is always 0. Nothing the host says is persisted: the run log it attaches goes
 * to the verifier (features/altair/engine/verify), which replays it and records the replay's
 * numbers only if they equal the host's claim.
 */
const MAX_RUN_SECONDS = 6 * 60 * 60;
function clampInt(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
}
function clampNum(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
}

interface EndReport {
  victory?: unknown;
  time?: unknown;
  sharedKills?: unknown;
  bossesDefeated?: unknown;
  players?: unknown;
}
interface ClaimRow {
  userId?: unknown;
  level?: unknown;
  kills?: unknown;
  coins?: unknown;
  revivesGiven?: unknown;
  revivesReceived?: unknown;
  wasDowned?: unknown;
  wasAliveAtEnd?: unknown;
}
interface EndRow {
  userId?: unknown;
  level?: unknown;
  kills?: unknown;
  timeSurvived?: unknown;
  revivesGiven?: unknown;
  revivesReceived?: unknown;
  wasDowned?: unknown;
  wasAliveAtEnd?: unknown;
}

function onGameEnd(io: Server, socket: Socket, raw: unknown): void {
  const payload = (raw && typeof raw === 'object' ? raw : null) as EndReport | null;
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId !== userId) {
    socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can end the run.' });
    return;
  }
  if (!payload || !Array.isArray(payload.players) || payload.players.length > MAX_PLAYERS_PER_LOBBY) {
    socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Malformed end of run.' });
    return;
  }

  if (typeof payload.sharedKills === 'number') lobby.sharedKills = clampInt(payload.sharedKills, 10_000_000);
  if (Array.isArray(payload.bossesDefeated)) {
    lobby.bossesDefeated = payload.bossesDefeated
      .filter((b: unknown) => typeof b === 'string')
      .slice(0, 20)
      .map((b: string) => sanitizeString(b, 40));
  }
  for (const row of payload.players as EndRow[]) {
    const player = row && typeof row.userId === 'string' ? lobby.players.get(row.userId) : undefined;
    if (!player) continue;
    const run = createInitialRunState();
    run.level = Math.max(1, clampInt(row.level, 999));
    run.kills = clampInt(row.kills, 10_000_000);
    run.timeSurvived = clampNum(row.timeSurvived, MAX_RUN_SECONDS);
    run.revivesGiven = clampInt(row.revivesGiven, 999);
    run.revivesReceived = clampInt(row.revivesReceived, 999);
    run.wasDowned = row.wasDowned === true;
    run.wasAliveAtEnd = row.wasAliveAtEnd === true;
    run.coins = 0;
    player.runState = run;
  }
  const results = buildCurrentResults(lobby, payload.victory === true);
  results.timeSurvived = clampNum(payload.time, MAX_RUN_SECONDS) || results.timeSurvived;
  // Persistence: what the host reports above is for the results screen only. The run itself is
  // handed to the verifier, which replays it and records the replay's numbers.
  void submitRunForVerification(lobby, raw as EndReport & { runLog?: unknown });
  endGame(lobby.id, results);
}

/** Build the verify job from hub state (trusted) + the host's log and claim (untrusted) and queue it. */
async function submitRunForVerification(lobby: AltairLobby, payload: EndReport & { runLog?: unknown }): Promise<void> {
  const runId = lobby.runId;
  const seed = lobby.runSeed;
  if (!runId || seed === null || !lobby.gameStartedAt) return;
  const log = decodeRunLog(payload.runLog);
  if (!log) {
    console.warn(JSON.stringify({ event: 'altair.run_unverifiable', runId, reason: 'no readable run log' }));
    return;
  }
  const claim = {
    victory: payload.victory === true,
    sharedKills: clampInt(payload.sharedKills, 10_000_000),
    bossesDefeated: Array.isArray(payload.bossesDefeated)
      ? payload.bossesDefeated.filter((b: unknown): b is string => typeof b === 'string').slice(0, 20).map((b) => sanitizeString(b, 40))
      : [],
    players: (Array.isArray(payload.players) ? (payload.players as ClaimRow[]) : [])
      .filter((r) => r && typeof r.userId === 'string')
      .slice(0, MAX_PLAYERS_PER_LOBBY)
      .map((r) => ({
        userId: r.userId as string,
        level: clampInt(r.level, 1000),
        kills: clampInt(r.kills, 10_000_000),
        coins: clampInt(r.coins, 100_000_000),
        revivesGiven: clampInt(r.revivesGiven, 10_000),
        revivesReceived: clampInt(r.revivesReceived, 10_000),
        wasDowned: r.wasDowned === true,
        wasAliveAtEnd: r.wasAliveAtEnd === true,
      })),
  };
  const job: CoopRunJob = {
    runId,
    lobbyId: lobby.id,
    hostUserId: lobby.hostUserId,
    seed,
    doubleTime: lobby.settings.doubleTime,
    roster: lobby.startRoster,
    joins: lobby.admitted,
    wallMs: Date.now() - lobby.gameStartedAt,
    log,
    claim,
  };
  const outcome = await submitToVerifyQueue(job);
  if (outcome !== 'queued') {
    console.warn(JSON.stringify({ event: 'altair.run_not_queued', runId, outcome }));
  }
}

/**
 * Guest -> host: which upgrade they picked. Index only: the host owns the
 * choices and applies the pick to that player, so all a guest can ever send is
 * a small integer for the offer the host already made to them.
 */
function onLevelUpChoice(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId === userId) return; // the host picks locally
  const choiceIndex = payload?.choiceIndex;
  if (typeof choiceIndex !== 'number' || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 7) return;
  emitToUser(lobby, lobby.hostUserId, C2S.GAME_LEVEL_UP_CHOICE, { userId, choiceIndex });
}

const UPGRADE_TYPES = new Set([
  'new_weapon', 'upgrade_weapon', 'new_passive', 'upgrade_passive', 'new_catalyst', 'upgrade_catalyst', 'gold',
]);

interface OfferChoice {
  type?: unknown;
  weaponId?: unknown;
  passiveId?: unknown;
  catalystId?: unknown;
  newLevel?: unknown;
  amount?: unknown;
}

/** One upgrade option, rebuilt field by field (ids are short strings, levels small ints). */
function cleanChoice(raw: OfferChoice): Record<string, unknown> | null {
  if (!raw || typeof raw.type !== 'string' || !UPGRADE_TYPES.has(raw.type)) return null;
  const out: Record<string, unknown> = { type: raw.type };
  for (const key of ['weaponId', 'passiveId', 'catalystId'] as const) {
    if (typeof raw[key] === 'string') out[key] = sanitizeString(raw[key], 48);
  }
  if (typeof raw.newLevel === 'number' && Number.isFinite(raw.newLevel)) out.newLevel = clampInt(raw.newLevel, 99);
  if (typeof raw.amount === 'number' && Number.isFinite(raw.amount)) out.amount = clampInt(raw.amount, 1000);
  return out;
}

/**
 * Host -> ONE guest: the upgrade options the host rolled for that player. Only
 * the host may send it, only to a player in the lobby (never to the host
 * itself), and only well-formed options are forwarded.
 */
function onLevelUpOffer(io: Server, socket: Socket, payload: any): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const lobby = userToLobby.has(userId) ? lobbies.get(userToLobby.get(userId)!) : undefined;
  if (!lobby || lobby.state !== 'PLAYING') return;
  if (lobby.hostUserId !== userId) {
    socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can offer upgrades.' });
    return;
  }
  const target = typeof payload?.userId === 'string' ? payload.userId : '';
  if (!target || target === userId || !lobby.players.has(target)) return;
  if (!Array.isArray(payload.choices) || payload.choices.length < 1 || payload.choices.length > 6) return;
  const choices: Record<string, unknown>[] = [];
  for (const c of payload.choices as OfferChoice[]) {
    const clean = cleanChoice(c);
    if (!clean) return;
    choices.push(clean);
  }
  emitToUser(lobby, target, S2C.GAME_LEVEL_UP_OFFER, {
    level: Math.max(1, clampInt(payload.level, 999)),
    remaining: clampNum(payload.remaining, 60),
    choices,
  });
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

  joinLobbyRooms(socket, lobby.id, userId);
  socket.emit(S2C.LOBBY_STATE_SNAPSHOT, buildClientState(lobby, userId));
  broadcastFullSync(lobby);
  addSystemChat(lobby.id, `${player.userName} reconnected`);
  if (lobby.state === 'PLAYING' && lobby.hostUserId === userId) {
    broadcastToLobby(lobby.id, S2C.GAME_EVENT, {
      type: 'host_reconnected',
      timestamp: Date.now(),
    });
  }
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

  const connectedUser = socket.data.userId as string | undefined;
  if (connectedUser) {
    let set = liveSockets.get(connectedUser);
    if (!set) liveSockets.set(connectedUser, (set = new Set()));
    set.add(socket.id);
  }

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
  socket.on(C2S.GAME_END, (payload) => onGameEnd(io, socket, payload));
  socket.on(C2S.GAME_LEVEL_UP_CHOICE, (payload) => onLevelUpChoice(io, socket, payload));
  socket.on(C2S.GAME_LEVEL_UP_OFFER, (payload) => onLevelUpOffer(io, socket, payload));
  socket.on(C2S.GAME_PING, (payload) => onPing(io, socket, payload));
  socket.on(C2S.GAME_QUICK_CHAT, (payload) => onQuickChat(io, socket, payload));
}

export function handleAltairDisconnect(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string;
  if (!userId) return;
  const live = liveSockets.get(userId);
  live?.delete(socket.id);
  if (live && live.size === 0) liveSockets.delete(userId);
  // Another socket of this user (a different feature's, or the Altair client
  // itself after a reconnect) is still up: they have not dropped.
  if (live && live.size > 0) return;
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
    removePlayer(lobby, userId, true);
  }, DISCONNECT_GRACE_MS);
  graceTimers.set(userId, timer);

  addSystemChat(lobby.id, `${player.userName} disconnected`);
  if (lobby.state === 'COUNTDOWN') {
    cancelCountdown(lobby, `${player.userName} disconnected, countdown cancelled`);
  } else {
    broadcastFullSync(lobby);
  }

  // The host client owns the simulation. Tell the guests it is gone; if it is
  // still gone when the grace timer fires, removePlayer() ends the run.
  if (lobby.state === 'PLAYING' && lobby.hostUserId === userId) {
    broadcastToLobby(lobby.id, S2C.GAME_EVENT, {
      type: 'host_disconnected',
      data: { graceMs: DISCONNECT_GRACE_MS },
      timestamp: Date.now(),
    });
  }
}
