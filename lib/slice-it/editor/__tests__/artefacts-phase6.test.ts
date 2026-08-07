/**
 * Phase 6 (§6): the analysis artefacts the editor draws — the peak envelope,
 * the onset ghosts (including the rejected candidates, which are the point),
 * and section detection.
 */

import { describe, it, expect } from 'vitest';
import {
  computeEnvelope,
  decodeEnvelope,
  envelopePeak,
  ENVELOPE_RATE,
} from '../../beatmap/envelope';
import { detectSections } from '../../beatmap/sections';
import type { Spectrogram } from '../../beatmap/spectrum';
import { buildArtefacts, suggestLane } from '../artefacts';

describe('peak envelope', () => {
  it('round-trips through base64 and keeps the transients', () => {
    const sampleRate = 22_050;
    const samples = new Float32Array(sampleRate * 2);
    // Silence with one loud click at 1.0s — the thing an author navigates by.
    samples[sampleRate] = 1;

    const envelope = computeEnvelope(samples, sampleRate);
    const bytes = decodeEnvelope(envelope);

    expect(envelope.rate).toBe(ENVELOPE_RATE);
    expect(bytes.length).toBeGreaterThan(sampleRate / (sampleRate / ENVELOPE_RATE) - 2);
    expect(envelopePeak(bytes, envelope.rate, 0.99, 1.01)).toBeGreaterThan(0.9);
    expect(envelopePeak(bytes, envelope.rate, 0.2, 0.4)).toBe(0);
  });

  it('stays small enough to persist beside the chart', () => {
    // 4 minutes at 200 samples/second: the §6 budget, checked rather than claimed.
    const sampleRate = 22_050;
    const samples = new Float32Array(sampleRate * 240);
    const envelope = computeEnvelope(samples, sampleRate);
    expect(envelope.data.length).toBeLessThan(70_000);
  });

  it('takes the peak over a range, not the nearest sample', () => {
    const bytes = new Uint8Array([0, 0, 255, 0, 0]);
    // A column covering the spike must show it even when its centre does not.
    expect(envelopePeak(bytes, 100, 0, 0.05)).toBe(1);
    expect(envelopePeak(bytes, 100, 0.03, 0.05)).toBe(0);
  });

  it('survives a corrupt or missing stored envelope', () => {
    expect(decodeEnvelope(null).length).toBe(0);
    expect(decodeEnvelope(undefined).length).toBe(0);
  });
});

describe('lane suggestion', () => {
  it('sends bass-dominant hits to lane 0 and bright hits to lane 1', () => {
    expect(suggestLane({ l: 0.8, h: 0.05 })).toBe(0);
    expect(suggestLane({ l: 0.1, h: 0.6 })).toBe(1);
    // Mid-range is deterministic, so undo/redo does not move the note.
    expect(suggestLane({ l: 0.2, h: 0.2 })).toBe(suggestLane({ l: 0.2, h: 0.2 }));
  });
});

describe('editor artefacts', () => {
  const analysis = {
    id: 's1',
    name: 'x',
    artist: 'y',
    audioUrl: '',
    bpm: 120,
    slices: { easy: [], normal: [], hard: [], expert: [] },
    beats: Array.from({ length: 40 }, (_, i) => i * 0.5),
    artefacts: {
      envelope: computeEnvelope(new Float32Array(2205), 22_050),
      onsets: [
        { t: 1.0, s: 0.9, l: 0.8, h: 0.05, k: true },
        { t: 1.37, s: 0.6, l: 0.1, h: 0.7, k: false },
      ],
      sections: [{ start: 0, end: 10, label: 'A', energy: 1 }],
    },
  };

  it('keeps the rejected candidates, which is the whole point', () => {
    const built = buildArtefacts(
      { songId: 's1', duration: 20, bpm: 120, fallbackSlices: [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis as any,
    );
    expect(built.ghosts).toHaveLength(2);
    const rejected = built.ghosts.filter((ghost) => !ghost.kept);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].time).toBeCloseTo(1.37, 5);
    expect(rejected[0].lane).toBe(1);
    expect(built.sections).toHaveLength(1);
    expect(built.envelope.bytes.length).toBeGreaterThan(0);
  });

  it('degrades to no waveform and no ghosts for a song analysed before phase 6', () => {
    const built = buildArtefacts(
      { songId: 's1', duration: 20, bpm: 120, fallbackSlices: [] },
      null,
    );
    expect(built.ghosts).toEqual([]);
    expect(built.sections).toEqual([]);
    expect(built.envelope.bytes.length).toBe(0);
  });
});

/** A spectrogram whose first half and second half are different material. */
function twoPartSpectrogram(beats: number[], bands = 12): Spectrogram {
  const frameDuration = 0.0116;
  const frames = Math.ceil(beats[beats.length - 1] / frameDuration) + 8;
  const data = new Float32Array(frames * bands);
  const half = beats[Math.floor(beats.length / 2)];
  for (let f = 0; f < frames; f++) {
    const late = f * frameDuration >= half;
    for (let b = 0; b < bands; b++) {
      // Low bands in the first half, high bands in the second.
      data[f * bands + b] = late ? (b >= bands / 2 ? 1 : 0.05) : b < bands / 2 ? 1 : 0.05;
    }
  }
  return {
    data,
    frames,
    bands,
    frameDuration,
    bandFreqs: Float64Array.from({ length: bands }, (_, i) => 30 * 2 ** (i / 2)),
    frameTime: (i: number) => i * frameDuration,
  };
}

describe('section detection', () => {
  const beats = Array.from({ length: 120 }, (_, i) => i * 0.5);

  it('finds the boundary between two different halves', () => {
    const spec = twoPartSpectrogram(beats);
    const sections = detectSections(spec, beats, 60);
    expect(sections.length).toBeGreaterThan(1);
    const boundary = sections[1].start;
    // The material changes at beat 60 = 30s.
    expect(Math.abs(boundary - 30)).toBeLessThan(2);
    // Different material, different letter.
    expect(sections[0].label).not.toBe(sections[1].label);
  });

  it('returns one section rather than nothing for structureless audio', () => {
    const bands = 12;
    const frames = 5200;
    const spec: Spectrogram = {
      data: new Float32Array(frames * bands).fill(0.5),
      frames,
      bands,
      frameDuration: 0.0116,
      bandFreqs: Float64Array.from({ length: bands }, (_, i) => 30 * 2 ** (i / 2)),
      frameTime: (i: number) => i * 0.0116,
    };
    const sections = detectSections(spec, beats, 60);
    expect(sections).toHaveLength(1);
    expect(sections[0].start).toBe(0);
    expect(sections[0].end).toBe(60);
  });

  it('does not try to analyse a track too short to have structure', () => {
    const short = [0, 0.5, 1, 1.5];
    const spec = twoPartSpectrogram(short);
    expect(detectSections(spec, short, 2)).toHaveLength(1);
  });
});
