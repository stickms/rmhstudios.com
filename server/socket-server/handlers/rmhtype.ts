/**
 * RMH Type — Competitive Typing Game Handler
 *
 * Manages multiplayer typing rooms, solo practice, game rounds with
 * passage selection, WPM/accuracy tracking, scoring, and leaderboards.
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { awardAppProgress } from '../economy';
import { PresenceGrace } from '../../shared/presence-grace';
import { S2C, type RunFinishPayload } from '../../../lib/rmhtype/events';
import { saveGhostIfBest, type GhostDb } from '../../../lib/rmhtype/ghost-save.server';
import { PASSAGES, type Passage } from '../../../lib/rmhtype/passages';
import { generateTypingPassage } from '../../../lib/ai/text.server';
import { parseSoloSource, pickCodeSnippet, extractLorePassage } from '../../../lib/rmhtype/sources';
import { challengePassage } from '../../../lib/rmhtype/challenges';
import { clampProgress, clampRunCounts, evaluateFinish, type RunReason } from '../../../lib/rmhtype/run-check';
import { MAX_WPM } from '../../../lib/rmhtype/typing-run';
import {
  claimChallengeRace,
  settleAndNotify,
  type ChallengeDb,
  type Settlement,
} from '../../../lib/rmhtype/challenges-settle.server';

// ─── Types ──────────────────────────────────────────────────

type RoomState = 'WAITING' | 'COUNTDOWN' | 'TYPING' | 'ROUND_RESULTS' | 'FINAL_RESULTS';

interface RoomSettings {
  isPublic: boolean;
  maxPlayers: number;
  difficulty: 'easy' | 'medium' | 'hard';
  passageLength: 'short' | 'medium' | 'long';
  rounds: number;
  password: string | null;
}

interface TypePlayer {
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isHost: boolean;
  isReady: boolean;
  score: number;
  currentPosition: number;
  errors: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
  finishTime: number | null;
  finishRank: number;
  /** When the last progress event was taken (ms), so a step is capped by the time it took. */
  lastProgressAt: number;
  /** Why the finish failed the server's check (`run-check.ts`): the player is placed "Did not finish" and unranked. */
  dnfReason: RunReason | null;
}

interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason: string | null;
}

interface TypeRoom {
  roomId: string;
  hostUserId: string;
  state: RoomState;
  settings: RoomSettings;
  players: Map<string, TypePlayer>;
  bannedUsers: BannedUser[];
  currentRound: number;
  totalRounds: number;
  passage: string | null;
  passageId: string | null;
  roundStartTime: number | null;
  finishOrder: number;
  chat: Array<{
    id: string;
    userId: string;
    userName: string;
    content: string;
    createdAt: number;
  }>;
  seq: number;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  progressBroadcastTimer: ReturnType<typeof setInterval> | null;
  nextRoundTimer: ReturnType<typeof setTimeout> | null;
  /**
   * The 5-minute round timeout. It was never stored, so it could not be
   * cleared, and its only guard was state === 'TYPING' — round N's timer
   * ended round N+1 early. Now stored, cleared, and tagged with the round.
   */
  roundTimeoutTimer?: ReturnType<typeof setTimeout> | null;
  roundResults: Array<{
    rankings: any[];
  }>;
  /**
   * True when the passage was written by the AI for a player-chosen topic.
   *
   * Such a run is practice only: it never reaches `persistSoloResult`, and so
   * never reaches the leaderboard. A generated passage's difficulty is not
   * comparable to the curated list's — it is whatever the model produced that
   * second, and it is chosen by the player — so a WPM set on one cannot be
   * ranked against a WPM set on `hard-10` without making the board meaningless.
   */
  aiPassage?: boolean;
  /**
   * A solo run that is a challenge race (s11-12). `done` is set the moment the run is settled by its finish, so the
   * room being removed afterwards (the usual end of a solo run) does not also settle it as "Did not finish". A room
   * removed before that (leave, disconnect, the solo timeout, a new start) settles it that way: a race is one attempt.
   */
  challenge?: { id: string; done: boolean };
}

// ─── Module State ───────────────────────────────────────────

const rooms = new Map<string, TypeRoom>();
const userSocketMap = new Map<string, string>(); // userId -> socketId
const socketUserMap = new Map<string, string>(); // socketId -> userId
const socketRoomMap = new Map<string, string>(); // socketId -> roomId

const MAX_PLAYERS = 16;
const ROUND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const COUNTDOWN_SECONDS = 5;
const PROGRESS_BROADCAST_INTERVAL_MS = 200;
const NEXT_ROUND_DELAY_MS = 5_000;
const ROOM_CLEANUP_DELAY_MS = 60_000;

/**
 * The `io` handle, captured on first registration. The grace manager is
 * module-scoped (it outlives any one socket) but still needs to broadcast.
 */
let ioRef: Server | null = null;

/**
 * Disconnect grace. Announces who the room is waiting for, and removes them
 * once the shared 15s window closes so a round can't stall on someone who
 * closed their laptop mid-passage.
 */
const presence = new PresenceGrace({
  onChange: (roomId, waiting) => {
    ioRef?.to(`rmhtype:${roomId}`).emit(S2C.PEERS_WAITING, waiting);
  },
  onExpire: (roomId, userId) => {
    const io = ioRef;
    const room = rooms.get(roomId);
    if (!io || !room) return;

    const player = room.players.get(userId);
    // They reconnected between the timer firing and this callback running.
    if (!player || player.isConnected) return;

    room.players.delete(userId);
    logger.info({
      event: 'rmhtype_player_grace_expired',
      roomId,
      userId,
    });

    if (room.players.size === 0) {
      removeRoom(roomId);
      return;
    }

    if (room.hostUserId === userId) migrateHost(io, room);
    broadcastRoomState(io, room);

    // Their departure may be what the round was waiting on.
    if (room.state === 'TYPING') checkAllPlayersFinished(io, room);
  },
});

const DEFAULT_SETTINGS: RoomSettings = {
  isPublic: false,
  maxPlayers: 8,
  difficulty: 'medium',
  passageLength: 'medium',
  rounds: 3,
  password: null,
};

// ─── Helpers ────────────────────────────────────────────────

function selectPassage(settings: RoomSettings): Passage {
  const { difficulty, passageLength } = settings;

  const byDifficulty = PASSAGES.filter((p) => p.difficulty === difficulty);

  let filtered: Passage[];
  if (passageLength === 'short') {
    filtered = byDifficulty.filter((p) => p.wordCount < 30);
  } else if (passageLength === 'medium') {
    filtered = byDifficulty.filter((p) => p.wordCount >= 30 && p.wordCount <= 80);
  } else {
    filtered = byDifficulty.filter((p) => p.wordCount > 80);
  }

  // Fallback to any passage of that difficulty if no match
  if (filtered.length === 0) {
    filtered = byDifficulty;
  }

  // Final fallback to any passage at all
  if (filtered.length === 0) {
    filtered = [...PASSAGES];
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

function broadcastAction(io: Server, room: TypeRoom, type: string, payload: Record<string, any>): void {
  room.seq++;
  io.to(`rmhtype:${room.roomId}`).emit('rmhtype:room:action', {
    type,
    payload,
    seq: room.seq,
  });
}

function buildStateSnapshot(room: TypeRoom, userId: string) {
  const passageLen = room.passage?.length ?? 0;
  return {
    roomCode: room.roomId,
    hostUserId: room.hostUserId,
    isPublic: room.settings.isPublic,
    status: room.state,
    settings: {
      difficulty: room.settings.difficulty,
      passageLength: room.settings.passageLength,
      rounds: room.settings.rounds,
    },
    bannedUsers: room.bannedUsers,
    players: Array.from(room.players.values()).map((p) => ({
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      isHost: p.isHost,
      isReady: p.isReady,
      isConnected: p.isConnected,
    })),
    chat: room.chat.slice(-100).map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      message: c.content,
      timestamp: c.createdAt,
      reactions: {},
    })),
    myUserId: userId,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    passage: room.state === 'TYPING' ? room.passage : null,
    passageId: room.state === 'TYPING' ? room.passageId : null,
    progress:
      room.state === 'TYPING'
        ? Array.from(room.players.values()).map((p) => ({
            userId: p.userId,
            userName: p.userName,
            charsTyped: p.currentPosition,
            totalChars: passageLen,
            wpm: Math.round(p.wpm * 100) / 100,
            finished: p.finished,
          }))
        : [],
    roundResults: null,
    finalResults: null,
    countdownSeconds: room.state === 'COUNTDOWN' ? COUNTDOWN_SECONDS : null,
  };
}

