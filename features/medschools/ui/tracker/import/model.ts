/**
 * The import preview's editable state and the rules that read it, pure so each is a unit test. The preview comes from the
 * server with every date already validated for ITS cycle; the member may change the cycle, edit a date, untick a date or a
 * school, pick a school the server could not match, and tick a conflicting date to replace the one on the tracker.
 * What is written is decided here from that state and checked again by the server.
 */
import { IMPORT_LIMITS, importKindOf, inferYear, isoDay, parseIsoDay } from '../../../engine/import';
import { cycleYearOf } from '../../../engine/cycle';
import { cycleYearProblem, milestoneDateProblem, type MilestoneType } from '../../../engine/tracker';
import type { MedImportPreviewRes, MedImportRowDto, TrackerDto } from '../../../medschools.contract';

export type PickedSchool = NonNullable<MedImportRowDto['school']>;

export interface EditMilestone {
  type: MilestoneType;
  date: string;
  yearInferred: boolean;
  ambiguous: boolean;
  from: string;
  /** The member unticked a date that would be added. */
  skip: boolean;
  /** The member ticked a date that conflicts, to replace the one on the tracker. */
  replace: boolean;
}

export interface EditRow {
  key: string;
  schoolName: string;
  school: PickedSchool | null;
  program: 'REG' | 'PHD';
  /** The school's own checkbox. A row with no school starts unticked until one is picked. */
  include: boolean;
  milestones: EditMilestone[];
}

export function toEditable(preview: MedImportPreviewRes): EditRow[] {
  return preview.rows.map((r) => ({
    key: r.key,
    schoolName: r.schoolName,
    school: r.school,
    program: r.program,
    include: r.school !== null,
    milestones: r.milestones.map((m) => ({ ...m, skip: false, replace: false })),
  }));
}

/** What the tracker has for one school and program in the chosen cycle: type to date. */
export type Existing = ReadonlyMap<MilestoneType, string>;

export type MilestoneStatus = 'new' | 'same' | 'conflict' | 'invalid';

export function statusOf(
  m: EditMilestone,
  existing: Existing | undefined,
  cycleYear: number,
  now: Date,
): MilestoneStatus {
  if (milestoneDateProblem(cycleYear, m.date, now) !== null) return 'invalid';
  const was = existing?.get(m.type);
  if (was === undefined) return 'new';
  return was === m.date ? 'same' : 'conflict';
}

/** Is this date going to be written? */
export function writes(row: EditRow, m: EditMilestone, status: MilestoneStatus): boolean {
  if (!row.include || !row.school) return false;
  if (status === 'new') return !m.skip;
  return status === 'conflict' && m.replace;
}

/** The cycle changed: a year the file did not write is chosen again by the cycle rules; a written year stays. */
export function retarget(rows: readonly EditRow[], cycleYear: number, now: Date): EditRow[] {
  return rows.map((r) => ({
    ...r,
    milestones: r.milestones.map((m) => {
      if (!m.yearInferred) return m;
      const day = parseIsoDay(m.date);
      if (!day) return m;
      const y = inferYear(m.type, day.m, day.d, cycleYear, now);
      return y === null ? m : { ...m, date: isoDay(y, day.m, day.d) };
    }),
  }));
}

export function saveBody(
  rows: readonly EditRow[],
  existingOf: (slug: string, program: 'REG' | 'PHD') => Existing | undefined,
  cycleYear: number,
  now: Date,
) {
  const out: {
    slug: string;
    program: 'REG' | 'PHD';
    milestones: { type: MilestoneType; date: string; overwrite: boolean }[];
  }[] = [];
  for (const r of rows) {
    if (!r.school) continue;
    const existing = existingOf(r.school.slug, r.program);
    const milestones = r.milestones.flatMap((m) => {
      const status = statusOf(m, existing, cycleYear, now);
      return writes(r, m, status) ? [{ type: m.type, date: m.date, overwrite: status === 'conflict' }] : [];
    });
    if (milestones.length > 0) out.push({ slug: r.school.slug, program: r.program, milestones });
  }
  // The same school and program picked for two rows is one application: the server merges them, the first date of a type wins.
  return { cycleYear, rows: out };
}

export function summarize(
  rows: readonly EditRow[],
  existingOf: (slug: string, program: 'REG' | 'PHD') => Existing | undefined,
  cycleYear: number,
  now: Date,
): { dates: number; schools: number; replacing: number } {
  const body = saveBody(rows, existingOf, cycleYear, now);
  return {
    dates: body.rows.reduce((n, r) => n + r.milestones.length, 0),
    schools: body.rows.length,
    replacing: body.rows.reduce((n, r) => n + r.milestones.filter((m) => m.overwrite).length, 0),
  };
}

/** The member changed a date by hand: it is theirs now, so no cycle change moves it and no flag is left on it. */
export function editDate(rows: readonly EditRow[], key: string, type: MilestoneType, date: string): EditRow[] {
  return rows.map((r) =>
    r.key !== key
      ? r
      : {
          ...r,
          milestones: r.milestones.map((m) =>
            m.type === type ? { ...m, date, yearInferred: false, ambiguous: false } : m,
          ),
        },
  );
}

/** The cycles an import may target: the window the tracker accepts, newest first. */
export function cycleChoices(now: Date): number[] {
  const current = cycleYearOf(now, 'SECONDARY');
  const out: number[] = [];
  for (let y = current + 1; y >= current - 3; y--) if (!cycleYearProblem(y, now)) out.push(y);
  return out;
}

/** What the tracker already holds for the cycle, keyed by school and program, from the tracker response. */
export function existingIndex(tracker: TrackerDto | undefined, cycleYear: number): Map<string, Existing> {
  const out = new Map<string, Existing>();
  const cycle = tracker?.cycle;
  if (!cycle || cycle.cycleYear !== cycleYear) return out;
  for (const a of cycle.applications) {
    out.set(`${a.school.slug}|${a.program}`, new Map(a.milestones.map((m) => [m.type, m.date])));
  }
  return out;
}

/** Whether the browser should send this file at all: the server's two file refusals, decided before the upload. */
export function fileProblem(file: { name: string; type: string; size: number }): 'unsupported' | 'too-large' | null {
  if (importKindOf(file.type, file.name) === null) return 'unsupported';
  return file.size > IMPORT_LIMITS.fileBytes ? 'too-large' : null;
}
