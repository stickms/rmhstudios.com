import { describe, expect, it } from 'vitest';
import { LIQUID_FIELD, distanceToSurface, liquidWave, liquidRecovery } from '../interaction';
import { SoftBody, CONTACT_RADIUS } from '../../soft-body';

describe('liquid interaction field', () => {
  it('arrives later at distant surfaces and has no instantaneous jump', () => {
    const arrival = 180 / LIQUID_FIELD.speed;
    expect(liquidWave(arrival - 0.001, 180)).toBe(0);
    expect(liquidWave(arrival, 180)).toBe(0);
    expect(Math.abs(liquidWave(arrival + 1e-6, 180))).toBeLessThan(0.001);
    expect(liquidWave(arrival + 0.04, 180)).toBeGreaterThan(0);
  });
  it('attenuates with distance, rebounds, then reaches exact rest', () => {
    expect(liquidWave(0.07, 0)).toBeGreaterThan(liquidWave(0.07 + 200 / LIQUID_FIELD.speed, 200));
    expect(liquidWave(0.22, 0)).toBeLessThan(0);
    for (const distance of [0, 100, 400]) {
      expect(liquidWave(LIQUID_FIELD.lifetime + distance / LIQUID_FIELD.speed, distance)).toBe(0);
    }
    expect(liquidWave(1, 420)).toBe(0);
  });
  it('bounds invalid and excessive input instead of propagating NaNs', () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(liquidWave(value, 30)).toBe(0);
    expect(liquidWave(0.04, -1)).toBe(0);
    expect(liquidWave(0.04, 0, 100)).toBe(liquidWave(0.04, 0, 1));
    expect(liquidWave(0.04, 0, -100)).toBe(0);
  });
  it('measures large panes from their edge, including zero for an interior tap', () => {
    const rect = { left: 10, right: 210, top: 20, bottom: 120 };
    expect(distanceToSurface(100, 80, rect)).toBe(0);
    expect(distanceToSurface(213, 124, rect)).toBe(5);
  });
  it('starts and ends the wave with zero velocity and acceleration', () => {
    const h = 1e-5;
    for (const t of [0, LIQUID_FIELD.lifetime]) {
      const value = liquidWave(t, 0);
      const velocity = (liquidWave(t + h, 0) - liquidWave(t - h, 0)) / (2 * h);
      const acceleration = (liquidWave(t + h, 0) - 2 * value + liquidWave(t - h, 0)) / (h * h);
      expect(value).toBe(0);
      expect(Math.abs(velocity)).toBeLessThan(0.001);
      expect(Math.abs(acceleration)).toBeLessThan(0.02);
    }
  });
  it('recovers from an interrupted pose without losing its velocity or acceleration', () => {
    const h = 1e-5;
    const f = (t: number) => liquidRecovery(t, 1.2, -2.3, 3.1);
    expect(f(0)).toBe(1.2);
    expect((f(h) - f(-h)) / (2 * h)).toBeCloseTo(-2.3, 3);
    expect((f(h) - 2 * f(0) + f(-h)) / (h * h)).toBeCloseTo(3.1, 1);
    const end = LIQUID_FIELD.recovery;
    expect(f(end)).toBe(0);
    expect(Math.abs((f(end + h) - f(end - h)) / (2 * h))).toBeLessThan(0.001);
    expect(Math.abs((f(end + h) - 2 * f(end) + f(end - h)) / (h * h))).toBeLessThan(0.02);
  });
});

describe('finger contact', () => {
  it('dents below the finger and returns displaced material in a shoulder', () => {
    const body = new SoftBody();
    body.grab(0.2, 0.1);
    for (let i = 0; i < 120; i++) body.step(1 / 120);
    expect(body.depth(0.2, 0.1)).toBeLessThan(-0.1);
    expect(body.depth(0.2 + 2 * CONTACT_RADIUS, 0.1)).toBeGreaterThan(0);
    // Numerically integrate the normal field over the tangent plane.
    let volume = 0;
    for (let r = 0.001; r < 3; r += 0.002)
      volume += body.depth(0.2 + r, 0.1) * 2 * Math.PI * r * 0.002;
    expect(Math.abs(volume)).toBeLessThan(1e-5);
    body.release();
    for (let i = 0; i < 600; i++) body.step(1 / 120);
    expect(body.depth(0.2, 0.1)).toBe(0);
    expect(body.active()).toBe(false);
  });
  it('only applies perspective indentation to the front hemisphere', () => {
    const body = new SoftBody();
    body.grab(0.4, 0.2);
    for (let i = 0; i < 80; i++) body.step(1 / 120);
    const front = new Float64Array(2),
      back = new Float64Array(2),
      flat = new Float64Array(2);
    body.deform(0.4, 0.2, front, 1);
    body.deform(0.4, 0.2, back, -1);
    body.deform(0.4, 0.2, flat);
    expect([...back]).toEqual([...flat]);
    expect(front[0]).toBeLessThan(back[0]!);
  });
});
