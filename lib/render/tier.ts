/**
 * Shared render-quality tiers.
 *
 * One vocabulary (`low | medium | high | ultra`) that every 3D surface can map
 * onto its own knobs, plus the two settings that matter on *every* game
 * regardless of what it draws: device pixel ratio and antialiasing.
 *
 * Lifted out of `lib/kowloon-knockout/render/tier.ts`, which had the only
 * working implementation of this idea in the repo (see
 * `docs/3d-performance-audit.md` §6).
 */

import type { GpuTier } from './probe';

export type RenderTier = 'low' | 'medium' | 'high' | 'ultra';

export const TIER_ORDER: readonly RenderTier[] = ['low', 'medium', 'high', 'ultra'];

/** User-facing preference: an explicit tier, or 'auto' to let detection decide. */
export type TierPreference = RenderTier | 'auto';

export interface DeviceCaps {
    gpuTier: GpuTier;
    isMobile: boolean;
    /** Raw `window.devicePixelRatio`. */
    devicePixelRatio: number;
    /** OS/account "reduce motion" — also used as a hint to cut effects. */
    reducedMotion?: boolean;
}

/**
 * Baseline quality knobs shared by all games. Games layer their own flags on
 * top (kowloon adds bloom/GTAO/reflections; forest adds tree + particle
 * budgets) rather than pushing game-specific fields in here.
 */
export interface QualityFlags {
    /** Clamp for `<Canvas dpr>` — [min, max]. */
    dpr: [number, number];
    antialias: boolean;
    shadows: boolean;
    shadowMapSize: number;
    /** Multiplier applied to particle/prop counts. */
    densityScale: number;
    /** Cheap post-processing only, or none at all. */
    postProcessing: boolean;
}

export const TIER_QUALITY: Record<RenderTier, QualityFlags> = {
    low: { dpr: [0.6, 1], antialias: false, shadows: false, shadowMapSize: 512, densityScale: 0.35, postProcessing: false },
    medium: { dpr: [1, 1.25], antialias: false, shadows: true, shadowMapSize: 1024, densityScale: 0.6, postProcessing: false },
    high: { dpr: [1, 1.5], antialias: true, shadows: true, shadowMapSize: 2048, densityScale: 1, postProcessing: true },
    ultra: { dpr: [1, 2], antialias: true, shadows: true, shadowMapSize: 2048, densityScale: 1, postProcessing: true },
};

/**
 * Pick a starting tier from device capabilities.
 *
 * Mobile is capped at `medium` even on strong GPUs: phone SoCs are thermally
 * limited and their high DPR (often 3×) already costs more fill rate than a
 * desktop at `ultra`.
 */
export function detectTier(caps: DeviceCaps): RenderTier {
    if (caps.gpuTier === 0) return 'low';
    if (caps.reducedMotion) return 'low';
    if (caps.isMobile) return caps.gpuTier >= 2 ? 'medium' : 'low';
    if (caps.gpuTier >= 3) return 'ultra';
    if (caps.gpuTier === 2) return 'high';
    return 'medium';
}

/** One tier down; floors at 'low'. */
export function nextLowerTier(tier: RenderTier): RenderTier {
    const i = TIER_ORDER.indexOf(tier);
    return i <= 0 ? 'low' : TIER_ORDER[i - 1];
}

/**
 * Resolve the `dpr` prop for a `<Canvas>`.
 *
 * The tier ceiling is intersected with the real device pixel ratio so we never
 * *upscale* past native — rendering above `devicePixelRatio` costs fill rate
 * and buys nothing.
 */
export function resolveDpr(tier: RenderTier, devicePixelRatio: number): [number, number] {
    const [min, max] = TIER_QUALITY[tier].dpr;
    const native = devicePixelRatio > 0 ? devicePixelRatio : 1;
    return [Math.min(min, native), Math.min(max, native)];
}
