/**
 * The headline figures of a school, as its link preview and its page description state them: the newest entering
 * class's MCAT and GPA from the school's own class-profile page (phase C step 2), exactly as the public Facts tab shows
 * them. Pure, import-free and client-safe: the school route's `head()` runs in the browser too, and this module keeps
 * the route entry from pulling in the whole facts catalogue (`school-facts.ts` re-exports `profileQualifierNote`).
 *
 * Rules (the Facts tab's, nothing looser): the newest class only (`classes[0]`: the facts reader sorts newest first,
 * an undated "current" class ahead), regular-program figures only (an MD-PhD-only figure is a different population),
 * one MCAT and one GPA, preferring the median, then the mean, then the page's unnamed figure. The value is the page's
 * own string and the label is the stored kind's ("Median MCAT", "Mean GPA", plain "MCAT" when the page does not say
 * which): never computed, rounded or relabelled.
 */

/** The fields of a class-profile figure this reads (`MedClassProfileStatDto`). */
export interface HeadlineStatInput {
  kind: string;
  program: string;
  value: string;
  qualifier: string | null;
}

export interface HeadlineFigure {
  kind: string;
  /** The kind's label, as the Facts tab's tile prints it. */
  label: string;
  /** The page's own string ("519", "3.82"). */
  value: string;
  /** The page's own scope for the figure ("five-year average"), or null when it adds nothing (`profileQualifierNote`). */
  scope: string | null;
}

/** In order of preference, with each kind's tile label (`PROFILE_KINDS` in `school-facts.ts`; a test holds them equal). */
export const HEADLINE_MCAT = [
  ['MCAT_MEDIAN', 'Median MCAT'],
  ['MCAT_MEAN', 'Mean MCAT'],
  ['MCAT_SCORE', 'MCAT'],
] as const;
export const HEADLINE_GPA = [
  ['GPA_MEDIAN', 'Median GPA'],
  ['GPA_MEAN', 'Mean GPA'],
  ['GPA_SCORE', 'GPA'],
] as const;

type Order = typeof HEADLINE_MCAT | typeof HEADLINE_GPA;

function pick(stats: readonly HeadlineStatInput[], order: Order): HeadlineFigure | null {
  for (const [kind, label] of order) {
    const s = stats.find((x) => x.kind === kind && x.program === 'REG' && x.value.trim() !== '');
    if (s) return { kind, label, value: s.value.trim(), scope: profileQualifierNote(s.qualifier) };
  }
  return null;
}

/** The newest class's MCAT and GPA, in that order; empty when the school has no profile or neither figure. */
export function headlineFigures(classes: readonly { stats: readonly HeadlineStatInput[] }[]): HeadlineFigure[] {
  const newest = classes[0];
  if (!newest) return [];
  return [pick(newest.stats, HEADLINE_MCAT), pick(newest.stats, HEADLINE_GPA)].filter(
    (f): f is HeadlineFigure => f !== null,
  );
}

/** "Median MCAT 519". */
export const figureText = (f: HeadlineFigure): string => `${f.label} ${f.value}`;

/**
 * The school page's `<title>`: the school and the app. The app's name stands in for the site's (as the devlog's
 * "| RMH Studios Devlog" does); `og:site_name` still says RMH Studios.
 */
export function schoolTitle(name: string | null | undefined): string {
  return `${name ?? 'Medical school'} | RMH Med Schools`;
}

/**
 * The school page's description: what the page holds, in literal sentences, and the honesty line. A figure that
 * carries a scope of its own ("five-year average") is left out here, where there is no room to say it.
 */
export function schoolDescription(name: string | null | undefined, figures: readonly HeadlineFigure[] = []): string {
  const school = name ?? 'this school';
  const plain = figures.filter((f) => f.scope === null);
  if (plain.length === 0) {
    return `Reported interview invites and decisions at ${school} by day, with secondaries and interview questions. Reported events, not applicants.`;
  }
  const list = plain.map((f) => lowerFirst(figureText(f))).join(', ');
  return `Reported interview invites and decisions at ${school} by day. Entering class: ${list}. Reported events, not applicants.`;
}

/** "Median MCAT" reads "median MCAT" inside a sentence; a first word in capitals ("MCAT", "GPA") stays as it is. */
function lowerFirst(s: string): string {
  const first = s.split(' ')[0] ?? '';
  return first === first.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Words that only restate a figure's kind (the page's own wording of "Average MCAT", "new matriculants", "Overall Grade
 * Point Average"): a qualifier made of nothing else says no more than the tile's label and is not shown under it.
 */
const RESTATING = new Set(
  (
    'mcat gpa gpas score scores exam class average avg mean median overall cumulative total grade point undergraduate ' +
    'undergrad ug science bcpm composite matriculating matriculants matriculated entering students student new ' +
    'applicants applicant applications application received interviewed interviews interview enrolled enrollment size ' +
    'incoming number of the is and for a an highest standard granted completed amcas candidates in state in-state ' +
    'resident residents currently faq answer'
  ).split(' '),
);

/**
 * The qualifier as a reader sees it under a figure, or null when it adds nothing to the kind's own label: a research
 * note on the page's wording ("labelled Average MCAT", "PDF label …", "row …"), or the page's words for the kind itself
 * ("MCAT Exam Class Average", "new matriculants"; `RESTATING`). A note about the page's spelling ("(page spells …)",
 * "; page says …") is dropped. The rest is the page's own scope and is shown ("five-year average", "among those
 * accepted", "virtual interviews", "Oregon Campus column", "North Carolina").
 */
export function profileQualifierNote(qualifier: string | null): string | null {
  if (!qualifier) return null;
  const q = qualifier
    .replace(/\s*\(page [^)]*\)/gi, '')
    .replace(/;\s*page says.*$/i, '')
    .trim();
  if (q === '' || /^(labelled|labeled|pdf label|row )/i.test(q)) return null;
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w !== '');
  if (words.every((w) => RESTATING.has(w) || /^20\d\d$/.test(w))) return null;
  return q;
}
