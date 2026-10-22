/**
 * The globe cursor's settings: one plain object, persisted per device in
 * localStorage (`stores/globeCursorStore.ts`), read by the lazy renderer
 * (`lib/globe-cursor/engine.ts`) and edited on Settings → Appearance.
 *
 * Client-safe and dependency-free on purpose: the root mounts a tiny gate that
 * imports this file on every page, and everything heavy (the Thurston eversion,
 * the canvas engine) hangs off a dynamic import behind it.
 *
 * `sanitizeGlobeCursor` is the only way a stored value becomes settings. A
 * corrupt, partial or older payload never throws and never yields NaN: every
 * field falls back to its default or is clamped into range, so a bad write on
 * one device cannot break the pointer on the next page load.
 */

export const GLOBE_CURSOR_KEY = 'rmh-globe-cursor';

export const EVERT_MODES = ['loop', 'pingpong', 'breathe'] as const;
export type EvertMode = (typeof EVERT_MODES)[number];

export const CURSOR_PALETTES = ['duo', 'rainbow', 'checker', 'aurora'] as const;
export type CursorPalette = (typeof CURSOR_PALETTES)[number];

export const CURSOR_STYLES = ['solid', 'glass', 'wire', 'dots'] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];

export const CURSOR_DETAILS = ['low', 'medium', 'high'] as const;
export type CursorDetail = (typeof CURSOR_DETAILS)[number];

export const CURSOR_BLENDS = ['normal', 'screen', 'multiply', 'difference', 'exclusion'] as const;
export type CursorBlend = (typeof CURSOR_BLENDS)[number];

export interface GlobeCursorSettings {
  enabled: boolean;
  /** Diameter of the resting sphere, CSS px. */
  size: number;
  /** Eversion speed multiplier; 1 = one eversion every `BASE_EVERT_SECONDS`. */
  speed: number;
  mode: EvertMode;
  /** Share of each cycle held at the round sphere, 0–0.6. */
  dwell: number;
  /** How much pointer speed accelerates the eversion, 0–1. */
  motionBoost: number;
  /** Spin about the vertical axis, deg/s (negative spins the other way). */
  spin: number;
  /** Fixed forward tilt, degrees. */
  tilt: number;
  /** Roll like a ball in the direction of travel. */
  roll: boolean;
  /** 0 = rigid, 1 = maximum wobble, squash and stretch. */
  jelly: number;
  /** 0 = glued to the pointer, 1 = floats far behind it. */
  lag: number;
  clickSquish: boolean;
  /** Scale over links and buttons, 1–2. */
  hoverGrow: number;
  palette: CursorPalette;
  outside: string;
  inside: string;
  /** Hue drift, deg/s. */
  hueDrift: number;
  /** Saturation multiplier, 0–2. */
  vibrance: number;
  /** Glow strength, 0–1. */
  glow: number;
  /** Glow colour; null = follow the colour currently facing out. */
  glowColor: string | null;
  opacity: number;
  style: CursorStyle;
  detail: CursorDetail;
  /** Specular highlight, 0–1. */
  shine: number;
  /** Ghost echoes behind the globe, 0–10. */
  trail: number;
  sparkles: boolean;
  ripples: boolean;
  /** A crisp dot at the exact hotspot, so precision never depends on the lag. */
  hotspot: boolean;
  hideNative: boolean;
  /** Keep the I-beam over text fields (the globe shrinks beside it). */
  nativeOverText: boolean;
  /** Over a <canvas> (games draw their own cursors) show the native one instead. */
  honourCanvas: boolean;
  blend: CursorBlend;
}

/** Seconds for one full eversion at speed 1. */
export const BASE_EVERT_SECONDS = 6;

export const DEFAULT_GLOBE_CURSOR: GlobeCursorSettings = {
  enabled: true,
  size: 34,
  speed: 1,
  mode: 'loop',
  dwell: 0.15,
  motionBoost: 0.35,
  spin: 40,
  tilt: 18,
  roll: true,
  jelly: 0.55,
  lag: 0.12,
  clickSquish: true,
  hoverGrow: 1.35,
  palette: 'duo',
  outside: '#4f8cff',
  inside: '#ff5fa2',
  hueDrift: 0,
  vibrance: 1.2,
  glow: 0.45,
  glowColor: null,
  opacity: 1,
  style: 'solid',
  detail: 'medium',
  shine: 0.6,
  trail: 0,
  sparkles: false,
  ripples: true,
  hotspot: true,
  hideNative: true,
  nativeOverText: true,
  honourCanvas: true,
  blend: 'normal',
};

