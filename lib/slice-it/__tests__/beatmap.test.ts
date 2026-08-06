/**
 * Beatmap pipeline tests.
 *
 * Synthetic audio with a known answer, because that is the only way to test a
 * detector: a real song has no ground truth anyone can assert against, so the
 * only honest check is "does a click track at 128 BPM come out at 128 BPM, on
 * the beat".
 */

import { describe, expect, it } from 'vitest';
import { FFT, hannWindow } from '../beatmap/fft';
import { prepareAudio, resampleMono, toMono, type AudioLike } from '../beatmap/audio';
import { computeSpectrogram } from '../beatmap/spectrum';
import { detectOnsets, onsetStrengthSignal } from '../beatmap/onsets';
import { bpmFromBeats, estimateTempo, trackBeats } from '../beatmap/tempo';
import { buildCharts, quantizeOnsets } from '../beatmap/charter';
import { BEATMAP_VERSION, generateBeatmap, isStaleAnalysis, reconcileBpm } from '../beatmap';
import { DIFFICULTIES } from '../constants';

const SAMPLE_RATE = 44100;

/** An `AudioLike` over a single channel of samples. */
function buffer(samples: Float32Array, sampleRate = SAMPLE_RATE): AudioLike {
  return {
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

/**
 * A click track: a short decaying noise burst on every beat, optionally with a
 * quieter burst on the off-beats so there is something to find at the 8th-note
 * level too.
 */
function clickTrack(options: {
  bpm: number;
  seconds: number;
  sampleRate?: number;
  offbeats?: boolean;
  lowFreq?: boolean;
}): Float32Array {
  const rate = options.sampleRate ?? SAMPLE_RATE;
  const out = new Float32Array(Math.floor(rate * options.seconds));
  const interval = 60 / options.bpm;
  const burst = Math.floor(rate * 0.04);

  // Deterministic pseudo-noise, so a failure is reproducible.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };

  const place = (at: number, gain: number, low: boolean) => {
    const start = Math.floor(at * rate);
    let phase = 0;
    for (let i = 0; i < burst && start + i < out.length; i++) {
      const envelope = Math.exp(-i / (burst * 0.25)) * gain;
      if (low) {
        phase += (2 * Math.PI * 70) / rate;
        out[start + i] += Math.sin(phase) * envelope;
      } else {
        out[start + i] += rand() * 2 * envelope;
      }
    }
  };

  for (let t = 0.25; t < options.seconds; t += interval) {
    place(t, 1, options.lowFreq ?? true);
    if (options.offbeats) place(t + interval / 2, 0.45, false);
  }
  return out;
}

describe('FFT', () => {
  it('recovers a pure tone at the right bin', () => {
    const size = 1024;
    const fft = new FFT(size);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    const bin = 64;
    for (let i = 0; i < size; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / size);

    fft.transform(re, im);

    const magnitude = (k: number) => Math.hypot(re[k], im[k]);
    expect(magnitude(bin)).toBeGreaterThan(size / 4);
    expect(magnitude(bin + 8)).toBeLessThan(magnitude(bin) / 100);
  });

  it('matches a naive DFT on random input', () => {
    const size = 64;
    const fft = new FFT(size);
    const source = Array.from({ length: size }, (_, i) => Math.sin(i * 1.7) + Math.cos(i * 0.3));
    const re = Float64Array.from(source);
    const im = new Float64Array(size);
    fft.transform(re, im);

    for (const k of [0, 1, 7, 31]) {
      let dre = 0;
      let dim = 0;
      for (let n = 0; n < size; n++) {
        const angle = (-2 * Math.PI * k * n) / size;
        dre += source[n] * Math.cos(angle);
        dim += source[n] * Math.sin(angle);
      }
      expect(re[k]).toBeCloseTo(dre, 6);
      expect(im[k]).toBeCloseTo(dim, 6);
    }
  });

  it('rejects a non-power-of-two size', () => {
    expect(() => new FFT(1000)).toThrow(/power of two/);
  });

  it('produces a symmetric Hann window summing to half its length', () => {
    const w = hannWindow(256);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[255]).toBeCloseTo(0, 6);
    expect(w[128]).toBeCloseTo(1, 2);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(128, 0);
  });
});

describe('audio preparation', () => {
  it('averages channels down to mono', () => {
    const left = Float32Array.from([1, 1, 1]);
    const right = Float32Array.from([-1, 0, 1]);
    const stereo: AudioLike = {
      sampleRate: SAMPLE_RATE,
      length: 3,
      numberOfChannels: 2,
      getChannelData: (c) => (c === 0 ? left : right),
    };
    expect(Array.from(toMono(stereo))).toEqual([0, 0.5, 1]);
  });

  it('decimates to the target rate without changing duration', () => {
    const input = new Float32Array(44100);
    const out = resampleMono(input, 44100, 22050);
    expect(out.length).toBe(22050);
  });

  it('leaves audio already at or below the target rate alone', () => {
    const input = new Float32Array(100);
    expect(resampleMono(input, 16000, 22050)).toBe(input);
  });

  it('reports duration from the source rate, not the decimated one', () => {
    const prepared = prepareAudio(buffer(new Float32Array(SAMPLE_RATE * 3)));
    expect(prepared.duration).toBeCloseTo(3, 5);
    expect(prepared.sampleRate).toBe(22050);
  });
});

describe('onset detection', () => {
  it('finds one onset per click, and no more', () => {
    const bpm = 120;
    const seconds = 10;
    const audio = prepareAudio(buffer(clickTrack({ bpm, seconds })));
    const spec = computeSpectrogram(audio.samples, audio.sampleRate);
    const odf = onsetStrengthSignal(spec);
    const onsets = detectOnsets(spec, odf);

    // 10s at 120 BPM starting at 0.25s = 20 clicks.
    expect(onsets.length).toBeGreaterThanOrEqual(18);
    expect(onsets.length).toBeLessThanOrEqual(24);

    // Each detected onset should sit within ~30ms of a real click.
    const interval = 60 / bpm;
    for (const onset of onsets) {
      const nearest = Math.round((onset.time - 0.25) / interval) * interval + 0.25;
      expect(Math.abs(onset.time - nearest)).toBeLessThan(0.045);
    }
  });

  it('finds nothing in silence', () => {
    const audio = prepareAudio(buffer(new Float32Array(SAMPLE_RATE * 5)));
    const spec = computeSpectrogram(audio.samples, audio.sampleRate);
    const onsets = detectOnsets(spec, onsetStrengthSignal(spec));
    expect(onsets.length).toBe(0);
  });

  it('separates low- and high-frequency hits by band ratio', () => {
    const audio = prepareAudio(buffer(clickTrack({ bpm: 100, seconds: 8, lowFreq: true })));
    const spec = computeSpectrogram(audio.samples, audio.sampleRate);
    const onsets = detectOnsets(spec, onsetStrengthSignal(spec));
    expect(onsets.length).toBeGreaterThan(4);
    const meanLow = onsets.reduce((a, o) => a + o.lowRatio, 0) / onsets.length;
    const meanHigh = onsets.reduce((a, o) => a + o.highRatio, 0) / onsets.length;
    expect(meanLow).toBeGreaterThan(meanHigh);
  });
});

describe('tempo and beat tracking', () => {
  it.each([90, 120, 128, 174])('recovers %i BPM from a click track', (bpm) => {
    const audio = prepareAudio(buffer(clickTrack({ bpm, seconds: 20, offbeats: true })));
    const spec = computeSpectrogram(audio.samples, audio.sampleRate);
    const odf = onsetStrengthSignal(spec);
    const tempo = estimateTempo(odf, spec.frameDuration);
    const beats = trackBeats(odf, spec.frameDuration, tempo.periodFrames);
    const tracked = bpmFromBeats(beats, tempo.bpm);

    // Within 2% — the frame hop is ~11.6ms, so exactness is not on offer.
    expect(Math.abs(tracked - bpm) / bpm).toBeLessThan(0.02);
  });

  it('lands beats on the clicks, not between them', () => {
    const bpm = 120;
    const audio = prepareAudio(buffer(clickTrack({ bpm, seconds: 20 })));
    const spec = computeSpectrogram(audio.samples, audio.sampleRate);
    const odf = onsetStrengthSignal(spec);
    const tempo = estimateTempo(odf, spec.frameDuration);
    const beats = trackBeats(odf, spec.frameDuration, tempo.periodFrames);

    const interval = 60 / bpm;
    // Ignore the first and last beat: the tracker's path is least constrained
    // at the ends, where there is audio on only one side.
    const middle = beats.slice(2, -2);
    expect(middle.length).toBeGreaterThan(20);
    const offsets = middle.map((t) => {
      const phase = (((t - 0.25) % interval) + interval) % interval;
      return Math.min(phase, interval - phase);
    });
    const meanOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    expect(meanOffset).toBeLessThan(0.05);
  });

  it('falls back to 120 BPM on input too short to have a tempo', () => {
    const tempo = estimateTempo(new Float32Array(4), 0.0116);
    expect(tempo.bpm).toBe(120);
    expect(tempo.confidence).toBe(0);
  });
});

describe('quantisation', () => {
  const beats = Array.from({ length: 40 }, (_, i) => i * 0.5); // 120 BPM

  const onsetAt = (time: number, strength = 1) => ({
    time,
    strength,
    frame: 0,
    lowRatio: 0.5,
    highRatio: 0.2,
    sustain: 0,
  });

  it('snaps a near-beat onset onto the beat', () => {
    const [note] = quantizeOnsets([onsetAt(1.012)], beats);
    expect(note.time).toBeCloseTo(1, 6);
    expect(note.fraction).toBe(0);
  });

  it('snaps to eighths, sixteenths and triplets', () => {
    const notes = quantizeOnsets([onsetAt(1.25), onsetAt(2.125), onsetAt(3 + 0.5 / 3)], beats);
    expect(notes.map((n) => Number(n.fraction.toFixed(3)))).toEqual([0.5, 0.25, 0.333]);
  });

  it('drops an onset that lands nowhere near the grid', () => {
    // Exactly between the dotted-eighth (0.75) and the next beat (1.0) — the
    // widest gap in the subdivision set, so the furthest an onset can be from
    // any grid position. 0.125 of a 0.5s beat is 62.5ms, past the 55ms ceiling.
    expect(quantizeOnsets([onsetAt(1.5 + 0.875 * 0.5)], beats)).toHaveLength(0);
  });

  it('keeps an onset that is off-grid but within the snap tolerance', () => {
    // 25ms from the sixteenth at 1.625 — audible slop, still charted.
    const [note] = quantizeOnsets([onsetAt(1.6)], beats);
    expect(note.time).toBeCloseTo(1.625, 6);
  });

  it('merges two onsets that snap to the same position', () => {
    const notes = quantizeOnsets([onsetAt(1.99, 0.4), onsetAt(2.01, 0.9)], beats);
    expect(notes).toHaveLength(1);
    expect(notes[0].strength).toBe(0.9);
  });

  it('returns nothing without a grid', () => {
    expect(quantizeOnsets([onsetAt(1)], [])).toEqual([]);
  });
});

describe('charting', () => {
  function chartOf(seconds = 60) {
    const beats = Array.from({ length: Math.ceil(seconds * 2) }, (_, i) => i * 0.5);
    const onsets = [];
    // A note on every eighth, alternating strong and weak.
    for (let i = 0; i < beats.length * 2; i++) {
      onsets.push({
        time: i * 0.25,
        strength: i % 2 === 0 ? 0.9 : 0.45,
        frame: 0,
        lowRatio: i % 4 === 0 ? 0.8 : 0.1,
        highRatio: i % 4 === 0 ? 0.05 : 0.6,
        sustain: 0,
      });
    }
    return buildCharts(quantizeOnsets(onsets, beats), seconds, 'song-1');
  }

  it('produces all four difficulties', () => {
    const { slices } = chartOf();
    for (const difficulty of DIFFICULTIES) {
      expect(Array.isArray(slices[difficulty])).toBe(true);
    }
  });

  it('gets denser as difficulty rises', () => {
    const { noteCounts } = chartOf();
    expect(noteCounts.easy).toBeLessThan(noteCounts.normal);
    expect(noteCounts.normal).toBeLessThan(noteCounts.hard);
    expect(noteCounts.hard).toBeLessThanOrEqual(noteCounts.expert);
  });

  it('nests difficulties — every easier note exists in the harder chart', () => {
    const { slices } = chartOf();
    const timesIn = (d: keyof typeof slices) => new Set(slices[d].map((s) => s.time));
    const expert = timesIn('expert');
    const hard = timesIn('hard');
    const normal = timesIn('normal');

    for (const time of timesIn('normal')) expect(hard.has(time)).toBe(true);
    for (const time of hard) expect(expert.has(time)).toBe(true);
    for (const time of timesIn('easy')) expect(normal.has(time)).toBe(true);
  });

  it('never places two notes closer than the tier gap', () => {
    const { slices } = chartOf();
    for (const difficulty of DIFFICULTIES) {
      const times = slices[difficulty].map((s) => s.time).sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThan(0.07);
      }
    }
  });

  it('never places two notes in the same lane too close together', () => {
    const { slices } = chartOf();
    const lastInLane: Record<number, number> = { 0: -Infinity, 1: -Infinity };
    for (const slice of slices.expert) {
      expect(slice.time - lastInLane[slice.lane]).toBeGreaterThanOrEqual(0.12);
      lastInLane[slice.lane] = slice.time;
    }
  });

  it('never runs more than three notes in one lane', () => {
    const { slices } = chartOf();
    let run = 0;
    let lane = -1;
    for (const slice of slices.expert) {
      if (slice.lane === lane) run++;
      else {
        lane = slice.lane;
        run = 1;
      }
      expect(run).toBeLessThanOrEqual(3);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(JSON.stringify(chartOf())).toBe(JSON.stringify(chartOf()));
  });
});

describe('generateBeatmap', () => {
  it('charts a click track end to end', () => {
    const audio = buffer(clickTrack({ bpm: 128, seconds: 30, offbeats: true }));
    const map = generateBeatmap(audio, { id: 'song-1', name: 'Test', artist: 'Nobody' });

    expect(Math.abs(map.bpm - 128) / 128).toBeLessThan(0.03);
    expect(map.analysisVersion).toBe(BEATMAP_VERSION);
    expect(map.noteCounts.expert).toBeGreaterThan(20);
    expect(map.slices.expert.every((s) => s.time >= 0)).toBe(true);
    // Notes must land inside the song, not past its end.
    expect(Math.max(...map.slices.expert.map((s) => s.time))).toBeLessThanOrEqual(30);
  });

  it('still returns a playable chart for silence', () => {
    const map = generateBeatmap(buffer(new Float32Array(SAMPLE_RATE * 20)), {
      id: 'quiet',
      name: 'Silence',
      artist: 'Nobody',
    });
    expect(map.slices.normal.length).toBeGreaterThan(0);
    expect(map.bpm).toBeGreaterThan(0);
  });

  it('does not fall over on a clip shorter than one analysis frame', () => {
    const map = generateBeatmap(buffer(new Float32Array(256)), {
      id: 'tiny',
      name: 'Tiny',
      artist: 'Nobody',
    });
    expect(map.slices.easy).toBeDefined();
  });

  it('produces the same chart twice for the same input', () => {
    const audio = buffer(clickTrack({ bpm: 140, seconds: 15 }));
    const options = { id: 'song-2', name: 'Test', artist: 'Nobody' };
    expect(JSON.stringify(generateBeatmap(audio, options))).toBe(
      JSON.stringify(generateBeatmap(audio, options)),
    );
  });
});

describe('reconcileBpm', () => {
  it('keeps the hint when it agrees with detection', () => {
    expect(reconcileBpm(173.61, 174)).toBe(174);
  });

  it('accepts a hint that is an octave off and corrects it', () => {
    expect(reconcileBpm(174, 87)).toBeCloseTo(174, 5);
  });

  it('ignores a hint that disagrees with the audio', () => {
    expect(reconcileBpm(128, 95)).toBe(128);
  });

  it('falls back to the hint when detection produced nothing', () => {
    expect(reconcileBpm(0, 140)).toBe(140);
  });

  it('ignores a nonsense hint', () => {
    expect(reconcileBpm(128, 0)).toBe(128);
    expect(reconcileBpm(128, Number.NaN)).toBe(128);
  });
});

describe('isStaleAnalysis', () => {
  it('flags legacy analysis with no version field', () => {
    expect(isStaleAnalysis({ slices: {} })).toBe(true);
  });

  it('flags a null or non-object blob', () => {
    expect(isStaleAnalysis(null)).toBe(true);
    expect(isStaleAnalysis('nope')).toBe(true);
  });

  it('accepts analysis from the current generator', () => {
    expect(isStaleAnalysis({ analysisVersion: BEATMAP_VERSION })).toBe(false);
  });
});
