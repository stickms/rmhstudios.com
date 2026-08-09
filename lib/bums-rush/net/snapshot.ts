/**
 * Bum's Rush — the snapshot wire format (§9.4).
 *
 * Host → guests at {@link NET.SNAPSHOT_HZ}, binary, because this is the packet
 * a phone on cellular pays for twenty times a second. JSON of the same state is
 * roughly 4× the bytes and 4× the GC.
 *
 * ## The layout
 *
 * ```
 * u16 frame                            wrapping; the decoder un-wraps it
 * u8  flags                            SnapshotFlag bitfield
 * u8  seatCount
 * per seat (25 B):
 *   u8  seatIndex | stateCode << 2
 *   i16 headX, headY                   ×POS_SCALE  (1/4 px)
 *   i16 headVX, headVY                 ×POS_SCALE
 *   i16 headAngle                      ×ANGLE_SCALE (1/64 rad), wrapped to ±π
 *   i16 handLX, handLY, handRX, handRY ×POS_SCALE
 *   u8  gripL, gripR                   0 = not gripping
 *   u16 gripTargetL, gripTargetR       body id, 0 = static world
 * u8  propCount
 * per dirty prop (7 B):
 *   u16 propId
 *   i16 x, y                           ×POS_SCALE
 *   u8  angle                          turn/256
 * ```
 *
 * 5 + 25·seats + 7·props. Four seats and twenty dirty props is **245 B**,
 * which is the §9.4 budget (~240 B → 4.8 KB/s down per guest at 20 Hz).
 *
 * Two places this differs from the field list printed in §9.4, both forced by
 * that same budget line, which the field list does not actually add up to:
 *
 * 1. `seatIndex` and `state` share one byte (5 states, 4 seats — 5 bits).
 * 2. **Prop angle is a byte** (1/256 of a turn ≈ 0.9°), not an i16. That is
 *    what makes a prop 7 B rather than 8, and it is the one field where the
 *    coarser step is invisible: every prop is already drawn through the
 *    render boil, which wobbles it by more than a degree on purpose (§2.3).
 *    Head angle keeps its i16 at ANGLE_SCALE, because that one the player
 *    reads.
 *
 * **Arm segments are not transmitted.** Guests re-derive them from head + hand
 * with the same solver the host runs (§9.4) — halving the packet for something
 * visually indistinguishable, since an arm is a smoothed curve through two
 * known endpoints either way.
 *
 * Imported by the hub (only for `peekSnapshotHeader`), so: no browser globals,
 * no `@/` specifiers, no `.server` imports.
 */

import { NET } from '../constants';
import { SnapshotFlag, type SeatIndex, type SeatLifeState, type Snapshot, type SnapshotProp, type SnapshotSeat } from '../types';

// ─── Layout constants ───────────────────────────────────────────────────────

/** frame(2) + flags(1) + seatCount(1) + propCount(1). */
export const SNAPSHOT_FIXED_BYTES = 5;
export const SNAPSHOT_SEAT_BYTES = 25;
export const SNAPSHOT_PROP_BYTES = 7;

/** Exact encoded size, so a budget test can assert it without encoding. */
export function snapshotByteLength(seatCount: number, propCount: number): number {
  return SNAPSHOT_FIXED_BYTES + seatCount * SNAPSHOT_SEAT_BYTES + propCount * SNAPSHOT_PROP_BYTES;
}

const TAU = Math.PI * 2;

/**
 * State ↔ code. Order is the wire contract: append only, never reorder — a
 * reordered table silently turns everyone's `dead` into `respawning` across a
 * half-deployed fleet.
 */
const SEAT_STATES: readonly SeatLifeState[] = ['alive', 'dead', 'respawning', 'drone', 'frozen'];

function stateCode(state: SeatLifeState): number {
  const index = SEAT_STATES.indexOf(state);
  return index < 0 ? 0 : index;
}

function codeState(code: number): SeatLifeState {
  return SEAT_STATES[code] ?? 'alive';
}

// ─── Quantisation ───────────────────────────────────────────────────────────

const I16_MIN = -32768;
const I16_MAX = 32767;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < min ? min : value > max ? max : Math.round(value);
}

/**
 * World px → i16 at POS_SCALE. The i16 saturates at ±8191 px, which is a real
 * ceiling on level size; it SATURATES rather than wraps on purpose. A clamped
 * character piles up at the edge of the world and is obviously wrong; a wrapped
 * one teleports across the level and looks like a physics bug for a week.
 */
