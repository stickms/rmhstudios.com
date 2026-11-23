/**
 * Shared writer for Admit events, used by the live feed and the profile-history backfill so both obey one rule: an
 * event is keyed by member (`hash(admit:author:<user id>:<schoolId>:<cycleYear>:<type>)`, built inside the adapter), so
 * the same person's status at a school counts once whichever path saw it first.
 *
 * First report wins, with one refinement: when a later sighting carries an EARLIER calendar day (UTC) for an existing
 * key, the stored `occurredAt` moves back to it (the earliest date is the truest one; see `replacesTime`), and both the old and the new day's cells are
 * re-rolled. The key holds the cycle year, so a moved event never changes cycle; the roll-up recomputes touched cells
 * from stored events and deletes a cell whose events are gone, so a moved event is never counted on both days. A stored
 * event with no program also takes the program a later sighting resolved. Nothing here sees a user id.
 */
import type { MedEventType, MedProgram } from '../engine/types';
import type { TouchedCell } from './rollup-events';
import type { MedAdmitMemberRow, MedPrisma } from './types';

export interface AdmitCandidate {
  schoolId: string;
  cycleYear: number;
  program: MedProgram | null;
  eventType: MedEventType;
  occurredAt: Date;
  dedupeHash: string;
}

export interface StoredAdmitEvent {
  dedupeHash: string;
  schoolId: string;
  program: MedProgram | null;
  cycleYear: number;
  occurredAt: Date;
}

const CHUNK = 500;
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
const isMidnightUtc = (d: Date): boolean => d.getTime() % 86_400_000 === 0;

/**
 * Whether `candidate` should replace `prior` as the stored time. Only a different CALENDAR day (UTC) counts as
 * earlier: a history date is day-only (stored at UTC midnight), so a smaller timestamp on the same day is a fabricated
 * precision, not an earlier report, and must never displace an exact live-feed time. On the same day an exact time
 * does replace a day-only midnight.
 */
export function replacesTime(prior: Date, candidate: Date): boolean {
  const a = dayOf(candidate);
  const b = dayOf(prior);
  if (a !== b) return a < b;
  return isMidnightUtc(prior) && !isMidnightUtc(candidate);
}

/** Candidates sharing a key collapse to the earliest date; a known program beats an unknown one. */
export function mergeCandidates(list: AdmitCandidate[]): AdmitCandidate[] {
  const byHash = new Map<string, AdmitCandidate>();
  for (const c of list) {
    const prior = byHash.get(c.dedupeHash);
    if (!prior) {
      byHash.set(c.dedupeHash, { ...c });
      continue;
    }
    if (replacesTime(prior.occurredAt, c.occurredAt)) prior.occurredAt = c.occurredAt;
    if (prior.program === null && c.program !== null) prior.program = c.program;
  }
  return [...byHash.values()];
}

export async function findStoredEvents(prisma: MedPrisma, hashes: string[]): Promise<Map<string, StoredAdmitEvent>> {
  const out = new Map<string, StoredAdmitEvent>();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const found = await prisma.medCycleEvent.findMany({
      where: { dedupeHash: { in: hashes.slice(i, i + CHUNK) } },
      select: { dedupeHash: true, schoolId: true, program: true, cycleYear: true, occurredAt: true },
    });
    for (const e of found) out.set(e.dedupeHash, e);
  }
  return out;
}

export interface CommitResult {
  created: number;
  /** Stored events whose date moved earlier (or whose program was filled in). */
  moved: number;
  /** Candidates whose key was already stored. */
  existing: number;
  /** Cells to re-roll: every touched event's old and new cell. Stored events are included, which repairs a failed roll-up. */
  touched: TouchedCell[];
}

