import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * iOS Safari lays `position: fixed` elements out against a container it resizes late while its toolbar grows and shrinks.
 * The floating stack (cookie bar, mini-player, party bar, back-to-top, the compose button, the theme preview bar) follows
 * the visible bottom in CSS alone: `bottom: calc(… + var(--vv-follow, 0px))`, where `--vv-follow` is
 * `100% - 100dvh` on iOS WebKit and `0px` everywhere else. No script is in that loop. The hub orb and the globe dock
 * keep the measured `--vv-shift` (lib/viewport-shift.ts): their docking animation re-measures on it.
 */
const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
const globals = read('app/globals.css');
const radial = read('components/radial/radial.css');

const rule = (css: string, selector: string) => {
  const i = css.indexOf(selector);
  expect(i, selector).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('--vv-follow', () => {
  it('is 0px by default and the dynamic-viewport gap only on iOS WebKit, behind @supports', () => {
    expect(rule(globals, '  :root {\n    --vv-follow: 0px;')).toContain('--vv-follow: 0px');
    const supports = rule(globals, '@supports (height: 100dvh) {\n    html.ios-webkit {');
    expect(supports).toContain('--vv-follow: calc(100% - 100dvh)');
  });

  it('every floating-stack bottom rule adds it, and none of them still depends on the script', () => {
    expect(rule(globals, '.bottom-above-dock {')).toContain('var(--vv-follow, 0px)');
    expect(rule(globals, '.floating-fab-lane {')).toContain('var(--vv-follow, 0px)');
    expect(rule(globals, ".vibe-app:has([data-floating='hub']) [data-floating='cookie'] {")).toContain(
      'var(--vv-follow, 0px)',
    );
    expect(globals).not.toContain('--vv-shift, 0px');
    // The compose button's fixed rule (`.radial-feed__compose` is also restyled elsewhere, so match the declaration).
    expect(radial).toContain(
      'bottom: calc(var(--safe-bottom) + var(--site-fab-row-bottom) + var(--vv-follow, 0px));',
    );
    expect(radial).not.toContain('var(--site-fab-row-bottom) - var(--vv-shift');
  });

  it('the hub orb and the globe dock still use the measured shift', () => {
    expect(radial).toContain('bottom: calc(var(--orb-bottom) - var(--vv-shift, 0px));');
    expect(radial).toContain('top: calc(50% + var(--vv-shift, 0px) / 2);');
  });
});
