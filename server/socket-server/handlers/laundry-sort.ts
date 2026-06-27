/**
 * Laundry Sort — Multiplayer Lobby Handler
 *
 * N-player lobbies by code, seeded synced rounds (every client sorts the same
 * deterministic clothing stream from a shared seed), live leaderboard
 * broadcasting, server-clock round timer (scores are compared after a fixed
 * round length), anti-cheat on score growth, reconnect-to-match, and
 * fire-and-forget Prisma persistence that degrades gracefully when the DB is
 * unavailable.
 *
 * Modeled on handlers/synapse-storm.ts.
 */

import type { Server, Socket } from 'socket.io';
import { sanitizeUserName } from '../utils';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';

interface LSPlayer {
  socketId: string;
  userId: string;
  displayName: string;
  isReady: boolean;
  isHost: boolean;
}

interface LSMatchPlayer {
  userId: string;
  displayName: string;
  score: number;
  bestStreak: number;
  sorted: number;
  missed: number;
  accuracy: number;
  finished: boolean;
  lastUpdateAt: number;
  lastScore: number;
}

interface LSLobby {
  id: string;
  code: string;
  hostUserId: string;
  status: 'WAITING' | 'IN_MATCH' | 'CLOSED';
  durationSec: number;
  players: Map<string, LSPlayer>; // by userId
  currentMatchId: string | null;
  currentMatchSeed: number | null;
  currentMatchStartAt: number | null;
  matchPlayers: Map<string, LSMatchPlayer>; // by userId
  endTimer: NodeJS.Timeout | null;
}

const MAX_PLAYERS = 8;
const SCORE_RATE_LIMIT = 8000; // max score gain per window
const SCORE_WINDOW_MS = 5000;
const COUNTDOWN_MS = 3500;
const ALLOWED_DURATIONS = [45, 60, 75, 90, 120];

const lobbies = new Map<string, LSLobby>(); // by code
const userSocket = new Map<string, string>();
const socketUser = new Map<string, string>();
const socketLobby = new Map<string, string>();

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
function genId(): string {
  return 'ls_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function getLobby(code: string): LSLobby | undefined {
  return lobbies.get(code.toUpperCase());
}

function leaderboardOf(lobby: LSLobby): Array<Omit<LSMatchPlayer, 'lastUpdateAt' | 'lastScore'>> {
  return Array.from(lobby.matchPlayers.values())
    .sort((a, b) => b.score - a.score)
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      score: p.score,
      bestStreak: p.bestStreak,
      sorted: p.sorted,
      missed: p.missed,
      accuracy: p.accuracy,
      finished: p.finished,
    }));
}

function broadcastLobby(io: Server, lobby: LSLobby): void {
  const players = Array.from(lobby.players.values()).map((p) => ({
    id: p.socketId,
    userId: p.userId,
    displayName: p.displayName,
    isReady: p.isReady,
    isHost: p.isHost,
  }));
  io.to(`ls:${lobby.code}`).emit('ls:lobbyUpdate', {
    lobbyId: lobby.id,
    code: lobby.code,
    status: lobby.status,
    players,
    hostUserId: lobby.hostUserId,
    durationSec: lobby.durationSec,
  });
}

function broadcastLeaderboard(io: Server, lobby: LSLobby): void {
  io.to(`ls:${lobby.code}`).emit('ls:leaderboardUpdate', { leaderboard: leaderboardOf(lobby) });
}

function finishMatch(io: Server, lobby: LSLobby): void {
  if (lobby.status !== 'IN_MATCH') return;
  if (lobby.endTimer) {
    clearTimeout(lobby.endTimer);
    lobby.endTimer = null;
  }
  for (const p of lobby.matchPlayers.values()) p.finished = true;
  lobby.status = 'WAITING';
  const finalLeaderboard = leaderboardOf(lobby);
  io.to(`ls:${lobby.code}`).emit('ls:matchFinished', { leaderboard: finalLeaderboard });
  for (const p of lobby.players.values()) p.isReady = false;
  broadcastLobby(io, lobby);
  logger.info({ event: 'ls_match_finished', code: lobby.code });

  try {
    const db = getPrismaClient();
    if (lobby.currentMatchId) {
      db.lSMatch
        .update({ where: { id: lobby.currentMatchId }, data: { status: 'FINISHED', endAt: new Date() } })
        .catch((err: Error) => logger.warn({ event: 'ls_db_finish_failed', error: err.message }));
    }
  } catch {
    /* DB optional */
  }
}

