/**
 * Issuing a single-player run: the server picks the seed and derives the loadout from ITS OWN copy of
 * the player's upgrades, so neither can be shopped for or inflated by the browser. A user has at most
 * one open run; starting another closes the previous one (its log can no longer be submitted).
 */
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { CLASSES } from '@/lib/altair/data/classes';
import { loadoutFromUpgrades } from './loadout';
import { maxUnlockedHeat } from './heat.server';
import { HEAT_MAX } from '@/lib/altair/data/heat';
import { SOLO_RUN_TTL_MS } from './job';
import type { SoloLoadout } from './solo-log';

export interface IssuedRun {
  runId: string;
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: SoloLoadout;
  expiresAt: string;
}

export type IssueOutcome = { ok: true; run: IssuedRun } | { ok: false; error: string };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

export async function issueSoloRun(
  userId: string,
  classId: string,
  wantDoubleTime: boolean,
  wantHeat = 0,
  now = new Date(),
): Promise<IssueOutcome> {
  if (!CLASSES.some((c) => c.id === classId)) return { ok: false, error: 'Unknown class' };
  if (!Number.isInteger(wantHeat) || wantHeat < 0 || wantHeat > HEAT_MAX) return { ok: false, error: 'Unknown Heat tier' };
  // A tier is earned by clearing the one below it, proven by the server's own ledger of verified victories.
  if (wantHeat > 0 && wantHeat > (await maxUnlockedHeat(userId))) return { ok: false, error: 'Heat tier not unlocked' };
  const meta = await prisma.altairMetaProgress.findUnique({
    where: { userId },
    select: { upgrades: true, doubleTimeUnlocked: true },
  });
  const loadout = {
    ...loadoutFromUpgrades((meta?.upgrades ?? {}) as Record<string, number>),
    // Only above Heat 0, so a standard run keeps the exact loadout shape it always had.
    ...(wantHeat > 0 ? { heat: wantHeat } : {}),
  };
  const doubleTime = wantDoubleTime && !!meta?.doubleTimeUnlocked;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const run = await prisma.$transaction(async (tx) => {
        await tx.altairSoloRun.updateMany({
          where: { userId, status: 'open' },
          data: { status: 'abandoned', openUserId: null },
        });
        return tx.altairSoloRun.create({
          data: {
            userId,
            openUserId: userId,
            // 31 bits: fits the Int column, and the sim takes any 32-bit seed.
            seed: randomInt(0, 2 ** 31),
            classId,
            doubleTime,
            loadout: loadout as never,
            expiresAt: new Date(now.getTime() + SOLO_RUN_TTL_MS),
          },
        });
      });
      return {
        ok: true,
        run: {
          runId: run.id,
          seed: run.seed,
          classId,
          doubleTime,
          loadout,
          expiresAt: run.expiresAt.toISOString(),
        },
      };
    } catch (e) {
      if (isUniqueViolation(e)) continue; // a concurrent start won; close it and try again
      throw e;
    }
  }
  return { ok: false, error: 'Conflict, try again' };
}
