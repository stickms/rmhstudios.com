/**
 * The ONE writer for anonymous tracker sharing (phase 4, plan D1-D5, rulings Q2-Q4 and Q8).
 *
 * Nothing else may write `MedTrackerCycle`, `MedTrackerApplication` or `MedTrackerMilestone` rows, or an RMH
 * `MedCycleEvent`: the database cascade (`Milestone -> Application -> Cycle -> user`) deletes milestones without any
 * application code seeing them, and an event can only be found again through a milestone id, so every path that can
 * change shared state reads the ids first and goes through here. `share-ratchet.test.ts` fails on any other writer.
 *
 * The invariant, after every transaction: the RMH events equal `toSharedEvent` of the milestones under their cycle's
 * current flag, one event per milestone, and the RMH count rows equal the events grouped by cell, with
 * `contributors = count` (D4: exact, because the schema's uniques make the events in one cell come from distinct people).
 * A cell whose last event goes keeps its row at 0 until the daily snapshot removes it, so a cell never vanishes mid-day.
 * This writer never touches `publishedCount` / `publishedContributors`: those are what the public pages read, and only
 * the daily `medschools.rmh-publish` job writes them (Q2), so nothing a member does shows publicly until the next day.
 *
 * What the event and count rows hold (D2, D3): the `dedupeHash` is recomputed from the server secret and the milestone
 * id and stored nowhere else; the id of an event and of a count row is a random UUID (a cuid embeds its creation
 * minute); `occurredAt` is the milestone's calendar day and `ingestedAt` is set to that same instant (the `now()`
 * default would stamp the minute the user typed it); `inState` stays null. What that buys is narrow: the public pages and
 * the `med_cycle_event` / `med_cycle_count` tables alone link to no one. Someone with access to the database can still
 * match shared figures against the private tracker tables in the same database (a school, program, type and day).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { dedupeHash } from '../engine/dedupe';
import {
  SHARE_MIN_ACCOUNT_AGE_DAYS,
  SHAREABLE,
  accountOldEnoughToShare,
  cellKey,
  toSharedEvent,
  type MilestoneType,
  type SharedEventRow,
} from '../engine/tracker';
import type { MedEventType, MedProgram } from '../engine/types';

export type Tx = Prisma.TransactionClient;

/** Narrows a cycle, one application, or one milestone type. Omitted = the user's whole tracker. */
export type ShareScope = { cycleYear?: number; applicationId?: string; milestoneType?: MilestoneType };

/** The secret is unset or too short: sharing is unavailable (503 `SHARING_UNAVAILABLE`), the tracker still works unshared. */
export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is unavailable: MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters');
    this.name = 'SharingUnavailableError';
  }
}

/** Q8: sharing needs an account at least this old (the rule lives in `engine/tracker.ts`, client-safe, so the toggle can explain it). */
export { SHARE_MIN_ACCOUNT_AGE_DAYS, accountOldEnoughToShare };

/** The account is too new to contribute shared events (Q8). Thrown inside the transaction, so nothing is written. */
export class AccountTooNewError extends Error {
  constructor() {
    super(`Sharing needs an account at least ${SHARE_MIN_ACCOUNT_AGE_DAYS} days old`);
    this.name = 'AccountTooNewError';
  }
}

/** Q4: the dedupe secret, reused with the `RMH:milestone:` domain. Null when unset or shorter than 16 characters. */
export function shareSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.MEDSCHOOLS_DEDUPE_SECRET;
  return typeof s === 'string' && s.length >= 16 ? s : null;
}

const hashOf = (secret: string, milestoneId: string): string => dedupeHash(secret, 'RMH', `milestone:${milestoneId}`);

/**
 * Interactive-transaction limits for every share-sync transaction. Prisma's default is a 5 s timeout and a 2 s wait for
 * a connection; enabling sharing on a full tracker reads the milestones, locks, writes the events and rolls up the
 * cells, which can pass 5 s on a busy pool. The user lock serialises a member's own transactions, so a longer timeout
 * cannot pile up.
 */
export const SHARE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/** `pg_advisory_xact_lock`: released with the transaction, allowed through the pooler (the session-scoped form is banned). */
async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

// ─── Reading a user's milestones ────────────────────────────────────────────────────────────────────────────────

interface MilestoneInfo {
  id: string;
  type: MilestoneType;
  date: Date;
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  sharing: boolean;
  /** The cycle's sharing was on at some point (never cleared): only such a cycle can own an event. */
  everShared: boolean;
}

