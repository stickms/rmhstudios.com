/**
 * Slice It — the hit-sound pool: assets and selection.
 *
 * Two things are guarded here, and neither is "how the game plays":
 *
 * 1. **Every id in the picker resolves to a real, playable file.** The id IS
 *    the filename, so a typo or a deleted asset is a 404 mid-run with no build
 *    error anywhere ahead of it — the engine just falls back to the synth click
 *    and nobody finds out until a player reports it.
 * 2. **Shuffle cannot play the same sample twice in a row.** Enumerated, not
 *    sampled: the point of injecting `random` into `pickHitSound` is that this
 *    can be proved for every reachable draw rather than observed over N tries
 *    and hoped to hold.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HIT_SOUND_ID,
  HIT_SOUND_OPTIONS,
  HIT_SOUND_SAMPLE_IDS,
  hitSoundPath,
  hitSoundPreloadList,
  pickHitSound,
  RANDOM_HIT_SOUND_ID,
} from '../hit-sound-pool';

const SOUND_DIR = join(process.cwd(), 'public', 'music', 'slice-it', 'sounds');

/** The set added by `scripts/gen-slice-it-hit-sounds.ts`. */
const GENERATED = [
  'click_sharp.wav',
  'click_glass.wav',
  'synth_tick.wav',
  'tap_crisp.wav',
  'tap_rim.wav',
  'pop_soft.wav',
  'pop_bubble.wav',
  'impact_snap.wav',
  'impact_punch.wav',
  'bass_thump.wav',
  'glitch_bit.wav',
  'glitch_zap.wav',
  'arcade_confirm.wav',
  'metal_ping.wav',
  'metal_anvil.wav',
];

/** The samples that shipped before the generated set. */
const PRE_EXISTING = [
  'drum-hitclap.wav',
  'drum-hitfinish.wav',
  'drum-hitwhistle.wav',
  'soft-hitfinish.wav',
  'soft-hitwhistle.wav',
  'all purpose clap.wav',
  'snare_a.wav',
  'snare_b.wav',
  'snare_c.wav',
  'snare_electronic_a.wav',
  'snare_electronic_b.wav',
  'snare_electronic_c.wav',
  'kick_a.wav',
  'kick_b.wav',
  'kick_c.wav',
  'kick_electronic_a.wav',
  'kick_electronic_b.wav',
  'kick_electronic_c.wav',
  'cymbal_a.wav',
  'cymbal_b.wav',
  'cymbal_c.wav',
  'tick.wav',
  'tock.wav',
];

interface WavInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  frames: number;
  /** Signed samples in [-1, 1), channel 0 only. */
  mono: Float64Array;
}

/**
 * Enough of a RIFF reader to answer "is this a playable WAV, and what is in
 * it". Chunk-walking rather than a fixed 44-byte assumption: the samples that
 * shipped before this set carry `LIST`/`fact` chunks, and a reader that assumes
 * the header size reads their metadata as audio.
 */
function readWav(file: string): WavInfo {
  const buf = readFileSync(join(SOUND_DIR, file));
  expect(buf.toString('ascii', 0, 4), `${file} RIFF magic`).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12), `${file} WAVE magic`).toBe('WAVE');

  let pos = 12;
  let fmt: Omit<WavInfo, 'frames' | 'mono'> | null = null;
  let dataAt = -1;
  let dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      let audioFormat = buf.readUInt16LE(body);
      // WAVE_FORMAT_EXTENSIBLE carries the real tag in its sub-format GUID.
      if (audioFormat === 0xfffe && size >= 40) audioFormat = buf.readUInt16LE(body + 24);
      fmt = {
        audioFormat,
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataAt = body;
      dataLen = Math.min(size, buf.length - body);
    }
    pos = body + size + (size % 2);
  }

  expect(fmt, `${file} has a fmt chunk`).not.toBeNull();
  expect(dataAt, `${file} has a data chunk`).toBeGreaterThan(0);
  const format = fmt!;
  const bytes = format.bitsPerSample / 8;
  const frames = Math.floor(dataLen / (bytes * format.channels));

  const mono = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const at = dataAt + i * bytes * format.channels;
    if (format.audioFormat === 3 && format.bitsPerSample === 32) mono[i] = buf.readFloatLE(at);
    else if (format.bitsPerSample === 8) mono[i] = (buf.readUInt8(at) - 128) / 128;
    else if (format.bitsPerSample === 16) mono[i] = buf.readInt16LE(at) / 32768;
    else if (format.bitsPerSample === 24) {
      mono[i] =
        (buf.readUInt8(at) | (buf.readUInt8(at + 1) << 8) | (buf.readInt8(at + 2) << 16)) / 8388608;
    } else if (format.bitsPerSample === 32) mono[i] = buf.readInt32LE(at) / 2147483648;
  }
  return { ...format, frames, mono };
}