function broadcastRoomState(io: Server, room: TypeRoom): void {
  for (const player of room.players.values()) {
    if (player.isConnected) {
      const s = io.sockets.sockets.get(player.socketId);
      if (s) s.emit('rmhtype:room:state', buildStateSnapshot(room, player.userId));
    }
  }
  // Ride along with every state change so a client that just joined, or one
  // whose snapshot arrived out of order, always agrees with the server about
  // whether the room is waiting on someone.
  io.to(`rmhtype:${room.roomId}`).emit(S2C.PEERS_WAITING, presence.getWaiting(room.roomId));
}

function createPlayer(
  socketId: string,
  userId: string,
  userName: string,
  avatarUrl: string | null,
  isHost: boolean,
): TypePlayer {
  return {
    socketId,
    userId,
    userName,
    avatarUrl,
    isConnected: true,
    isHost,
    isReady: isHost, // host is auto-ready
    score: 0,
    currentPosition: 0,
    errors: 0,
    wpm: 0,
    accuracy: 100,
    finished: false,
    finishTime: null,
    finishRank: 0,
    lastProgressAt: 0,
    dnfReason: null,
  };
}

function resetPlayersForRound(room: TypeRoom): void {
  for (const player of room.players.values()) {
    player.currentPosition = 0;
    player.errors = 0;
    player.wpm = 0;
    player.accuracy = 100;
    player.finished = false;
    player.finishTime = null;
    player.finishRank = 0;
    player.lastProgressAt = 0;
    player.dnfReason = null;
  }
  room.finishOrder = 0;
}

function cleanupRoomTimers(room: TypeRoom): void {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }
  if (room.progressBroadcastTimer) {
    clearInterval(room.progressBroadcastTimer);
    room.progressBroadcastTimer = null;
  }
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }
  clearRoundTimeout(room);
}

function clearRoundTimeout(room: TypeRoom): void {
  if (room.roundTimeoutTimer) {
    clearTimeout(room.roundTimeoutTimer);
    room.roundTimeoutTimer = null;
  }
}

/** The challenge race a removed room was running, if it never finished: settled as "Did not finish". */
function settleLeftChallenge(room: TypeRoom): void {
  const challenge = room.challenge;
  if (!challenge || challenge.done) return;
  challenge.done = true;
  settleAndNotify(getPrismaClient() as unknown as ChallengeDb, challenge.id, null).catch((err) => {
    logger.error({ event: 'rmhtype_challenge_settle_error', roomId: room.roomId, error: String(err) });
  });
}

function removeRoom(roomId: string): void {
  presence.clearRoom(roomId);
  const room = rooms.get(roomId);
  if (!room) return;
  cleanupRoomTimers(room);
  rooms.delete(roomId);
  settleLeftChallenge(room);
  logger.info({
    event: 'rmhtype_room_removed',
    roomId,
  });
}

function migrateHost(io: Server, room: TypeRoom): void {
  const connectedPlayers = Array.from(room.players.values()).filter((p) => p.isConnected);
  if (connectedPlayers.length === 0) return;

  const oldHostId = room.hostUserId;
  const oldHost = room.players.get(oldHostId);
  if (oldHost) oldHost.isHost = false;

  const newHost = connectedPlayers[0];
  newHost.isHost = true;
  newHost.isReady = true; // host is auto-ready
  room.hostUserId = newHost.userId;
  // broadcastRoomState is called by the caller (handlePlayerLeave)
}

function getConnectedPlayerCount(room: TypeRoom): number {
  let count = 0;
  for (const p of room.players.values()) {
    if (p.isConnected) count++;
  }
  return count;
}

function buildProgressSnapshot(room: TypeRoom) {
  return Array.from(room.players.values()).map((p) => ({
    userId: p.userId,
    currentPosition: p.currentPosition,
    wpm: p.wpm,
    accuracy: p.accuracy,
    finished: p.finished,
    finishTime: p.finishTime,
  }));
}

function calculatePositionBonus(rank: number): number {
  switch (rank) {
    case 1:
      return 500;
    case 2:
      return 300;
    case 3:
      return 150;
    default:
      return 50;
  }
}

function calculateRoundResults(room: TypeRoom): {
  rankings: any[];
} {
  const rankings = Array.from(room.players.values())
    .filter((p) => p.isConnected || p.finished)
    .sort((a, b) => {
      // A finish that failed the server's check ("Did not finish") sorts below everyone, whatever it claimed.
      if (a.dnfReason && !b.dnfReason) return 1;
      if (!a.dnfReason && b.dnfReason) return -1;
      // Finished players first, then by finishTime (faster = better)
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
      return b.currentPosition - a.currentPosition;
    })
    .map((p, index) => {
      const didNotFinish = p.dnfReason !== null;
      const rank = p.finished && !didNotFinish ? p.finishRank : index + 1;
      // A "Did not finish" scores nothing: no speed, no accuracy, no position bonus.
      const positionBonus = didNotFinish ? 0 : calculatePositionBonus(rank);
      const roundScore = didNotFinish ? 0 : Math.round(p.wpm * (p.accuracy / 100) * 10) + positionBonus;

      // Add to cumulative score
      p.score += roundScore;

      return {
        userId: p.userId,
        userName: p.userName,
        rank,
        wpm: didNotFinish ? 0 : Math.round(p.wpm * 100) / 100,
        accuracy: didNotFinish ? 0 : Math.round(p.accuracy * 100) / 100,
        finishTime: p.finishTime,
        roundScore,
        totalScore: p.score,
        positionBonus,
        reason: p.dnfReason,
      };
    });

  return {
    rankings,
  };
}

function calculateFinalResults(room: TypeRoom) {
  const standings = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      finalRank: index + 1,
      totalScore: p.score,
      avgWpm:
        room.roundResults.length > 0
          ? Math.round(
              (room.roundResults.reduce((sum, rr) => {
                const playerResult = rr.rankings.find((r: any) => r.userId === p.userId);
                return sum + (playerResult?.wpm ?? 0);
              }, 0) /
                room.roundResults.length) *
                100,
            ) / 100
          : 0,
      avgAccuracy:
        room.roundResults.length > 0
          ? Math.round(
              (room.roundResults.reduce((sum, rr) => {
                const playerResult = rr.rankings.find((r: any) => r.userId === p.userId);
                return sum + (playerResult?.accuracy ?? 0);
              }, 0) /
                room.roundResults.length) *
                100,
            ) / 100
          : 0,
      // Every round this player took part in failed the server's check ("Did not finish"): not ranked at all.
      unranked: (() => {
        const mine = room.roundResults.flatMap((rr) =>
          rr.rankings.filter((r: { userId?: string }) => r.userId === p.userId),
        );
        return mine.length > 0 && mine.every((r: { reason?: unknown }) => Boolean(r.reason));
      })(),
    }));

  const firstRanked = standings.find((st) => !st.unranked);
  return {
    standings,
    winnerUserId: firstRanked ? firstRanked.userId : null,
    totalRounds: room.totalRounds,
    roundResults: room.roundResults,
  };
}

function startProgressBroadcast(io: Server, room: TypeRoom): void {
  if (room.progressBroadcastTimer) clearInterval(room.progressBroadcastTimer);

  room.progressBroadcastTimer = setInterval(() => {
    if (room.state !== 'TYPING') {
      if (room.progressBroadcastTimer) {
        clearInterval(room.progressBroadcastTimer);
        room.progressBroadcastTimer = null;
      }
      return;
    }
    const passageLen = room.passage?.length ?? 0;
    // Batch every connected player's progress into ONE room-wide emit per tick
    // instead of emitting one event per player (which fanned out O(players^2)
    // messages per tick). Per-player fields are unchanged — only the envelope
    // is now an array. Client consumers of `rmhtype:game:progress` must read
    // the array (see lib/rmhtype/socket.ts).
    const progress = [];
    for (const p of room.players.values()) {
      if (!p.isConnected) continue;
      progress.push({
        userId: p.userId,
        userName: p.userName,
        charsTyped: p.currentPosition,
        totalChars: passageLen,
        wpm: Math.round(p.wpm * 100) / 100,
        finished: p.finished,
      });
    }
    if (progress.length > 0) {
      // perf: volatile — every frame carries full per-player state, so a missed one is
      // replaced 200ms later; don't let connectionStateRecovery retain them.
      io.to(`rmhtype:${room.roomId}`).volatile.emit('rmhtype:game:progress', progress);
    }
  }, PROGRESS_BROADCAST_INTERVAL_MS);
}

