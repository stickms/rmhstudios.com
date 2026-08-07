/**
 * Slice It — the facts every AI feature reasons from.
 *
 * **This file contains no model call and no network access, and that is the
 * design.** DeepSeek is a text model: it cannot hear a track, and the beatmap it
 * would need to "listen" to is already produced by the DSP pipeline in
 * `beatmap/`. So the useful question is not "what can the model perceive" but
 * "what can we *compute* that is worth describing to it" — and the answer is a
 * lot: a chart is a sorted list of timestamped notes, and a run is that list
 * with judgements attached.
 *
 * Everything derived here is arithmetic over those two lists. That has three
 * consequences, all deliberate:
 *
 *  1. **It is testable without a provider.** A hallucinated claim about a chart
 *     is impossible when every number in the prompt was computed here, and the
 *     computation has a unit test. The model's job is to phrase and prioritise,
 *     never to measure.
 *  2. **It works with AI switched off.** `chartFacts()` alone is a difficulty
 *     readout the UI can render with no key configured — which is what the
 *     degraded path shows instead of an empty panel.
 *  3. **It is browser-safe.** No `.server` suffix, no Prisma, no `node:*`. The
 *     client computes chart facts locally to render a preview; the server
 *     computes the same facts from the same function before prompting, so the
 *     two can never disagree about what the chart contains.
 *
 * Section granularity is fixed rather than proportional ({@link SECTION_SECONDS})
 * because the output is timestamps a player scrubs to. "Practise 1:40–1:50" is
 * actionable; "practise the third twelfth of the song" is not.
 */

import type { Slice, SliceType, Modifiers, RunStats } from '../types';
import type { TimingSummary } from '../integrity';
import { HIT_WINDOWS, type Difficulty } from '../constants';

/* -------------------------------------------------------------------------- */
/* Tunables                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Width of one analysed section, seconds.
 *
 * Ten seconds is roughly the span a player can hold in their head as "that
 * bit" — long enough to contain a phrase, short enough that looping it is a
 * drill rather than a replay of the song.
 */
export const SECTION_SECONDS = 10;

/**
 * Largest gap between two notes that still counts as one continuous pattern,
 * seconds.
 *
 * 0.25s is a 16th note at 240 BPM / an 8th at 120 — past it the hands reset and
 * what follows is a new pattern rather than a continuation of the old one.
 */
export const PATTERN_GAP_SEC = 0.25;

/** Sections named in a prompt. A whole song's worth would swamp the output. */
export const MAX_REPORTED_SECTIONS = 6;

/* -------------------------------------------------------------------------- */
/* Chart facts                                                                */
/* -------------------------------------------------------------------------- */

/** One fixed-width slice of the chart. */
export interface ChartSection {
  /** 0-based; section `i` covers `[i*SECTION_SECONDS, (i+1)*SECTION_SECONDS)`. */
  index: number;
  startSec: number;
  endSec: number;
  notes: number;
  /** Notes per second inside this section. */
  nps: number;
  /** 0–1: share of notes that repeat the previous note's lane inside a burst. */
  jackRatio: number;
  /** Longest unbroken alternating-lane run that starts in this section. */
  longestStream: number;
}

export interface ChartFacts {
  noteCount: number;
  durationSec: number;
  /** Notes per second across the whole track. */
  averageNps: number;
  /** Highest section NPS. */
  peakNps: number;
  /** Where {@link peakNps} occurs, seconds. */
  peakAtSec: number;
  /** Shortest gap between consecutive notes, ms. The chart's fastest demand. */
  minGapMs: number;
  /** How many notes of each type the chart contains. */
  types: Record<SliceType, number>;
  /** 0–1, share of notes on lane 0. 0.5 is an even chart. */
  laneBalance: number;
  /** 0–1 across the whole chart. High means repeated same-lane hits. */
  jackRatio: number;
  /** Longest alternating-lane run anywhere in the chart. */
  longestStream: number;
  sections: ChartSection[];
}

const EMPTY_TYPES: Record<SliceType, number> = {
  STANDARD: 0,
  MOVING: 0,
  LONG: 0,
  SILENT: 0,
  SPEED: 0,
  BOMB: 0,
  SWITCH: 0,
};

