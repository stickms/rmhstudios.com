import { z } from 'zod';
import { ADD_BATCH_MAX, GROUP_NAME_MAX } from '@/lib/group-chat/manage';

export const renameGroupBody = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX),
});

/** Ids or handles (the server drops a leading `@`). */
export const addMembersBody = z.object({
  members: z.array(z.string().trim().min(1).max(64)).min(1).max(ADD_BATCH_MAX),
});

export const transferOwnerBody = z.object({
  userId: z.string().min(1).max(64),
});
