/**
 * Render quality for the three games: which device class we are on, what that
 * class can afford, and a frame-time governor that trades resolution for frame
 * rate while the game runs.
 *
 *   const device = detectDevice(gl);                       // once, after the context exists
 *   const plan = planQuality(device, settings.quality);    // resolution, textures, particles, props, portals
 *   const governor = new FrameGovernor(plan);              // per frame: governor.sample(dtMs)
 *   renderer.setPixelRatio(Math.min(devicePixelRatio, plan.dprCap) * governor.scale);
 *
 * Three device tiers rather than a score: a **desktop** (discrete or good
 * integrated GPU, plenty of memory), a **laptop** (fewer cores or less memory,
 * a smaller texture limit, or a battery-friendly GPU) and a **mobile** device
 * (touch-first, or a phone/tablet user agent). The player's Quality setting
 * (`settings.quality`: low / medium / high) picks a tier directly; `auto` uses
 * the detected one.
 *
 * The governor only ever lowers the resolution scale quickly and raises it
 * slowly, with a cooldown that doubles each time an increase had to be taken
 * back, so it settles instead of oscillating. Textures, particles and props
 * are fixed per session (changing them mid-game would reload assets).
 *
 * Environment-agnostic except `detectDevice`, which reads `navigator` and a
 * WebGL context when given one.
 */

import type { QualityTier } from './settings';

export type DeviceTier = 'desktop' | 'laptop' | 'mobile';

export interface DeviceInfo {
  /** A WebGL2 context is available (three.js needs it). */
  webgl2: boolean;
  /** gl.MAX_TEXTURE_SIZE (0 when unknown). */
  maxTextureSize: number;
  /** navigator.deviceMemory in GB (undefined where the browser hides it). */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency (undefined when unknown). */
  cores?: number;
  /** Coarse primary pointer, no hover: a phone or tablet. */
  touchFirst: boolean;
  /** A mobile user agent (iPhone, Android phone/tablet, iPad). */
  mobileUa: boolean;
  /** The GPU's unmasked renderer string, when the browser exposes it ('' otherwise). */
  gpu: string;
  /** window.devicePixelRatio. */
  dpr: number;
}

export interface QualityPlan {
  tier: DeviceTier;
  /** Starting render scale (fraction of the canvas' CSS size × capped DPR). */
  resolutionScale: number;
  /** The governor never goes below this. */
  minResolutionScale: number;
  /** devicePixelRatio cap. */
  dprCap: number;
  /** Largest texture edge uploaded (createTextureCache `maxTextureSize`). */
  maxTextureSize: number;
  anisotropy: number;
  /** Live particle systems at once. */
  particleBudget: number;
  /** Static props farther than this (Source units) are not drawn; 0 = the map's own fade distances only. */
  propDrawDistance: number;
  /** Portal views rendered inside portal views (Portal only). */
  portalRecursion: number;
  /** Frame time the governor aims for, ms. */
  targetFrameMs: number;
  /** Antialiasing on the default framebuffer. */
  antialias: boolean;
}

export const TIER_PRESETS: Readonly<Record<DeviceTier, Omit<QualityPlan, 'tier' | 'maxTextureSize'> & { textureCap: number }>> = {
  desktop: {
    resolutionScale: 1,
    minResolutionScale: 0.5,
    dprCap: 2,
    textureCap: 1024,
    anisotropy: 8,
    particleBudget: 64,
    propDrawDistance: 0,
    portalRecursion: 2,
    targetFrameMs: 1000 / 60,
    antialias: true,
  },
  laptop: {
    resolutionScale: 0.85,
    minResolutionScale: 0.5,
    dprCap: 1.5,
    textureCap: 1024,
    anisotropy: 4,
    particleBudget: 40,
    propDrawDistance: 4096,
    portalRecursion: 2,
    targetFrameMs: 1000 / 60,
    antialias: false,
  },
  mobile: {
    resolutionScale: 0.7,
    minResolutionScale: 0.4,
    dprCap: 1.5,
    textureCap: 512,
    anisotropy: 2,
    particleBudget: 20,
    propDrawDistance: 2560,
    portalRecursion: 1,
    targetFrameMs: 1000 / 30,
    antialias: false,
  },
};

/** The Quality setting's explicit tiers. */
const SETTING_TIER: Record<Exclude<QualityTier, 'auto'>, DeviceTier> = {
  low: 'mobile',
  medium: 'laptop',
  high: 'desktop',
};

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i;
/** Integrated / power-saving GPUs a desktop browser may report. */
const LOW_POWER_GPU = /Intel\(R\) (HD|UHD) Graphics|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe|Software/i;

/** The device class from what the browser tells us. Pure. */
export function deviceTier(d: DeviceInfo): DeviceTier {
  if (d.touchFirst || d.mobileUa) return 'mobile';
  const fewCores = d.cores !== undefined && d.cores <= 4;
  const lowMemory = d.deviceMemory !== undefined && d.deviceMemory <= 4;
  const smallTextures = d.maxTextureSize > 0 && d.maxTextureSize < 8192;
  const lowPowerGpu = d.gpu !== '' && LOW_POWER_GPU.test(d.gpu);
  if (fewCores || lowMemory || smallTextures || lowPowerGpu) return 'laptop';
  return 'desktop';
}

