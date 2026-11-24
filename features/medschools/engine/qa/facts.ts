/**
 * Fact builders (plan R5, R6): the public readers' DTOs become one English sentence per fact, numbers copied exactly as
 * the DTO holds them, so the validator's allowed set is simply the tokens of the text the model was shown. Pure: the
 * readers have already applied the k floor, the published snapshot and the primary-source rule, and nothing here
 * re-floors, sums or invents a figure. Free forum text (interview questions, feedback lines) is flagged `untrusted`.
 */
import type {
  ActivityTypeDto,
  InterviewProfileDto,
  MedChartedTypeId,
  MedSchoolActivityRes,
  MedSchoolDetailDto,
  MedSchoolForecastRes,
  MedSchoolHistoryRes,
  SchoolStatsDto,
  SourceLinkDto,
} from '../../medschools.contract';
import { cycleLabel } from '../cycle';
import { PRIMARY_ORDER, SOURCE_NAMES } from '../public-read';
import type { MedSource } from '../types';
import { cleanForPrompt } from './sanitize';
import type { RetrievedFact } from './types';

export interface FactStamp {
  source: MedSource | 'FORECAST' | 'DIRECTORY';
  updatedAt: string | null;
}
export type Stamps = {
  counts: Partial<Record<MedSource, string | null>>; // latest OK run per source
  profile: Partial<Record<MedSource, string | null>>; // fetchedAt
  questions: string | null; // newest updatedAt among the school's questions
  forecast: string | null; // computedAt
};
export interface SchoolHead {
  slug: string;
  name: string;
  shortName: string;
  degree: 'MD' | 'DO';
}
export type DraftFact = Omit<RetrievedFact, 'ref'>;

export const FACT_LABELS = {
  school: 'School',
  stats: 'Applicant statistics',
  profile: 'Interview profile',
  question: 'Interview question',
  events: 'Reported events',
  history: 'Cycle history',
  forecast: 'Forecast',
} as const;

const FORECAST_NAME = 'RMH forecast';
const MAX_FEEDBACK_PER_KIND = 2;
const MAX_FREE_FIELD = 60;

const TYPE_WORD: Record<string, string> = {
  INTERVIEW: 'interview',
  SECONDARY: 'secondary',
  WAITLIST: 'waitlist',
  REJECTION: 'rejection',
  ACCEPTANCE: 'acceptance',
  WITHDRAWN: 'withdrawn',
  HOLD: 'hold',
};

const pagePath = (slug: string, query = '') => `/med/${slug}${query}`;

function programWord(school: SchoolHead, program: 'REG' | 'PHD' | 'ALL' | null): string {
  if (program === 'PHD') return `${school.degree}-PhD`;
  if (program === 'REG') return school.degree;
  if (program === 'ALL') return `${school.degree}, regular and PhD programs counted together within one source`;
  return school.degree;
}

function linkFor(source: MedSource | 'FORECAST', links: readonly SourceLinkDto[] | undefined): string | null {
  if (!links || source === 'FORECAST') return null;
  const mine = links.filter((l) => l.source === source);
  return (mine.find((l) => l.scope === 'school') ?? mine[0])?.href ?? null;
}

function stamp(map: Partial<Record<MedSource, string | null>>, source: MedSource): string | null {
  return map[source] ?? null;
}

const num = (n: number): string => String(n);

function field(parts: string[], label: string, n: number | null, suffix = ''): void {
  if (n !== null && n !== undefined) parts.push(`${label} ${num(n)}${suffix}`);
}

function rangeOf(low: number | null, high: number | null): string {
  return low !== null && high !== null ? ` (range ${num(low)} to ${num(high)})` : '';
}

function statsFact(
  school: SchoolHead,
  s: SchoolStatsDto,
  cycleYear: number,
  stamps: Stamps,
  links: readonly SourceLinkDto[] | undefined,
): DraftFact | null {
  const parts: string[] = [];
  if (s.mcatMedian !== null) parts.push(`MCAT median ${num(s.mcatMedian)}${rangeOf(s.mcatLow, s.mcatHigh)}`);
  if (s.gpaMedian !== null) parts.push(`GPA median ${num(s.gpaMedian)}${rangeOf(s.gpaLow, s.gpaHigh)}`);
  field(parts, 'applications', s.applicationCount);
  field(parts, 'interviews', s.interviewCount);
  field(parts, 'admitted', s.admittedCount);
  field(parts, 'application-to-interview rate', s.applicationToInterviewPct, '%');
  field(parts, 'interview-to-acceptance rate', s.interviewToAcceptancePct, '%');
  field(parts, 'research hours', s.researchHours);
  field(parts, 'clinical hours', s.clinicalHours);
  field(parts, 'non-clinical hours', s.nonClinicalHours);
  if (parts.length === 0) return null;
  const who = s.program ? programWord(school, s.program) : school.degree;
  const residence = s.residence === 'IN_STATE' ? ', in-state' : s.residence === 'OUT_OF_STATE' ? ', out-of-state' : '';
  const when = s.allCycles ? 'all reported cycles' : cycleLabel(s.cycleYear || cycleYear);
  return {
    schoolSlug: school.slug,
    label: FACT_LABELS.stats,
    text: `${school.shortName} (${who}${residence}), ${when}, ${SOURCE_NAMES[s.source]}: ${parts.join(', ')}.`,
    untrusted: false,
    source: s.source,
    sourceName: SOURCE_NAMES[s.source],
    updatedAt: stamp(stamps.counts, s.source),
    href: pagePath(school.slug, '?tab=interviews'),
    sourceHref: linkFor(s.source, links),
  };
}

