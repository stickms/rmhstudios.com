/**
 * Slice It — beatmap generation.
 *
 * The whole pipeline, in one call:
 *
 * ```
 * decode → mono + decimate → STFT → log-band spectrogram
 *        → SuperFlux onset function → adaptive peak picking
 *        → comb-filter tempo → DP beat tracking
 *        → grid quantisation → density-budgeted charting (×4 difficulties)
 * ```
 *
 * ## Why this replaces `lib/audio/BeatDetector`
 *
 * The previous generator worked entirely in the time domain: three biquad
 * filters, a 50 ms RMS window, and "is this louder than the last 50 windows".
 * That detects *loud*, which is not the same as *new* — a sustained bass note
 * kept the low band above its running average for its whole length, so it
 * charted as a run of notes, while a hi-hat over a loud chorus charted as
 * nothing. Tempo came from picking amplitude peaks in a low-passed signal and
 * histogramming the gaps between them, which reports the most common interval
 * between loud moments; on anything without a four-on-the-floor kick it
 * reported noise. Everything was then snapped to a fixed eighth-note grid whose
 * phase was a circular mean over *all* peaks, so a track with a pickup bar was
 * charted permanently off-beat.
 *
 * The failure mode that matters is not that it was inaccurate — it is that it
 * was inaccurate *plausibly*. Notes appeared, roughly in time, and the chart
 * felt like it had nothing to do with the song. This pipeline is built out of
 * the pieces the literature settled on for exactly these three questions:
 * SuperFlux for onsets (Böck & Widmer 2013), comb-filtered autocorrelation with
 * a tempo prior for tempo, and Ellis's dynamic-programming tracker for beats.
 *
 * ## Where it runs
 *
 * Server-side, at upload, in the API route — once per song, ever. It is written
 * dependency-free and browser-safe so a tab can still generate a chart for a
 * legacy song that predates stored analysis, but that is the fallback, not the
 * path.
 */

import type { BeatMap, Difficulty, Slice } from '../types';
import { prepareAudio, type AudioLike } from './audio';
import { computeSpectrogram } from './spectrum';
import { detectOnsets, onsetStrengthSignal } from './onsets';
import { bpmFromBeats, estimateTempo, syntheticBeats, trackBeats } from './tempo';
import { buildCharts, quantizeOnsets } from './charter';

export type { AudioLike } from './audio';

/**
 * Bumped whenever the pipeline changes in a way that produces different charts.
 *
 * Stored on the analysis blob so a song charted by an older generator can be
 * identified and re-analysed, rather than silently serving a chart nobody can
 * reproduce. Version 1 is the legacy `BeatDetector` output, which carries no
 * version field at all — hence `analysisVersion ?? 1`.
 */
export const BEATMAP_VERSION = 2;

export interface GeneratedBeatmap extends BeatMap {
  analysisVersion: number;
  /** Beat times in seconds — kept so the client can render a beat ruler. */
  beats?: number[];
  noteCounts: Record<Difficulty, number>;
  /** 0–1 from the tempo estimator; low means the grid is a guess. */
  tempoConfidence: number;
  slices: Record<Difficulty, Slice[]>;
}

export interface GenerateOptions {
  id: string;
  name: string;
  artist: string;
  audioUrl?: string;
  /**
   * A BPM the uploader typed in. Used as a *prior*, not as gospel: people type
   * the BPM from a store page and stores are often wrong by an octave, so a
   * value within 4% of the detected tempo (or of its half/double) is adopted
   * for its precision, and anything else is ignored in favour of what the audio
   * actually does.
   */
  bpmHint?: number;
}

/** How close a hint must be to the detection to be trusted, fractionally. */
const HINT_TOLERANCE = 0.04;

/**
 * Reconcile a user-supplied BPM with the detected one.
 *
 * Exported for testing — the octave-matching rule is the part most likely to
 * surprise someone reading a chart that came out at half the BPM they typed.
 */
