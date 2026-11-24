/**
 * The private tracker service (phase 4, Task 4). Every function takes `userId` first and reaches a row only through a
 * cycle that carries it: a missing row and another user's row are the same answer (`null` / `false`), so there is no
 * existence oracle. Writes go through `share-sync.server.ts` (`withShared`, `withSharedErase` and its row writers),
 * which keeps the anonymous events equal to the milestones; nothing here writes a tracker table or an event itself.
 *
 * Reads are flat (cycle, then applications, then milestones), each keyed by the previous step, never a nested relation
 * filter: the in-memory test fake cannot evaluate those, and a flat read cannot silently match everything.
 */
import { prisma } from '@/lib/prisma.server';
import type {
  MedImportSaveRes,
  TrackerApplicationDto,
  TrackerCycleDto,
  TrackerDto,
  TrackerSchoolDto,
} from '../medschools.contract';
import {
  LIMITS,
  MILESTONE_TYPES,
  cleanText,
  cycleYearProblem,
  milestoneDateProblem,
  normalizeHomeState,
  type MilestoneType,
} from '../engine/tracker';
import type { MedProgram } from '../engine/types';
import { getPrefs } from './prefs.server';
import {
  assertMayShare,
  createApplicationRow,
  deleteApplicationRow,
  deleteCycleRow,
  deleteMilestoneRow,
  setApplicationNotesRow,
  shareSecret,
  upsertCycleRow,
  upsertMilestoneRow,
  withShared,
  withSharedErase,
  type Tx,
} from './share-sync.server';

type Db = Pick<Tx, 'medTrackerCycle' | 'medTrackerApplication' | 'medTrackerMilestone' | 'medSchool'>;

const day = (d: Date): string => d.toISOString().slice(0, 10);
const typeOrder = new Map(MILESTONE_TYPES.map((t, i) => [t, i]));

async function applicationDtos(db: Db, appIds: readonly string[]): Promise<TrackerApplicationDto[]> {
  if (appIds.length === 0) return [];
  const apps = await db.medTrackerApplication.findMany({
    where: { id: { in: [...appIds] } },
    select: { id: true, schoolId: true, program: true, notes: true },
  });
  const schools = await db.medSchool.findMany({
    where: { id: { in: [...new Set(apps.map((a) => a.schoolId))] } },
    select: { id: true, slug: true, name: true, shortName: true, degree: true, state: true, active: true },
  });
  const ms = await db.medTrackerMilestone.findMany({
    where: { applicationId: { in: apps.map((a) => a.id) } },
    select: { applicationId: true, type: true, date: true },
  });
  const schoolBy = new Map<string, TrackerSchoolDto>(
    schools.map((s) => [
      s.id,
      { slug: s.slug, name: s.name, shortName: s.shortName, degree: s.degree, state: s.state, active: s.active },
    ]),
  );
  return apps
    .flatMap((a) => {
      const school = schoolBy.get(a.schoolId);
      if (!school) return [];
      const milestones = ms
        .filter((m) => m.applicationId === a.id)
        .map((m) => ({ type: m.type as MilestoneType, date: day(m.date) }))
        .sort((x, y) =>
          x.date < y.date ? -1 : x.date > y.date ? 1 : (typeOrder.get(x.type) ?? 0) - (typeOrder.get(y.type) ?? 0),
        );
      return [{ id: a.id, school, program: a.program as 'REG' | 'PHD', notes: a.notes, milestones }];
    })
    .sort((a, b) => a.school.name.localeCompare(b.school.name) || a.program.localeCompare(b.program));
}

/** The application when it hangs from one of this user's cycles, with that cycle's year; else null. */
async function owned(
  db: Db,
  userId: string,
  applicationId: string,
): Promise<{ id: string; cycleId: string; cycleYear: number } | null> {
  const app = await db.medTrackerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, cycleId: true },
  });
  if (!app) return null;
  const cycle = await db.medTrackerCycle.findFirst({
    where: { id: app.cycleId, userId },
    select: { id: true, cycleYear: true },
  });
  return cycle ? { id: app.id, cycleId: app.cycleId, cycleYear: cycle.cycleYear } : null;
}

