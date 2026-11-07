import { describe, expect, it } from 'vitest';
import { STILL_TIME, bufferSizeFor, createStreetScene, renderStreet } from '../street-scene';

describe('bufferSizeFor', () => {
  it('keeps the short side at 180 px on a phone held upright', () => {
    expect(bufferSizeFor(360, 640)).toEqual({ w: 180, h: 320 });
  });
  it('keeps the short side at 180 px on a phone held sideways', () => {
    expect(bufferSizeFor(667, 375)).toEqual({ w: 320, h: 180 });
  });
  it('gives a desktop 16:9 at the same pixel size', () => {
    expect(bufferSizeFor(1280, 720)).toEqual({ w: 320, h: 180 });
  });
  it('caps the long side on extreme aspects', () => {
    expect(bufferSizeFor(3440, 1440)).toEqual({ w: 400, h: 180 });
    expect(bufferSizeFor(200, 1000)).toEqual({ w: 180, h: 400 });
  });
  it('falls back to 16:9 before the container has a size', () => {
    expect(bufferSizeFor(0, 0)).toEqual({ w: 320, h: 180 });
  });
});

describe('renderStreet', () => {
  const SIZES: [number, number][] = [[320, 180], [180, 320], [400, 180], [180, 400]];

  it('is deterministic for a given size, time and pointer', () => {
    const a = createStreetScene(320, 180);
    const b = createStreetScene(320, 180);
    renderStreet(a, 3.3, 0.2, -0.4);
    renderStreet(b, 3.3, 0.2, -0.4);
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf));
  });

  it('changes over time (the scene is alive)', () => {
    const a = createStreetScene(320, 180);
    const b = createStreetScene(320, 180);
    renderStreet(a, 3.3);
    renderStreet(b, 4.1);
    let differing = 0;
    for (let i = 0; i < a.buf.length; i++) if (a.buf[i] !== b.buf[i]) differing++;
    expect(differing).toBeGreaterThan(500);
  });

  it('never reallocates its buffer and paints every pixel opaque', () => {
    for (const [w, h] of SIZES) {
      const scene = createStreetScene(w, h);
      const buf = scene.buf;
      const col = scene.col;
      for (let t = 0; t < 40; t += 3.7) renderStreet(scene, t, Math.sin(t), Math.cos(t));
      expect(scene.buf).toBe(buf);
      expect(scene.col).toBe(col);
      expect(scene.buf.length).toBe(w * h);
      for (let i = 0; i < scene.buf.length; i++) {
        if (scene.buf[i] >>> 24 !== 0xff) throw new Error(`pixel ${i} of ${w}x${h} is not opaque`);
      }
    }
  });

  it('stays inside a plum-and-neon palette (no stray colours, readable under text)', () => {
    const scene = createStreetScene(180, 320);
    renderStreet(scene, STILL_TIME);
    const colours = new Set<number>();
    let bright = 0;
    for (let i = 0; i < scene.buf.length; i++) {
      colours.add(scene.buf[i]);
      const c = scene.buf[i];
      const lum = ((c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255)) / 3;
      if (lum > 200) bright++;
    }
    expect(colours.size).toBeGreaterThan(40);
    // Only tubes, sparks and the odd drop are near white; the ground is dark enough for 4.5:1 text.
    expect(bright / scene.buf.length).toBeLessThan(0.03);
  });

  it('draws the street line and the fighters low in a portrait buffer', () => {
    const scene = createStreetScene(180, 320);
    expect(scene.streetY).toBeGreaterThan(320 * 0.7);
    expect(scene.streetY).toBeLessThan(320 * 0.9);
  });

  it('survives pointer extremes without throwing or writing out of range', () => {
    const scene = createStreetScene(320, 180);
    for (const [px, py] of [[-1, -1], [1, 1], [0, 1], [1, -1]] as const) renderStreet(scene, 11.5, px, py);
    expect(scene.buf.length).toBe(320 * 180);
  });

  it('draws the street without the pixel cast when 3D fighters stand on it instead', () => {
    const withCast = createStreetScene(320, 180);
    const bare = createStreetScene(320, 180, { cast: false });
    renderStreet(withCast, 2.2);
    renderStreet(bare, 2.2);
    expect(bare.cast).toBe(false);
    let differs = 0;
    for (let i = 0; i < bare.buf.length; i++) if (bare.buf[i] !== withCast.buf[i]) differs++;
    expect(differs).toBeGreaterThan(50); // the fighters are gone from the buffer
    expect(differs).toBeLessThan(bare.buf.length / 4); // and only they: the street is the same
  });
});
