/**
 * Saved school lists (phase 4, Task 7). Every function takes `userId` first and reaches a list only through a row that
 * carries it, so another user's list is the same answer as a missing one (`null` / `false`): no existence oracle.
 *
 * Caps (20 lists, 200 items per list) and the "one default list" rule are enforced inside a transaction under the
 * per-user advisory lock `med-lists:<user>`, with the counts re-read after the lock, so two tabs cannot both take the
 * last slot or both create "My schools". Reads are flat (lists, then items, then schools), never a nested relation
 * filter: the in-memory test fake cannot evaluate those, and a flat read cannot silently match everything.
 *
 * "Add this list to my tracker" is the one place a list touches the tracker, and it never reads a list row it then
 * changes: the tracker rows are created through `share-sync.server.ts` (`withShared` and its row writers), the list is
 * left exactly as it was, and nothing links the two afterwards (D12).
 */
import { prisma } from '@/lib/prisma.server';
import type { MedListDto, MedListItemDto, MedListProgramId, TrackerSchoolDto } from '../medschools.contract';
import { cycleYearOf } from '../engine/cycle';
import { LIMITS, cleanText, cycleYearProblem, reorderIds } from '../engine/tracker';
import { getPrefs } from './prefs.server';
import { createApplicationRow, upsertCycleRow, withShared, type Tx } from './share-sync.server';

const DEFAULT_LIST_NAME = 'My schools';

async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const listLock = (tx: Tx, userId: string) => lock(tx, `med-lists:${userId}`);

type Db = Pick<Tx, 'medSchoolList' | 'medSchoolListItem' | 'medSchool'>;

const byPosition = <T extends { position: number; id: string }>(a: T, b: T): number =>
  a.position - b.position || (a.id < b.id ? -1 : 1);

async function toDtos(db: Db, lists: readonly { id: string; name: string; position: number }[]): Promise<MedListDto[]> {
  if (lists.length === 0) return [];
  const items = await db.medSchoolListItem.findMany({
    where: { listId: { in: lists.map((l) => l.id) } },
    select: { id: true, listId: true, schoolId: true, program: true, note: true, position: true },
  });
  const schools = await db.medSchool.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.schoolId))] } },
    select: { id: true, slug: true, name: true, shortName: true, degree: true, state: true, active: true },
  });
  const schoolBy = new Map<string, TrackerSchoolDto>(
    schools.map((s) => [
      s.id,
      { slug: s.slug, name: s.name, shortName: s.shortName, degree: s.degree, state: s.state, active: s.active },
    ]),
  );
  return [...lists].sort(byPosition).map((l) => ({
    id: l.id,
    name: l.name,
    position: l.position,
    items: items
      .filter((i) => i.listId === l.id)
      .sort(byPosition)
      .flatMap((i): MedListItemDto[] => {
        const school = schoolBy.get(i.schoolId);
        // A deactivated school stays on the list (its row is still there); only a vanished one has nothing to show.
        return school
          ? [{ id: i.id, school, program: i.program as MedListProgramId, note: i.note, position: i.position }]
          : [];
      }),
  }));
}

const listRows = (db: Db, userId: string) =>
  db.medSchoolList.findMany({ where: { userId }, select: { id: true, name: true, position: true } });

/** The user's lists in order, at most 20 with 200 items each. */
export async function listLists(userId: string): Promise<MedListDto[]> {
  return toDtos(prisma, await listRows(prisma, userId));
}

async function oneList(db: Db, userId: string, id: string): Promise<MedListDto | null> {
  const row = await db.medSchoolList.findFirst({
    where: { id, userId },
    select: { id: true, name: true, position: true },
  });
  return row ? ((await toDtos(db, [row]))[0] ?? null) : null;
}

/** Dense positions 0..n-1 in the given id order. */
async function renumber(
  ids: readonly string[],
  set: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  for (const [position, id] of ids.entries()) await set(id, position);
}

export async function createList(userId: string, name: string): Promise<MedListDto | 'cap' | 'bad-name'> {
  const clean = cleanText(name, LIMITS.listName);
  if (!clean) return 'bad-name';
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    const have = await listRows(tx, userId);
    if (have.length >= LIMITS.lists) return 'cap' as const;
    const row = await tx.medSchoolList.create({
      data: { userId, name: clean, position: have.length },
      select: { id: true, name: true, position: true },
    });
    return (await toDtos(tx, [row]))[0] as MedListDto;
  });
}