async function applicationDto(userId: string, id: string): Promise<TrackerApplicationDto | null> {
  if (!(await owned(prisma, userId, id))) return null;
  return (await applicationDtos(prisma, [id]))[0] ?? null;
}

async function cycleDto(userId: string, cycleYear: number): Promise<TrackerCycleDto | null> {
  const c = await prisma.medTrackerCycle.findFirst({
    where: { userId, cycleYear },
    select: { id: true, cycleYear: true, homeState: true, shareAnonymously: true },
  });
  if (!c) return null;
  const apps = await prisma.medTrackerApplication.findMany({ where: { cycleId: c.id }, select: { id: true } });
  return {
    cycleYear: c.cycleYear,
    homeState: c.homeState,
    shareAnonymously: c.shareAnonymously,
    applications: await applicationDtos(
      prisma,
      apps.map((a) => a.id),
    ),
  };
}

/** The user's tracker. `cycle` defaults to the newest the user has; a year they have no cycle for gives `cycle: null`. */
export async function getTracker(userId: string, cycle?: number): Promise<TrackerDto> {
  const rows = await prisma.medTrackerCycle.findMany({ where: { userId }, select: { cycleYear: true } });
  const cycles = rows.map((r) => r.cycleYear).sort((a, b) => b - a);
  const year = cycle ?? cycles[0];
  return {
    sharingAvailable: shareSecret() !== null,
    cycles,
    cycle: year === undefined ? null : await cycleDto(userId, year),
  };
}

/** Create the cycle or change its home state and sharing switch. Turning sharing on needs the secret and an old account. */
export async function putCycle(
  userId: string,
  i: { cycleYear: number; homeState?: string | null | undefined; shareAnonymously: boolean },
  now: Date = new Date(),
): Promise<TrackerDto> {
  const home = normalizeHomeState(i.homeState);
  if (home === 'invalid') throw new Error('homeState must be validated by the schema');
  await withShared(
    userId,
    { cycleYear: i.cycleYear },
    async (tx) => {
      if (i.shareAnonymously) await assertMayShare(tx, userId, now);
      await upsertCycleRow(tx, userId, i.cycleYear, {
        shareAnonymously: i.shareAnonymously,
        ...(i.homeState !== undefined ? { homeState: home } : {}),
      });
    },
    prisma,
    now,
  );
  return getTracker(userId, i.cycleYear);
}

/** Delete a cycle with its applications, milestones and every anonymous event hanging from them. */
export async function deleteCycle(userId: string, cycleYear: number): Promise<boolean> {
  return withSharedErase(userId, { cycleYear }, async (tx) => {
    const c = await tx.medTrackerCycle.findFirst({ where: { userId, cycleYear }, select: { id: true } });
    if (!c) return false;
    await deleteCycleRow(tx, c.id);
    return true;
  });
}

export async function addApplication(
  userId: string,
  i: { cycleYear: number; schoolSlug: string; program: MedProgram },
): Promise<TrackerApplicationDto | 'cycle-missing' | 'school-missing' | 'duplicate' | 'cap'> {
  const made = await withShared(userId, { cycleYear: i.cycleYear }, async (tx) => {
    const cycle = await tx.medTrackerCycle.findFirst({
      where: { userId, cycleYear: i.cycleYear },
      select: { id: true },
    });
    if (!cycle) return { refused: 'cycle-missing' as const };
    const school = await tx.medSchool.findUnique({ where: { slug: i.schoolSlug }, select: { id: true, active: true } });
    if (!school?.active) return { refused: 'school-missing' as const };
    const dup = await tx.medTrackerApplication.findFirst({
      where: { cycleId: cycle.id, schoolId: school.id, program: i.program },
      select: { id: true },
    });
    if (dup) return { refused: 'duplicate' as const };
    const count = await tx.medTrackerApplication.count({ where: { cycleId: cycle.id } });
    if (count >= LIMITS.applicationsPerCycle) return { refused: 'cap' as const };
    return { id: (await createApplicationRow(tx, { cycleId: cycle.id, schoolId: school.id, program: i.program })).id };
  });
  if (made.refused !== undefined) return made.refused;
  return (made.id ? await applicationDto(userId, made.id) : null) ?? 'cycle-missing';
}

