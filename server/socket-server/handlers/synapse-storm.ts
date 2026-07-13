/**
 * Synapse Storm — Multiplayer Lobby Handler
 *
 * Extracted from legacy socket-server.ts.
 * Handles lobby management, match lifecycle, score updates with anti-cheat,
 * leaderboard broadcasting, and DB persistence via Prisma.
 */

import type { Server, Socket } from 'socket.io';
import { sanitizeUserName } from '../utils';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';

// ─── Interfaces ───

interface SSPlayer {
  socketId: string;
  userId: string;
  displayName: string;
  isReady: boolean;
  isHost: boolean;
}

interface SSMatchPlayer {
  userId: string;
  displayName: string;
  score: number;
  maxCombo: number;
  puzzlesSolved: number;
  puzzlesMissed: number;
  finished: boolean;
  lastUpdateAt: number;
  lastScore: number;
}

interface SSLobbyInMemory {
  id: string;
  code: string;
  hostUserId: string;
  status: 'WAITING' | 'IN_MATCH' | 'CLOSED';
  players: Map<string, SSPlayer>; // keyed by userId
  currentMatchId: string | null;
  currentMatchSeed: number | null;
  currentMatchStartAt: number | null;
  matchPlayers: Map<string, SSMatchPlayer>; // keyed by userId
}

// ─── Constants ───

const MAX_SS_PLAYERS = 8;
const SCORE_RATE_LIMIT = 5000; // max score increase per 5 seconds
const SCORE_UPDATE_INTERVAL = 5000; // ms between server-side rate checks

// ─── In-Memory State ───

const ssLobbies = new Map<string, SSLobbyInMemory>(); // keyed by lobby code
const ssUserSocketMap = new Map<string, string>(); // userId -> socketId
const ssSocketUserMap = new Map<string, string>(); // socketId -> userId
const ssSocketLobbyMap = new Map<string, string>(); // socketId -> lobbyCode

// ─── Helper Functions ───

function generateLobbyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateSSId(): string {
  return 'ss_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function ssGetLobbyByCode(code: string): SSLobbyInMemory | undefined {
  return ssLobbies.get(code.toUpperCase());
}

function ssBroadcastLobby(io: Server, lobby: SSLobbyInMemory): void {
  const players = Array.from(lobby.players.values()).map(p => ({
    id: p.socketId,
    userId: p.userId,
    displayName: p.displayName,
    isReady: p.isReady,
    isHost: p.isHost,
  }));
  io.to(`ss:${lobby.code}`).emit('ss:lobbyUpdate', {
    lobbyId: lobby.id,
    code: lobby.code,
    status: lobby.status,
    players,
    hostUserId: lobby.hostUserId,
  });
}

function ssBroadcastLeaderboard(io: Server, lobby: SSLobbyInMemory): void {
  const leaderboard = Array.from(lobby.matchPlayers.values())
    .sort((a, b) => b.score - a.score)
    .map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      score: p.score,
      maxCombo: p.maxCombo,
      puzzlesSolved: p.puzzlesSolved,
      puzzlesMissed: p.puzzlesMissed,
      finished: p.finished,
    }));
  io.to(`ss:${lobby.code}`).emit('ss:leaderboardUpdate', { leaderboard });
}

function ssRemovePlayer(io: Server, socketId: string): void {
  const userId = ssSocketUserMap.get(socketId);
  const lobbyCode = ssSocketLobbyMap.get(socketId);
  if (!userId || !lobbyCode) return;

  const lobby = ssLobbies.get(lobbyCode);
  if (!lobby) return;

  lobby.players.delete(userId);
  ssUserSocketMap.delete(userId);
  ssSocketUserMap.delete(socketId);
  ssSocketLobbyMap.delete(socketId);

  if (lobby.players.size === 0) {
    ssLobbies.delete(lobbyCode);
    return;
  }

  // Host migration
  if (lobby.hostUserId === userId) {
    const newHost = lobby.players.values().next().value;
    if (newHost) {
      lobby.hostUserId = newHost.userId;
      newHost.isHost = true;
    }
  }

  ssBroadcastLobby(io, lobby);

  if (lobby.status === 'IN_MATCH') {
    ssBroadcastLeaderboard(io, lobby);
  }
}

