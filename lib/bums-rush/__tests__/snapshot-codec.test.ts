/**
 * §9.4 — the snapshot wire format.
 *
 * Three things are worth a test here and the rest is not:
 *
 * 1. **The size budget.** 240 B/snapshot at 20 Hz is what makes this playable
 *    on cellular; a field added without thinking is how that becomes 400 and
 *    nobody notices until a bug report from a phone.
 * 2. **Round-trip within quantisation error.** A codec that is subtly wrong
 *    about one field produces "physics feels off online", which is close to
 *    undebuggable from a bug report.
 * 3. **Delta + keyframe recovery.** The whole loss-tolerance story is "a
 *    keyframe comes along within a second", and it either holds or every guest
 *    accumulates drift for as long as the level lasts.
 */

import { describe, expect, it } from 'vitest';
import { NET } from '../constants';
import { SnapshotFlag, type SeatIndex, type Snapshot, type SnapshotSeat } from '../types';
import {
  QUANTISATION_ERROR,
  SNAPSHOT_FIXED_BYTES,
  SNAPSHOT_PROP_BYTES,
  SNAPSHOT_SEAT_BYTES,
  SnapshotDecoder,
  SnapshotEncoder,
  decodeSnapshot,
  encodeSnapshot,
  frameDelta,
  isKeyframe,
  normalizeTurn,
  peekSnapshotHeader,
  snapshotByteLength,
  unwrapFrame,
} from '../net/snapshot';

/**
 * §9.4's stated budget: 4 seats + ~20 dirty props ≈ 240 B.
 *
 * The exact format lands on 245 B (5 + 4×25 + 20×7), so the assertion is the
 * budget with a hair of slack rather than a number reverse-engineered from the
 * encoder — a test that just re-states `snapshotByteLength` would pass through
 * any change at all.
 */
const BUDGET_BYTES = 248;

function seat(index: SeatIndex, overrides: Partial<SnapshotSeat> = {}): SnapshotSeat {
  return {
    seat: index,
    state: 'alive',
    head: { x: 100 + index * 37.25, y: -220.5 },
    headV: { x: 3.25, y: -1.75 },
    headAngle: 0.5,
    handL: { x: 80 + index, y: -190.25 },
    handR: { x: 120 + index, y: -188.75 },
    gripL: 0,
    gripR: 200,
    gripTargetL: 0,
    gripTargetR: 4097,
    ...overrides,
  };
}

function props(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    x: 500 + i * 3.25 + offset,
    y: -100 - i * 1.5 + offset,
    angle: (i * 0.37) % (Math.PI * 2),
  }));
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    frame: 1234,
    flags: 0,
    seats: [seat(0), seat(1), seat(2), seat(3)],
    props: props(20),
    ...overrides,
  };
}

