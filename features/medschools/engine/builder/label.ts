/**
 * The list builder's label rule (phase D, owner 2026-11-24; MCAT revised 2026-11-25): reach, target or likely,
 * computed in code from the member's MCAT and GPA against the school's PUBLISHED class figures (the class profiles,
 * source `SCHOOL_PROFILE`). The model never assigns a label. Pure and client-safe; `label.test.ts` holds every edge.
 *
 * - The member's figures: the MCAT for labels (owner 2026-11-25: "most recent but maybe weigh it by past attempts
 *   slightly"): `0.8 x latest + 0.2 x mean(earlier totals)` when earlier attempts have a total, else the latest
 *   (`MCAT_WEIGHTS`), rounded to the nearest whole score; and the cumulative GPA.
 * - The school's figures: the first class, in the Facts tab's order (an undated "current" class, then newest first),
 *   with a numeric MCAT or GPA figure for the MD program; for each, the median if published, else the mean, else the
 *   plain figure whose statistic the page does not name. A range is never used, and nothing is computed.
 * - MCAT is compared by percentile rank (owner 2026-11-25: "Target band should use percentiles"): the member's score
 *   and the school's figure are each looked up in AAMC's published table (`../mcat-percentile.ts`); more than 5 points
 *   above is above, more than 5 below is below, within 5 either way (5 included) is near (`MCAT_PERCENTILE_MARGIN`). A
 *   score with no rank in the table is "not compared" and does not count towards the label (a school's decimal mean is
 *   rounded to the nearest whole score for the lookup, like the member's).
 * - GPA keeps its points band (no official GPA percentile table is in scope): `diff = yours - theirs`, `>= 0.10` above,
 *   `<= -0.10` below, otherwise near.
 * - No figure compared: not enough published data. Any compared figure below: reach. Both compared and both above:
 *   likely. Otherwise target (so one figure alone is never "likely").
 *
 * It is not a chance of admission, and the page says so.
 */
import type {
  MedBuildComparisonDto,
  MedBuildLabel,
  MedClassProfileDto,
  MedMcatPercentileDto,
} from '../../medschools.contract';
import { mcatPercentile } from '../mcat-percentile';
import type { ProfileKindId } from '../school-facts';

/** The MCAT for labels: the latest attempt's weight and the weight of the earlier attempts' mean (owner 2026-11-25). */
export const MCAT_WEIGHTS = { latest: 0.8, earlier: 0.2 } as const;
/** In percentile points: more than this above or below the class figure's rank is above or below; within it, near. */
export const MCAT_PERCENTILE_MARGIN = 5;
/** In hundredths of a grade point, so the comparison is integer arithmetic. */
export const GPA_MARGIN = 10;

const MCAT_KINDS: readonly ProfileKindId[] = ['MCAT_MEDIAN', 'MCAT_MEAN', 'MCAT_SCORE'];
const GPA_KINDS: readonly ProfileKindId[] = ['GPA_MEDIAN', 'GPA_MEAN', 'GPA_SCORE'];
const STAT_OF: Partial<Record<ProfileKindId, MedBuildComparisonDto['stat']>> = {
  MCAT_MEDIAN: 'median',
  MCAT_MEAN: 'mean',
  MCAT_SCORE: 'unnamed',
  GPA_MEDIAN: 'median',
  GPA_MEAN: 'mean',
  GPA_SCORE: 'unnamed',
};

type Stat = MedClassProfileDto['stats'][number];

export interface ClassFigure {
  stat: Stat & { num: number };
  kind: ProfileKindId;
}

export interface SchoolFigures {
  /** The class the figures come from (null when no class has an MCAT or GPA figure). */
  cls: MedClassProfileDto | null;
  mcat: ClassFigure | null;
  gpa: ClassFigure | null;
}

function firstOf(stats: readonly Stat[], kinds: readonly ProfileKindId[]): ClassFigure | null {
  for (const kind of kinds) {
    const s = stats.find((x) => x.kind === kind && x.program === 'REG' && typeof x.num === 'number' && Number.isFinite(x.num));
    if (s) return { stat: s as Stat & { num: number }, kind };
  }
  return null;
}

