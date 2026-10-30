/**
 * Trading cards: granting drops, reading an inventory, crafting badges.
 * The rules live in `cards.ts` (pure); this module applies them in transactions.
 * No coins move here, so nothing goes through the ledger; crafting awards XP.
 */

import { prisma } from '@/lib/prisma.server';
import { awardXp } from '@/lib/xp/engine.server';
import { isTrackableTitle } from '@/lib/games/route-match';
import {
  MAX_DROPS_PER_TITLE,
  SET_SIZE,
  cardName,
  dropForIndex,
  dropsEarned,
  planCraft,
} from '@/lib/cards/cards';
import type {
  BadgeView,
  CardStack,
  CraftResult,
  GrantedDrop,
  TitleCards,
} from '@/lib/cards/types';

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}

/**
 * Grant every drop this title has earned and the user has not yet received.
 * Safe to call on every heartbeat: the `(user, title, dropIndex)` primary key makes
 * a drop happen once, however many calls race.
 */
export async function grantDueDrops(userId: string, gameId: string): Promise<GrantedDrop[]> {
  if (!isTrackableTitle(gameId)) return [];
  const play = await prisma.gamePlaytime.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { totalSeconds: true },
  });
  const earned = dropsEarned(play?.totalSeconds ?? 0);
  if (earned === 0) return [];

  const existing = await prisma.cardDrop.findMany({
    where: { userId, gameId },
    select: { dropIndex: true },
  });
  const have = new Set(existing.map((d) => d.dropIndex));
  const granted: GrantedDrop[] = [];

  for (let k = 0; k < earned; k++) {
    if (have.has(k)) continue;
    const { cardIndex, foil } = dropForIndex(userId, gameId, k);
    try {
      // The drop row goes first: if another request already granted this drop, its
      // primary key refuses the create and the card is never added a second time.
      await prisma.$transaction(async (tx) => {
        await tx.cardDrop.create({ data: { userId, gameId, dropIndex: k, cardIndex, foil } });
        await tx.userCard.upsert({
          where: { userId_gameId_cardIndex_foil: { userId, gameId, cardIndex, foil } },
          create: { userId, gameId, cardIndex, foil, count: 1 },
          update: { count: { increment: 1 } },
        });
      });
      granted.push({ gameId, cardIndex, foil, name: cardName(gameId, cardIndex) });
    } catch (e) {
      // Another request granted this drop first: the key did its job.
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return granted;
}

export async function listCards(userId: string): Promise<CardStack[]> {
  const rows = await prisma.userCard.findMany({
    where: { userId },
    orderBy: [{ gameId: 'asc' }, { cardIndex: 'asc' }],
    select: { gameId: true, cardIndex: true, foil: true, count: true },
  });
  return rows;
}

export async function listBadges(userId: string): Promise<BadgeView[]> {
  const rows = await prisma.gameBadge.findMany({
    where: { userId },
    orderBy: [{ craftedAt: 'desc' }],
    select: { gameId: true, foil: true, level: true },
  });
  return rows;
}

function countsFor(rows: { cardIndex: number; foil: boolean; count: number }[], foil: boolean) {
  const out = Array<number>(SET_SIZE).fill(0);
  for (const r of rows) if (r.foil === foil && r.cardIndex < SET_SIZE) out[r.cardIndex] = r.count;
  return out;
}

/** One title's card state for the game page. */
export async function getTitleCards(userId: string, gameId: string): Promise<TitleCards | null> {
  if (!isTrackableTitle(gameId)) return null;
  const [cards, drops, badges, play] = await Promise.all([
    prisma.userCard.findMany({
      where: { userId, gameId },
      select: { cardIndex: true, foil: true, count: true },
    }),
    prisma.cardDrop.count({ where: { userId, gameId } }),
    prisma.gameBadge.findMany({ where: { userId, gameId }, select: { foil: true, level: true } }),
    prisma.gamePlaytime.findUnique({
      where: { userId_gameId: { userId, gameId } },
      select: { totalSeconds: true },
    }),
  ]);
  const owned = countsFor(cards, false);
  const foilOwned = countsFor(cards, true);
  const level = badges.find((b) => !b.foil)?.level ?? 0;
  const foilBadge = badges.some((b) => b.foil);
  return {
    owned,
    foilOwned,
    dropsEarned: dropsEarned(play?.totalSeconds ?? 0),
    dropsGranted: drops,
    dropsRemaining: Math.max(0, MAX_DROPS_PER_TITLE - drops),
    badgeLevel: level,
    foilBadge,
    canCraft: planCraft({ counts: owned, level, foil: false }).ok,
    canCraftFoil: planCraft({ counts: foilOwned, level: foilBadge ? 1 : 0, foil: true }).ok,
  };
}

class CraftRefused extends Error {
  constructor(readonly reason: 'missing-cards' | 'max-level') {
    super(reason);
  }
}

/**
 * Craft (or level) a title's badge: one transaction, under the user's advisory lock,
 * that re-reads the stack, refuses if a card is missing, spends one of each and
 * levels the badge. Two concurrent crafts therefore cannot spend the same cards.
 */
export async function craftBadge(
  userId: string,
  gameId: string,
  foil: boolean,
): Promise<CraftResult> {
  if (!isTrackableTitle(gameId)) return { ok: false, reason: 'unknown-title' };
  let result: { level: number; xp: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cards:' + userId}))`;
      const [cards, badge] = await Promise.all([
        tx.userCard.findMany({
          where: { userId, gameId, foil },
          select: { cardIndex: true, count: true },
        }),
        tx.gameBadge.findUnique({
          where: { userId_gameId_foil: { userId, gameId, foil } },
          select: { level: true },
        }),
      ]);
      const counts = Array<number>(SET_SIZE).fill(0);
      for (const c of cards) if (c.cardIndex < SET_SIZE) counts[c.cardIndex] = c.count;
      const plan = planCraft({ counts, level: badge?.level ?? 0, foil });
      if (!plan.ok) throw new CraftRefused(plan.reason);

      for (let i = 0; i < SET_SIZE; i++) {
        if (counts[i] === 1) {
          await tx.userCard.delete({
            where: { userId_gameId_cardIndex_foil: { userId, gameId, cardIndex: i, foil } },
          });
        } else {
          await tx.userCard.update({
            where: { userId_gameId_cardIndex_foil: { userId, gameId, cardIndex: i, foil } },
            data: { count: { decrement: 1 } },
          });
        }
      }
      await tx.gameBadge.upsert({
        where: { userId_gameId_foil: { userId, gameId, foil } },
        create: { userId, gameId, foil, level: plan.newLevel },
        update: { level: plan.newLevel },
      });
      return { level: plan.newLevel, xp: plan.xp };
    });
  } catch (e) {
    if (e instanceof CraftRefused) return { ok: false, reason: e.reason };
    throw e;
  }
  // Best-effort and outside the transaction, like every other XP award.
  await awardXp(userId, result.xp);
  return { ok: true, level: result.level, foil, xp: result.xp };
}
