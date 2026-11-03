import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { reconcileMetaSave, type MetaRow } from '@/lib/altair/meta-guard';

/** GET — Load meta progress from database. */

/** POST — Save meta progress to database. */

export const Route = createFileRoute('/api/altair/meta')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const progress = await prisma.altairMetaProgress.findUnique({
          where: { userId: session.user.id },
        });

        if (!progress) {
          return Response.json({ data: null });
        }

        return Response.json({
          data: {
            coins: progress.coins,
            upgrades: progress.upgrades as Record<string, number>,
            unlockedClasses: progress.unlockedClasses as string[],
            doubleTimeUnlocked: progress.doubleTimeUnlocked,
            classFirstClears: progress.classFirstClears as string[],
            totalRunsPlayed: progress.totalRunsPlayed,
            bestTimeSurvived: progress.bestTimeSurvived,
            bestKills: progress.bestKills,
            bossesDefeated: progress.bossesDefeated as string[],
            bestiary: (progress as Record<string, unknown>).bestiary ?? {},
          },
        });
      }),
      POST: defineHandler(
        { auth: 'none', rateLimit: { limit: 10, windowMs: 60_000, prefix: 'altair-meta' } },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const body = await request.json();
            const {
              coins,
              upgrades,
              unlockedClasses,
              doubleTimeUnlocked,
              classFirstClears,
              totalRunsPlayed,
              bestTimeSurvived,
              bestKills,
              bossesDefeated,
              bestiary,
            } = body;

            // Basic validation
            if (typeof coins !== 'number' || coins < 0 || coins > 100_000_000) {
              return Response.json({ error: 'Invalid coins' }, { status: 400 });
            }
            if (typeof upgrades !== 'object' || upgrades === null || Array.isArray(upgrades)) {
              return Response.json({ error: 'Invalid upgrades' }, { status: 400 });
            }
            if (!Array.isArray(unlockedClasses)) {
              return Response.json({ error: 'Invalid unlockedClasses' }, { status: 400 });
            }

            // The client's coin balance is a CLAIM, not a fact: purchases are priced from the server's
            // own table against the server's balance, and earned coins are limited by a refilling
            // allowance (lib/altair/meta-guard.ts). Everything else saves as before.
            const userId = session.user.id;
            const shared = {
              unlockedClasses,
              doubleTimeUnlocked: !!doubleTimeUnlocked,
              classFirstClears: classFirstClears ?? [],
              totalRunsPlayed: totalRunsPlayed ?? 0,
              bestTimeSurvived: bestTimeSurvived ?? 0,
              bestKills: bestKills ?? 0,
              bossesDefeated: bossesDefeated ?? [],
              bestiary: bestiary ?? {},
            };
            for (let attempt = 0; attempt < 3; attempt++) {
              const row = await prisma.altairMetaProgress.findUnique({ where: { userId } });
              const prev: MetaRow | null = row
                ? {
                    coins: row.coins,
                    upgrades: (row.upgrades ?? {}) as Record<string, number>,
                    coinAllowance: row.coinAllowance,
                    coinAllowanceAt: row.coinAllowanceAt,
                  }
                : null;
              const decision = reconcileMetaSave(prev, { coins, upgrades }, new Date());
              if (!decision.ok) {
                return Response.json({ error: decision.error }, { status: 400 });
              }
              const money = {
                coins: decision.coins,
                upgrades: decision.upgrades,
                coinAllowance: decision.coinAllowance,
                coinAllowanceAt: decision.coinAllowanceAt,
              };
              if (!row) {
                try {
                  await prisma.altairMetaProgress.create({ data: { userId, ...money, ...shared } });
                } catch {
                  continue; // a concurrent first save won; reconcile against it
                }
              } else {
                // Optimistic concurrency on the balance we reconciled against.
                const done = await prisma.altairMetaProgress.updateMany({
                  where: { userId, coins: row.coins, updatedAt: row.updatedAt },
                  data: { ...money, ...shared },
                });
                if (done.count === 0) continue;
              }
              return Response.json({ success: true, coins: decision.coins, clamped: decision.clamped });
            }
            return Response.json({ error: 'Conflict, try again' }, { status: 409 });
          } catch (e) {
            console.error('Altair meta save failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
