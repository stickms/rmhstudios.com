/**
 * Response shapes and input rules for the v1 games endpoints: the catalogue,
 * a member's playtime and per-day minutes, and their achievements.
 *
 * Everything here is pure (no Prisma), so the shapes and the date and cursor
 * rules are unit-tested without a database. The queries that feed them live in
 * `lib/api/games-data.server.ts`.
 */

import { z } from 'zod';
import { games, type GameInfo } from '@/lib/catalog';
import { API_BASE_URL } from '@/lib/api/registry';
import { capabilitiesFor } from '@/lib/game-capabilities';
import { ACHIEVEMENT_GROUP_BY_GAME_ID } from '@/lib/games/achievement-groups';
import type { AchievementDef } from '@/lib/achievements/catalog';

const DAY_MS = 86_400_000;

/** Longest `from`..`to` window the per-day endpoint answers, inclusive. */
export const MAX_DAYS_RANGE = 90;
/** Window the per-day endpoint covers when `from` is omitted. */
export const DEFAULT_DAYS_RANGE = 30;

// ─── Catalogue ──────────────────────────────────────────────────────────────

export interface ApiCatalogGame {
  id: string;
  title: string;
  description: string;
  href: string;
  multiplayer: boolean;
  tags: string[];
}

/** A listed title that lives on this site: the only kind the catalogue exposes. */
export function isPublicCatalogGame(g: GameInfo): boolean {
  return !g.unlisted && g.href.startsWith('/');
}

function isMultiplayer(gameId: string): boolean {
  const players = capabilitiesFor(gameId)?.players ?? [];
  return players.some((p) => p === 'online-versus' || p === 'online-coop');
}

export function serializeCatalogGame(g: GameInfo): ApiCatalogGame {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    href: `${API_BASE_URL}${g.href}`,
    multiplayer: isMultiplayer(g.id),
    tags: [...g.tags],
  };
}

/** The catalogue in display order. */
export function listCatalogGames(source: readonly GameInfo[] = games): ApiCatalogGame[] {
  return source
    .filter(isPublicCatalogGame)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(serializeCatalogGame);
}

// ─── Playtime ───────────────────────────────────────────────────────────────

export interface PlaytimeRow {
  gameId: string;
  totalSeconds: number;
  lastPlayedAt: Date;
}

export interface PlaytimeDayRow {
  gameId: string;
  day: Date;
  seconds: number;
}

export interface ApiPlaytime {
  gameId: string;
  totalMinutes: number;
  lastPlayedAt: string;
  minutesLast7Days: number;
  minutesLast30Days: number;
}

export function secondsToMinutes(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

/** UTC calendar day of `d`, as the `@db.Date` columns store it. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `YYYY-MM-DD` of a UTC day. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First UTC day of the trailing `n`-day window that ends today (today counts). */
export function windowStart(now: Date, n: number): Date {
  return new Date(utcDay(now).getTime() - (n - 1) * DAY_MS);
}

/**
 * One entry per played title, most recently played first. The 7 and 30 day
 * figures come from the per-day rows; a title with no recent days reports 0.
 */
export function serializePlaytime(
  rows: readonly PlaytimeRow[],
  days: readonly PlaytimeDayRow[],
  now: Date,
): ApiPlaytime[] {
  const from7 = windowStart(now, 7).getTime();
  const from30 = windowStart(now, 30).getTime();
  const seven = new Map<string, number>();
  const thirty = new Map<string, number>();
  for (const d of days) {
    const t = d.day.getTime();
    if (t >= from30) thirty.set(d.gameId, (thirty.get(d.gameId) ?? 0) + d.seconds);
    if (t >= from7) seven.set(d.gameId, (seven.get(d.gameId) ?? 0) + d.seconds);
  }
  return rows
    .slice()
    .sort((a, b) => b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime())
    .map((r) => ({
      gameId: r.gameId,
      totalMinutes: secondsToMinutes(r.totalSeconds),
      lastPlayedAt: r.lastPlayedAt.toISOString(),
      minutesLast7Days: secondsToMinutes(seven.get(r.gameId) ?? 0),
      minutesLast30Days: secondsToMinutes(thirty.get(r.gameId) ?? 0),
    }));
}

// ─── Per-day minutes ────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date, YYYY-MM-DD.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && dayKey(d) === s;
  }, 'Not a real calendar date.');

