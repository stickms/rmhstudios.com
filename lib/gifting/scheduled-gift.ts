/**
 * Scheduled gift delivery (C7) — client-safe schema, limits and view types.
 *
 * Steam's gift scheduling for the cosmetics shop: pay now, arrive later,
 * wrapped. The recipient sees the gift as a closed box until they open it.
 */
import { z } from 'zod';

export const SCHEDULE_MIN_LEAD_MS = 5 * 60_000;
export const SCHEDULE_MAX_LEAD_MS = 366 * 86_400_000;
export const SCHEDULED_GIFT_MAX_PENDING = 20;

export const scheduleGiftSchema = z.object({
  /** Recipient's @handle, with or without the leading @. */
  recipient: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((s) => s.replace(/^@/, '')),
  itemId: z.string().min(1).max(64),
  /** ISO datetime the gift should arrive. */
  deliverAt: z.string().datetime(),
  message: z.string().trim().max(200).optional(),
});
export type ScheduleGiftInput = z.infer<typeof scheduleGiftSchema>;

export type ScheduledGiftStatus = 'SCHEDULED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

export interface ScheduledGiftParty {
  id: string;
  name: string | null;
  handle: string | null;
}

export interface SentGiftView {
  id: string;
  itemId: string;
  itemName: string;
  price: number;
  recipient: ScheduledGiftParty | null;
  deliverAt: string;
  status: ScheduledGiftStatus;
  unwrapped: boolean;
}

export interface ReceivedGiftView {
  id: string;
  itemId: string;
  itemName: string;
  from: ScheduledGiftParty;
  deliveredAt: string;
  unwrapped: boolean;
  /** Only present once the gift has been opened. */
  message: string | null;
}

export interface ScheduledGiftsPayload {
  received: ReceivedGiftView[];
  sent: SentGiftView[];
}
