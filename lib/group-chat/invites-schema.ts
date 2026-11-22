import { z } from 'zod';
import { INVITE_CODE_LENGTH } from '@/lib/group-chat/invites';

/** Expiry in days (null = never) and maximum uses (null = unlimited): only the offered values are accepted. */
export const createInviteBody = z.object({
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]),
  maxUses: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(25), z.null()]),
});

export const inviteCodeParam = z.string().length(INVITE_CODE_LENGTH);
