/**
 * The audit row of a sweep run. `AdminAuditLog.detail` is a 500-character string, so the summary goes in as compact JSON
 * of counts only (no object keys, no members) and the admin page reads it back with {@link parseRunDetail}.
 */
import type { ClipSweepSummary, SweepKind, SweepSummary } from '@/lib/media/sweep-summary';

/** The feature flag that gates the scheduled sweeps (an absent flag is off). */
export const MEDIA_SWEEP_FLAG = 'media-sweep';

export const SWEEP_AUDIT_TARGET = 'media-sweep';
export const SWEEP_AUDIT_ACTION = { media: 'media_sweep_run', clips: 'media_clip_sweep_run' } as const satisfies Record<
  SweepKind,
  string
>;

export interface SweepRunView {
  id: string;
  kind: SweepKind;
  /** ISO time the run was recorded. */
  at: string;
  targets: number;
  deleted: number;
  failed: number;
  capped: boolean;
}

export function runDetail(summary: SweepSummary | ClipSweepSummary): string {
  const counts: Record<string, unknown> = { ...summary };
  delete counts.sampleKeys;
  return JSON.stringify(counts).slice(0, 500);
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** One audit row as a run, or null when it is not one this feature wrote. */
export function parseRunDetail(row: {
  id: string;
  action: string;
  createdAt: Date;
  detail: string | null;
}): SweepRunView | null {
  const kind: SweepKind | null =
    row.action === SWEEP_AUDIT_ACTION.media ? 'media' : row.action === SWEEP_AUDIT_ACTION.clips ? 'clips' : null;
  if (!kind) return null;
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = row.detail ? JSON.parse(row.detail) : {};
    if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
  } catch {
    // A detail cut at 500 characters is still a run; its counts read as 0.
  }
  return {
    id: row.id,
    kind,
    at: row.createdAt.toISOString(),
    targets: count(parsed.targets),
    deleted: count(parsed.deleted),
    failed: count(parsed.failed),
    capped: parsed.capped === true,
  };
}