/** Flat reads (cycles, then applications, then milestones), every one scoped through `userId`. */
async function readMilestones(tx: Tx, userId: string, scope: ShareScope): Promise<MilestoneInfo[]> {
  const cycles = await tx.medTrackerCycle.findMany({
    where: { userId, ...(scope.cycleYear !== undefined ? { cycleYear: scope.cycleYear } : {}) },
    select: { id: true, cycleYear: true, shareAnonymously: true, everShared: true },
  });
  if (cycles.length === 0) return [];
  const byCycle = new Map(cycles.map((c) => [c.id, c]));
  const apps = await tx.medTrackerApplication.findMany({
    where: { cycleId: { in: [...byCycle.keys()] }, ...(scope.applicationId ? { id: scope.applicationId } : {}) },
    select: { id: true, cycleId: true, schoolId: true, program: true },
  });
  if (apps.length === 0) return [];
  const byApp = new Map(apps.map((a) => [a.id, a]));
  const ms = await tx.medTrackerMilestone.findMany({
    where: { applicationId: { in: [...byApp.keys()] }, ...(scope.milestoneType ? { type: scope.milestoneType } : {}) },
    select: { id: true, applicationId: true, type: true, date: true },
  });
  return ms.flatMap((m) => {
    const a = byApp.get(m.applicationId);
    const c = a && byCycle.get(a.cycleId);
    if (!a || !c) return [];
    return [
      {
        id: m.id,
        type: m.type,
        date: m.date,
        schoolId: a.schoolId,
        program: a.program,
        cycleYear: c.cycleYear,
        sharing: c.shareAnonymously,
        everShared: c.everShared || c.shareAnonymously,
      },
    ];
  });
}

/** The ids of the milestones in scope. Read BEFORE the rows are deleted: an event is found only through these. */
export async function milestoneIdsOf(tx: Tx, userId: string, scope: ShareScope = {}): Promise<string[]> {
  return (await readMilestones(tx, userId, scope)).map((m) => m.id);
}

const asEvent = (m: MilestoneInfo, sharing: boolean): SharedEventRow | null =>
  toSharedEvent({
    type: m.type,
    date: m.date.toISOString().slice(0, 10),
    schoolId: m.schoolId,
    program: m.program,
    cycleYear: m.cycleYear,
    sharing,
  });

// ─── Cells and the count roll-up ────────────────────────────────────────────────────────────────────────────────

interface CellRef {
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  eventType: MedEventType;
  /** YYYY-MM-DD, UTC. */
  day: string;
}

const cellRefKey = (c: CellRef): string => `${c.schoolId}|${c.program}|${c.cycleYear}|${c.day}|${c.eventType}`;

function parseCell(key: string): CellRef {
  const [schoolId = '', program = '', cycleYear = '', day = '', eventType = ''] = key.split('|');
  return {
    schoolId,
    program: program as MedProgram,
    cycleYear: Number(cycleYear),
    day,
    eventType: eventType as MedEventType,
  };
}

const cellOfRow = (e: {
  schoolId: string;
  program: MedProgram | null;
  cycleYear: number;
  eventType: MedEventType;
  occurredAt: Date;
}): string => `${e.schoolId}|${e.program}|${e.cycleYear}|${e.occurredAt.toISOString().slice(0, 10)}|${e.eventType}`;

/**
 * Recompute the RMH count rows of these cells from the RMH events (D4): `count = n` and `contributors = n`. A cell with
 * no events keeps an existing row at 0 (the daily snapshot deletes it) so the cell does not disappear mid-day; a cell
 * that never had a row gets none. Another source's rows are never read or written, and `published*` never. The caller
 * holds the school locks. `deleted` is always 0 now; it stays in the result so callers do not change.
 */
