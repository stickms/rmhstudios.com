/**
 * The framing every peer-to-peer link shares (extracted from the TF2
 * transport; lib/tf2-game/net/p2p/wire.ts re-exports it next to its own game
 * tags). Byte-for-byte what TF2 has always sent.
 *
 * `unreliable` channel (ordered: false, maxRetransmits: 0) — every message ≤
 * `UNRELIABLE_MAX_BYTES` (1200: below the path MTU once DTLS/SCTP/UDP/IP
 * headers are added):
 *
 *   PING  tag 0x03 · u32 seq · f64 sentAt
 *   PONG  tag 0x04 · u32 seq · f64 sentAt (echoed) · f64 tick (−1: none)
 *
 * `reliable` channel (ordered, retransmitted): link frames carrying one
 * message each —
 *
 *   WHOLE     0x10 · message
 *   FRAGMENT  0x11 · u32 messageId · u16 index · u16 count · chunk
 *             (a message larger than `RELIABLE_CHUNK_BYTES` is split; the
 *             channel is ordered, so the pieces arrive in order; a message
 *             may not exceed `RELIABLE_MESSAGE_MAX_BYTES`)
 *
 * and a CONTROL message is tag 0x21 · UTF-8 JSON, parsed with zod by its
 * receiver — never evaluated.
 *
 * Environment-agnostic.
 */

export const TAG_PING = 0x03;
export const TAG_PONG = 0x04;

export const FRAME_WHOLE = 0x10;
export const FRAME_FRAGMENT = 0x11;

export const TAG_CONTROL = 0x21;

/** Largest message on the unreliable channel (and over the relay's unreliable path). */
export const UNRELIABLE_MAX_BYTES = 1_200;
/** Reliable messages are split above this (SCTP's interoperable message size is 16 KiB). */
export const RELIABLE_CHUNK_BYTES = 16_000;
export const FRAGMENT_HEADER_BYTES = 9;
/** A reassembled message may not exceed this (a hostile peer cannot make us buffer more). */
export const RELIABLE_MESSAGE_MAX_BYTES = 1 << 20;
export const RELIABLE_MAX_FRAGMENTS = Math.ceil(RELIABLE_MESSAGE_MAX_BYTES / RELIABLE_CHUNK_BYTES);

/** Tag + bytes, one allocation. */
export function tagged(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + body.byteLength);
  out[0] = tag;
  out.set(body, 1);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** A CONTROL message: tag + JSON. */
export function encodeControl(message: unknown): Uint8Array {
  return tagged(TAG_CONTROL, encoder.encode(JSON.stringify(message)));
}

/** The JSON of a CONTROL message, or undefined when it is not valid UTF-8 JSON. Shape is the caller's to check. */
export function decodeControl(bytes: Uint8Array): unknown {
  if (bytes.byteLength < 2 || bytes[0] !== TAG_CONTROL) return undefined;
  try {
    return JSON.parse(decoder.decode(bytes.subarray(1)));
  } catch {
    return undefined;
  }
}

export function encodePing(tag: typeof TAG_PING | typeof TAG_PONG, seq: number, sentAt: number, tick = -1): Uint8Array {
  const out = new Uint8Array(tag === TAG_PING ? 13 : 21);
  const view = new DataView(out.buffer);
  out[0] = tag;
  view.setUint32(1, seq >>> 0, true);
  view.setFloat64(5, sentAt, true);
  if (tag === TAG_PONG) view.setFloat64(13, tick, true);
  return out;
}

export function decodePing(bytes: Uint8Array): { seq: number; sentAt: number; tick: number } | null {
  const tag = bytes[0];
  if ((tag === TAG_PING && bytes.byteLength !== 13) || (tag === TAG_PONG && bytes.byteLength !== 21)) return null;
  if (tag !== TAG_PING && tag !== TAG_PONG) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seq = view.getUint32(1, true);
  const sentAt = view.getFloat64(5, true);
  const tick = tag === TAG_PONG ? view.getFloat64(13, true) : -1;
  if (!Number.isFinite(sentAt) || !Number.isFinite(tick)) return null;
  return { seq, sentAt, tick };
}

/** Splits a reliable message into link frames. */
export function frameReliable(message: Uint8Array, messageId: number): Uint8Array[] {
  if (message.byteLength <= RELIABLE_CHUNK_BYTES) return [tagged(FRAME_WHOLE, message)];
  const count = Math.ceil(message.byteLength / RELIABLE_CHUNK_BYTES);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = message.subarray(i * RELIABLE_CHUNK_BYTES, Math.min(message.byteLength, (i + 1) * RELIABLE_CHUNK_BYTES));
    const out = new Uint8Array(FRAGMENT_HEADER_BYTES + chunk.byteLength);
    const view = new DataView(out.buffer);
    out[0] = FRAME_FRAGMENT;
    view.setUint32(1, messageId >>> 0, true);
    view.setUint16(5, i, true);
    view.setUint16(7, count, true);
    out.set(chunk, FRAGMENT_HEADER_BYTES);
    frames.push(out);
  }
  return frames;
}

/**
 * Reassembles reliable frames (in order — the channel is ordered). `push`
 * returns a complete message, `null` while one is still arriving, or `false`
 * on a protocol violation (the link drops the peer).
 */
export class ReliableAssembler {
  private id = -1;
  private count = 0;
  private next = 0;
  private parts: Uint8Array[] = [];
  private bytes = 0;

  push(frame: Uint8Array): Uint8Array | null | false {
    if (frame.byteLength < 2) return false;
    if (frame[0] === FRAME_WHOLE) {
      if (this.id !== -1) return false;
      return frame.subarray(1);
    }
    if (frame[0] !== FRAME_FRAGMENT || frame.byteLength <= FRAGMENT_HEADER_BYTES) return false;
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const id = view.getUint32(1, true);
    const index = view.getUint16(5, true);
    const count = view.getUint16(7, true);
    if (count < 2 || count > RELIABLE_MAX_FRAGMENTS) return false;
    if (index === 0) {
      if (this.id !== -1) return false;
      this.id = id;
      this.count = count;
      this.next = 0;
      this.parts = [];
      this.bytes = 0;
    }
    if (id !== this.id || index !== this.next || count !== this.count) return false;
    const chunk = frame.subarray(FRAGMENT_HEADER_BYTES);
    this.bytes += chunk.byteLength;
    if (this.bytes > RELIABLE_MESSAGE_MAX_BYTES) return false;
    this.parts.push(chunk);
    this.next++;
    if (this.next < this.count) return null;
    const out = new Uint8Array(this.bytes);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.byteLength;
    }
    this.id = -1;
    this.parts = [];
    this.bytes = 0;
    return out;
  }
}