/** The school's comparison figures, both from one class: the first class (page order) that has either. */
export function schoolFigures(classes: readonly MedClassProfileDto[]): SchoolFigures {
  for (const cls of classes) {
    const mcat = firstOf(cls.stats, MCAT_KINDS);
    const gpa = firstOf(cls.stats, GPA_KINDS);
    if (mcat || gpa) return { cls, mcat, gpa };
  }
  return { cls: null, mcat: null, gpa: null };
}

/**
 * The member's MCAT for labels: `MCAT_WEIGHTS.latest x latest + MCAT_WEIGHTS.earlier x mean(earlier)` when there are
 * earlier totals, else the latest; rounded to the nearest whole score (half up). The sum is rounded to six places
 * first, so a floating-point tail never moves a score across .5.
 */
export function weightedMcat(latest: number, earlier: readonly number[]): number {
  if (earlier.length === 0) return Math.round(latest);
  const mean = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const raw = MCAT_WEIGHTS.latest * latest + MCAT_WEIGHTS.earlier * mean;
  return Math.round(Math.round(raw * 1e6) / 1e6);
}

/** GPA in points, compared in hundredths (no float drift). */
export function gpaBand(yours: number, theirs: number): 'above' | 'near' | 'below' {
  const diff = Math.round(yours * 100) - Math.round(theirs * 100);
  if (diff >= GPA_MARGIN) return 'above';
  if (diff <= -GPA_MARGIN) return 'below';
  return 'near';
}

/** MCAT by percentile rank: the difference of the two ranks against `MCAT_PERCENTILE_MARGIN` (exactly 5 is near). */
export function percentileBand(yoursRank: number, theirsRank: number): 'above' | 'near' | 'below' {
  const diff = yoursRank - theirsRank;
  if (diff > MCAT_PERCENTILE_MARGIN) return 'above';
  if (diff < -MCAT_PERCENTILE_MARGIN) return 'below';
  return 'near';
}

/** A score's rank as the DTO carries it, or null when the table has none for it. */
export function percentileDto(score: number): MedMcatPercentileDto | null {
  const p = mcatPercentile(score);
  return p ? { rank: p.rank, printed: p.printed } : null;
}

export interface MemberFigures {
  /** The most recent attempt's total and the earlier attempts' totals. */
  mcat: { latest: number; earlier: readonly number[] } | null;
  gpa: number | null;
}

/** The label and the comparisons it rests on. `member` null: the member did not use their stats (`not-compared`). */
export function labelFor(
  member: MemberFigures | null,
  figs: SchoolFigures,
): { label: MedBuildLabel; comparisons: MedBuildComparisonDto[] } {
  if (!member) return { label: 'not-compared', comparisons: [] };
  const comparisons: MedBuildComparisonDto[] = [];
  if (member.mcat !== null && figs.mcat) {
    const score = weightedMcat(member.mcat.latest, member.mcat.earlier);
    const yoursPct = percentileDto(score);
    const theirsPct = percentileDto(Math.round(figs.mcat.stat.num));
    comparisons.push({
      metric: 'MCAT',
      yours: String(score),
      theirs: figs.mcat.stat.value,
      stat: STAT_OF[figs.mcat.kind] ?? 'unnamed',
      band: yoursPct && theirsPct ? percentileBand(yoursPct.rank, theirsPct.rank) : 'not-compared',
      mcat: { latest: member.mcat.latest, earlier: [...member.mcat.earlier], yoursPct, theirsPct },
    });
  }
  if (member.gpa !== null && figs.gpa) {
    comparisons.push({
      metric: 'GPA',
      yours: member.gpa.toFixed(2),
      theirs: figs.gpa.stat.value,
      stat: STAT_OF[figs.gpa.kind] ?? 'unnamed',
      band: gpaBand(member.gpa, figs.gpa.stat.num),
      mcat: null,
    });
  }
  const compared = comparisons.filter((c) => c.band !== 'not-compared');
  if (compared.length === 0) return { label: 'not-enough-data', comparisons };
  if (compared.some((c) => c.band === 'below')) return { label: 'reach', comparisons };
  if (compared.length === 2 && compared.every((c) => c.band === 'above')) return { label: 'likely', comparisons };
  return { label: 'target', comparisons };
}

/** Display order of the groups: reach first, then target, likely, the rest. */
export const LABEL_ORDER: readonly MedBuildLabel[] = ['reach', 'target', 'likely', 'not-enough-data', 'not-compared'];
