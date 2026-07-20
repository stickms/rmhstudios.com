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
  chat: Array<{ id: string; userId: string; userName: string; content: string; createdAt: number }>;
  seq: number;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  progressBroadcastTimer: ReturnType<typeof setInterval> | null;
  nextRoundTimer: ReturnType<typeof setTimeout> | null;
  roundResults: Array<{ rankings: any[] }>;
}

interface Passage {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  wordCount: number;
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
const DISCONNECT_REMOVE_DELAY_MS = 30_000;
const ROOM_CLEANUP_DELAY_MS = 60_000;

const DEFAULT_SETTINGS: RoomSettings = {
  isPublic: false,
  maxPlayers: 8,
  difficulty: 'medium',
  passageLength: 'medium',
  rounds: 3,
  password: null,
};

// ─── Passages ───────────────────────────────────────────────

const PASSAGES: Passage[] = [
  // Easy passages
  {
    id: 'easy-01',
    text: 'The quick brown fox jumps over the lazy dog near the river bank on a warm summer day.',
    difficulty: 'easy',
    wordCount: 17,
  },
  {
    id: 'easy-02',
    text: 'She sells seashells by the seashore while the sun sets behind the old lighthouse.',
    difficulty: 'easy',
    wordCount: 14,
  },
  {
    id: 'easy-03',
    text: 'A gentle breeze swept through the garden carrying the sweet scent of fresh flowers.',
    difficulty: 'easy',
    wordCount: 14,
  },
  {
    id: 'easy-04',
    text: 'The old man sat on the wooden bench watching the children play in the park.',
    difficulty: 'easy',
    wordCount: 14,
  },
  {
    id: 'easy-05',
    text: 'Rain began to fall softly on the quiet street as the evening lights turned on.',
    difficulty: 'easy',
    wordCount: 15,
  },
  {
    id: 'easy-06',
    text: 'The little cat jumped from the table to the chair and then onto the warm rug.',
    difficulty: 'easy',
    wordCount: 16,
  },
  {
    id: 'easy-07',
    text: 'Every morning the baker would open his shop before the rest of the town woke up.',
    difficulty: 'easy',
    wordCount: 16,
  },
  {
    id: 'easy-08',
    text: 'The train moved slowly through the countryside past green fields and small villages.',
    difficulty: 'easy',
    wordCount: 13,
  },
  {
    id: 'easy-09',
    text: 'Birds sang their morning songs high up in the tall oak tree beside the house.',
    difficulty: 'easy',
    wordCount: 15,
  },
  {
    id: 'easy-10',
    text: 'The dog ran across the yard chasing a bright red ball thrown by the young girl.',
    difficulty: 'easy',
    wordCount: 16,
  },

  // Medium passages
  {
    id: 'med-01',
    text: 'Technology continues to reshape how we communicate and interact with the world around us. From smartphones to artificial intelligence, each innovation brings both opportunities and challenges that society must carefully navigate.',
    difficulty: 'medium',
    wordCount: 33,
  },
  {
    id: 'med-02',
    text: 'The ancient library held thousands of manuscripts dating back centuries. Scholars from distant lands would travel for weeks just to spend a few precious hours studying the fragile pages within its stone walls.',
    difficulty: 'medium',
    wordCount: 34,
  },
  {
    id: 'med-03',
    text: 'Programming requires a unique combination of logical thinking and creative problem solving. The best developers understand that elegant code is not just functional but readable and maintainable by others who come after them.',
    difficulty: 'medium',
    wordCount: 34,
  },
  {
    id: 'med-04',
    text: 'The ocean stretched endlessly before the small fishing boat. Captain Torres checked his compass and adjusted the sails, knowing that the weather could change without warning this far from shore.',
    difficulty: 'medium',
    wordCount: 31,
  },
  {
    id: 'med-05',
    text: 'In the heart of the bustling city, a small garden provided a peaceful refuge. Office workers would escape there during lunch breaks, finding solace among the carefully tended roses and quiet fountains.',
    difficulty: 'medium',
    wordCount: 33,
  },
  {
    id: 'med-06',
    text: 'Music has the remarkable ability to evoke powerful emotions and transport us to different times and places. A single melody can bring back vivid memories that we thought were long forgotten.',
    difficulty: 'medium',
    wordCount: 32,
  },
  {
    id: 'med-07',
    text: 'The scientific method requires careful observation, hypothesis formation, and rigorous testing. Each experiment builds upon the work of those who came before, gradually expanding our understanding of the natural world.',
    difficulty: 'medium',
    wordCount: 31,
  },
  {
    id: 'med-08',
    text: 'Cooking is both an art and a science. The precise measurements matter just as much as the creative intuition that guides a chef to combine unexpected flavors into something truly extraordinary.',
    difficulty: 'medium',
    wordCount: 31,
  },
  {
    id: 'med-09',
    text: 'The mountain trail wound through dense forest before emerging above the tree line. From there the hikers could see the entire valley spread out below them bathed in golden afternoon sunlight.',
    difficulty: 'medium',
    wordCount: 32,
  },
  {
    id: 'med-10',
    text: 'Writing well demands practice and patience. Every great author has spent countless hours revising their work, searching for the perfect word or phrase that captures exactly what they want to express.',
    difficulty: 'medium',
    wordCount: 32,
  },

  // Hard passages
  {
    id: 'hard-01',
    text: "The epistemological foundations of modern quantum mechanics challenge our classical intuitions about determinism and causality. Heisenberg's uncertainty principle demonstrates that the very act of measurement fundamentally alters the system being observed, rendering complete knowledge theoretically impossible.",
    difficulty: 'hard',
    wordCount: 38,
  },
  {
    id: 'hard-02',
    text: 'Throughout the annals of jurisprudence, the tension between individual liberty and collective security has produced some of the most consequential philosophical debates. Constitutional scholars continue to grapple with the boundaries of governmental authority in an increasingly interconnected digital landscape.',
    difficulty: 'hard',
    wordCount: 40,
  },
  {
    id: 'hard-03',
    text: "The architectural magnificence of Gothic cathedrals exemplifies medieval engineering's ambitious pursuit of verticality and luminosity. Flying buttresses, ribbed vaults, and pointed arches distributed tremendous structural forces, enabling the construction of unprecedented expanses of stained glass that transformed interior spaces into kaleidoscopes of colored light.",
    difficulty: 'hard',
    wordCount: 42,
  },
  {
    id: 'hard-04',
    text: "Neuroplasticity research has revolutionized our understanding of the human brain's remarkable capacity for reorganization. Contrary to previously held beliefs about fixed neural pathways, contemporary neuroscience demonstrates that synaptic connections continuously adapt in response to experience, learning, and environmental stimuli throughout the entire lifespan.",
    difficulty: 'hard',
    wordCount: 42,
  },
  {
    id: 'hard-05',
    text: 'The philosophical implications of artificial general intelligence extend far beyond technological considerations into fundamental questions about consciousness, moral agency, and the nature of understanding itself. If a sufficiently complex computational system exhibits behaviors indistinguishable from human cognition, the traditional Cartesian framework for defining sentience becomes increasingly inadequate.',
    difficulty: 'hard',
    wordCount: 48,
  },
  {
    id: 'hard-06',
    text: 'Macroeconomic policy operates within a complex web of interdependent variables where interventions frequently produce counterintuitive results. The relationship between monetary supply, inflation expectations, and aggregate demand defies simplistic modeling, requiring policymakers to constantly recalibrate their approaches based on emerging empirical data.',
    difficulty: 'hard',
    wordCount: 39,
  },
  {
    id: 'hard-07',
    text: 'The biodiversity of tropical rainforest ecosystems represents an intricate tapestry of symbiotic relationships developed over millions of years of coevolution. Each species occupies a precisely defined ecological niche; the removal of even a single organism can trigger cascading effects throughout the entire food web.',
    difficulty: 'hard',
    wordCount: 43,
  },
  {
    id: 'hard-08',
    text: 'Cryptographic protocols underpinning modern digital security rely on the computational intractability of certain mathematical problems, particularly integer factorization and discrete logarithms. The advent of practical quantum computing threatens to fundamentally undermine these foundations, necessitating the urgent development of post-quantum cryptographic standards.',
    difficulty: 'hard',
    wordCount: 39,
  },
  {
    id: 'hard-09',
    text: "The phenomenological tradition in continental philosophy, inaugurated by Edmund Husserl and subsequently developed by Heidegger and Merleau-Ponty, seeks to describe the structures of conscious experience as they present themselves to awareness, bracketing all presuppositions about the external world's independent existence.",
    difficulty: 'hard',
    wordCount: 40,
  },
  {
    id: 'hard-10',
    text: 'Sustainable urban planning requires the integration of transportation infrastructure, green space allocation, energy-efficient building design, and equitable housing policy into a cohesive framework that anticipates demographic shifts while preserving the cultural heritage and unique character of existing neighborhoods.',
    difficulty: 'hard',
    wordCount: 39,
  },
];

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
    filtered = PASSAGES;
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

function broadcastAction(
  io: Server,
  room: TypeRoom,
  type: string,
  payload: Record<string, any>,
): void {
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
}

function removeRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  cleanupRoomTimers(room);
  rooms.delete(roomId);
  logger.info({ event: 'rmhtype_room_removed', roomId });
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

function calculateRoundResults(room: TypeRoom): { rankings: any[] } {
  const rankings = Array.from(room.players.values())
    .filter((p) => p.isConnected || p.finished)
    .sort((a, b) => {
      // Finished players first, then by finishTime (faster = better)
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
      return b.currentPosition - a.currentPosition;
    })
    .map((p, index) => {
      const rank = p.finished ? p.finishRank : index + 1;
      const positionBonus = calculatePositionBonus(rank);
      const roundScore = Math.round(p.wpm * (p.accuracy / 100) * 10) + positionBonus;

      // Add to cumulative score
      p.score += roundScore;

      return {
        userId: p.userId,
        userName: p.userName,
        rank,
        wpm: Math.round(p.wpm * 100) / 100,
        accuracy: Math.round(p.accuracy * 100) / 100,
        finishTime: p.finishTime,
        roundScore,
        totalScore: p.score,
        positionBonus,
      };
    });

  return { rankings };
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
    }));

  return {
    standings,
    winnerUserId: standings.length > 0 ? standings[0].userId : null,
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
      io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:progress', progress);
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
  io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:countdown', { seconds: remaining });
  const countdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0 && room.state === 'COUNTDOWN') {
      io.to(`rmhtype:${room.roomId}`).emit('rmhtype:game:countdown', { seconds: remaining });
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
    setTimeout(() => {
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

      // Upsert profile (per-difficulty)
      const difficulty = room.settings.difficulty;
      const qualifies = standing.avgAccuracy >= MIN_LEADERBOARD_ACCURACY;
      const profile = await (prisma as any).rmhTypeProfile.upsert({
        where: { userId_difficulty: { userId: standing.userId, difficulty } },
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
          totalGamesPlayed: { increment: 1 },
          totalWins: standing.finalRank === 1 ? { increment: 1 } : undefined,
          totalCharsTyped: { increment: player.currentPosition },
          totalTimeMs: { increment: player.finishTime ?? 0 },
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
          where: { id: profile.id },
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
        quest: { type: 'game_play' },
      });
    }

    logger.info({ event: 'rmhtype_match_persisted', matchId: match.id, roomId: room.roomId });
  } catch (err) {
    logger.error({ event: 'rmhtype_persist_error', roomId: room.roomId, error: String(err) });
  }
}

