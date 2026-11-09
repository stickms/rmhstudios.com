/**
 * The refractive-glass contract (docs/superpowers/specs/2026-11-08-refractive-glass-design.md; docs/plasmatic-jelly-system.md
 * §1.2), as source gates: what the rim layer may and may not be made of, and that the numbers the CSS restates are the ones
 * the TypeScript owns. What a layer looks like is checked in real browsers (docs/page-consistency.md "How consistency is
 * enforced"); this file is what stops it quietly turning into something else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSS_FALLBACKS } from '@/lib/jelly/refract/layer';
import { DISPERSION, REFRACT } from '@/lib/jelly/refract/profile';
import { JELLY_BUDGETS, JELLY_LAYER_SELECTOR, refractionEnabled } from '@/lib/jelly/tiers';
import { SCENE_EXCLUDE } from '@/lib/liquid/glass/scene';

const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripComments(read('app/jelly-refract.css'));
const REFRACT_DIR = path.join(ROOT, 'lib/jelly/refract');
const SOURCES = fs
  .readdirSync(REFRACT_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({
    file: `lib/jelly/refract/${f}`,
    src: stripComments(read(`lib/jelly/refract/${f}`)),
  }));

describe('the refraction sheet', () => {
  it('has no backdrop-filter, no infinite animation, no keyframes and no will-change', () => {
    expect(CSS).not.toMatch(/backdrop-filter/);
    expect(CSS).not.toMatch(/\binfinite\b/);
    expect(CSS).not.toMatch(/@keyframes/);
    expect(CSS).not.toMatch(/will-change/);
  });

  it('draws the band through a plain `filter` fed by a custom property, never an inline url or a filter function', () => {
    expect(CSS).toMatch(/filter:\s*var\(--rf-flt,\s*none\)/);
    expect(CSS).not.toMatch(/filter:\s*(blur|drop-shadow|brightness|contrast|saturate)/);
  });

  it('fades by one opacity transition of at most 300 ms, and only opacity and visibility transition', () => {
    const transitions = [...CSS.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) {
      for (const seg of t.split(',').map((x) => x.trim())) {
        expect(seg).toMatch(/^(opacity|visibility)\b/);
        for (const ms of seg.matchAll(/(\d+)ms/g)) expect(Number(ms[1])).toBeLessThanOrEqual(300);
      }
    }
  });

  it('is hidden in print and under the app high-contrast mode', () => {
    expect(CSS).toMatch(/@media print\s*\{\s*\.jelly-refract\s*\{\s*display:\s*none/);
    expect(CSS).toMatch(/\.app-high-contrast \.jelly-refract\s*\{\s*display:\s*none/);
  });

  it('mirrors the pad that profile.ts owns', () => {
    expect(CSS_FALLBACKS.pad).toBe(`${REFRACT.padPx}px`);
    expect(CSS).toContain(`var(--rf-pad, ${REFRACT.padPx}px)`);
  });

  it('lays the page ground under the picture, so the dispersion never draws a one-colour stripe at the picture’s edge', () => {
    expect(CSS).toMatch(/linear-gradient\(var\(--rf-ground, transparent\) 0 0\)/);
  });

  it('has no box of its own on the span: it carries properties, the pseudo-elements draw', () => {
    expect(CSS).toMatch(/\.jelly-refract\s*\{\s*display:\s*contents;\s*\}/);
  });

  it('is imported by the global sheet', () => {
    expect(read('app/globals.css')).toMatch(/@import '\.\/jelly-refract\.css';/);
  });
});

describe('the refraction services', () => {
  it('never schedule a frame: no requestAnimationFrame, no drive(), no setInterval', () => {
    for (const { file, src } of SOURCES) {
      expect(src, file).not.toMatch(/requestAnimationFrame/);
      expect(src, file).not.toMatch(/\bdrive\(/);
      expect(src, file).not.toMatch(/setInterval/);
    }
  });

  it('use no backdrop-filter and no WebGL', () => {
    for (const { file, src } of SOURCES) {
      expect(src, file).not.toMatch(/backdrop-?filter/i);
      expect(src, file).not.toMatch(/getContext\(\s*['"]webgl/);
    }
  });

  it('do not read the document direction (the light never mirrors)', () => {
    for (const { file, src } of SOURCES)
      expect(src, file).not.toMatch(/\bdir\b\s*[=:]|\.dir\b|rtl/i);
  });

  it('never import the low-end capability or the retired modules', () => {
    for (const { file, src } of SOURCES) {
      expect(src, file).not.toMatch(/low-end|perf[-]lite/);
      expect(src, file).not.toMatch(/liquid\/glass\/(engine|renderer|shader)/);
    }
  });
});

describe('the numbers', () => {
  it('derives the dispersion from the design tokens: red leans toward the light by disperse/bevel, blue as far away', () => {
    const globals = read('app/globals.css');
    const num = (name: string) => Number(new RegExp(`${name}:\\s*(-?[\\d.]+)px`).exec(globals)![1]);
    const bevel = num('--gel-bevel');
    expect(DISPERSION.r).toBeCloseTo(1 + Math.abs(num('--gel-disperse-r')) / bevel, 5);
    expect(DISPERSION.b).toBeCloseTo(1 - Math.abs(num('--gel-disperse-b')) / bevel, 5);
    expect(DISPERSION.g).toBe(1);
  });

  it('keeps the overscan pad at least as deep as the deepest dispersed push', () => {
    expect(REFRACT.padPx).toBeGreaterThanOrEqual(Math.ceil(REFRACT.depthPx * DISPERSION.r));
  });

  it('budgets hosts per tier: never more on a weaker tier, none when the material is off, and the switch reads them', () => {
    expect(JELLY_BUDGETS.full.refractHosts).toBeGreaterThanOrEqual(
      JELLY_BUDGETS.coarse.refractHosts,
    );
    expect(JELLY_BUDGETS.coarse.refractHosts).toBeGreaterThanOrEqual(
      JELLY_BUDGETS.handheld.refractHosts,
    );
    expect(JELLY_BUDGETS.off.refractHosts).toBe(0);
    expect(refractionEnabled()).toBe(Object.values(JELLY_BUDGETS).some((b) => b.refractHosts > 0));
  });

  it('is dormant until a budget is set: the hook imports nothing while every tier is 0', () => {
    const hook = stripComments(read('hooks/useLiquidInteractions.ts'));
    expect(hook).toMatch(/if \(refractionEnabled\(\)\)/);
    expect(hook).toMatch(/import\('@\/lib\/jelly\/refract\/install'\)/);
  });

  it('keeps the layer out of the picture and treats it as a service layer, not content', () => {
    expect(SCENE_EXCLUDE).toContain('.jelly-refract');
    expect(JELLY_LAYER_SELECTOR).toContain('.jelly-refract');
  });
});