function freeField(v: string | null): string | null {
  if (!v) return null;
  const c = cleanForPrompt(v, MAX_FREE_FIELD);
  return c.length ? c : null;
}

function profileFact(
  school: SchoolHead,
  p: InterviewProfileDto,
  stamps: Stamps,
  links: readonly SourceLinkDto[] | undefined,
): DraftFact | null {
  const parts: string[] = [];
  const format = freeField(p.format);
  if (format) parts.push(`format ${format}`);
  field(parts, 'average difficulty', p.avgDifficulty);
  field(parts, 'average stress', p.avgStress);
  field(parts, 'average impression', p.avgImpression);
  field(parts, 'interview reports', p.interviewCount);
  if (p.split) parts.push(`in-state ${num(p.split.inState)}, out-of-state ${num(p.split.outOfState)}`);
  if (parts.length === 0) return null;
  return {
    schoolSlug: school.slug,
    label: FACT_LABELS.profile,
    text: `${school.shortName} interview profile, ${SOURCE_NAMES[p.source]}: ${parts.join(', ')}.`,
    untrusted: false,
    source: p.source,
    sourceName: SOURCE_NAMES[p.source],
    updatedAt: stamp(stamps.profile, p.source),
    href: pagePath(school.slug, '?tab=interviews&itab=format'),
    sourceHref: linkFor(p.source, links),
  };
}

/**
 * The profile's free-text columns (`interviewStyle`, `interviewLength`) are scraped, member-reported text, not a column of
 * ours: they travel as an untrusted fact, so they can be quoted but never supply a number or a domain (plan R17).
 */
function profileNotesFact(
  school: SchoolHead,
  p: InterviewProfileDto,
  stamps: Stamps,
  links: readonly SourceLinkDto[] | undefined,
): DraftFact | null {
  const parts: string[] = [];
  const style = freeField(p.interviewStyle);
  if (style) parts.push(`style ${style}`);
  const length = freeField(p.interviewLength);
  if (length) parts.push(`length ${length}`);
  if (parts.length === 0) return null;
  return {
    schoolSlug: school.slug,
    label: FACT_LABELS.question,
    text: `${school.shortName} interview notes, member-reported, ${SOURCE_NAMES[p.source]}: ${parts.join(', ')}.`,
    untrusted: true,
    source: p.source,
    sourceName: SOURCE_NAMES[p.source],
    updatedAt: stamp(stamps.profile, p.source),
    href: pagePath(school.slug, '?tab=interviews&itab=format'),
    sourceHref: linkFor(p.source, links),
  };
}

