import { describe, expect, it } from 'vitest';
import { MIN_SPAN, ZOOM_STEP, clampView, inView, panView, zoomView } from './chart-zoom';

const full = [0, 100] as const;

describe('chart zoom and pan', () => {
  it('zooms about the anchor, keeping the data under it where it was', () => {
    const v = zoomView(null, full, 0.5, 0.5)!;
    expect(v).toEqual([25, 75]);
    const left = zoomView(null, full, 0.5, 0)!;
    expect(left).toEqual([0, 50]);
    const anchored = zoomView([20, 60], full, 0.5, 0.25)!;
    // 30 sat a quarter of the way in, and still does.
    expect(anchored[0] + (anchored[1] - anchored[0]) * 0.25).toBeCloseTo(30);
  });

  it('never zooms past the narrowest view, and zooming out to the whole domain is no zoom', () => {
    let v: readonly [number, number] | null = null;
    for (let i = 0; i < 30; i++) v = zoomView(v, full, ZOOM_STEP);
    expect(v![1] - v![0]).toBe(MIN_SPAN);
    expect(zoomView([10, 60], full, 1 / ZOOM_STEP / ZOOM_STEP)).toBeNull();
    expect(zoomView(null, full, 2)).toBeNull();
  });

  it('pans inside the domain only, and only when zoomed', () => {
    expect(panView(null, full, 0.5)).toBeNull();
    expect(panView([20, 40], full, 0.5)).toEqual([30, 50]);
    expect(panView([80, 100], full, 1)).toEqual([80, 100]);
    expect(panView([0, 20], full, -3)).toEqual([0, 20]);
  });

  it('clamps a view into the domain and knows what is inside it', () => {
    expect(clampView([-10, 10], full)).toEqual([0, 20]);
    expect(clampView([95, 115], full)).toEqual([80, 100]);
    expect(clampView([0, 3], [0, 4])).toEqual([0, 4]);
    expect(inView(5, [0, 10])).toBe(true);
    expect(inView(11, [0, 10])).toBe(false);
  });
});
