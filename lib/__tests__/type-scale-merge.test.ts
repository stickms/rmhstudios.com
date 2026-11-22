/**
 * E2: the named type steps and layer utilities (app/globals.css, "E2 type scale") must behave
 * under `cn()` exactly as the arbitrary `text-[Npx]` / `z-[N]` they replaced. tailwind-merge only
 * knows Tailwind's own names, so each one is registered in lib/utils.ts; this keeps that list
 * equal to the CSS so a new step cannot be added to one and forgotten in the other.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE_SCALE_STEPS, Z_LAYER_NAMES, cn } from '@/lib/utils';
import { readCss } from './css-source';

const css = readCss(join(process.cwd(), 'app', 'globals.css'));
const block = css.slice(css.indexOf('/* E2 type scale'), css.indexOf('/* A full radius'));

describe('E2 named steps stay registered with tailwind-merge', () => {
  it('lists exactly the --text-* steps in the E2 @theme block', () => {
    const steps = [...block.matchAll(/--text-([a-z0-9-]+):/g)].map((m) => m[1]);
    expect([...TYPE_SCALE_STEPS].sort()).toEqual(steps.sort());
  });

  it('lists exactly the z-* @utility layers in the E2 block', () => {
    const layers = [...block.matchAll(/@utility z-([a-z-]+)/g)].map((m) => m[1]);
    expect([...Z_LAYER_NAMES].sort()).toEqual(layers.sort());
  });

  it('a named size replaces another size but keeps the colour', () => {
    expect(cn('text-sm text-white', 'text-micro')).toBe('text-white text-micro');
    expect(cn('text-micro', 'text-sm')).toBe('text-sm');
    expect(cn('text-rem-70 text-site-text')).toBe('text-rem-70 text-site-text');
  });

  it('a named layer replaces a numeric one and vice versa', () => {
    expect(cn('z-50', 'z-popover')).toBe('z-popover');
    expect(cn('z-popover', 'z-50')).toBe('z-50');
    expect(cn('z-call-dialog', 'z-call')).toBe('z-call');
  });
});