export async function renameList(userId: string, id: string, name: string): Promise<MedListDto | null | 'bad-name'> {
  const clean = cleanText(name, LIMITS.listName);
  if (!clean) return 'bad-name';
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    if (!(await tx.medSchoolList.findFirst({ where: { id, userId }, select: { id: true } }))) return null;
    await tx.medSchoolList.update({ where: { id }, data: { name: clean } });
    return oneList(tx, userId, id);
  });
}

export async function deleteList(userId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    if (!(await tx.medSchoolList.findFirst({ where: { id, userId }, select: { id: true } }))) return false;
    await tx.medSchoolList.deleteMany({ where: { id, userId } });
    const rest = (await listRows(tx, userId)).sort(byPosition);
    await renumber(
      rest.map((l) => l.id),
      (id, position) => tx.medSchoolList.update({ where: { id }, data: { position } }),
    );
    return true;
  });
}

/** `'stale'` when the ids are not exactly the stored set (another tab added or removed one): the client refetches. */
export async function reorderLists(userId: string, ids: readonly string[]): Promise<MedListDto[] | 'stale'> {
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    const stored = (await listRows(tx, userId)).sort(byPosition).map((l) => l.id);
    const next = reorderIds(stored, ids);
    if (!next) return 'stale' as const;
    await renumber(next, (id, position) => tx.medSchoolList.update({ where: { id }, data: { position } }));
    return toDtos(tx, await listRows(tx, userId));
  });
}

type SaveInput = {
  schoolSlug: string;
  program?: MedListProgramId | undefined;
  listId?: string | undefined;
  newListName?: string | undefined;
};
export type SaveResult = MedListDto | null | 'cap' | 'list-cap' | 'school-missing' | 'bad-name';

/**
 * Save a school to a list. Which list: `listId` (null when it is not the caller's), else `newListName` (an existing
 * list of that exact name is reused, so two tabs saving into a brand new "My schools" make one), else the first list,
 * else a new "My schools". Saving a school already on the list is a success that changes nothing. An inactive school
 * cannot be newly saved (it can stay on a list it is already on).
 */
export async function saveItem(userId: string, i: SaveInput): Promise<SaveResult> {
  const named = i.newListName === undefined ? undefined : cleanText(i.newListName, LIMITS.listName);
  if (i.newListName !== undefined && !named) return 'bad-name';
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    const school = await tx.medSchool.findUnique({ where: { slug: i.schoolSlug }, select: { id: true, active: true } });
    if (!school?.active) return 'school-missing' as const;
    const lists = (await listRows(tx, userId)).sort(byPosition);

    let listId: string;
    if (i.listId !== undefined) {
      if (!lists.some((l) => l.id === i.listId)) return null;
      listId = i.listId;
    } else {
      const wanted = named ?? (lists[0] ? undefined : DEFAULT_LIST_NAME);
      const found = wanted === undefined ? lists[0] : lists.find((l) => l.name === wanted);
      if (found) listId = found.id;
      else {
        if (lists.length >= LIMITS.lists) return 'list-cap' as const;
        listId = (
          await tx.medSchoolList.create({
            data: { userId, name: wanted ?? DEFAULT_LIST_NAME, position: lists.length },
            select: { id: true },
          })
        ).id;
      }
    }

    const program: MedListProgramId = i.program ?? 'ANY';
    const here = await tx.medSchoolListItem.findMany({
      where: { listId },
      select: { id: true, schoolId: true, program: true },
    });
    const already = here.some((h) => h.schoolId === school.id && h.program === program);
    if (!already) {
      if (here.length >= LIMITS.itemsPerList) return 'cap' as const;
      await tx.medSchoolListItem.create({ data: { listId, schoolId: school.id, program, position: here.length } });
    }
    return oneList(tx, userId, listId);
  });
}

/** `'duplicate'` when changing the program would collide with another row for the same school. */
export async function patchItem(
  userId: string,
  listId: string,
  itemId: string,
  i: { note?: string | null | undefined; program?: MedListProgramId | undefined },
): Promise<MedListDto | null | 'duplicate'> {
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    if (!(await tx.medSchoolList.findFirst({ where: { id: listId, userId }, select: { id: true } }))) return null;
    const item = await tx.medSchoolListItem.findFirst({
      where: { id: itemId, listId },
      select: { id: true, schoolId: true, program: true },
    });
    if (!item) return null;
    const data: { note?: string | null; program?: MedListProgramId } = {};
    if (i.note !== undefined) data.note = i.note === null ? null : cleanText(i.note, LIMITS.note);
    if (i.program !== undefined && i.program !== item.program) {
      const clash = await tx.medSchoolListItem.findFirst({
        where: { listId, schoolId: item.schoolId, program: i.program },
        select: { id: true },
      });
      if (clash) return 'duplicate' as const;
      data.program = i.program;
    }
    await tx.medSchoolListItem.update({ where: { id: itemId }, data });
    return oneList(tx, userId, listId);
  });
}