/**
 * Derive everything measurable about a chart.
 *
 * `slices` need not be sorted — it is sorted internally, because a caller that
 * passes the raw stored array (which is only sorted by convention) would
 * otherwise get nonsense gaps and streams rather than an error.
 */
export function chartFacts(slices: readonly Slice[], durationSec: number): ChartFacts {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  // Bombs are not notes the player hits, and silent notes carry no judgement.
  // Counting either would inflate every density number in the report.
  const notes = slices
    .filter((s) => s.type !== 'BOMB' && s.type !== 'SILENT')
    .slice()
    .sort((a, b) => a.time - b.time);

  const types = { ...EMPTY_TYPES };
  for (const slice of slices) {
    if (slice.type in types) types[slice.type] += 1;
  }

  if (notes.length === 0) {
    return {
      noteCount: 0,
      durationSec: duration,
      averageNps: 0,
      peakNps: 0,
      peakAtSec: 0,
      minGapMs: 0,
      types,
      laneBalance: 0.5,
      jackRatio: 0,
      longestStream: 0,
      sections: [],
    };
  }

  /* Gaps, jacks and streams — one pass over consecutive pairs. */
  let minGapSec = Infinity;
  let jackCount = 0;
  let burstPairs = 0;
  let longestStream = 0;
  let currentStream = 1;

  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i]!.time - notes[i - 1]!.time;
    if (gap < minGapSec) minGapSec = gap;

    if (gap <= PATTERN_GAP_SEC) {
      burstPairs += 1;
      if (notes[i]!.lane === notes[i - 1]!.lane) {
        jackCount += 1;
        // A jack breaks an alternating stream: the hands stop trading.
        currentStream = 1;
      } else {
        currentStream += 1;
        if (currentStream > longestStream) longestStream = currentStream;
      }
    } else {
      currentStream = 1;
    }
  }
  if (longestStream < 1) longestStream = notes.length > 0 ? 1 : 0;

  const laneZero = notes.filter((n) => n.lane === 0).length;

  /* Sections. */
  const lastNoteTime = notes[notes.length - 1]!.time;
  // Prefer the real track duration, but never report fewer sections than the
  // chart occupies — a song row with a wrong `duration` must not silently drop
  // the end of its own chart out of the analysis.
  const span = Math.max(duration, lastNoteTime);
  const sectionCount = Math.max(1, Math.ceil(span / SECTION_SECONDS));
  const buckets: Slice[][] = Array.from({ length: sectionCount }, () => []);
  for (const note of notes) {
    const index = Math.min(sectionCount - 1, Math.floor(note.time / SECTION_SECONDS));
    buckets[index]!.push(note);
  }

  const sections: ChartSection[] = buckets.map((bucket, index) => {
    let sectionJacks = 0;
    let sectionBursts = 0;
    let sectionStream = bucket.length > 0 ? 1 : 0;
    let bestStream = sectionStream;
    for (let i = 1; i < bucket.length; i++) {
      const gap = bucket[i]!.time - bucket[i - 1]!.time;
      if (gap > PATTERN_GAP_SEC) {
        sectionStream = 1;
        continue;
      }
      sectionBursts += 1;
      if (bucket[i]!.lane === bucket[i - 1]!.lane) {
        sectionJacks += 1;
        sectionStream = 1;
      } else {
        sectionStream += 1;
        if (sectionStream > bestStream) bestStream = sectionStream;
      }
    }
    const startSec = index * SECTION_SECONDS;
    // The final section is short whenever the song does not divide evenly, and
    // dividing its notes by a full 10s would understate its density.
    const endSec = Math.min(span, startSec + SECTION_SECONDS);
    const width = Math.max(0.001, endSec - startSec);
    return {
      index,
      startSec,
      endSec,
      notes: bucket.length,
      nps: round2(bucket.length / width),
      jackRatio: sectionBursts > 0 ? round2(sectionJacks / sectionBursts) : 0,
      longestStream: bestStream,
    };
  });

  const peak = sections.reduce((best, s) => (s.nps > best.nps ? s : best), sections[0]!);

  return {
    noteCount: notes.length,
    durationSec: duration,
    averageNps: round2(notes.length / Math.max(1, span)),
    peakNps: peak.nps,
    peakAtSec: peak.startSec,
    minGapMs: Number.isFinite(minGapSec) ? Math.round(minGapSec * 1000) : 0,
    types,
    laneBalance: round2(laneZero / notes.length),
    jackRatio: burstPairs > 0 ? round2(jackCount / burstPairs) : 0,
    longestStream,
    sections,
  };
}

