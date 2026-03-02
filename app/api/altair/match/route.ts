/**
 * Altair Multiplayer Match Recording API
 *
 * POST — Called by the Altair multiplayer server at run end
 * to persist match results and update co-op profiles.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Server-to-server auth via shared secret
const ALTAIR_SERVER_SECRET = process.env.ALTAIR_SERVER_SECRET;

export async function POST(req: Request) {
  try {
    // Validate server secret
    const authHeader = req.headers.get('authorization');
    if (!ALTAIR_SERVER_SECRET || authHeader !== `Bearer ${ALTAIR_SERVER_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      lobbyId,
      playerCount,
      doubleTime,
      victory,
      sharedKills,
      bossesDefeated,
      durationMs,
      players,
    } = body;

    // Basic validation
    if (!lobbyId || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

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

        // Upsert co-op profile
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

    return NextResponse.json({ success: true, matchId: match.id });
  } catch (e) {
    console.error('Altair match recording failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
