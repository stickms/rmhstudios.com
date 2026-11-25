/**
 * Candidate selection for the list builder (phase D), in code and from PUBLIC data only: the active schools, their
 * class profiles (phase C step 2) and their MD-PhD facts. The input type holds nothing personal; the member's figures
 * reach only `labelFor` (`label.ts`), as two numbers. Pure and client-safe.
 *
 * Filters: the degree; the states (asked states and regions); MD-PhD only where the school's MD-PhD row says it has a
 * program or it holds an NIH MSTP listing; size by the published class size of the class the figures come from (small
 * under 125, large 200 and over; no published size leaves the school out of a size filter). Missions rank, never
 * filter: `research` puts schools with an MD-PhD program or an MSTP first; the other missions have no public data and
 * are returned as `unused`. Then schools with a published MCAT or GPA figure before those without, then by name.
 */
import type { MedClassProfileDto, MedMdPhdDto } from '../../medschools.contract';
import type { Mission } from '../applicant';
import { schoolFigures, type SchoolFigures } from './label';

export const MAX_CANDIDATES = 40;
export const SIZE_SMALL_UNDER = 125;
export const SIZE_LARGE_FROM = 200;
/** The missions public data can speak to. */
export const MISSIONS_WITH_DATA: readonly Mission[] = ['research'];

export interface PublicSchool {
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  degree: 'MD' | 'DO';
  /** The class profiles, in the Facts tab's order (`classProfilesOf`). */
  classes: MedClassProfileDto[];
  mdphd: MedMdPhdDto | null;
}

export interface Candidate {
  school: PublicSchool;
  figures: SchoolFigures;
  /** The published class size of the figures' class, when it is a plain number. */
  classSize: number | null;
  research: boolean;
}

export interface CandidateFilters {
  states: readonly string[];
  degree: 'MD' | 'DO' | null;
  mdphd: boolean;
  size: 'small' | 'medium' | 'large' | null;
  missions: readonly Mission[];
}

const hasProgram = (s: PublicSchool): boolean => s.mdphd?.program.exists === true;
const hasMstp = (s: PublicSchool): boolean => s.mdphd?.program.exists === true && s.mdphd.mstp?.listed === true;

function classSizeOf(figs: SchoolFigures, classes: readonly MedClassProfileDto[]): number | null {
  const cls = figs.cls ?? classes[0] ?? null;
  const s = cls?.stats.find((x) => x.kind === 'MATRICULANTS' && x.program === 'REG' && typeof x.num === 'number');
  return s && typeof s.num === 'number' ? s.num : null;
}

function sizeOk(size: CandidateFilters['size'], n: number | null): boolean {
  if (!size) return true;
  if (n === null) return false;
  if (size === 'small') return n < SIZE_SMALL_UNDER;
  if (size === 'large') return n >= SIZE_LARGE_FROM;
  return n >= SIZE_SMALL_UNDER && n < SIZE_LARGE_FROM;
}

export function selectCandidates(
  schools: readonly PublicSchool[],
  f: CandidateFilters,
  max = MAX_CANDIDATES,
): { candidates: Candidate[]; unused: Mission[] } {
  const states = new Set(f.states);
  const wantsResearch = f.missions.includes('research');
  const all: Candidate[] = schools
    .filter((s) => (!f.degree || s.degree === f.degree) && (states.size === 0 || states.has(s.state)))
    .filter((s) => !f.mdphd || hasProgram(s) || hasMstp(s))
    .map((s) => {
      const figures = schoolFigures(s.classes);
      return { school: s, figures, classSize: classSizeOf(figures, s.classes), research: hasProgram(s) || hasMstp(s) };
    })
    .filter((c) => sizeOk(f.size, c.classSize));
  const rank = (c: Candidate): number =>
    (wantsResearch && c.research ? 0 : 2) + (c.figures.mcat || c.figures.gpa ? 0 : 1);
  all.sort(
    (a, b) =>
      rank(a) - rank(b) || a.school.name.localeCompare(b.school.name, 'en') || a.school.slug.localeCompare(b.school.slug),
  );
  return {
    candidates: all.slice(0, max),
    unused: f.missions.filter((m) => !MISSIONS_WITH_DATA.includes(m)),
  };
}