const MIN_LEADERBOARD_ACCURACY = 90;

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
    const qualifies = accuracy >= MIN_LEADERBOARD_ACCURACY;

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
        results: { wpm, accuracy, timeMs },
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
      where: { userId_difficulty: { userId, difficulty } },
      create: createData,
      update: {
        totalGamesPlayed: { increment: 1 },
        totalCharsTyped: { increment: charsTyped },
        totalTimeMs: { increment: timeMs },
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
        where: { id: profile.id },
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
    awardAppProgress(userId, { xp: 10, quest: { type: 'game_play' } });

    logger.info({
      event: 'rmhtype_solo_persisted',
      matchId: match.id,
      userId,
      scorePosted: qualifies,
    });
    return qualifies;
  } catch (err) {
    logger.error({ event: 'rmhtype_solo_persist_error', userId, error: String(err) });
    return false;
  }
}

// ─── Leaderboard Query ───────────────────────────────────────

async function fetchLeaderboard(prisma: any, difficulty: string, limit: number) {
  // Fetch extra to account for reordering by formula
  const profiles: any[] = await prisma.rmhTypeProfile.findMany({
    where: { difficulty, bestWpm: { gt: 0 } },
    orderBy: { bestWpm: 'desc' },
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
    .map((p, index) => ({ ...p, rank: index + 1 }));
}

// ─── Main Handler Registration ──────────────────────────────

export function registerRmhTypeHandlers(io: Server, socket: Socket): void {
  const userId: string = socket.data.userId;
  const userName: string = socket.data.userName || 'Player';
  const avatarUrl: string | null = socket.data.avatarUrl || null;

  // Track socket <-> user mapping
  userSocketMap.set(userId, socket.id);
  socketUserMap.set(socket.id, userId);

  // ─── Room Management ────────────────────────────────────

  socket.on('rmhtype:room:create', (payload?: { settings?: Partial<RoomSettings> }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:room:create')) {
      socket.emit('rmhtype:error', { message: 'Rate limit exceeded' });
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
      socket.emit('rmhtype:error', { message: 'Could not generate room code' });
      return;
    }

    // Build settings from payload
    const rawSettings = payload?.settings;
    const settings: RoomSettings = {
      isPublic:
        typeof rawSettings?.isPublic === 'boolean'
          ? rawSettings.isPublic
          : DEFAULT_SETTINGS.isPublic,
      maxPlayers: Math.min(
        MAX_PLAYERS,
        Math.max(
          2,
          typeof rawSettings?.maxPlayers === 'number'
            ? rawSettings.maxPlayers
            : DEFAULT_SETTINGS.maxPlayers,
        ),
      ),
      difficulty:
        rawSettings?.difficulty && ['easy', 'medium', 'hard'].includes(rawSettings.difficulty)
          ? rawSettings.difficulty
          : DEFAULT_SETTINGS.difficulty,
      passageLength:
        rawSettings?.passageLength &&
        ['short', 'medium', 'long'].includes(rawSettings.passageLength)
          ? rawSettings.passageLength
          : DEFAULT_SETTINGS.passageLength,
      rounds: Math.min(
        10,
        Math.max(
          1,
          typeof rawSettings?.rounds === 'number' ? rawSettings.rounds : DEFAULT_SETTINGS.rounds,
        ),
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

    socket.emit('rmhtype:room:created', { roomId });
    socket.emit('rmhtype:room:state', buildStateSnapshot(room, userId));

    logger.info({ event: 'rmhtype_room_created', roomId, userId });
  });

  socket.on(
    'rmhtype:room:join',
    (payload?: { roomId?: string; roomCode?: string; password?: string }) => {
      if (!checkRateLimit(socket.id, 'rmhtype:room:join')) {
        socket.emit('rmhtype:error', { message: 'Rate limit exceeded' });
        return;
      }

      const roomId = sanitizeString(payload?.roomCode ?? payload?.roomId, 16);
      if (!roomId) {
        socket.emit('rmhtype:error', { message: 'Room ID required' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('rmhtype:error', { message: 'Room not found' });
        return;
      }

      // Ban check
      if (room.bannedUsers.some((b) => b.userId === userId)) {
        socket.emit('rmhtype:error', { code: 'BANNED', message: 'You are banned from this room' });
        return;
      }

      // Password check
      if (room.settings.password) {
        const provided = typeof payload?.password === 'string' ? payload.password : '';
        if (provided !== room.settings.password) {
          socket.emit('rmhtype:error', { message: 'Incorrect password' });
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

        broadcastRoomState(io, room);

        logger.info({ event: 'rmhtype_player_reconnected', roomId, userId });
        return;
      }

      // Check capacity
      if (room.players.size >= room.settings.maxPlayers) {
        socket.emit('rmhtype:error', { message: 'Room is full' });
        return;
      }

      // Only allow joining during WAITING or ROUND_RESULTS
      if (room.state !== 'WAITING' && room.state !== 'ROUND_RESULTS') {
        socket.emit('rmhtype:error', { message: 'Game is in progress' });
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

      logger.info({ event: 'rmhtype_player_joined', roomId, userId });
    },
  );

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
        targetSocket.emit('rmhtype:room:kicked', { roomId });
        targetSocket.leave(`rmhtype:${roomId}`);
        socketRoomMap.delete(targetSocketId);
      }
    }

    room.players.delete(targetUserId);
    broadcastRoomState(io, room);

    logger.info({ event: 'rmhtype_player_kicked', roomId, targetUserId, hostUserId: userId });
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
      reason:
        typeof payload?.reason === 'string' && payload.reason.trim()
          ? payload.reason.trim().slice(0, 200)
          : null,
    });

    // Kick the player
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('rmhtype:room:kicked', { roomId, reason: 'banned' });
        targetSocket.leave(`rmhtype:${roomId}`);
        socketRoomMap.delete(targetSocketId);
      }
    }

    room.players.delete(targetUserId);
    broadcastRoomState(io, room);

    logger.info({ event: 'rmhtype_player_banned', roomId, targetUserId, hostUserId: userId });
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

    logger.info({ event: 'rmhtype_player_unbanned', roomId, targetUserId, hostUserId: userId });
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

    logger.info({ event: 'rmhtype_host_transferred', roomId, from: userId, to: targetUserId });
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
    if (
      rawSettings.passageLength &&
      ['short', 'medium', 'long'].includes(rawSettings.passageLength)
    ) {
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

    logger.debug({ event: 'rmhtype_settings_updated', roomId });
  });

  socket.on('rmhtype:room:browse', () => {
    const publicRooms = Array.from(rooms.values())
      .filter(
        (r) =>
          r.settings.isPublic && r.state === 'WAITING' && r.players.size < r.settings.maxPlayers,
      )
      .map((r) => ({
        roomId: r.roomId,
        hostUserName: r.players.get(r.hostUserId)?.userName ?? 'Unknown',
        playerCount: r.players.size,
        maxPlayers: r.settings.maxPlayers,
        difficulty: r.settings.difficulty,
        passageLength: r.settings.passageLength,
        rounds: r.settings.rounds,
      }));

    socket.emit('rmhtype:room:list', { rooms: publicRooms });
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
      socket.emit('rmhtype:error', { message: 'Rate limit exceeded' });
      return;
    }

    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.hostUserId !== userId) {
      socket.emit('rmhtype:error', { message: 'Only the host can start the game' });
      return;
    }

    if (room.state !== 'WAITING' && room.state !== 'ROUND_RESULTS') {
      socket.emit('rmhtype:error', { message: 'Cannot start game in current state' });
      return;
    }

    const connectedCount = getConnectedPlayerCount(room);
    if (connectedCount < 1) {
      socket.emit('rmhtype:error', { message: 'Not enough players' });
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

    const position = typeof payload?.position === 'number' ? Math.max(0, payload.position) : 0;
    const errors = typeof payload?.errors === 'number' ? Math.max(0, payload.errors) : 0;

    player.currentPosition = position;
    player.errors = errors;

    // Calculate WPM: (characters / 5) / (elapsed minutes)
    const elapsedMs = Date.now() - room.roundStartTime;
    if (elapsedMs > 0 && position > 0) {
      player.wpm = position / 5 / (elapsedMs / 60000);
      player.accuracy = ((position - errors) / position) * 100;
      if (player.accuracy < 0) player.accuracy = 0;
    }
  });

  socket.on('rmhtype:game:finish', () => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'TYPING' || !room.roundStartTime) return;

    const player = room.players.get(userId);
    if (!player || player.finished) return;

    player.finished = true;
    player.finishTime = Date.now() - room.roundStartTime;
    room.finishOrder++;
    player.finishRank = room.finishOrder;

    // Calculate final WPM and accuracy
    if (player.finishTime > 0 && player.currentPosition > 0) {
      player.wpm = player.currentPosition / 5 / (player.finishTime / 60000);
      player.accuracy =
        player.currentPosition > 0
          ? ((player.currentPosition - player.errors) / player.currentPosition) * 100
          : 100;
      if (player.accuracy < 0) player.accuracy = 0;
    }

    io.to(`rmhtype:${roomId}`).emit('rmhtype:game:playerFinished', {
      userId: player.userId,
      userName: player.userName,
      wpm: Math.round(player.wpm * 100) / 100,
      accuracy: Math.round(player.accuracy * 100) / 100,
      timeMs: player.finishTime,
      rank: player.finishRank,
    });

    // Check if all connected players finished
    checkAllPlayersFinished(io, room);
  });

  // ─── Solo Mode ──────────────────────────────────────────

  socket.on('rmhtype:solo:start', (payload?: { difficulty?: string; passageLength?: string }) => {
    if (!checkRateLimit(socket.id, 'rmhtype:solo:start')) {
      socket.emit('rmhtype:error', { message: 'Rate limit exceeded' });
      return;
    }

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

    const passage = selectPassage(soloSettings);
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
    };

    rooms.set(soloRoomId, soloRoom);
    socket.join(`rmhtype:${soloRoomId}`);
    socketRoomMap.set(socket.id, soloRoomId);

    // Emit countdown ticks each second
    let soloRemaining = COUNTDOWN_SECONDS;
    socket.emit('rmhtype:solo:countdown', { seconds: soloRemaining });
    const soloCountdownInterval = setInterval(() => {
      soloRemaining--;
      if (soloRemaining > 0 && soloRoom.state === 'COUNTDOWN') {
        socket.emit('rmhtype:solo:countdown', { seconds: soloRemaining });
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
      });

      // Solo round timeout
      setTimeout(() => {
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
              scorePosted: soloPlayer.accuracy >= MIN_LEADERBOARD_ACCURACY,
            });
            cleanupSoloRoom(soloRoomId, socket);
          }
        }
      }, ROUND_TIMEOUT_MS);

      logger.info({ event: 'rmhtype_solo_started', userId, passageId: passage.id });
    }, COUNTDOWN_SECONDS * 1000);
  });

  socket.on('rmhtype:solo:finish', (payload?: { position?: number; errors?: number }) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId || !roomId.startsWith('solo-')) return;

    const room = rooms.get(roomId);
    if (!room || room.state !== 'TYPING' || !room.roundStartTime) return;

    const player = room.players.get(userId);
    if (!player || player.finished) return;

    const position =
      typeof payload?.position === 'number'
        ? Math.max(0, payload.position)
        : player.currentPosition;
    const errors =
      typeof payload?.errors === 'number' ? Math.max(0, payload.errors) : player.errors;

    player.currentPosition = position;
    player.errors = errors;
    player.finished = true;
    player.finishTime = Date.now() - room.roundStartTime;

    // Calculate final WPM and accuracy
    if (player.finishTime > 0 && position > 0) {
      player.wpm = position / 5 / (player.finishTime / 60000);
      player.accuracy = ((position - errors) / position) * 100;
      if (player.accuracy < 0) player.accuracy = 0;
    } else {
      player.wpm = 0;
      player.accuracy = 100;
    }

    const result: Record<string, any> = {
      wpm: Math.round(player.wpm * 100) / 100,
      accuracy: Math.round(player.accuracy * 100) / 100,
      timeMs: player.finishTime,
      timedOut: false,
      scorePosted: player.accuracy >= MIN_LEADERBOARD_ACCURACY,
    };

    socket.emit('rmhtype:solo:result', result);

    // Persist solo result to DB
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
      logger.error({ event: 'rmhtype_solo_persist_error', userId, error: String(err) });
    });

    cleanupSoloRoom(roomId, socket);
  });

  // ─── Leaderboard ────────────────────────────────────────

  socket.on(
    'rmhtype:leaderboard:fetch',
    async (payload?: { limit?: number; difficulty?: string }) => {
      try {
        const prisma = getPrismaClient();
        const limit = Math.min(
          100,
          Math.max(1, typeof payload?.limit === 'number' ? payload.limit : 50),
        );
        const difficulty = ['easy', 'medium', 'hard'].includes(payload?.difficulty ?? '')
          ? payload!.difficulty!
          : 'medium';

        const leaderboard = await fetchLeaderboard(prisma, difficulty, limit);
        socket.emit('rmhtype:leaderboard:data', { leaderboard, difficulty });
      } catch (err) {
        logger.error({ event: 'rmhtype_leaderboard_fetch_error', error: String(err) });
        socket.emit('rmhtype:error', { message: 'Failed to fetch leaderboard' });
      }
    },
  );
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

  logger.info({ event: 'rmhtype_player_left', roomId, userId });
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
    // Clean up room after grace period
    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;
      const stillAllDisconnected = Array.from(currentRoom.players.values()).every(
        (p) => !p.isConnected,
      );
      if (stillAllDisconnected) {
        removeRoom(roomId);
        logger.info({ event: 'rmhtype_room_abandoned', roomId });
      }
    }, ROOM_CLEANUP_DELAY_MS);
    return;
  }

  // Host migration if host disconnected
  if (room.hostUserId === userId) {
    migrateHost(io, room);
  }

  if (room.state === 'WAITING') {
    // In waiting state, remove player after grace period
    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;
      const currentPlayer = currentRoom.players.get(userId);
      if (currentPlayer && !currentPlayer.isConnected) {
        currentRoom.players.delete(userId);
        broadcastRoomState(io, currentRoom);
        if (currentRoom.players.size === 0) {
          removeRoom(roomId);
        } else if (currentRoom.hostUserId === userId) {
          migrateHost(io, currentRoom);
        }
      }
    }, DISCONNECT_REMOVE_DELAY_MS);
  } else if (room.state === 'TYPING') {
    // During typing, keep player data but check if round should end
    checkAllPlayersFinished(io, room);
  }

  logger.info({ event: 'rmhtype_player_disconnected', roomId, userId });
}
