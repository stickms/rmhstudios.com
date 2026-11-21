/** Request bodies for the ownership handover endpoints (shared by the routes and `handover.contract.ts`). */
import { z } from 'zod';

export const offerHandoverBody = z.object({
  /** The moderator being offered the community. */
  toId: z.string().min(1).max(64),
});

export const respondHandoverBody = z.object({
  action: z.enum(['accept', 'decline']),
});

export const assignOwnerBody = z.object({
  /** The moderator who becomes the owner. */
  userId: z.string().min(1).max(64),
});
