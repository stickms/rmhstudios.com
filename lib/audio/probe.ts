/**
 * Read an audio file's duration from its container headers, without decoding.
 *
 * ## Why this exists
 *
 * `@audio/decode` allocates the entire decoded waveform as Float32 PCM before it
 * returns anything, and compressed audio expands enormously: a valid MPEG-2.5
 * Layer III file at 8 kbps decodes to **32x its own size**, measured. So a 4 MB
 * upload became 128 MB of PCM and ~530 MB of RSS, and the 50 MB upload ceiling
 * bought an attacker roughly 1.6 GB of PCM — 14.6 hours of audio — from a single
 * request, plus ~40 seconds of blocking decode on the way there. Slice It's own
 * 15-minute limit did not help, because it was checked against the duration the
 * *decoder* reported, which is to say after the allocation had already happened.
 *
 * The fix is to know the duration before committing to the decode, and the
 * containers all make that cheap: every format the upload route accepts states
 * its length (or enough to derive it) in bytes you can read without inflating a
 * single sample.
 *
 * ## What it does not do
 *
 * This is a *guard*, not a metadata library. It answers "is this file plausibly
 * short enough to decode?" and nothing else. A file it cannot read returns
 * `null`, and the caller decides — for an upload gate the safe reading of `null`
 * is "refuse", because every format below is one the caller claims to accept.
 *
 * Client-safe (no Node built-ins beyond `Buffer`, which callers supply).
 */

export interface AudioProbe {
  /** Seconds. Derived from the container, never from a decoder. */
  durationSec: number;
  sampleRate: number;
  channels: number;
  /** Which parser produced this, for logging. */
  format: 'wav' | 'flac' | 'ogg' | 'mp3';
}

/**
 * Probe a buffer's duration. Returns null when the format is unrecognised or
 * the headers are too damaged to derive a length from.
 */
export function probeAudioDuration(buffer: Buffer): AudioProbe | null {
  return probeWav(buffer) ?? probeFlac(buffer) ?? probeOgg(buffer) ?? probeMp3(buffer);
}

/**
 * Bytes of Float32 PCM a decode of this file would allocate.
 *
 * The number that actually matters: duration alone under-counts a 192 kHz
 * 8-channel WAV, which is short and still enormous.
 */
export function estimatedPcmBytes(probe: AudioProbe): number {
  return Math.ceil(probe.durationSec * probe.sampleRate * probe.channels * 4);
}

/* ─── WAV ────────────────────────────────────────────────────────────────── */

/**
 * RIFF chunk walk. `fmt ` carries the byte rate and `data` its own size, so the
 * duration is a division — no scanning of the samples themselves.
 */
function probeWav(buf: Buffer): AudioProbe | null {
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let byteRate = 0;
  let dataBytes = 0;

  // Bounded walk: a malformed size field must not spin here.
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ' && body + 16 <= buf.length) {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === 'data') {
      // A `data` size larger than the file is a lie; the real bytes bound it.
      dataBytes = Math.min(size, Math.max(0, buf.length - body));
      break;
    }

    if (size <= 0) break;
    // RIFF chunks are word-aligned.
    offset = body + size + (size % 2);
  }

  if (!sampleRate || !channels || !byteRate || !dataBytes) return null;
  return { durationSec: dataBytes / byteRate, sampleRate, channels, format: 'wav' };
}

/* ─── FLAC ───────────────────────────────────────────────────────────────── */

/**
 * STREAMINFO is mandatory and always the first metadata block, and it states the
 * total sample count outright. The fields are bit-packed across byte
 * boundaries, hence the shifting.
 */
