/**
 * §9.5 — what the guest actually renders.
 *
 * The interpolation buffer is the difference between "20 Hz looks like 20 Hz"
 * and "20 Hz looks like the game". It is also the piece whose failures are
 * invisible in code review and unmistakable in play: a buffer that renders
 * ahead of authority produces characters that snap backwards, one that never
 * expands stutters on every jitter spike, and one that extrapolates without a
 * limit sails people through walls.
 */

import { describe, expect, it } from 'vitest';
import { NET } from '../constants';
import type { SeatIndex, Snapshot, SnapshotSeat } from '../types';
import { GuestInterpolator, LocalArmBlender } from '../net/guest';
import { SnapshotEncoder } from '../net/snapshot';

const STEP = 1000 / NET.SNAPSHOT_HZ;

function seat(index: SeatIndex, x: number, vx = 0): SnapshotSeat {
  return {
    seat: index,
    state: 'alive',
    head: { x, y: 0 },
    headV: { x: vx, y: 0 },
    headAngle: 0,
    handL: { x: x - 20, y: 0 },
    handR: { x: x + 20, y: 0 },
    gripL: 0,
    gripR: 0,
    gripTargetL: 0,
    gripTargetR: 0,
  };
}

function world(frame: number, x: number, vx = 0): Snapshot {
  return {
    frame,
    flags: 0,
    seats: [seat(0, x, vx)],
    props: [{ id: 1, x, y: 0, angle: 0 }],
  };
}

/** A host encoder + guest pair, so packets under test are real packets. */
function stream() {
  const encoder = new SnapshotEncoder();
  const guest = new GuestInterpolator();
  return {
    guest,
    send(snapshot: Snapshot, at: number) {
      return guest.push(encoder.encode(snapshot).buffer, at);
    },
  };
}

describe('interpolation buffer', () => {
  it('renders 100 ms behind the newest snapshot by default', () => {
    const { guest, send } = stream();
    expect(guest.bufferMs).toBe(NET.INTERP_BUFFER_MS);

    send(world(0, 0), 0);
    send(world(1, 100), STEP);
    send(world(2, 200), STEP * 2);
    send(world(3, 300), STEP * 3);

    // now = 150 → renderAt = 50, which is exactly the second snapshot.
    const frame = guest.sample(150);
    expect(frame.mode).toBe('interpolated');
    expect(frame.seats[0].head.x).toBeCloseTo(100, 0);
  });

  it('interpolates between two samples rather than stepping', () => {
    const { guest, send } = stream();
    send(world(0, 0), 0);
    send(world(1, 100), STEP);
    send(world(2, 200), STEP * 2);

    // renderAt = 25 → halfway between the samples at 0 and 50.
    const frame = guest.sample(125);
    expect(frame.seats[0].head.x).toBeGreaterThan(40);
    expect(frame.seats[0].head.x).toBeLessThan(60);
  });

  it('never renders ahead of authority', () => {
    const { guest, send } = stream();
    for (let newest = 0; newest < 20; newest++) {
      send(world(newest, newest * 10), newest * STEP);
      // Sample at the moment of arrival and a little after, throughout.
      for (const offset of [0, 5, 17, 33]) {
        const frame = guest.sample(newest * STEP + offset);
        if (frame.mode === 'interpolated') {
          expect(frame.frame).toBeLessThanOrEqual(newest);
          expect(frame.aheadMs).toBe(0);
        }
      }
    }
  });

  it('holds the oldest sample rather than extrapolating backwards', () => {
    const { guest, send } = stream();
    send(world(7, 42), 0);
    const frame = guest.sample(0); // renderAt = -100, before anything we have
    expect(frame.mode).toBe('interpolated');
    expect(frame.seats[0].head.x).toBeCloseTo(42, 1);
  });

  it('reports an empty frame before the first snapshot', () => {
    const guest = new GuestInterpolator();
    const frame = guest.sample(1000);
    expect(frame.mode).toBe('empty');
    expect(frame.seats).toHaveLength(0);
  });
});