function encodePos(value: number): number {
  return clampInt(value * NET.POS_SCALE, I16_MIN, I16_MAX);
}

function decodePos(raw: number): number {
  return raw / NET.POS_SCALE;
}

/** Wrap to (-π, π] so the i16 cannot overflow after a few hundred spins. */
export function wrapAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle + Math.PI) % TAU + TAU) % TAU;
  return wrapped - Math.PI;
}

/** Normalise to [0, τ) — the frame prop angles are compared in. */
export function normalizeTurn(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((angle % TAU) + TAU) % TAU;
}

function encodeAngle(angle: number): number {
  return clampInt(wrapAngle(angle) * NET.ANGLE_SCALE, I16_MIN, I16_MAX);
}

function decodeAngle(raw: number): number {
  return raw / NET.ANGLE_SCALE;
}

/** Prop angle → one byte, 1/256 of a turn. */
function encodePropAngle(angle: number): number {
  return Math.round((normalizeTurn(angle) / TAU) * 256) & 0xff;
}

function decodePropAngle(raw: number): number {
  return (raw / 256) * TAU;
}

/** The worst error each quantiser can introduce — the codec test's tolerances. */
export const QUANTISATION_ERROR = {
  POS: 1 / (2 * NET.POS_SCALE),
  ANGLE: 1 / (2 * NET.ANGLE_SCALE),
  PROP_ANGLE: TAU / 512,
} as const;

// ─── Binary sources ─────────────────────────────────────────────────────────

/**
 * What a decoder accepts.
 *
 * The browser hands socket.io payloads back as `ArrayBuffer`; Node hands them
 * back as `Buffer`, which is a `Uint8Array` **view** into a larger pooled
 * allocation. Reading a Buffer as if it were its own `ArrayBuffer` silently
 * decodes whatever else Node happened to pool next to it — so every decoder
 * here goes through {@link binaryView}, which respects `byteOffset`.
 */
export type BinarySource = ArrayBuffer | ArrayBufferView;

export function binaryView(source: BinarySource): DataView {
  return ArrayBuffer.isView(source)
    ? new DataView(source.buffer, source.byteOffset, source.byteLength)
    : new DataView(source);
}

export function binaryLength(source: BinarySource): number {
  return source.byteLength;
}

/** A standalone copy of the bytes, safe to keep past the current tick. */
export function binaryCopy(source: BinarySource): Uint8Array {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength))
    : new Uint8Array(source.slice(0));
}

// ─── Frame numbers ──────────────────────────────────────────────────────────

/**
 * Signed distance between two u16 frame numbers, wrap-aware.
 *
 * A u16 frame wraps every ~18 minutes at 60 Hz, and a level can run longer than
 * that. Comparing raw values across the wrap makes the newest snapshot look
 * 65535 frames old, which freezes every guest until the next keyframe.
 */
export function frameDelta(a: number, b: number): number {
  return (((a - b + 0x8000) & 0xffff) - 0x8000);
}

/** Rebuild a monotonic frame counter from wrapping wire values. */
export function unwrapFrame(previous: number, wire: number): number {
  return previous + frameDelta(wire, previous & 0xffff);
}

// ─── Encode ─────────────────────────────────────────────────────────────────

/**
 * Encode exactly what is passed — no delta, no keyframe bookkeeping.
 *
 * `SnapshotEncoder` is what the host actually uses; this is the primitive it
 * and the tests are built on.
 */
export function encodeSnapshot(snapshot: Snapshot): ArrayBuffer {
  const seats = snapshot.seats.slice(0, NET.MAX_SEATS);
  const props = snapshot.props.slice(0, 255);
  const buffer = new ArrayBuffer(snapshotByteLength(seats.length, props.length));
  const view = new DataView(buffer);

  let offset = 0;
  view.setUint16(offset, snapshot.frame & 0xffff, true);
  offset += 2;
  view.setUint8(offset++, snapshot.flags & 0xff);
  view.setUint8(offset++, seats.length);

  for (const seat of seats) {
    view.setUint8(offset++, (seat.seat & 0x03) | (stateCode(seat.state) << 2));
    view.setInt16(offset, encodePos(seat.head.x), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.head.y), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.headV.x), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.headV.y), true);
    offset += 2;
    view.setInt16(offset, encodeAngle(seat.headAngle), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.handL.x), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.handL.y), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.handR.x), true);
    offset += 2;
    view.setInt16(offset, encodePos(seat.handR.y), true);
    offset += 2;
    view.setUint8(offset++, clampInt(seat.gripL, 0, 255));
    view.setUint8(offset++, clampInt(seat.gripR, 0, 255));
    view.setUint16(offset, clampInt(seat.gripTargetL, 0, 0xffff), true);
    offset += 2;
    view.setUint16(offset, clampInt(seat.gripTargetR, 0, 0xffff), true);
    offset += 2;
  }

  view.setUint8(offset++, props.length);
  for (const prop of props) {
    view.setUint16(offset, clampInt(prop.id, 0, 0xffff), true);
    offset += 2;
    view.setInt16(offset, encodePos(prop.x), true);
    offset += 2;
    view.setInt16(offset, encodePos(prop.y), true);
    offset += 2;
    view.setUint8(offset++, encodePropAngle(prop.angle));
  }

  return buffer;
}

