import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * iOS Safari lays `position: fixed` elements out against a container it resizes late while its toolbar grows and shrinks.
 * The floating stack (cookie bar, mini-player, party bar, back-to-top, the compose button, the theme preview bar) follows
 * the visible bottom in CSS alone: `bottom: calc(… + var(--vv-follow, 0px))`, where `--vv-follow` is
 * `100% - 100dvh` on iOS WebKit and `0px` everywhere else. No script is in that loop, and the hub is no exception: the
 * orb, the open menu's overlay (and the foot pill inside it) and the globe dock follow in CSS too, and the docked
 * globe's pose is a CSS function of the visible height, so nothing measures the toolbar. The earlier script path
 * (`--vv-shift`, a 1px probe read in a rAF loop) trailed the toolbar by at least a frame and is gone.
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

  it('the hub orb, the open menu and the globe dock follow in CSS as well, with no script in the loop', () => {
    // The orb's bottom edge and the overlay's (which carries the foot pill) both add the follow to their offsets.
    expect(radial).toContain('bottom: calc(var(--orb-bottom) + var(--vv-follow, 0px));');
    expect(rule(radial, '.radial-hub__overlay {')).toContain('bottom: calc(1.5rem + var(--vv-follow, 0px));');
    // The dock box is centred on the VISIBLE area (container middle less half the follow) ...
    expect(rule(radial, '.radial-hub__dock {')).toContain('top: calc(50% - var(--vv-follow, 0px) / 2);');
    // ... and the docked globe's vertical travel is a CSS length of the visible height, not a measured one.
    const pose = rule(radial, '.radial-hub[data-phase] .radial-hub__dock .radial-globe {');
    expect(pose).toContain(
      'calc(var(--hub-half-vh) - var(--orb-bottom) - var(--site-hub-orb-size) / 2 + var(--dock-kc, 0px))',
    );
    expect(rule(radial, '.radial-hub {')).toContain('--orb-bottom:');
    expect(radial).toMatch(/@supports \(height: 100dvh\) \{\s*\.radial-hub \{\s*--hub-half-vh: 50dvh;/);
  });

  it('nothing measures the toolbar any more: --vv-shift, its hook and its probe are gone', () => {
    expect(globals).not.toContain('--vv-shift');
    expect(radial).not.toContain('--vv-shift');
    expect(radial).not.toContain('--dock-dy');
    expect(radial).not.toContain('--sun-y');
    expect(existsSync(join(__dirname, '../viewport-shift.ts'))).toBe(false);
    expect(existsSync(join(__dirname, '../../hooks/useViewportShift.ts'))).toBe(false);
    const hub = read('components/radial/RadialHub.tsx');
    expect(hub).not.toContain('useViewportShift');
    expect(hub).not.toContain('--vv-shift');
    expect(hub).not.toContain('--dock-dy');
    expect(hub).not.toContain('--sun-y');
  });
});