export async function rollupRmhCells(
  tx: Tx,
  cells: readonly string[],
): Promise<{ created: number; updated: number; deleted: number }> {
  const out = { created: 0, updated: 0, deleted: 0 };
  const refs = [...new Set(cells)].map(parseCell);
  const bySchool = new Map<string, CellRef[]>();
  for (const c of refs) bySchool.set(c.schoolId, [...(bySchool.get(c.schoolId) ?? []), c]);

  for (const [schoolId, list] of [...bySchool].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const wanted = new Set(list.map(cellRefKey));
    const days = [...new Set(list.map((c) => c.day))].map((d) => new Date(`${d}T00:00:00.000Z`));
    // A superset of the touched cells (the cross product of their parts); filtered back to the exact cells below.
    const narrow = {
      schoolId,
      source: 'RMH' as const,
      program: { in: [...new Set(list.map((c) => c.program))] },
      cycleYear: { in: [...new Set(list.map((c) => c.cycleYear))] },
      eventType: { in: [...new Set(list.map((c) => c.eventType))] },
    };
    const grouped = await tx.medCycleEvent.groupBy({
      by: ['program', 'cycleYear', 'eventType', 'occurredAt'],
      where: { ...narrow, occurredAt: { in: days } },
      _count: { _all: true },
    });
    const n = new Map<string, number>();
    for (const g of grouped) {
      const k = cellOfRow({ ...g, schoolId });
      if (wanted.has(k)) n.set(k, g._count._all);
    }
    const existing = await tx.medCycleCount.findMany({
      where: { ...narrow, date: { in: days } },
      select: {
        id: true,
        program: true,
        cycleYear: true,
        eventType: true,
        date: true,
        count: true,
        contributors: true,
      },
    });
    const rows = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      const k = cellOfRow({ ...r, schoolId, occurredAt: r.date });
      if (wanted.has(k)) rows.set(k, r);
    }
    const fresh: Array<Record<string, unknown>> = [];
    for (const c of list) {
      const k = cellRefKey(c);
      const count = n.get(k) ?? 0;
      const row = rows.get(k);
      const date = new Date(`${c.day}T00:00:00.000Z`);
      if (!row) {
        if (count === 0) continue;
        fresh.push({
          // A random id: the schema's cuid() default embeds the minute the row was made (D3).
          id: randomUUID(),
          schoolId,
          program: c.program,
          cycleYear: c.cycleYear,
          date,
          eventType: c.eventType,
          source: 'RMH',
          count,
          contributors: count,
        });
      } else if (row.count !== count || row.contributors !== count) {
        await tx.medCycleCount.update({ where: { id: row.id }, data: { count, contributors: count } });
        out.updated += 1;
      }
    }
    // One statement for the new cells (a full tracker is hundreds); the user lock and the school locks are held.
    if (fresh.length > 0) {
      await tx.medCycleCount.createMany({ data: fresh as never });
      out.created += fresh.length;
    }
  }
  return out;
}

// ─── Reconcile ──────────────────────────────────────────────────────────────────────────────────────────────────