// ─── Decode ─────────────────────────────────────────────────────────────────

export class SnapshotDecodeError extends Error {}

/** Decode one packet as sent. Props are only those present IN THIS packet. */
export function decodeSnapshot(source: BinarySource): Snapshot {
  if (source.byteLength < SNAPSHOT_FIXED_BYTES) throw new SnapshotDecodeError('too-short');
  const view = binaryView(source);

  let offset = 0;
  const frame = view.getUint16(offset, true);
  offset += 2;
  const flags = view.getUint8(offset++);
  const seatCount = view.getUint8(offset++);
  if (seatCount > NET.MAX_SEATS) throw new SnapshotDecodeError('seat-count');
  if (source.byteLength < SNAPSHOT_FIXED_BYTES + seatCount * SNAPSHOT_SEAT_BYTES) {
    throw new SnapshotDecodeError('truncated-seats');
  }

  const seats: SnapshotSeat[] = [];
  for (let i = 0; i < seatCount; i++) {
    const packed = view.getUint8(offset++);
    const head = { x: decodePos(view.getInt16(offset, true)), y: 0 };
    offset += 2;
    head.y = decodePos(view.getInt16(offset, true));
    offset += 2;
    const headV = { x: decodePos(view.getInt16(offset, true)), y: 0 };
    offset += 2;
    headV.y = decodePos(view.getInt16(offset, true));
    offset += 2;
    const headAngle = decodeAngle(view.getInt16(offset, true));
    offset += 2;
    const handL = { x: decodePos(view.getInt16(offset, true)), y: 0 };
    offset += 2;
    handL.y = decodePos(view.getInt16(offset, true));
    offset += 2;
    const handR = { x: decodePos(view.getInt16(offset, true)), y: 0 };
    offset += 2;
    handR.y = decodePos(view.getInt16(offset, true));
    offset += 2;
    const gripL = view.getUint8(offset++);
    const gripR = view.getUint8(offset++);
    const gripTargetL = view.getUint16(offset, true);
    offset += 2;
    const gripTargetR = view.getUint16(offset, true);
    offset += 2;

    seats.push({
      seat: (packed & 0x03) as SeatIndex,
      state: codeState((packed >> 2) & 0x07),
      head,
      headV,
      headAngle,
      handL,
      handR,
      gripL,
      gripR,
      gripTargetL,
      gripTargetR,
    });
  }

  const propCount = view.getUint8(offset++);
  if (source.byteLength < offset + propCount * SNAPSHOT_PROP_BYTES) {
    throw new SnapshotDecodeError('truncated-props');
  }

  const props: SnapshotProp[] = [];
  for (let i = 0; i < propCount; i++) {
    const id = view.getUint16(offset, true);
    offset += 2;
    const x = decodePos(view.getInt16(offset, true));
    offset += 2;
    const y = decodePos(view.getInt16(offset, true));
    offset += 2;
    const angle = decodePropAngle(view.getUint8(offset++));
    props.push({ id, x, y, angle });
  }

  return { frame, flags, seats, props };
}

/**
 * Read `frame` and `flags` without decoding the body.
 *
 * This is all the hub ever looks at inside a snapshot: enough to keep the most
 * recent KEYFRAME for host migration (§9.6), and nothing else. Five bytes of
 * inspection per packet, 20 Hz per room — the relay stays a relay.
 */
export function peekSnapshotHeader(source: BinarySource): { frame: number; flags: number } | null {
  if (source.byteLength < SNAPSHOT_FIXED_BYTES) return null;
  const view = binaryView(source);
  return { frame: view.getUint16(0, true), flags: view.getUint8(2) };
}

