/**
 * Bum's Rush — the input wire format (§9.4).
 *
 * Guest → host at {@link NET.INPUT_HZ}, binary, one message per CLIENT rather
 * than per seat: a couch of two pads is two seats on one socket, and sending
 * them separately would double the packet count for nothing.
 *
 * ```
 * u8 count                                     entries in this packet
 * per entry (10 B):
 *   u8  seatIndex
 *   u16 frame                                  host frame this input targets
 *   i8  aimLX, aimLY, aimRX, aimRY             -127..127 → -1..1
 *   u8  gripL, gripR                           0..255 analog trigger
 *   u8  buttons                                InputButton bitfield
 * ```
 *
 * **Every packet repeats the last {@link NET.INPUT_REDUNDANCY} frames per
 * seat.** Not because packets are lost in transit — they are not, this is
 * TCP-ish — but because head-of-line delay makes them arrive in clumps, and a
 * clump that arrives after the host has already stepped past its frame is
 * indistinguishable from loss. Sending the last three frames costs 20 bytes and
 * removes the entire class of "my grab didn't register" bugs; the host
 * de-duplicates by frame number ({@link InputDeduper}).
 *
 * Worst case on the wire is 4 seats × 3 redundant frames = 121 B, comfortably
 * inside {@link NET_LIMITS.INPUT_BYTES}.
 *
 * Imported by the hub (for {@link decodeInputSeats}), so: no browser globals,
 * no `@/` specifiers, no `.server` imports.
 */

import { NET, NET_LIMITS } from '../constants';
import type { InputFrame, SeatIndex, Vec2 } from '../types';
import { binaryView, frameDelta, type BinarySource } from './snapshot';

export const INPUT_ENTRY_BYTES = 10;
export const INPUT_HEADER_BYTES = 1;

/** The most entries a legitimate packet can carry. */
export const MAX_INPUT_ENTRIES = NET.MAX_SEATS * NET.INPUT_REDUNDANCY;

export function inputByteLength(entries: number): number {
  return INPUT_HEADER_BYTES + entries * INPUT_ENTRY_BYTES;
}

// ─── Quantisation ───────────────────────────────────────────────────────────

function encodeAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(value * 127);
  return scaled < -127 ? -127 : scaled > 127 ? 127 : scaled;
}

function decodeAxis(raw: number): number {
  return raw / 127;
}

function encodeGrip(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(value * 255);
  return scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
}

function decodeGrip(raw: number): number {
  return raw / 255;
}

/** Worst-case round-trip error per field, for the codec test. */
export const INPUT_QUANTISATION_ERROR = {
  AXIS: 1 / 254,
  GRIP: 1 / 510,
} as const;

// ─── Encode / decode ────────────────────────────────────────────────────────

export class InputDecodeError extends Error {}

export function encodeInputPacket(frames: readonly InputFrame[]): ArrayBuffer {
  const entries = frames.slice(0, MAX_INPUT_ENTRIES);
  const buffer = new ArrayBuffer(inputByteLength(entries.length));
  const view = new DataView(buffer);

  let offset = 0;
  view.setUint8(offset++, entries.length);
  for (const entry of entries) {
    view.setUint8(offset++, entry.seat & 0x03);
    view.setUint16(offset, entry.frame & 0xffff, true);
    offset += 2;
    view.setInt8(offset++, encodeAxis(entry.aimL.x));
    view.setInt8(offset++, encodeAxis(entry.aimL.y));
    view.setInt8(offset++, encodeAxis(entry.aimR.x));
    view.setInt8(offset++, encodeAxis(entry.aimR.y));
    view.setUint8(offset++, encodeGrip(entry.gripL));
    view.setUint8(offset++, encodeGrip(entry.gripR));
    view.setUint8(offset++, entry.buttons & 0xff);
  }

  return buffer;
}

