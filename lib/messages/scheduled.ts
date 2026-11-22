/**
 * Scheduled direct and group messages (s03-12): the rules, with no database.
 * Client-safe. The server half is `scheduled.server.ts`; the strings that
 * explain a failure live in `components/messages` (this module names the code,
 * the component translates it).
 */

import { addDays, wallTimeOf, wallToUtcMs } from '@/lib/calendar/tz';
import type { GroupMessagePayload } from '@/lib/group-events';
import type { SentDirectMessage } from '@/lib/messages/messages.contract';

export const MIN_LEAD_MS = 60_000;
export const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
/** Pending (and failed) rows a member may hold at once. */
export const MAX_PENDING = 20;
/** A row stuck in `sending` this long is picked up again. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;
/** Deliveries one cron run attempts. */
export const MAX_PER_RUN = 500;
/** A stuck row is retried once: a second claim is the last. */
export const MAX_ATTEMPTS = 2;

/** The local hour the Tomorrow and Monday presets send at. */
export const PRESET_HOUR = 9;

export const SCHEDULED_STATUSES = ['pending', 'sending', 'failed'] as const;
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

/**
 * Why a delivery did not happen. `cannot-message` covers the recipient's DM
 * privacy; `blocked` a block in either direction; `not-member` leaving or
 * losing the conversation; `error` a delivery that stayed stuck.
 */
export const FAIL_CODES = [
  'restricted',
  'not-member',
  'blocked',
  'cannot-message',
  'invalid-image',
  'invalid',
  'error',
] as const;
export type ScheduledFailCode = (typeof FAIL_CODES)[number];

export function isFailCode(value: string | null | undefined): value is ScheduledFailCode {
  return !!value && (FAIL_CODES as readonly string[]).includes(value);
}

export type SendAtProblem = 'too-soon' | 'too-far';

/** `null` when `sendAtMs` lies between a minute and thirty days from `nowMs`. */
export function sendAtProblem(sendAtMs: number, nowMs: number): SendAtProblem | null {
  if (!Number.isFinite(sendAtMs) || sendAtMs < nowMs + MIN_LEAD_MS) return 'too-soon';
  if (sendAtMs > nowMs + MAX_LEAD_MS) return 'too-far';
  return null;
}

export interface SendLaterPresets {
  /** Tomorrow at 09:00 in the sender's zone (UTC ms). */
  tomorrow: number;
  /** The next Monday at 09:00, never today even on a Monday (UTC ms). */
  monday: number;
}

/**
 * The preset instants for a sender in `tz`. Computed on the sender's calendar,
 * so a message written at 23:30 on a Sunday still offers Tomorrow (Monday) and
 * the Monday after it. `wallToUtcMs` resolves a time a spring-forward skips to
 * the instant after the gap.
 */
export function sendLaterPresets(nowMs: number, tz: string): SendLaterPresets {
  const now = wallTimeOf(nowMs, tz);
  const today = `${String(now.y).padStart(4, '0')}-${String(now.mo).padStart(2, '0')}-${String(now.d).padStart(2, '0')}`;
  const at = (day: string): number => {
    const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
    return wallToUtcMs(
      {
        y,
        mo,
        d,
        h: PRESET_HOUR,
        mi: 0,
      },
      tz,
    );
  };
  const untilMonday = (1 - now.weekday + 7) % 7 || 7;
  return {
    tomorrow: at(addDays(today, 1)),
    monday: at(addDays(today, untilMonday)),
  };
}

/** First line of a message, for the strip; media-only messages return an empty string. */
export function firstLine(content: string): string {
  return (
    content
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim() ?? ''
  );
}

/** The message a delivery created: a direct or a group message payload, as the thread appends it. */
export type SentMessage = SentDirectMessage | GroupMessagePayload;

/** One of the member's scheduled messages, as the strip and the inbox read it. `sending` reads as `pending`. */
export interface ScheduledMessageRow {
  id: string;
  chatId: string;
  content: string;
  gifUrl: string | null;
  gifAlt?: string | null;
  imageUrls: string[];
  /** One description per image ('' = none); the same length as `imageUrls`. */
  imageAlts: string[];
  /** ISO instant. */
  sendAt: string;
  status: 'pending' | 'failed';
  failCode: ScheduledFailCode | null;
}