function checkAllPlayersFinished(io: Server, room: TypeRoom): void {
  const activePlayers = Array.from(room.players.values()).filter((p) => p.isConnected);
  const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.finished);

  if (allFinished) {
    endRound(io, room);
  }
}

function endRound(io: Server, room: TypeRoom): void {
  clearRoundTimeout(room);
  if (room.progressBroadcastTimer) {
    clearInterval(room.progressBroadcastTimer);
    room.progressBroadcastTimer = null;
  }

  const roundResults = calculateRoundResults(room);
  room.roundResults.push(roundResults);
  const isLastRound = room.currentRound >= room.totalRounds;

  // Emit in client-expected shape: { round, rankings: PlayerResult[], isLastRound }
  io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:roundResults', {
    round: room.currentRound,
    rankings: roundResults.rankings.map((r: any) => ({
      userId: r.userId,
      userName: r.userName,
      wpm: r.wpm,
      accuracy: r.accuracy,
      timeMs: r.finishTime ?? 0,
      score: r.roundScore,
      rank: r.rank,
      // "Did not finish": the finish failed the server's check (`reason`) and the run is not ranked.
      ...(r.reason ? { didNotFinish: true, reason: r.reason } : {}),
    })),
    isLastRound,
  });

  if (isLastRound) {
    // Final results
    const finalResults = calculateFinalResults(room);
    room.state = 'FINAL_RESULTS';

    // Emit in client-expected shape: { rankings: (PlayerResult & { totalScore })[] }
    io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:finalResults', {
      rankings: finalResults.standings.map((s: any) => ({
        userId: s.userId,
        userName: s.userName,
        wpm: s.avgWpm,
        accuracy: s.avgAccuracy,
        timeMs: 0,
        score: s.totalScore,
        rank: s.finalRank,
        totalScore: s.totalScore,
      })),
    });

    // Persist match to DB, then broadcast updated leaderboard
    persistMatchResults(room, finalResults)
      .then(async () => {
        try {
          const prisma = getPrismaClient();
          const leaderboard = await fetchLeaderboard(prisma, room.settings.difficulty, 20);
          io.to(`rmhtype:${room.roomId}`).emit('rmhtype:leaderboard:data', {
            leaderboard,
            difficulty: room.settings.difficulty,
          });
        } catch (err) {
          logger.error({
            event: 'rmhtype_leaderboard_broadcast_error',
            roomId: room.roomId,
            error: String(err),
          });
        }
      })
      .catch((err) => {
        logger.error({
          event: 'rmhtype_persist_match_error',
          roomId: room.roomId,
          error: String(err),
        });
      });
  } else {
    room.state = 'ROUND_RESULTS';

    // Auto-start next round after a short delay
    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      if (room.state !== 'ROUND_RESULTS') return;
      startRound(io, room);
    }, NEXT_ROUND_DELAY_MS);
  }
}

function startRound(io: Server, room: TypeRoom): void {
  // Clear any pending next-round timer
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }

  const passage = selectPassage(room.settings);
  room.passage = passage.text;
  room.passageId = passage.id;
  room.currentRound++;

  // Reset player state for new round
  resetPlayersForRound(room);

  // Countdown phase
  room.state = 'COUNTDOWN';

  let remaining = COUNTDOWN_SECONDS;
  io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:countdown', {
    seconds: remaining,
  });
  const countdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0 && room.state === 'COUNTDOWN') {
      io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:countdown', {
        seconds: remaining,
      });
    } else {
      clearInterval(countdownInterval);
    }
  }, 1000);

  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null;
    clearInterval(countdownInterval);

    if (room.state !== 'COUNTDOWN') return;

    room.state = 'TYPING';
    room.roundStartTime = Date.now();

    io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:passage', {
      passageId: room.passageId,
      text: room.passage,
      round: room.currentRound,
      totalRounds: room.totalRounds,
    });

    startProgressBroadcast(io, room);

    // Round timeout
    clearRoundTimeout(room);
    const round = room.currentRound;
    room.roundTimeoutTimer = setTimeout(() => {
      room.roundTimeoutTimer = null;
      if (rooms.get(room.roomId) !== room || room.currentRound !== round) return;
      if (room.state === 'TYPING') {
        logger.info({
          event: 'rmhtype_round_timeout',
          roomId: room.roomId,
          round: room.currentRound,
        });
        endRound(io, room);
      }
    }, ROUND_TIMEOUT_MS);

    logger.info({
      event: 'rmhtype_round_started',
      roomId: room.roomId,
      round: room.currentRound,
      passageId: passage.id,
    });
  }, COUNTDOWN_SECONDS * 1000);

  logger.info({
    event: 'rmhtype_countdown_started',
    roomId: room.roomId,
    round: room.currentRound,
  });
}

// ─── DB Persistence ─────────────────────────────────────────

async function persistMatchResults(room: TypeRoom, finalResults: any): Promise<void> {
  try {
    const prisma = getPrismaClient();

    const winnerUserId = finalResults.winnerUserId;
    const players = Array.from(room.players.values());
    const now = new Date();
    const durationMs = room.roundStartTime ? Date.now() - room.roundStartTime : 0;

    // Create the match record
    const match = await (prisma as any).rmhTypeMatch.create({
      data: {
        roomId: room.roomId,
        difficulty: room.settings.difficulty,
        passageId: room.passageId ?? 'unknown',
        passageLength: room.settings.passageLength,
        rounds: room.totalRounds,
        endedAt: now,
        durationMs,
        winnerUserId,
        playerCount: players.length,
        isSolo: false,
        results: finalResults as any,
      },
    });

    // Create match player records and update profiles
    for (const standing of finalResults.standings) {
      const player = room.players.get(standing.userId);
      if (!player) continue;
      // Every round failed the server's check: nothing of this player's reaches a profile or a board.
      if (standing.unranked) continue;

      // Upsert profile (per-difficulty)
      const difficulty = room.settings.difficulty;
      const qualifies = standing.avgAccuracy >= MIN_LEADERBOARD_ACCURACY && standing.avgWpm <= MAX_WPM;
      const profile = await (prisma as any).rmhTypeProfile.upsert({
        where: {
          userId_difficulty: {
            userId: standing.userId,
            difficulty,
          },
        },
        create: {
          userId: standing.userId,
          difficulty,
          totalGamesPlayed: 1,
          totalWins: standing.finalRank === 1 ? 1 : 0,
          bestWpm: qualifies ? standing.avgWpm : 0,
          bestWpmAccuracy: qualifies ? standing.avgAccuracy : 0,
          avgWpm: standing.avgWpm,
          bestAccuracy: standing.avgAccuracy,
          avgAccuracy: standing.avgAccuracy,
          totalCharsTyped: player.currentPosition,
          totalTimeMs: player.finishTime ?? 0,
          currentStreak: standing.finalRank === 1 ? 1 : 0,
          bestStreak: standing.finalRank === 1 ? 1 : 0,
        },
        update: {
          totalGamesPlayed: {
            increment: 1,
          },
          totalWins:
            standing.finalRank === 1
              ? {
                  increment: 1,
                }
              : undefined,
          totalCharsTyped: {
            increment: player.currentPosition,
          },
          totalTimeMs: {
            increment: player.finishTime ?? 0,
          },
          updatedAt: now,
        },
      });

      // Manual best-of and average updates
      const updates: Record<string, any> = {};
      if (qualifies && standing.avgWpm > profile.bestWpm) {
        updates.bestWpm = standing.avgWpm;
        updates.bestWpmAccuracy = standing.avgAccuracy;
      }
      if (standing.avgAccuracy > profile.bestAccuracy) updates.bestAccuracy = standing.avgAccuracy;

      // Running average: new_avg = ((old_avg * (n-1)) + new_value) / n
      const n = profile.totalGamesPlayed;
      updates.avgWpm = (profile.avgWpm * (n - 1) + standing.avgWpm) / n;
      updates.avgAccuracy = (profile.avgAccuracy * (n - 1) + standing.avgAccuracy) / n;

      if (standing.finalRank === 1) {
        const newStreak = profile.currentStreak + 1;
        updates.currentStreak = newStreak;
        if (newStreak > profile.bestStreak) updates.bestStreak = newStreak;
      } else {
        updates.currentStreak = 0;
      }

      if (Object.keys(updates).length > 0) {
        await (prisma as any).rmhTypeProfile.update({
          where: {
            id: profile.id,
          },
          data: updates,
        });
      }

      // Create match player record
      await (prisma as any).rmhTypeMatchPlayer.create({
        data: {
          matchId: match.id,
          profileId: profile.id,
          userId: standing.userId,
          userName: standing.userName,
          rank: standing.finalRank,
          wpm: standing.avgWpm,
          accuracy: standing.avgAccuracy,
          timeMs: player.finishTime ?? 0,
          score: standing.totalScore,
          wasWinner: standing.finalRank === 1,
        },
      });

      // Progression: XP + daily "play a game" quest for finishing a race.
      awardAppProgress(standing.userId, {
        xp: standing.finalRank === 1 ? 20 : 10,
        quest: {
          type: 'game_play',
        },
      });
    }

    logger.info({
      event: 'rmhtype_match_persisted',
      matchId: match.id,
      roomId: room.roomId,
    });
  } catch (err) {
    logger.error({
      event: 'rmhtype_persist_error',
      roomId: room.roomId,
      error: String(err),
    });
  }
}

