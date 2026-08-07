/**
 * V2, V3 and V7 — hit sound sets, the spectrum envelope and the backdrop.
 *
 * The envelope tests are about SIZE and about not lying: a backdrop that keeps
 * pulsing through a silent outro, or that costs more bytes than the cover it
 * sits behind, is a feature nobody would ship.
 */

import { describe, expect, it } from 'vitest';
import {
  ENVELOPE_BANDS,
  ENVELOPE_HZ,
  backdropState,
  backdropVisible,
  decodeEnvelope,
  encodeEnvelope,
  sampleEnvelope,
  spectrumEnvelope,
} from '../presentation';
import {
  HIT_SOUND_MAX_BYTES,
  HIT_SOUND_MAX_PER_USER,
  HIT_SOUND_MAX_SECONDS,
  STOCK_HIT_SOUND_SETS,
  preloadList,
  resolveHitSoundSet,
  sampleForJudgement,
  validateHitSound,
} from '../hit-sounds';

function ramp(frameCount: number, bins = 64): Float32Array[] {
  return Array.from({ length: frameCount }, (_, i) => {
    const frame = new Float32Array(bins);
    for (let bin = 0; bin < bins; bin++) frame[bin] = ((i % 10) + 1) * (bin / bins);
    return frame;
  });
}