export function decodeInputPacket(source: BinarySource): InputFrame[] {
  if (source.byteLength > NET_LIMITS.INPUT_BYTES) throw new InputDecodeError('too-large');
  if (source.byteLength < INPUT_HEADER_BYTES) throw new InputDecodeError('too-short');
  const view = binaryView(source);

  const count = view.getUint8(0);
  if (count > MAX_INPUT_ENTRIES) throw new InputDecodeError('entry-count');
  if (source.byteLength < inputByteLength(count)) throw new InputDecodeError('truncated');

  const frames: InputFrame[] = [];
  let offset = INPUT_HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    const seat = (view.getUint8(offset++) & 0x03) as SeatIndex;
    const frame = view.getUint16(offset, true);
    offset += 2;
    const aimLX = decodeAxis(view.getInt8(offset++));
    const aimLY = decodeAxis(view.getInt8(offset++));
    const aimRX = decodeAxis(view.getInt8(offset++));
    const aimRY = decodeAxis(view.getInt8(offset++));
    const aimL: Vec2 = { x: aimLX, y: aimLY };
    const aimR: Vec2 = { x: aimRX, y: aimRY };
    const gripL = decodeGrip(view.getUint8(offset++));
    const gripR = decodeGrip(view.getUint8(offset++));
    const buttons = view.getUint8(offset++);
    frames.push({ seat, frame, aimL, aimR, gripL, gripR, buttons });
  }

  return frames;
}

/**
 * The seat indices a packet claims, without decoding it.
 *
 * This is the hub's half of "`br:input` is only accepted from a client that
 * owns the seat it claims" (§9.3). It reads one byte per entry and allocates a
 * 4-element boolean set — the check costs less than the rate-limit lookup that
 * precedes it, which is the only way a relay can afford to make it 30 times a
 * second per client.
 */
export function decodeInputSeats(source: BinarySource): SeatIndex[] | null {
  if (source.byteLength > NET_LIMITS.INPUT_BYTES) return null;
  if (source.byteLength < INPUT_HEADER_BYTES) return null;
  const view = binaryView(source);
  const count = view.getUint8(0);
  if (count > MAX_INPUT_ENTRIES) return null;
  if (source.byteLength < inputByteLength(count)) return null;

  const seen = [false, false, false, false];
  for (let i = 0; i < count; i++) {
    seen[view.getUint8(INPUT_HEADER_BYTES + i * INPUT_ENTRY_BYTES) & 0x03] = true;
  }
  const seats: SeatIndex[] = [];
  for (let seat = 0; seat < seen.length; seat++) if (seen[seat]) seats.push(seat as SeatIndex);
  return seats;
}

// ─── Redundancy (client side) ───────────────────────────────────────────────

/**
 * The last few frames per owned seat, which is exactly what a packet carries.
 *
 * Bounded by construction: {@link NET.INPUT_REDUNDANCY} entries per seat, never
 * more, so a client that stops sending does not grow a queue.
 */
export class InputHistory {
  private readonly bySeat = new Map<SeatIndex, InputFrame[]>();

  push(frame: InputFrame): void {
    let list = this.bySeat.get(frame.seat);
    if (!list) {
      list = [];
      this.bySeat.set(frame.seat, list);
    }
    list.push(frame);
    if (list.length > NET.INPUT_REDUNDANCY) list.splice(0, list.length - NET.INPUT_REDUNDANCY);
  }

  /** Oldest-first across all owned seats — the packet body. */
  packetFrames(): InputFrame[] {
    const out: InputFrame[] = [];
    for (const list of this.bySeat.values()) out.push(...list);
    return out;
  }

  clear(): void {
    this.bySeat.clear();
  }
}

/** Build the packet a client sends this tick. */
export function buildInputPacket(history: InputHistory): ArrayBuffer {
  return encodeInputPacket(history.packetFrames());
}

// ─── De-duplication (host side) ─────────────────────────────────────────────

/**
 * Drops the repeats the redundancy scheme creates.
 *
 * Wrap-aware, because `frame` is a u16 and a level can outlive it: a naive
 * `frame > last` comparison starts rejecting EVERY input the moment the counter
 * wraps, which presents as one player going limp about eighteen minutes in.
 */
export class InputDeduper {
  private readonly lastBySeat = new Map<SeatIndex, number>();

  /** True if this frame is new for its seat (and records it). */
  accept(frame: InputFrame): boolean {
    const last = this.lastBySeat.get(frame.seat);
    if (last !== undefined && frameDelta(frame.frame, last) <= 0) return false;
    this.lastBySeat.set(frame.seat, frame.frame);
    return true;
  }

  forget(seat: SeatIndex): void {
    this.lastBySeat.delete(seat);
  }

  reset(): void {
    this.lastBySeat.clear();
  }
}
