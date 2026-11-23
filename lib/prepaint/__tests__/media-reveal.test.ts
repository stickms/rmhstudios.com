// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mediaRevealStep } from '../media-reveal';
import type { PrepaintCtx } from '../types';

/**
 * A picture that loads inside the wait (cached: every remount of a feed avatar on a tab switch, a navigation or the
 * composer's swap) is never hidden and must not fade, or it blinks out and back (owner, 2026-11-23). Only a picture
 * the CSS wait had already hidden is marked to fade in.
 */
function setup(opacityAtLoad: string) {
  const listeners: Record<string, (e: Event) => void> = {};
  const attrs = new Map<string, string>();
  const img = {
    tagName: 'IMG',
    hasAttribute: (k: string) => attrs.has(k),
    setAttribute: (k: string, v: string) => attrs.set(k, v),
  };
  const ctx = {
    doc: { addEventListener: (type: string, fn: (e: Event) => void) => (listeners[type] = fn) },
    html: { classList: { add: () => {} } },
    win: { getComputedStyle: () => ({ opacity: opacityAtLoad }) },
  } as unknown as PrepaintCtx;
  mediaRevealStep(ctx);
  return { fire: (type: string) => listeners[type]?.({ target: img } as unknown as Event), attrs };
}

describe('media reveal marks only the images the wait hid', () => {
  it('an image that loaded before the wait ended is marked plain: it stays shown, no fade', () => {
    const { fire, attrs } = setup('1');
    fire('load');
    expect(attrs.get('data-loaded')).toBe('');
  });

  it('an image the wait already hid is marked to fade in', () => {
    const { fire, attrs } = setup('0');
    fire('load');
    expect(attrs.get('data-loaded')).toBe('reveal');
  });

  it('an error marks too, so a broken image shows its alt text', () => {
    const { fire, attrs } = setup('0');
    fire('error');
    expect(attrs.has('data-loaded')).toBe(true);
  });
});
