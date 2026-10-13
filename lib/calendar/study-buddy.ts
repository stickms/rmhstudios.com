/**
 * F5 — body-doubling match (RMHStudy). Pure and client-safe.
 *
 * Two members who want to study the same subject for the same length at the
 * same time get paired and sent into a shared RMHStudy room. "Now" requests
 * queue for a few minutes; scheduled requests land on the same half-hour slot
 * lattice the availability polls use (K1), so two people choosing "7:30pm"
 * are choosing the same slot.
 */
import { slotStarts, type PollWindow } from '@/lib/schedule/availability';

export const STUDY_LENGTHS = [25, 50] as const;
export const STUDY_SLOT_MIN = 30;
/** How long a "now" request waits for a partner. */
export const STUDY_QUEUE_MS = 10 * 60_000;
/** A scheduled request lingers this long past its slot start, then expires. */
export const STUDY_SLOT_GRACE_MS = 5 * 60_000;
/** The room opens this long before the session start. */
export const STUDY_EARLY_MS = 5 * 60_000;
export const STUDY_HORIZON_HOURS = 48;
export const STUDY_MAX_WAITING = 5;

/** Preset subjects. Matching uses the id, so it works across languages. */
export const STUDY_PRESETS = [
  'math',
  'science',
  'programming',
  'languages',
  'writing',
  'humanities',
  'exam-prep',
  'reading',
] as const;
export type StudyPreset = (typeof STUDY_PRESETS)[number];

/** Case, spacing and punctuation never decide whether two people match. */
export function subjectKey(subject: string, preset?: string | null): string {
  if (preset && (STUDY_PRESETS as readonly string[]).includes(preset)) return `preset:${preset}`;
  return subject
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

/** Slot starts (UTC ms) the next `STUDY_HORIZON_HOURS`, at least `leadMin` ahead. Built on the K1 slot lattice. */
export function studySlotOptions(now: Date, leadMin = 30): number[] {
  const slotMs = STUDY_SLOT_MIN * 60_000;
  const startMin = Math.ceil((now.getTime() + leadMin * 60_000) / slotMs) * STUDY_SLOT_MIN;
  const window: PollWindow = {
    startMin,
    endMin: startMin + STUDY_HORIZON_HOURS * 60,
    slotMin: STUDY_SLOT_MIN,
  };
  return slotStarts(window).map((m) => m * 60_000);
}

export function isStudySlot(startsAt: Date, now: Date): boolean {
  const ms = startsAt.getTime();
  if (ms % (STUDY_SLOT_MIN * 60_000) !== 0) return false;
  if (ms < now.getTime() + 10 * 60_000) return false;
  return ms <= now.getTime() + STUDY_HORIZON_HOURS * 3_600_000;
}

/** Can a member still open the room for this session? */
export function roomOpenFor(match: { startsAt: Date; endsAt: Date }, now: Date): boolean {
  return (
    now.getTime() >= match.startsAt.getTime() - STUDY_EARLY_MS &&
    now.getTime() <= match.endsAt.getTime()
  );
}