/** True when an RMH event sits in a cell one of these milestones could occupy (checked when no hash can be computed). */
async function rmhEventInPossibleCells(tx: Tx, ms: readonly MilestoneInfo[]): Promise<boolean> {
  const possible = new Set(ms.flatMap((m) => asEvent(m, true) ?? []).map(cellKey));
  if (possible.size === 0) return false;
  const refs = [...possible].map(parseCell);
  const found = await tx.medCycleEvent.findMany({
    where: {
      source: 'RMH',
      schoolId: { in: [...new Set(refs.map((c) => c.schoolId))] },
      occurredAt: { in: [...new Set(refs.map((c) => c.day))].map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
    select: { schoolId: true, program: true, cycleYear: true, eventType: true, occurredAt: true },
  });
  return found.some((e) => possible.has(cellOfRow(e)));
}

/**
 * Make the RMH events equal `ms` under `keep` (true: each milestone under its cycle's flag; false: none, the erase
 * path). Takes the school locks (ascending), writes, then rolls the touched cells up. The caller holds the user lock.
 */
async function syncEvents(
  tx: Tx,
  userId: string,
  ms: readonly MilestoneInfo[],
  keep: boolean,
  now: Date,
): Promise<{ touchedCells: string[]; deleted: number }> {
  const desired = new Map<string, { m: MilestoneInfo; e: SharedEventRow }>();
  for (const m of ms) {
    const e = keep ? asEvent(m, m.sharing) : null;
    if (e) desired.set(m.id, { m, e });
  }
  if (ms.length === 0) return { touchedCells: [], deleted: 0 };
  const secret = shareSecret();
  if (!secret) {
    // Fail closed. Contributing needs the secret; so does deleting what was contributed, because an event is found only
    // by recomputing its hash. With no secret, succeed only when no event could exist for these milestones.
    if (desired.size > 0) throw new SharingUnavailableError();
    // A member whose cycles never shared owns no event, so another member's event in the same cell is no reason to
    // refuse them: the cell check is the fallback only for cycles that were ever on.
    const everOn = ms.filter((m) => m.everShared);
    if (everOn.length > 0 && (await rmhEventInPossibleCells(tx, everOn))) throw new SharingUnavailableError();
    return { touchedCells: [], deleted: 0 };
  }

  if (desired.size > 0) {
    // Q8: a new account cannot contribute. Read after the user lock; thrown inside the transaction, so nothing is written.
    const u = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!u || !accountOldEnoughToShare(u.createdAt, now)) throw new AccountTooNewError();
  }

  const hashes = new Map(ms.map((m) => [m.id, hashOf(secret, m.id)]));
  const stored = await tx.medCycleEvent.findMany({
    where: { source: 'RMH', dedupeHash: { in: [...hashes.values()] } },
    select: {
      id: true,
      dedupeHash: true,
      schoolId: true,
      program: true,
      cycleYear: true,
      eventType: true,
      occurredAt: true,
    },
  });
  const storedByHash = new Map(stored.map((s) => [s.dedupeHash, s]));

  const cells = new Set<string>();
  for (const s of stored) cells.add(cellOfRow(s));
  for (const { e } of desired.values()) cells.add(cellKey(e));
  // Ascending school ids: two users touching the same schools can never wait on each other in a cycle.
  const schools = [...new Set([...cells].map((c) => parseCell(c).schoolId))].sort();
  for (const schoolId of schools) await lock(tx, `med-rmh:${schoolId}`);

  const wantedHashes = new Set([...desired.keys()].map((id) => hashes.get(id) ?? ''));
  const stale = stored.filter((s) => !wantedHashes.has(s.dedupeHash));
  if (stale.length) await tx.medCycleEvent.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });

  const created: Array<Record<string, unknown>> = [];
  for (const [id, { e }] of desired) {
    const hash = hashes.get(id) ?? '';
    const had = storedByHash.get(hash);
    const row = {
      schoolId: e.schoolId,
      cycleYear: e.cycleYear,
      program: e.program,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      ingestedAt: e.occurredAt,
    };
    if (!had) {
      created.push({ id: randomUUID(), ...row, source: 'RMH', dedupeHash: hash, inState: null });
    } else if (cellOfRow(had) !== cellKey(e)) {
      await tx.medCycleEvent.update({ where: { id: had.id }, data: row });
    }
  }
  // One insert for every new event: enabling sharing on a full tracker is about 400 of them.
  if (created.length > 0) await tx.medCycleEvent.createMany({ data: created as never });

  await rollupRmhCells(tx, [...cells]);
  return { touchedCells: [...cells], deleted: stale.length };
}

/**
 * Make the user's events equal their milestones (D5). Locks `med-tracker:<user>` first, then the `med-rmh:<school>` keys
 * in ascending order; reads the flag and milestones after the lock, so two tabs and rapid toggling converge.
 */
export async function reconcileShared(
  tx: Tx,
  userId: string,
  scope: ShareScope = {},
  now: Date = new Date(),
): Promise<{ touchedCells: string[] }> {
  await lock(tx, `med-tracker:${userId}`);
  const ms = await readMilestones(tx, userId, scope);
  const { touchedCells } = await syncEvents(tx, userId, ms, true, now);
  return { touchedCells };
}

/**
 * Run `mutate` (the only place a tracker row is created or updated) and reconcile, in one transaction under the user
 * lock. Deleting rows is `withSharedErase`, never this: a deleted milestone is no longer in the list to reconcile.
 */
