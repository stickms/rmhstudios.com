/**
 * Responsible play (W8) — the web tier's binding, plus the one write path.
 *
 * `play-limits-core.ts` holds the read and the enforcement because the socket
 * tier needs both. This module holds what only the site needs: the settings
 * read (which folds in a matured pending change and persists the fold), and the
 * update, which is the only place a limit row is written.
 */

import { prisma } from '@/lib/prisma.server';
import {
  NO_LIMITS,
  applyChange,
  effectiveCap,
  hasMaturedPending,
  hidesRiskSurfaces,
  type LimitChange,
  type PlayLimits,
} from '@/lib/economy/play-limits';
import { readPlayLimits, stakedToday } from '@/lib/economy/play-limits-core';

/** What the settings panel renders. Dates as ISO strings for the wire. */
export interface PlayLimitsView {
  dailyCoinCap: number | null;
  selfExcludedUntil: string | null;
  coolOffUntil: string | null;
  /** A loosening still waiting out its 24 hours; null when nothing is pending. */
  pendingCap: number | null;
  pendingCapAt: string | null;
  /** Coins staked since midnight UTC, so the panel can show the headroom. */
  stakedToday: number;
  /** True while the risk surfaces are hidden from nav and search. */
  surfacesHidden: boolean;
}

function toView(limits: PlayLimits, staked: number, now: Date): PlayLimitsView {
  // A matured pending change is shown as the live cap with nothing pending,
  // matching what enforcement already does — otherwise the panel would tell a
  // member they are still capped at the old number while the ledger uses the new.
  const matured = hasMaturedPending(limits, now);
  return {
    dailyCoinCap: effectiveCap(limits, now),
    selfExcludedUntil: limits.selfExcludedUntil?.toISOString() ?? null,
    coolOffUntil: limits.coolOffUntil?.toISOString() ?? null,
    pendingCap: matured ? null : limits.pendingCap,
    pendingCapAt: matured ? null : (limits.pendingCapAt?.toISOString() ?? null),
    stakedToday: staked,
    surfacesHidden: hidesRiskSurfaces(limits, now),
  };
}

/**
 * Read for display, settling any matured pending change on the way past.
 *
 * The settle is a write on a read path, which is normally worth avoiding. It
 * earns its place here: without it the row keeps a `pendingCapAt` in the past
 * forever, and every later edit has to reason about whether the pending value
 * or the stored value is the real one. Settling collapses that to one case.
 */
export async function getPlayLimits(userId: string, now: Date = new Date()): Promise<PlayLimitsView> {
  const limits = await readPlayLimits(prisma, userId);

  if (hasMaturedPending(limits, now)) {
    const settled = effectiveCap(limits, now);
    await prisma.userPlayLimits.update({
      where: { userId },
      data: { dailyCoinCap: settled, pendingCap: null, pendingCapAt: null },
    });
    const staked = await stakedToday(prisma, userId, now);
    return toView(
      { ...limits, dailyCoinCap: settled, pendingCap: null, pendingCapAt: null },
      staked,
      now,
    );
  }

  const staked = await stakedToday(prisma, userId, now);
  return toView(limits, staked, now);
}

/**
 * Apply a member's requested change.
 *
 * All of the policy — what tightens, what waits, what can only ever be extended
 * — is in `applyChange`, which is pure and tested on its own. This function is
 * the read-modify-write around it, in a transaction so two concurrent edits
 * cannot interleave and lose one.
 */
export async function updatePlayLimits(
  userId: string,
  change: LimitChange,
  now: Date = new Date(),
): Promise<PlayLimitsView> {
  const view = await prisma.$transaction(async (tx) => {
    const current = (await readPlayLimits(tx, userId)) ?? NO_LIMITS;
    const { next } = applyChange(current, change, now);

    await tx.userPlayLimits.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  });

  return toView(view, await stakedToday(prisma, userId, now), now);
}

/**
 * Is this member self-excluded right now?
 *
 * The one-field question the navigation and search filters ask, kept separate
 * from {@link getPlayLimits} so those callers do not pay for the staked-today
 * aggregate on every render.
 */
export async function isSelfExcluded(userId: string, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.userPlayLimits.findUnique({
    where: { userId },
    select: { selfExcludedUntil: true },
  });
  return !!row?.selfExcludedUntil && row.selfExcludedUntil.getTime() > now.getTime();
}
