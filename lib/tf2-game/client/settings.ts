/**
 * The games' player settings: mouse (Source's sensitivity × m_yaw), field of
 * view, volumes, key bindings, graphics tier, captions, crosshair, gamepad and
 * touch tuning. One record per game, persisted in localStorage under
 * `rmh:tf2-game:settings:<game>`; every read and write tolerates a storage that
 * is missing, full or throws (private mode, blocked site data), falling back to
 * the defaults in memory.
 *
 * Environment-agnostic (storage is injected; the browser's is used by default).
 */

import type { HudGame } from './hud-state';
import { isAction, defaultKeybinds, type Action, type Keybinds } from './input/actions';

/** m_yaw / m_pitch: degrees per mouse count at sensitivity 1 (Source defaults). */
export const M_YAW = 0.022;
export const M_PITCH = 0.022;
/** cl_pitchup / cl_pitchdown. */
export const PITCH_LIMIT = 89;
/** cl_forwardspeed / cl_sidespeed / cl_upspeed. */
export const CL_FORWARDSPEED = 450;
export const CL_SIDESPEED = 450;
export const CL_UPSPEED = 320;

export type QualityTier = 'auto' | 'low' | 'medium' | 'high';
/** A per-knob detail level of the Video tab's Advanced section; `auto` follows the Quality tier. */
export type DetailLevel = 'auto' | 'low' | 'medium' | 'high';
export const DETAIL_LEVELS: readonly DetailLevel[] = ['auto', 'low', 'medium', 'high'];
/** `mat_forceaniso` levels (0 = the Quality tier's). */
export const ANISOTROPY_LEVELS: readonly number[] = [0, 1, 2, 4, 8, 16];
export type CrosshairStyle = 'cross' | 'dot' | 'circle' | 'cross-dot' | 'none';

export interface GameSettings {
  version: 1;
  /** `sensitivity` (Source default 3). */
  sensitivity: number;
  /** `m_yaw` / `m_pitch`: degrees per mouse count at sensitivity 1 (0.022; `m_pitch` < 0 is `invertY`). */
  mYaw: number;
  mPitch: number;
  invertY: boolean;
  /** Pointer lock with `unadjustedMovement` (no OS acceleration) where supported. */
  rawInput: boolean;
  /** `m_filter`: average the mouse over the last two samples (CInput::GetMouseDelta). */
  mouseFilter: boolean;
  /**
   * `m_customaccel` (CInput::ScaleMouse): 0 off; 1 / 2 `pow(delta, exponent) × scale + sensitivity` (2 also
   * scales by m_yaw / m_pitch); 3 `pow(delta², (exponent − 1) / 2) × sensitivity` — Options → Mouse →
   * "Mouse acceleration" sets 3, as GameUI does.
   */
  mouseAccel: number;
  /** `m_customaccel_exponent` (GameUI's acceleration slider). */
  mouseAccelExponent: number;
  /** `m_customaccel_scale` (modes 1 and 2). */
  mouseAccelScale: number;
  /** `m_customaccel_max` (modes 1 and 2; 0 = no limit). */
  mouseAccelMax: number;
  /** `fov_desired`: TF2 75–90 (default 90); HL2/Portal 75. */
  fov: number;
  /** `viewmodel_fov` (default 54). */
  viewmodelFov: number;
  volume: { master: number; sfx: number; voice: number; music: number };
  keybinds: Keybinds;
  quality: QualityTier;
  /**
   * The Video tab's Advanced knobs over the Quality tier (applied on the next level load, like the tier):
   * `mat_viewportscale` (0 = automatic: the frame-time governor), `mat_picmip` (texture detail),
   * `r_rootlod` (model detail: the props' draw distance), `cl_effects_detail` (the particle budget),
   * `mat_antialias`, `mat_forceaniso` (0 = the tier's). `auto` follows the tier.
   */
  video: {
    resolutionScale: number;
    textureDetail: DetailLevel;
    modelDetail: DetailLevel;
    effectsDetail: DetailLevel;
    antialias: 'auto' | 'on' | 'off';
    anisotropy: number;
  };
  showFps: boolean;
  /** `closecaption` (HL2/Portal subtitles + sound captions). */
  captions: boolean;
  crosshair: { style: CrosshairStyle; color: string; scale: number };
  /** `tf_dingalingaling` hit sound and the last-hit kill sound. */
  hitSound: boolean;
  /** `hud_combattext` damage numbers. */
  damageNumbers: boolean;
  /** Softens the damage flash / screen fades (WCAG 2.3.1). */
  reducedFlashing: boolean;
  /**
   * "Enable developer console" (`con_enable`, TF2's advanced keyboard option): the backquote key
   * and the pause menu's Console. `auto` is on with a keyboard and mouse, off on touch-first devices.
   */
  devConsole: 'auto' | 'on' | 'off';
  /** `cl_autoreload`. */
  autoReload: boolean;
  gamepad: {
    /** Degrees per second at full right-stick deflection. */
    lookSpeed: number;
    deadzone: number;
    /** Response exponent (1 linear … 3 very fine near the centre). */
    curve: number;
    invertY: boolean;
  };
  touch: {
    /** Degrees per CSS pixel of drag. */
    lookSensitivity: number;
    /** Scale of the on-screen controls. */
    buttonScale: number;
    /** Show the overlay: 'auto' detects a touch-first device. */
    mode: 'auto' | 'on' | 'off';
    haptics: boolean;
  };
}

