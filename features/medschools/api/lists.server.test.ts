import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import {
  addListToTrackerBody,
  createListBody,
  patchListItemBody,
  putListOrderBody,
  saveListItemBody,
} from './me-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import {
  addListToTracker,
  createList,
  deleteItem,
  deleteList,
  listLists,
  patchItem,
  renameList,
  reorderItems,
  reorderLists,
  saveItem,
} from './lists.server';
import { putPrefs } from './prefs.server';

const NOW = new Date('2026-11-20T12:00:00.000Z');
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
/** Rows only: reading an empty table must not count as a change. */
const snapshot = () =>
  JSON.stringify(Object.entries(f.tables).filter(([, rows]) => Array.isArray(rows) && rows.length > 0));
const must = <T>(v: T | string | null): T => {
  if (v === null || typeof v === 'string') throw new Error(`expected a value, got ${String(v)}`);
  return v;
};

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = 'unit-test-secret-0123456789';
  f = createFakePrisma();
  fake.current = f;
  f.tables.user.push({ id: 'a', createdAt: OLD }, { id: 'b', createdAt: OLD });
  f.tables.medSchool.push(school('x'), school('y'), school('z'), school('off', { active: false }));
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
});

describe('scoping (another user is the same answer as missing)', () => {
  it('answers null/false for user B and mutates nothing', async () => {
    const list = must(await createList('a', 'Mine'));
    const saved = must(await saveItem('a', { schoolSlug: 'school-x', listId: list.id }));
    const itemId = saved.items[0]!.id;
    const before = snapshot();
    expect(await renameList('b', list.id, 'Stolen')).toBeNull();
    expect(await deleteList('b', list.id)).toBe(false);
    expect(await saveItem('b', { schoolSlug: 'school-y', listId: list.id })).toBeNull();
    expect(await patchItem('b', list.id, itemId, { note: 'x' })).toBeNull();
    expect(await deleteItem('b', list.id, itemId)).toBeNull();
    expect(await reorderItems('b', list.id, [itemId])).toBeNull();
    expect(await addListToTracker('b', list.id, 2027, NOW)).toBeNull();
    expect(await reorderLists('b', [list.id])).toBe('stale');
    expect(snapshot()).toBe(before);
    expect(await listLists('b')).toEqual([]);
  });

  it('a list item id under the wrong list is missing', async () => {
    const l1 = must(await createList('a', 'One'));
    const l2 = must(await createList('a', 'Two'));
    const saved = must(await saveItem('a', { schoolSlug: 'school-x', listId: l1.id }));
    expect(await deleteItem('a', l2.id, saved.items[0]!.id)).toBeNull();
    expect(items(l1.id)).toHaveLength(1);
  });

  it('a DTO carries no user id', async () => {
    must(await saveItem('a', { schoolSlug: 'school-x' }));
    expect(JSON.stringify(await listLists('a'))).not.toMatch(/"userId"|"schoolId"|"listId"/);
  });
});