/** What to render with: the tier's preset, capped by what the GPU can hold. Pure. */
export function planQuality(d: DeviceInfo, setting: QualityTier = 'auto'): QualityPlan {
  const tier = setting === 'auto' ? deviceTier(d) : SETTING_TIER[setting];
  const p = TIER_PRESETS[tier];
  const gpuCap = d.maxTextureSize > 0 ? d.maxTextureSize : p.textureCap;
  // A 2 GB device keeps textures at 512 whatever the tier says (decoded textures are the biggest heap user).
  const memoryCap = d.deviceMemory !== undefined && d.deviceMemory <= 2 ? 512 : p.textureCap;
  return {
    tier,
    resolutionScale: p.resolutionScale,
    minResolutionScale: p.minResolutionScale,
    dprCap: Math.min(p.dprCap, Math.max(1, d.dpr || 1)),
    maxTextureSize: Math.min(p.textureCap, gpuCap, memoryCap),
    anisotropy: p.anisotropy,
    particleBudget: p.particleBudget,
    propDrawDistance: p.propDrawDistance,
    portalRecursion: p.portalRecursion,
    targetFrameMs: p.targetFrameMs,
    antialias: p.antialias,
  };
}

/** Reads the device. `gl` (any WebGL context) adds the texture limit and the GPU name. */
export function detectDevice(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceInfo {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { deviceMemory?: number })
    | undefined;
  let touchFirst: boolean;
  try {
    touchFirst =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches &&
      !window.matchMedia('(hover: hover)').matches;
  } catch {
    touchFirst = false;
  }
  let maxTextureSize = 0;
  let gpu = '';
  let webgl2 = false;
  if (gl) {
    try {
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
      webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    } catch {
      /* a lost context answers nothing; keep the defaults */
    }
  } else if (typeof document !== 'undefined') {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      webgl2 = !!probe;
      if (probe) {
        maxTextureSize = Number(probe.getParameter(probe.MAX_TEXTURE_SIZE)) || 0;
        probe.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      webgl2 = false;
    }
  }
  return {
    webgl2,
    maxTextureSize,
    deviceMemory: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    cores: typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    touchFirst,
    mobileUa: !!nav && MOBILE_UA.test(nav.userAgent ?? ''),
    gpu,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
}

// ─── Frame-time governor ───────────────────────────────────────────────────

/** Governor constants. */
export const GOVERNOR = {
  /** Exponential moving average weight of one frame. */
  emaAlpha: 0.08,
  /** Over budget by this factor for `downAfterMs` → scale down. */
  overFactor: 1.3,
  downAfterMs: 1000,
  downStep: 0.1,
  /** Within budget (≤ this factor) for the cooldown → scale up. */
  underFactor: 1.08,
  upStep: 0.05,
  /** First cooldown before an increase; doubles when an increase is taken back. */
  upCooldownMs: 3000,
  maxUpCooldownMs: 48000,
  /** Frames longer than this are hitches (a GC, a tab switch), not load. */
  hitchMs: 250,
} as const;

export class FrameGovernor {
  /** Current resolution scale. */
  scale: number;
  /** Smoothed frame time, ms. */
  ema = 0;
  private overFor = 0;
  private underFor = 0;
  private cooldown: number = GOVERNOR.upCooldownMs;
  /** ms since the last increase (to detect one that had to be taken back). */
  private sinceUp = Infinity;
  changes = 0;

  constructor(
    private readonly plan: Pick<QualityPlan, 'resolutionScale' | 'minResolutionScale' | 'targetFrameMs'>,
    private readonly maxScale = plan.resolutionScale,
  ) {
    this.scale = plan.resolutionScale;
  }

  /** One frame of `dtMs`. Returns true when the scale changed (resize the drawing buffer). */
  sample(dtMs: number): boolean {
    if (!(dtMs > 0) || dtMs > GOVERNOR.hitchMs) return false;
    this.ema = this.ema === 0 ? dtMs : this.ema + (dtMs - this.ema) * GOVERNOR.emaAlpha;
    this.sinceUp += dtMs;
    const target = this.plan.targetFrameMs;
    if (this.ema > target * GOVERNOR.overFactor) {
      this.overFor += dtMs;
      this.underFor = 0;
      if (this.overFor >= GOVERNOR.downAfterMs && this.scale > this.plan.minResolutionScale + 1e-9) {
        // An increase that did not hold: wait longer before the next one.
        if (this.sinceUp < this.cooldown * 2) this.cooldown = Math.min(GOVERNOR.maxUpCooldownMs, this.cooldown * 2);
        this.scale = Math.max(this.plan.minResolutionScale, round2(this.scale - GOVERNOR.downStep));
        this.overFor = 0;
        this.ema = target; // judge the new scale on its own frames
        this.changes++;
        return true;
      }
      return false;
    }
    this.overFor = 0;
    if (this.ema <= target * GOVERNOR.underFactor) {
      this.underFor += dtMs;
      if (this.underFor >= this.cooldown && this.scale < this.maxScale - 1e-9) {
        this.scale = Math.min(this.maxScale, round2(this.scale + GOVERNOR.upStep));
        this.underFor = 0;
        this.sinceUp = 0;
        this.changes++;
        return true;
      }
    } else {
      this.underFor = 0;
    }
    return false;
  }
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The drawing-buffer pixel ratio for a plan and governor scale. */
export function pixelRatioFor(plan: Pick<QualityPlan, 'dprCap'>, dpr: number, scale: number): number {
  return Math.max(0.25, Math.min(dpr || 1, plan.dprCap) * scale);
}