// ─── Event Handlers ───

export function registerSynapseStormHandlers(io: Server, socket: Socket): void {
  // ─── Time Sync ───
  socket.on('ss:timeSync', (payload: { clientTime?: number }) => {
    const clientTime = typeof payload?.clientTime === 'number' ? payload.clientTime : Date.now();
    socket.emit('ss:timeSync', { serverTime: Date.now(), clientTime });
  });

  // ─── Create Lobby ───
  socket.on('ss:createLobby', async (payload: { userId?: string; displayName?: string }) => {
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const displayName = sanitizeUserName(payload?.displayName);
    if (!userId) { socket.emit('ss:error', { message: 'Missing userId' }); return; }

    ssRemovePlayer(io, socket.id);

    let code = generateLobbyCode();
    let attempts = 0;
    while (ssLobbies.has(code) && attempts < 20) { code = generateLobbyCode(); attempts++; }

    const lobbyId = generateSSId();

    const lobby: SSLobbyInMemory = {
      id: lobbyId,
      code,
      hostUserId: userId,
      status: 'WAITING',
      players: new Map(),
      currentMatchId: null,
      currentMatchSeed: null,
      currentMatchStartAt: null,
      matchPlayers: new Map(),
    };

    const player: SSPlayer = { socketId: socket.id, userId, displayName, isReady: false, isHost: true };
    lobby.players.set(userId, player);
    ssLobbies.set(code, lobby);
    ssUserSocketMap.set(userId, socket.id);
    ssSocketUserMap.set(socket.id, userId);
    ssSocketLobbyMap.set(socket.id, code);

    socket.join(`ss:${code}`);
    ssBroadcastLobby(io, lobby);
    logger.info({ event: 'ss_lobby_created', code, userId, displayName });

    // Fire-and-forget DB persistence
    try {
      const db = getPrismaClient();
      db.sSLobby.create({ data: { id: lobbyId, code, hostUserId: userId, status: 'WAITING' } })
        .then((dbLobby: any) => {
          lobby.id = dbLobby.id;
          return db.sSLobbyMember.upsert({
            where: { lobbyId_userId: { lobbyId: dbLobby.id, userId } },
            update: { displayName, isHost: true, lastSeenAt: new Date() },
            create: { lobbyId: dbLobby.id, userId, displayName, isHost: true },
          });
        })
        .catch((err: Error) => logger.warn({ event: 'ss_db_persist_lobby_failed', error: err.message }));
    } catch (err) {
      logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
    }
  });

  // ─── Join Lobby ───
  socket.on('ss:joinLobby', (payload: { code?: string; userId?: string; displayName?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase().trim();
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const displayName = sanitizeUserName(payload?.displayName);
    if (!code || !userId) { socket.emit('ss:error', { message: 'Missing code or userId' }); return; }

    const lobby = ssGetLobbyByCode(code);
    if (!lobby) { socket.emit('ss:error', { message: 'Lobby not found' }); return; }
    if (lobby.status === 'CLOSED') { socket.emit('ss:error', { message: 'Lobby is closed' }); return; }
    if (lobby.players.size >= MAX_SS_PLAYERS && !lobby.players.has(userId)) {
      socket.emit('ss:error', { message: 'Lobby is full' }); return;
    }

    const existingCode = ssSocketLobbyMap.get(socket.id);
    if (existingCode && existingCode !== code) ssRemovePlayer(io, socket.id);

    const oldSocketId = ssUserSocketMap.get(userId);
    if (oldSocketId && oldSocketId !== socket.id) {
      ssSocketUserMap.delete(oldSocketId);
      ssSocketLobbyMap.delete(oldSocketId);
    }

    const isHost = lobby.players.size === 0 || lobby.hostUserId === userId;
    const player: SSPlayer = {
      socketId: socket.id, userId, displayName,
      isReady: lobby.players.get(userId)?.isReady ?? false,
      isHost,
    };
    lobby.players.set(userId, player);
    ssUserSocketMap.set(userId, socket.id);
    ssSocketUserMap.set(socket.id, userId);
    ssSocketLobbyMap.set(socket.id, code);

    socket.join(`ss:${code}`);
    ssBroadcastLobby(io, lobby);

    // Reconnect-to-match: if lobby is in a match, send match state to the joining socket
    if (lobby.status === 'IN_MATCH' && lobby.currentMatchId && lobby.currentMatchSeed !== null && lobby.currentMatchStartAt !== null) {
      const leaderboard = Array.from(lobby.matchPlayers.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          userId: p.userId, displayName: p.displayName,
          score: p.score, maxCombo: p.maxCombo,
          puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
          finished: p.finished,
        }));
      socket.emit('ss:matchStart', {
        matchId: lobby.currentMatchId,
        seed: lobby.currentMatchSeed,
        startAt: lobby.currentMatchStartAt,
        status: 'RUNNING',
        leaderboard,
      });
    }

    logger.info({ event: 'ss_player_joined', code, userId, displayName });

    // Fire-and-forget DB persistence
    try {
      const db = getPrismaClient();
      db.sSLobbyMember.upsert({
        where: { lobbyId_userId: { lobbyId: lobby.id, userId } },
        update: { displayName, lastSeenAt: new Date(), isHost },
        create: { lobbyId: lobby.id, userId, displayName, isHost },
      }).catch((err: Error) => logger.warn({ event: 'ss_db_persist_join_failed', error: err.message }));
    } catch (err) {
      logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
    }
  });

  // ─── Leave Lobby ───
  socket.on('ss:leaveLobby', (payload: { code?: string; userId?: string }) => {
    ssRemovePlayer(io, socket.id);
    const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    if (code) socket.leave(`ss:${code}`);
  });

  // ─── Toggle Ready ───
  socket.on('ss:toggleReady', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const lobby = ssGetLobbyByCode(code);
    if (!lobby) return;
    const player = lobby.players.get(userId);
    if (!player) return;
    player.isReady = !player.isReady;
    ssBroadcastLobby(io, lobby);
  });

  // ─── Start Match ───
  socket.on('ss:startMatch', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const lobby = ssGetLobbyByCode(code);
    if (!lobby) { socket.emit('ss:error', { message: 'Lobby not found' }); return; }
    if (lobby.hostUserId !== userId) { socket.emit('ss:error', { message: 'Only host can start' }); return; }
    if (lobby.status !== 'WAITING') { socket.emit('ss:error', { message: 'Lobby not in waiting state' }); return; }
    if (lobby.players.size < 1) { socket.emit('ss:error', { message: 'Need at least 1 player' }); return; }

    const seed = Math.floor(Math.random() * 2147483647);
    const countdownMs = 3000;
    const startAt = Date.now() + countdownMs;
    const matchId = generateSSId();

    lobby.status = 'IN_MATCH';
    lobby.currentMatchId = matchId;
    lobby.currentMatchSeed = seed;
    lobby.currentMatchStartAt = startAt;
    lobby.matchPlayers.clear();

    for (const [uid, p] of lobby.players) {
      lobby.matchPlayers.set(uid, {
        userId: uid,
        displayName: p.displayName,
        score: 0, maxCombo: 0, puzzlesSolved: 0, puzzlesMissed: 0,
        finished: false, lastUpdateAt: Date.now(), lastScore: 0,
      });
    }

    io.to(`ss:${code}`).emit('ss:countdown', { countdownEndsAt: startAt });
    ssBroadcastLobby(io, lobby);

    setTimeout(() => {
      const leaderboard = Array.from(lobby.matchPlayers.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          userId: p.userId, displayName: p.displayName,
          score: p.score, maxCombo: p.maxCombo,
          puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
          finished: p.finished,
        }));
      io.to(`ss:${code}`).emit('ss:matchStart', {
        matchId: lobby.currentMatchId,
        seed,
        startAt,
        status: 'RUNNING',
        leaderboard,
      });
    }, countdownMs);

    logger.info({ event: 'ss_match_started', code, seed });

    // Fire-and-forget DB persistence
    try {
      const db = getPrismaClient();
      db.sSMatch.create({
        data: { id: matchId, lobbyId: lobby.id, seed, startAt: new Date(startAt), status: 'RUNNING' },
      }).then((dbMatch: any) => {
        lobby.currentMatchId = dbMatch.id;
        const creates = Array.from(lobby.players.entries()).map(([uid, p]: [string, SSPlayer]) =>
          db.sSPlayerMatch.create({
            data: { matchId: dbMatch.id, lobbyId: lobby.id, userId: uid, displayName: p.displayName },
          }).catch((err: Error) => logger.warn({ event: 'ss_db_player_match_create_failed', error: err.message }))
        );
        return Promise.all(creates);
      }).then(() =>
        db.sSLobby.update({ where: { id: lobby.id }, data: { status: 'IN_MATCH' } })
      ).catch((err: Error) => logger.warn({ event: 'ss_db_persist_match_start_failed', error: err.message }));
    } catch (err) {
      logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
    }
  });

  // ─── Score Update (with anti-cheat) ───
  socket.on('ss:scoreUpdate', (payload: {
    matchId?: string; userId?: string; displayName?: string;
    score?: number; maxCombo?: number; puzzlesSolved?: number; puzzlesMissed?: number;
  }) => {
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const lobbyCode = ssSocketLobbyMap.get(socket.id);
    if (!lobbyCode) return;
    const lobby = ssGetLobbyByCode(lobbyCode);
    if (!lobby || lobby.status !== 'IN_MATCH') return;

    const mp = lobby.matchPlayers.get(userId);
    if (!mp || mp.finished) return;

    const newScore = typeof payload?.score === 'number' ? payload.score : mp.score;

    // Anti-cheat: score cannot decrease
    if (newScore < mp.score) return;

    // Anti-cheat: rate limit score growth
    const now = Date.now();
    const elapsed = Math.max(1, now - mp.lastUpdateAt);
    const scoreDelta = newScore - mp.lastScore;
    if (elapsed < SCORE_UPDATE_INTERVAL && scoreDelta > SCORE_RATE_LIMIT) {
      logger.warn({ event: 'ss_score_rate_limit', userId, scoreDelta, elapsed });
      return;
    }

    // Anti-cheat: puzzle delta validation
    const newSolved = typeof payload?.puzzlesSolved === 'number' ? payload.puzzlesSolved : mp.puzzlesSolved;
    const solvedDelta = newSolved - mp.puzzlesSolved;
    if (solvedDelta > 10) {
      logger.warn({ event: 'ss_puzzle_jump_too_high', userId, solvedDelta });
      return;
    }

    mp.score = newScore;
    mp.maxCombo = Math.max(mp.maxCombo, typeof payload?.maxCombo === 'number' ? payload.maxCombo : 0);
    mp.puzzlesSolved = newSolved;
    mp.puzzlesMissed = typeof payload?.puzzlesMissed === 'number' ? payload.puzzlesMissed : mp.puzzlesMissed;
    mp.lastUpdateAt = now;
    mp.lastScore = newScore;

    ssBroadcastLeaderboard(io, lobby);

    // Periodic DB persistence for significant score changes
    if (scoreDelta >= 500 || solvedDelta >= 5) {
      try {
        const db = getPrismaClient();
        db.sSPlayerMatch.updateMany({
          where: { matchId: lobby.currentMatchId!, userId },
          data: {
            score: mp.score, maxCombo: mp.maxCombo,
            puzzlesSolved: mp.puzzlesSolved, puzzlesMissed: mp.puzzlesMissed,
            lastUpdateAt: new Date(),
          },
        }).catch((err: Error) => logger.warn({ event: 'ss_db_score_persist_failed', error: err.message }));
      } catch (err) {
        logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
      }
    }
  });

  // ─── Finish Match ───
  socket.on('ss:finishMatch', (payload: {
    matchId?: string; userId?: string;
    score?: number; maxCombo?: number; puzzlesSolved?: number; puzzlesMissed?: number;
  }) => {
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const lobbyCode = ssSocketLobbyMap.get(socket.id);
    if (!lobbyCode) return;
    const lobby = ssGetLobbyByCode(lobbyCode);
    if (!lobby || lobby.status !== 'IN_MATCH') return;

    const mp = lobby.matchPlayers.get(userId);
    if (!mp) return;

    mp.finished = true;
    mp.score = typeof payload?.score === 'number' ? Math.max(mp.score, payload.score) : mp.score;
    mp.maxCombo = Math.max(mp.maxCombo, typeof payload?.maxCombo === 'number' ? payload.maxCombo : 0);
    mp.puzzlesSolved = typeof payload?.puzzlesSolved === 'number' ? payload.puzzlesSolved : mp.puzzlesSolved;
    mp.puzzlesMissed = typeof payload?.puzzlesMissed === 'number' ? payload.puzzlesMissed : mp.puzzlesMissed;

    ssBroadcastLeaderboard(io, lobby);

    const allFinished = Array.from(lobby.matchPlayers.values()).every(p => p.finished);
    if (allFinished) {
      lobby.status = 'WAITING';

      const finalLeaderboard = Array.from(lobby.matchPlayers.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          userId: p.userId, displayName: p.displayName,
          score: p.score, maxCombo: p.maxCombo,
          puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
          finished: p.finished,
        }));
      io.to(`ss:${lobby.code}`).emit('ss:matchFinished', { leaderboard: finalLeaderboard });

      for (const p of lobby.players.values()) p.isReady = false;
      ssBroadcastLobby(io, lobby);
      logger.info({ event: 'ss_match_finished', code: lobby.code });
    }

    // Fire-and-forget DB persistence
    try {
      const db = getPrismaClient();
      db.sSPlayerMatch.updateMany({
        where: { matchId: lobby.currentMatchId!, userId },
        data: {
          score: mp.score, maxCombo: mp.maxCombo,
          puzzlesSolved: mp.puzzlesSolved, puzzlesMissed: mp.puzzlesMissed,
          finishedAt: new Date(), lastUpdateAt: new Date(),
        },
      }).catch((err: Error) => logger.warn({ event: 'ss_db_finish_player_persist_failed', error: err.message }));

      if (allFinished) {
        db.sSMatch.update({
          where: { id: lobby.currentMatchId! },
          data: { status: 'FINISHED', endAt: new Date() },
        }).then(() =>
          db.sSLobby.update({ where: { id: lobby.id }, data: { status: 'WAITING' } })
        ).catch((err: Error) => logger.warn({ event: 'ss_db_finish_match_persist_failed', error: err.message }));
      }
    } catch (err) {
      logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
    }
  });

  // ─── Return to Lobby ───
  socket.on('ss:returnToLobby', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    // Identity must come from the authenticated session, never a client-supplied
    // payload.userId (which let an attacker forge match records under any victim's
    // id). Anonymous players get a stable per-connection guest id so lobby play
    // still works but can never impersonate a real account.
    const userId = typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;
    const lobby = ssGetLobbyByCode(code);
    if (!lobby) return;
    if (lobby.hostUserId !== userId) return;

    lobby.status = 'WAITING';
    lobby.matchPlayers.clear();
    lobby.currentMatchId = null;
    lobby.currentMatchSeed = null;
    lobby.currentMatchStartAt = null;

    for (const p of lobby.players.values()) p.isReady = false;

    io.to(`ss:${code}`).emit('ss:returnToLobby');
    ssBroadcastLobby(io, lobby);

    // Fire-and-forget DB persistence
    try {
      const db = getPrismaClient();
      db.sSLobby.update({ where: { id: lobby.id }, data: { status: 'WAITING' } })
        .catch((err: Error) => logger.warn({ event: 'ss_db_return_to_lobby_failed', error: err.message }));
    } catch (err) {
      logger.warn({ event: 'ss_db_prisma_unavailable', error: (err as Error).message });
    }
  });
}

// ─── Disconnect Handler ───

export function handleSynapseStormDisconnect(io: Server, socket: Socket): void {
  const ssUserId = ssSocketUserMap.get(socket.id);
  if (!ssUserId) return;

  const ssLobbyCode = ssSocketLobbyMap.get(socket.id);
  if (!ssLobbyCode) return;

  const ssLobby = ssLobbies.get(ssLobbyCode);
  if (ssLobby && ssLobby.status !== 'IN_MATCH') {
    // Not in a match: fully remove the player
    ssRemovePlayer(io, socket.id);
  } else {
    // During a match: keep player data for reconnect, but clear socket mappings
    ssSocketUserMap.delete(socket.id);
    ssSocketLobbyMap.delete(socket.id);
  }
}
