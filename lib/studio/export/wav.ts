/** PCM WAV encoding. Pure: planar Float32 channels in, a `Blob` out, built in chunks so peak memory is about one copy. */
import type { BitDepth } from './range';

/** Frames encoded per chunk. */
const CHUNK_FRAMES = 32_768;

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitDepth: BitDepth;
}

/** The 44-byte RIFF/WAVE header for `frames` frames. */
export function wavHeader(format: WavFormat, frames: number): Uint8Array {
  const bytesPerSample = format.bitDepth / 8;
  const blockAlign = format.channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const out = new Uint8Array(44);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // integer PCM
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, format.bitDepth, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return out;
}

/** One sample to a signed integer, clipped to [-1, 1] first (NaN is silence). */
export function quantize(sample: number, bitDepth: BitDepth): number {
  const s = sample > 1 ? 1 : sample < -1 ? -1 : sample === sample ? sample : 0;
  const scale = bitDepth === 16 ? 0x8000 : 0x800000;
  const max = scale - 1;
  return Math.round(s < 0 ? s * scale : s * max);
}

/** Interleave and encode frames [start, end) of every channel. */
export function encodeChunk(channels: Float32Array[], start: number, end: number, bitDepth: BitDepth): Uint8Array {
  const frames = end - start;
  const bytes = bitDepth / 8;
  const out = new Uint8Array(frames * channels.length * bytes);
  const view = new DataView(out.buffer);
  let at = 0;
  for (let i = start; i < end; i++) {
    for (const channel of channels) {
      const v = quantize(channel[i] ?? 0, bitDepth);
      if (bitDepth === 16) {
        view.setInt16(at, v, true);
      } else {
        out[at] = v & 0xff;
        out[at + 1] = (v >> 8) & 0xff;
        out[at + 2] = (v >> 16) & 0xff;
      }
      at += bytes;
    }
  }
  return out;
}

export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: BitDepth): Blob {
  const frames = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const parts: BlobPart[] = [
    wavHeader(
      {
        sampleRate,
        channels: channels.length,
        bitDepth,
      },
      frames,
    ) as BlobPart,
  ];
  for (let start = 0; start < frames; start += CHUNK_FRAMES) {
    parts.push(encodeChunk(channels, start, Math.min(frames, start + CHUNK_FRAMES), bitDepth) as BlobPart);
  }
  return new Blob(parts, {
    type: 'audio/wav',
  });
}
