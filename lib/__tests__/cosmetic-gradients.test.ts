import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS } from '@/lib/shop/catalog';

/**
 * Steel R1, purchased elements (owner, 2026-11-19): a bought name colour or avatar frame may be a gradient, but a
 * subtle, gradual one. "Subtle and gradual" as a rule a test can hold:
 *  - at most three distinct colours;
 *  - neighbouring colours within 60 degrees of hue (analogous: pink to violet, orange to red), never a spectrum;
 *  - no animation (R5): the catalog's own words never promise one.
 * The full-spectrum "rainbow" gradients this replaced jumped about 115 degrees between stops.
 */

function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const GRADIENT_KINDS = new Set(['NAME_COLOR', 'AVATAR_FRAME']);
const items = SHOP_ITEMS.filter(
  (item) => GRADIENT_KINDS.has(item.kind) && typeof (item.data as { gradient?: unknown }).gradient === 'string',
);

describe('purchased name-colour and frame gradients are subtle and gradual', () => {
  it('there are gradients to check', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  for (const item of items) {
    const gradient = (item.data as { gradient: string }).gradient;
    const stops = gradient.match(/#[0-9a-fA-F]{6}\b/g) ?? [];

    it(`${item.id} uses at most three colours`, () => {
      expect(new Set(stops.map((s) => s.toLowerCase())).size).toBeLessThanOrEqual(3);
    });

    it(`${item.id} moves at most 60 degrees of hue between neighbouring colours`, () => {
      for (let i = 1; i < stops.length; i++) {
        const raw = Math.abs(hue(stops[i]!) - hue(stops[i - 1]!));
        expect(Math.min(raw, 360 - raw), `${stops[i - 1]} → ${stops[i]}`).toBeLessThanOrEqual(60);
      }
    });

    it(`${item.id} promises no animation`, () => {
      expect(`${item.name} ${item.description}`).not.toMatch(/animat|shifting|shimmer|pulse|spin/i);
    });
  }
});