const MIN_LEADERBOARD_ACCURACY = 90;

/**
 * Whether a solo run posts to the leaderboard: the server's check passed (the end reached, at most {@link MAX_WPM},
 * a believable curve: `evaluateFinish`), and the run was accurate enough. `checked` is that verdict. A run that fails
 * the check is shown but never ranked: no match, no best, no ghost.
 */
function soloQualifies(wpm: number, accuracy: number, checked = true): boolean {
  return checked && accuracy >= MIN_LEADERBOARD_ACCURACY && Number.isFinite(wpm) && wpm <= MAX_WPM;
}

async function persistSoloResult(
  userId: string,
  userName: string,
  passageId: string,
  difficulty: string,
  passageLength: string,
  wpm: number,
  accuracy: number,
  timeMs: number,
  charsTyped: number,
): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    const qualifies = soloQualifies(wpm, accuracy);

    // Create solo match record
    const match = await (prisma as any).rmhTypeMatch.create({
      data: {
        roomId: `solo-${userId}-${Date.now()}`,
        difficulty,
        passageId,
        passageLength,
        rounds: 1,
        endedAt: new Date(),
        durationMs: timeMs,
        winnerUserId: userId,
        playerCount: 1,
        isSolo: true,
        results: {
          wpm,
          accuracy,
          timeMs,
        },
      },
    });

    // Upsert profile (per-difficulty)
    const createData: Record<string, any> = {
      userId,
      difficulty,
      totalGamesPlayed: 1,
      totalWins: 1,
      bestWpm: qualifies ? wpm : 0,
      bestWpmAccuracy: qualifies ? accuracy : 0,
      avgWpm: wpm,
      bestAccuracy: accuracy,
      avgAccuracy: accuracy,
      totalCharsTyped: charsTyped,
      totalTimeMs: timeMs,
      currentStreak: 1,
      bestStreak: 1,
    };

    const profile = await (prisma as any).rmhTypeProfile.upsert({
      where: {
        userId_difficulty: {
          userId,
          difficulty,
        },
      },
      create: createData,
      update: {
        totalGamesPlayed: {
          increment: 1,
        },
        totalCharsTyped: {
          increment: charsTyped,
        },
        totalTimeMs: {
          increment: timeMs,
        },
        updatedAt: new Date(),
      },
    });

    // Manual best-of and average updates
    const updates: Record<string, any> = {};
    if (qualifies && wpm > profile.bestWpm) {
      updates.bestWpm = wpm;
      updates.bestWpmAccuracy = accuracy;
    }
    if (accuracy > profile.bestAccuracy) updates.bestAccuracy = accuracy;

    const n = profile.totalGamesPlayed;
    updates.avgWpm = (profile.avgWpm * (n - 1) + wpm) / n;
    updates.avgAccuracy = (profile.avgAccuracy * (n - 1) + accuracy) / n;

    if (Object.keys(updates).length > 0) {
      await (prisma as any).rmhTypeProfile.update({
        where: {
          id: profile.id,
        },
        data: updates,
      });
    }

    // Create match player record
    await (prisma as any).rmhTypeMatchPlayer.create({
      data: {
        matchId: match.id,
        profileId: profile.id,
        userId,
        userName,
        rank: 1,
        wpm,
        accuracy,
        timeMs,
        score: Math.round(wpm * (accuracy / 100) * 10),
        wasWinner: true,
      },
    });

    // Progression: XP + daily "play a game" quest for finishing a solo run.
    awardAppProgress(userId, {
      xp: 10,
      quest: {
        type: 'game_play',
      },
    });

    logger.info({
      event: 'rmhtype_solo_persisted',
      matchId: match.id,
      userId,
      scorePosted: qualifies,
    });
    return qualifies;
  } catch (err) {
    logger.error({
      event: 'rmhtype_solo_persist_error',
      userId,
      error: String(err),
    });
    return false;
  }
}

// ─── Leaderboard Query ───────────────────────────────────────

async function fetchLeaderboard(prisma: any, difficulty: string, limit: number) {
  // Fetch extra to account for reordering by formula
  const profiles: any[] = await prisma.rmhTypeProfile.findMany({
    where: {
      difficulty,
      bestWpm: {
        gt: 0,
      },
    },
    orderBy: {
      bestWpm: 'desc',
    },
    take: limit * 2,
    select: {
      userId: true,
      bestWpm: true,
      bestWpmAccuracy: true,
      avgWpm: true,
      bestAccuracy: true,
      avgAccuracy: true,
      totalGamesPlayed: true,
      totalWins: true,
      bestStreak: true,
      user: {
        select: {
          name: true,
          image: true,
        },
      },
    },
  });

  // Rank by formula: bestWpm * (bestWpmAccuracy / 100)
  return profiles
    .map((p) => ({
      userId: p.userId,
      userName: p.user.name ?? 'Unknown',
      avatarUrl: p.user.image ?? null,
      bestWpm: p.bestWpm,
      bestWpmAccuracy: p.bestWpmAccuracy,
      leaderboardScore: Math.round(p.bestWpm * (p.bestWpmAccuracy / 100) * 100) / 100,
      avgWpm: p.avgWpm,
      bestAccuracy: p.bestAccuracy,
      avgAccuracy: p.avgAccuracy,
      totalGamesPlayed: p.totalGamesPlayed,
      totalWins: p.totalWins,
      bestStreak: p.bestStreak,
    }))
    .sort((a, b) => b.leaderboardScore - a.leaderboardScore)
    .slice(0, limit)
    .map((p, index) => ({
      ...p,
      rank: index + 1,
    }));
}

// ─── Main Handler Registration ──────────────────────────────

