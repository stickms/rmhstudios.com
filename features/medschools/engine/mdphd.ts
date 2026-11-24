/**
 * MD-PhD (and DO-PhD) programs: does the school have one, how its years are laid out, and whether it holds an NIH
 * Medical Scientist Training Program (MSTP) T32 grant. Pure and client-safe: the importer, the public endpoint and the
 * Facts tab read the same definitions.
 *
 * Owner decisions (2026-11-24):
 *  - Programs differ in layout (2-4-2, 3-4-1, 1.5-4-2.5 ...): show the school's own timeline when its page states one.
 *  - A program that does not state one is drawn as the typical 2-4-2, always labelled as the typical layout and never as
 *    the school's statement (`TYPICAL_TIMELINE`).
 *  - Not every school has a combined program: a school whose page says so shows one quiet row; a school we know nothing
 *    about shows nothing.
 *  - MSTP status comes from NIH RePORTER (activity T32, NIGMS). A program not found there is "not listed", never "no".
 *
 * Stored as `MedSchoolFact` rows with `program` PHD and `cycleYear` `MDPHD_CYCLE` (a program is not about one entering
 * class): `MDPHD_PROGRAM` (valueText YES | NO), `MDPHD_TIMELINE` (valueText the pattern, valueNum the total years,
 * valueJson the phases, note the page's own words), `MSTP_T32` (valueText LISTED | NOT_LISTED).
 */

export const MDPHD_KINDS = ['MDPHD_PROGRAM', 'MDPHD_TIMELINE', 'MSTP_T32'] as const;
export type MdPhdKind = (typeof MDPHD_KINDS)[number];
export const isMdPhdKind = (v: unknown): v is MdPhdKind =>
  typeof v === 'string' && (MDPHD_KINDS as readonly string[]).includes(v);

/** The two sources this import owns. It never touches a row of any other source. */
export const MDPHD_SOURCES = ['SCHOOL_PAGE', 'NIH_REPORTER'] as const;
export type MdPhdSource = (typeof MDPHD_SOURCES)[number];

/** A program is not about an entering class; this stands in the unique key so a new file updates in place. */
export const MDPHD_CYCLE = 0;

export const PHASES = ['preclinical', 'research', 'clinical', 'other'] as const;
export type Phase = (typeof PHASES)[number];
/** The phases drawn as segments of the bar; `other` (a rotation, an orientation month) is listed beside it. */
export type BarPhase = Exclude<Phase, 'other'>;

export interface PhaseEntry {
  phase: Phase;
  /** Years when the page states a single length; null for a range or no length. */
  years: number | null;
  /** The page's own description of the phase. */
  label: string;
}

export const REPORTER_SEARCH_URL = 'https://reporter.nih.gov/';
export const reporterProjectUrl = (applId: number): string => `https://reporter.nih.gov/project-details/${applId}`;

/** "1.5 - 4 - 2.5" -> "1.5-4-2.5"; the school's own letters ("2-P-2") are kept. */
export function normalisePattern(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return v === '' ? null : v;
}

/** The typical layout, drawn only when the program publishes none of its own. */
export const TYPICAL_TIMELINE: { pattern: string; phases: PhaseEntry[] } = {
  pattern: '2-4-2',
  phases: [
    { phase: 'preclinical', years: 2, label: '' },
    { phase: 'research', years: 4, label: '' },
    { phase: 'clinical', years: 2, label: '' },
  ],
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const num = (s: string): number => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);
const NUMBER = `(\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join('|')})`;
const RANGE_RE = new RegExp(`\\b${NUMBER}\\s*(?:to|-|–|or|and)\\s*${NUMBER}\\s+years?\\b`, 'i');

function rangeIn(text: string, max: number): [number, number] | null {
  const m = RANGE_RE.exec(text);
  if (!m) return null;
  const lo = num(m[1]!);
  const hi = num(m[2]!);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > lo && hi <= max ? [lo, hi] : null;
}

/**
 * A length range the phase's own words state ("3.5 to 4.5 years", "three or four years"), or null. Positions in the
 * programme ("years three through six") are not lengths and do not match.
 */
export function phaseRange(label: string): [number, number] | null {
  return rangeIn(label, 8);
}

/**
 * The whole programme's length as the page states it: the stated total ("8.2 years"), else a range in the page's own
 * words ("seven to eight years", "7 to 9 years"), else null. Never derived by adding phases.
 */
export function statedTotal(
  totalYears: number | null,
  evidence: string,
): { years: number } | { range: [number, number] } | null {
  if (totalYears !== null) return { years: totalYears };
  const range = rangeIn(evidence, 12);
  return range && range[0] >= 5 ? { range } : null;
}

export interface BarSegment {
  phase: BarPhase;
  years: number | null;
  range: [number, number] | null;
  /** The flex weight: the years when every segment has them, else 1. */
  weight: number;
}

export interface BarModel {
  segments: BarSegment[];
  /** The `other` phases (rotations, orientation), in the page's order, with their own words. */
  extras: string[];
  /** Widths follow the years (every segment has a length); otherwise the segments are equal. */
  proportional: boolean;
  /** The page names all three kinds of phase and a length for each. */
  complete: boolean;
}

/**
 * The bar for a timeline: the medical and research phases in the page's order, neighbours of the same kind merged (a
 * rotation between two preclinical years does not split them), widths proportional only when every length is known.
 */
export function barModel(phases: readonly PhaseEntry[]): BarModel {
  const segments: BarSegment[] = [];
  const extras: string[] = [];
  for (const p of phases) {
    if (p.phase === 'other') {
      if (p.label) extras.push(p.label);
      continue;
    }
    const range = p.years === null ? phaseRange(p.label) : null;
    const last = segments[segments.length - 1];
    if (last && last.phase === p.phase) {
      last.years = last.years !== null && p.years !== null ? last.years + p.years : null;
      last.range = null;
      continue;
    }
    segments.push({ phase: p.phase, years: p.years, range, weight: 1 });
  }
  const proportional = segments.length > 0 && segments.every((s) => s.years !== null && s.years > 0);
  if (proportional) for (const s of segments) s.weight = s.years!;
  const kinds = new Set(segments.map((s) => s.phase));
  const complete = proportional && kinds.has('preclinical') && kinds.has('research') && kinds.has('clinical');
  return { segments, extras, proportional, complete };
}

/** Each segment's share of the bar, in percent, summing to 100 (rounded to one decimal). */
export function segmentShares(model: BarModel): number[] {
  const total = model.segments.reduce((a, s) => a + s.weight, 0);
  if (total <= 0) return [];
  return model.segments.map((s) => Math.round((s.weight / total) * 1000) / 10);
}

/**
 * A timeline is drawn as the school's own only when it names PhD research and at least one medical phase; anything less
 * is not a layout, and the page shows the typical one (with the school's stated length, if any).
 */
export function isDrawableTimeline(phases: readonly PhaseEntry[]): boolean {
  const kinds = new Set(phases.map((p) => p.phase));
  return kinds.has('research') && (kinds.has('preclinical') || kinds.has('clinical'));
}

/** A timeline record is worth keeping when it can be drawn or states the programme's length. */
export function timelineHasContent(t: {
  phases: readonly PhaseEntry[];
  totalYears: number | null;
  evidence: string;
}): boolean {
  return isDrawableTimeline(t.phases) || statedTotal(t.totalYears, t.evidence) !== null;
}