export function reconcileBpm(detected: number, hint: number | undefined): number {
  if (!hint || !Number.isFinite(hint) || hint <= 0) return detected;
  if (!Number.isFinite(detected) || detected <= 0) return hint;

  for (const factor of [1, 2, 0.5, 4, 0.25]) {
    const candidate = hint * factor;
    if (Math.abs(candidate - detected) / detected <= HINT_TOLERANCE) {
      // The hint agrees with the audio at this octave — take it, for its
      // precision (people type 174; detection says 173.61).
      return candidate;
    }
  }
  return detected;
}

/**
 * Analyse a decoded track and produce a four-difficulty chart.
 *
 * Never throws for musical reasons: silence, a two-second clip, or audio with
 * no discernible pulse all fall back to a metronome grid rather than failing
 * the upload. It only rejects input it cannot read at all.
 */
export function generateBeatmap(audio: AudioLike, options: GenerateOptions): GeneratedBeatmap {
  const { samples, sampleRate, duration } = prepareAudio(audio);

  const spec = computeSpectrogram(samples, sampleRate);
  const odf = onsetStrengthSignal(spec);
  const tempo = estimateTempo(odf, spec.frameDuration);

  let beats = trackBeats(odf, spec.frameDuration, tempo.periodFrames);
  let bpm = bpmFromBeats(beats, tempo.bpm);
  bpm = reconcileBpm(bpm, options.bpmHint);

  // A track with no usable pulse still gets a chart: an even grid at the
  // best-guess tempo is a worse chart than a tracked one and an infinitely
  // better one than none.
  if (beats.length < 4) {
    beats = syntheticBeats(duration, bpm);
  }

  const onsets = detectOnsets(spec, odf, { maxSustainSeconds: (60 / bpm) * 4 });
  let quantized = quantizeOnsets(onsets, beats);

  // Nothing survived quantisation — a spoken-word track, or pure ambience.
  // Chart the grid itself so the song is playable at all.
  if (quantized.length < 8) {
    quantized = quantizeOnsets(
      beats.slice(0, Math.max(0, beats.length - 1)).map((time, index) => ({
        time,
        strength: index % 4 === 0 ? 1 : 0.6,
        frame: 0,
        lowRatio: index % 2 === 0 ? 1 : 0,
        highRatio: index % 2 === 0 ? 0 : 1,
        sustain: 0,
      })),
      beats,
    );
  }

  const { slices, noteCounts } = buildCharts(quantized, duration, options.id);

  return {
    id: options.id,
    name: options.name,
    artist: options.artist,
    audioUrl: options.audioUrl ?? '',
    bpm: Math.round(bpm * 100) / 100,
    slices,
    beats: beats.map((t) => Number(t.toFixed(3))),
    noteCounts,
    tempoConfidence: Number(tempo.confidence.toFixed(3)),
    analysisVersion: BEATMAP_VERSION,
  };
}

/**
 * Detect only the tempo — for the library card and for the upload form, where
 * a full chart is not needed and would cost several seconds.
 */
export function detectBpm(audio: AudioLike): { bpm: number; confidence: number } {
  const { samples, sampleRate } = prepareAudio(audio);
  const spec = computeSpectrogram(samples, sampleRate);
  const odf = onsetStrengthSignal(spec);
  const tempo = estimateTempo(odf, spec.frameDuration);
  const beats = trackBeats(odf, spec.frameDuration, tempo.periodFrames);
  return {
    bpm: Math.round(bpmFromBeats(beats, tempo.bpm) * 100) / 100,
    confidence: tempo.confidence,
  };
}

/** True when a stored analysis blob predates the current generator. */
export function isStaleAnalysis(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== 'object') return true;
  const version = (analysis as { analysisVersion?: unknown }).analysisVersion;
  return typeof version !== 'number' || version < BEATMAP_VERSION;
}
