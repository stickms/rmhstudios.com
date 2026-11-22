import { describe, expect, it } from 'vitest';
import { encodeChunk, encodeWav, quantize, wavHeader } from '@/lib/studio/export/wav';

const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

describe('wavHeader', () => {
  it('writes the RIFF/WAVE fields for 16-bit stereo', () => {
    const h = wavHeader(
      {
        sampleRate: 44100,
        channels: 2,
        bitDepth: 16,
      },
      1000,
    );
    const v = new DataView(h.buffer);
    expect(h.length).toBe(44);
    expect(text(h, 0, 4)).toBe('RIFF');
    expect(text(h, 8, 4)).toBe('WAVE');
    expect(text(h, 12, 4)).toBe('fmt ');
    expect(text(h, 36, 4)).toBe('data');
    expect(v.getUint32(4, true)).toBe(36 + 4000);
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(44100 * 4);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(4000);
  });

  it('writes the byte rate and block align for 24-bit', () => {
    const v = new DataView(
      wavHeader(
        {
          sampleRate: 48000,
          channels: 2,
          bitDepth: 24,
        },
        10,
      ).buffer,
    );
    expect(v.getUint32(28, true)).toBe(48000 * 6);
    expect(v.getUint16(32, true)).toBe(6);
    expect(v.getUint16(34, true)).toBe(24);
    expect(v.getUint32(40, true)).toBe(60);
  });
});

describe('sample encoding', () => {
  it('maps full scale and silence', () => {
    expect(quantize(0, 16)).toBe(0);
    expect(quantize(1, 16)).toBe(32767);
    expect(quantize(-1, 16)).toBe(-32768);
    expect(quantize(1, 24)).toBe(8388607);
    expect(quantize(-1, 24)).toBe(-8388608);
  });

  it('clips values past full scale and treats NaN as silence', () => {
    expect(quantize(3, 16)).toBe(32767);
    expect(quantize(-3, 16)).toBe(-32768);
    expect(quantize(Number.NaN, 24)).toBe(0);
    expect(quantize(Infinity, 24)).toBe(8388607);
  });

  it('interleaves 16-bit little-endian', () => {
    const out = encodeChunk([Float32Array.of(1, 0), Float32Array.of(-1, 0.5)], 0, 2, 16);
    const v = new DataView(out.buffer);
    expect(out.length).toBe(8);
    expect([v.getInt16(0, true), v.getInt16(2, true), v.getInt16(4, true), v.getInt16(6, true)]).toEqual([
      32767, -32768, 0, 16384,
    ]);
  });

  it('encodes 24-bit as three little-endian bytes', () => {
    const out = encodeChunk([Float32Array.of(1), Float32Array.of(-1)], 0, 1, 24);
    expect(Array.from(out)).toEqual([0xff, 0xff, 0x7f, 0x00, 0x00, 0x80]);
  });
});

describe('encodeWav', () => {
  it('produces header plus exactly the PCM data, across chunk boundaries', async () => {
    const frames = 70_000; // more than two chunks
    const l = new Float32Array(frames).fill(0.25);
    const r = new Float32Array(frames).fill(-0.25);
    const blob = encodeWav([l, r], 48000, 24);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + frames * 6);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const v = new DataView(bytes.buffer);
    expect(v.getUint32(40, true)).toBe(frames * 6);
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    // the last frame is still encoded
    const last = 44 + (frames - 1) * 6;
    expect(bytes[last + 2]).toBe(0x20); // 0.25 of 24-bit full scale is 0x200000
  });
});
