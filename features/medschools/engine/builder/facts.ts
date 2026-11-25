/**
 * The list builder's facts (phase D): what each candidate school's row cites, what the model is shown, and the check
 * of what it returns. Pure and client-safe.
 *
 * - A school's facts are its published figures (the class the label's figures come from: the MCAT and GPA used, the
 *   science GPA, the class size, the in-state share) and, where known, its MD-PhD program and NIH MSTP listing, each
 *   with the page it was read on. Nothing is computed.
 * - The member's facts are their own figures, labelled "Your ...": the most recent MCAT total and its month, the
 *   cumulative and science GPA, the home state, the hours by category and the mission chips. Never a note, an activity
 *   title or a section score: the builder never receives them (`statsForBuilder`).
 * - `groundPicks` keeps a pick only when its id is a candidate, once, up to `count`; a reason only when `groundAnswer`
 *   (the Ask's validator) keeps it against that school's facts plus the member's, so a reason can cite no other school's
 *   figure and holds no number that is not in a cited fact.
 */
import type { MedBuildFigureDto, MedBuildMemberFactDto } from '../../medschools.contract';
import type { HoursCategory, Mission } from '../applicant';
import { groundAnswer, type GroundFact } from '../qa/ground';
import { PROFILE_KINDS, type ProfileKindId } from '../school-facts';
import type { Candidate } from './candidates';
import { percentileDto, weightedMcat } from './label';