export const daysQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type DayRange =
  | {
      ok: true;
      from: Date;
      to: Date;
    }
  | {
      ok: false;
      message: string;
    };

/**
 * The UTC days a request covers. `to` defaults to today and `from` to 30 days
 * before it (inclusive); the window may not run backwards or span more than
 * {@link MAX_DAYS_RANGE} days.
 */
export function resolveDayRange(
  q: {
    from?: string | undefined;
    to?: string | undefined;
  },
  now: Date,
): DayRange {
  const to = q.to ? new Date(`${q.to}T00:00:00.000Z`) : utcDay(now);
  const from = q.from
    ? new Date(`${q.from}T00:00:00.000Z`)
    : new Date(to.getTime() - (DEFAULT_DAYS_RANGE - 1) * DAY_MS);
  if (from.getTime() > to.getTime())
    return {
      ok: false,
      message: '`from` must not be after `to`.',
    };
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (span > MAX_DAYS_RANGE) {
    return {
      ok: false,
      message: `The range may cover at most ${MAX_DAYS_RANGE} days.`,
    };
  }
  return {
    ok: true,
    from,
    to,
  };
}

export interface ApiPlaytimeDay {
  date: string;
  minutes: number;
}

/** Every day in the range, in order, with 0 for a day nothing was played. */
export function serializeDays(
  rows: readonly {
    day: Date;
    seconds: number;
  }[],
  from: Date,
  to: Date,
): ApiPlaytimeDay[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(dayKey(r.day), (byDay.get(dayKey(r.day)) ?? 0) + r.seconds);
  const out: ApiPlaytimeDay[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const date = dayKey(new Date(t));
    out.push({
      date,
      minutes: secondsToMinutes(byDay.get(date) ?? 0),
    });
  }
  return out;
}

// ─── Achievements ───────────────────────────────────────────────────────────

const gameIdParam = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const achievementsQuerySchema = z.object({
  gameId: gameIdParam.optional(),
});

export interface UnlockedAchievementRow {
  id: string;
  achievementId: string;
  unlockedAt: Date;
}

export interface ApiAchievement {
  id: string;
  gameId: string | null;
  title: string;
  unlockedAt: string;
  rarityPercent: number | null;
}

const GAME_ID_BY_GROUP = new Map(
  Object.entries(ACHIEVEMENT_GROUP_BY_GAME_ID).map(([gameId, group]) => [group, gameId]),
);

/** Catalogue id of the title an achievement belongs to, when it belongs to one. */
export function achievementGameId(def: Pick<AchievementDef, 'group'>): string | null {
  return def.group ? (GAME_ID_BY_GROUP.get(def.group) ?? null) : null;
}

/** A holder fraction (0-1) as a percentage with two decimals; null when not computed. */
export function rarityPercent(pct: number | undefined): number | null {
  if (pct === undefined || !Number.isFinite(pct) || pct < 0) return null;
  return Math.round(pct * 10_000) / 100;
}

/**
 * The shape of one unlocked achievement. Secret achievements are never passed
 * in (the query excludes them), and this refuses one anyway so a loosened query
 * cannot leak it.
 */
export function serializeAchievement(
  row: UnlockedAchievementRow,
  def: AchievementDef,
  pct: number | undefined,
): ApiAchievement | null {
  if (def.secret) return null;
  return {
    id: row.achievementId,
    gameId: achievementGameId(def),
    title: def.name,
    unlockedAt: row.unlockedAt.toISOString(),
    rarityPercent: rarityPercent(pct),
  };
}

/** Keyset cursor over (`unlockedAt` desc, `id` desc). */
export function encodeAchievementCursor(row: { id: string; unlockedAt: Date }): string {
  return Buffer.from(`${row.unlockedAt.getTime()}:${row.id}`).toString('base64url');
}

export function parseAchievementCursor(raw: string | null): {
  unlockedAt: Date;
  id: string;
} | null {
  if (!raw) return null;
  const text = Buffer.from(raw, 'base64url').toString();
  const m = /^(\d{1,15}):([A-Za-z0-9_-]{1,64})$/.exec(text);
  if (!m) return null;
  const ms = Number(m[1]);
  const at = new Date(ms);
  if (Number.isNaN(at.getTime())) return null;
  return {
    unlockedAt: at,
    id: m[2],
  };
}