/** Numeric ranges, shared by the sanitizer and the settings sliders. */
export const RANGES = {
  size: { min: 16, max: 96, step: 1 },
  speed: { min: 0.1, max: 4, step: 0.05 },
  dwell: { min: 0, max: 0.6, step: 0.01 },
  motionBoost: { min: 0, max: 1, step: 0.01 },
  spin: { min: -360, max: 360, step: 5 },
  tilt: { min: -60, max: 60, step: 1 },
  jelly: { min: 0, max: 1, step: 0.01 },
  lag: { min: 0, max: 1, step: 0.01 },
  hoverGrow: { min: 1, max: 2, step: 0.05 },
  hueDrift: { min: 0, max: 180, step: 1 },
  vibrance: { min: 0, max: 2, step: 0.05 },
  glow: { min: 0, max: 1, step: 0.01 },
  opacity: { min: 0.2, max: 1, step: 0.01 },
  shine: { min: 0, max: 1, step: 0.01 },
  trail: { min: 0, max: 10, step: 1 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

export type RangedKey = keyof typeof RANGES;

const HEX = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Turn any stored value into complete, in-range settings. Never throws. */
export function sanitizeGlobeCursor(raw: unknown): GlobeCursorSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: GlobeCursorSettings = { ...DEFAULT_GLOBE_CURSOR };
  const mutable = out as unknown as Record<string, unknown>;

  for (const key of Object.keys(RANGES) as RangedKey[]) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const { min, max } = RANGES[key];
      mutable[key] = Math.min(max, Math.max(min, v));
    }
  }
  out.trail = Math.round(out.trail);

  for (const key of [
    'enabled',
    'roll',
    'clickSquish',
    'sparkles',
    'ripples',
    'hotspot',
    'hideNative',
    'nativeOverText',
    'honourCanvas',
  ] as const) {
    if (typeof src[key] === 'boolean') out[key] = src[key] as boolean;
  }

  out.mode = pick(EVERT_MODES, src.mode, out.mode);
  out.palette = pick(CURSOR_PALETTES, src.palette, out.palette);
  out.style = pick(CURSOR_STYLES, src.style, out.style);
  out.detail = pick(CURSOR_DETAILS, src.detail, out.detail);
  out.blend = pick(CURSOR_BLENDS, src.blend, out.blend);

  if (typeof src.outside === 'string' && HEX.test(src.outside)) out.outside = src.outside;
  if (typeof src.inside === 'string' && HEX.test(src.inside)) out.inside = src.inside;
  if (src.glowColor === null) out.glowColor = null;
  else if (typeof src.glowColor === 'string' && HEX.test(src.glowColor))
    out.glowColor = src.glowColor;

  return out;
}

export const GLOBE_CURSOR_PRESETS = [
  'classic',
  'neon',
  'jelly',
  'ghost',
  'prism',
  'minimal',
] as const;
export type GlobeCursorPreset = (typeof GLOBE_CURSOR_PRESETS)[number];

