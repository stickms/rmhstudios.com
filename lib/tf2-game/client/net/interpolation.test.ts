/**
 * Interpolation: an entity moving at constant velocity, snapshots at 33 Hz
 * arriving with jitter and 2 % loss, sampled at 144 Hz through the render
 * clock — drawn motion is monotonic and steady (per-frame speed within a few
 * percent of the true speed), a lost snapshot is bridged, a long gap
 * extrapolates at most 0.25 s, angles take the short way round, and teleports
 * snap.
 */
import { describe, expect, it } from 'vitest';
import { UniformRandomStream } from '../../core/random';
import { NET_PLAYER, NET_PROJECTILE, createNetRecord, type NetRecord } from '../../sim/net-schema';
import { captureRecord, type EntityState } from '../../net/snapshot';
import {
  DEFAULT_INTERP,
  InterpolationBuffer,
  MAX_EXTRAPOLATION,
  RenderClock,
  SNAPSHOT_INTERVAL,
} from './interpolation';

const TICK = 0.015;

function playerState(key: number, x: number, yaw: number, vx: number, serial = 1): EntityState {
  const rec = createNetRecord(NET_PLAYER);
  rec.ox = x;
  rec.oy = 100;
  rec.oz = 50;
  rec.yaw = yaw;
  rec.vx = vx;
  const c = captureRecord(key, serial, NET_PLAYER, rec);
  return { key, serial, schema: NET_PLAYER, owner: false, values: c.pub };
}

describe('interpolation', () => {
  it('draws constant-velocity motion smoothly through jitter and loss', () => {
    const rng = new UniformRandomStream(4);
    const clock = new RenderClock();
    const buf = new InterpolationBuffer();
    const speed = 300;
    const arrivals: Array<{ at: number; tick: number }> = [];
    for (let tick = 2; tick <= 2 * 33 * 20; tick += 2) {
      if (rng.randomFloat() < 0.02) continue;
      arrivals.push({ at: tick * TICK * 1000 + 40 + rng.randomFloat(-12, 12), tick });
    }
    arrivals.sort((a, b) => a.at - b.at);
    const out: NetRecord = {};
    let ai = 0;
    let lastX = -Infinity;
    let frames = 0;
    let worst = 0;
    let extrapolated = 0;
    for (let ms = 0; ms < 20_000; ms += 1000 / 144) {
      while (ai < arrivals.length && arrivals[ai].at <= ms) {
        const { tick } = arrivals[ai++];
        clock.onSnapshot(tick, ms);
        buf.push(tick * TICK, playerState(5, tick * TICK * speed, 0, speed));
      }
      if (!clock.isSynced) continue;
      const rt = clock.renderTime(ms);
      const how = buf.sample(5, rt, out);
      if (how === 'none') continue;
      if (how === 'extrapolated') extrapolated++;
      const x = out.ox as number;
      if (ms > 2000) {
        expect(x).toBeGreaterThanOrEqual(lastX - 1e-6);
        const step = (x - lastX) * 144;
        worst = Math.max(worst, Math.abs(step - speed) / speed);
        frames++;
      }
      lastX = x;
    }
    expect(frames).toBeGreaterThan(2500);
    // Coords are 1/32-unit; at 300 u/s and 144 Hz a frame moves ~2 units, so ±3 % plus slewing.
    expect(worst).toBeLessThan(0.12);
    expect(extrapolated).toBeLessThan(frames * 0.05);
  });

  it('renders two snapshot intervals behind the server', () => {
    const clock = new RenderClock();
    for (let i = 1; i <= 40; i++) clock.onSnapshot(i * 2, i * 30 + 25);
    const st = clock.serverTime(40 * 30 + 25);
    expect(st).toBeCloseTo(80 * TICK, 2);
    expect(clock.renderTime(40 * 30 + 25)).toBeCloseTo(st - DEFAULT_INTERP, 2);
    expect(DEFAULT_INTERP).toBeCloseTo(2 * SNAPSHOT_INTERVAL, 9);
  });

  it('extrapolates a gap for at most 0.25 s, then holds', () => {
    const buf = new InterpolationBuffer();
    buf.push(1.0, playerState(1, 0, 0, 400));
    buf.push(1.03, playerState(1, 12, 0, 400));
    const out: NetRecord = {};
    expect(buf.sample(1, 1.13, out)).toBe('extrapolated');
    expect(out.ox as number).toBeCloseTo(12 + 0.1 * 400, 1);
    buf.sample(1, 3, out);
    expect(out.ox as number).toBeCloseTo(12 + MAX_EXTRAPOLATION * 400, 1);
    // A schema without velocity uses the last two samples.
    const p = new InterpolationBuffer();
    const proj = (x: number) => {
      const r = createNetRecord(NET_PROJECTILE);
      r.ox = x;
      const c = captureRecord(9, 1, NET_PROJECTILE, r);
      return {
        key: 9,
        serial: 1,
        schema: NET_PROJECTILE,
        owner: false,
        values: c.pub,
      } as EntityState;
    };
    p.push(0, proj(0));
    p.push(0.03, proj(33));
    expect(p.sample(9, 0.06, out)).toBe('extrapolated');
    expect(out.ox as number).toBeCloseTo(66, 0);
  });

  it('takes the short way round and snaps on teleports and new serials', () => {
    const buf = new InterpolationBuffer();
    const out: NetRecord = {};
    buf.push(0, playerState(2, 0, 170, 0));
    buf.push(0.03, playerState(2, 0, -170, 0));
    buf.sample(2, 0.015, out);
    expect(Math.abs(Math.abs(out.yaw as number) - 180)).toBeLessThan(0.5);

    buf.push(0.06, playerState(2, 5000, 0, 0)); // 5000 units in 30 ms
    buf.sample(2, 0.05, out);
    expect(out.ox).toBe(0);
    buf.sample(2, 0.06, out);
    expect(out.ox).toBe(5000);

    buf.push(0.09, playerState(2, 5010, 0, 0, 2)); // the slot was reused
    buf.sample(2, 0.075, out);
    expect(out.ox).toBe(5010);

    buf.push(0.12, playerState(2, 5020, 0, 0, 2));
    buf.teleported(2);
    buf.push(0.15, playerState(2, 5030, 0, 0, 2));
    buf.sample(2, 0.14, out);
    expect(out.ox).toBe(5020);
  });
});