export async function deleteItem(userId: string, listId: string, itemId: string): Promise<MedListDto | null> {
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    if (!(await tx.medSchoolList.findFirst({ where: { id: listId, userId }, select: { id: true } }))) return null;
    if (!(await tx.medSchoolListItem.findFirst({ where: { id: itemId, listId }, select: { id: true } }))) return null;
    await tx.medSchoolListItem.deleteMany({ where: { id: itemId, listId } });
    const rest = (
      await tx.medSchoolListItem.findMany({ where: { listId }, select: { id: true, position: true } })
    ).sort(byPosition);
    await renumber(
      rest.map((r) => r.id),
      (id, position) => tx.medSchoolListItem.update({ where: { id }, data: { position } }),
    );
    return oneList(tx, userId, listId);
  });
}

export async function reorderItems(
  userId: string,
  listId: string,
  ids: readonly string[],
): Promise<MedListDto | null | 'stale'> {
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    if (!(await tx.medSchoolList.findFirst({ where: { id: listId, userId }, select: { id: true } }))) return null;
    const stored = (await tx.medSchoolListItem.findMany({ where: { listId }, select: { id: true, position: true } }))
      .sort(byPosition)
      .map((r) => r.id);
    const next = reorderIds(stored, ids);
    if (!next) return 'stale' as const;
    await renumber(next, (id, position) => tx.medSchoolListItem.update({ where: { id }, data: { position } }));
    return oneList(tx, userId, listId);
  });
}

/**
 * Copy a list's schools into a tracker cycle (D12, rulings Q5 and Q11). The cycle is the current one unless given, and
 * is created with sharing OFF and the home state from the preferences; an existing cycle is left as it is. An item with
 * no program (`ANY`) becomes `REG`; `PHD` is always an explicit choice. A school already in the cycle with that program
 * is skipped, so running it twice adds nothing the second time. All or nothing: over the 60-application cap nothing is
 * written, not even the cycle. Inactive schools are added like any other.
 */
export async function addListToTracker(
  userId: string,
  listId: string,
  cycleYear?: number,
  now: Date = new Date(),
): Promise<
  { cycleYear: number; added: number; skipped: number } | null | { cap: { existing: number; adding: number } }
> {
  const year = cycleYear ?? cycleYearOf(now, 'SECONDARY');
  if (cycleYearProblem(year, now)) return null;
  if (!(await prisma.medSchoolList.findFirst({ where: { id: listId, userId }, select: { id: true } }))) return null;
  const items = await prisma.medSchoolListItem.findMany({
    where: { listId },
    select: { schoolId: true, program: true, position: true, id: true },
  });
  const wanted = new Map<string, { schoolId: string; program: 'REG' | 'PHD' }>();
  for (const it of [...items].sort(byPosition)) {
    const program = it.program === 'PHD' ? 'PHD' : 'REG';
    wanted.set(`${it.schoolId}|${program}`, { schoolId: it.schoolId, program });
  }
  const homeState = (await getPrefs(userId)).homeState;

  const outcome = await withShared(userId, { cycleYear: year }, async (tx) => {
    const cycle = await tx.medTrackerCycle.findFirst({ where: { userId, cycleYear: year }, select: { id: true } });
    const existing = cycle
      ? await tx.medTrackerApplication.findMany({
          where: { cycleId: cycle.id },
          select: { schoolId: true, program: true },
        })
      : [];
    const have = new Set(existing.map((a) => `${a.schoolId}|${a.program}`));
    const toAdd = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
    if (existing.length + toAdd.length > LIMITS.applicationsPerCycle) {
      return { cap: { existing: existing.length, adding: toAdd.length } };
    }
    let cycleId = cycle?.id;
    if (!cycleId) {
      await upsertCycleRow(tx, userId, year, { shareAnonymously: false, homeState });
      cycleId = (await tx.medTrackerCycle.findFirst({ where: { userId, cycleYear: year }, select: { id: true } }))?.id;
      if (!cycleId) throw new Error('cycle was not created');
    }
    for (const a of toAdd) await createApplicationRow(tx, { cycleId, schoolId: a.schoolId, program: a.program });
    return { added: toAdd.length, skipped: wanted.size - toAdd.length };
  });
  if (outcome.cap) return { cap: outcome.cap };
  return { cycleYear: year, added: outcome.added, skipped: outcome.skipped };
}

/** How recent a list must be for a `newList` import with the same name and schools to count as a repeat of it. */
export const IMPORT_REPEAT_WINDOW_MS = 10_000;