export const FOV_RANGE: Record<HudGame, { min: number; max: number; def: number }> = {
  tf2: { min: 75, max: 90, def: 90 },
  hl2: { min: 75, max: 90, def: 75 },
  portal: { min: 75, max: 90, def: 75 },
  // CS:GO's fov_cs_debug is locked at 90 for players; the slider keeps TF2's range.
  csgo: { min: 75, max: 90, def: 90 },
};
export const VIEWMODEL_FOV_RANGE = { min: 54, max: 70, def: 54 };
export const SENSITIVITY_RANGE = { min: 0.1, max: 20 };
/** m_yaw / m_pitch magnitudes the settings accept. */
export const M_YAW_RANGE = { min: 0.001, max: 0.2 };
/** m_customaccel_exponent (GameUI's slider runs 1–1.4; the console takes more). */
export const ACCEL_EXPONENT_RANGE = { min: 1, max: 4 };
/** mat_viewportscale when set by hand (0 = automatic). */
export const RESOLUTION_SCALE_RANGE = { min: 0.4, max: 1 };

export function defaultSettings(game: HudGame): GameSettings {
  return {
    version: 1,
    sensitivity: 3,
    mYaw: M_YAW,
    mPitch: M_PITCH,
    invertY: false,
    rawInput: true,
    mouseFilter: false,
    mouseAccel: 0,
    mouseAccelExponent: 1,
    mouseAccelScale: 0.04,
    mouseAccelMax: 0,
    fov: FOV_RANGE[game].def,
    viewmodelFov: VIEWMODEL_FOV_RANGE.def,
    volume: { master: 0.6, sfx: 1, voice: 1, music: 0.6 },
    keybinds: defaultKeybinds(game),
    quality: 'auto',
    video: { resolutionScale: 0, textureDetail: 'auto', modelDetail: 'auto', effectsDetail: 'auto', antialias: 'auto', anisotropy: 0 },
    showFps: false,
    captions: game !== 'tf2',
    crosshair: { style: 'cross', color: 'rgb(200 255 200)', scale: 1 },
    hitSound: game === 'tf2',
    damageNumbers: game === 'tf2',
    reducedFlashing: false,
    devConsole: 'auto',
    autoReload: true,
    gamepad: { lookSpeed: 220, deadzone: 0.15, curve: 2, invertY: false },
    touch: { lookSensitivity: 0.25, buttonScale: 1, mode: 'auto', haptics: true },
  };
}

// ─── Validation ────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numIn = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const boolOr = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const oneOf = <T extends string>(v: unknown, options: readonly T[], def: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : def;
/** Crosshair colours are stored as `rgb(r g b)` only (no arbitrary CSS reaches a style attribute). */
const RGB_RE = /^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/;
const KEY_CODE_RE = /^[A-Za-z0-9]{1,24}$/;

function sanitizeKeybinds(v: unknown, def: Keybinds): Keybinds {
  if (!isObj(v)) return def;
  const out: Keybinds = {};
  for (const [action, keys] of Object.entries(v)) {
    if (!isAction(action) || !Array.isArray(keys)) continue;
    const valid = keys.filter((k): k is string => typeof k === 'string' && KEY_CODE_RE.test(k)).slice(0, 2);
    if (valid.length) out[action as Action] = valid;
  }
  // Fixed actions always keep their defaults.
  out.menu = def.menu ?? ['Escape'];
  return out;
}

