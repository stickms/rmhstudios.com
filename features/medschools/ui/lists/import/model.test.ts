import { describe, expect, it } from 'vitest';
import type { MedListDto, MedListImportPreviewRes } from '../../../medschools.contract';
import {
  asListProgram,
  listIndex,
  listSaveBody,
  newListNameProblem,
  pickSchool,
  rowStatuses,
  summarizeList,
  toListEditable,
} from './model';

const school = (slug: string) => ({
  slug,
  name: `${slug} School`,
  shortName: slug,
  degree: 'MD' as const,
  state: 'NC',
});
const preview: MedListImportPreviewRes = {
  truncated: false,
  dropped: 0,
  tier: 'free',
  remainingToday: 1,
  dailyCap: 5,
  rows: [
    { key: 'duke|ANY', schoolName: 'Duke', school: school('duke'), program: 'ANY' },
    { key: 'ucsf|PHD', schoolName: 'UCSF', school: school('ucsf'), program: 'PHD' },
    { key: '?unrecognised-2|ANY', schoolName: 'Touro', school: null, program: 'ANY' },
  ],
};
const list = (items: { slug: string; program: 'ANY' | 'REG' | 'PHD' }[]): Pick<MedListDto, 'items'> => ({
  items: items.map((i, n) => ({
    id: `i${n}`,
    school: { ...school(i.slug), active: true },
    program: i.program,
    note: null,
    position: n,
  })),
});

describe('list import model', () => {
  it('a matched row starts ticked, an unmatched one unticked', () => {
    expect(toListEditable(preview).map((r) => r.include)).toEqual([true, true, false]);
  });

  it('statuses: add, already on the list (same program only), unmatched, unticked, named twice', () => {
    const rows = toListEditable(preview);
    const existing = listIndex(
      list([
        { slug: 'duke', program: 'ANY' },
        { slug: 'ucsf', program: 'REG' },
      ]),
    );
    expect(rowStatuses(rows, existing)).toEqual(['there', 'add', 'unmatched']);
    const picked = pickSchool(rows, '?unrecognised-2|ANY', school('ucsf'));
    expect(picked[2]).toMatchObject({ include: true, school: { slug: 'ucsf' } });
    // The picked row is ucsf|ANY, not the ucsf|PHD row: both are added.
    expect(rowStatuses(picked, existing)).toEqual(['there', 'add', 'add']);
    const twice = picked.map((r, i) => (i === 2 ? { ...r, program: 'PHD' as const } : r));
    expect(rowStatuses(twice, existing)).toEqual(['there', 'add', 'duplicate']);
    const unticked = twice.map((r, i) => (i === 1 ? { ...r, include: false } : r));
    expect(rowStatuses(unticked, existing)).toEqual(['there', 'skip', 'add']);
  });

  it('a row already on the list starts unticked and stays "there"; a program that makes it addable lets it be ticked', () => {
    const existing = listIndex(list([{ slug: 'duke', program: 'ANY' }]));
    const rows = toListEditable(preview, existing);
    expect(rows.map((r) => r.include)).toEqual([false, true, false]);
    expect(rowStatuses(rows, existing)[0]).toBe('there');
    // A tick that somehow arrived on a "there" row still adds nothing.
    expect(
      rowStatuses(
        rows.map((r, i) => (i === 0 ? { ...r, include: true } : r)),
        existing,
      )[0],
    ).toBe('there');
    const otherProgram = rows.map((r, i) => (i === 0 ? { ...r, program: 'PHD' as const } : r));
    expect(rowStatuses(otherProgram, existing)[0]).toBe('skip');
    const ticked = otherProgram.map((r, i) => (i === 0 ? { ...r, include: true } : r));
    expect(rowStatuses(ticked, existing)[0]).toBe('add');
    expect(listSaveBody(ticked, existing, { listId: 'l1' }).items[0]).toEqual({ slug: 'duke', program: 'PHD' });
  });

  it('the save body carries only the rows that will be added, and a trimmed new list name', () => {
    const rows = pickSchool(toListEditable(preview), '?unrecognised-2|ANY', school('emory'));
    const existing = listIndex(list([{ slug: 'duke', program: 'ANY' }]));
    expect(listSaveBody(rows, existing, { listId: 'l1' })).toEqual({
      target: { listId: 'l1' },
      items: [
        { slug: 'ucsf', program: 'PHD' },
        { slug: 'emory', program: 'ANY' },
      ],
    });
    expect(listSaveBody(rows, new Set(), { newList: '  Reach  ' }).target).toEqual({ newList: 'Reach' });
    expect(listSaveBody(rows, new Set(), { newList: 'x' }).items).toHaveLength(3);
  });

  it('totals count what is added and flag a list that would pass 200', () => {
    const rows = toListEditable(preview);
    expect(summarizeList(rows, new Set(), 0)).toEqual({ adding: 2, there: 0, overCap: false });
    expect(summarizeList(rows, new Set(), 198)).toMatchObject({ adding: 2, overCap: false });
    expect(summarizeList(rows, new Set(), 199)).toMatchObject({ adding: 2, overCap: true });
  });

  it('a program from a select is one of the three, and a new list name is required and at most 60', () => {
    expect(['ANY', 'REG', 'PHD', 'MDPHD', ''].map(asListProgram)).toEqual(['ANY', 'REG', 'PHD', 'ANY', 'ANY']);
    expect(newListNameProblem('  ')).toBe('empty');
    expect(newListNameProblem('x'.repeat(61))).toBe('long');
    expect(newListNameProblem(` ${'x'.repeat(60)} `)).toBeNull();
  });
});
