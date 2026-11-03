import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FOLLOW_SELECTOR, followViewportShift } from '../viewport-shift';

/**
 * iOS Safari updates the layout of `position: fixed` elements late while its toolbar grows and shrinks, so a bottom-anchored
 * element that does not subtract `--vv-shift` trails the tab bar. Before `followViewportShift` only three components
 * subscribed (the orb, the compose button, back-to-top); the cookie bar, mini-player and party bar — every
 * `.bottom-above-dock` element — did not.
 */

class FakeEl {
  props = new Map<string, string>();
  style = {
    setProperty: (k: string, v: string) => void this.props.set(k, v),
    removeProperty: (k: string) => void this.props.delete(k),
  };
}

function setup() {
  const els = [new FakeEl(), new FakeEl()];
  const root = {
    querySelectorAll: (sel: string) => {
      expect(sel).toBe(FOLLOW_SELECTOR);
      return els as unknown as NodeListOf<HTMLElement>;
    },
  };
  let push: (px: number) => void = () => {};
  let unsubscribed = false;
  const subscribe = (fn: (px: number) => void) => {
    push = fn;
    fn(0);
    return () => {
      unsubscribed = true;
    };
  };
  return { els, root, subscribe, push: (px: number) => push(px), unsubscribed: () => unsubscribed };
}

describe('followViewportShift', () => {
  it('writes the shift on every following element and removes it at 0', () => {
    const t = setup();
    followViewportShift(t.root, t.subscribe);
    expect(t.els.every((e) => !e.props.has('--vv-shift'))).toBe(true);
    t.push(12.5);
    expect(t.els.map((e) => e.props.get('--vv-shift'))).toEqual(['12.5px', '12.5px']);
    t.push(-6);
    expect(t.els[0].props.get('--vv-shift')).toBe('-6px');
    t.push(0);
    expect(t.els.every((e) => !e.props.has('--vv-shift'))).toBe(true);
  });

  it('stopping unsubscribes and leaves nothing behind', () => {
    const t = setup();
    const stop = followViewportShift(t.root, t.subscribe);
    t.push(8);
    stop();
    expect(t.unsubscribed()).toBe(true);
    expect(t.els.every((e) => !e.props.has('--vv-shift'))).toBe(true);
  });
});

describe('the floating stack subtracts the shift', () => {
  const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
  const rule = (selector: string) => {
    const i = css.indexOf(selector);
    expect(i, selector).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
  };

  it('.bottom-above-dock (cookie bar, mini-player, party bar) follows --vv-shift', () => {
    expect(rule('.bottom-above-dock {')).toContain('var(--vv-shift, 0px)');
  });

  it('every stacked floating member follows --vv-shift, so none trails the one beneath it', () => {
    expect(rule(".vibe-app:has([data-floating='hub']) [data-floating='cookie'] {")).toContain('--vv-shift');
    expect(
      rule(
        ".vibe-app:has([data-floating='hub']) [data-floating='miniplayer'],\n  .vibe-app:has([data-floating='cookie']) [data-floating='miniplayer'] {",
      ),
    ).toContain('--vv-shift');
  });
});
