/**
 * What a media sweep or a clip sweep reports. Plain data (no server imports), so the admin page and its contract
 * can use the types. Counts only, except `sampleKeys`, which exists in a preview and nowhere else: a run's summary
 * goes to the log and the audit row, and neither carries an object key or a member.
 */
import type { SweepRule } from '@/lib/media/sweep-surfaces';

export type SweepKind = 'media' | 'clips';

export interface SweepSummary {
  dryRun: boolean;
  /** Rows the selection returned. */
  scanned: number;
  /** Rows kept: something still references the URL, or the key is not one the sweep may delete. */
  kept: number;
  /** Rows chosen. A preview lists exactly these; a run deletes exactly these (less failures). */
  targets: number;
  deleted: number;
  /** Rows whose object delete failed; they stay and the next run retries them. */
  failed: number;
  byRule: Record<SweepRule, number>;
  /** The row cap (or the scan limit) was reached, so more may remain for the next run. */
  capped: boolean;
  /** First 50 object keys; filled for a preview only. */
  sampleKeys: string[];
  durationMs: number;
}

export interface ClipSweepSummary {
  dryRun: boolean;
  /** Objects listed under the clip prefix. */
  listed: number;
  /** Skipped for storage giving no time, or the object being younger than 7 days. */
  tooNew: number;
  noTime: number;
  /** A ProfilePlus row names the clip. */
  referenced: number;
  targets: number;
  deleted: number;
  failed: number;
  /** The 5 000-object listing limit was reached: clips beyond it are seen on a later run. */
  capped: boolean;
  /** First 50 object keys; filled for a preview only. */
  sampleKeys: string[];
  durationMs: number;
}

export const SAMPLE_KEYS = 50;