/** Header, floored statistics, interview profiles, feedback lines and (at most `opts.questions`) questions by votes. */
export function schoolFacts(d: MedSchoolDetailDto, stamps: Stamps, opts: { questions: number }): DraftFact[] {
  const school: SchoolHead = {
    slug: d.school.slug,
    name: d.school.name,
    shortName: d.school.shortName,
    degree: d.school.degree,
  };
  const out: DraftFact[] = [];

  const header = [
    `${d.school.name} (${d.school.shortName}) is a ${d.school.degree} school in ${d.school.city}, ${d.school.state}`,
    d.school.interviewFormat ? `interview format ${cleanForPrompt(d.school.interviewFormat, MAX_FREE_FIELD)}` : '',
    d.school.interviewType ? `interview type ${cleanForPrompt(d.school.interviewType, MAX_FREE_FIELD)}` : '',
  ].filter(Boolean);
  out.push({
    schoolSlug: school.slug,
    label: FACT_LABELS.school,
    text: `${header.join(', ')}.`,
    untrusted: false,
    source: 'DIRECTORY',
    sourceName: 'RMH Med Schools',
    updatedAt: null,
    href: pagePath(school.slug),
    sourceHref: null,
  });

  for (const s of d.stats) {
    const f = statsFact(school, s, d.cycleYear, stamps, d.links);
    if (f) out.push(f);
  }
  for (const p of d.profiles) {
    const f = profileFact(school, p, stamps, d.links);
    if (f) out.push(f);
    // Member-reported text is only retrieved where questions are (a timing question gets none).
    const notes = opts.questions > 0 ? profileNotesFact(school, p, stamps, d.links) : null;
    if (notes) out.push(notes);
  }

  if (opts.questions > 0) {
    for (const p of d.profiles) {
      const kinds: [string, string[]][] = [
        ['positive', p.feedbackPositive],
        ['negative', p.feedbackNegative],
        ['before the interview', p.feedbackBefore],
      ];
      for (const [kind, lines] of kinds) {
        for (const line of lines.slice(0, MAX_FEEDBACK_PER_KIND)) {
          const text = cleanForPrompt(line);
          if (!text) continue;
          out.push({
            schoolSlug: school.slug,
            label: FACT_LABELS.question,
            text: `${school.shortName} interview feedback (${kind}): ${text}`,
            untrusted: true,
            source: p.source,
            sourceName: SOURCE_NAMES[p.source],
            updatedAt: stamp(stamps.profile, p.source),
            href: pagePath(school.slug, '?tab=interviews&itab=format'),
            sourceHref: linkFor(p.source, d.links),
          });
        }
      }
    }
    const byVotes = [...d.questions].sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1));
    for (const q of byVotes.slice(0, opts.questions)) {
      const text = cleanForPrompt(q.text);
      if (!text) continue;
      out.push({
        schoolSlug: school.slug,
        label: FACT_LABELS.question,
        text: `${school.shortName} interview question: ${text}`,
        untrusted: true,
        source: q.source,
        sourceName: SOURCE_NAMES[q.source],
        updatedAt: stamps.questions,
        href: pagePath(school.slug, '?tab=interviews&itab=questions'),
        sourceHref: linkFor(q.source, d.links),
      });
    }
  }
  return out;
}

function lastDay(t: ActivityTypeDto['sources'][number]): string | null {
  return t.days.length ? (t.days[t.days.length - 1]?.date ?? null) : null;
}

/**
 * Per charted type the primary source's total, and every other source as its own labelled comparison fact: two
 * sources are never added (spec section 10). The reader already chose the primary after the floor.
 */
export function activityFacts(
  school: SchoolHead,
  a: MedSchoolActivityRes,
  stamps: Stamps,
  links?: readonly SourceLinkDto[],
): DraftFact[] {
  const out: DraftFact[] = [];
  const who = programWord(school, a.program);
  const when = cycleLabel(a.cycleYear);
  const mk = (source: MedSource, text: string): DraftFact => ({
    schoolSlug: school.slug,
    label: FACT_LABELS.events,
    text,
    untrusted: false,
    source,
    sourceName: SOURCE_NAMES[source],
    updatedAt: stamp(stamps.counts, source),
    href: pagePath(school.slug, '?tab=activity'),
    sourceHref: linkFor(source, links),
  });
  for (const t of a.types) {
    if (!t.primary) continue;
    const word = TYPE_WORD[t.eventType] ?? t.eventType.toLowerCase();
    const primary = t.sources.find((s) => s.source === t.primary);
    if (primary && primary.total > 0) {
      const through = lastDay(primary);
      out.push(
        mk(
          primary.source,
          `${school.shortName}, ${who}, ${when}, ${SOURCE_NAMES[primary.source]}: ${num(primary.total)} reported ${word} events${through ? ` through ${through}` : ''}.`,
        ),
      );
    }
    for (const s of t.sources) {
      if (s.source === t.primary || s.total <= 0) continue;
      out.push(
        mk(
          s.source,
          `Comparison, a different source and not added to ${SOURCE_NAMES[t.primary]}: ${SOURCE_NAMES[s.source]} reports ${num(s.total)} ${word} events for ${school.shortName}, ${who}, ${when}.`,
        ),
      );
    }
  }
  for (const o of a.otherTotals) {
    const first = PRIMARY_ORDER.map((p) => o.sources.find((s) => s.source === p)).find((s) => s && s.total > 0);
    if (!first) continue;
    out.push(
      mk(
        first.source,
        `${school.shortName}, ${who}, ${when}, ${SOURCE_NAMES[first.source]}: ${num(first.total)} reported ${TYPE_WORD[o.eventType]} events.`,
      ),
    );
  }
  return out;
}

