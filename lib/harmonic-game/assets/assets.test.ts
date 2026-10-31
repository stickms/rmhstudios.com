import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTexture, textureId, type MaterialRecipe } from './textures';
import { HARMONIC_MATERIAL_LOOKUP, MATERIALS, TEXTURE_SIZE } from './materials';
import { createHarmonicAssets } from './harmonic-assets';
import { sha1Hex } from './sha1';
import { fbm, mulberry32 } from './rng';

const hash = (a: Uint8ClampedArray): string => sha1Hex(Array.from(a).join(','));
const entries = Object.entries(MATERIALS);
const textured = entries.filter(([, d]) => d.recipe.kind !== 'nodraw' && d.recipe.kind !== 'sky');

describe('sha1', () => {
  it('matches known vectors', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

describe('rng', () => {
  it('is deterministic and tileable', () => {
    expect(mulberry32(5)()).toBe(mulberry32(5)());
    expect(fbm(3, 0, 0.3, 4)).toBeCloseTo(fbm(3, 1, 0.3, 4), 10);
  });
});

describe('recipes', () => {
  it('are deterministic and distinct', () => {
    const seen = new Map<string, string>();
    for (const [name, d] of textured) {
      const a = buildTexture(d.recipe, 64);
      const b = buildTexture(d.recipe, 64);
      expect(hash(a.data)).toBe(hash(b.data));
      expect(a.data.length).toBe(64 * 64 * 4);
      const h = hash(a.data);
      expect(seen.has(h), `${name} duplicates ${seen.get(h)}`).toBe(false);
      seen.set(h, name);
    }
  });

  it('cover the required kinds', () => {
    const kinds = new Set(entries.map(([, d]) => d.recipe.kind));
    for (const k of [
      'concrete',
      'steel_plate',
      'steel_rust',
      'paint_white_1971',
      'paint_white_2030',
      'ice',
      'snow',
      'grating',
      'wood_deck',
      'glass',
      'hazard_stripe',
      'nodraw',
      'sky',
    ])
      expect(kinds.has(k as MaterialRecipe['kind'])).toBe(true);
  });

  it('glass has alpha, the rest are opaque', () => {
    for (const [name, d] of textured) {
      const t = buildTexture(d.recipe, 32);
      let min = 255;
      for (let i = 3; i < t.data.length; i += 4) min = Math.min(min, t.data[i]);
      if (name === 'harmonic/glass') expect(min).toBeLessThan(255);
      else expect(min).toBe(255);
    }
  });

  it('builds every 256px texture in under 1.5 s', () => {
    const t0 = performance.now();
    for (const [, d] of textured) buildTexture(d.recipe, 256);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('texture ids', () => {
  it('are 40 hex, stable and unique', () => {
    const ids = textured.map(([, d]) => textureId(d.recipe, TEXTURE_SIZE));
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{40}$/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(textureId(textured[0][1].recipe, TEXTURE_SIZE)).toBe(ids[0]);
    expect(textureId(textured[0][1].recipe, 128)).not.toBe(ids[0]);
  });
});

describe('HARMONIC_MATERIAL_LOOKUP', () => {
  it('covers every MATERIALS entry with a surfaceProp', () => {
    for (const [name, d] of entries) {
      const m = HARMONIC_MATERIAL_LOOKUP(name);
      expect(m.name).toBe(name);
      expect(m.surfaceProp).toBeTruthy();
      m.color.forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      });
      if (d.recipe.kind === 'nodraw') expect(m.nodraw).toBe(true);
      else if (d.recipe.kind === 'sky') expect(m.sky).toBe(true);
      else {
        expect(m.texture?.id).toMatch(/^[a-f0-9]{40}$/);
        expect(m.texture?.w).toBe(TEXTURE_SIZE);
      }
    }
    expect(HARMONIC_MATERIAL_LOOKUP('Harmonic\\Glass').texture?.alpha).toBe(true);
  });

  it('falls back to loud magenta for unknown names', () => {
    const m = HARMONIC_MATERIAL_LOOKUP('nope/missing');
    expect(m.color).toEqual([1, 0, 1]);
    expect(m.surfaceProp).toBeTruthy();
  });
});

describe('createHarmonicAssets', () => {
  const assets = createHarmonicAssets();
  it('maps materials to engine info', () => {
    expect(assets.game).toBe('hl2');
    expect(assets.material('harmonic/ice').surfaceProp).toBe('ice');
    expect(assets.material('harmonic/nodraw').nodraw).toBe(true);
    expect(assets.material('harmonic/sky').sky).toBe(true);
    expect(assets.model('models/x.mdl')).toBeNull();
    expect(assets.caption('x')).toBeNull();
  });
  it('knows every surface prop the materials use', () => {
    for (const d of Object.values(MATERIALS))
      expect(assets.surfaceProps.has(d.surfaceProp)).toBe(true);
    expect(assets.surfaceProps.get('ice').friction).toBeLessThan(
      assets.surfaceProps.get('concrete').friction,
    );
  });
});

describe('purity', () => {
  it('pure modules reference no DOM globals', () => {
    const dir = __dirname;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f === 'texture-cache.ts') continue;
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(src, f).not.toMatch(
        /\b(document|window|OffscreenCanvas|HTMLCanvasElement|ImageData|createImageBitmap|Math\.random)\b/,
      );
    }
  });
});
