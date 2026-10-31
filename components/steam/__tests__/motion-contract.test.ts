import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Steam skin's motion is brief and minimal, and stays that way: short, one ease,
 * transform and opacity only for anything that enters, nothing that repeats, and a closed
 * drawer that cannot be focused. These read the source, so a later change that makes the
 * skin busier fails here instead of being noticed by a person.
 */

const css = readFileSync(join(__dirname, '..', 'steam.css'), 'utf8');
const shell = readFileSync(join(__dirname, '..', 'SteamShell.tsx'), 'utf8');

describe('steam motion contract', () => {
  it('is brief: the shared duration is at most 200ms', () => {
    const ms = Number(/--stm-dur:\s*(\d+)ms/.exec(css)?.[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(200);
  });

  it('never repeats and never transitions everything', () => {
    expect(css).not.toMatch(/\binfinite\b/);
    expect(css).not.toMatch(/transition:\s*all\b/);
    expect(css).not.toMatch(/@keyframes/);
  });

  it('enters only by opacity, transform or width (nothing that reflows the page)', () => {
    const blocks = [...css.matchAll(/@starting-style\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const props = [...b.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(['opacity', 'transform', 'width']).toContain(p);
    }
  });

  it('keeps the phone drawer mounted but inert while closed, so it can slide yet cannot be focused', () => {
    expect(shell).toMatch(/inert=\{!open\}/);
    expect(shell).not.toMatch(/hidden=\{!open\}/);
    expect(css).toMatch(/\.stm-drawer\s*\{[^}]*visibility:\s*hidden/);
  });
});