export function registerRmhTypeHandlers(io: Server, socket: Socket): void {
  const userId: string = socket.data.userId;
  const userName: string = socket.data.userName || 'Player';
  const avatarUrl: string | null = socket.data.avatarUrl || null;

  ioRef = io;

  // Track socket <-> user mapping
  userSocketMap.set(userId, socket.id);
  socketUserMap.set(socket.id, userId);

  // ─── Room Management ────────────────────────────────────

  socket.on('rmhtype:room:create', (payload?: { settings?: Partial<RoomSettings> }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:room:create')) {
      socket.emit('rmhtype:error', {
        message: 'Rate limit exceeded',
      });
      return;
    }

    // Generate unique room code
    let roomId: string;
    let attempts = 0;
    do {
      roomId = generateRoomCode();
      attempts++;
    } while (rooms.has(roomId) && attempts < 100);

    if (rooms.has(roomId)) {
      socket.emit('rmhtype:error', {
        message: 'Could not generate room code',
      });
      return;
    }

    // Build settings from payload
    const rawSettings = payload?.settings;
    const settings: RoomSettings = {
      isPublic: typeof rawSettings?.isPublic === 'boolean' ? rawSettings.isPublic : DEFAULT_SETTINGS.isPublic,
      maxPlayers: Math.min(
        MAX_PLAYERS,
        Math.max(2, typeof rawSettings?.maxPlayers === 'number' ? rawSettings.maxPlayers : DEFAULT_SETTINGS.maxPlayers),
      ),
      difficulty:
        rawSettings?.difficulty && ['easy', 'medium', 'hard'].includes(rawSettings.difficulty)
          ? rawSettings.difficulty
          : DEFAULT_SETTINGS.difficulty,
      passageLength:
        rawSettings?.passageLength && ['short', 'medium', 'long'].includes(rawSettings.passageLength)
          ? rawSettings.passageLength
          : DEFAULT_SETTINGS.passageLength,
      rounds: Math.min(
        10,
        Math.max(1, typeof rawSettings?.rounds === 'number' ? rawSettings.rounds : DEFAULT_SETTINGS.rounds),
      ),
      password:
        typeof rawSettings?.password === 'string' && rawSettings.password.length > 0
          ? rawSettings.password.slice(0, 64)
          : null,
    };

    // If password is set, mark as private
    if (settings.password) {
      settings.isPublic = false;
    }

    const player = createPlayer(socket.id, userId, userName, avatarUrl, true);

    const room: TypeRoom = {
      roomId,
      hostUserId: userId,
      state: 'WAITING',
      settings,
      players: new Map([[userId, player]]),
      bannedUsers: [],
      currentRound: 0,
      totalRounds: settings.rounds,
      passage: null,
      passageId: null,
      roundStartTime: null,
      finishOrder: 0,
      chat: [],
      seq: 0,
      countdownTimer: null,
      progressBroadcastTimer: null,
      nextRoundTimer: null,
      roundResults: [],
    };

    rooms.set(roomId, room);
    socket.join(`rmhtype:${roomId}`);
    socketRoomMap.set(socket.id, roomId);

    socket.emit('rmhtype:room:created', {
      roomId,
    });
    socket.emit('rmhtype:room:state', buildStateSnapshot(room, userId));

    logger.info({
      event: 'rmhtype_room_created',
      roomId,
      userId,
    });
  });

  socket.on('rmhtype:room:join', (payload?: { roomId?: string; roomCode?: string; password?: string }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:room:join')) {
      socket.emit('rmhtype:error', {
        message: 'Rate limit exceeded',
      });
      return;
    }

    const roomId = sanitizeString(payload?.roomCode ?? payload?.roomId, 16);
    if (!roomId) {
      socket.emit('rmhtype:error', {
        message: 'Room ID required',
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('rmhtype:error', {
        message: 'Room not found',
      });
      return;
    }

    // Ban check
    if (room.bannedUsers.some((b) => b.userId === userId)) {
      socket.emit('rmhtype:error', {
        code: 'BANNED',
        message: 'You are banned from this room',
      });
      return;
    }

    // Password check
    if (room.settings.password) {
      const provided = typeof payload?.password === 'string' ? payload.password : '';
      if (provided !== room.settings.password) {
        socket.emit('rmhtype:error', {
          message: 'Incorrect password',
        });
        return;
      }
    }

    // Check if player is reconnecting
    const existingPlayer = room.players.get(userId);
    if (existingPlayer) {
      // Reconnect
      existingPlayer.socketId = socket.id;
      existingPlayer.isConnected = true;
      existingPlayer.userName = userName;
      existingPlayer.avatarUrl = avatarUrl;

      userSocketMap.set(userId, socket.id);
      socketRoomMap.set(socket.id, roomId);
      socket.join(`rmhtype:${roomId}`);

      // They made it back inside the window — cancel the kick and tell the
      // room to stop waiting.
      presence.release(roomId, userId);
      broadcastRoomState(io, room);
      socket.emit(S2C.PEERS_WAITING, presence.getWaiting(roomId));

      logger.info({
        event: 'rmhtype_player_reconnected',
        roomId,
        userId,
      });
      return;
    }

    // Check capacity
    if (room.players.size >= room.settings.maxPlayers) {
      socket.emit('rmhtype:error', {
        message: 'Room is full',
      });
      return;
    }

    // Only allow joining during WAITING or ROUND_RESULTS
    if (room.state !== 'WAITING' && room.state !== 'ROUND_RESULTS') {
      socket.emit('rmhtype:error', {
        message: 'Game is in progress',
      });
      return;
    }

    // Leave current room if in one
    const currentRoomId = socketRoomMap.get(socket.id);
    if (currentRoomId && currentRoomId !== roomId) {
      handlePlayerLeave(io, socket, userId, currentRoomId);
    }

    const player = createPlayer(socket.id, userId, userName, avatarUrl, false);
    room.players.set(userId, player);

    socket.join(`rmhtype:${roomId}`);
    socketRoomMap.set(socket.id, roomId);

    broadcastRoomState(io, room);

    logger.info({
      event: 'rmhtype_player_joined',
      roomId,
      userId,
    });
  });

  socket.on('rmhtype:room:leave', () => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    handlePlayerLeave(io, socket, userId, roomId);
  });

  // ─── Ready Toggle ─────────────────────────────────────────
  socket.on('rmhtype:room:ready', () => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'WAITING') return;

    const player = room.players.get(userId);
    if (!player || player.isHost) return; // host is always ready

    player.isReady = !player.isReady;
    broadcastRoomState(io, room);
  });

  socket.on('rmhtype:room:kick', (payload?: { targetUserId?: string }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) return;

    const targetUserId = typeof payload?.targetUserId === 'string' ? payload.targetUserId : '';
    if (!targetUserId || targetUserId === userId) return;

    const targetPlayer = room.players.get(targetUserId);
    if (!targetPlayer) return;

    // Notify the kicked player
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('rmhtype:room:kicked', {
          roomId,
        });
        targetSocket.leave(`rmhtype:${roomId}`);
        socketRoomMap.delete(targetSocketId);
      }
    }

    room.players.delete(targetUserId);
    broadcastRoomState(io, room);

    logger.info({
      event: 'rmhtype_player_kicked',
      roomId,
      targetUserId,
      hostUserId: userId,
    });
  });

  socket.on('rmhtype:room:ban', (payload?: { targetUserId?: string; reason?: string }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) return;

    const targetUserId = typeof payload?.targetUserId === 'string' ? payload.targetUserId : '';
    if (!targetUserId || targetUserId === userId) return;

    const targetPlayer = room.players.get(targetUserId);
    if (!targetPlayer) return;

    // Already banned?
    if (room.bannedUsers.some((b) => b.userId === targetUserId)) return;

    // Add to ban list
    room.bannedUsers.push({
      userId: targetUserId,
      userName: targetPlayer.userName,
      bannedAt: Date.now(),
      bannedBy: userId,
      reason: typeof payload?.reason === 'string' && payload.reason.trim() ? payload.reason.trim().slice(0, 200) : null,
    });

    // Kick the player
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('rmhtype:room:kicked', {
          roomId,
          reason: 'banned',
        });
        targetSocket.leave(`rmhtype:${roomId}`);
        socketRoomMap.delete(targetSocketId);
      }
    }

    room.players.delete(targetUserId);
    broadcastRoomState(io, room);

    logger.info({
      event: 'rmhtype_player_banned',
      roomId,
      targetUserId,
      hostUserId: userId,
    });
  });

  socket.on('rmhtype:room:unban', (payload?: { targetUserId?: string }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) return;

    const targetUserId = typeof payload?.targetUserId === 'string' ? payload.targetUserId : '';
    if (!targetUserId) return;

    const index = room.bannedUsers.findIndex((b) => b.userId === targetUserId);
    if (index === -1) return;

    room.bannedUsers.splice(index, 1);
    broadcastRoomState(io, room);

    logger.info({
      event: 'rmhtype_player_unbanned',
      roomId,
      targetUserId,
      hostUserId: userId,
    });
  });

  socket.on('rmhtype:room:transfer_host', (payload?: { targetUserId?: string }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) return;

    const targetUserId = typeof payload?.targetUserId === 'string' ? payload.targetUserId : '';
    if (!targetUserId || targetUserId === userId) return;

    const targetPlayer = room.players.get(targetUserId);
    if (!targetPlayer || !targetPlayer.isConnected) return;

    const currentHost = room.players.get(userId);
    if (currentHost) currentHost.isHost = false;

    targetPlayer.isHost = true;
    targetPlayer.isReady = true;
    room.hostUserId = targetUserId;

    broadcastRoomState(io, room);

    logger.info({
      event: 'rmhtype_host_transferred',
      roomId,
      from: userId,
      to: targetUserId,
    });
  });

  socket.on('rmhtype:room:update_settings', (payload?: { settings?: Partial<RoomSettings> }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId || room.state !== 'WAITING') return;

    const rawSettings = payload?.settings;
    if (!rawSettings || typeof rawSettings !== 'object') return;

    if (typeof rawSettings.isPublic === 'boolean') room.settings.isPublic = rawSettings.isPublic;
    if (typeof rawSettings.maxPlayers === 'number') {
      room.settings.maxPlayers = Math.min(MAX_PLAYERS, Math.max(2, rawSettings.maxPlayers));
    }
    if (rawSettings.difficulty && ['easy', 'medium', 'hard'].includes(rawSettings.difficulty)) {
      room.settings.difficulty = rawSettings.difficulty;
    }
    if (rawSettings.passageLength && ['short', 'medium', 'long'].includes(rawSettings.passageLength)) {
      room.settings.passageLength = rawSettings.passageLength;
    }
    if (typeof rawSettings.rounds === 'number') {
      room.settings.rounds = Math.min(10, Math.max(1, rawSettings.rounds));
      room.totalRounds = room.settings.rounds;
    }
    if (rawSettings.password !== undefined) {
      room.settings.password =
        typeof rawSettings.password === 'string' && rawSettings.password.length > 0
          ? rawSettings.password.slice(0, 64)
          : null;
      if (room.settings.password) room.settings.isPublic = false;
    }

    broadcastRoomState(io, room);

    logger.debug({
      event: 'rmhtype_settings_updated',
      roomId,
    });
  });

  socket.on('rmhtype:room:browse', () => {
    const publicRooms = Array.from(rooms.values())
      .filter((r) => r.settings.isPublic && r.state === 'WAITING' && r.players.size < r.settings.maxPlayers)
      .map((r) => ({
        roomId: r.roomId,
        hostUserName: r.players.get(r.hostUserId)?.userName ?? 'Unknown',
        playerCount: r.players.size,
        maxPlayers: r.settings.maxPlayers,
        difficulty: r.settings.difficulty,
        passageLength: r.settings.passageLength,
        rounds: r.settings.rounds,
      }));

    socket.emit('rmhtype:room:list', {
      rooms: publicRooms,
    });
  });

  socket.on('rmhtype:room:chat', (payload?: { content?: string; message?: string }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:room:chat')) return;

    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || !room.players.has(userId)) return;

    const content = sanitizeString(payload?.message ?? payload?.content, 300);
    if (!content) return;

    const chatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      userName,
      content,
      createdAt: Date.now(),
    };

    room.chat.push(chatMessage);
    if (room.chat.length > 200) {
      room.chat = room.chat.slice(-200);
    }

    // Broadcast to all room members in client format
    io.to(`rmhtype:${roomId}`).emit('rmhtype:room:chat', {
      id: chatMessage.id,
      userId,
      userName,
      message: content,
      timestamp: chatMessage.createdAt,
      reactions: {},
    });
  });

  // ─── Game Flow ──────────────────────────────────────────

  socket.on('rmhtype:game:start', () => {
    if (!checkRateLimit(socket.id, 'rmhtype:game:start')) {
      socket.emit('rmhtype:error', {
        message: 'Rate limit exceeded',
      });
      return;
    }

    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) {
      socket.emit('rmhtype:error', {
        message: 'Only the host can start the game',
      });
      return;
    }

    if (room.state !== 'WAITING' && room.state !== 'ROUND_RESULTS') {
      socket.emit('rmhtype:error', {
        message: 'Cannot start game in current state',
      });
      return;
    }

    const connectedCount = getConnectedPlayerCount(room);
    if (connectedCount < 1) {
      socket.emit('rmhtype:error', {
        message: 'Not enough players',
      });
      return;
    }

    // If starting fresh from WAITING, reset round tracking
    if (room.state === 'WAITING') {
      room.currentRound = 0;
      room.totalRounds = room.settings.rounds;
      room.roundResults = [];
      // Reset all player scores for fresh game
      for (const player of room.players.values()) {
        player.score = 0;
      }
    }

    startRound(io, room);
  });

  socket.on('rmhtype:game:progress', (payload?: { position?: number; errors?: number }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:game:progress')) return;

    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'TYPING' || !room.roundStartTime) return;

    const player = room.players.get(userId);
    if (!player || player.finished) return;

    // Live progress feeds the timeout result and the race standings, so it is made safe first: within the passage
    // (`clampRunCounts`), never backwards, and no faster per step than a person can type (`clampProgress`).
    const now = Date.now();
    const passageLength = room.passage?.length ?? 0;
    const counts = clampRunCounts(payload?.position, payload?.errors, passageLength);
    const position = clampProgress(
      player.currentPosition,
      counts.position,
      passageLength,
      now - (player.lastProgressAt || room.roundStartTime),
    );
    const errors = Math.min(counts.errors, position);
    player.lastProgressAt = now;

    player.currentPosition = position;
    player.errors = errors;

    // Calculate WPM: (characters / 5) / (elapsed minutes)
    const elapsedMs = now - room.roundStartTime;
    if (elapsedMs > 0 && position > 0) {
      player.wpm = position / 5 / (elapsedMs / 60000);
      player.accuracy = ((position - errors) / position) * 100;
      if (player.accuracy < 0) player.accuracy = 0;
    }
  });

  socket.on('rmhtype:game:finish', (payload?: RunFinishPayload) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'TYPING' || !room.roundStartTime) return;

    const player = room.players.get(userId);
    if (!player || player.finished) return;

    player.finished = true;
    player.finishTime = Date.now() - room.roundStartTime;

    // The finish is scored from the server's clock and the passage, as a solo run is: the position the client sends
    // (or, with none, the last progress) is clamped, and the run must reach the end at no more than MAX_WPM along a
    // believable curve. One that does not is "Did not finish" for the round and not ranked; nobody else's result moves.
    const figures = evaluateFinish({
      passageLength: room.passage?.length ?? 0,
      position: typeof payload?.position === 'number' ? payload.position : player.currentPosition,
      errors: typeof payload?.errors === 'number' ? payload.errors : player.errors,
      timeMs: player.finishTime,
      samples: payload?.samples,
    });
    player.currentPosition = figures.position;
    player.errors = figures.errors;
    if (figures.reason) {
      player.dnfReason = figures.reason;
      player.wpm = 0;
      player.accuracy = 0;
    } else {
      room.finishOrder++;
      player.finishRank = room.finishOrder;
      player.wpm = figures.wpm;
      player.accuracy = Math.max(0, figures.accuracy);
    }

    io.to(`rmhtype:${roomId}`).emit('rmhtype:game:playerFinished', {
      userId: player.userId,
      userName: player.userName,
      wpm: Math.round(player.wpm * 100) / 100,
      accuracy: Math.round(player.accuracy * 100) / 100,
      timeMs: player.finishTime,
      rank: player.finishRank,
      ...(figures.reason ? { didNotFinish: true, reason: figures.reason } : {}),
    });

    // Check if all connected players finished
    checkAllPlayersFinished(io, room);
  });

  // ─── Solo Mode ──────────────────────────────────────────

  socket.on(
    'rmhtype:solo:start',
    async (payload?: {
      difficulty?: string;
      passageLength?: string;
      topic?: string;
      source?: string;
      challengeId?: string;
    }) => {
      if (!checkRateLimit(socket.id, 'rmhtype:solo:start')) {
        socket.emit('rmhtype:error', {
          message: 'Rate limit exceeded',
        });
        return;
      }

      // Starting anything else abandons a challenge race this socket is still in: one attempt.
      const previousRoomId = socketRoomMap.get(socket.id);
      if (previousRoomId?.startsWith('solo-') && rooms.get(previousRoomId)?.challenge) {
        socket.leave(`rmhtype:${previousRoomId}`);
        socketRoomMap.delete(socket.id);
        removeRoom(previousRoomId);
      }

      // A challenge race (s11-12): the passage and the ghost come from the challenge, never from the client. The
      // claim is the one compare-and-set `pending` -> `racing`, so a second start (another tab, a reload) is refused.
      let race: Awaited<ReturnType<typeof claimChallengeRace>> | null = null;
      if (payload?.challengeId !== undefined) {
        const challengeId = typeof payload.challengeId === 'string' ? payload.challengeId.slice(0, 40) : '';
        try {
          race = await claimChallengeRace(getPrismaClient() as unknown as ChallengeDb, userId, challengeId);
        } catch (err) {
          logger.error({ event: 'rmhtype_challenge_claim_error', userId, error: String(err) });
          socket.emit('rmhtype:error', { message: 'Could not start the challenge' });
          return;
        }
        if (!race.ok) {
          socket.emit('rmhtype:error', { message: race.error, code: race.code });
          return;
        }
        if (!socket.connected) {
          // Gone while the claim ran: the race was claimed, so it is the one attempt, left.
          settleAndNotify(getPrismaClient() as unknown as ChallengeDb, race.race.id, null).catch(() => undefined);
          return;
        }
      }
      const claimed = race && race.ok ? race.race : null;
      const challengeText = claimed ? challengePassage(claimed.passageId) : null;

      const difficulty =
        payload?.difficulty && ['easy', 'medium', 'hard'].includes(payload.difficulty)
          ? (payload.difficulty as 'easy' | 'medium' | 'hard')
          : 'medium';

      const passageLength =
        payload?.passageLength && ['short', 'medium', 'long'].includes(payload.passageLength)
          ? (payload.passageLength as 'short' | 'medium' | 'long')
          : 'medium';

      const soloSettings: RoomSettings = {
        ...DEFAULT_SETTINGS,
        difficulty,
        passageLength,
        rounds: 1,
      };

      // A topic asks for a passage written to order. The text is produced HERE,
      // never accepted from the client: the passage is what scoring is measured
      // against, so a client-supplied one would be a client-supplied WPM.
      const source = claimed ? 'standard' : parseSoloSource(payload?.source);
      const topic =
        !claimed && source === 'standard' && typeof payload?.topic === 'string'
          ? sanitizeString(payload.topic, 80)
          : '';
      let passage = selectPassage(soloSettings);
      let aiPassage = false;
      if (claimed && challengeText) {
        passage = {
          id: challengeText.id,
          text: challengeText.text,
          difficulty: challengeText.difficulty,
          wordCount: challengeText.text.split(/\s+/).length,
        };
        soloSettings.difficulty = challengeText.difficulty;
        // A code snippet is practice on the boards, as on any solo run.
        aiPassage = challengeText.code;
      }

      // Code and lore passages are practice-only, like a written-to-order one.
      if (source === 'code') {
        const snip = pickCodeSnippet();
        passage = {
          id: `code-${snip.id}`,
          text: snip.text,
          difficulty,
          wordCount: snip.text.split(/\s+/).length,
        };
        aiPassage = true;
      } else if (source === 'lore') {
        try {
          const rows = await getPrismaClient().newsArticle.findMany({
            where: {
              status: 'PUBLISHED',
            },
            orderBy: {
              date: 'desc',
            },
            take: 40,
            select: {
              id: true,
            },
          });
          const pick = rows[Math.floor(Math.random() * rows.length)];
          const row = pick
            ? await getPrismaClient().newsArticle.findUnique({
                where: {
                  id: pick.id,
                },
                select: {
                  content: true,
                },
              })
            : null;
          const text = row ? extractLorePassage(row.content, passageLength) : null;
          if (text) {
            passage = {
              id: `lore-${pick!.id}`,
              text,
              difficulty,
              wordCount: text.split(' ').length,
            };
            aiPassage = true;
          }
        } catch (err) {
          logger.warn({
            event: 'rmhtype_lore_passage_error',
            userId,
            error: String(err),
          });
        }
        if (!aiPassage) socket.emit('rmhtype:solo:aiUnavailable', {});
        if (!socket.connected) return;
      }

      if (topic) {
        if (!checkRateLimit(socket.id, 'rmhtype:solo:ai')) {
          socket.emit('rmhtype:error', {
            message: 'Too many AI passages — try again in a minute',
          });
          return;
        }
        socket.emit('rmhtype:solo:generating', {
          topic,
        });
        try {
          const text = await generateTypingPassage({
            topic,
            difficulty,
            length: passageLength,
          });
          if (text) {
            passage = {
              id: `ai-${Date.now().toString(36)}`,
              text,
              difficulty,
              wordCount: text.split(' ').length,
            };
            aiPassage = true;
          }
        } catch (err) {
          // Fall through on the curated passage — the player pressed start and is
          // owed a run, not an error screen.
          logger.warn({
            event: 'rmhtype_ai_passage_error',
            userId,
            error: String(err),
          });
        }
        if (!aiPassage) {
          socket.emit('rmhtype:solo:aiUnavailable', {});
        }
        // The socket can disconnect during a multi-second generation.
        if (!socket.connected) return;
      }

      const soloRoomId = `solo-${userId}-${Date.now()}`;

      const player = createPlayer(socket.id, userId, userName, avatarUrl, true);

      const soloRoom: TypeRoom = {
        roomId: soloRoomId,
        hostUserId: userId,
        state: 'COUNTDOWN',
        settings: soloSettings,
        players: new Map([[userId, player]]),
        currentRound: 1,
        totalRounds: 1,
        passage: passage.text,
        passageId: passage.id,
        roundStartTime: null,
        finishOrder: 0,
        chat: [],
        seq: 0,
        countdownTimer: null,
        progressBroadcastTimer: null,
        nextRoundTimer: null,
        roundResults: [],
        bannedUsers: [],
        aiPassage,
        challenge: claimed ? { id: claimed.id, done: false } : undefined,
      };

      rooms.set(soloRoomId, soloRoom);
      socket.join(`rmhtype:${soloRoomId}`);
      socketRoomMap.set(socket.id, soloRoomId);

      // Emit countdown ticks each second
      let soloRemaining = COUNTDOWN_SECONDS;
      socket.emit('rmhtype:solo:countdown', {
        seconds: soloRemaining,
      });
      const soloCountdownInterval = setInterval(() => {
        soloRemaining--;
        if (soloRemaining > 0 && soloRoom.state === 'COUNTDOWN') {
          socket.emit('rmhtype:solo:countdown', {
            seconds: soloRemaining,
          });
        } else {
          clearInterval(soloCountdownInterval);
        }
      }, 1000);

      soloRoom.countdownTimer = setTimeout(() => {
        soloRoom.countdownTimer = null;
        clearInterval(soloCountdownInterval);

        if (soloRoom.state !== 'COUNTDOWN') return;

        soloRoom.state = 'TYPING';
        soloRoom.roundStartTime = Date.now();

        socket.emit('rmhtype:solo:started', {
          passage: passage.text,
          passageId: passage.id,
          // The challenger's snapshot is the ghost, drawn as their caret.
          ...(claimed
            ? {
                challenge: {
                  id: claimed.id,
                  challengerName: claimed.challengerName,
                  ghost: {
                    passageId: passage.id,
                    wpm: claimed.snapshot.wpm,
                    timeMs: claimed.snapshot.timeMs,
                    samples: claimed.snapshot.samples,
                  },
                },
              }
            : {}),
        });

        // Solo round timeout
        clearRoundTimeout(soloRoom);
        soloRoom.roundTimeoutTimer = setTimeout(() => {
          soloRoom.roundTimeoutTimer = null;
          if (rooms.get(soloRoomId) !== soloRoom) return;
          if (soloRoom.state === 'TYPING') {
            const soloPlayer = soloRoom.players.get(userId);
            if (soloPlayer && !soloPlayer.finished) {
              soloPlayer.finished = true;
              soloPlayer.finishTime = ROUND_TIMEOUT_MS;
              socket.emit('rmhtype:solo:result', {
                wpm: Math.round(soloPlayer.wpm * 100) / 100,
                accuracy: Math.round(soloPlayer.accuracy * 100) / 100,
                timeMs: ROUND_TIMEOUT_MS,
                timedOut: true,
                // A run that timed out never ranks: it did not reach the end of the passage.
                ranked: false,
                scorePosted: false,
                practice: aiPassage,
              });
              cleanupSoloRoom(soloRoomId, socket);
            }
          }
        }, ROUND_TIMEOUT_MS);

        logger.info({
          event: 'rmhtype_solo_started',
          userId,
          passageId: passage.id,
          aiPassage,
        });
      }, COUNTDOWN_SECONDS * 1000);
    },
  );

  socket.on('rmhtype:solo:finish', (payload?: RunFinishPayload) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId || !roomId.startsWith('solo-')) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'TYPING' || !room.roundStartTime) return;

    const player = room.players.get(userId);
    if (!player || player.finished) return;

    player.finished = true;
    player.finishTime = Date.now() - room.roundStartTime;

    // One check for every scored run (`run-check.ts`): the figures come from the server's clock and a position
    // clamped to the passage, never from the client's say-so. A run that did not reach the end, computes above
    // MAX_WPM or has no believable curve is still shown (from the clamped figures) but is not ranked.
    const figures = evaluateFinish({
      passageLength: room.passage?.length ?? 0,
      position: typeof payload?.position === 'number' ? payload.position : player.currentPosition,
      errors: typeof payload?.errors === 'number' ? payload.errors : player.errors,
      timeMs: player.finishTime,
      samples: payload?.samples,
    });
    const { position, errors } = figures;
    player.currentPosition = position;
    player.errors = errors;

    // Calculate final WPM and accuracy
    if (player.finishTime > 0 && position > 0) {
      player.wpm = figures.wpm;
      player.accuracy = Math.max(0, figures.accuracy);
    } else {
      player.wpm = 0;
      player.accuracy = 100;
    }

    const ranked = !room.aiPassage && soloQualifies(player.wpm, player.accuracy, figures.finished);
    const result: Record<string, any> = {
      wpm: Math.round(player.wpm * 100) / 100,
      accuracy: Math.round(player.accuracy * 100) / 100,
      timeMs: player.finishTime,
      timedOut: false,
      ranked,
      // Kept for older clients: always equal to `ranked`.
      scorePosted: ranked,
      practice: Boolean(room.aiPassage),
      // Why a checked run was not ranked. A practice run has its own note and needs none.
      ...(figures.reason && !room.aiPassage ? { reason: figures.reason } : {}),
    };

    socket.emit('rmhtype:solo:result', result);

    // Persist solo result to DB — except on a generated passage, which is practice by design (see
    // `TypeRoom.aiPassage`), and a run that failed the server's check, which writes nothing (no match, no profile
    // figures, no experience).
    if (!room.aiPassage && figures.finished) {
      persistSoloResult(
        userId,
        userName,
        room.passageId ?? 'unknown',
        room.settings.difficulty,
        room.settings.passageLength,
        player.wpm,
        player.accuracy,
        player.finishTime,
        position,
      ).catch((err) => {
        logger.error({
          event: 'rmhtype_solo_persist_error',
          userId,
          error: String(err),
        });
      });
    }

    // A challenge race settles once, from the server's own checked figures (clamped position, the server's clock,
    // MAX_WPM, a plausible curve); anything that fails a check is "Did not finish". The run above is scored as any
    // solo run is. `done` first, so the room's removal below does not also settle it as left.
    if (room.challenge && !room.challenge.done) {
      room.challenge.done = true;
      settleAndNotify(getPrismaClient() as unknown as ChallengeDb, room.challenge.id, figures, userId)
        .then((settled) => {
          if (settled) socket.emit(S2C.SOLO_CHALLENGE_RESULT, challengeResultPayload(settled));
        })
        .catch((err) => {
          logger.error({ event: 'rmhtype_challenge_settle_error', userId, error: String(err) });
        });
    }

    // Keep the run's progress curve as the member's ghost on a new passage best.
    // Only this socket's own run reaches here; an implausible or missing curve is
    // dropped without touching the score (see lib/rmhtype/ghost.server.ts).
    saveGhostIfBest(getPrismaClient() as unknown as GhostDb, {
      userId,
      passageId: room.passageId,
      // A run that failed the check keeps no ghost.
      aiPassage: Boolean(room.aiPassage) || !figures.finished,
      passageLength: room.passage?.length ?? 0,
      wpm: player.wpm,
      accuracy: player.accuracy,
      timeMs: player.finishTime,
      samples: payload?.samples,
    }).catch((err) => {
      logger.error({
        event: 'rmhtype_ghost_save_error',
        userId,
        error: String(err),
      });
    });

    cleanupSoloRoom(roomId, socket);
  });

  // ─── Leaderboard ────────────────────────────────────────

  socket.on('rmhtype:leaderboard:fetch', async (payload?: { limit?: number; difficulty?: string }) => {
    try {
      const prisma = getPrismaClient();
      const limit = Math.min(100, Math.max(1, typeof payload?.limit === 'number' ? payload.limit : 50));
      const difficulty = ['easy', 'medium', 'hard'].includes(payload?.difficulty ?? '')
        ? payload!.difficulty!
        : 'medium';

      const leaderboard = await fetchLeaderboard(prisma, difficulty, limit);
      socket.emit('rmhtype:leaderboard:data', {
        leaderboard,
        difficulty,
      });
    } catch (err) {
      logger.error({
        event: 'rmhtype_leaderboard_fetch_error',
        error: String(err),
      });
      socket.emit('rmhtype:error', {
        message: 'Failed to fetch leaderboard',
      });
    }
  });
}