export async function withShared<T>(
  userId: string,
  scope: ShareScope,
  mutate: (tx: Tx) => Promise<T>,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<T> {
  return db.$transaction(async (tx) => {
    await lock(tx, `med-tracker:${userId}`);
    const r = await mutate(tx);
    await reconcileShared(tx, userId, scope, now);
    return r;
  }, SHARE_TX_OPTIONS);
}

/** Delete the events of these milestone ids (read BEFORE the rows are deleted) and re-roll their cells. */
export async function deleteSharedEvents(tx: Tx, userId: string, milestoneIds: readonly string[]): Promise<void> {
  await lock(tx, `med-tracker:${userId}`);
  if (milestoneIds.length === 0) return;
  const secret = shareSecret();
  if (!secret) throw new SharingUnavailableError();
  const stored = await tx.medCycleEvent.findMany({
    where: { source: 'RMH', dedupeHash: { in: milestoneIds.map((id) => hashOf(secret, id)) } },
    select: { id: true, schoolId: true, program: true, cycleYear: true, eventType: true, occurredAt: true },
  });
  if (stored.length === 0) return;
  const cells = [...new Set(stored.map(cellOfRow))];
  for (const schoolId of [...new Set(cells.map((c) => parseCell(c).schoolId))].sort()) {
    await lock(tx, `med-rmh:${schoolId}`);
  }
  await tx.medCycleEvent.deleteMany({ where: { id: { in: stored.map((s) => s.id) } } });
  await rollupRmhCells(tx, cells);
}

/**
 * Delete tracker rows (a milestone, an application, a cycle) and every event hanging from them. The milestones in scope
 * are read first, `deleteRows` runs, the scope is read again, and the events of the ids that disappeared go (the
 * survivors are reconciled), all under the user lock in one transaction. With sharing never
 * on (or the secret unset and no event possible) it needs no secret.
 */
export async function withSharedErase<T>(
  userId: string,
  scope: ShareScope,
  deleteRows: (tx: Tx) => Promise<T>,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<T> {
  return db.$transaction(async (tx) => {
    await lock(tx, `med-tracker:${userId}`);
    const before = await readMilestones(tx, userId, scope);
    const r = await deleteRows(tx);
    // What the closure actually deleted, not what the scope covered: a closure narrower than its scope (or one that
    // deleted nothing) must not unshare the milestones that are still there.
    const after = await readMilestones(tx, userId, scope);
    const left = new Set(after.map((m) => m.id));
    const gone = before.filter((m) => !left.has(m.id));
    if (gone.length > 0) {
      await syncEvents(tx, userId, gone, false, now);
      await syncEvents(tx, userId, after, true, now);
    }
    return r;
  }, SHARE_TX_OPTIONS);
}

/**
 * Account erasure pre-step (plan D9, Q3): delete every event of every milestone the user has, whatever the flag, switch
 * every cycle's sharing off, and re-roll the cells. Idempotent: a re-run after a failed sweep finds nothing to do.
 * Runs BEFORE the erasure transaction, which then deletes the tracker rows.
 */
export async function eraseSharedMedEvents(userId: string, db: PrismaClient = prisma): Promise<{ events: number }> {
  // Most accounts never opened the tracker: one indexed count instead of a transaction and a lock. A member whose
  // deletion is requested or finalising is signed out, so nothing can create a cycle between this read and the erasure.
  const cycles = await db.medTrackerCycle.count({ where: { userId } });
  if (!(cycles > 0)) return { events: 0 };
  return db.$transaction(async (tx) => {
    await lock(tx, `med-tracker:${userId}`);
    const ms = await readMilestones(tx, userId, {});
    const { deleted } = await syncEvents(tx, userId, ms, false, new Date());
    // A cancelled deletion must not silently re-share on the next reconcile (Q3: the user turns it back on).
    await tx.medTrackerCycle.updateMany({
      where: { userId, shareAnonymously: true },
      data: { shareAnonymously: false },
    });
    return { events: deleted };
  }, SHARE_TX_OPTIONS);
}

// ─── Row writers (the only place a tracker row is created, changed or deleted) ─────────────────────────────────────
// Dumb on purpose: ownership, caps and validation are the caller's, checked inside the same `withShared` /
// `withSharedErase` transaction (under the user lock). They live here so the ratchet's one-writer rule stays literal.

/** Sharing may be switched on: the secret is set and the account is old enough (Q8). Throws inside the transaction. */
export async function assertMayShare(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  if (!shareSecret()) throw new SharingUnavailableError();
  const u = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!u || !accountOldEnoughToShare(u.createdAt, now)) throw new AccountTooNewError();
}

/** Create the cycle or change its flag and (when given) its home state. `homeState: undefined` leaves it alone. */
export async function upsertCycleRow(
  tx: Tx,
  userId: string,
  cycleYear: number,
  data: { shareAnonymously: boolean; homeState?: string | null },
): Promise<void> {
  const fields = {
    shareAnonymously: data.shareAnonymously,
    // Sticky: set on the first time sharing is on, never cleared (it says whether an event could ever have existed).
    ...(data.shareAnonymously ? { everShared: true } : {}),
    ...(data.homeState !== undefined ? { homeState: data.homeState } : {}),
  };
  await tx.medTrackerCycle.upsert({
    where: { userId_cycleYear: { userId, cycleYear } },
    create: { userId, cycleYear, everShared: data.shareAnonymously, ...fields },
    update: fields,
  });
}

export async function createApplicationRow(
  tx: Tx,
  data: { cycleId: string; schoolId: string; program: MedProgram },
): Promise<{ id: string }> {
  const row = await tx.medTrackerApplication.create({ data, select: { id: true } });
  return { id: row.id };
}

export async function setApplicationNotesRow(tx: Tx, id: string, notes: string | null): Promise<void> {
  await tx.medTrackerApplication.update({ where: { id }, data: { notes } });
}

/** One milestone per `(application, type)`: a second call changes the date. `day` is a calendar day at 00:00 UTC. */
export async function upsertMilestoneRow(tx: Tx, applicationId: string, type: MilestoneType, day: Date): Promise<void> {
  await tx.medTrackerMilestone.upsert({
    where: { applicationId_type: { applicationId, type } },
    create: { applicationId, type, date: day },
    update: { date: day },
  });
}

/** Deletions: call only through `withSharedErase`, which has read the milestone ids first. */
export async function deleteMilestoneRow(tx: Tx, applicationId: string, type: MilestoneType): Promise<void> {
  await tx.medTrackerMilestone.deleteMany({ where: { applicationId, type } });
}

export async function deleteApplicationRow(tx: Tx, id: string): Promise<void> {
  await tx.medTrackerApplication.deleteMany({ where: { id } });
}

export async function deleteCycleRow(tx: Tx, id: string): Promise<void> {
  await tx.medTrackerCycle.deleteMany({ where: { id } });
}

// ─── Audit ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Read-only consistency check (run after rotating the secret). `orphanEvents`: RMH events whose hash matches no
 * milestone; `mismatchedCells`: RMH count rows that differ from the grouped events (or have none); `missingEvents`:
 * shared, shareable milestones with no event. Needs the secret.
 */
export async function auditRmh(
  db: Tx,
  secret: string | null = shareSecret(),
): Promise<{ orphanEvents: number; mismatchedCells: number; missingEvents: number }> {
  if (!secret) throw new SharingUnavailableError();
  const events = await db.medCycleEvent.findMany({
    where: { source: 'RMH' },
    select: { dedupeHash: true, schoolId: true, program: true, cycleYear: true, eventType: true, occurredAt: true },
  });
  const cycles = await db.medTrackerCycle.findMany({ select: { id: true, cycleYear: true, shareAnonymously: true } });
  const apps = await db.medTrackerApplication.findMany({
    select: { id: true, cycleId: true, schoolId: true, program: true },
  });
  const milestones = await db.medTrackerMilestone.findMany({ select: { id: true, applicationId: true, type: true } });
  const cycleBy = new Map(cycles.map((c) => [c.id, c]));
  const appBy = new Map(apps.map((a) => [a.id, a]));
  const hashes = new Set(milestones.map((m) => hashOf(secret, m.id)));
  const present = new Set(events.map((e) => e.dedupeHash));

  const orphanEvents = events.filter((e) => !hashes.has(e.dedupeHash)).length;
  let missingEvents = 0;
  for (const m of milestones) {
    const a = appBy.get(m.applicationId);
    const c = a && cycleBy.get(a.cycleId);
    if (c?.shareAnonymously && SHAREABLE[m.type] && !present.has(hashOf(secret, m.id))) missingEvents += 1;
  }

  const n = new Map<string, number>();
  for (const e of events) n.set(cellOfRow(e), (n.get(cellOfRow(e)) ?? 0) + 1);
  const rows = await db.medCycleCount.findMany({
    where: { source: 'RMH' },
    select: {
      schoolId: true,
      program: true,
      cycleYear: true,
      eventType: true,
      date: true,
      count: true,
      contributors: true,
    },
  });
  let mismatchedCells = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const k = cellOfRow({ ...r, occurredAt: r.date });
    seen.add(k);
    const want = n.get(k) ?? 0;
    if (r.count !== want || r.contributors !== want) mismatchedCells += 1;
  }
  for (const k of n.keys()) if (!seen.has(k)) mismatchedCells += 1;
  return { orphanEvents, mismatchedCells, missingEvents };
}
