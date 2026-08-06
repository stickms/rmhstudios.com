import { describe, it, expect } from 'vitest';
import { probeAudioDuration, estimatedPcmBytes } from '@/lib/audio/probe';

/* ─── Builders ───────────────────────────────────────────────────────────── */

function wav({
  sampleRate = 44100,
  channels = 2,
  bitsPerSample = 16,
  seconds = 3,
}: { sampleRate?: number; channels?: number; bitsPerSample?: number; seconds?: number } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const dataBytes = Math.round(byteRate * seconds);
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

function flac({ sampleRate = 44100, channels = 2, totalSamples = 44100 * 5 } = {}) {
  const buf = Buffer.alloc(4 + 4 + 34);
  buf.write('fLaC', 0, 'ascii');
  buf[4] = 0x80; // last-metadata-block flag + type 0 (STREAMINFO)
  buf.writeUIntBE(34, 5, 3);
  const i = 8;
  // sampleRate(20) | channels-1(3) | bps-1(5) | totalSamples(36)
  buf[i + 10] = (sampleRate >> 12) & 0xff;
  buf[i + 11] = (sampleRate >> 4) & 0xff;
  buf[i + 12] = ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | (((16 - 1) >> 4) & 1);
  buf[i + 13] = ((((16 - 1) & 0x0f) << 4) | Math.floor(totalSamples / 2 ** 32)) & 0xff;
  buf.writeUInt32BE(totalSamples >>> 0, i + 14);
  return buf;
}

/** MPEG-2.5 Layer III, 8 kbps, 8000 Hz mono — 72-byte frames of 576 samples. */
function mp3Bomb(bytes: number) {
  const frame = Buffer.alloc(72);
  frame[0] = 0xff;
  frame[1] = 0xe3;
  frame[2] = 0x18;
  frame[3] = 0xc0;
  const count = Math.floor(bytes / 72);
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

/** MPEG-1 Layer III, 128 kbps, 44100 Hz stereo — an ordinary track. */
function mp3Cbr(seconds: number, { id3 = false } = {}) {
  const frame = Buffer.alloc(417);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG-1 Layer III, no CRC
  frame[2] = 0x90; // bitrate index 9 (128k), rate index 0 (44100)
  frame[3] = 0x00; // stereo
  const frames = Math.round((seconds * 44100) / 1152);
  const audio = Buffer.concat(Array.from({ length: frames }, () => frame));
  if (!id3) return audio;

  const tag = Buffer.alloc(10 + 1000);
  tag.write('ID3', 0, 'ascii');
  tag[3] = 3;
  // Syncsafe size of the tag body.
  tag[6] = 0;
  tag[7] = 0;
  tag[8] = (1000 >> 7) & 0x7f;
  tag[9] = 1000 & 0x7f;
  return Buffer.concat([tag, audio]);
}

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('probeAudioDuration', () => {
  it('reads a WAV duration from its byte rate and data size', () => {
    const probe = probeAudioDuration(wav({ seconds: 7.5 }));
    expect(probe?.format).toBe('wav');
    expect(probe!.durationSec).toBeCloseTo(7.5, 3);
    expect(probe!.sampleRate).toBe(44100);
    expect(probe!.channels).toBe(2);
  });

  it('bounds a WAV whose declared data size is larger than the file', () => {
    // The classic lie: a 20-byte payload claiming 4 GB of samples.
    const buf = wav({ seconds: 0.001 });
    buf.writeUInt32LE(0xffffffff, 40);
    const probe = probeAudioDuration(buf);
    // Clamped to the bytes that are actually present, not the claim.
    expect(probe!.durationSec).toBeLessThan(1);
  });

  it('reads a FLAC duration from STREAMINFO', () => {
    const probe = probeAudioDuration(flac({ totalSamples: 44100 * 12 }));
    expect(probe?.format).toBe('flac');
    expect(probe!.durationSec).toBeCloseTo(12, 3);
  });

  it('reads a constant-bitrate MP3, with and without an ID3v2 tag', () => {
    const plain = probeAudioDuration(mp3Cbr(30));
    expect(plain?.format).toBe('mp3');
    expect(plain!.durationSec).toBeCloseTo(30, 0);
    expect(plain!.sampleRate).toBe(44100);
    expect(plain!.channels).toBe(2);

    const tagged = probeAudioDuration(mp3Cbr(30, { id3: true }));
    // The tag bytes must not be counted as audio.
    expect(tagged!.durationSec).toBeCloseTo(30, 0);
  });

  it('sees the decompression bomb for what it is, without decoding it', () => {
    // 4 MB of 8 kbps frames. Decoding this really does produce 128 MB of PCM
    // and ~530 MB of RSS — the probe reaches the same conclusion in bytes.
    const bomb = mp3Bomb(4 * 1024 * 1024);
    const probe = probeAudioDuration(bomb);
    expect(probe?.format).toBe('mp3');
    expect(probe!.durationSec).toBeGreaterThan(4000); // over an hour, from 4 MB
    expect(estimatedPcmBytes(probe!)).toBeGreaterThan(120 * 1024 * 1024);
  });

  it('estimates the PCM a decode would allocate, not just the duration', () => {
    // Short but enormous: 10 seconds of 192 kHz 8-channel audio.
    const probe = probeAudioDuration(
      wav({ sampleRate: 192_000, channels: 8, seconds: 10, bitsPerSample: 24 }),
    );
    expect(probe!.durationSec).toBeCloseTo(10, 1);
    // 10 s x 192000 Hz x 8 ch x 4 bytes = 61.44 MB, from a file the duration
    // check alone would have waved through as "ten seconds, fine".
    expect(estimatedPcmBytes(probe!)).toBe(61_440_000);
  });

  it('returns null for anything it cannot read a length from', () => {
    expect(probeAudioDuration(Buffer.alloc(0))).toBeNull();
    expect(probeAudioDuration(Buffer.from('not audio at all'))).toBeNull();
    // RIFF/WAVE with no fmt or data chunk.
    const truncated = Buffer.alloc(12);
    truncated.write('RIFF', 0, 'ascii');
    truncated.write('WAVE', 8, 'ascii');
    expect(probeAudioDuration(truncated)).toBeNull();
  });

  it('does not spin on a WAV chunk whose size field is zero', () => {
    const buf = Buffer.alloc(64);
    buf.write('RIFF', 0, 'ascii');
    buf.write('WAVE', 8, 'ascii');
    buf.write('junk', 12, 'ascii');
    buf.writeUInt32LE(0, 16);
    expect(probeAudioDuration(buf)).toBeNull();
  });
});