/** What the opponent's client is told when their race is settled. */
function challengeResultPayload(s: Settlement) {
  return {
    id: s.id,
    outcome: s.outcome,
    finished: s.finished,
    challengerWpm: s.challengerWpm,
    opponentWpm: s.opponentWpm,
  };
}

// ─── Helper: Leave Room ─────────────────────────────────────

function handlePlayerLeave(io: Server, socket: Socket, userId: string, roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    socketRoomMap.delete(socket.id);
    return;
  }

  const player = room.players.get(userId);
  if (!player) {
    socketRoomMap.delete(socket.id);
    return;
  }

  room.players.delete(userId);
  socket.leave(`rmhtype:${roomId}`);
  socketRoomMap.delete(socket.id);
  // Leaving on purpose ends any grace window they were in — otherwise the room
  // keeps saying it is waiting for someone who already said goodbye.
  presence.release(roomId, userId);

  if (room.players.size === 0) {
    removeRoom(roomId);
    return;
  }

  // Host migration
  if (room.hostUserId === userId) {
    migrateHost(io, room);
  }

  broadcastRoomState(io, room);

  // If in typing phase and all remaining connected players are finished, end round
  if (room.state === 'TYPING') {
    checkAllPlayersFinished(io, room);
  }

  logger.info({
    event: 'rmhtype_player_left',
    roomId,
    userId,
  });
}

