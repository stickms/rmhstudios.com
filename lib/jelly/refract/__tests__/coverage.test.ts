import { describe, expect, it } from 'vitest';
import { placement } from '../coverage';
import { REFRACT } from '../profile';

const scene = { width: 1000, height: 800, scrollX: 0, scrollY: 400 };
const band = REFRACT.bandPx;

describe('placement', () => {
  it('lines an in-flow host up with the page behind it, independent of the current scroll', () => {
    // An in-flow host is placed by its document position: scrolling does not move its picture inside it.
    const host = { left: 100, top: 900, width: 300, height: 120, fixed: false };
    const a = placement(scene, host, { x: 0, y: 400 }, band);
    const b = placement(scene, host, { x: 0, y: 650 }, band);
    expect(b.offsetX).toBe(a.offsetX);
    expect(b.offsetY).toBe(a.offsetY);
    // Document top 900 minus the scene's 400 scroll = 500 in the picture; the layer starts one pad above it.
    expect(a.offsetY).toBe(-(500 - REFRACT.padPx));
    expect(a.offsetX).toBe(-(100 - REFRACT.padPx));
    expect(a.cover).toBe(1);
  });

  it('moves a fixed host 1:1 with the scroll since the picture was taken (Review Focus 5)', () => {
    const bar = { left: 0, top: 0, width: 1000, height: 64, fixed: true };
    const at = (y: number) => placement(scene, bar, { x: 0, y }, band);
    expect(at(400).offsetY).toBe(REFRACT.padPx);
    expect(at(500).offsetY - at(400).offsetY).toBe(-100);
    expect(at(300).offsetY - at(400).offsetY).toBe(100);
  });

  it('covers fully while the picture is where it was taken', () => {
    const bar = { left: 0, top: 0, width: 1000, height: 64, fixed: true };
    expect(placement(scene, bar, { x: 0, y: 400 }, band).cover).toBe(1);
  });

  it('reaches 0 once the displaced picture no longer covers the host, and falls monotonically (Review Focus 3)', () => {
    const bar = { left: 0, top: 0, width: 1000, height: 64, fixed: true };
    let prev = 1;
    let zeroAt = -1;
    for (let d = 0; d <= 1200; d += 20) {
      const c = placement(scene, bar, { x: 0, y: 400 + d }, band).cover;
      expect(c).toBeLessThanOrEqual(prev + 1e-9);
      expect(c).toBeGreaterThanOrEqual(0);
      prev = c;
      if (c === 0 && zeroAt < 0) zeroAt = d;
    }
    expect(prev).toBe(0);
    // Gone by the time the shift is a whole viewport.
    expect(zeroAt).toBeLessThanOrEqual(scene.height);
    // Scrolling back up (a negative shift) fades the same way.
    expect(placement(scene, bar, { x: 0, y: 400 - 900 }, band).cover).toBe(0);
  });

  it('measures coverage over the part of the host that is on screen, so a tall pane is not dimmed for what is below the fold', () => {
    const pane = { left: 0, top: 500, width: 600, height: 4000, fixed: false };
    expect(placement(scene, pane, { x: 0, y: 400 }, band).cover).toBe(1);
  });

  it('gives an in-flow host that was never in the picture no cover', () => {
    const below = { left: 0, top: 5000, width: 300, height: 200, fixed: false };
    expect(placement(scene, below, { x: 0, y: 4900 }, band).cover).toBe(0);
  });
});