/** The cycle total per cycle for the primary source of each cycle. */
export function historyFacts(
  school: SchoolHead,
  h: MedSchoolHistoryRes,
  stamps: Stamps,
  links?: readonly SourceLinkDto[],
): DraftFact[] {
  const out: DraftFact[] = [];
  const word = TYPE_WORD[h.eventType as MedChartedTypeId] ?? h.eventType.toLowerCase();
  const who = programWord(school, h.program);
  for (const c of h.cycles) {
    const primary = PRIMARY_ORDER.map((p) => c.sources.find((s) => s.source === p)).find((s) => s);
    if (!primary || primary.total <= 0) continue;
    out.push({
      schoolSlug: school.slug,
      label: FACT_LABELS.history,
      text: `${school.shortName}, ${who}, ${cycleLabel(c.cycleYear)} cycle, ${SOURCE_NAMES[primary.source]}: ${num(primary.total)} reported ${word} events in total.`,
      untrusted: false,
      source: primary.source,
      sourceName: SOURCE_NAMES[primary.source],
      updatedAt: stamp(stamps.counts, primary.source),
      href: pagePath(school.slug, '?tab=history'),
      sourceHref: linkFor(primary.source, links),
    });
  }
  return out;
}

/** `ready` and `early`: the total and the half-way day as a likely range; `no-history`: the observed count only; otherwise nothing. */
export function forecastFacts(school: SchoolHead, f: MedSchoolForecastRes, stamps: Stamps): DraftFact[] {
  if (f.status === 'no-data' || f.status === 'pending') return [];
  const word = TYPE_WORD[f.eventType] ?? f.eventType.toLowerCase();
  const who = programWord(school, f.program);
  const when = cycleLabel(f.cycleYear);
  const observed = f.observed.length ? (f.observed[f.observed.length - 1]?.cumulative ?? null) : null;
  const seen =
    observed !== null && f.asOf ? ` ${num(observed)} reported ${word} events were seen through ${f.asOf}.` : '';
  let text: string;
  if ((f.status === 'ready' || f.status === 'early') && f.summary) {
    const t = f.summary.total;
    const h = f.summary.halfOn;
    text =
      `Forecast for ${school.shortName}, ${who}, ${when}${f.status === 'early' ? ' (early in the cycle, wide range)' : ''}: ` +
      `the season total of reported ${word} events is expected near ${num(t.p50)}, likely range ${num(t.p10)} to ${num(t.p90)}; ` +
      `half of them are reported by about ${h.p50}, likely between ${h.p10} and ${h.p90}.${seen}`;
  } else if (f.status === 'no-history') {
    if (observed === null) return [];
    text = `Forecast for ${school.shortName}, ${who}, ${when}: no earlier cycles to forecast from.${seen}`;
  } else {
    return [];
  }
  return [
    {
      schoolSlug: school.slug,
      label: FACT_LABELS.forecast,
      text,
      untrusted: false,
      source: 'FORECAST',
      sourceName: FORECAST_NAME,
      updatedAt: stamps.forecast,
      href: pagePath(school.slug, '?tab=forecast'),
      sourceHref: null,
    },
  ];
}

/** Issues `f1..fn` in order and drops a later fact whose text repeats an earlier one. */
export function numberRefs(facts: DraftFact[]): RetrievedFact[] {
  const seen = new Set<string>();
  const out: RetrievedFact[] = [];
  for (const f of facts) {
    if (seen.has(f.text)) continue;
    seen.add(f.text);
    out.push({ ref: `f${out.length + 1}`, ...f });
  }
  return out;
}

const PRIORITY: Record<string, number> = {
  [FACT_LABELS.school]: 0,
  [FACT_LABELS.stats]: 1,
  [FACT_LABELS.events]: 2,
  [FACT_LABELS.forecast]: 3,
  [FACT_LABELS.history]: 4,
  [FACT_LABELS.profile]: 5,
  [FACT_LABELS.question]: 6,
};

/**
 * At most `maxFacts` facts and `maxChars` characters of fact text, the lowest priority dropped first (stats, activity,
 * forecast, history, profile, questions). A fact is kept whole or not at all; the survivors keep their order and refs.
 */
export function capFacts(facts: RetrievedFact[], maxFacts = 40, maxChars = 12_000): RetrievedFact[] {
  const ranked = facts
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (PRIORITY[a.f.label] ?? 9) - (PRIORITY[b.f.label] ?? 9) || a.i - b.i);
  const keep = new Set<number>();
  let chars = 0;
  for (const { f, i } of ranked) {
    if (keep.size >= maxFacts || chars + f.text.length > maxChars) break;
    keep.add(i);
    chars += f.text.length;
  }
  return facts.filter((_, i) => keep.has(i));
}
