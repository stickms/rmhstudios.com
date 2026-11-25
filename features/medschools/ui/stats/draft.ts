/**
 * The stats form's draft (phase D): what the fields hold (strings, as typed) and the two conversions, from the stored
 * stats and to the PUT body. Pure; the rules are `engine/applicant.ts`'s, so the form refuses what the server would.
 */
import {
  HOURS_CATEGORIES,
  STATS_LIMITS,
  attemptProblem,
  gpaOk,
  withTotal,
  type ApplicantStats,
  type AttemptProblem,
  type GraduateType,
  type HoursCategory,
  type McatAttempt,
  type Mission,
  type PostbaccType,
} from '../../engine/applicant';
import type { PutStatsBody } from '../../api/stats-schemas';

export interface AttemptDraft {
  /** `YYYY-MM`, the native month field's value. */
  month: string;
  day: string;
  total: string;
  cpbs: string;
  cars: string;
  bbls: string;
  psbb: string;
}

export interface ActivityDraft {
  title: string;
  hours: string;
  note: string;
}

export interface HoursDraft {
  hours: string;
  note: string;
  activities: ActivityDraft[];
}

export interface StatsDraft {
  mcat: AttemptDraft[];
  gpa: {
    cumulative: string;
    science: string;
    postbacc: string;
    postbaccType: PostbaccType | '';
    graduate: string;
    graduateType: GraduateType | '';
  };
  hours: Record<HoursCategory, HoursDraft>;
  homeState: string;
  missions: Mission[];
  publications: string;
  presentations: string;
}

export const EMPTY_ATTEMPT: AttemptDraft = { month: '', day: '', total: '', cpbs: '', cars: '', bbls: '', psbb: '' };
export const EMPTY_ACTIVITY: ActivityDraft = { title: '', hours: '', note: '' };

const str = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));
const pad = (n: number) => String(n).padStart(2, '0');

export function draftOf(stats: ApplicantStats | null, homeState: string | null): StatsDraft {
  const hours = Object.fromEntries(
    HOURS_CATEGORIES.map((c) => {
      const h = stats?.hours.find((x) => x.category === c);
      return [
        c,
        {
          hours: str(h?.hours),
          note: h?.note ?? '',
          activities: (h?.activities ?? []).map((a) => ({ title: a.title, hours: str(a.hours), note: a.note ?? '' })),
        },
      ];
    }),
  ) as Record<HoursCategory, HoursDraft>;
  const g = stats?.gpa;
  return {
    mcat: (stats?.mcat ?? []).map((a) => ({
      month: `${a.year}-${pad(a.month)}`,
      day: str(a.day),
      total: str(a.total),
      cpbs: str(a.cpbs),
      cars: str(a.cars),
      bbls: str(a.bbls),
      psbb: str(a.psbb),
    })),
    gpa: {
      cumulative: g?.cumulative != null ? g.cumulative.toFixed(2) : '',
      science: g?.science != null ? g.science.toFixed(2) : '',
      postbacc: g?.postbacc != null ? g.postbacc.toFixed(2) : '',
      postbaccType: g?.postbaccType ?? '',
      graduate: g?.graduate != null ? g.graduate.toFixed(2) : '',
      graduateType: g?.graduateType ?? '',
    },
    hours,
    homeState: homeState ?? '',
    missions: stats?.missions ?? [],
    publications: str(stats?.publications),
    presentations: str(stats?.presentations),
  };
}

/** A problem the form shows next to a field. Keys: `mcat.<i>`, `gpa.<field>`, `hours.<category>`, `count.<field>`. */
export type DraftProblem = AttemptProblem | 'gpa' | 'number' | 'title';

const intOrNull = (s: string): number | null | 'bad' => {
  const v = s.trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : 'bad';
};

/** The PUT body, or the problems that stop it. */
export function bodyOf(d: StatsDraft): { body: PutStatsBody } | { problems: Record<string, DraftProblem> } {
  const problems: Record<string, DraftProblem> = {};
  const mcat: McatAttempt[] = [];
  d.mcat.forEach((a, i) => {
    const blank = Object.values(a).every((v) => v.trim() === '');
    if (blank) return;
    const m = /^(\d{4})-(\d{2})$/.exec(a.month.trim());
    const nums = [a.day, a.total, a.cpbs, a.cars, a.bbls, a.psbb].map(intOrNull);
    if (!m || nums.includes('bad')) {
      problems[`mcat.${i}`] = m ? 'section' : 'date';
      return;
    }
    const [day, total, cpbs, cars, bbls, psbb] = nums as (number | null)[];
    const attempt: McatAttempt = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: day ?? null,
      total: total ?? null,
      cpbs: cpbs ?? null,
      cars: cars ?? null,
      bbls: bbls ?? null,
      psbb: psbb ?? null,
    };
    const problem = attemptProblem(attempt);
    if (problem) problems[`mcat.${i}`] = problem;
    else mcat.push(withTotal(attempt));
  });
  const gpa = (key: keyof StatsDraft['gpa'], s: string): number | null => {
    const v = s.trim();
    if (!v) return null;
    const n = Number(v);
    if (!/^\d(\.\d{1,2})?$/.test(v) || !gpaOk(n)) {
      problems[`gpa.${key}`] = 'gpa';
      return null;
    }
    return n;
  };
  const g = {
    cumulative: gpa('cumulative', d.gpa.cumulative),
    science: gpa('science', d.gpa.science),
    postbacc: gpa('postbacc', d.gpa.postbacc),
    postbaccType: d.gpa.postbaccType || null,
    graduate: gpa('graduate', d.gpa.graduate),
    graduateType: d.gpa.graduateType || null,
  };
  const hours: NonNullable<PutStatsBody['hours']> = [];
  for (const c of HOURS_CATEGORIES) {
    const h = d.hours[c];
    const n = intOrNull(h.hours);
    if (n === 'bad' || (typeof n === 'number' && n > STATS_LIMITS.hours)) {
      problems[`hours.${c}`] = 'number';
      continue;
    }
    const activities: { title: string; hours: number | null; note: string | null }[] = [];
    for (const a of h.activities) {
      if (!a.title.trim() && !a.hours.trim() && !a.note.trim()) continue;
      const ah = intOrNull(a.hours);
      if (!a.title.trim()) problems[`hours.${c}`] = 'title';
      else if (ah === 'bad' || (typeof ah === 'number' && ah > STATS_LIMITS.hours)) problems[`hours.${c}`] = 'number';
      else activities.push({ title: a.title.trim(), hours: ah, note: a.note.trim() || null });
    }
    if (n !== null || h.note.trim() || activities.length) {
      hours.push({ category: c, hours: n, note: h.note.trim() || null, activities });
    }
  }
  const count = (key: 'publications' | 'presentations'): number | null => {
    const n = intOrNull(d[key]);
    if (n === 'bad' || (typeof n === 'number' && n > STATS_LIMITS.count)) {
      problems[`count.${key}`] = 'number';
      return null;
    }
    return n;
  };
  const publications = count('publications');
  const presentations = count('presentations');
  if (Object.keys(problems).length) return { problems };
  return {
    body: {
      mcat,
      gpa: g,
      hours,
      homeState: d.homeState || null,
      missions: d.missions,
      publications,
      presentations,
    },
  };
}