/** Create the unseen events, move stored ones earlier when a candidate is older, and say which cells to roll up. */
export async function commitAdmitEvents(
  prisma: MedPrisma,
  candidates: AdmitCandidate[],
  known?: Map<string, StoredAdmitEvent>,
): Promise<CommitResult> {
  const merged = mergeCandidates(candidates);
  const stored = new Map(known ?? []);
  const missing = merged.map((c) => c.dedupeHash).filter((h) => !stored.has(h));
  if (missing.length > 0) for (const [h, e] of await findStoredEvents(prisma, missing)) stored.set(h, e);

  const result: CommitResult = { created: 0, moved: 0, existing: 0, touched: [] };
  const cell = (e: { schoolId: string; program: MedProgram | null; cycleYear: number; occurredAt: Date }) => {
    if (e.program !== null)
      result.touched.push({
        schoolId: e.schoolId,
        program: e.program,
        cycleYear: e.cycleYear,
        date: dayOf(e.occurredAt),
      });
  };
  const fresh: AdmitCandidate[] = [];
  for (const c of merged) {
    const prior = stored.get(c.dedupeHash);
    if (!prior) {
      fresh.push(c);
      continue;
    }
    result.existing++;
    cell(prior);
    const earlier = replacesTime(prior.occurredAt, c.occurredAt);
    const program = prior.program === null && c.program !== null;
    if (!earlier && !program) continue;
    const data: Record<string, unknown> = {};
    if (earlier) data.occurredAt = c.occurredAt;
    if (program) data.program = c.program;
    await prisma.medCycleEvent.update({ where: { dedupeHash: c.dedupeHash }, data });
    result.moved++;
    cell({
      schoolId: prior.schoolId,
      program: c.program ?? prior.program,
      cycleYear: prior.cycleYear,
      occurredAt: earlier ? c.occurredAt : prior.occurredAt,
    });
  }
  if (fresh.length > 0) {
    const res = await prisma.medCycleEvent.createMany({
      data: fresh.map((c) => ({
        schoolId: c.schoolId,
        cycleYear: c.cycleYear,
        program: c.program,
        eventType: c.eventType,
        occurredAt: c.occurredAt,
        source: 'ADMIT',
        dedupeHash: c.dedupeHash,
        inState: null,
      })),
      skipDuplicates: true,
    });
    result.created = res.count;
    for (const c of fresh) cell(c);
  }
  return result;
}

// ─── Member progress (hashes only) ─────────────────────────────────────────────

/** A FAILED member is retried after a week once it has failed this many times. */
export const MEMBER_MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 7 * 86_400_000;
/** Rows untouched for this long are pruned: the set stays bounded to about one cycle of members. */
export const MEMBER_PRUNE_MS = 400 * 86_400_000;

export async function loadMemberStates(prisma: MedPrisma, hashes: string[]): Promise<Map<string, MedAdmitMemberRow>> {
  const out = new Map<string, MedAdmitMemberRow>();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const rows = await prisma.medAdmitMember.findMany({
      where: { memberHash: { in: hashes.slice(i, i + CHUNK) } },
    });
    for (const r of rows) out.set(r.memberHash, r);
  }
  return out;
}

/** True when this member needs no history fetch now: ingested, or failed repeatedly within the last week. */
export function memberSettled(row: MedAdmitMemberRow | undefined, now: Date): boolean {
  if (!row) return false;
  if (row.state === 'DONE') return true;
  return row.attempts >= MEMBER_MAX_ATTEMPTS && now.getTime() - new Date(row.updatedAt).getTime() < RETRY_AFTER_MS;
}

export async function markMember(
  prisma: MedPrisma,
  memberHash: string,
  state: 'DONE' | 'FAILED',
  now: Date,
): Promise<void> {
  await prisma.medAdmitMember.upsert({
    where: { memberHash },
    create: { memberHash, state, attempts: state === 'FAILED' ? 1 : 0, createdAt: now, updatedAt: now },
    update: state === 'FAILED' ? { state, attempts: { increment: 1 }, updatedAt: now } : { state, updatedAt: now },
  });
}

export async function pruneMembers(prisma: MedPrisma, now: Date): Promise<number> {
  const res = await prisma.medAdmitMember.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - MEMBER_PRUNE_MS) } },
  });
  return res.count;
}
