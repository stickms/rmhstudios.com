/**
 * Roll-up cells whose `MedCycleCount` write failed after their `MedCycleEvent` rows were committed. They ride in
 * `MedSourceRun.stats.rollupPending` of the backfill run (school id, program, cycle year and UTC day: no thread,
 * post or person data) and are retried by the next backfill run and by the live discovery tick. A roll-up
 * recomputes a cell from its stored events, so a retry is idempotent and a cell that was in fact written is a no-op.
 */
import type { MedProgram } from '../../engine/types';
import { rollupEventCounts, type TouchedCell } from '../rollup-events';
import type { MedPrisma } from '../types';

/** More than this and the oldest cells are dropped (a roll-up that keeps failing means the database is down). */
export const MAX_PENDING_CELLS = 1000;

export const cellKey = (c: TouchedCell): string => `${c.schoolId}|${c.program}|${c.cycleYear}|${c.date}`;

const isProgram = (v: unknown): v is MedProgram => v === 'REG' || v === 'PHD';

/** Cells stored in a run's stats, tolerantly read; anything malformed is dropped. */
export function readPendingCells(stats: unknown): TouchedCell[] {
  if (stats === null || typeof stats !== 'object') return [];
  const raw = (stats as { rollupPending?: unknown }).rollupPending;
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, TouchedCell>();
  for (const c of raw) {
    if (c === null || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    if (
      typeof o.schoolId !== 'string' ||
      !isProgram(o.program) ||
      typeof o.cycleYear !== 'number' ||
      !Number.isInteger(o.cycleYear) ||
      typeof o.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(o.date)
    )
      continue;
    const cell: TouchedCell = { schoolId: o.schoolId, program: o.program, cycleYear: o.cycleYear, date: o.date };
    out.set(cellKey(cell), cell);
  }
  return [...out.values()].slice(-MAX_PENDING_CELLS);
}

/** Adds cells to a pending set, dropping the oldest beyond the cap. */
export function addPendingCells(pending: Map<string, TouchedCell>, cells: TouchedCell[]): void {
  for (const c of cells) {
    pending.delete(cellKey(c)); // re-insert so the newest are the last kept
    pending.set(cellKey(c), c);
  }
  while (pending.size > MAX_PENDING_CELLS) pending.delete(pending.keys().next().value as string);
}

/**
 * Live-tick repair: retries the cells the newest finished backfill run could not roll up, and clears them from that
 * run's stats on success. A run still in flight owns its own cells, so it is left alone. Returns the rows written
 * (0 when nothing was pending) and never throws on a failed roll-up: it reports `failed` instead.
 */
export async function repairBackfillRollups(prisma: MedPrisma): Promise<{ rolledUp: number; failed: boolean }> {
  const recent = await prisma.medSourceRun.findMany({
    where: { source: 'SDN', job: 'sdn-backfill' },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  recent.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const latest = recent[0];
  if (!latest || latest.status === 'RUNNING') return { rolledUp: 0, failed: false };
  const cells = readPendingCells(latest.stats);
  if (cells.length === 0) return { rolledUp: 0, failed: false };
  let rolledUp: number;
  try {
    rolledUp = await rollupEventCounts(prisma, { source: 'SDN', touched: cells });
  } catch {
    return { rolledUp: 0, failed: true };
  }
  await prisma.medSourceRun.update({
    where: { id: latest.id },
    data: { stats: { ...(latest.stats as Record<string, unknown>), rollupPending: [] } },
  });
  return { rolledUp, failed: false };
}