function probeFlac(buf: Buffer): AudioProbe | null {
  if (buf.length < 42 || buf.toString('ascii', 0, 4) !== 'fLaC') return null;

  // 4 magic + 4 block header, then 34 bytes of STREAMINFO.
  const info = 8;
  if ((buf[4] & 0x7f) !== 0) return null; // first block must be STREAMINFO

  // Offsets 10..17 hold: sampleRate(20) channels(3) bitsPerSample(5) total(36).
  const sampleRate = (buf[info + 10] << 12) | (buf[info + 11] << 4) | (buf[info + 12] >> 4);
  const channels = ((buf[info + 12] >> 1) & 0x07) + 1;
  // 36 bits will not fit in a bitwise int32, so the high 4 bits are scaled.
  const totalSamples =
    (buf[info + 13] & 0x0f) * 2 ** 32 +
    buf[info + 14] * 2 ** 24 +
    buf[info + 15] * 2 ** 16 +
    buf[info + 16] * 2 ** 8 +
    buf[info + 17];

  if (!sampleRate || !channels) return null;
  // Zero is legal and means "unknown" — no length to check, so no guard to make.
  if (!totalSamples) return null;
  return { durationSec: totalSamples / sampleRate, sampleRate, channels, format: 'flac' };
}

/* ─── Ogg ────────────────────────────────────────────────────────────────── */

/**
 * The last page's granule position is the stream's final sample index, so
 * duration falls out of it once the rate is known. The rate comes from the
 * identification header on the first page: Vorbis states it, Opus is always
 * timed at 48 kHz regardless of the original rate.
 */
function probeOgg(buf: Buffer): AudioProbe | null {
  if (buf.length < 27 || buf.toString('ascii', 0, 4) !== 'OggS') return null;

  const head = identifyOgg(buf);
  if (!head) return null;

  // Scan backwards for the final page capture pattern. Bounded to the tail —
  // the last page of a well-formed stream is within a few KB of the end.
  const from = Math.max(0, buf.length - 65_536);
  let last = -1;
  for (let i = buf.length - 27; i >= from; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      last = i;
      break;
    }
  }
  if (last < 0) return null;

  // Granule position: 64-bit LE at page offset 6. Read as two 32-bit halves.
  const low = buf.readUInt32LE(last + 6);
  const high = buf.readUInt32LE(last + 10);
  const granule = high * 2 ** 32 + low;
  // -1 (all bits set) marks a page with no packet ending on it.
  if (!Number.isFinite(granule) || granule <= 0 || high === 0xffffffff) return null;

  const samples = Math.max(0, granule - head.preSkip);
  return {
    durationSec: samples / head.timeRate,
    sampleRate: head.sampleRate,
    channels: head.channels,
    format: 'ogg',
  };
}

/**
 * Read the first page's identification header.
 *
 * `timeRate` is the rate granule positions are counted in, which is not always
 * the audio's own rate: Opus stores 48 kHz granules for a stream that may be
 * 16 kHz. Getting that wrong scales the duration by up to 3x.
 */
function identifyOgg(
  buf: Buffer,
): { sampleRate: number; channels: number; timeRate: number; preSkip: number } | null {
  const segments = buf[26];
  const body = 27 + segments;
  if (body + 20 > buf.length) return null;

  if (buf.toString('ascii', body + 1, body + 7) === 'vorbis') {
    const channels = buf[body + 11];
    const sampleRate = buf.readUInt32LE(body + 12);
    if (!channels || !sampleRate) return null;
    return { sampleRate, channels, timeRate: sampleRate, preSkip: 0 };
  }

  if (buf.toString('ascii', body, body + 8) === 'OpusHead') {
    const channels = buf[body + 9];
    const preSkip = buf.readUInt16LE(body + 10);
    const sampleRate = buf.readUInt32LE(body + 12) || 48_000;
    if (!channels) return null;
    // Opus granules always count at 48 kHz; the input rate is informational.
    return { sampleRate, channels, timeRate: 48_000, preSkip };
  }

  return null;
}

/* ─── MP3 ────────────────────────────────────────────────────────────────── */

// [version][layer] → bitrate table index. Version: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5.
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/**
 * Duration from the first frame header, preferring a Xing/Info/VBRI frame count
 * when the encoder left one and falling back to the constant-bitrate division
 * when it did not.
 *
 * The CBR fallback is what closes the hole: the crafted bomb is 8 kbps frames
 * all the way down, which this reads as 14.6 hours without decoding any of it.
 */
