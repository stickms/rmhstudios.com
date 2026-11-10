import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { reconcileMetaSave, type MetaRow } from '@features/altair/engine/meta-guard';

/**
 * The save body. Only the three fields the old route checked are validated; the rest
 * were read untyped and defaulted with `??`, so they stay trusted as they were.
 */
const altairMetaBody = z.object({
  coins: z.number().min(0).max(100_000_000),
  upgrades: z.custom<Record<string, number>>(
    (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  ),
  unlockedClasses: z.custom<string[]>((v) => Array.isArray(v)),
  doubleTimeUnlocked: z.unknown().optional(),
  classFirstClears: z.custom<string[]>().optional(),
  totalRunsPlayed: z.custom<number>().optional(),
  bestTimeSurvived: z.custom<number>().optional(),
  bestKills: z.custom<number>().optional(),
  bossesDefeated: z.custom<string[]>().optional(),
  bestiary: z.custom<Prisma.InputJsonObject>().optional(),
});

/** The old route's bespoke 400 texts, chosen by the field that failed. */
function altairMetaMessage(error: z.ZodError): string {
  const field = error.issues[0]?.path[0];
  if (field === 'upgrades') return 'Invalid upgrades';
  if (field === 'unlockedClasses') return 'Invalid unlockedClasses';
  return 'Invalid coins';
}

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
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'altair-meta' },
          body: altairMetaBody,
          invalid: (error) => Response.json({ error: altairMetaMessage(error) }, { status: 400 }),
        },
        async ({ request, userId, body }) => {
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

          // The client's coin balance is a CLAIM, not a fact: purchases are priced from the server's
          // own table against the server's balance, and earned coins are limited by a refilling
          // allowance (features/altair/engine/meta-guard.ts). Everything else saves as before.
          // New clients send x-altair-verified-runs: their coins come from the replay of a server-issued
          // run, never from this claim. The one exception is a run the server could not take
          // (x-altair-fallback-run names it, status 'unverified'): it may be paid once through the
          // capped allowance. Old clients (no header) keep the allowance until ALTAIR_LEGACY_META=0.
          let verifiedOnly =
            request.headers.get('x-altair-verified-runs') === '1' ||
            process.env.ALTAIR_LEGACY_META === '0';
          const fallbackRun = request.headers.get('x-altair-fallback-run');
          if (verifiedOnly && fallbackRun) {
            const used = await prisma.altairSoloRun.updateMany({
              where: { id: fallbackRun, userId, status: 'unverified' },
              data: { status: 'unverified_paid' },
            });
            if (used.count === 1) verifiedOnly = false;
          }
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
            const decision = reconcileMetaSave(prev, { coins, upgrades }, new Date(), {
              verifiedOnly,
            });
            if (!decision.ok) {
              return Response.json({ error: decision.error }, { status: 400 });
            }
            // classFirstClears only ever grows: a save cannot take a class back out of it.
            const serverClears = Array.isArray(row?.classFirstClears)
              ? (row?.classFirstClears as unknown[])
              : [];
            const clientClears = Array.isArray(shared.classFirstClears)
              ? shared.classFirstClears
              : [];
            const classFirstClears = [
              ...new Set(
                [...serverClears, ...clientClears].filter(
                  (c): c is string => typeof c === 'string',
                ),
              ),
            ];
            const money = {
              coins: decision.coins,
              upgrades: decision.upgrades,
              coinAllowance: decision.coinAllowance,
              coinAllowanceAt: decision.coinAllowanceAt,
            };
            if (!row) {
              try {
                await prisma.altairMetaProgress.create({
                  data: { userId, ...money, ...shared, classFirstClears },
                });
              } catch {
                continue; // a concurrent first save won; reconcile against it
              }
            } else {
              // Optimistic concurrency on the balance we reconciled against.
              const done = await prisma.altairMetaProgress.updateMany({
                where: { userId, coins: row.coins, updatedAt: row.updatedAt },
                data: { ...money, ...shared, classFirstClears },
              });
              if (done.count === 0) continue;
            }
            return Response.json({
              success: true,
              coins: decision.coins,
              clamped: decision.clamped,
            });
          }
          return Response.json({ error: 'Conflict, try again' }, { status: 409 });
        },
      ),
    },
  },
});