/** Loudest 100 ms window RMS, in dBFS. */
function loudnessDb(wav: WavInfo): number {
  const win = Math.min(wav.frames, Math.round(wav.sampleRate * 0.1));
  let acc = 0;
  let best = 0;
  for (let i = 0; i < wav.frames; i++) {
    acc += wav.mono[i] * wav.mono[i];
    if (i >= win) acc -= wav.mono[i - win] * wav.mono[i - win];
    if (i >= win - 1) best = Math.max(best, acc / win);
  }
  return 10 * Math.log10(best || Number.MIN_VALUE);
}

describe('hit sound assets', () => {
  it('registers all 15 generated samples in the pool', () => {
    for (const file of GENERATED) {
      expect(HIT_SOUND_SAMPLE_IDS, `${file} is registered`).toContain(file);
    }
    // Every registered sample carries a label and a category, or it renders as
    // an unlabelled tile in the drawer.
    for (const option of HIT_SOUND_OPTIONS) {
      expect(option.label.length, `${option.id} has a label`).toBeGreaterThan(0);
      expect(option.category.length, `${option.id} has a category`).toBeGreaterThan(0);
    }
  });

  it('keeps every pre-existing sample registered alongside the new ones', () => {
    for (const file of PRE_EXISTING) {
      expect(HIT_SOUND_SAMPLE_IDS, `${file} is still registered`).toContain(file);
    }
    expect(HIT_SOUND_SAMPLE_IDS).toHaveLength(PRE_EXISTING.length + GENERATED.length);
    expect(new Set(HIT_SOUND_SAMPLE_IDS).size, 'no duplicate ids').toBe(
      HIT_SOUND_SAMPLE_IDS.length,
    );
  });

  it('resolves every registered sample to a readable WAV on disk', () => {
    for (const id of HIT_SOUND_SAMPLE_IDS) {
      const wav = readWav(id);
      expect(wav.frames, `${id} has audio`).toBeGreaterThan(0);
      expect(wav.channels, `${id} channel count`).toBeGreaterThanOrEqual(1);
      expect(wav.sampleRate, `${id} sample rate`).toBeGreaterThan(0);
      // The upload validator's ceiling (`hit-sounds.ts`) is the same bound the
      // stock set has to respect — a sample longer than this is held decoded
      // for the whole run for no gameplay benefit.
      expect(wav.frames / wav.sampleRate, `${id} duration`).toBeLessThanOrEqual(2);
    }
  });

  it('generates the new set at the format the directory already uses', () => {
    for (const file of GENERATED) {
      const wav = readWav(file);
      expect(wav.audioFormat, `${file} is PCM`).toBe(1);
      expect(wav.sampleRate, `${file} sample rate`).toBe(44100);
      expect(wav.bitsPerSample, `${file} bit depth`).toBe(16);
      expect(wav.channels, `${file} channels`).toBe(2);
    }
  });

  it('starts the new set on its transient, with no clipping and a short tail', () => {
    for (const file of GENERATED) {
      const wav = readWav(file);
      const durationMs = (wav.frames / wav.sampleRate) * 1000;

      // Leading silence in a rhythm game reads as the player being late.
      let onset = 0;
      while (onset < wav.frames && Math.abs(wav.mono[onset]) < 0.001) onset++;
      expect((onset / wav.sampleRate) * 1000, `${file} leading silence (ms)`).toBeLessThan(1);

      let peak = 0;
      let clipped = 0;
      for (let i = 0; i < wav.frames; i++) {
        peak = Math.max(peak, Math.abs(wav.mono[i]));
        if (Math.abs(wav.mono[i]) >= 0.999) clipped++;
      }
      expect(clipped, `${file} clipped samples`).toBe(0);
      // Loud enough to sit with the rest of the set rather than vanish.
      expect(peak, `${file} peak`).toBeGreaterThan(0.4);

      // Short enough to repeat densely: these are hit sounds, not one-shots.
      expect(durationMs, `${file} duration (ms)`).toBeLessThanOrEqual(300);
      expect(durationMs, `${file} duration (ms)`).toBeGreaterThanOrEqual(20);

      // Perceived level, as the loudest 100 ms window RMS — the same metric
      // `scripts/gen-slice-it-hit-sounds.ts` normalises on. The band is the
      // one the existing samples occupy; a regenerated sample that falls out
      // of it is one that will jump out of a Shuffle run.
      expect(loudnessDb(wav), `${file} loudness (dBFS)`).toBeGreaterThan(-18);
      expect(loudnessDb(wav), `${file} loudness (dBFS)`).toBeLessThan(-9);
    }
  });

  it('builds sample URLs under the sounds directory', () => {
    expect(hitSoundPath('click_sharp.wav')).toBe('/music/slice-it/sounds/click_sharp.wav');
  });
});