/* -------------------------------------------------------------------------- */
/* Run facts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How one section of the chart went.
 *
 * Produced by the engine as a tally, never as per-note samples — the same
 * reasoning `integrity.ts` gives for its timing summary. A histogram is enough
 * to say "you lost the run at 1:40"; per-note offsets would be a payload
 * proportional to the chart on every submission.
 */
export interface SectionResult {
  index: number;
  /** Notes resolved as anything other than MISS. */
  hit: number;
  missed: number;
  /** 0–1 within the section, by the same weights as the run's accuracy. */
  accuracy: number;
}

/** Everything the AI features are allowed to know about a finished run. */
export interface SliceRunFacts {
  songTitle: string;
  songArtist: string;
  durationSec: number;
  difficulty: Difficulty;
  /** Playback rate the run was played at. */
  speed: number;
  /** Names of the optional modifiers that were switched on. */
  activeModifiers: string[];
  score: number;
  maxCombo: number;
  /** 0–1. */
  accuracy: number;
  grade: string;
  notesResolved: number;
  judgements: RunStats['judgements'] | null;
  timing: TimingSummary | null;
  /** Per-section outcome, when the engine reported one. */
  sections: SectionResult[] | null;
  /** The chart that was played. */
  chart: ChartFacts | null;
  /** This player's previous best on this song+difficulty, if any. */
  personalBest: number | null;
  /** Leaderboard position this run took, if it made the board. */
  rank: number | null;
}

/** The optional modifiers that were switched on, as prompt-friendly names. */
export function activeModifierNames(modifiers: Modifiers): string[] {
  const names: string[] = [];
  if (modifiers.invisible) names.push('Invisible');
  if (modifiers.suddenDeath) names.push('Sudden Death');
  if (modifiers.bombs) names.push('Bombs');
  if (modifiers.switching) names.push('Switching');
  if (modifiers.spin) names.push('Spin');
  if (modifiers.strictTiming) names.push('Strict Timing');
  if (modifiers.oneTrack) names.push('One Track');
  return names;
}

/* -------------------------------------------------------------------------- */
/* Interpretation helpers (pure, and useful with AI switched off)             */
/* -------------------------------------------------------------------------- */

/**
 * The sections a player did worst in, hardest first.
 *
 * Ranked by *notes lost*, not by accuracy: a section where they dropped 30 of
 * 60 notes is a bigger problem than one where they dropped 2 of 3, and ranking
 * by accuracy alone puts the 3-note section first every time.
 */
export function weakestSections(
  sections: readonly SectionResult[],
  limit = MAX_REPORTED_SECTIONS,
): SectionResult[] {
  return sections
    .filter((s) => s.missed > 0)
    .slice()
    .sort((a, b) => b.missed - a.missed || a.accuracy - b.accuracy)
    .slice(0, limit);
}

/** The densest sections of a chart, hardest first. */
export function densestSections(facts: ChartFacts, limit = MAX_REPORTED_SECTIONS): ChartSection[] {
  return facts.sections
    .filter((s) => s.notes > 0)
    .slice()
    .sort((a, b) => b.nps - a.nps)
    .slice(0, limit);
}

/**
 * What a run's mean timing error says about the player's audio offset.
 *
 * The distinction this draws is the whole reason the calibration advisor
 * exists. A *consistent* mean error is a calibration problem — the player is
 * accurate relative to what they hear, and the sound is arriving at the wrong
 * time. A *wide* spread is a skill problem, and no offset change fixes it.
 * Telling one to adjust their offset when the real issue is the other is how a
 * player ends up chasing a setting for a week.
 *
 * Returns `null` when the sample is too small to say anything, which is the
 * honest answer far more often than a recommendation is.
 */
