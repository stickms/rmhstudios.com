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
import { computeEnvelope, type PeakEnvelope } from './envelope';
import { detectSections, type Section } from './sections';

export type { AudioLike } from './audio';
export type { PeakEnvelope } from './envelope';
export type { Section } from './sections';

/**
 * One detected onset, as persisted for the editor (§6).
 *
 * `kept: false` is the valuable half. Those are the candidates the 55 ms
 * quantisation filter in `charter.ts` rejected — the moments the generator
 * considered and turned down — and they are exactly what a human editor wants
 * to see, because "the generator missed the snare in bar 2" becomes one click
 * on a ghost instead of a manual placement. They cannot be recovered later at
 * any price: the spectrogram they came from is gone.
 *
 * Field names are one character because there are ~1500 of these in a 4-minute
 * track and this is JSON in a database column: `{"t":12.34,"s":0.8,...}` is
 * ~34 bytes against ~70 for the spelled-out version, which is the difference
 * between a 50 KB and a 105 KB blob for no information at all.
 */
export interface StoredOnset {
  /** Time, seconds. */
  t: number;
  /** Detection strength, 0–1. */
  s: number;
  /** Fraction of the frame's energy below 250 Hz — the charter's lane bias. */
  l: number;
  /** Fraction above 2 kHz. */
  h: number;
  /** True when this onset survived quantisation and could become a note. */
  k: boolean;
}

/**
 * What the editor needs and the analyser would otherwise discard (§6).
 *
 * Budget, for a 4-minute track: envelope ~64 KB base64, onsets ~50 KB,
 * sections well under 1 KB. That is the whole reason the spectrogram itself is
 * not here — it is ~40 MB, and `analysisData` is a JSON column on a row that is
 * read whenever anyone opens the song.
 */
export interface AnalysisArtefacts {
  envelope: PeakEnvelope;
  onsets: StoredOnset[];
  sections: Section[];
}

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
  /** Editor artefacts — §6. Optional so an older stored blob is still valid. */
  artefacts?: AnalysisArtefacts;
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

  /* Which candidates survived quantisation, by spectrogram frame.
   *
   * Frame, not time: `quantizeOnsets` SNAPS the time it returns, so comparing
   * output times to input times would match nothing exactly and everything
   * approximately. The frame index is carried through untouched, and peak
   * picking guarantees one onset per frame (its 30 ms minimum gap is larger
   * than the 11.6 ms hop), so it is a faithful identity. This has to be read
   * from the FIRST quantisation: the metronome fallback below replaces the
   * pool with synthetic notes whose frame is 0, and every real onset would
   * then read as rejected. */
  const keptFrames = new Set(quantized.map((note) => note.frame));

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
    artefacts: {
      envelope: computeEnvelope(samples, sampleRate),
      // Rounded on the way out: three decimals is a millisecond, which is finer
      // than the 11.6 ms hop these times came from, and two decimals of strength
      // is finer than the strip can draw. Full float precision here would be a
      // third again as much JSON expressing noise.
      onsets: onsets.map((onset) => ({
        t: Number(onset.time.toFixed(3)),
        s: Number(onset.strength.toFixed(2)),
        l: Number(onset.lowRatio.toFixed(2)),
        h: Number(onset.highRatio.toFixed(2)),
        k: keptFrames.has(onset.frame),
      })),
      sections: detectSections(spec, beats, duration),
    },
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