/**
 * The caller's list with exactly this name, made within `IMPORT_REPEAT_WINDOW_MS`, whose items are exactly `wanted`
 * (school and program, any order), or null. Read under the list lock by `importListItems`.
 */
async function recentSameList(
  tx: Tx,
  userId: string,
  name: string,
  wanted: readonly { schoolId: string; program: MedListProgramId }[],
  now: Date,
): Promise<MedListDto | null> {
  const recent = await tx.medSchoolList.findMany({
    where: { userId, name, createdAt: { gte: new Date(now.getTime() - IMPORT_REPEAT_WINDOW_MS) } },
    select: { id: true },
  });
  if (recent.length === 0) return null;
  const want = [...new Set(wanted.map((w) => `${w.schoolId}|${w.program}`))].sort().join(',');
  for (const l of recent) {
    const have = await tx.medSchoolListItem.findMany({ where: { listId: l.id }, select: { schoolId: true, program: true } });
    if (have.map((h) => `${h.schoolId}|${h.program}`).sort().join(',') === want) return oneList(tx, userId, l.id);
  }
  return null;
}

export type ImportListTarget = { listId: string } | { newList: string };
export type ImportListResult =
  | { list: MedListDto; added: number; alreadyThere: number; invalid: number }
  | null
  | 'cap'
  | 'list-cap'
  | 'bad-name';

/**
 * The list import's save (owner 2026-11-24): the ticked preview rows into one of the caller's lists (`listId`; another
 * member's list, or a missing one, is `null`) or a new list (`newList`, always created; refused at the list cap). A
 * school that is not active is `invalid`; a school and program already on the list, or named twice in the body, is
 * `alreadyThere`; the rest are appended in the order given. All or nothing against the 200-item cap: over it nothing is
 * written, not even the new list. Under the list lock, like every list write, so a repeated `newList` request waits
 * for the first and then finds its list (`recentSameList`) instead of making a second.
 */
export async function importListItems(
  userId: string,
  target: ImportListTarget,
  items: readonly { slug: string; program: MedListProgramId }[],
  now: Date = new Date(),
): Promise<ImportListResult> {
  const named = 'newList' in target ? cleanText(target.newList, LIMITS.listName) : undefined;
  if (named === null) return 'bad-name';
  return prisma.$transaction(async (tx) => {
    await listLock(tx, userId);
    const lists = await listRows(tx, userId);
    if ('listId' in target && !lists.some((l) => l.id === target.listId)) return null;

    const slugs = [...new Set(items.map((i) => i.slug))];
    const schools = await tx.medSchool.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, active: true },
    });
    const bySlug = new Map(schools.filter((s) => s.active).map((s) => [s.slug, s.id]));
    const here =
      'listId' in target
        ? await tx.medSchoolListItem.findMany({ where: { listId: target.listId }, select: { schoolId: true, program: true } })
        : [];
    const seen = new Set(here.map((h) => `${h.schoolId}|${h.program}`));
    let invalid = 0;
    let alreadyThere = 0;
    const toAdd: { schoolId: string; program: MedListProgramId }[] = [];
    for (const item of items) {
      const schoolId = bySlug.get(item.slug);
      if (!schoolId) {
        invalid += 1;
        continue;
      }
      const key = `${schoolId}|${item.program}`;
      if (seen.has(key)) {
        alreadyThere += 1;
        continue;
      }
      seen.add(key);
      toAdd.push({ schoolId, program: item.program });
    }
    if (named !== undefined) {
      // A quick repeat of the same "new list" (a double press, a retried request) answers with the list the first one
      // made instead of a second copy: same exact name, made in the last few seconds, holding exactly these schools.
      const repeat = await recentSameList(tx, userId, named, toAdd, now);
      if (repeat) return { list: repeat, added: 0, alreadyThere: alreadyThere + toAdd.length, invalid };
      if (lists.length >= LIMITS.lists) return 'list-cap' as const;
    }
    if (here.length + toAdd.length > LIMITS.itemsPerList) return 'cap' as const;

    const listId =
      'listId' in target
        ? target.listId
        : (
            await tx.medSchoolList.create({
              data: { userId, name: named!, position: lists.length, createdAt: now },
              select: { id: true },
            })
          ).id;
    for (const [i, a] of toAdd.entries()) {
      await tx.medSchoolListItem.create({
        data: { listId, schoolId: a.schoolId, program: a.program, position: here.length + i },
      });
    }
    const list = await oneList(tx, userId, listId);
    if (!list) return null;
    return { list, added: toAdd.length, alreadyThere, invalid };
  });
}