/** Defaults overlaid with whatever of `raw` is valid; unknown or out-of-range values fall back. */
export function sanitizeSettings(raw: unknown, game: HudGame): GameSettings {
  const d = defaultSettings(game);
  if (!isObj(raw)) return d;
  const vol = isObj(raw.volume) ? raw.volume : {};
  const ch = isObj(raw.crosshair) ? raw.crosshair : {};
  const gp = isObj(raw.gamepad) ? raw.gamepad : {};
  const tc = isObj(raw.touch) ? raw.touch : {};
  const vd = isObj(raw.video) ? raw.video : {};
  const fov = FOV_RANGE[game];
  const scale = numIn(vd.resolutionScale, 0, RESOLUTION_SCALE_RANGE.max, d.video.resolutionScale);
  return {
    version: 1,
    sensitivity: numIn(raw.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max, d.sensitivity),
    mYaw: numIn(raw.mYaw, M_YAW_RANGE.min, M_YAW_RANGE.max, d.mYaw),
    mPitch: numIn(raw.mPitch, M_YAW_RANGE.min, M_YAW_RANGE.max, d.mPitch),
    invertY: boolOr(raw.invertY, d.invertY),
    rawInput: boolOr(raw.rawInput, d.rawInput),
    mouseFilter: boolOr(raw.mouseFilter, d.mouseFilter),
    mouseAccel: Math.trunc(numIn(raw.mouseAccel, 0, 3, d.mouseAccel)),
    mouseAccelExponent: numIn(raw.mouseAccelExponent, ACCEL_EXPONENT_RANGE.min, ACCEL_EXPONENT_RANGE.max, d.mouseAccelExponent),
    mouseAccelScale: numIn(raw.mouseAccelScale, 0, 1, d.mouseAccelScale),
    mouseAccelMax: numIn(raw.mouseAccelMax, 0, 20, d.mouseAccelMax),
    fov: Math.round(numIn(raw.fov, fov.min, fov.max, d.fov)),
    viewmodelFov: Math.round(numIn(raw.viewmodelFov, VIEWMODEL_FOV_RANGE.min, VIEWMODEL_FOV_RANGE.max, d.viewmodelFov)),
    volume: {
      master: numIn(vol.master, 0, 1, d.volume.master),
      sfx: numIn(vol.sfx, 0, 1, d.volume.sfx),
      voice: numIn(vol.voice, 0, 1, d.volume.voice),
      music: numIn(vol.music, 0, 1, d.volume.music),
    },
    keybinds: sanitizeKeybinds(raw.keybinds, d.keybinds),
    quality: oneOf(raw.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality),
    video: {
      // 0 is automatic; a hand-set scale is at least the governor's floor.
      resolutionScale: scale > 0 ? Math.max(RESOLUTION_SCALE_RANGE.min, scale) : 0,
      textureDetail: oneOf(vd.textureDetail, DETAIL_LEVELS, d.video.textureDetail),
      modelDetail: oneOf(vd.modelDetail, DETAIL_LEVELS, d.video.modelDetail),
      effectsDetail: oneOf(vd.effectsDetail, DETAIL_LEVELS, d.video.effectsDetail),
      antialias: oneOf(vd.antialias, ['auto', 'on', 'off'] as const, d.video.antialias),
      anisotropy: ANISOTROPY_LEVELS.includes(vd.anisotropy as number) ? (vd.anisotropy as number) : d.video.anisotropy,
    },
    showFps: boolOr(raw.showFps, d.showFps),
    captions: boolOr(raw.captions, d.captions),
    crosshair: {
      style: oneOf(ch.style, ['cross', 'dot', 'circle', 'cross-dot', 'none'] as const, d.crosshair.style),
      color: typeof ch.color === 'string' && RGB_RE.test(ch.color) ? ch.color : d.crosshair.color,
      scale: numIn(ch.scale, 0.5, 3, d.crosshair.scale),
    },
    hitSound: boolOr(raw.hitSound, d.hitSound),
    damageNumbers: boolOr(raw.damageNumbers, d.damageNumbers),
    reducedFlashing: boolOr(raw.reducedFlashing, d.reducedFlashing),
    devConsole: oneOf(raw.devConsole, ['auto', 'on', 'off'] as const, d.devConsole),
    autoReload: boolOr(raw.autoReload, d.autoReload),
    gamepad: {
      lookSpeed: numIn(gp.lookSpeed, 30, 720, d.gamepad.lookSpeed),
      deadzone: numIn(gp.deadzone, 0, 0.6, d.gamepad.deadzone),
      curve: numIn(gp.curve, 1, 4, d.gamepad.curve),
      invertY: boolOr(gp.invertY, d.gamepad.invertY),
    },
    touch: {
      lookSensitivity: numIn(tc.lookSensitivity, 0.02, 2, d.touch.lookSensitivity),
      buttonScale: numIn(tc.buttonScale, 0.6, 1.6, d.touch.buttonScale),
      mode: oneOf(tc.mode, ['auto', 'on', 'off'] as const, d.touch.mode),
      haptics: boolOr(tc.haptics, d.touch.haptics),
    },
  };
}

// ─── Persistence ───────────────────────────────────────────────────────────

