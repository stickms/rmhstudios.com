import type { ModelSpec } from './models';
import { ACCENT_KEYS, isPaletteKey } from './palette';

/** The cohesion contract. Limits are deliberately loose; their job is to catch a model from another game. */
export const STYLE_LIMITS = {
  maxParts: 12,
  /** Tile footprint is 1×1; a little overhang (roofs, canopies) is allowed. */
  maxFootprint: 1.1,
  maxHeight: 1.6,
  minSize: 0.02,
  /** Warm accents (butter/blush) may cover at most this share of a model's parts. */
  maxAccentShare: 0.4,
} as const;

export function checkStyle(spec: ModelSpec): string[] {
  const problems: string[] = [];
  const L = STYLE_LIMITS;
  if (spec.parts.length === 0) problems.push('no parts');
  if (spec.parts.length > L.maxParts) problems.push(`over part budget (${spec.parts.length} > ${L.maxParts})`);
  let accent = 0;
  for (const [i, p] of spec.parts.entries()) {
    if (!isPaletteKey(p.color)) problems.push(`part ${i}: colour ${String(p.color)} is not in the palette`);
    if (ACCENT_KEYS.includes(p.color)) accent++;
    if (p.size.some((s) => !(s >= L.minSize))) problems.push(`part ${i}: degenerate size`);
    const hx = Math.abs(p.pos[0]) + p.size[0] / 2;
    const hz = Math.abs(p.pos[2]) + p.size[2] / 2;
    if (hx * 2 > L.maxFootprint + 1e-9 || hz * 2 > L.maxFootprint + 1e-9)
      problems.push(`part ${i}: outside the tile footprint`);
    if (p.pos[1] + p.size[1] / 2 > L.maxHeight + 1e-9) problems.push(`part ${i}: taller than ${L.maxHeight}`);
    if (p.pos[1] - p.size[1] / 2 < -1e-9) problems.push(`part ${i}: below the ground`);
  }
  if (spec.parts.length > 0 && accent / spec.parts.length > L.maxAccentShare + 1e-9)
    problems.push('accent colours dominate the model');
  return problems;
}