describe('caps and concurrency', () => {
  it('the 21st list is refused', async () => {
    for (let n = 0; n < 20; n++) must(await createList('a', `L${n}`));
    expect(await createList('a', 'one too many')).toBe('cap');
    expect(f.tables.medSchoolList).toHaveLength(20);
    expect(await createList('b', 'fine')).toMatchObject({ name: 'fine' });
  });

  it('the 201st item is refused', async () => {
    const list = must(await createList('a', 'Big'));
    for (let n = 0; n < 200; n++) {
      f.tables.medSchool.push(school(`s${n}`));
      f.tables.medSchoolListItem.push({
        id: `i${n}`,
        listId: list.id,
        schoolId: `s${n}`,
        program: 'ANY',
        position: n,
        note: null,
      });
    }
    expect(await saveItem('a', { schoolSlug: 'school-x', listId: list.id })).toBe('cap');
    expect(items(list.id)).toHaveLength(200);
  });

  it('two simultaneous saves that each see 199 items end with 200, not 201', async () => {
    let n = 0;
    const jitter = async () => {
      if (++n % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    };
    f = createFakePrisma({ jitter });
    fake.current = f;
    f.tables.user.push({ id: 'a', createdAt: OLD });
    f.tables.medSchool.push(school('x'), school('y'));
    const list = must(await createList('a', 'Big'));
    for (let k = 0; k < 199; k++) {
      f.tables.medSchool.push(school(`s${k}`));
      f.tables.medSchoolListItem.push({
        id: `i${k}`,
        listId: list.id,
        schoolId: `s${k}`,
        program: 'ANY',
        position: k,
        note: null,
      });
    }
    const [r1, r2] = await Promise.all([
      saveItem('a', { schoolSlug: 'school-x', listId: list.id }),
      saveItem('a', { schoolSlug: 'school-y', listId: list.id }),
    ]);
    expect([r1, r2].filter((r) => r === 'cap')).toHaveLength(1);
    expect(items(list.id)).toHaveLength(200);
  });

  it('two simultaneous first saves create one "My schools"', async () => {
    let n = 0;
    f = createFakePrisma({
      jitter: async () => {
        if (++n % 2 === 0) await new Promise((r) => setTimeout(r, 0));
      },
    });
    fake.current = f;
    f.tables.user.push({ id: 'a', createdAt: OLD });
    f.tables.medSchool.push(school('x'), school('y'));
    await Promise.all([
      saveItem('a', { schoolSlug: 'school-x', newListName: 'My schools' }),
      saveItem('a', { schoolSlug: 'school-y', newListName: 'My schools' }),
      saveItem('a', { schoolSlug: 'school-y' }),
    ]);
    expect(f.tables.medSchoolList).toHaveLength(1);
    expect(f.tables.medSchoolListItem).toHaveLength(2);
  });
});

describe('saving', () => {
  it('creates "My schools" on first use, then reuses the first list', async () => {
    const first = must(await saveItem('a', { schoolSlug: 'school-x' }));
    expect(first.name).toBe('My schools');
    const second = must(await saveItem('a', { schoolSlug: 'school-y' }));
    expect(second.id).toBe(first.id);
    expect(second.items.map((i) => i.school.slug)).toEqual(['school-x', 'school-y']);
  });

  it('uses the given default name, cleaned', async () => {
    expect(must(await saveItem('a', { schoolSlug: 'school-x', newListName: '  Mis escuelas \u0000 ' })).name).toBe(
      'Mis escuelas',
    );
    expect(await saveItem('a', { schoolSlug: 'school-x', newListName: ' \u0000 ' })).toBe('bad-name');
  });

  it('saving the same (list, school, program) twice leaves one row; ANY and PHD coexist', async () => {
    const list = must(await createList('a', 'L'));
    await saveItem('a', { schoolSlug: 'school-x', listId: list.id });
    const again = must(await saveItem('a', { schoolSlug: 'school-x', listId: list.id }));
    expect(again.items).toHaveLength(1);
    expect(must(await saveItem('a', { schoolSlug: 'school-x', program: 'PHD', listId: list.id })).items).toHaveLength(
      2,
    );
    expect(items(list.id)).toHaveLength(2);
  });

  it('cannot save an inactive school but keeps one already on a list; a missing list is null', async () => {
    expect(await saveItem('a', { schoolSlug: 'school-off' })).toBe('school-missing');
    expect(await saveItem('a', { schoolSlug: 'nope' })).toBe('school-missing');
    const list = must(await createList('a', 'L'));
    f.tables.medSchoolListItem.push({
      id: 'i',
      listId: list.id,
      schoolId: 'off',
      program: 'ANY',
      position: 0,
      note: null,
    });
    const dto = (await listLists('a'))[0]!;
    expect(dto.items[0]).toMatchObject({ school: { slug: 'school-off', active: false } });
    expect(await saveItem('a', { schoolSlug: 'school-x', listId: 'nope' })).toBeNull();
  });

  it('a 21st list through newListName is list-cap', async () => {
    for (let n = 0; n < 20; n++) must(await createList('a', `L${n}`));
    expect(await saveItem('a', { schoolSlug: 'school-x', newListName: 'new' })).toBe('list-cap');
  });
});

describe('names and notes', () => {
  it('limits in code points, rejects whitespace, strips NUL, returns markup verbatim', async () => {
    expect(await createList('a', '   ')).toBe('bad-name');
    expect(await createList('a', 'x'.repeat(61))).toBe('bad-name');
    expect(must(await createList('a', 'x'.repeat(60))).name).toHaveLength(60);
    expect(must(await createList('a', `${'́'.repeat(59)}e`)).name).toHaveLength(60);
    expect(must(await createList('a', 'a\u0000b')).name).toBe('ab');
    expect(must(await createList('a', '<b>hi</b>')).name).toBe('<b>hi</b>');
  });

  it('a note is cleaned and null clears it; an over-long note is rejected by the schema', async () => {
    const list = must(await createList('a', 'L'));
    const id = must(await saveItem('a', { schoolSlug: 'school-x', listId: list.id })).items[0]!.id;
    expect(must(await patchItem('a', list.id, id, { note: ' hello\u0000 ' })).items[0]!.note).toBe('hello');
    expect(must(await patchItem('a', list.id, id, { note: null })).items[0]!.note).toBeNull();
    expect(patchListItemBody.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
    expect(patchListItemBody.safeParse({}).success).toBe(false);
  });

  it('changing an item program onto an existing row is a duplicate', async () => {
    const list = must(await createList('a', 'L'));
    const a = must(await saveItem('a', { schoolSlug: 'school-x', listId: list.id }));
    must(await saveItem('a', { schoolSlug: 'school-x', program: 'PHD', listId: list.id }));
    expect(await patchItem('a', list.id, a.items[0]!.id, { program: 'PHD' })).toBe('duplicate');
    expect(
      must(await patchItem('a', list.id, a.items[0]!.id, { program: 'REG' }))
        .items.map((i) => i.program)
        .sort(),
    ).toEqual(['PHD', 'REG']);
  });
});

describe('reorder and delete', () => {
  it('renumbers densely in one go and reads back in the new order', async () => {
    const a = must(await createList('a', 'A'));
    const b = must(await createList('a', 'B'));
    const c = must(await createList('a', 'C'));
    const r = await reorderLists('a', [c.id, a.id, b.id]);
    expect((r as { id: string; position: number }[]).map((l) => [l.id, l.position])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
    expect((await listLists('a')).map((l) => l.name)).toEqual(['C', 'A', 'B']);
  });

  it('a stale, foreign, short or duplicated id set is stale and changes nothing', async () => {
    const a = must(await createList('a', 'A'));
    const b = must(await createList('a', 'B'));
    const other = must(await createList('b', 'Other'));
    const before = snapshot();
    for (const ids of [[a.id], [a.id, other.id], [a.id, a.id], [a.id, b.id, 'extra'], []]) {
      expect(await reorderLists('a', ids)).toBe('stale');
    }
    expect(snapshot()).toBe(before);
  });

  it('reorders items and refuses a stale item set', async () => {
    const list = must(await createList('a', 'L'));
    await saveItem('a', { schoolSlug: 'school-x', listId: list.id });
    await saveItem('a', { schoolSlug: 'school-y', listId: list.id });
    const [i1, i2] = (await listLists('a'))[0]!.items;
    expect(await reorderItems('a', list.id, [i1!.id])).toBe('stale');
    const r = must(await reorderItems('a', list.id, [i2!.id, i1!.id]));
    expect(r.items.map((i) => i.id)).toEqual([i2!.id, i1!.id]);
  });

  it('positions are dense after a delete and a list delete cascades its items', async () => {
    const a = must(await createList('a', 'A'));
    const b = must(await createList('a', 'B'));
    const c = must(await createList('a', 'C'));
    await saveItem('a', { schoolSlug: 'school-x', listId: b.id });
    expect(await deleteList('a', a.id)).toBe(true);
    expect((await listLists('a')).map((l) => [l.name, l.position])).toEqual([
      ['B', 0],
      ['C', 1],
    ]);
    expect(await deleteList('a', b.id)).toBe(true);
    expect(f.tables.medSchoolListItem).toHaveLength(0);
    expect((await listLists('a'))[0]).toMatchObject({ id: c.id, position: 0 });
    for (const s of ['x', 'y', 'z']) await saveItem('a', { schoolSlug: `school-${s}`, listId: c.id });
    const mid = (await listLists('a'))[0]!.items[1]!.id;
    const after = must(await deleteItem('a', c.id, mid));
    expect(after.items.map((i) => i.position)).toEqual([0, 1]);
  });
});

describe('add to tracker', () => {
  const apps = () => f.tables.medTrackerApplication as { schoolId: string; program: string; cycleId: string }[];
  const cycles = () =>
    f.tables.medTrackerCycle as {
      id: string;
      userId: string;
      cycleYear: number;
      shareAnonymously: boolean;
      homeState: string | null;
    }[];

  async function listOf(...rows: [string, 'ANY' | 'REG' | 'PHD'][]) {
    const list = must(await createList('a', 'L'));
    for (const [s, p] of rows) must(await saveItem('a', { schoolSlug: `school-${s}`, program: p, listId: list.id }));
    return list;
  }

  it('creates the cycle with sharing off and the preferred home state; ANY becomes REG', async () => {
    await putPrefs('a', { programFilter: 'ALL', degree: null, homeState: 'nc', chartCategories: [] });
    const list = await listOf(['x', 'ANY'], ['y', 'PHD']);
    expect(await addListToTracker('a', list.id, 2027, NOW)).toEqual({ cycleYear: 2027, added: 2, skipped: 0 });
    expect(cycles()).toEqual([
      expect.objectContaining({ userId: 'a', cycleYear: 2027, shareAnonymously: false, homeState: 'NC' }),
    ]);
    expect(
      apps()
        .map((a) => [a.schoolId, a.program])
        .sort(),
    ).toEqual([
      ['x', 'REG'],
      ['y', 'PHD'],
    ]);
  });

  it('defaults to the current cycle', async () => {
    const list = await listOf(['x', 'ANY']);
    expect((await addListToTracker('a', list.id, undefined, NOW)) as { cycleYear: number }).toMatchObject({
      cycleYear: 2027,
    });
  });

  it('running it twice adds nothing the second time and leaves an existing cycle (and its sharing flag) alone', async () => {
    const list = await listOf(['x', 'ANY'], ['y', 'ANY'], ['x', 'REG']);
    f.tables.medTrackerCycle.push({ id: 'c1', userId: 'a', cycleYear: 2027, shareAnonymously: true, homeState: 'TX' });
    expect(await addListToTracker('a', list.id, 2027, NOW)).toEqual({ cycleYear: 2027, added: 2, skipped: 0 });
    expect(await addListToTracker('a', list.id, 2027, NOW)).toEqual({ cycleYear: 2027, added: 0, skipped: 2 });
    expect(cycles()).toEqual([expect.objectContaining({ id: 'c1', shareAnonymously: true, homeState: 'TX' })]);
    expect(apps()).toHaveLength(2);
  });

  it('is all or nothing past the 60-application cap, writing no cycle either', async () => {
    const list = must(await createList('a', 'L'));
    for (let n = 0; n < 61; n++) {
      f.tables.medSchool.push(school(`m${n}`));
      f.tables.medSchoolListItem.push({
        id: `i${n}`,
        listId: list.id,
        schoolId: `m${n}`,
        program: 'ANY',
        position: n,
        note: null,
      });
    }
    const before = snapshot();
    expect(await addListToTracker('a', list.id, 2027, NOW)).toEqual({ cap: { existing: 0, adding: 61 } });
    expect(snapshot()).toBe(before);

    f.tables.medTrackerCycle.push({ id: 'c1', userId: 'a', cycleYear: 2027, shareAnonymously: false, homeState: null });
    for (let n = 0; n < 40; n++)
      f.tables.medTrackerApplication.push({ id: `p${n}`, cycleId: 'c1', schoolId: `m${n}`, program: 'REG' });
    const before2 = snapshot();
    expect(await addListToTracker('a', list.id, 2027, NOW)).toEqual({ cap: { existing: 40, adding: 21 } });
    expect(snapshot()).toBe(before2);
  });

  it('keeps list and tracker independent in both directions, and adds an inactive school', async () => {
    const list = await listOf(['x', 'ANY']);
    f.tables.medSchoolListItem.push({
      id: 'iOff',
      listId: list.id,
      schoolId: 'off',
      program: 'ANY',
      position: 1,
      note: null,
    });
    const listRows = () => JSON.stringify([f.tables.medSchoolList, f.tables.medSchoolListItem]);
    const listBefore = listRows();
    expect(await addListToTracker('a', list.id, 2027, NOW)).toMatchObject({ added: 2 });
    expect(listRows()).toBe(listBefore);
    const itemId = (await listLists('a'))[0]!.items[0]!.id;
    await deleteItem('a', list.id, itemId);
    expect(apps()).toHaveLength(2);
    f.tables.medTrackerApplication.splice(0, 1);
    expect(await listLists('a')).toHaveLength(1);
    expect(items(list.id)).toHaveLength(1);
  });

  it('an out-of-window cycle year is null', async () => {
    const list = await listOf(['x', 'ANY']);
    expect(await addListToTracker('a', list.id, 2062, NOW)).toBeNull();
  });
});

describe('bodies', () => {
  it('are strict and bounded', () => {
    expect(createListBody.safeParse({ name: 'ok' }).success).toBe(true);
    expect(createListBody.safeParse({ name: 'ok', userId: 'u2' }).success).toBe(false);
    expect(createListBody.safeParse({ name: '  ' }).success).toBe(false);
    expect(putListOrderBody.safeParse({ ids: Array.from({ length: 201 }, (_, n) => String(n)) }).success).toBe(false);
    expect(putListOrderBody.safeParse({ ids: [1] }).success).toBe(false);
    expect(saveListItemBody.safeParse({ schoolSlug: '../x' }).success).toBe(false);
    expect(saveListItemBody.safeParse({ schoolSlug: 'duke', program: 'DO' }).success).toBe(false);
    expect(saveListItemBody.safeParse({ schoolSlug: 'duke', listId: 'a', newListName: 'b' }).success).toBe(false);
    expect(saveListItemBody.safeParse({ schoolSlug: 'duke', program: 'ANY', listId: 'a' }).success).toBe(true);
    expect(addListToTrackerBody.safeParse({ cycleYear: '2027' }).success).toBe(false);
    expect(addListToTrackerBody.safeParse({}).success).toBe(true);
  });
});
