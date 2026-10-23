import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DoughBody } from '../../dough';
import { bakeLut } from '../../eversion/projection-lut';
import { peirce } from '../../eversion/projections/peirce';
import { tryBakePeirceLut, warmProjectionWasm } from '../projection';
import { serveWasm } from './fixtures';

beforeAll(async () => {
  serveWasm();
  await warmProjectionWasm();
});
afterAll(() => vi.unstubAllGlobals());

function maxError(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let error = 0;
  for (let i = 0; i < a.length; i++) error = Math.max(error, Math.abs(a[i] - b[i]));
  return error;
}

describe('real WebAssembly dough', () => {
  it('preserves a live drag during migration, volume, deformation, and settling', async () => {
    const js = new DoughBody(),
      wasm = new DoughBody();
    js.grab(-0.4, 0.15);
    wasm.grab(-0.4, 0.15);
    for (let i = 0; i < 12; i++) {
      js.step(1 / 60);
      wasm.step(1 / 60);
    }
    const before = wasm.field.slice();
    expect(await wasm.enableWasm()).toBe(true);
    expect(wasm.field).toEqual(before);
    const buffer = wasm.field.buffer;
    const a = new Float64Array(2),
      b = new Float64Array(2);
    for (let i = 0; i < 200; i++) {
      if (i < 60) {
        const x = -0.4 + i / 100;
        js.drag(x, 0.15, 0.6, -0.1);
        wasm.drag(x, 0.15, 0.6, -0.1);
      } else if (i === 60) {
        js.release();
        wasm.release();
      }
      if (i === 80) {
        js.nudge(1.2, -0.8);
        wasm.nudge(1.2, -0.8);
      }
      const dt = i % 15 === 0 ? 0.075 : 1 / 60;
      expect(wasm.step(dt)).toBe(js.step(dt));
      expect(maxError(js.field, wasm.field)).toBeLessThan(2e-6);
      expect(Math.abs(wasm.volume())).toBeLessThan(1e-3);
      js.deform(0.25, 0.1, a, 0.8);
      wasm.deform(0.25, 0.1, b, 0.8);
      expect(b[0]).toBeCloseTo(a[0], 6);
      expect(b[1]).toBeCloseTo(a[1], 6);
      expect(wasm.depth(0.25, 0.1)).toBeCloseTo(js.depth(0.25, 0.1), 6);
      expect(wasm.field.buffer).toBe(buffer);
    }
    for (let i = 0; i < 600; i++) {
      js.step(1 / 60);
      wasm.step(1 / 60);
    }
    expect(wasm.active()).toBe(false);
    expect(wasm.peak()).toBe(0);
    expect(wasm.field).toEqual(js.field);
  });

  it('isolates bodies and deduplicates activation', async () => {
    const a = new DoughBody(),
      b = new DoughBody();
    expect(a.enableWasm()).toBe(a.enableWasm());
    expect(await a.enableWasm()).toBe(true);
    expect(await b.enableWasm()).toBe(true);
    expect(a.field.buffer).not.toBe(b.field.buffer);
    a.grab(0.1, 0.2);
    a.step(0.1);
    expect(a.peak()).toBeGreaterThan(0);
    expect(b.peak()).toBe(0);
  });
});

describe('real WebAssembly Peirce LUT', () => {
  it.each([
    [1024, 512, 1920, 1080],
    [128, 64, 390, 844],
    [126, 62, 1000, 1000],
    [31, 17, 390, 844],
    [128, 64, 100, 10000],
  ])('matches JS at %ix%i for viewport %ix%i', (w, h, vw, vh) => {
    const fit = peirce.fit(vw, vh);
    const expected = bakeLut(peirce, fit, [w, h]);
    const actual = tryBakePeirceLut(fit, w, h);
    expect(actual).not.toBeNull();
    expect(maxError(actual!, expected)).toBeLessThan(1e-6);
  });

  it('returns owned buffers and rejects sizes outside fixed memory', () => {
    const first = tryBakePeirceLut(peirce.fit(1920, 1080), 64, 32)!;
    const saved = first.slice();
    tryBakePeirceLut(peirce.fit(390, 844), 64, 32);
    expect(first).toEqual(saved);
    expect(tryBakePeirceLut(peirce.fit(1, 1), 2048, 1024)).toBeNull();
    expect(tryBakePeirceLut(peirce.fit(1, 1), 0, 0)).toBeNull();
  });
});