export async function patchApplication(
  userId: string,
  id: string,
  notes: string | null,
): Promise<TrackerApplicationDto | null> {
  const clean = notes === null ? null : cleanText(notes, LIMITS.trackerNotes);
  const ok = await withShared(userId, { applicationId: id }, async (tx) => {
    if (!(await owned(tx, userId, id))) return false;
    await setApplicationNotesRow(tx, id, clean);
    return true;
  });
  return ok ? applicationDto(userId, id) : null;
}

export async function deleteApplication(userId: string, id: string): Promise<boolean> {
  return withSharedErase(userId, { applicationId: id }, async (tx) => {
    if (!(await owned(tx, userId, id))) return false;
    await deleteApplicationRow(tx, id);
    return true;
  });
}

/** Add the milestone or move its date (one row per `(application, type)`). `'bad-date'` when the day is not valid for the cycle. */
export async function putMilestone(
  userId: string,
  id: string,
  type: MilestoneType,
  date: string,
  now: Date = new Date(),
): Promise<TrackerApplicationDto | null | 'bad-date'> {
  const status = await withShared(
    userId,
    { applicationId: id, milestoneType: type },
    async (tx) => {
      const app = await owned(tx, userId, id);
      if (!app) return 'missing' as const;
      if (milestoneDateProblem(app.cycleYear, date, now)) return 'bad-date' as const;
      await upsertMilestoneRow(tx, id, type, new Date(`${date}T00:00:00.000Z`));
      return 'ok' as const;
    },
    prisma,
    now,
  );
  if (status === 'missing') return null;
  if (status === 'bad-date') return 'bad-date';
  return applicationDto(userId, id);
}

export async function deleteMilestone(
  userId: string,
  id: string,
  type: MilestoneType,
): Promise<TrackerApplicationDto | null> {
  const ok = await withSharedErase(userId, { applicationId: id, milestoneType: type }, async (tx) => {
    if (!(await owned(tx, userId, id))) return false;
    await deleteMilestoneRow(tx, id, type);
    return true;
  });
  return ok ? applicationDto(userId, id) : null;
}

/**
 * Write the rows of a tracker import (owner 2026-11-23), through the same row writers and the same transaction as a
 * manual entry, so sharing follows the cycle's own flag: a cycle that shares shares these dates exactly as it would the
 * same dates typed by hand, and a cycle created here starts unshared. The rows name a school by slug and never an
 * application or a cycle id, so everything lands in the caller's own cycle.
 *
 * The conflict rule (one rule, decided by the member in the preview): a date that is already on the tracker and differs
 * is left alone unless the row carries `overwrite: true`; the same date is `unchanged`. A date outside the cycle's window
 * or in the future, and a school that is not an active school, are `invalid` and nothing else is lost. The cap on schools
 * per cycle is all-or-nothing, as for "add a list to the tracker".
 */
