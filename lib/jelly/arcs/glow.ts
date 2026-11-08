/**
 * The bolt's glow, in layered passes (CSS-first jelly Task 9, "more oomph").
 *
 * A bolt is drawn widest first, so light builds up toward the channel: a wide soft **bloom**, a **mid** glow, the
 * plasma-coloured **core**, and on dark themes a thin **white-hot** line inside it. On dark themes every pass composites
 * with `lighter` (emissive: overlapping light adds), on light themes with `source-over` (adding light to white adds
 * nothing). The glow passes are the ones the renderer splits into red, green and blue copies (`dispersion.ts`); the
 * core and the hot line never split.
 *
 * Safety: the passes wider than {@link GLOW.wideBandPx} together stay under a 0.1 luminance change even if their colour
 * were white, so a bolt never makes a wide band flash; only a few px at its centre change by more (a line, not an area).
 *
 * Pure.
 */

import { CALM, type JellyMotion } from '../tiers';

export type GlowColour = 'glow' | 'core' | 'white';

export interface GlowPassSpec {
  id: 'bloom' | 'mid' | 'core' | 'hot';
  /** Width at energy 0, px, plus `perEnergy`·energy. */
  width: number;
  perEnergy: number;
  /** Alpha at full intensity (glow passes are further multiplied by the glow token's own alpha). */
  alpha: number;
  colour: GlowColour;
}

export const GLOW = {
  /** Passes wider than this must, summed, stay under a flash transition (read as white). */
  wideBandPx: 8,
  dark: [
    { id: 'bloom', width: 14, perEnergy: 6, alpha: 0.09, colour: 'glow' },
    { id: 'mid', width: 4.5, perEnergy: 2.5, alpha: 0.38, colour: 'glow' },
    { id: 'core', width: 1.5, perEnergy: 0.7, alpha: 0.95, colour: 'core' },
    { id: 'hot', width: 0.6, perEnergy: 0.4, alpha: 0.9, colour: 'white' },
  ] as readonly GlowPassSpec[],
  light: [
    { id: 'bloom', width: 14, perEnergy: 6, alpha: 0.07, colour: 'glow' },
    { id: 'mid', width: 4.5, perEnergy: 2.5, alpha: 0.28, colour: 'glow' },
    { id: 'core', width: 1.4, perEnergy: 0.6, alpha: 0.92, colour: 'core' },
  ] as readonly GlowPassSpec[],
} as const;

export interface GlowPass {
  id: GlowPassSpec['id'];
  width: number;
  alpha: number;
  colour: GlowColour;
  /** Drawn as three channel copies (the glow passes). */
  split: boolean;
}

/** The passes for a theme, an arc energy (0..1) and an intensity (0..1: the channel's I × the motion scale). */
export function glowPasses(dark: boolean, energy: number, intensity: number): GlowPass[] {
  const e = Math.max(0, Math.min(1, energy));
  const k = Math.max(0, Math.min(1, intensity));
  return (dark ? GLOW.dark : GLOW.light).map((p) => ({
    id: p.id,
    width: p.width + p.perEnergy * e,
    alpha: Math.min(1, p.alpha * k),
    colour: p.colour,
    split: p.colour === 'glow',
  }));
}

/** How strongly arcs draw under each motion level: lively 1, calm {@link CALM.arcIntensity}, still 0 (arcs are off). */
export function arcIntensityScale(motion: JellyMotion): number {
  if (motion === 'still') return 0;
  return motion === 'calm' ? CALM.arcIntensity : 1;
}