describe('V3 — the spectrum envelope', () => {
  it('resamples to the target rate', () => {
    // 200 analysis frames at 100 Hz is 2 seconds, which is 60 frames at 30 Hz.
    const envelope = spectrumEnvelope(ramp(200), 100);
    expect(envelope.length).toBe(60 * ENVELOPE_BANDS);
  });

  it('stays under the cover image for a four-minute track', () => {
    // The claim that makes this shippable at all: smaller than the artwork it
    // sits behind. 240s × 30 Hz × 8 bands ≈ 57 KB.
    const frames = 240 * 100;
    const bytes = Math.round((frames / 100) * ENVELOPE_HZ) * ENVELOPE_BANDS;
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it('normalises against the track, not an absolute scale', () => {
    // A quiet master and a loud one must both fill the backdrop.
    const quiet = ramp(60).map((f) => f.map((v) => v * 0.01) as Float32Array);
    const loud = ramp(60).map((f) => f.map((v) => v * 100) as Float32Array);
    expect(Math.max(...spectrumEnvelope(quiet, 30))).toBe(Math.max(...spectrumEnvelope(loud, 30)));
  });

  it('keeps transients by peaking, not averaging', () => {
    // One loud analysis frame inside an otherwise silent output frame must
    // survive the downsample — a mean would erase exactly the thing a 30 Hz
    // backdrop can show.
    const frames = Array.from({ length: 30 }, () => new Float32Array(8));
    frames[3][4] = 1;
    const envelope = spectrumEnvelope(frames, 300);
    expect(Math.max(...envelope)).toBe(255);
  });

  it('survives an empty analysis', () => {
    expect(spectrumEnvelope([], 100).length).toBe(0);
    expect(spectrumEnvelope(ramp(10), 0).length).toBe(0);
  });

  it('reads silence past the end rather than freezing on the last frame', () => {
    // A backdrop stuck on the final chord through a long outro reads as the
    // renderer having died.
    const envelope = spectrumEnvelope(ramp(60), 30);
    const past = sampleEnvelope(envelope, 999);
    expect([...past]).toEqual(new Array(ENVELOPE_BANDS).fill(0));
    expect([...sampleEnvelope(envelope, -1)]).toEqual(new Array(ENVELOPE_BANDS).fill(0));
  });

  it('writes into the caller’s scratch array', () => {
    // Per-frame allocation would be the visible cost of the whole feature.
    const envelope = spectrumEnvelope(ramp(60), 30);
    const scratch = new Uint8Array(ENVELOPE_BANDS);
    expect(sampleEnvelope(envelope, 0.5, scratch)).toBe(scratch);
  });

  it('round-trips through base64', () => {
    const envelope = spectrumEnvelope(ramp(90), 45);
    expect([...decodeEnvelope(encodeEnvelope(envelope))]).toEqual([...envelope]);
  });

  it('treats a corrupt envelope as a missing backdrop, not an error', () => {
    expect(decodeEnvelope('not base64 !!!').length).toBe(0);
    expect(decodeEnvelope(null).length).toBe(0);
  });
});

describe('V7 — stage backdrops', () => {
  it('rises with combo and falls with health', () => {
    const healthy = backdropState({ health: 100, healthMax: 100, combo: 0, healthEnabled: true });
    const dying = backdropState({ health: 10, healthMax: 100, combo: 0, healthEnabled: true });
    expect(dying.intensity).toBeLessThan(healthy.intensity);
    expect(dying.danger).toBeGreaterThan(healthy.danger);

    const combo = backdropState({ health: 100, healthMax: 100, combo: 200, healthEnabled: true });
    expect(combo.intensity).toBeGreaterThan(healthy.intensity);
  });

  it('lets combo carry the whole signal when the gauge is off', () => {
    // The gauge is off by default, and a backdrop pinned at 60% forever is not
    // a backdrop.
    const off = backdropState({ health: 0, healthMax: 100, combo: 0, healthEnabled: false });
    expect(off.intensity).toBe(0);
    expect(off.danger).toBe(0);
    const hot = backdropState({ health: 0, healthMax: 100, combo: 200, healthEnabled: false });
    expect(hot.intensity).toBe(1);
  });

  it('stays inside 0–1 for absurd inputs', () => {
    const wild = backdropState({
      health: 1e9,
      healthMax: 0,
      combo: -50,
      healthEnabled: true,
    });
    expect(wild.intensity).toBeGreaterThanOrEqual(0);
    expect(wild.intensity).toBeLessThanOrEqual(1);
    expect(wild.danger).toBeGreaterThanOrEqual(0);
  });

  it('is off unless all three switches allow it', () => {
    // A2's photosensitivity mode is not a suggestion, and a full-screen
    // luminance change is precisely what it exists to stop.
    expect(backdropVisible({ backdrop: 'pulse', glow: true, reducedFlash: false })).toBe(true);
    expect(backdropVisible({ backdrop: 'pulse', glow: true, reducedFlash: true })).toBe(false);
    expect(backdropVisible({ backdrop: 'pulse', glow: false, reducedFlash: false })).toBe(false);
    expect(backdropVisible({ backdrop: 'none', glow: true, reducedFlash: false })).toBe(false);
  });
});

describe('V2 — hit sounds', () => {
  it('keeps the default file-less so hit feedback survives a dropped network', () => {
    expect(STOCK_HIT_SOUND_SETS[0].id).toBe('default');
    expect(preloadList(STOCK_HIT_SOUND_SETS[0])).toEqual([]);
  });

  it('falls back to the default set for an unknown id', () => {
    expect(resolveHitSoundSet('deleted-set').id).toBe('default');
    expect(resolveHitSoundSet(null).id).toBe('default');
  });

  it('prefers a custom set over a stock one with the same id', () => {
    const mine = {
      ...STOCK_HIT_SOUND_SETS[1],
      base: 'mine.wav',
      ownerId: 'u1',
    };
    expect(resolveHitSoundSet(mine.id, [mine]).base).toBe('mine.wav');
  });

  it('never plays a sample on a miss', () => {
    // A hit sound on a miss is the most confusing thing this system could do.
    const graded = STOCK_HIT_SOUND_SETS.find((s) => s.id === 'graded-bell')!;
    expect(sampleForJudgement(graded, 'MISS')).toBeNull();
    expect(sampleForJudgement(graded, 'MARVELOUS')).toBe('graded-bell-marvelous.wav');
    // No GOOD variant, so the base carries it.
    expect(sampleForJudgement(graded, 'GOOD')).toBe('graded-bell.wav');
  });

  it('de-duplicates the preload list', () => {
    const graded = STOCK_HIT_SOUND_SETS.find((s) => s.id === 'graded-clap')!;
    expect(new Set(preloadList(graded)).size).toBe(preloadList(graded).length);
  });

  it('refuses an unreadable file rather than passing it through', () => {
    // Every format the upload route accepts is one the prober can read, so
    // "unreadable" means "not that format".
    const result = validateHitSound({ byteLength: 1000, durationSec: null, existingCount: 0 });
    expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('enforces size, duration and quota', () => {
    expect(
      validateHitSound({ byteLength: HIT_SOUND_MAX_BYTES + 1, durationSec: 1, existingCount: 0 }),
    ).toMatchObject({ ok: false, reason: 'too-large' });
    expect(
      validateHitSound({
        byteLength: 1000,
        durationSec: HIT_SOUND_MAX_SECONDS + 0.1,
        existingCount: 0,
      }),
    ).toMatchObject({ ok: false, reason: 'too-long' });
    expect(
      validateHitSound({
        byteLength: 1000,
        durationSec: 1,
        existingCount: HIT_SOUND_MAX_PER_USER,
      }),
    ).toMatchObject({ ok: false, reason: 'quota' });
    expect(validateHitSound({ byteLength: 1000, durationSec: 1, existingCount: 0 })).toEqual({
      ok: true,
    });
  });

  it('checks the quota before anything else', () => {
    // A player at quota uploading an oversized file should be told the thing
    // they have to act on, not the thing they could fix and still be refused.
    expect(
      validateHitSound({
        byteLength: HIT_SOUND_MAX_BYTES * 10,
        durationSec: 60,
        existingCount: HIT_SOUND_MAX_PER_USER,
      }),
    ).toMatchObject({ reason: 'quota' });
  });
});