describe('pickHitSound', () => {
  const POOL = ['a.wav', 'b.wav', 'c.wav', 'd.wav'];
  /** A random source that lands exactly on index `i` of an `n`-long list. */
  const at = (i: number, n: number) => () => (i + 0.5) / n;

  it('reaches every sample in the pool', () => {
    // Deterministic enumeration: drive the picker onto each index in turn.
    const reached = HIT_SOUND_SAMPLE_IDS.map((_, i) =>
      pickHitSound(HIT_SOUND_SAMPLE_IDS, null, at(i, HIT_SOUND_SAMPLE_IDS.length)),
    );
    expect(reached).toEqual([...HIT_SOUND_SAMPLE_IDS]);
  });

  it('reaches every sample except the one just played, whatever just played', () => {
    const n = HIT_SOUND_SAMPLE_IDS.length;
    for (const last of HIT_SOUND_SAMPLE_IDS) {
      const reachable = new Set<string>();
      // One draw per eligible index covers every outcome the picker can produce.
      for (let i = 0; i < n - 1; i++) {
        reachable.add(pickHitSound(HIT_SOUND_SAMPLE_IDS, last, at(i, n - 1))!);
      }
      expect(reachable.has(last), `${last} excluded after itself`).toBe(false);
      expect(reachable.size, `every other sample reachable after ${last}`).toBe(n - 1);
    }
  });

  it('never repeats across a full sweep of the random range', () => {
    // 0 and (just under) 1 are the boundaries a `Math.floor(r * n)` index gets
    // wrong; sweep them and everything between, feeding each pick back in.
    let last: string | null = null;
    for (let step = 0; step <= 400; step++) {
      const r = step / 400;
      const picked = pickHitSound(HIT_SOUND_SAMPLE_IDS, last, () => Math.min(r, 0.9999999));
      expect(picked).not.toBeNull();
      expect(HIT_SOUND_SAMPLE_IDS).toContain(picked!);
      expect(picked, 'consecutive repeat').not.toBe(last);
      last = picked;
    }
  });

  it('keeps the remaining samples uniform relative to each other', () => {
    // Excluding one entry must not privilege any of the others: each eligible
    // index is hit by exactly one contiguous slice of the random range.
    const counts = new Map<string, number>();
    const steps = 9_999; // a multiple of the three eligible entries
    for (let step = 0; step < steps; step++) {
      const picked = pickHitSound(POOL, 'b.wav', () => step / steps)!;
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    expect(counts.get('b.wav')).toBeUndefined();
    expect([...counts.values()]).toEqual([steps / 3, steps / 3, steps / 3]);
  });

  it('handles empty and single-sample pools without throwing', () => {
    expect(pickHitSound([], null, () => 0)).toBeNull();
    expect(pickHitSound([], 'a.wav', () => 0.9999)).toBeNull();
    expect(pickHitSound(['only.wav'], null, () => 0)).toBe('only.wav');
    // One sample and it is also the last played: repeating beats silence.
    expect(pickHitSound(['only.wav'], 'only.wav', () => 0.9999)).toBe('only.wav');
  });

  it('falls back to the whole pool when nothing is eligible', () => {
    expect(pickHitSound(['a.wav', 'a.wav'], 'a.wav', () => 0.5)).toBe('a.wav');
  });
});

describe('hitSoundPreloadList', () => {
  it('warms nothing for the synthesised default', () => {
    expect(hitSoundPreloadList(DEFAULT_HIT_SOUND_ID)).toEqual([]);
    expect(hitSoundPreloadList('')).toEqual([]);
    expect(hitSoundPreloadList(null)).toEqual([]);
  });

  it('warms one file for a named sample', () => {
    expect(hitSoundPreloadList('tick.wav')).toEqual(['tick.wav']);
  });

  it('warms the whole pool for shuffle, since any of it can be first', () => {
    expect(hitSoundPreloadList(RANDOM_HIT_SOUND_ID)).toEqual(HIT_SOUND_SAMPLE_IDS);
  });
});
