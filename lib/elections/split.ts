/**
 * Split-screen sizing for the Briefing Room. Client-safe and pure.
 *
 * Each layout has up to two draggable dividers: `c` (the column divider, as the left pane's share of the width)
 * and `r` (the row divider, as the top pane's share of the height). Sizes are per viewer, kept in the browser,
 * and clamped so no pane can be dragged shut.
 */

import type { Layout } from './room-config';

export interface Split {
  c: number;
  r: number;
}

export const MIN_SHARE = 0.14;
export const MAX_SHARE = 1 - MIN_SHARE;
export const STEP = 0.02;

export const DEFAULT_SPLIT: Record<Layout, Split> = {
  '1': { c: 0.5, r: 0.5 },
  '2h': { c: 0.5, r: 0.5 },
  '2v': { c: 0.5, r: 0.5 },
  '3l': { c: 0.62, r: 0.5 },
  '4': { c: 0.5, r: 0.5 },
};

export const clampShare = (n: number): number => (Number.isFinite(n) ? Math.min(MAX_SHARE, Math.max(MIN_SHARE, n)) : 0.5);

/** Which dividers a layout has: a column divider, and/or a row divider (`rowsOnRight`: only in the right column). */
export function dividers(layout: Layout): { col: boolean; row: boolean; rowsOnRight: boolean } {
  switch (layout) {
    case '2h':
      return { col: true, row: false, rowsOnRight: false };
    case '2v':
      return { col: false, row: true, rowsOnRight: false };
    case '3l':
      return { col: true, row: true, rowsOnRight: true };
    case '4':
      return { col: true, row: true, rowsOnRight: false };
    default:
      return { col: false, row: false, rowsOnRight: false };
  }
}

/** A pointer coordinate inside a track area → the share it implies (accounting for padding and the gap). */
export function shareFromPointer(pos: number, start: number, size: number, pad: number, gap: number): number {
  const inner = size - 2 * pad - gap;
  if (inner <= 0) return 0.5;
  return clampShare((pos - start - pad - gap / 2) / inner);
}

/** Read saved sizes defensively; anything unexpected falls back to the layout's default. */
export function parseSplits(raw: string | null | undefined): Partial<Record<Layout, Split>> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<Layout, Split>> = {};
    for (const k of Object.keys(DEFAULT_SPLIT) as Layout[]) {
      const s = v[k] as { c?: unknown; r?: unknown } | undefined;
      if (s && typeof s.c === 'number' && typeof s.r === 'number') out[k] = { c: clampShare(s.c), r: clampShare(s.r) };
    }
    return out;
  } catch {
    return {};
  }
}

/** CSS custom properties for a split: the two track weights per axis (weights, not fractions: fr sums < 1 shrink). */
export function splitVars(s: Split): Record<string, string> {
  return {
    '--c': String(s.c),
    '--r': String(s.r),
    '--cA': `${Math.round(s.c * 1000)}fr`,
    '--cB': `${Math.round((1 - s.c) * 1000)}fr`,
    '--rA': `${Math.round(s.r * 1000)}fr`,
    '--rB': `${Math.round((1 - s.r) * 1000)}fr`,
  };
}
