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

/* ── look: spacing and border size ───────────────────────────────────────────────────────────────────── */

export const SPACE_PX = [0, 2, 4, 10] as const;
export const BORDER_PX = [0, 1, 2, 4] as const;
export const SPACE_LABELS = ['None', 'Tight', 'Normal', 'Roomy'] as const;
export const BORDER_LABELS = ['None', 'Thin', 'Normal', 'Thick'] as const;

/** Indexes into SPACE_PX / BORDER_PX. */
export interface Look {
  space: number;
  border: number;
}

export const DEFAULT_LOOK: Look = { space: 2, border: 2 };

const idx = (v: unknown, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : fallback;

export function parseLook(raw: string | null | undefined): Look {
  if (!raw) return DEFAULT_LOOK;
  try {
    const v = JSON.parse(raw) as { space?: unknown; border?: unknown };
    return { space: idx(v.space, SPACE_PX.length - 1, DEFAULT_LOOK.space), border: idx(v.border, BORDER_PX.length - 1, DEFAULT_LOOK.border) };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function lookVars(l: Look): Record<string, string> {
  const px = SPACE_PX[l.space] ?? 4;
  return { '--el-room-pad': `${px}px`, '--el-room-gap': `${px}px`, '--el-room-bw': `${BORDER_PX[l.border] ?? 2}px` };
}

/* ── pane order (drag to rearrange; per viewer) ─────────────────────────────────────────────────────── */

/** Apply a saved order: saved ids first (those still present), then any pane the order doesn't know. */
export function orderPanes<T extends { id: string }>(items: T[], saved: string[] | undefined): T[] {
  if (!saved?.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  for (const id of saved) {
    const it = byId.get(id);
    if (it) {
      out.push(it);
      byId.delete(id);
    }
  }
  return [...out, ...byId.values()];
}

/** Swap two panes' positions in an order of ids. Unknown ids leave it unchanged. */
export function swapIds(ids: string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0 || i === j) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Move a pane one step earlier (-1) or later (+1), for the keyboard. */
export function nudgeId(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  return i < 0 || j < 0 || j >= ids.length ? ids : swapIds(ids, id, ids[j]);
}
