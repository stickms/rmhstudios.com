import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCss } from './css-source';

/**
 * iOS Safari lays `position: fixed` elements out against a container it resizes late while its toolbar grows and shrinks.
 * The floating stack (cookie bar, mini-player, party bar, back-to-top, the compose button, the theme preview bar) follows
 * the visible bottom in CSS alone: `bottom: calc(… + var(--vv-follow, 0px))`, where `--vv-follow` is
 * `100% - 100dvh` on iOS WebKit and `0px` everywhere else. No script is in that loop, and the hub is no exception: the
 * docked globe follows in CSS too, so nothing measures the toolbar. The earlier script path
 * (`--vv-shift`, a 1px probe read in a rAF loop) trailed the toolbar by at least a frame and is gone.
 */
const read = (p: string) => readCss(join(__dirname, '../..', p));
const globals = read('app/globals.css');
const globe = read('components/shell/globe-nav.css');

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
  });

  it('the docked globe follows in CSS as well, with no script in the loop', () => {
    expect(globe).toContain('var(--vv-follow, 0px)');
  });

  it('nothing measures the toolbar any more: --vv-shift, its hook and its probe are gone', () => {
    expect(globals).not.toContain('--vv-shift');
    expect(globe).not.toContain('--vv-shift');
    expect(existsSync(join(__dirname, '../viewport-shift.ts'))).toBe(false);
    expect(existsSync(join(__dirname, '../../hooks/useViewportShift.ts'))).toBe(false);
  });
});