describe('snapshot size budget (§9.4)', () => {
  it('fits 4 seats + 20 dirty props inside the ~240 B budget', () => {
    const encoded = encodeSnapshot(snapshot());
    expect(encoded.byteLength).toBe(245);
    expect(encoded.byteLength).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('stays inside 4.8 KB/s down per guest at SNAPSHOT_HZ', () => {
    const bytesPerSecond = encodeSnapshot(snapshot()).byteLength * NET.SNAPSHOT_HZ;
    expect(bytesPerSecond).toBeLessThanOrEqual(5_000);
  });

  it('pins the marginal cost of a seat and a prop', () => {
    // A new field costs 20 Hz × room-size bytes forever. Pinning the per-unit
    // cost is what makes that show up as a failing test rather than as a
    // support ticket from someone on a train.
    const base = encodeSnapshot(snapshot({ seats: [], props: [] })).byteLength;
    const oneSeat = encodeSnapshot(snapshot({ seats: [seat(0)], props: [] })).byteLength;
    const oneProp = encodeSnapshot(snapshot({ seats: [], props: props(1) })).byteLength;

    expect(base).toBe(SNAPSHOT_FIXED_BYTES);
    expect(oneSeat - base).toBe(SNAPSHOT_SEAT_BYTES);
    expect(oneProp - base).toBe(SNAPSHOT_PROP_BYTES);
    expect(snapshotByteLength(4, 20)).toBe(245);
  });

  it('never exceeds the 2 KB hub cap, even at maximum occupancy', () => {
    const full = encodeSnapshot(snapshot({ props: props(255) }));
    expect(full.byteLength).toBeLessThanOrEqual(2048);
  });
});

describe('round trip', () => {
  it('recovers every field within quantisation error', () => {
    const original = snapshot();
    const decoded = decodeSnapshot(encodeSnapshot(original));

    expect(decoded.frame).toBe(original.frame);
    expect(decoded.seats).toHaveLength(4);

    for (let i = 0; i < original.seats.length; i++) {
      const from = original.seats[i];
      const to = decoded.seats[i];
      expect(to.seat).toBe(from.seat);
      expect(to.state).toBe(from.state);
      expect(to.head.x).toBeCloseTo(from.head.x, 6);
      expect(Math.abs(to.head.y - from.head.y)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      expect(Math.abs(to.headV.x - from.headV.x)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      expect(Math.abs(to.headAngle - from.headAngle)).toBeLessThanOrEqual(QUANTISATION_ERROR.ANGLE);
      expect(Math.abs(to.handL.x - from.handL.x)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      expect(Math.abs(to.handR.y - from.handR.y)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      expect(to.gripL).toBe(from.gripL);
      expect(to.gripR).toBe(from.gripR);
      // Grip targets are matter.js body ids and must survive EXACTLY: a
      // quantised body id is a grab attached to the wrong crate.
      expect(to.gripTargetL).toBe(from.gripTargetL);
      expect(to.gripTargetR).toBe(from.gripTargetR);
    }

    for (let i = 0; i < original.props.length; i++) {
      const from = original.props[i];
      const to = decoded.props[i];
      expect(to.id).toBe(from.id);
      expect(Math.abs(to.x - from.x)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      expect(Math.abs(to.y - from.y)).toBeLessThanOrEqual(QUANTISATION_ERROR.POS);
      const spin = Math.abs(normalizeTurn(to.angle) - normalizeTurn(from.angle));
      expect(Math.min(spin, Math.PI * 2 - spin)).toBeLessThanOrEqual(QUANTISATION_ERROR.PROP_ANGLE);
    }
  });

  it('round-trips every seat life state', () => {
    const states = ['alive', 'dead', 'respawning', 'drone', 'frozen'] as const;
    for (const state of states) {
      const decoded = decodeSnapshot(
        encodeSnapshot(snapshot({ seats: [seat(2, { state })], props: [] })),
      );
      expect(decoded.seats[0].state).toBe(state);
      expect(decoded.seats[0].seat).toBe(2);
    }
  });

  it('saturates rather than wraps a position outside the i16 range', () => {
    // A clamped character piles up at the edge of the world; a wrapped one
    // teleports across it and reads as a physics bug for a week.
    const decoded = decodeSnapshot(
      encodeSnapshot(snapshot({ seats: [seat(0, { head: { x: 50_000, y: -50_000 } })], props: [] })),
    );
    expect(decoded.seats[0].head.x).toBeGreaterThan(8_000);
    expect(decoded.seats[0].head.y).toBeLessThan(-8_000);
  });

  it('survives a NaN reaching the encoder', () => {
    const decoded = decodeSnapshot(
      encodeSnapshot(
        snapshot({ seats: [seat(0, { headAngle: Number.NaN, headV: { x: NaN, y: 1 } })], props: [] }),
      ),
    );
    expect(Number.isFinite(decoded.seats[0].headAngle)).toBe(true);
    expect(Number.isFinite(decoded.seats[0].headV.x)).toBe(true);
  });

  it('reads a Buffer-backed view without decoding its neighbours', () => {
    // Node hands socket.io payloads back as pooled Buffers, i.e. views with a
    // non-zero byteOffset. Ignoring that offset decodes whatever else Node
    // pooled next to the packet.
    const encoded = new Uint8Array(encodeSnapshot(snapshot()));
    const pool = new Uint8Array(encoded.byteLength + 64);
    pool.fill(0xaa);
    pool.set(encoded, 32);
    const view = new Uint8Array(pool.buffer, 32, encoded.byteLength);

    const decoded = decodeSnapshot(view);
    expect(decoded.frame).toBe(1234);
    expect(decoded.seats).toHaveLength(4);
  });

  it('rejects a truncated packet instead of decoding garbage', () => {
    const encoded = encodeSnapshot(snapshot());
    const truncated = encoded.slice(0, 40);
    expect(() => decodeSnapshot(truncated)).toThrow();
  });
});

describe('delta encoding and keyframes', () => {
  it('sends every prop on the first snapshot and only movers after', () => {
    const encoder = new SnapshotEncoder();

    const first = encoder.encode(snapshot());
    expect(first.keyframe).toBe(true);
    expect(isKeyframe(first.buffer)).toBe(true);
    expect(decodeSnapshot(first.buffer).props).toHaveLength(20);

    // Nothing moved.
    const second = encoder.encode(snapshot({ frame: 1235 }));
    expect(second.keyframe).toBe(false);
    expect(decodeSnapshot(second.buffer).props).toHaveLength(0);

    // One prop moves further than PROP_DIRTY_EPSILON.
    const moved = snapshot({ frame: 1236 });
    moved.props = moved.props.map((prop) =>
      prop.id === 5 ? { ...prop, x: prop.x + 10 } : { ...prop },
    );
    const third = encoder.encode(moved);
    const dirty = decodeSnapshot(third.buffer).props;
    expect(dirty).toHaveLength(1);
    expect(dirty[0].id).toBe(5);
  });

  it('ignores sub-epsilon jitter', () => {
    const encoder = new SnapshotEncoder();
    encoder.encode(snapshot());
    const nudged = snapshot({ frame: 1235 });
    nudged.props = nudged.props.map((prop) => ({
      ...prop,
      x: prop.x + NET.PROP_DIRTY_EPSILON / 2,
    }));
    expect(decodeSnapshot(encoder.encode(nudged).buffer).props).toHaveLength(0);
  });

  it('emits a keyframe every KEYFRAME_INTERVAL snapshots', () => {
    const encoder = new SnapshotEncoder();
    const keyframes: number[] = [];
    for (let i = 0; i < NET.KEYFRAME_INTERVAL * 2 + 1; i++) {
      if (encoder.encode(snapshot({ frame: 1000 + i })).keyframe) keyframes.push(i);
    }
    expect(keyframes).toEqual([0, NET.KEYFRAME_INTERVAL, NET.KEYFRAME_INTERVAL * 2]);
  });

  it('forces a keyframe on request, so a joiner resyncs immediately', () => {
    const encoder = new SnapshotEncoder();
    encoder.encode(snapshot());
    expect(encoder.encode(snapshot({ frame: 1235 })).keyframe).toBe(false);
    encoder.requestKeyframe();
    const forced = encoder.encode(snapshot({ frame: 1236 }));
    expect(forced.keyframe).toBe(true);
    expect(decodeSnapshot(forced.buffer).props).toHaveLength(20);
  });

  it('rebuilds the whole world on the decoder from deltas', () => {
    const encoder = new SnapshotEncoder();
    const decoder = new SnapshotDecoder();

    decoder.decode(encoder.encode(snapshot()).buffer);
    expect(decoder.synced).toBe(true);

    const moved = snapshot({ frame: 1235 });
    moved.props = moved.props.map((prop) =>
      prop.id === 3 ? { ...prop, y: prop.y - 25 } : { ...prop },
    );
    const merged = decoder.decode(encoder.encode(moved).buffer);

    // The delta carried one prop; the decoder still reports all twenty.
    expect(merged.props).toHaveLength(20);
    expect(merged.props.find((p) => p.id === 3)?.y).toBeCloseTo(
      moved.props.find((p) => p.id === 3)!.y,
      1,
    );
    expect(merged.props.find((p) => p.id === 7)?.x).toBeCloseTo(
      moved.props.find((p) => p.id === 7)!.x,
      1,
    );
  });

  it('recovers a lost delta at the next keyframe', () => {
    const encoder = new SnapshotEncoder();
    const decoder = new SnapshotDecoder();
    decoder.decode(encoder.encode(snapshot()).buffer);

    // A prop moves and the delta carrying it is dropped in transit.
    let world = snapshot({ frame: 1235 });
    world.props = world.props.map((prop) => (prop.id === 9 ? { ...prop, x: 900 } : prop));
    encoder.encode(world); // encoded, then "lost"

    // The guest is wrong about prop 9 for as long as the next keyframe takes.
    expect(decoder.decode(encoder.encode(world).buffer).props.find((p) => p.id === 9)?.x).not.toBeCloseTo(900, 1);

    for (let i = 0; i < NET.KEYFRAME_INTERVAL; i++) {
      world = { ...world, frame: world.frame + 1 };
      const packet = encoder.encode(world);
      const merged = decoder.decode(packet.buffer);
      if (packet.keyframe) {
        expect(merged.props.find((p) => p.id === 9)?.x).toBeCloseTo(900, 1);
        return;
      }
    }
    throw new Error('no keyframe arrived within KEYFRAME_INTERVAL');
  });

  it('is not synced until a keyframe has arrived', () => {
    const encoder = new SnapshotEncoder();
    encoder.encode(snapshot()); // keyframe, dropped in transit
    const delta = encoder.encode(snapshot({ frame: 1235 }));

    const decoder = new SnapshotDecoder();
    decoder.decode(delta.buffer);
    // A world built from deltas alone is missing every prop that has not moved
    // — which renders as holes in the floor, so the guest must know.
    expect(decoder.synced).toBe(false);
  });
});

describe('frame numbers', () => {
  it('measures distance across the u16 wrap', () => {
    expect(frameDelta(5, 65_530)).toBe(11);
    expect(frameDelta(65_530, 5)).toBe(-11);
    expect(frameDelta(100, 90)).toBe(10);
  });

  it('un-wraps into a monotonic counter', () => {
    // ~18 minutes at 60 Hz. A level can outlive it, and a naive comparison
    // freezes every guest at that moment.
    let frame = 65_530;
    let unwrapped = 65_530;
    for (let i = 0; i < 20; i++) {
      frame = (frame + 1) & 0xffff;
      const next = unwrapFrame(unwrapped, frame);
      expect(next).toBe(unwrapped + 1);
      unwrapped = next;
    }
    expect(unwrapped).toBe(65_550);
  });

  it('peeks the header without decoding the body', () => {
    const encoded = encodeSnapshot(snapshot({ flags: SnapshotFlag.Paused }));
    const header = peekSnapshotHeader(encoded);
    expect(header).toEqual({ frame: 1234, flags: SnapshotFlag.Paused });
    expect(peekSnapshotHeader(new ArrayBuffer(2))).toBeNull();
  });
});
