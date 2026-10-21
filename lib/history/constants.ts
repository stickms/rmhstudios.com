/**
 * History & resume — client-safe constants and resume math (§5 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */

export type { HistoryBeatInput } from './schema';
export const HISTORY_ENTITY_TYPES = [
  'tube_video',
  'song',
  'game',
  'library_doc',
  'news',
] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export const HISTORY_RETENTION_DAYS = 180;
/** Resume only when meaningfully in (>30s) and not essentially finished (<95%). */
export const RESUME_MIN_SECONDS = 30;
export const RESUME_MAX_RATIO = 0.95;
/** Client heartbeat cadence while media plays / a doc scrolls. */
export const HISTORY_BEAT_INTERVAL_MS = 15_000;

/** Whether a resume seek should happen for a stored position/duration. */
export function shouldResume(position?: number | null, duration?: number | null): boolean {
  if (!position || position < RESUME_MIN_SECONDS) return false;
  if (duration && duration > 0 && position / duration >= RESUME_MAX_RATIO) return false;
  return true;
}

/** Progress ratio 0..1 for a progress bar, or null when unknown. */
export function progressRatio(position?: number | null, duration?: number | null): number | null {
  if (!position || !duration || duration <= 0) return null;
  return Math.min(1, Math.max(0, position / duration));
}
