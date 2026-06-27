import type { ColorName, GameMode, RunConfig } from './types';

/** Virtual play-field — the renderer maps these world units into the 3D scene. */
export const FIELD_WIDTH = 600;
export const FIELD_HEIGHT = 480;

/** Cozy-but-rich wash palette (hex used by the renderer's voxel materials). */
export const COLOR_HEX: Record<ColorName, number> = {
  red: 0xff6b6b,
  blue: 0x4d96ff,
  yellow: 0xffd166,
  green: 0x63d471,
  purple: 0xb085f5,
  orange: 0xff9f5a,
};

/** CSS strings for HUD swatches / bin labels. */
export const COLOR_CSS: Record<ColorName, string> = {
  red: '#ff6b6b',
  blue: '#4d96ff',
  yellow: '#ffd166',
  green: '#63d471',
  purple: '#b085f5',
  orange: '#ff9f5a',
};

/** Colours are unlocked in this order as difficulty / colorCount grows. */
export const COLOR_ORDER: ColorName[] = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];

export const CLOTHING_TYPES = ['shirt', 'pants', 'sock', 'towel'] as const;

// ── Physics tuning (fixed-timestep units are per-second) ──────────────────────
export const GRAVITY = 520; // world units / s²
export const AIR_DRAG = 0.86; // velocity retention per second
export const WALL_BOUNCE = 0.38;
export const FLOOR_BOUNCE = 0.32;
export const FIXED_DT = 1 / 120; // deterministic sim step

// ── Scoring ───────────────────────────────────────────────────────────────────
export const BASE_POINTS = 100;
export const WRONG_PENALTY = 60;
/** Combo multiplier caps at this; grows every Cm sorts. */
export const MAX_MULTIPLIER = 8;
export const COMBO_PER_STEP = 4; // sorts needed to bump the multiplier
/** Streak length that fully ignites the flame VFX. */
export const STREAK_MAX_HEAT = 12;

// ── Bin geometry ───────────────────────────────────────────────────────────────
export const BIN_HEIGHT = 92;
export const BIN_Y = FIELD_HEIGHT - BIN_HEIGHT / 2;

/** Per-mode defaults. Ranked overrides seed + duration from the server. */
export const MODE_CONFIG: Record<GameMode, Omit<RunConfig, 'seed'>> = {
  'time-attack': { mode: 'time-attack', durationSec: 60, width: FIELD_WIDTH, height: FIELD_HEIGHT, colorCount: 4 },
  endless: { mode: 'endless', durationSec: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT, colorCount: 4 },
  daily: { mode: 'daily', durationSec: 90, width: FIELD_WIDTH, height: FIELD_HEIGHT, colorCount: 5 },
  ranked: { mode: 'ranked', durationSec: 75, width: FIELD_WIDTH, height: FIELD_HEIGHT, colorCount: 4 },
};

/** Human-facing mode metadata for the mode-select screen. */
export const MODE_META: Record<GameMode, { titleKey: string; descKey: string; icon: string }> = {
  'time-attack': { titleKey: 'mode-time-attack', descKey: 'mode-time-attack-desc', icon: '⏱️' },
  endless: { titleKey: 'mode-endless', descKey: 'mode-endless-desc', icon: '♾️' },
  daily: { titleKey: 'mode-daily', descKey: 'mode-daily-desc', icon: '☀️' },
  ranked: { titleKey: 'mode-ranked', descKey: 'mode-ranked-desc', icon: '🏆' },
};