function removePlayer(io: Server, socketId: string): void {
  const userId = socketUser.get(socketId);
  const code = socketLobby.get(socketId);
  if (!userId || !code) return;
  const lobby = lobbies.get(code);
  socketUser.delete(socketId);
  socketLobby.delete(socketId);
  if (!lobby) return;
  if (userSocket.get(userId) === socketId) userSocket.delete(userId);
  lobby.players.delete(userId);

  if (lobby.players.size === 0) {
    if (lobby.endTimer) clearTimeout(lobby.endTimer);
    lobbies.delete(code);
    return;
  }
  if (lobby.hostUserId === userId) {
    const next = lobby.players.values().next().value as LSPlayer | undefined;
    if (next) {
      lobby.hostUserId = next.userId;
      next.isHost = true;
    }
  }
  broadcastLobby(io, lobby);
  if (lobby.status === 'IN_MATCH') broadcastLeaderboard(io, lobby);
}

export function registerLaundrySortHandlers(io: Server, socket: Socket): void {
  socket.on('ls:timeSync', (payload: { clientTime?: number }) => {
    const clientTime = typeof payload?.clientTime === 'number' ? payload.clientTime : Date.now();
    socket.emit('ls:timeSync', { serverTime: Date.now(), clientTime });
  });

  socket.on('ls:createLobby', (payload: { userId?: string; displayName?: string }) => {
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const displayName = sanitizeUserName(payload?.displayName);
    if (!userId) {
      socket.emit('ls:error', { message: 'Missing userId' });
      return;
    }
    removePlayer(io, socket.id);

    let code = genCode();
    let attempts = 0;
    while (lobbies.has(code) && attempts < 20) {
      code = genCode();
      attempts++;
    }
    const lobby: LSLobby = {
      id: genId(),
      code,
      hostUserId: userId,
      status: 'WAITING',
      durationSec: 75,
      players: new Map(),
      currentMatchId: null,
      currentMatchSeed: null,
      currentMatchStartAt: null,
      matchPlayers: new Map(),
      endTimer: null,
    };
    lobby.players.set(userId, { socketId: socket.id, userId, displayName, isReady: false, isHost: true });
    lobbies.set(code, lobby);
    userSocket.set(userId, socket.id);
    socketUser.set(socket.id, userId);
    socketLobby.set(socket.id, code);
    socket.join(`ls:${code}`);
    broadcastLobby(io, lobby);
    logger.info({ event: 'ls_lobby_created', code, userId });

    try {
      const db = getPrismaClient();
      db.lSLobby
        .create({ data: { id: lobby.id, code, hostUserId: userId, status: 'WAITING' } })
        .catch((err: Error) => logger.warn({ event: 'ls_db_lobby_failed', error: err.message }));
    } catch {
      /* DB optional */
    }
  });

  socket.on('ls:joinLobby', (payload: { code?: string; userId?: string; displayName?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase().trim();
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const displayName = sanitizeUserName(payload?.displayName);
    if (!code || !userId) {
      socket.emit('ls:error', { message: 'Missing code or userId' });
      return;
    }
    const lobby = getLobby(code);
    if (!lobby) {
      socket.emit('ls:error', { message: 'Lobby not found' });
      return;
    }
    if (lobby.status === 'CLOSED') {
      socket.emit('ls:error', { message: 'Lobby is closed' });
      return;
    }
    if (lobby.players.size >= MAX_PLAYERS && !lobby.players.has(userId)) {
      socket.emit('ls:error', { message: 'Lobby is full' });
      return;
    }

    const existing = socketLobby.get(socket.id);
    if (existing && existing !== code) removePlayer(io, socket.id);
    const oldSocket = userSocket.get(userId);
    if (oldSocket && oldSocket !== socket.id) {
      socketUser.delete(oldSocket);
      socketLobby.delete(oldSocket);
    }

    const isHost = lobby.players.size === 0 || lobby.hostUserId === userId;
    lobby.players.set(userId, {
      socketId: socket.id,
      userId,
      displayName,
      isReady: lobby.players.get(userId)?.isReady ?? false,
      isHost,
    });
    userSocket.set(userId, socket.id);
    socketUser.set(socket.id, userId);
    socketLobby.set(socket.id, code);
    socket.join(`ls:${code}`);
    broadcastLobby(io, lobby);

    // Reconnect into a live match.
    if (
      lobby.status === 'IN_MATCH' &&
      lobby.currentMatchId &&
      lobby.currentMatchSeed !== null &&
      lobby.currentMatchStartAt !== null
    ) {
      socket.emit('ls:matchStart', {
        matchId: lobby.currentMatchId,
        seed: lobby.currentMatchSeed,
        startAt: lobby.currentMatchStartAt,
        durationSec: lobby.durationSec,
        status: 'RUNNING',
        leaderboard: leaderboardOf(lobby),
      });
    }
    logger.info({ event: 'ls_player_joined', code, userId });
  });

  socket.on('ls:leaveLobby', (payload: { code?: string }) => {
    removePlayer(io, socket.id);
    const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    if (code) socket.leave(`ls:${code}`);
  });

  socket.on('ls:toggleReady', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const lobby = getLobby(code);
    const player = lobby?.players.get(userId);
    if (!lobby || !player) return;
    player.isReady = !player.isReady;
    broadcastLobby(io, lobby);
  });

  socket.on('ls:setDuration', (payload: { code?: string; userId?: string; durationSec?: number }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const lobby = getLobby(code);
    if (!lobby || lobby.hostUserId !== userId || lobby.status !== 'WAITING') return;
    const d = Number(payload?.durationSec);
    if (!ALLOWED_DURATIONS.includes(d)) return;
    lobby.durationSec = d;
    broadcastLobby(io, lobby);
  });

  socket.on('ls:startMatch', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const lobby = getLobby(code);
    if (!lobby) {
      socket.emit('ls:error', { message: 'Lobby not found' });
      return;
    }
    if (lobby.hostUserId !== userId) {
      socket.emit('ls:error', { message: 'Only the host can start' });
      return;
    }
    if (lobby.status !== 'WAITING') return;

    const seed = Math.floor(Math.random() * 2147483647);
    const startAt = Date.now() + COUNTDOWN_MS;
    const matchId = genId();
    lobby.status = 'IN_MATCH';
    lobby.currentMatchId = matchId;
    lobby.currentMatchSeed = seed;
    lobby.currentMatchStartAt = startAt;
    lobby.matchPlayers.clear();
    for (const [uid, p] of lobby.players) {
      lobby.matchPlayers.set(uid, {
        userId: uid,
        displayName: p.displayName,
        score: 0,
        bestStreak: 0,
        sorted: 0,
        missed: 0,
        accuracy: 1,
        finished: false,
        lastUpdateAt: Date.now(),
        lastScore: 0,
      });
    }

    io.to(`ls:${code}`).emit('ls:countdown', { countdownEndsAt: startAt });
    broadcastLobby(io, lobby);

    setTimeout(() => {
      if (lobby.currentMatchId !== matchId) return;
      io.to(`ls:${code}`).emit('ls:matchStart', {
        matchId,
        seed,
        startAt,
        durationSec: lobby.durationSec,
        status: 'RUNNING',
        leaderboard: leaderboardOf(lobby),
      });
    }, COUNTDOWN_MS);

    // Authoritative round timer: scores are compared after the fixed round length.
    if (lobby.endTimer) clearTimeout(lobby.endTimer);
    lobby.endTimer = setTimeout(
      () => {
        if (lobby.currentMatchId === matchId) finishMatch(io, lobby);
      },
      COUNTDOWN_MS + lobby.durationSec * 1000 + 1500, // small grace for final updates
    );

    logger.info({ event: 'ls_match_started', code, seed, durationSec: lobby.durationSec });

    try {
      const db = getPrismaClient();
      db.lSMatch
        .create({ data: { id: matchId, lobbyId: lobby.id, seed, startAt: new Date(startAt), status: 'RUNNING' } })
        .catch((err: Error) => logger.warn({ event: 'ls_db_match_failed', error: err.message }));
    } catch {
      /* DB optional */
    }
  });

  socket.on(
    'ls:scoreUpdate',
    (payload: {
      userId?: string;
      score?: number;
      bestStreak?: number;
      sorted?: number;
      missed?: number;
      accuracy?: number;
    }) => {
      const userId = typeof payload?.userId === 'string' ? payload.userId : '';
      const code = socketLobby.get(socket.id);
      if (!code) return;
      const lobby = getLobby(code);
      if (!lobby || lobby.status !== 'IN_MATCH') return;
      const mp = lobby.matchPlayers.get(userId);
      if (!mp || mp.finished) return;

      const newScore = typeof payload?.score === 'number' ? payload.score : mp.score;
      if (newScore < mp.score) return; // monotonic
      const now = Date.now();
      const elapsed = Math.max(1, now - mp.lastUpdateAt);
      const delta = newScore - mp.lastScore;
      if (elapsed < SCORE_WINDOW_MS && delta > SCORE_RATE_LIMIT) {
        logger.warn({ event: 'ls_score_rate_limit', userId, delta, elapsed });
        return;
      }
      mp.score = newScore;
      mp.bestStreak = Math.max(mp.bestStreak, typeof payload?.bestStreak === 'number' ? payload.bestStreak : 0);
      mp.sorted = typeof payload?.sorted === 'number' ? payload.sorted : mp.sorted;
      mp.missed = typeof payload?.missed === 'number' ? payload.missed : mp.missed;
      mp.accuracy = typeof payload?.accuracy === 'number' ? payload.accuracy : mp.accuracy;
      mp.lastUpdateAt = now;
      mp.lastScore = newScore;
      broadcastLeaderboard(io, lobby);
    },
  );

  socket.on(
    'ls:finishMatch',
    (payload: {
      userId?: string;
      score?: number;
      bestStreak?: number;
      sorted?: number;
      missed?: number;
      accuracy?: number;
    }) => {
      const userId = typeof payload?.userId === 'string' ? payload.userId : '';
      const code = socketLobby.get(socket.id);
      if (!code) return;
      const lobby = getLobby(code);
      if (!lobby || lobby.status !== 'IN_MATCH') return;
      const mp = lobby.matchPlayers.get(userId);
      if (!mp) return;
      mp.finished = true;
      mp.score = typeof payload?.score === 'number' ? Math.max(mp.score, payload.score) : mp.score;
      mp.bestStreak = Math.max(mp.bestStreak, typeof payload?.bestStreak === 'number' ? payload.bestStreak : 0);
      mp.sorted = typeof payload?.sorted === 'number' ? payload.sorted : mp.sorted;
      mp.missed = typeof payload?.missed === 'number' ? payload.missed : mp.missed;
      mp.accuracy = typeof payload?.accuracy === 'number' ? payload.accuracy : mp.accuracy;
      broadcastLeaderboard(io, lobby);

      if (Array.from(lobby.matchPlayers.values()).every((p) => p.finished)) {
        finishMatch(io, lobby);
      }
    },
  );

  socket.on('ls:returnToLobby', (payload: { code?: string; userId?: string }) => {
    const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const lobby = getLobby(code);
    if (!lobby || lobby.hostUserId !== userId) return;
    if (lobby.endTimer) {
      clearTimeout(lobby.endTimer);
      lobby.endTimer = null;
    }
    lobby.status = 'WAITING';
    lobby.matchPlayers.clear();
    lobby.currentMatchId = null;
    lobby.currentMatchSeed = null;
    lobby.currentMatchStartAt = null;
    for (const p of lobby.players.values()) p.isReady = false;
    io.to(`ls:${code}`).emit('ls:returnToLobby');
    broadcastLobby(io, lobby);
  });
}

export function handleLaundrySortDisconnect(io: Server, socket: Socket): void {
  const userId = socketUser.get(socket.id);
  if (!userId) return;
  const code = socketLobby.get(socket.id);
  if (!code) return;
  const lobby = lobbies.get(code);
  if (lobby && lobby.status !== 'IN_MATCH') {
    removePlayer(io, socket.id);
  } else {
    // Keep match data for reconnect; just drop the socket mappings.
    socketUser.delete(socket.id);
    socketLobby.delete(socket.id);
  }
}