export interface BuilderMemberStats {
  /** The most recent attempt with a total, and the other attempts' totals (`earlier`, for the labels' weighting only). */
  mcat: { total: number; year: number; month: number; earlier: number[] } | null;
  gpaCumulative: number | null;
  gpaScience: number | null;
  homeState: string | null;
  hours: { category: HoursCategory; hours: number }[];
  missions: Mission[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const HOURS_LABEL: Record<HoursCategory, string> = {
  CLINICAL: 'clinical',
  RESEARCH: 'research',
  VOLUNTEER_CLINICAL: 'clinical volunteering',
  VOLUNTEER_NONCLINICAL: 'non-clinical volunteering',
  SHADOWING: 'shadowing',
  LEADERSHIP: 'leadership',
  TEACHING: 'teaching',
};

/**
 * One of the member's figures: the structured fact the page words (`MedBuildMemberFactDto`) plus the English line the
 * model is shown and the validator reads numbers from. The line never leaves the server.
 */
export type MemberFact = MedBuildMemberFactDto & { text: string };

/** The member's own figures as citeable facts, refs `m1`, `m2`, ... */
export function memberFacts(s: BuilderMemberStats | null): MemberFact[] {
  if (!s) return [];
  const base = { year: null, month: null, category: null, missions: [] as Mission[], forLabels: null };
  const out: Omit<MemberFact, 'ref'>[] = [];
  if (s.mcat) {
    const score = weightedMcat(s.mcat.total, s.mcat.earlier);
    out.push({
      ...base,
      kind: 'mcat',
      value: String(s.mcat.total),
      year: s.mcat.year,
      month: s.mcat.month,
      // The page shows the weighted score and its percentile; the model's line stays the latest total only.
      forLabels: { score, earlier: [...s.mcat.earlier], percentile: percentileDto(score) },
      text: `Your most recent MCAT total (${MONTHS[s.mcat.month - 1] ?? ''} ${s.mcat.year}): ${s.mcat.total}`,
    });
  }
  if (s.gpaCumulative !== null) {
    const v = s.gpaCumulative.toFixed(2);
    out.push({ ...base, kind: 'gpa', value: v, text: `Your cumulative GPA: ${v}` });
  }
  if (s.gpaScience !== null) {
    const v = s.gpaScience.toFixed(2);
    out.push({ ...base, kind: 'science-gpa', value: v, text: `Your science GPA: ${v}` });
  }
  if (s.homeState) out.push({ ...base, kind: 'home-state', value: s.homeState, text: `Your home state: ${s.homeState}` });
  for (const h of s.hours) {
    out.push({
      ...base,
      kind: 'hours',
      value: String(h.hours),
      category: h.category,
      text: `Your ${HOURS_LABEL[h.category]} hours: ${h.hours}`,
    });
  }
  if (s.missions.length) {
    out.push({
      ...base,
      kind: 'missions',
      value: '',
      missions: [...s.missions],
      text: `Your mission interests: ${s.missions.join(', ')}`,
    });
  }
  return out.map((f, i) => ({ ref: `m${i + 1}`, ...f }));
}

/** What the member is sent back: the structured facts, without the server's English line. */
export const memberDtos = (facts: readonly MemberFact[]): MedBuildMemberFactDto[] =>
  facts.map(({ text: _text, ...dto }) => dto);

const SGPA_KINDS: readonly ProfileKindId[] = ['SGPA_MEDIAN', 'SGPA_MEAN', 'SGPA_SCORE'];

/** A candidate's figures (refs `c<n>f1`, ...) and the line the model is shown for each. */
export function candidateFigures(c: Candidate, n: number): { figures: MedBuildFigureDto[]; texts: string[] } {
  const figures: MedBuildFigureDto[] = [];
  const texts: string[] = [];
  const cls = c.figures.cls ?? c.school.classes[0] ?? null;
  const push = (f: Omit<MedBuildFigureDto, 'ref'>, text: string) => {
    figures.push({ ref: `c${n}f${figures.length + 1}`, ...f });
    texts.push(text);
  };
  if (cls) {
    const used = [c.figures.mcat?.stat, c.figures.gpa?.stat];
    const sgpa = SGPA_KINDS.map((k) => cls.stats.find((s) => s.kind === k && s.program === 'REG')).find(Boolean);
    const size = cls.stats.find((s) => s.kind === 'MATRICULANTS' && s.program === 'REG');
    const inState = cls.stats.find((s) => s.kind === 'IN_STATE_PCT' && s.program === 'REG');
    for (const s of [...used, sgpa, size, inState]) {
      if (!s) continue;
      const kind = s.kind as ProfileKindId;
      const label = PROFILE_KINDS[kind]?.label || kind;
      push(
        {
          kind,
          value: s.value,
          classLabel: cls.label,
          enteringYear: cls.enteringYear,
          sourceUrl: cls.url,
          checkedOn: cls.checkedOn,
          evidence: s.evidence,
        },
        `${label}, ${cls.label}: ${s.value}`,
      );
    }
  }
  const md = c.school.mdphd;
  if (md?.program.exists) {
    push(
      {
        kind: 'MDPHD_PROGRAM',
        value: md.program.name ?? '',
        classLabel: '',
        enteringYear: null,
        sourceUrl: md.program.sourceUrl,
        checkedOn: md.program.checkedOn,
        evidence: '',
      },
      `Has a ${c.school.degree === 'DO' ? 'DO-PhD' : 'MD-PhD'} program`,
    );
    if (md.mstp?.listed) {
      push(
        {
          kind: 'MSTP_T32',
          value: md.mstp.grant ?? '',
          classLabel: '',
          enteringYear: md.mstp.fiscalYear,
          sourceUrl: md.mstp.sourceUrl,
          checkedOn: md.mstp.checkedOn,
          evidence: '',
        },
        'Listed as an NIH Medical Scientist Training Program',
      );
    }
  }
  return { figures, texts };
}

export interface ModelCandidate {
  id: string;
  name: string;
  state: string;
  label: string;
  facts: { ref: string; label: string; text: string }[];
}

export interface Pick {
  /** Index into the candidate list. */
  index: number;
  reason: { text: string; cites: string[] } | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The model's picks, checked. `null` when the reply is not the expected shape at all (unreadable: the caller refunds
 * the day's question). `reasonsDropped` counts reasons the validator removed (the school stays, without a reason).
 */
export function groundPicks(
  raw: unknown,
  candidates: readonly ModelCandidate[],
  member: readonly MemberFact[],
  count: number,
  opts: { secrets?: readonly string[] } = {},
): { picks: Pick[]; reasonsDropped: number; ignored: number } | null {
  if (!isObject(raw) || !Array.isArray(raw.picks)) return null;
  const byId = new Map(candidates.map((c, i) => [c.id, i] as const));
  const memberFacts: GroundFact[] = member.map((m) => ({ ref: m.ref, text: m.text, untrusted: false, schoolSlug: null }));
  const picks: Pick[] = [];
  const seen = new Set<number>();
  let reasonsDropped = 0;
  let ignored = 0;
  for (const p of raw.picks as unknown[]) {
    const index = isObject(p) && typeof p.id === 'string' ? byId.get(p.id) : undefined;
    if (index === undefined || seen.has(index) || picks.length >= count) {
      ignored += 1;
      continue;
    }
    seen.add(index);
    const cand = candidates[index]!;
    let reason: Pick['reason'] = null;
    const r = (p as Record<string, unknown>).reason;
    if (r !== undefined && r !== null) {
      const facts: GroundFact[] = [
        ...cand.facts.map((f) => ({ ref: f.ref, text: f.text, untrusted: false, schoolSlug: cand.id })),
        ...memberFacts,
      ];
      const g = groundAnswer({ segments: [r] }, facts, opts.secrets ? { secrets: opts.secrets } : {});
      const kept = g.segments[0];
      if (kept) reason = { text: kept.text, cites: kept.cites };
      else reasonsDropped += 1;
    }
    picks.push({ index, reason });
  }
  return { picks, reasonsDropped, ignored };
}