export function offsetAdvice(timing: TimingSummary | null | undefined): {
  /** Milliseconds to ADD to the current audio offset. */
  suggestedDeltaMs: number;
  /** True when the bias is large relative to the spread — i.e. real. */
  confident: boolean;
  spreadMs: number;
} | null {
  if (!timing || timing.samples < 30) return null;
  if (!Number.isFinite(timing.meanMs) || !Number.isFinite(timing.stdDevMs)) return null;

  // The standard error of the mean. A bias only means something when it is
  // large compared to the uncertainty in measuring it — with a wide spread and
  // few samples, a 10ms mean is noise.
  const standardError = timing.stdDevMs / Math.sqrt(timing.samples);
  const confident = Math.abs(timing.meanMs) > 2 * standardError && Math.abs(timing.meanMs) >= 8;

  return {
    // A player hitting consistently LATE (positive mean) is hearing the audio
    // early relative to the visuals, so the offset moves the other way.
    suggestedDeltaMs: -Math.round(timing.meanMs),
    confident,
    spreadMs: Math.round(timing.stdDevMs),
  };
}

/**
 * Combine several runs' timing summaries into one.
 *
 * Calibration advice from a single run is advice from one song on one night. A
 * player who happened to fight a chart they did not know gets a wide spread and
 * a meaningless mean; three runs pooled gives the offset question a sample
 * worth answering.
 *
 * This is a real pooled variance, not an average of standard deviations —
 * averaging them understates the spread whenever the runs have different means,
 * which is exactly the case here (a drifting offset is the thing being looked
 * for). The between-run term is what carries that drift into the result.
 */
export function poolTiming(summaries: readonly TimingSummary[]): TimingSummary | null {
  const usable = summaries.filter(
    (s) => s && s.samples > 0 && Number.isFinite(s.meanMs) && Number.isFinite(s.stdDevMs),
  );
  if (usable.length === 0) return null;

  const samples = usable.reduce((total, s) => total + s.samples, 0);
  if (samples === 0) return null;

  const mean = usable.reduce((total, s) => total + s.meanMs * s.samples, 0) / samples;
  // E[X²] over the pool, from each run's own second moment (σ² + μ²).
  const secondMoment =
    usable.reduce((total, s) => total + s.samples * (s.stdDevMs ** 2 + s.meanMs ** 2), 0) / samples;

  return {
    samples,
    meanMs: mean,
    stdDevMs: Math.sqrt(Math.max(0, secondMoment - mean ** 2)),
  };
}

/**
 * Whether a run's timing spread is tight enough that Strict Timing is playable.
 *
 * Strict Timing shrinks every window to 70%. A player whose spread already
 * exceeds the shrunken GREAT window will simply miss more, which is not a
 * challenge, it is a wall.
 */