describe('jitter adaptation', () => {
  it('expands the buffer immediately when arrivals get erratic', () => {
    const { guest, send } = stream();
    // 50/150/50/150 — a 100 ms mean deviation, which is exactly the condition
    // a fixed 100 ms buffer cannot absorb.
    const arrivals = [0, 50, 200, 250, 400, 450, 600];
    arrivals.forEach((at, i) => send(world(i, i * 10), at));

    expect(guest.bufferMs).toBeGreaterThan(NET.INTERP_BUFFER_MS);
    expect(guest.bufferMs).toBeLessThanOrEqual(NET.INTERP_BUFFER_MAX_MS);
  });

  it('never expands past INTERP_BUFFER_MAX_MS', () => {
    const { guest, send } = stream();
    let at = 0;
    for (let i = 0; i < 20; i++) {
      at += i % 2 === 0 ? 10 : 900; // pathological
      send(world(i, i), at);
    }
    expect(guest.bufferMs).toBe(NET.INTERP_BUFFER_MAX_MS);
  });

  it('gives the slack back slowly once the connection settles', () => {
    const { guest, send } = stream();
    let at = 0;
    let frame = 0;
    for (let i = 0; i < 8; i++) {
      at += i % 2 === 0 ? 50 : 150;
      send(world(frame++, frame), at);
    }
    const expanded = guest.bufferMs;
    expect(expanded).toBeGreaterThan(NET.INTERP_BUFFER_MS);

    for (let i = 0; i < 20; i++) {
      at += STEP;
      send(world(frame++, frame), at);
    }
    // Contracted, but nowhere near instantly — an early contraction is another
    // hitch, so it walks back at half a millisecond per snapshot.
    expect(guest.bufferMs).toBeLessThan(expanded);
    expect(guest.bufferMs).toBeGreaterThan(NET.INTERP_BUFFER_MS);
  });
});

describe('loss, reordering and stalls', () => {
  it('interpolates across a dropped snapshot', () => {
    const { guest, send } = stream();
    send(world(0, 0), 0);
    // The snapshot at STEP is lost; the next one arrives at 2·STEP.
    send(world(2, 200), STEP * 2);
    send(world(3, 300), STEP * 3);

    const frame = guest.sample(STEP * 2 + NET.INTERP_BUFFER_MS - STEP);
    expect(frame.mode).toBe('interpolated');
    expect(frame.seats[0].head.x).toBeGreaterThanOrEqual(0);
    expect(frame.seats[0].head.x).toBeLessThanOrEqual(200);
  });

  it('drops a snapshot that arrives out of order', () => {
    const { guest, send } = stream();
    expect(send(world(0, 0), 0)).not.toBeNull();
    expect(send(world(2, 200), STEP)).not.toBeNull();
    // Frame 1 turns up late. Rewinding the world to accept it would be worse
    // than never having received it.
    expect(send(world(1, 100), STEP + 5)).toBeNull();

    const frame = guest.sample(STEP + NET.INTERP_BUFFER_MS);
    expect(frame.frame).toBe(2);
  });

  it('drops a duplicate', () => {
    const { guest, send } = stream();
    send(world(4, 40), 0);
    expect(send(world(4, 40), 5)).toBeNull();
    expect(guest.sample(NET.INTERP_BUFFER_MS).frame).toBe(4);
  });

  it('extrapolates with velocity for at most EXTRAPOLATE_MAX_MS', () => {
    const { guest, send } = stream();
    send(world(0, 0, 2), 0);
    send(world(1, 100, 2), STEP);

    // renderAt sits 60 ms past the newest sample.
    const ahead = guest.sample(STEP + NET.INTERP_BUFFER_MS + 60);
    expect(ahead.mode).toBe('extrapolated');
    expect(ahead.aheadMs).toBeCloseTo(60, 0);
    expect(ahead.seats[0].head.x).toBeGreaterThan(100);
    // Hands ride the head — extrapolating them separately grows arms.
    expect(ahead.seats[0].handR.x - ahead.seats[0].head.x).toBeCloseTo(20, 1);
  });

  it('freezes rather than extrapolating past the limit', () => {
    const { guest, send } = stream();
    send(world(0, 0, 5), 0);
    send(world(1, 100, 5), STEP);

    const stalled = guest.sample(STEP + NET.INTERP_BUFFER_MS + NET.EXTRAPOLATE_MAX_MS + 20);
    expect(stalled.mode).toBe('frozen');
    expect(guest.stalled).toBe(true);
    // Frozen means frozen: the head is exactly where the last snapshot put it,
    // not several seconds of confident fiction further on.
    expect(stalled.seats[0].head.x).toBeCloseTo(100, 1);
  });

  it('recovers from a stall when packets resume', () => {
    const { guest, send } = stream();
    send(world(0, 0), 0);
    send(world(1, 100), STEP);
    expect(guest.sample(2_000).mode).toBe('frozen');

    send(world(2, 200), 2_000);
    send(world(3, 300), 2_000 + STEP);
    const resumed = guest.sample(2_000 + STEP + NET.INTERP_BUFFER_MS - 10);
    expect(resumed.mode).not.toBe('frozen');
  });
});

