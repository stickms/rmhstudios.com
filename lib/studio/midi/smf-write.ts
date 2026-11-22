/** Writes a Standard MIDI File (type 1, or type 0 for a single track). Pure: bytes in memory, no I/O. */
import { SMF_MAX_VLQ, type SmfEvent, type SmfFile } from './smf-types';

class ByteSink {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u8(v >>> 24);
    this.u8(v >>> 16);
    this.u8(v >>> 8);
    this.u8(v);
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
  }
  vlq(value: number) {
    let v = Math.min(Math.max(0, Math.round(value)), SMF_MAX_VLQ);
    const out = [v & 0x7f];
    while ((v >>= 7) > 0) out.push((v & 0x7f) | 0x80);
    for (let i = out.length - 1; i >= 0; i--) this.u8(out[i]);
  }
  raw(data: ArrayLike<number>) {
    for (let i = 0; i < data.length; i++) this.u8(data[i]);
  }
  get length() {
    return this.bytes.length;
  }
  toArray() {
    return this.bytes;
  }
}

/** At one tick a note-off goes first so a repeated note retriggers, and meta events lead. */
function rank(e: SmfEvent): number {
  switch (e.type) {
    case 'tempo':
    case 'timeSignature':
    case 'trackName':
      return 0;
    case 'noteOff':
      return 1;
    case 'noteOn':
      return 2;
  }
}

function byte(v: number, max = 127): number {
  return Math.min(max, Math.max(0, Math.round(v)));
}

function writeEvent(out: ByteSink, e: SmfEvent) {
  switch (e.type) {
    case 'noteOn':
      out.u8(0x90 | (e.channel & 0x0f));
      out.u8(byte(e.note));
      out.u8(byte(e.velocity));
      break;
    case 'noteOff':
      out.u8(0x80 | (e.channel & 0x0f));
      out.u8(byte(e.note));
      out.u8(byte(e.velocity));
      break;
    case 'tempo': {
      const micros = Math.min(0xffffff, Math.max(1, Math.round(e.microsPerQuarter)));
      out.raw([0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]);
      break;
    }
    case 'timeSignature': {
      const power = Math.min(7, Math.max(0, Math.round(Math.log2(Math.max(1, e.denominator)))));
      out.raw([0xff, 0x58, 0x04, byte(e.numerator, 255), power, 24, 8]);
      break;
    }
    case 'trackName': {
      // UTF-8, capped so the length fits one byte of a variable-length quantity.
      const data = new TextEncoder().encode(e.name).slice(0, 120);
      out.raw([0xff, 0x03]);
      out.vlq(data.length);
      out.raw(data);
      break;
    }
  }
}

export function writeSmf(file: SmfFile): Uint8Array {
  const out = new ByteSink();
  out.ascii('MThd');
  out.u32(6);
  out.u16(file.format);
  out.u16(file.tracks.length);
  out.u16(file.ppq);

  for (const track of file.tracks) {
    const body = new ByteSink();
    const sorted = track.events
      .map((e, i) => ({
        e,
        i,
      }))
      .sort((a, b) => a.e.tick - b.e.tick || rank(a.e) - rank(b.e) || a.i - b.i);
    let last = 0;
    for (const { e } of sorted) {
      const tick = Math.max(last, Math.round(e.tick));
      body.vlq(tick - last);
      last = tick;
      writeEvent(body, e);
    }
    body.vlq(0);
    body.raw([0xff, 0x2f, 0x00]);
    out.ascii('MTrk');
    out.u32(body.length);
    out.raw(body.toArray());
  }
  return Uint8Array.from(out.toArray());
}