export async function importMilestones(
  userId: string,
  i: {
    cycleYear: number;
    rows: { slug: string; program: MedProgram; milestones: { type: MilestoneType; date: string; overwrite: boolean }[] }[];
  },
  now: Date = new Date(),
): Promise<MedImportSaveRes | { cap: { existing: number; adding: number } } | null> {
  if (cycleYearProblem(i.cycleYear, now)) return null;
  const homeState = (await getPrefs(userId)).homeState;
  const result = await withShared(
    userId,
    { cycleYear: i.cycleYear },
    async (tx) => {
      const out: MedImportSaveRes = {
        cycleYear: i.cycleYear,
        schoolsAdded: 0,
        added: 0,
        overwritten: 0,
        unchanged: 0,
        conflicts: 0,
        invalid: 0,
      };
      // The same school and program twice in the body is one application.
      const wanted = new Map<string, { slug: string; program: MedProgram; milestones: Map<MilestoneType, { date: string; overwrite: boolean }> }>();
      for (const r of i.rows) {
        const key = `${r.slug}|${r.program}`;
        const w = wanted.get(key) ?? { slug: r.slug, program: r.program, milestones: new Map() };
        for (const m of r.milestones) if (!w.milestones.has(m.type)) w.milestones.set(m.type, { date: m.date, overwrite: m.overwrite });
        wanted.set(key, w);
      }
      const schools = await tx.medSchool.findMany({
        where: { slug: { in: [...new Set([...wanted.values()].map((w) => w.slug))] }, active: true },
        select: { id: true, slug: true },
      });
      const idOf = new Map(schools.map((s) => [s.slug, s.id]));

      let cycle = await tx.medTrackerCycle.findFirst({ where: { userId, cycleYear: i.cycleYear }, select: { id: true } });
      const existing = cycle
        ? await tx.medTrackerApplication.findMany({
            where: { cycleId: cycle.id },
            select: { id: true, schoolId: true, program: true },
          })
        : [];
      const appOf = new Map(existing.map((a) => [`${a.schoolId}|${a.program}`, a.id]));
      const known = [...wanted.values()].filter((w) => idOf.has(w.slug));
      // Only a school that would get at least one writable date adds an application (the loop below skips the rest), so
      // only those count against the cap: an import that would add nothing is never refused for its size.
      const hasWritableDate = (w: { milestones: Map<MilestoneType, { date: string }> }) =>
        [...w.milestones.values()].some((m) => milestoneDateProblem(i.cycleYear, m.date, now) === null);
      const toCreate = known.filter((w) => !appOf.has(`${idOf.get(w.slug)}|${w.program}`) && hasWritableDate(w));
      if (existing.length + toCreate.length > LIMITS.applicationsPerCycle) {
        return { cap: { existing: existing.length, adding: toCreate.length } };
      }
      for (const w of wanted.values()) if (!idOf.has(w.slug)) out.invalid += w.milestones.size;

      for (const w of known) {
        const schoolId = idOf.get(w.slug)!;
        const key = `${schoolId}|${w.program}`;
        let appId = appOf.get(key);
        // Dates first: a school none of whose dates is writable is not added for nothing.
        const dates = [...w.milestones].map(([type, m]) => ({ type, ...m, bad: milestoneDateProblem(i.cycleYear, m.date, now) !== null }));
        out.invalid += dates.filter((d) => d.bad).length;
        const good = dates.filter((d) => !d.bad);
        if (good.length === 0) continue;
        if (!appId) {
          // The cycle is made when the first school needs it: an import with nothing to write makes nothing.
          if (!cycle) {
            await upsertCycleRow(tx, userId, i.cycleYear, { shareAnonymously: false, homeState });
            cycle = await tx.medTrackerCycle.findFirst({ where: { userId, cycleYear: i.cycleYear }, select: { id: true } });
            if (!cycle) throw new Error('cycle was not created');
          }
          appId = (await createApplicationRow(tx, { cycleId: cycle.id, schoolId, program: w.program })).id;
          out.schoolsAdded += 1;
        }
        const have = new Map(
          (await tx.medTrackerMilestone.findMany({ where: { applicationId: appId }, select: { type: true, date: true } })).map((m) => [
            m.type as MilestoneType,
            day(m.date),
          ]),
        );
        for (const d of good) {
          const was = have.get(d.type);
          if (was === d.date) out.unchanged += 1;
          else if (was !== undefined && !d.overwrite) out.conflicts += 1;
          else {
            await upsertMilestoneRow(tx, appId, d.type, new Date(`${d.date}T00:00:00.000Z`));
            if (was === undefined) out.added += 1;
            else out.overwritten += 1;
          }
        }
      }
      return out;
    },
    prisma,
    now,
  );
  return result;
}
