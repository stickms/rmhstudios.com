/**
 * The shared peer-to-peer framing (lib/shared/p2p/wire.ts, relay.ts, ice.ts):
 * reliable fragmentation and reassembly at every boundary, the assembler's
 * protocol checks, ping/pong and control encoding, the relay header and the
 * slot-in-peer-id convention, and ICE list parsing.
 */

import { describe, expect, it } from 'vitest';
import {
  decodeControl,
  decodePing,
  encodeControl,
  encodePing,
  FRAGMENT_HEADER_BYTES,
  FRAME_FRAGMENT,
  FRAME_WHOLE,
  frameReliable,
  RELIABLE_CHUNK_BYTES,
  RELIABLE_MESSAGE_MAX_BYTES,
  ReliableAssembler,
  TAG_CONTROL,
  TAG_PING,
  TAG_PONG,
} from '../wire';
import { decodeRelay, encodeRelay, peerIdWithSlot, relaySlotOf } from '../relay';
import { clampIceServers, DEFAULT_ICE_SERVERS, hasTurn, parseIceServers, resolveIceServers, zIceServers } from '../ice';

function bytes(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

function roundTrip(message: Uint8Array): Uint8Array {
  const asm = new ReliableAssembler();
  const frames = frameReliable(message, 42);
  let out: Uint8Array | null | false = null;
  frames.forEach((f, i) => {
    out = asm.push(f);
    if (i < frames.length - 1) expect(out).toBeNull();
  });
  expect(out).toBeInstanceOf(Uint8Array);
  return out as unknown as Uint8Array;
}

describe('reliable fragmentation', () => {
  it.each([1, 100, RELIABLE_CHUNK_BYTES, RELIABLE_CHUNK_BYTES + 1, 3 * RELIABLE_CHUNK_BYTES, RELIABLE_MESSAGE_MAX_BYTES])(
    'round-trips a %i-byte message',
    (n) => {
      const message = bytes(n);
      const frames = frameReliable(message, 9);
      expect(frames.length).toBe(n <= RELIABLE_CHUNK_BYTES ? 1 : Math.ceil(n / RELIABLE_CHUNK_BYTES));
      expect(frames.every((f) => f.byteLength <= RELIABLE_CHUNK_BYTES + FRAGMENT_HEADER_BYTES)).toBe(true);
      expect(roundTrip(message)).toEqual(message);
    },
  );

  it('reassembles messages back to back on one assembler', () => {
    const asm = new ReliableAssembler();
    const a = bytes(40_000, 1);
    const b = bytes(5, 2);
    const c = bytes(16_001, 3);
    const got: Uint8Array[] = [];
    for (const [m, id] of [[a, 1], [b, 2], [c, 3]] as const) {
      for (const f of frameReliable(m, id)) {
        const r = asm.push(f);
        expect(r).not.toBe(false);
        if (r) got.push(r.slice());
      }
    }
    expect(got).toEqual([a, b, c]);
  });

  it('refuses a message above the cap while it arrives', () => {
    const asm = new ReliableAssembler();
    const frames = frameReliable(bytes(RELIABLE_MESSAGE_MAX_BYTES + 1), 5);
    let verdict: Uint8Array | null | false = null;
    for (const f of frames) {
      verdict = asm.push(f);
      if (verdict === false) break;
    }
    expect(verdict).toBe(false);
  });

  it('flags protocol violations: out of order, interleaved, foreign ids, bad counts, junk', () => {
    const frames = frameReliable(bytes(50_000), 77);
    const skip = new ReliableAssembler();
    expect(skip.push(frames[0])).toBeNull();
    expect(skip.push(frames[2])).toBe(false);

    const interleave = new ReliableAssembler();
    expect(interleave.push(frames[0])).toBeNull();
    expect(interleave.push(frameReliable(bytes(3), 1)[0])).toBe(false);

    const foreign = new ReliableAssembler();
    expect(foreign.push(frames[0])).toBeNull();
    const other = frameReliable(bytes(50_000), 78);
    expect(foreign.push(other[1])).toBe(false);

    const lateStart = new ReliableAssembler();
    expect(lateStart.push(frames[1])).toBe(false);

    const badCount = frames[0].slice();
    new DataView(badCount.buffer).setUint16(7, 1, true);
    expect(new ReliableAssembler().push(badCount)).toBe(false);

    expect(new ReliableAssembler().push(new Uint8Array([FRAME_WHOLE]))).toBe(false);
    expect(new ReliableAssembler().push(new Uint8Array([0x99, 1, 2]))).toBe(false);
    expect(new ReliableAssembler().push(new Uint8Array([FRAME_FRAGMENT, 1, 2, 3]))).toBe(false);
  });
});

describe('ping, pong, control', () => {
  it('round-trips pings and pongs and rejects malformed ones', () => {
    expect(decodePing(encodePing(TAG_PING, 3, 1234.5))).toEqual({ seq: 3, sentAt: 1234.5, tick: -1 });
    expect(decodePing(encodePing(TAG_PONG, 0xffffffff, 1, 99))).toEqual({ seq: 0xffffffff, sentAt: 1, tick: 99 });
    expect(decodePing(encodePing(TAG_PING, 1, 2).subarray(0, 12))).toBeNull();
    expect(decodePing(encodePing(TAG_PING, 1, Number.NaN))).toBeNull();
    expect(decodePing(new Uint8Array(13))).toBeNull();
  });

  it('round-trips control JSON and refuses non-JSON, bad UTF-8 and other tags', () => {
    const msg = { v: 1, k: 'chat', d: { text: 'hé ♠' } };
    const enc = encodeControl(msg);
    expect(enc[0]).toBe(TAG_CONTROL);
    expect(decodeControl(enc)).toEqual(msg);
    expect(decodeControl(new Uint8Array([TAG_CONTROL, 0x7b]))).toBeUndefined();
    expect(decodeControl(new Uint8Array([TAG_CONTROL, 0xff, 0xfe]))).toBeUndefined();
    expect(decodeControl(new Uint8Array([0x20, 0x31]))).toBeUndefined();
    expect(decodeControl(new Uint8Array([TAG_CONTROL]))).toBeUndefined();
  });
});

describe('relay header and slots', () => {
  it('round-trips frames and rejects empty payloads and unknown flags', () => {
    const f = encodeRelay(5, true, new Uint8Array([9, 8]));
    expect(decodeRelay(f)).toEqual({ slot: 5, reliable: true, payload: new Uint8Array([9, 8]) });
    expect(decodeRelay(encodeRelay(127, false, new Uint8Array([1])))?.slot).toBe(127);
    expect(decodeRelay(new Uint8Array([1, 2]))).toBeNull();
    expect(decodeRelay(new Uint8Array([2, 1, 0]))).toBeNull();
  });

  it('encodes the relay slot in the tail of a 12-character peer id', () => {
    for (const slot of [1, 15, 16, 127]) {
      const id = peerIdWithSlot('ABCDEFGHIJKLMN', slot);
      expect(id).toHaveLength(12);
      expect(relaySlotOf(id)).toBe(slot);
    }
    expect(() => peerIdWithSlot('ABCDEFGHIJ', 0)).toThrow();
    expect(() => peerIdWithSlot('ABCDEFGHIJ', 128)).toThrow();
    expect(() => peerIdWithSlot('ABC', 3)).toThrow();
    expect(relaySlotOf('ABCDEFGHIJ00')).toBeNull();
    expect(relaySlotOf('ABCDEFGHIJ80')).toBeNull();
    expect(relaySlotOf('ABCDEFGHIJzz')).toBeNull();
  });
});

describe('ICE servers', () => {
  it('parses env JSON, honours [] and falls back on junk', () => {
    expect(parseIceServers(undefined)).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('  ')).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('[]')).toEqual([]);
    expect(parseIceServers('{nope')).toEqual(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('[{"urls":"http://x"}]')).toEqual(DEFAULT_ICE_SERVERS);
    const custom = [{ urls: 'stun:a.example:3478' }];
    expect(parseIceServers(JSON.stringify(custom), [])).toEqual(custom);
    expect(parseIceServers('bad', custom)).toEqual(custom);
  });

  it('prefers a valid, non-empty hub list', () => {
    const hub = [{ urls: ['turn:t.example:3478'], username: 'u', credential: 'p' }];
    expect(resolveIceServers(hub)).toEqual(hub);
    expect(resolveIceServers([])).toEqual(DEFAULT_ICE_SERVERS);
    expect(resolveIceServers([{ urls: 'ftp:x' }])).toEqual(DEFAULT_ICE_SERVERS);
    expect(hasTurn(hub)).toBe(true);
    expect(hasTurn(DEFAULT_ICE_SERVERS)).toBe(false);
  });

  it('clamps a hub list to what browsers accept', () => {
    const many = Array.from({ length: 12 }, (_, i) => `stun:s${i}.example:3478`);
    const clamped = clampIceServers([{ urls: many }, { urls: 'nope' }, { urls: ['turns:t.example'], username: 'x'.repeat(300) }]);
    expect(zIceServers.safeParse(clamped).success).toBe(true);
    expect(clamped).toEqual([{ urls: many.slice(0, 8) }]);
    const lots = Array.from({ length: 10 }, (_, i) => ({ urls: `stun:${i}.example` }));
    expect(clampIceServers(lots)).toHaveLength(8);
  });
});
