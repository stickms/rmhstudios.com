import { describe, it, expect } from 'vitest';
import { parseCssColor, splitGradients, parseSceneColors } from '@/lib/liquid-gl/scene';

// The real :root and .style-light `--site-canvas` tokens (app/globals.css).
const ROOT_CANVAS = `
  radial-gradient(110% 85% at 10% -5%, rgba(86, 140, 255, 0.3), transparent 62%),
  radial-gradient(95% 75% at 94% 4%, rgba(170, 108, 255, 0.27), transparent 60%),
  radial-gradient(110% 95% at 86% 102%, rgba(52, 208, 188, 0.22), transparent 64%),
  radial-gradient(80% 70% at 8% 98%, rgba(255, 120, 196, 0.16), transparent 60%),
  linear-gradient(180deg, #0d1b2e 0%, #13253e 48%, #0b1930 100%)`;

const LIGHT_CANVAS = `
  radial-gradient(110% 85% at 12% -8%, rgba(255, 255, 255, 0.08), transparent 60%),
  radial-gradient(95% 80% at 92% 6%, rgba(200, 205, 215, 0.06), transparent 60%),
  radial-gradient(120% 95% at 84% 104%, rgba(120, 125, 140, 0.1), transparent 64%),
  linear-gradient(180deg, #17171a 0%, #202024 50%, #131316 100%)`;

describe('parseCssColor', () => {
  it('parses hex (#rgb, #rrggbb, #rrggbbaa)', () => {
    expect(parseCssColor('#000000')).toEqual([0, 0, 0, 1]);
    expect(parseCssColor('#ffffff')).toEqual([1, 1, 1, 1]);
    expect(parseCssColor('#fff')).toEqual([1, 1, 1, 1]);
    const [r, g, b, a] = parseCssColor('#0d1b2e')!;
    expect(r).toBeCloseTo(13 / 255, 5);
    expect(g).toBeCloseTo(27 / 255, 5);
    expect(b).toBeCloseTo(46 / 255, 5);
    expect(a).toBe(1);
    expect(parseCssColor('#80000080')![3]).toBeCloseTo(128 / 255, 5);
  });

  it('parses rgb()/rgba() comma and slash forms', () => {
    const c = parseCssColor('rgba(86, 140, 255, 0.3)')!;
    expect(c[0]).toBeCloseTo(86 / 255, 5);
    expect(c[1]).toBeCloseTo(140 / 255, 5);
    expect(c[2]).toBeCloseTo(1, 5);
    expect(c[3]).toBeCloseTo(0.3, 5);
    const s = parseCssColor('rgb(255 120 196)')!;
    expect(s[0]).toBeCloseTo(1, 5);
    expect(s[3]).toBe(1);
  });

  it('handles transparent and rejects non-colours', () => {
    expect(parseCssColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseCssColor('none')).toBeNull();
    expect(parseCssColor('180deg')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('splitGradients', () => {
  it('splits the stacked canvas into paren-balanced gradient chunks', () => {
    const parts = splitGradients(ROOT_CANVAS);
    expect(parts).toHaveLength(5);
    expect(parts.filter((p) => p.startsWith('radial-gradient'))).toHaveLength(4);
    expect(parts.filter((p) => p.startsWith('linear-gradient'))).toHaveLength(1);
    // The rgba() commas inside a radial must NOT split it.
    expect(parts[0]).toContain('rgba(86, 140, 255, 0.3)');
  });
});

describe('parseSceneColors', () => {
  it('parses the :root scene: 4 glows + linear base + accent/rim', () => {
    const scene = parseSceneColors(ROOT_CANVAS, '#6cc9ff', 'rgba(255,255,255,0.28)');
    expect(scene.glows).toHaveLength(4);

    const g0 = scene.glows[0];
    expect(g0.r).toBeCloseTo(86 / 255, 3);
    expect(g0.g).toBeCloseTo(140 / 255, 3);
    expect(g0.b).toBeCloseTo(1, 3);
    expect(g0.a).toBeCloseTo(0.3, 3);
    expect(g0.cx).toBeCloseTo(0.1, 5);
    expect(g0.cy).toBeCloseTo(-0.05, 5);
    expect(g0.sx).toBeCloseTo(1.1, 5);
    expect(g0.sy).toBeCloseTo(0.85, 5);
    expect(g0.stop).toBeCloseTo(0.62, 5);

    // base linear stops
    expect(scene.baseTop[0]).toBeCloseTo(13 / 255, 3); // #0d1b2e
    expect(scene.baseMid[0]).toBeCloseTo(19 / 255, 3); // #13253e
    expect(scene.baseBot[0]).toBeCloseTo(11 / 255, 3); // #0b1930

    // accent
    expect(scene.accent[0]).toBeCloseTo(108 / 255, 3);
    expect(scene.accent[2]).toBeCloseTo(1, 3);
  });

  it('parses a light theme with only 3 glows', () => {
    const scene = parseSceneColors(LIGHT_CANVAS, '#6a4fd0', '#ffffff');
    expect(scene.glows).toHaveLength(3);
    expect(scene.glows[0].a).toBeCloseTo(0.08, 3);
    expect(scene.baseTop[0]).toBeCloseTo(23 / 255, 3); // #17171a
  });

  it('degrades gracefully on `none` (high-contrast) — no glows, accent kept', () => {
    const scene = parseSceneColors('none', '#ffff00', '#ffffff');
    expect(scene.glows).toHaveLength(0);
    expect(scene.accent[0]).toBeCloseTo(1, 3);
    expect(scene.accent[1]).toBeCloseTo(1, 3);
    expect(scene.accent[2]).toBeCloseTo(0, 3);
  });

  it('never throws on malformed input', () => {
    expect(() => parseSceneColors('radial-gradient(', '', '')).not.toThrow();
    expect(() => parseSceneColors('garbage', 'garbage', 'garbage')).not.toThrow();
  });
});
