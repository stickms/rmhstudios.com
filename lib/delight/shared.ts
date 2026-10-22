/**
 * Shared helpers + types for the delight package (Z2, Z3, Z4, Z6, Z8, Y4).
 * Client-safe and zod-free; the API input schemas are in `./schema`, which
 * re-exports everything here for the routes and server modules.
 */

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dayKey: string, n: number): string {
  return utcDay(new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000));
}

/** Hunt answers match case-insensitively with punctuation and spacing ignored. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const FORTUNE_MAX = 140;

export interface DelightConfig {
  fools: boolean;
  hunt: boolean;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
