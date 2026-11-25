import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { listImportSaveBody } from './import-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { createList, importListItems, saveItem } from './lists.server';

const OLD = new Date('2026-01-01T00:00:00.000Z');
let f: ReturnType<typeof createFakePrisma>;

const school = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `school-${id}`,
  name: `School ${id}`,
  shortName: id.toUpperCase(),
  degree: 'MD',
  state: 'NC',
  active: true,
  ...over,
});
const items = (listId: string) => f.tables.medSchoolListItem.filter((i) => (i as { listId: string }).listId === listId);
const snapshot = () =>
  JSON.stringify(Object.entries(f.tables).filter(([, rows]) => Array.isArray(rows) && rows.length > 0));
const must = <T>(v: T | string | null): T => {
  if (v === null || typeof v === 'string') throw new Error(`expected a value, got ${String(v)}`);
  return v;
};

beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
  f.tables.user.push({ id: 'a', createdAt: OLD }, { id: 'b', createdAt: OLD });
  f.tables.medSchool.push(school('x'), school('y'), school('z'), school('off', { active: false }));
});

describe('importListItems (the list import save)', () => {
  it("another member's list, or a missing one, is null and nothing changes", async () => {
    const list = must(await createList('a', 'Mine'));
    const before = snapshot();
    expect(await importListItems('b', { listId: list.id }, [{ slug: 'school-x', program: 'ANY' }])).toBeNull();
    expect(await importListItems('a', { listId: 'nope' }, [{ slug: 'school-x', program: 'ANY' }])).toBeNull();
    expect(snapshot()).toBe(before);
  });

  it('adds into an existing list in the order given, after what is there; dedupes against the list and the body', async () => {
    const list = must(await createList('a', 'Mine'));
    must(await saveItem('a', { schoolSlug: 'school-x', listId: list.id }));
    const r = must(
      await importListItems('a', { listId: list.id }, [
        { slug: 'school-z', program: 'ANY' },
        { slug: 'school-x', program: 'ANY' }, // already there
        { slug: 'school-x', program: 'PHD' }, // a different program is a different row
        { slug: 'school-z', program: 'ANY' }, // twice in the body
        { slug: 'school-off', program: 'ANY' }, // inactive
        { slug: 'no-such-school', program: 'REG' },
      ]),
    );
    expect(r).toMatchObject({ added: 2, alreadyThere: 2, invalid: 2 });
    expect(r.list.items.map((i) => [i.school.slug, i.program, i.position])).toEqual([
      ['school-x', 'ANY', 0],
      ['school-z', 'ANY', 1],
      ['school-x', 'PHD', 2],
    ]);
    expect(JSON.stringify(r)).not.toContain('"userId"');
  });

  it('running the same import twice adds nothing the second time', async () => {
    const list = must(await createList('a', 'Mine'));
    const body = [
      { slug: 'school-x', program: 'ANY' as const },
      { slug: 'school-y', program: 'REG' as const },
    ];
    expect(must(await importListItems('a', { listId: list.id }, body))).toMatchObject({ added: 2, alreadyThere: 0 });
    expect(must(await importListItems('a', { listId: list.id }, body))).toMatchObject({ added: 0, alreadyThere: 2 });
    expect(items(list.id)).toHaveLength(2);
  });

  it('a new list is created with the cleaned name at the end, holding the schools', async () => {
    must(await createList('a', 'First'));
    const r = must(await importListItems('a', { newList: '  Reach schools  ' }, [{ slug: 'school-y', program: 'PHD' }]));
    expect(r.list).toMatchObject({ name: 'Reach schools', position: 1 });
    expect(r.list.items.map((i) => [i.school.slug, i.program])).toEqual([['school-y', 'PHD']]);
    expect(f.tables.medSchoolList).toHaveLength(2);
  });

  it('a 21st list is list-cap and writes nothing', async () => {
    for (let n = 0; n < 20; n++) must(await createList('a', `L${n}`));
    const before = snapshot();
    expect(await importListItems('a', { newList: 'One more' }, [{ slug: 'school-x', program: 'ANY' }])).toBe('list-cap');
    expect(snapshot()).toBe(before);
  });

  it('a whitespace-only new list name is bad-name', async () => {
    expect(await importListItems('a', { newList: '   ' }, [{ slug: 'school-x', program: 'ANY' }])).toBe('bad-name');
    expect(f.tables.medSchoolList).toHaveLength(0);
  });

  it('is all or nothing past the 200-school cap', async () => {
    const list = must(await createList('a', 'Big'));
    for (let n = 0; n < 199; n++) {
      f.tables.medSchool.push(school(`s${n}`));
      f.tables.medSchoolListItem.push({ id: `i${n}`, listId: list.id, schoolId: `s${n}`, program: 'ANY', position: n, note: null });
    }
    const before = snapshot();
    const over = await importListItems('a', { listId: list.id }, [
      { slug: 'school-x', program: 'ANY' },
      { slug: 'school-y', program: 'ANY' },
    ]);
    expect(over).toBe('cap');
    expect(snapshot()).toBe(before);
    // One fits; one already there does not count against the cap.
    const fits = must(
      await importListItems('a', { listId: list.id }, [
        { slug: 'school-s3', program: 'ANY' },
        { slug: 'school-x', program: 'ANY' },
      ]),
    );
    expect(fits).toMatchObject({ added: 1, alreadyThere: 1 });
    expect(items(list.id)).toHaveLength(200);
  });
});

describe('listImportSaveBody', () => {
  const good = { target: { listId: 'l1' }, items: [{ slug: 'school-x', program: 'ANY' }] };
  it('accepts a list id or a new list name, and items by slug and program', () => {
    expect(listImportSaveBody.safeParse(good).success).toBe(true);
    expect(listImportSaveBody.safeParse({ ...good, target: { newList: 'Reach' } }).success).toBe(true);
  });
  it('is strict and bounded: no user, no school id, no both targets, no empty or oversized items', () => {
    const bad: unknown[] = [
      { ...good, userId: 'b' },
      { ...good, target: { listId: 'l1', newList: 'x' } },
      { ...good, target: { newList: '   ' } },
      { ...good, target: {} },
      { ...good, items: [] },
      { ...good, items: [{ slug: 'school-x', program: 'ANY', schoolId: 's1' }] },
      { ...good, items: [{ slug: 'Not A Slug!', program: 'ANY' }] },
      { ...good, items: [{ slug: 'school-x', program: 'MDPHD' }] },
      { ...good, items: Array.from({ length: 201 }, (_, i) => ({ slug: `s-${i}`, program: 'ANY' })) },
    ];
    for (const b of bad) expect(listImportSaveBody.safeParse(b).success, JSON.stringify(b).slice(0, 80)).toBe(false);
  });
});
