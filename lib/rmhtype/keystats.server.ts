/**
 * RMHType per-key analytics — persistence (design G1).
 *
 * Writes to `RmhTypeKeyStat`, whose primary key is `(userId, key, layout)` and
 * whose columns are three counters. There is no sequence column, no timestamp
 * per keystroke and no bigram table, deliberately: see the module note in
 * `./keystats` — an ordered keystroke store is a keylog, and this feature does
 * not need one to tell you which letters you are slow on.
 *
 * Everything a client sends is folded in with `increment`, never assigned, so a
 * replayed or duplicated request can inflate a counter but can never *replace*
 * one — and no result, score or leaderboard position is derived from this table.
 * RMHType is the one `authoritative: true` entry in `lib/wager/eligible-games.ts`
 * precisely because its match results come from the server; per-key aggregates
 * are self-reported comfort data and are kept strictly out of that path.
 */

import { prisma } from '@/lib/prisma.server';
import {
  DEFAULT_LAYOUT,
  isTypingLayout,
  keyMetrics,
  sanitizeAggregates,
  summarize,
  worstKeys,
  type KeyMetrics,
  type KeyStatAggregate,
  type TypingLayout,
  type TypingSummary,
} from './keystats';

/** Distinct keys one user may accumulate per layout (the whole printable set). */
const MAX_STORED_KEYS = 256;

export function normalizeLayout(value: unknown): TypingLayout {
  return isTypingLayout(value) ? value : DEFAULT_LAYOUT;
}

/**
 * Fold one test's aggregates into the stored profile.
 *
 * Sequential upserts rather than one bulk statement: the payload is bounded to
 * `KEYSTAT_LIMITS.maxKeys` rows (128) by `sanitizeAggregates`, and each is an
 * independent counter, so a partial failure loses a key's increment rather than
 * corrupting the profile. Returns how many keys were touched.
 */
export async function recordKeyStats(
  userId: string,
  layout: TypingLayout,
  aggregates: readonly KeyStatAggregate[],
): Promise<{ keysRecorded: number }> {
  const clean = sanitizeAggregates(aggregates);
  if (clean.length === 0) return { keysRecorded: 0 };

  for (const stat of clean) {
    await prisma.rmhTypeKeyStat.upsert({
      where: { userId_key_layout: { userId, key: stat.key, layout } },
      create: {
        userId,
        key: stat.key,
        layout,
        attempts: stat.attempts,
        errors: stat.errors,
        totalMs: stat.totalMs,
      },
      update: {
        attempts: { increment: stat.attempts },
        errors: { increment: stat.errors },
        totalMs: { increment: stat.totalMs },
      },
    });
  }

  return { keysRecorded: clean.length };
}

export interface KeyStatsView {
  layout: TypingLayout;
  keys: KeyMetrics[];
  worst: KeyMetrics[];
  summary: TypingSummary;
}

/** One layout's analytics for a user, already reduced to what the UI renders. */
export async function getKeyStats(
  userId: string,
  layout: TypingLayout,
  worstLimit = 10,
): Promise<KeyStatsView> {
  const rows = await prisma.rmhTypeKeyStat.findMany({
    where: { userId, layout },
    take: MAX_STORED_KEYS,
    select: { key: true, attempts: true, errors: true, totalMs: true },
  });

  const aggregates: KeyStatAggregate[] = rows.map((row) => ({
    key: row.key,
    attempts: row.attempts,
    errors: row.errors,
    totalMs: row.totalMs,
  }));

  return {
    layout,
    keys: aggregates.map(keyMetrics),
    worst: worstKeys(aggregates, { limit: worstLimit }),
    summary: summarize(aggregates),
  };
}

/** The raw aggregates, for the practice-test generator. */
export async function getKeyAggregates(
  userId: string,
  layout: TypingLayout,
): Promise<KeyStatAggregate[]> {
  const rows = await prisma.rmhTypeKeyStat.findMany({
    where: { userId, layout },
    take: MAX_STORED_KEYS,
    select: { key: true, attempts: true, errors: true, totalMs: true },
  });
  return rows.map((row) => ({
    key: row.key,
    attempts: row.attempts,
    errors: row.errors,
    totalMs: row.totalMs,
  }));
}

/**
 * Erase a layout's analytics.
 *
 * Present from day one because this is behavioural data about a person: a
 * feature that collects it and offers no way to delete it is one the account
 * settings will eventually have to bolt a delete onto anyway.
 */
export async function clearKeyStats(userId: string, layout: TypingLayout): Promise<number> {
  const result = await prisma.rmhTypeKeyStat.deleteMany({ where: { userId, layout } });
  return result.count;
}
