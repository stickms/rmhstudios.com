/**
 * Slice It — skins, seasonal treatment and the cosmetic-only guarantee.
 *
 * `V1` (note/playfield skins), `V4` (cover-derived palettes), `V6` (unlocks)
 * and `V11` (seasonal presentation). Pure and browser-free: a skin is data, so
 * the renderer resolves it once per run rather than branching per frame, and
 * the whole set can be validated without a canvas.
 */

import { LANE_PALETTES, type LanePalette, contrastRatio } from './palettes';

export interface Skin {
  id: string;
  /** Palette id from `palettes.ts`, or `'cover'` for V4's extracted pair. */
  palette: string;
  noteShape: 'pill' | 'circle' | 'bar' | 'arrow';
  judgementLine: 'solid' | 'glow' | 'inset';
  hitBurst: 'particles' | 'ring' | 'none';
  /**
   * Whether the skin keeps the neumorphic double shadow.
   *
   * A skin that drops it is a deliberate flat look, not a broken one — but it
   * has to SAY so, because the renderer decides how much shadow work to do from
   * this and a silently-flat skin would just look like the glow tier failing.
   */
  neumorphic: boolean;
  /** How this skin is obtained. `null` means everyone has it. */
  unlock: null | { kind: 'achievement' | 'coins' | 'pass'; ref: string };
}

export const SKINS: Record<string, Skin> = {
  default: {
    id: 'default',
    palette: 'default',
    noteShape: 'pill',
    judgementLine: 'inset',
    hitBurst: 'particles',
    neumorphic: true,
    unlock: null,
  },
  minimal: {
    id: 'minimal',
    palette: 'monochrome',
    noteShape: 'bar',
    judgementLine: 'solid',
    hitBurst: 'none',
    neumorphic: false,
    unlock: null,
  },
  neon: {
    id: 'neon',
    palette: 'deuteranopia',
    noteShape: 'circle',
    judgementLine: 'glow',
    hitBurst: 'ring',
    neumorphic: false,
    unlock: { kind: 'achievement', ref: 'game.slice_it.full_combo' },
  },
  cover: {
    id: 'cover',
    palette: 'cover',
    noteShape: 'pill',
    judgementLine: 'glow',
    hitBurst: 'particles',
    neumorphic: true,
    unlock: { kind: 'coins', ref: 'slice-skin-cover' },
  },
};

export function resolveSkin(id: string | null | undefined): Skin {
  if (!id) return SKINS.default;
  return SKINS[id] ?? SKINS.default;
}

/* ─── V6 — the cosmetic-only guarantee ───────────────────────────────────── */

/**
 * Properties a purchasable or unlockable item may never touch.
 *
 * A shop item that changes what a player can SEE about incoming notes is a
 * purchasable advantage, and a purchasable advantage is the end of a skill
 * game's leaderboard. Scroll speed, lane cover, note size and the visibility
 * mods stay free for everyone, permanently.
 *
 * Enforced rather than documented, because "cosmetics only" is the kind of rule
 * that erodes one well-meaning item at a time.
 */
const GAMEPLAY_AFFECTING = [
  'scrollSpeed',
  'scrollMode',
  'laneCoverHeight',
  'linePosition',
  'noteSize',
  'visibilityMode',
  'timingWindow',
  'judgementWindow',
  'approachSeconds',
] as const;

export class CosmeticOnlyViolation extends Error {}

/** Throws if an item's effects reach anything in {@link GAMEPLAY_AFFECTING}. */
export function assertCosmeticOnly(itemId: string, effects: Record<string, unknown>): void {
  const offending = GAMEPLAY_AFFECTING.filter((key) => key in effects);
  if (offending.length > 0) {
    throw new CosmeticOnlyViolation(
      `Shop item "${itemId}" affects gameplay (${offending.join(', ')}). ` +
        'Slice It cosmetics may never change what a player can see about incoming notes.',
    );
  }
}

/* ─── V4 — a lane pair derived from the cover art ────────────────────────── */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Turn a cover's dominant colour into a usable lane pair.
 *
 * Extracted colours are a SUGGESTION, not a palette. Two lanes 20 degrees apart
 * in hue are indistinguishable mid-run for anyone and unusable for a dichromat,
 * so the second lane is forced to a complementary hue and pushed away in
 * lightness until the pair clears the same contrast bar `A3`'s palettes do.
 */
export function coverLanePair(dominant: Hsl): [string, string] {
  const a: Hsl = { ...dominant, l: clamp(dominant.l, 0.35, 0.7) };
  let b: Hsl = {
    h: (a.h + 150) % 360,
    s: clamp(a.s, 0.35, 0.9),
    l: a.l > 0.5 ? clamp(a.l - 0.3, 0.15, 0.5) : clamp(a.l + 0.3, 0.5, 0.85),
  };

  // Push apart until readable. Bounded rather than a while(true): a pathological
  // input must degrade to the default palette instead of spinning.
  for (let i = 0; i < 8 && contrastRatio(hslToHex(a), hslToHex(b)) < 1.6; i++) {
    b = { ...b, l: b.l > a.l ? clamp(b.l + 0.06, 0, 1) : clamp(b.l - 0.06, 0, 1) };
  }

  const pair: [string, string] = [hslToHex(a), hslToHex(b)];
  if (contrastRatio(pair[0], pair[1]) < 1.6) {
    // Gave up: a cover that cannot produce a readable pair gets the default
    // rather than an unreadable playfield.
    return [LANE_PALETTES.default.lanes[0], LANE_PALETTES.default.lanes[1]];
  }
  return pair;
}

/** A `LanePalette` built from cover art, with the default's bomb colour. */
export function coverPalette(dominant: Hsl): LanePalette {
  const [first, second] = coverLanePair(dominant);
  return {
    id: 'cover',
    lanes: [first, second],
    // The bomb keeps the default red rather than being derived: it is the one
    // object whose meaning must not change with the album art.
    bomb: LANE_PALETTES.default.bomb,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/* ─── V11 — seasonal treatment ───────────────────────────────────────────── */

export type Season = 'none' | 'winter' | 'spring' | 'summer' | 'autumn';

/**
 * The season for a date, in UTC.
 *
 * Deliberately does NOT change the neumorphic geometry — only the accent
 * tokens. A season that alters the shadow depth stops the game looking like
 * itself, which is a different thing from decorating it.
 */
export function seasonFor(date: Date): Season {
  const month = date.getUTCMonth();
  if (month === 11 || month === 0 || month === 1) return 'winter';
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  return 'autumn';
}
