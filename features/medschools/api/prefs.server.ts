/**
 * Saved preferences (phase 4, Task 7; ruling Q9: edited on the lists page). One row per user, created by the first `PUT`;
 * a user with no row reads the defaults without one being created. Every read and write is keyed by the caller's id.
 * A stored value the code no longer knows (an enum that changed) reads as the default and never throws.
 */
import { prisma } from '@/lib/prisma.server';
import { CHARTED_TYPES } from '../engine/public-read';
import type { Prefs } from '../engine/prefs';
import { normalizeHomeState } from '../engine/tracker';

export const DEFAULT_PREFS: Prefs = { programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] };

const PROGRAMS: readonly Prefs['programFilter'][] = ['ALL', 'REG', 'PHD'];

/** `CHARTED_TYPES` order, deduplicated, only types the Activity chart draws. */
export function normalizeCategories(v: unknown): Prefs['chartCategories'] {
  const wanted = new Set<unknown>(Array.isArray(v) ? v : []);
  return CHARTED_TYPES.filter((t) => wanted.has(t));
}

export async function getPrefs(userId: string): Promise<Prefs> {
  const row = await prisma.medUserPrefs.findUnique({
    where: { userId },
    select: { programFilter: true, degree: true, homeState: true, chartCategories: true },
  });
  if (!row) return { ...DEFAULT_PREFS, chartCategories: [] };
  const home = normalizeHomeState(row.homeState);
  return {
    programFilter: PROGRAMS.find((p) => p === row.programFilter) ?? 'ALL',
    degree: row.degree === 'MD' || row.degree === 'DO' ? row.degree : null,
    homeState: home === 'invalid' ? null : home,
    chartCategories: normalizeCategories(row.chartCategories),
  };
}

/** Replace the user's preferences (an upsert, so repeating it is idempotent). */
export async function putPrefs(
  userId: string,
  i: {
    programFilter: Prefs['programFilter'];
    degree: Prefs['degree'];
    homeState: string | null;
    chartCategories: readonly string[];
  },
): Promise<Prefs> {
  const home = normalizeHomeState(i.homeState);
  if (home === 'invalid') throw new Error('homeState must be validated by the schema');
  const data = {
    programFilter: i.programFilter,
    degree: i.degree,
    homeState: home,
    chartCategories: normalizeCategories(i.chartCategories),
  };
  await prisma.medUserPrefs.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return getPrefs(userId);
}