function probeMp3(buf: Buffer): AudioProbe | null {
  let offset = 0;

  // Skip an ID3v2 tag: 'ID3' + 2 version + 1 flags + 4 syncsafe size bytes.
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
    // A footer is present when flag bit 4 is set.
    if (buf[5] & 0x10) offset += 10;
  }

  const frame = findFrameHeader(buf, offset);
  if (!frame) return null;

  const { at, version, bitrateKbps, sampleRate, channels, samplesPerFrame } = frame;

  const frames = xingFrameCount(buf, at, version, channels);
  if (frames > 0) {
    return {
      durationSec: (frames * samplesPerFrame) / sampleRate,
      sampleRate,
      channels,
      format: 'mp3',
    };
  }

  if (!bitrateKbps) return null;
  // CBR: the audio bytes divided by the byte rate. Any VBR file without a Xing
  // header is estimated from its first frame, which is what every player does.
  const audioBytes = buf.length - at;
  return {
    durationSec: audioBytes / ((bitrateKbps * 1000) / 8),
    sampleRate,
    channels,
    format: 'mp3',
  };
}

interface Mp3Frame {
  at: number;
  version: number;
  bitrateKbps: number;
  sampleRate: number;
  channels: number;
  samplesPerFrame: number;
}

/** Find the first plausible MPEG audio frame header at or after `from`. */
function findFrameHeader(buf: Buffer, from: number): Mp3Frame | null {
  // Bounded: garbage before the first frame is normal, an unbounded scan is not.
  const limit = Math.min(buf.length - 4, from + 65_536);
  for (let i = Math.max(0, from); i <= limit; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;

    const version = (buf[i + 1] >> 3) & 0x03; // 3=MPEG-1, 2=MPEG-2, 0=MPEG-2.5
    const layer = (buf[i + 1] >> 1) & 0x03; // 1 = Layer III
    if (version === 1 || layer === 0) continue; // reserved

    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    const rateIndex = (buf[i + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue;

    const sampleRate = SAMPLE_RATES[version]?.[rateIndex];
    if (!sampleRate) continue;

    // Only Layer III is in the accepted-formats list; the bitrate tables here
    // are Layer III's.
    if (layer !== 1) continue;
    const bitrateKbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex];
    if (bitrateKbps <= 0) continue;

    const channelMode = (buf[i + 3] >> 6) & 0x03;
    const channels = channelMode === 3 ? 1 : 2;
    // Layer III is 1152 samples per frame on MPEG-1 and 576 on MPEG-2/2.5.
    const samplesPerFrame = version === 3 ? 1152 : 576;

    return { at: i, version, bitrateKbps, sampleRate, channels, samplesPerFrame };
  }
  return null;
}

/**
 * Frame count from a Xing/Info (LAME) or VBRI header, or 0 when absent.
 *
 * The tag lives in the first frame's otherwise-unused side-information area, at
 * an offset that depends on the MPEG version and channel count.
 */
function xingFrameCount(buf: Buffer, frameAt: number, version: number, channels: number): number {
  const sideInfo = version === 3 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17;
  const xingAt = frameAt + 4 + sideInfo;

  if (xingAt + 12 <= buf.length) {
    const tag = buf.toString('ascii', xingAt, xingAt + 4);
    if (tag === 'Xing' || tag === 'Info') {
      const flags = buf.readUInt32BE(xingAt + 4);
      // Bit 0 of the flags says a frame count follows.
      if (flags & 0x01) return buf.readUInt32BE(xingAt + 8);
      return 0;
    }
  }

  // VBRI sits at a fixed offset instead, and always carries a frame count.
  const vbriAt = frameAt + 36;
  if (vbriAt + 18 <= buf.length && buf.toString('ascii', vbriAt, vbriAt + 4) === 'VBRI') {
    return buf.readUInt32BE(vbriAt + 14);
  }

  return 0;
}