/** Presets are patches over the defaults; `enabled` and the behaviour toggles are left alone. */
export const PRESET_PATCHES: Record<GlobeCursorPreset, Partial<GlobeCursorSettings>> = {
  classic: {
    size: 34,
    speed: 1,
    mode: 'loop',
    dwell: 0.15,
    motionBoost: 0.35,
    spin: 40,
    tilt: 18,
    roll: true,
    jelly: 0.55,
    lag: 0.12,
    hoverGrow: 1.35,
    palette: 'duo',
    outside: '#4f8cff',
    inside: '#ff5fa2',
    hueDrift: 0,
    vibrance: 1.2,
    glow: 0.45,
    glowColor: null,
    opacity: 1,
    style: 'solid',
    shine: 0.6,
    trail: 0,
    sparkles: false,
    ripples: true,
    blend: 'normal',
  },
  neon: {
    size: 38,
    speed: 1.4,
    mode: 'loop',
    dwell: 0.05,
    motionBoost: 0.6,
    spin: 90,
    tilt: 24,
    roll: true,
    jelly: 0.5,
    lag: 0.15,
    hoverGrow: 1.5,
    palette: 'duo',
    outside: '#00f0ff',
    inside: '#ff00c8',
    hueDrift: 20,
    vibrance: 2,
    glow: 1,
    glowColor: null,
    opacity: 1,
    style: 'glass',
    shine: 0.9,
    trail: 4,
    sparkles: true,
    ripples: true,
    blend: 'normal',
  },
  jelly: {
    size: 44,
    speed: 0.8,
    mode: 'pingpong',
    dwell: 0.2,
    motionBoost: 0.3,
    spin: 25,
    tilt: 12,
    roll: true,
    jelly: 1,
    lag: 0.45,
    hoverGrow: 1.6,
    palette: 'duo',
    outside: '#7dff9a',
    inside: '#ffcf4d',
    hueDrift: 0,
    vibrance: 1.4,
    glow: 0.4,
    glowColor: null,
    opacity: 0.95,
    style: 'solid',
    shine: 1,
    trail: 0,
    sparkles: false,
    ripples: true,
    blend: 'normal',
  },
  ghost: {
    size: 40,
    speed: 0.6,
    mode: 'breathe',
    dwell: 0,
    motionBoost: 0.2,
    spin: 20,
    tilt: 30,
    roll: false,
    jelly: 0.35,
    lag: 0.3,
    hoverGrow: 1.25,
    palette: 'aurora',
    outside: '#d6e4ff',
    inside: '#8a7dff',
    hueDrift: 0,
    vibrance: 0.6,
    glow: 0.7,
    glowColor: '#b9c8ff',
    opacity: 0.55,
    style: 'glass',
    shine: 0.4,
    trail: 8,
    sparkles: false,
    ripples: false,
    blend: 'screen',
  },
  prism: {
    size: 36,
    speed: 1.1,
    mode: 'loop',
    dwell: 0.1,
    motionBoost: 0.5,
    spin: 60,
    tilt: 20,
    roll: true,
    jelly: 0.6,
    lag: 0.12,
    hoverGrow: 1.4,
    palette: 'rainbow',
    outside: '#ff4d4d',
    inside: '#4d7dff',
    hueDrift: 45,
    vibrance: 1.6,
    glow: 0.6,
    glowColor: null,
    opacity: 1,
    style: 'solid',
    shine: 0.7,
    trail: 2,
    sparkles: true,
    ripples: true,
    blend: 'normal',
  },
  minimal: {
    size: 22,
    speed: 0.7,
    mode: 'loop',
    dwell: 0.3,
    motionBoost: 0,
    spin: 30,
    tilt: 10,
    roll: false,
    jelly: 0.2,
    lag: 0,
    hoverGrow: 1.2,
    palette: 'checker',
    outside: '#f2f2f2',
    inside: '#1a1a1a',
    hueDrift: 0,
    vibrance: 0,
    glow: 0,
    glowColor: null,
    opacity: 1,
    style: 'wire',
    shine: 0.2,
    trail: 0,
    sparkles: false,
    ripples: false,
    blend: 'difference',
  },
};

/** "Surprise me": a random but always-legible combination. */
export function randomGlobeCursor(
  base: GlobeCursorSettings,
  rnd: () => number = Math.random,
): GlobeCursorSettings {
  const hex = () =>
    '#' +
    Array.from({ length: 3 }, () =>
      Math.floor(40 + rnd() * 215)
        .toString(16)
        .padStart(2, '0'),
    ).join('');
  const one = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)] as T;
  const span = (k: RangedKey, lo = 0, hi = 1) => {
    const { min, max } = RANGES[k];
    return min + (max - min) * (lo + (hi - lo) * rnd());
  };
  return sanitizeGlobeCursor({
    ...base,
    size: span('size', 0.15, 0.45),
    speed: span('speed', 0.15, 0.45),
    mode: one(EVERT_MODES),
    dwell: span('dwell', 0, 0.4),
    motionBoost: rnd(),
    spin: span('spin', 0.3, 0.8),
    tilt: span('tilt', 0.3, 0.8),
    roll: rnd() > 0.3,
    jelly: rnd(),
    lag: span('lag', 0, 0.4),
    palette: one(CURSOR_PALETTES),
    outside: hex(),
    inside: hex(),
    hueDrift: rnd() > 0.5 ? span('hueDrift', 0, 0.4) : 0,
    vibrance: span('vibrance', 0.4, 1),
    glow: rnd(),
    glowColor: null,
    opacity: span('opacity', 0.6, 1),
    style: one(CURSOR_STYLES),
    shine: rnd(),
    trail: Math.floor(rnd() * 6),
    sparkles: rnd() > 0.5,
    ripples: rnd() > 0.3,
  });
}