export function canHoldStrictTiming(timing: TimingSummary | null | undefined): boolean {
  if (!timing || timing.samples < 30 || !Number.isFinite(timing.stdDevMs)) return false;
  // Two standard deviations covers ~95% of hits; keep that inside the shrunken
  // GREAT window rather than the generous BAD one.
  return timing.stdDevMs * 2 <= HIT_WINDOWS.GREAT * 0.7 * 1000;
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

/** `93.5` → `1:33`. Timestamps in advice are things a player scrubs to. */
export function mmss(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Render chart facts as labelled lines.
 *
 * Lines rather than JSON, for the reason `lib/ai/coach.server.ts` gives: a JSON
 * blob invites the model to echo the structure back, while lines with explicit
 * units read as observations. Units are always spelled out — an unlabelled
 * `0.34` has been read back as a percentage, a ratio and a duration.
 */
export function chartFactsToText(facts: ChartFacts): string {
  const lines = [
    `notes: ${facts.noteCount}`,
    `length: ${mmss(facts.durationSec)}`,
    `average density: ${facts.averageNps} notes/sec`,
    `peak density: ${facts.peakNps} notes/sec at ${mmss(facts.peakAtSec)}`,
    `fastest gap between notes: ${facts.minGapMs} ms`,
    `longest alternating run: ${facts.longestStream} notes`,
    `same-lane repeats inside bursts: ${Math.round(facts.jackRatio * 100)}%`,
    `lane split: ${Math.round(facts.laneBalance * 100)}% top / ${
      100 - Math.round(facts.laneBalance * 100)
    }% bottom`,
  ];

  const specials = (['LONG', 'MOVING', 'SPEED', 'SWITCH', 'BOMB'] as const).filter(
    (type) => facts.types[type] > 0,
  );
  if (specials.length > 0) {
    lines.push(`special notes: ${specials.map((t) => `${facts.types[t]} ${t}`).join(', ')}`);
  }

  const dense = densestSections(facts);
  if (dense.length > 0) {
    lines.push('densest sections:');
    for (const section of dense) {
      lines.push(
        `  ${mmss(section.startSec)}-${mmss(section.endSec)}: ${section.notes} notes, ` +
          `${section.nps} notes/sec, longest alternating run ${section.longestStream}` +
          (section.jackRatio > 0.3
            ? `, ${Math.round(section.jackRatio * 100)}% same-lane repeats`
            : ''),
      );
    }
  }

  return lines.join('\n');
}

/** Render a finished run as labelled lines. See {@link chartFactsToText}. */
export function runFactsToText(facts: SliceRunFacts): string {
  const lines = [
    `song: ${facts.songTitle} by ${facts.songArtist}`,
    `length: ${mmss(facts.durationSec)}`,
    `difficulty: ${facts.difficulty}`,
    `speed: ${facts.speed}x`,
    `modifiers: ${facts.activeModifiers.join(', ') || 'none'}`,
    `score: ${facts.score}`,
    `accuracy: ${(facts.accuracy * 100).toFixed(2)}% (grade ${facts.grade})`,
    `max combo: ${facts.maxCombo}`,
    `notes resolved: ${facts.notesResolved}`,
  ];

  if (facts.personalBest !== null) {
    const delta = facts.score - facts.personalBest;
    lines.push(
      `previous best on this chart: ${facts.personalBest} ` +
        `(this run is ${delta >= 0 ? '+' : ''}${delta})`,
    );
  }
  if (facts.rank !== null) lines.push(`leaderboard position for this run: #${facts.rank}`);

  if (facts.judgements) {
    const j = facts.judgements;
    lines.push(
      `judgements: ${j.MARVELOUS} marvelous, ${j.PERFECT} perfect, ${j.GREAT} great, ` +
        `${j.GOOD} good, ${j.BAD} bad, ${j.MISS} miss`,
    );
  }

  if (facts.timing) {
    const direction = facts.timing.meanMs > 0 ? 'late' : 'early';
    lines.push(
      `hit timing: average ${Math.abs(Math.round(facts.timing.meanMs))} ms ${direction}, ` +
        `spread ${Math.round(facts.timing.stdDevMs)} ms, from ${facts.timing.samples} hits`,
    );
    const advice = offsetAdvice(facts.timing);
    if (advice?.confident) {
      lines.push(
        `note: that average lateness is consistent enough to be an audio-offset ` +
          `problem rather than a timing problem`,
      );
    }
  }

  if (facts.sections && facts.sections.length > 0) {
    const weak = weakestSections(facts.sections);
    if (weak.length > 0) {
      lines.push('sections where notes were dropped:');
      for (const section of weak) {
        const start = section.index * SECTION_SECONDS;
        const chartSection = facts.chart?.sections[section.index];
        lines.push(
          `  ${mmss(start)}-${mmss(start + SECTION_SECONDS)}: missed ${section.missed} of ` +
            `${section.hit + section.missed} notes (${Math.round(section.accuracy * 100)}% accuracy)` +
            (chartSection ? `, this section runs at ${chartSection.nps} notes/sec` : ''),
        );
      }
    } else {
      lines.push('sections where notes were dropped: none — no notes were missed');
    }
  }

  if (facts.chart) {
    lines.push('', 'the chart that was played:', chartFactsToText(facts.chart));
  }

  return lines.join('\n');
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
