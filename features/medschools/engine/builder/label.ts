/**
 * The list builder's label rule (phase D, owner 2026-11-24): reach, target or likely, computed in code from the member's
 * MCAT and GPA against the school's PUBLISHED class figures (the class profiles, source `SCHOOL_PROFILE`). The model
 * never assigns a label. Pure and client-safe; `label.test.ts` holds every edge.
 *
 * - The member's figures: the total of the most recent MCAT attempt that has one, and the cumulative GPA.
 * - The school's figures: the first class, in the Facts tab's order (an undated "current" class, then newest first),
 *   with a numeric MCAT or GPA figure for the MD program; for each, the median if published, else the mean, else the
 *   plain figure whose statistic the page does not name. A range is never used, and nothing is computed.
 * - Per figure, `diff = yours - theirs`: MCAT `>= 3` above, `<= -3` below; GPA `>= 0.10` above, `<= -0.10` below;
 *   otherwise near.
 * - No figure compared: not enough published data. Any compared figure below: reach. Both compared and both above:
 *   likely. Otherwise target (so one figure alone is never "likely").
 *
 * It is not a chance of admission, and the page says so.
 */
import type { MedBuildComparisonDto, MedBuildLabel, MedClassProfileDto } from '../../medschools.contract';
import type { ProfileKindId } from '../school-facts';

export const MCAT_MARGIN = 3;
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

export function band(metric: 'MCAT' | 'GPA', yours: number, theirs: number): MedBuildComparisonDto['band'] {
  const diff = metric === 'MCAT' ? Math.round(yours - theirs) : Math.round(yours * 100) - Math.round(theirs * 100);
  const margin = metric === 'MCAT' ? MCAT_MARGIN : GPA_MARGIN;
  if (diff >= margin) return 'above';
  if (diff <= -margin) return 'below';
  return 'near';
}

export interface MemberFigures {
  mcat: number | null;
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
    comparisons.push({
      metric: 'MCAT',
      yours: String(member.mcat),
      theirs: figs.mcat.stat.value,
      stat: STAT_OF[figs.mcat.kind] ?? 'unnamed',
      band: band('MCAT', member.mcat, figs.mcat.stat.num),
    });
  }
  if (member.gpa !== null && figs.gpa) {
    comparisons.push({
      metric: 'GPA',
      yours: member.gpa.toFixed(2),
      theirs: figs.gpa.stat.value,
      stat: STAT_OF[figs.gpa.kind] ?? 'unnamed',
      band: band('GPA', member.gpa, figs.gpa.stat.num),
    });
  }
  if (comparisons.length === 0) return { label: 'not-enough-data', comparisons };
  if (comparisons.some((c) => c.band === 'below')) return { label: 'reach', comparisons };
  if (comparisons.length === 2 && comparisons.every((c) => c.band === 'above')) return { label: 'likely', comparisons };
  return { label: 'target', comparisons };
}

/** Display order of the groups: reach first, then target, likely, the rest. */
export const LABEL_ORDER: readonly MedBuildLabel[] = ['reach', 'target', 'likely', 'not-enough-data', 'not-compared'];