export function isKeyframe(source: BinarySource): boolean {
  const header = peekSnapshotHeader(source);
  return header !== null && (header.flags & SnapshotFlag.Keyframe) !== 0;
}

// ─── Delta encoding (§9.4) ──────────────────────────────────────────────────

/**
 * A prop below this much rotation has not moved as far as one step of its own
 * quantiser, so sending it would cost 7 bytes to transmit the same byte.
 */
const PROP_ANGLE_EPSILON = TAU / 256;

/**
 * Host-side encoder: props are sent only when they have actually moved, and
 * every {@link NET.KEYFRAME_INTERVAL}th snapshot carries all of them.
 *
 * The keyframe is what makes packet loss survivable without acks: a guest that
 * misses a delta is wrong about one prop for at most one second, and a guest
 * that joins mid-level is fully synchronised by the next one (§9.7).
 */
export class SnapshotEncoder {
  private readonly baseline = new Map<number, SnapshotProp>();
  private sinceKeyframe = Number.MAX_SAFE_INTEGER;

  /** Force the next snapshot to be a keyframe (a guest just joined). */
  requestKeyframe(): void {
    this.sinceKeyframe = Number.MAX_SAFE_INTEGER;
  }

  encode(snapshot: Snapshot): { buffer: ArrayBuffer; keyframe: boolean } {
    const keyframe = this.sinceKeyframe >= NET.KEYFRAME_INTERVAL;
    this.sinceKeyframe = keyframe ? 1 : this.sinceKeyframe + 1;

    let props: SnapshotProp[];
    if (keyframe) {
      props = snapshot.props;
      this.baseline.clear();
      for (const prop of props) this.baseline.set(prop.id, { ...prop });
    } else {
      props = [];
      for (const prop of snapshot.props) {
        const previous = this.baseline.get(prop.id);
        if (previous && !propMoved(previous, prop)) continue;
        props.push(prop);
        this.baseline.set(prop.id, { ...prop });
      }
    }

    const flags = keyframe ? snapshot.flags | SnapshotFlag.Keyframe : snapshot.flags & ~SnapshotFlag.Keyframe;
    return { buffer: encodeSnapshot({ ...snapshot, flags, props }), keyframe };
  }
}

function propMoved(previous: SnapshotProp, next: SnapshotProp): boolean {
  if (Math.abs(next.x - previous.x) > NET.PROP_DIRTY_EPSILON) return true;
  if (Math.abs(next.y - previous.y) > NET.PROP_DIRTY_EPSILON) return true;
  const a = normalizeTurn(next.angle);
  const b = normalizeTurn(previous.angle);
  const spin = Math.abs(a - b);
  return Math.min(spin, TAU - spin) > PROP_ANGLE_EPSILON;
}

/**
 * Guest-side decoder: merges deltas onto the last keyframe.
 *
 * `synced` is false until the first keyframe arrives, and the guest renders the
 * "re-inking" wipe rather than a half-built world while it is — a level drawn
 * from deltas alone is missing every prop that has not moved yet, which reads
 * as holes in the floor.
 */
export class SnapshotDecoder {
  private readonly baseline = new Map<number, SnapshotProp>();
  private lastFrame = 0;
  private seenKeyframe = false;

  get synced(): boolean {
    return this.seenKeyframe;
  }

  /** The last frame number decoded, un-wrapped and monotonic. */
  get frame(): number {
    return this.lastFrame;
  }

  reset(): void {
    this.baseline.clear();
    this.lastFrame = 0;
    this.seenKeyframe = false;
  }

  decode(source: BinarySource): Snapshot {
    const packet = decodeSnapshot(source);
    const keyframe = (packet.flags & SnapshotFlag.Keyframe) !== 0;

    if (keyframe) {
      this.baseline.clear();
      this.seenKeyframe = true;
    }
    for (const prop of packet.props) this.baseline.set(prop.id, prop);

    this.lastFrame = this.seenKeyframe
      ? unwrapFrame(this.lastFrame, packet.frame)
      : packet.frame;

    return {
      frame: this.lastFrame,
      flags: packet.flags,
      seats: packet.seats,
      // Sorted so two guests decoding the same stream produce byte-identical
      // render input — which is what makes a desync reproducible.
      props: [...this.baseline.values()].sort((a, b) => a.id - b.id),
    };
  }
}
