import { z } from 'zod';
import type { ResolvedUser } from '@/lib/user-display';

/** Profile guestbook (plan U15) — client-safe contract. */

export const GUESTBOOK_MODES = ['off', 'following', 'everyone'] as const;
export type GuestbookMode = (typeof GUESTBOOK_MODES)[number];

export const GUESTBOOK_BODY_MAX = 280;
export const GUESTBOOK_PAGE = 20;

export const signGuestbookSchema = z.object({
  body: z.string().trim().min(1).max(GUESTBOOK_BODY_MAX),
});

export const guestbookModeSchema = z.object({
  mode: z.enum(GUESTBOOK_MODES),
});

export function isGuestbookMode(v: unknown): v is GuestbookMode {
  return typeof v === 'string' && (GUESTBOOK_MODES as readonly string[]).includes(v);
}

export interface GuestbookEntryView {
  id: string;
  body: string;
  createdAt: string;
  author: ResolvedUser;
  /** Only ever true in the owner's own view. */
  hidden: boolean;
}

export interface GuestbookPage {
  mode: GuestbookMode;
  isOwner: boolean;
  /** Whether the viewer may sign right now (mode, follow, blocks, daily limit aside). */
  canSign: boolean;
  entries: GuestbookEntryView[];
  nextCursor: string | null;
}
