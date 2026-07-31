import { describe, it, expect } from 'vitest';
import { keyboardInset, MIN_KEYBOARD_PX, MAX_UNZOOMED_SCALE } from '@/lib/keyboard-inset';

/** An iPhone-ish layout viewport, with the visual one whatever the case needs. */
const phone = (visual: { height?: number; offsetTop?: number; scale?: number } | null) => ({
  layoutHeight: 844,
  visualViewport: visual,
});

describe('keyboardInset — the reading', () => {
  it('is zero with no keyboard up (visual viewport fills the layout one)', () => {
    expect(keyboardInset(phone({ height: 844, offsetTop: 0, scale: 1 }))).toBe(0);
  });

  it('is the covered height when a keyboard is up', () => {
    // 844 layout, 508 visible → a 336px keyboard, about right for an iPhone.
    expect(keyboardInset(phone({ height: 508, offsetTop: 0, scale: 1 }))).toBe(336);
  });

  it('measures to the bottom of the VISIBLE band when the engine has panned', () => {
    // Same 336px keyboard, but the engine has already scrolled the visual
    // viewport down 40px to reveal the field, so the visible band is [40, 548]
    // of an 844 layout. The shell is anchored at 0, so what it has to give back
    // is what lies below 548 — 296px, not the keyboard's own 336.
    //
    // Under-shrinking rather than over-shrinking is the right direction here,
    // and it settles in one step: at 548 tall the field is visible without a
    // pan, the engine returns offsetTop to 0, and the reading becomes the plain
    // 336. It cannot oscillate, because the second state needs no pan.
    expect(keyboardInset(phone({ height: 508, offsetTop: 40, scale: 1 }))).toBe(296);
    expect(keyboardInset(phone({ height: 508, offsetTop: 0, scale: 1 }))).toBe(336);
  });
});

describe('keyboardInset — the guards', () => {
  it('reports nothing while the page is pinched, however small the visual viewport', () => {
    // A hard pinch shrinks the visual viewport far past any keyboard. Resizing
    // the game here would fight a deliberate accessibility gesture.
    expect(keyboardInset(phone({ height: 300, offsetTop: 0, scale: 2.5 }))).toBe(0);
    expect(keyboardInset(phone({ height: 100, offsetTop: 0, scale: 3 }))).toBe(0);
  });

  it('tolerates the float noise an unzoomed page reports', () => {
    const justUnder = keyboardInset(phone({ height: 508, scale: MAX_UNZOOMED_SCALE }));
    expect(justUnder).toBe(336);
    expect(keyboardInset(phone({ height: 508, scale: MAX_UNZOOMED_SCALE + 0.001 }))).toBe(0);
  });

  it('ignores differences too small to be a keyboard', () => {
    // Browser-chrome transition frames and rounding. Reacting would resize the
    // game a few pixels at a time while somebody scrolls.
    expect(keyboardInset(phone({ height: 844 - (MIN_KEYBOARD_PX - 1), scale: 1 }))).toBe(0);
    expect(keyboardInset(phone({ height: 844 - MIN_KEYBOARD_PX, scale: 1 }))).toBe(MIN_KEYBOARD_PX);
  });

  it('never reports a negative inset when the toolbars collapse', () => {
    // Toolbars scrolling away makes the visual viewport TALLER than the layout
    // one. That is extra room, not a keyboard.
    expect(keyboardInset(phone({ height: 920, offsetTop: 0, scale: 1 }))).toBe(0);
  });

  it('is zero where the browser has no visualViewport at all', () => {
    expect(keyboardInset(phone(null))).toBe(0);
    expect(keyboardInset({ layoutHeight: 844 })).toBe(0);
  });

  it('survives partial or nonsense readings rather than emitting NaN', () => {
    // `scale` is absent on some older engines; a missing height means nothing
    // has been measured yet. Either way the answer is "no keyboard", never a
    // NaN that would reach the stylesheet as `calc(100dvh - NaNpx)`.
    expect(keyboardInset(phone({ height: 508 }))).toBe(336);
    expect(keyboardInset(phone({ offsetTop: 0, scale: 1 }))).toBe(0);
    expect(keyboardInset({ layoutHeight: Number.NaN, visualViewport: { height: 508 } })).toBe(0);
    expect(keyboardInset(phone({ height: Number.NaN, scale: 1 }))).toBe(0);
  });
});