/** The slice of the Storage API used here (injectable for tests). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const settingsKey = (game: HudGame): string => `rmh:tf2-game:settings:${game}`;

/** `window.localStorage`, or null where touching it throws or it does not exist. */
export function browserStorage(): SettingsStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSettings(game: HudGame, storage: SettingsStorage | null = browserStorage()): GameSettings {
  if (!storage) return defaultSettings(game);
  try {
    const raw = storage.getItem(settingsKey(game));
    return raw ? sanitizeSettings(JSON.parse(raw), game) : defaultSettings(game);
  } catch {
    return defaultSettings(game);
  }
}

/** Persists the settings; false when the storage refused (quota, private mode) — the caller keeps them in memory. */
export function saveSettings(
  game: HudGame,
  settings: GameSettings,
  storage: SettingsStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(settingsKey(game), JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// ─── Derived values ────────────────────────────────────────────────────────

/** The mouse settings `mouseToDegrees` reads (all but sensitivity / invert optional: Source's defaults). */
export type MouseSettings = Pick<GameSettings, 'sensitivity' | 'invertY'> &
  Partial<Pick<GameSettings, 'mYaw' | 'mPitch' | 'mouseAccel' | 'mouseAccelExponent' | 'mouseAccelScale' | 'mouseAccelMax'>>;

/**
 * The counts multiplied by the sensitivity, with `m_customaccel` (CInput::ScaleMouse): 0 plain; 1 and 2
 * `min(max, pow(|d|, exponent) × scale + sensitivity)` (2 also times m_yaw / m_pitch, which then apply
 * twice, as in the SDK); 3 `pow(|d|², (exponent − 1) / 2) × sensitivity`.
 */
export function scaleMouse(dx: number, dy: number, s: MouseSettings): { x: number; y: number } {
  const mode = s.mouseAccel ?? 0;
  const sens = s.sensitivity;
  const exponent = s.mouseAccelExponent ?? 1;
  if (mode === 1 || mode === 2) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    let accel = Math.pow(dist, exponent) * (s.mouseAccelScale ?? 0.04) + sens;
    const max = s.mouseAccelMax ?? 0;
    if (max > 0.0001 && accel > max) accel = max;
    let x = dx * accel;
    let y = dy * accel;
    if (mode === 2) {
      x *= s.mYaw ?? M_YAW;
      y *= s.mPitch ?? M_PITCH;
    }
    return { x, y };
  }
  if (mode === 3) {
    const exp = Math.max(0, (exponent - 1) / 2);
    const accel = Math.pow(dx * dx + dy * dy, exp) * sens;
    return { x: dx * accel, y: dy * accel };
  }
  return { x: dx * sens, y: dy * sens };
}

/** Degrees of yaw / pitch for a mouse movement of (dx, dy) counts (CInput::ScaleMouse + ApplyMouse). */
export function mouseToDegrees(dx: number, dy: number, s: MouseSettings): { yaw: number; pitch: number } {
  const m = scaleMouse(dx, dy, s);
  return {
    // Moving right turns right: yaw decreases (Source yaw is counter-clockwise).
    yaw: -m.x * (s.mYaw ?? M_YAW),
    pitch: m.y * (s.mPitch ?? M_PITCH) * (s.invertY ? -1 : 1),
  };
}

/** Whether the developer console is on for this device (`devConsole` auto: keyboard yes, touch-first no). */
export function devConsoleEnabled(s: Pick<GameSettings, 'devConsole'>, touchFirst: boolean): boolean {
  return s.devConsole === 'on' || (s.devConsole === 'auto' && !touchFirst);
}

export interface QualityProfile {
  tier: Exclude<QualityTier, 'auto'>;
  /** Render resolution as a fraction of the canvas' CSS size × DPR (also capped by DPR 2). */
  resolutionScale: number;
  /** Largest texture edge to upload. */
  textureCap: number;
  /** Particle budget multiplier. */
  particles: number;
  /** Dynamic shadows are off at every tier (the maps carry baked lighting). */
  shadows: false;
}

const PROFILES: Record<Exclude<QualityTier, 'auto'>, QualityProfile> = {
  low: { tier: 'low', resolutionScale: 0.6, textureCap: 256, particles: 0.35, shadows: false },
  medium: { tier: 'medium', resolutionScale: 0.8, textureCap: 512, particles: 0.7, shadows: false },
  high: { tier: 'high', resolutionScale: 1, textureCap: 1024, particles: 1, shadows: false },
};

/** The concrete profile; `auto` picks from the device (touch-first or low-power → low/medium). */
export function qualityProfile(
  tier: QualityTier,
  device: { touchFirst?: boolean; lowPower?: boolean; memoryGb?: number } = {},
): QualityProfile {
  if (tier !== 'auto') return PROFILES[tier];
  if (device.lowPower || (device.memoryGb !== undefined && device.memoryGb <= 2)) return PROFILES.low;
  if (device.touchFirst) return PROFILES.medium;
  return PROFILES.high;
}
