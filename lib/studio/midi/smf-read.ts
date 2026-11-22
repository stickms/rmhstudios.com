/**
 * Reads a Standard MIDI File (type 0 or 1). Pure and defensive: every read checks the bytes that remain, a
 * variable-length quantity is at most four bytes, and the result is a value, never a throw.
 */
import {
  SMF_MAX_BYTES,
  SMF_MAX_EVENTS,
  SMF_MAX_TRACKS,
  type SmfError,
  type SmfEvent,
  type SmfFile,
  type SmfTrack,
} from './smf-types';

export type SmfResult =
  | {
      ok: true;
      file: SmfFile;
    }
  | {
      ok: false;
      error: SmfError;
    };

class ParseError extends Error {
  constructor(readonly code: SmfError) {
    super(code);
  }
}

class Cursor {
  pos = 0;
  constructor(
    private readonly data: Uint8Array,
    readonly end: number,
  ) {}
  get remaining() {
    return this.end - this.pos;
  }
  need(n: number) {
    if (n < 0 || this.remaining < n) throw new ParseError('truncated');
  }
  u8(): number {
    this.need(1);
    return this.data[this.pos++];
  }
  u16(): number {
    this.need(2);
    const v = (this.data[this.pos] << 8) | this.data[this.pos + 1];
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const d = this.data;
    const v = d[this.pos] * 0x1000000 + ((d[this.pos + 1] << 16) | (d[this.pos + 2] << 8) | d[this.pos + 3]);
    this.pos += 4;
    return v;
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new ParseError('malformed');
  }
  tag(): string {
    const b = this.bytes(4);
    return String.fromCharCode(b[0], b[1], b[2], b[3]);
  }
}

function readTrack(
  c: Cursor,
  budget: {
    events: number;
  },
): SmfTrack {
  const events: SmfEvent[] = [];
  let tick = 0;
  let running = 0;
  while (c.remaining > 0) {
    if (++budget.events > SMF_MAX_EVENTS) throw new ParseError('too-many-events');
    tick += c.vlq();
    let status = c.u8();
    if (status < 0x80) {
      // Running status: the data byte just read belongs to the previous channel message.
      if (running === 0) throw new ParseError('malformed');
      c.pos -= 1;
      status = running;
    }

    if (status === 0xff) {
      const type = c.u8();
      const len = c.vlq();
      const data = c.bytes(len);
      if (type === 0x2f) break;
      if (type === 0x51 && len === 3) {
        events.push({
          tick,
          type: 'tempo',
          microsPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2],
        });
      } else if (type === 0x58 && len >= 2) {
        events.push({
          tick,
          type: 'timeSignature',
          numerator: data[0],
          denominator: 2 ** Math.min(data[1], 7),
        });
      } else if (type === 0x03) {
        events.push({
          tick,
          type: 'trackName',
          name: new TextDecoder('utf-8').decode(data).replace(/\0/g, ''),
        });
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      c.skip(c.vlq());
      continue;
    }
    if (status >= 0xf8) continue; // realtime bytes carry no data and never appear in a file
    if (status >= 0xf1) throw new ParseError('malformed');

    running = status;
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    if (kind === 0xc0 || kind === 0xd0) {
      c.skip(1);
      continue;
    }
    const a = c.u8();
    const b = c.u8();
    if (a > 127 || b > 127) throw new ParseError('malformed');
    if (kind === 0x90 && b > 0)
      events.push({
        tick,
        type: 'noteOn',
        channel,
        note: a,
        velocity: b,
      });
    else if (kind === 0x80 || kind === 0x90)
      events.push({
        tick,
        type: 'noteOff',
        channel,
        note: a,
        velocity: b,
      });
    // Aftertouch, controllers and pitch bend are not used by the Studio.
  }
  return {
    events,
  };
}

export function readSmf(input: Uint8Array | ArrayBuffer): SmfResult {
  try {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (data.length > SMF_MAX_BYTES)
      return {
        ok: false,
        error: 'too-large',
      };
    if (data.length < 4)
      return {
        ok: false,
        error: 'not-midi',
      };
    const c = new Cursor(data, data.length);
    if (c.tag() !== 'MThd')
      return {
        ok: false,
        error: 'not-midi',
      };
    const headLen = c.u32();
    if (headLen < 6)
      return {
        ok: false,
        error: 'malformed',
      };
    const head = new Cursor(c.bytes(headLen), headLen);
    const format = head.u16();
    const trackCount = head.u16();
    const division = head.u16();
    if (format > 1)
      return {
        ok: false,
        error: 'unsupported-format',
      };
    if (division & 0x8000)
      return {
        ok: false,
        error: 'unsupported-timing',
      };
    if (division === 0)
      return {
        ok: false,
        error: 'malformed',
      };
    if (trackCount > SMF_MAX_TRACKS)
      return {
        ok: false,
        error: 'too-many-tracks',
      };
    if (format === 0 && trackCount !== 1)
      return {
        ok: false,
        error: 'malformed',
      };

    const budget = {
      events: 0,
    };
    const tracks: SmfTrack[] = [];
    while (tracks.length < trackCount) {
      if (c.remaining === 0)
        return {
          ok: false,
          error: 'truncated',
        };
      const tag = c.tag();
      const len = c.u32();
      if (len > c.remaining)
        return {
          ok: false,
          error: 'truncated',
        };
      const body = c.bytes(len);
      if (tag !== 'MTrk') continue; // unknown chunks are skipped, as the spec asks
      tracks.push(readTrack(new Cursor(body, body.length), budget));
    }
    return {
      ok: true,
      file: {
        format: format === 0 ? 0 : 1,
        ppq: division,
        tracks,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ParseError ? e.code : 'malformed',
    };
  }
}