// ─── Helper: Cleanup Solo Room ──────────────────────────────

function cleanupSoloRoom(roomId: string, socket: Socket): void {
  socket.leave(`rmhtype:${roomId}`);
  socketRoomMap.delete(socket.id);
  removeRoom(roomId);
}

// ─── Disconnect Handler ─────────────────────────────────────

export function handleRmhTypeDisconnect(io: Server, socket: Socket): void {
  const userId = socketUserMap.get(socket.id);
  const roomId = socketRoomMap.get(socket.id);

  // Clean up socket maps
  socketUserMap.delete(socket.id);
  socketRoomMap.delete(socket.id);
  if (userId) {
    // Only remove from userSocketMap if this socket is the current one
    if (userSocketMap.get(userId) === socket.id) {
      userSocketMap.delete(userId);
    }
  }

  if (!roomId || !userId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.players.get(userId);
  if (!player) return;

  // Solo rooms: just clean up immediately
  if (roomId.startsWith('solo-')) {
    removeRoom(roomId);
    return;
  }

  // Mark player as disconnected
  player.isConnected = false;

  broadcastRoomState(io, room);

  // Check if all players are disconnected
  const allDisconnected = Array.from(room.players.values()).every((p) => !p.isConnected);

  if (allDisconnected) {
    // Nobody left to wait *for*, so the grace window has no audience — hold the
    // room open a while longer in case the whole table is on the same flaky
    // wifi, then drop it.
    presence.clearRoom(roomId);
    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;
      const stillAllDisconnected = Array.from(currentRoom.players.values()).every((p) => !p.isConnected);
      if (stillAllDisconnected) {
        removeRoom(roomId);
        logger.info({
          event: 'rmhtype_room_abandoned',
          roomId,
        });
      }
    }, ROOM_CLEANUP_DELAY_MS);
    return;
  }

  // Host migration if host disconnected
  if (room.hostUserId === userId) {
    migrateHost(io, room);
  }

  // Start the shared grace window. A typing race is a per-player time trial,
  // so the room is not frozen for everyone else — but it does announce who it
  // is waiting on, and after 15s it stops waiting so the round can resolve
  // instead of running to the five-minute timeout because one player left
  // mid-passage.
  presence.hold(roomId, userId, player.userName);

  if (room.state === 'TYPING') {
    // Their absence may already have decided the round.
    checkAllPlayersFinished(io, room);
  }

  logger.info({
    event: 'rmhtype_player_disconnected',
    roomId,
    userId,
  });
}