describe('local arm blending (§9.5.1)', () => {
  it('lands exactly on authority the moment a correction arrives', () => {
    const blender = new LocalArmBlender();
    blender.onAuthority({ x: 0, y: 0 }, { x: 10, y: -4 }, 0);
    expect(blender.sample({ x: 0, y: 0 }, 0)).toEqual({ x: 10, y: -4 });
  });

  it('converges to the local prediction over LOCAL_ARM_BLEND_MS', () => {
    const blender = new LocalArmBlender();
    blender.onAuthority({ x: 0, y: 0 }, { x: 10, y: 0 }, 0);

    const mid = blender.sample({ x: 0, y: 0 }, NET.LOCAL_ARM_BLEND_MS / 2);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(10);

    const done = blender.sample({ x: 0, y: 0 }, NET.LOCAL_ARM_BLEND_MS);
    expect(done.x).toBeCloseTo(0, 6);
    // And it stays there — the arm follows the thumb, not the network.
    expect(blender.sample({ x: 3, y: 0 }, NET.LOCAL_ARM_BLEND_MS + 500).x).toBeCloseTo(3, 6);
  });

  it('never snaps: the correction decelerates instead of jumping', () => {
    const blender = new LocalArmBlender();
    const correction = 60;
    blender.onAuthority({ x: 0, y: 0 }, { x: correction, y: 0 }, 0);

    let previous = blender.sample({ x: 0, y: 0 }, 0);
    let previousStep = Infinity;
    for (let t = 16; t <= NET.LOCAL_ARM_BLEND_MS + 32; t += 16) {
      const next = blender.sample({ x: 0, y: 0 }, t);
      const step = Math.abs(next.x - previous.x);
      // easeOutCubic front-loads, so the honest property is not "small steps"
      // but "steps that only ever get smaller" — the shape that reads as
      // settling rather than as a snap followed by a drift.
      expect(step).toBeLessThanOrEqual(previousStep + 1e-9);
      expect(step).toBeLessThan(correction / 2);
      expect(next.x).toBeLessThanOrEqual(previous.x + 1e-9);
      previous = next;
      previousStep = step;
    }
    expect(previous.x).toBeCloseTo(0, 6);
  });

  it('tracks the local prediction instantly while a correction decays', () => {
    // The point of the whole mechanism: your arm answers your thumb this
    // frame, even mid-correction.
    const blender = new LocalArmBlender();
    blender.onAuthority({ x: 0, y: 0 }, { x: 20, y: 0 }, 0);

    const still = blender.sample({ x: 0, y: 0 }, 40);
    const moved = blender.sample({ x: 30, y: 0 }, 40);
    expect(moved.x - still.x).toBeCloseTo(30, 6);
  });
});
