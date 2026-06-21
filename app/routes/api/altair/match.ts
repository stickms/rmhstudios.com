import { createFileRoute } from '@tanstack/react-router';
/**
 * Altair Multiplayer Match Recording API
 *
 * POST — Called by the Altair multiplayer server at run end
 * to persist match results and update co-op profiles.
 */

import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

// Server-to-server auth via shared secret
const ALTAIR_SERVER_SECRET = process.env.ALTAIR_SERVER_SECRET;

// Bound every client-influenced stat to a sane maximum so a compromised/abused
// caller can't write absurd totals into a user's co-op profile (which feeds
// leaderboards). Values are clamped, not rejected, to keep match recording
// resilient.
const playerSchema = z.object({
  userId: z.string().min(1).max(64),
  userName: z.string().max(64).optional(),
  classId: z.string().max(64).optional(),
  slot: z.number().int().min(0).max(64).optional(),
  level: z.number().int().min(0).max(1000).optional(),
  kills: z.number().int().min(0).max(1_000_000).optional(),
  coinsEarned: z.number().int().min(0).max(100_000_000).optional(),
  timeSurvived: z.number().min(0).max(86_400_000).optional(),
  wasDowned: z.boolean().optional(),
  wasRevived: z.boolean().optional(),
  revivesGiven: z.number().int().min(0).max(10_000).optional(),
  revivesReceived: z.number().int().min(0).max(10_000).optional(),
  wasAliveAtEnd: z.boolean().optional(),
  coinBreakdown: z.unknown().optional(),
});

const matchSchema = z.object({
  lobbyId: z.string().min(1).max(64),
  playerCount: z.number().int().min(0).max(64).optional(),
  doubleTime: z.boolean().optional(),
  victory: z.boolean().optional(),
  sharedKills: z.number().int().min(0).max(10_000_000).optional(),
  bossesDefeated: z.array(z.string().max(64)).max(100).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  players: z.array(playerSchema).min(1).max(64),
});

export const Route = createFileRoute('/api/altair/match')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    // Validate server secret
    const authHeader = request.headers.get('authorization');
    if (!ALTAIR_SERVER_SECRET || authHeader !== `Bearer ${ALTAIR_SERVER_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      );
    }
    const {
      lobbyId,
      playerCount,
      doubleTime,
      victory,
      sharedKills,
      bossesDefeated,
      durationMs,
      players,
    } = parsed.data;

    // Only update co-op profiles for userIds that map to real accounts —
    // never let a caller mint/inflate profiles for arbitrary or anonymous ids.
    const realUserIds = new Set(
      (
        await prisma.user.findMany({
          where: { id: { in: players.map((p) => p.userId) } },
          select: { id: true },
        })
      ).map((u) => u.id)
    );

    // Create match record with player records in a transaction
    const match = await prisma.$transaction(async (tx) => {
      // Create the match
      const matchRecord = await tx.altairMatch.create({
        data: {
          lobbyId,
          playerCount: playerCount ?? players.length,
          doubleTime: doubleTime ?? false,
          victory: victory ?? false,
          sharedKills: sharedKills ?? 0,
          bossesDefeated: bossesDefeated ?? [],
          durationMs: durationMs ?? null,
          endedAt: new Date(),
          results: body,
        },
      });

      // Create player match records
      for (const p of players) {
        await tx.altairMatchPlayer.create({
          data: {
            matchId: matchRecord.id,
            userId: p.userId,
            userName: p.userName ?? 'Player',
            classId: p.classId ?? 'unknown',
            slot: p.slot ?? 0,
            finalLevel: p.level ?? 1,
            kills: p.kills ?? 0,
            coinsEarned: p.coinsEarned ?? 0,
            timeSurvived: p.timeSurvived ?? 0,
            wasDowned: p.wasDowned ?? false,
            wasRevived: p.wasRevived ?? false,
            revivesGiven: p.revivesGiven ?? 0,
            wasAliveAtEnd: p.wasAliveAtEnd ?? true,
            stats: p.coinBreakdown ?? {},
          },
        });

        // Upsert co-op profile — only for verified real users.
        if (!realUserIds.has(p.userId)) continue;
        await tx.altairCoopProfile.upsert({
          where: { userId: p.userId },
          create: {
            userId: p.userId,
            totalCoopRuns: 1,
            totalCoopWins: victory ? 1 : 0,
            totalRevivesGiven: p.revivesGiven ?? 0,
            totalRevivesReceived: p.revivesReceived ?? 0,
            totalCoopKills: p.kills ?? 0,
            totalCoopCoins: p.coinsEarned ?? 0,
            favoriteClassId: p.classId ?? null,
          },
          update: {
            totalCoopRuns: { increment: 1 },
            totalCoopWins: victory ? { increment: 1 } : undefined,
            totalRevivesGiven: { increment: p.revivesGiven ?? 0 },
            totalRevivesReceived: { increment: p.revivesReceived ?? 0 },
            totalCoopKills: { increment: p.kills ?? 0 },
            totalCoopCoins: { increment: p.coinsEarned ?? 0 },
          },
        });
      }

      return matchRecord;
    });

    return Response.json({ success: true, matchId: match.id });
  } catch (e) {
    console.error('Altair match recording failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
