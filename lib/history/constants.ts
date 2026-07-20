/**
 * History & resume — client-safe constants, zod, and resume math (§5 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */
import { z } from 'zod';

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

// Media positions are seconds; a generous cap avoids storing junk.
const MAX_POSITION = 60 * 60 * 48; // 48h

export const historyBeatSchema = z
  .object({
    entityType: z.enum(HISTORY_ENTITY_TYPES),
    entityId: z.string().min(1).max(64),
    position: z.number().int().min(0).max(MAX_POSITION).optional(),
    duration: z.number().int().min(0).max(MAX_POSITION).optional(),
  })
  .refine((v) => v.duration == null || v.position == null || v.position <= v.duration, {
    message: 'position exceeds duration',
  });

export type HistoryBeatInput = z.infer<typeof historyBeatSchema>;

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
