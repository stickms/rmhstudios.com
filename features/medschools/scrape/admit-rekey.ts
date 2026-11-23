/**
 * One-time re-key of the ADMIT events (owner 2026-11-23). Admit events used to key on `cycle_update_id`, one key per
 * status update; they now key on the member (`admit-events.ts`). The old rows cannot be recognised as the same report
 * the profile-history backfill will insert, so left in place they would be counted twice. This step deletes every ADMIT
 * `MedCycleEvent` and every ADMIT `MedCycleCount` cell (an ADMIT cell holds nothing but its events: school stats live in
 * `MedSchoolStats`, so re-rolling the cells from the remaining events, of which there are none, is deleting them), and
 * the live feed and the backfill refill both under the new key. Because the events do not come back by themselves,
 * the progress that says "already read" goes in the same transaction: every `MedAdmitMember` row (a member marked DONE
 * is never fetched again, so its history would never refill) and every `MedAdmitForumThread` cursor (a thread read to
 * its end is never re-read, so its events would never refill; the forums job recreates the rows from offset 0).
 *
 * It runs at most once: the done flag is a `MedSourceRun` row (source ADMIT, job `admit-rekey`, status OK). Both Admit
 * event jobs call it before they write anything, so it precedes the first live write under the new key and the first
 * backfill; a failed or killed attempt leaves no OK row and is retried by the next call, and being one all-or-nothing
 * transaction that deletes everything, it is safe to repeat: a re-run can never wipe events while keeping the progress
 * that would stop them refilling. Concurrent callers in one process share one attempt.
 */
import { brief, closeStaleRuns } from './run-support';
import type { Logger, MedPrisma } from './types';

export const ADMIT_REKEY_JOB = 'admit-rekey';

const done = new WeakSet<object>();
const attempts = new WeakMap<object, Promise<boolean>>();

/** True when the re-key is done (now or earlier); false when it failed, and the caller must not write events. */
export function ensureAdmitRekey(prisma: MedPrisma, log: Logger, now: () => Date): Promise<boolean> {
  if (done.has(prisma)) return Promise.resolve(true);
  const running = attempts.get(prisma);
  if (running) return running;
  const attempt = rekeyOnce(prisma, log, now).then(
    (ok) => {
      attempts.delete(prisma);
      if (ok) done.add(prisma);
      return ok;
    },
    (e: unknown) => {
      attempts.delete(prisma);
      log.error(`admit-rekey: unexpected failure: ${brief(e)}`);
      return false;
    },
  );
  attempts.set(prisma, attempt);
  return attempt;
}

async function rekeyOnce(prisma: MedPrisma, log: Logger, now: () => Date): Promise<boolean> {
  const flag = await prisma.medSourceRun.findFirst({
    where: { source: 'ADMIT', job: ADMIT_REKEY_JOB, status: 'OK' },
  });
  if (flag) return true;
  await closeStaleRuns(prisma, 'ADMIT', ADMIT_REKEY_JOB, now, log);
  const run = await prisma.medSourceRun.create({
    data: { source: 'ADMIT', job: ADMIT_REKEY_JOB, trigger: 'BOOTSTRAP', status: 'RUNNING' },
  });
  try {
    const { events, cells, members, threads } = await prisma.$transaction(async (tx) => {
      const events = await tx.medCycleEvent.deleteMany({ where: { source: 'ADMIT' } });
      const cells = await tx.medCycleCount.deleteMany({ where: { source: 'ADMIT' } });
      const members = await tx.medAdmitMember.deleteMany({ where: {} });
      const threads = await tx.medAdmitForumThread.deleteMany({ where: {} });
      await tx.medSourceRun.update({
        where: { id: run.id },
        data: {
          status: 'OK',
          finishedAt: now(),
          stats: {
            eventsDeleted: events.count,
            cellsDeleted: cells.count,
            membersReset: members.count,
            forumThreadsReset: threads.count,
          },
        },
      });
      return { events, cells, members, threads };
    });
    log.warn(
      `admit-rekey: done (one time): deleted ${events.count} ADMIT events and ${cells.count} count cells, reset ${members.count} member progress rows and ${threads.count} forum cursors; the live feed, admit-history and admit-forums refill them under the member key`,
    );
    return true;
  } catch (e) {
    const error = brief(e);
    log.error(`admit-rekey: failed, Admit event jobs will not write until it succeeds: ${error}`);
    await prisma.medSourceRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now(), error } })
      .catch(() => undefined);
    return false;
  }
}
