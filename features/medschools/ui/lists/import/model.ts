/**
 * The list import preview's editable state and the rules that read it (owner 2026-11-24), pure so each is a unit test.
 * The server sends rows already checked against the text; the member may untick a school, pick one the server could not
 * match, and change a school's program. What is sent is decided here and checked again by the server, which also
 * de-dupes against the list.
 */
import { LIMITS } from '../../../engine/tracker';
import type {
  MedListDto,
  MedListImportPreviewRes,
  MedListImportRowDto,
  MedListProgramId,
} from '../../../medschools.contract';

export type PickedSchool = NonNullable<MedListImportRowDto['school']>;

export interface ListEditRow {
  key: string;
  schoolName: string;
  school: PickedSchool | null;
  program: MedListProgramId;
  /** The school's own checkbox. A row with no school starts unticked until one is picked. */
  include: boolean;
}

/** Where the schools go: one of the member's lists, or a new list with a name the member types. */
export type ListImportTarget = { listId: string } | { newList: string };

/**
 * A matched row starts ticked, unless the target list already has that school and program (it would not be added, so a
 * tick would promise something that will not happen); an unmatched row starts unticked until a school is picked.
 */
export function toListEditable(
  preview: MedListImportPreviewRes,
  existing: ReadonlySet<string> = new Set(),
): ListEditRow[] {
  return preview.rows.map((r) => ({
    key: r.key,
    schoolName: r.schoolName,
    school: r.school,
    program: r.program,
    include: r.school !== null && !existing.has(`${r.school.slug}|${r.program}`),
  }));
}

/** `slug|program` of what a list already holds. */
export function listIndex(list: Pick<MedListDto, 'items'> | null | undefined): ReadonlySet<string> {
  return new Set((list?.items ?? []).map((i) => `${i.school.slug}|${i.program}`));
}

export type ListRowStatus = 'add' | 'there' | 'duplicate' | 'skip' | 'unmatched';

/**
 * Each row's fate, in order: unmatched (no school yet), there (the list already has that school and program, ticked
 * or not: it cannot be added, and its tick is disabled until the program changes), skip (unticked), duplicate (an
 * earlier ticked row is the same school and program), else add.
 */
export function rowStatuses(rows: readonly ListEditRow[], existing: ReadonlySet<string>): ListRowStatus[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r.school) return 'unmatched';
    const k = `${r.school.slug}|${r.program}`;
    if (existing.has(k)) return 'there';
    if (!r.include) return 'skip';
    if (seen.has(k)) return 'duplicate';
    seen.add(k);
    return 'add';
  });
}

export interface ListImportTotals {
  adding: number;
  there: number;
  /** Adding would take the list past what it holds (200 schools). */
  overCap: boolean;
}

export function summarizeList(
  rows: readonly ListEditRow[],
  existing: ReadonlySet<string>,
  existingCount: number,
): ListImportTotals {
  const statuses = rowStatuses(rows, existing);
  const adding = statuses.filter((s) => s === 'add').length;
  return {
    adding,
    there: statuses.filter((s) => s === 'there').length,
    overCap: existingCount + adding > LIMITS.itemsPerList,
  };
}

/** The save body: only the rows that will be added (an unticked, unmatched, present or repeated row is simply absent). */
export function listSaveBody(
  rows: readonly ListEditRow[],
  existing: ReadonlySet<string>,
  target: ListImportTarget,
): { target: ListImportTarget; items: { slug: string; program: MedListProgramId }[] } {
  const statuses = rowStatuses(rows, existing);
  const items = rows.flatMap((r, i) =>
    statuses[i] === 'add' && r.school ? [{ slug: r.school.slug, program: r.program }] : [],
  );
  return { target: 'newList' in target ? { newList: target.newList.trim() } : target, items };
}

/** A program value from a select, never anything else. */
export const asListProgram = (v: string): MedListProgramId => (v === 'REG' || v === 'PHD' ? v : 'ANY');

/** The member picked the school for a row (an unmatched one): it is ticked; its key stays, so the row keeps its place. */
export function pickSchool(rows: readonly ListEditRow[], key: string, school: PickedSchool): ListEditRow[] {
  return rows.map((r) => (r.key === key ? { ...r, school, include: true } : r));
}

/** A new list's name, as the server will clean it: required, at most 60 characters. */
export function newListNameProblem(name: string): 'empty' | 'long' | null {
  const clean = name.trim();
  if (!clean) return 'empty';
  return [...clean].length > LIMITS.listName ? 'long' : null;
}
