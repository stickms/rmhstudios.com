/**
 * Contracts for /api/scheduled/** (redesign audit C1, batch 3). Client-safe:
 * request types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CapsuleRow } from '@/lib/posts-plus/capsules.server';
import type { ScheduledRow } from '@/lib/scheduled/list.server';
import type {
  createScheduledSchema,
  patchScheduledSchema,
} from '@/lib/scheduled/scheduled-schema';

/** The viewer's drafts and scheduled posts (publishes any that are due first). */
export const listScheduledApi = endpoint<{
  res: { drafts: ScheduledRow[]; scheduled: ScheduledRow[] };
}>()({ method: 'GET', path: '/api/scheduled' });

/** 201: the saved row. A draft has no `scheduledAt`; `capsule` seals it until then. */
export const createScheduledApi = endpoint<{
  body: z.infer<typeof createScheduledSchema>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/scheduled' });

export const updateScheduledApi = endpoint<{
  body: z.infer<typeof patchScheduledSchema>;
  res: { id: string };
}>()({ method: 'PATCH', path: '/api/scheduled/$id' });

export const discardScheduledApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/scheduled/$id',
});

/** Publish a draft or scheduled post right now. */
export const publishScheduledApi = endpoint<{ res: { success: true; postId: string | null } }>()({
  method: 'POST',
  path: '/api/scheduled/$id/publish',
});

/** Sealed time capsules and recently opened ones. */
export const listCapsulesApi = endpoint<{
  res: { sealed: CapsuleRow[]; opened: CapsuleRow[] };
}>()({ method: 'GET', path: '/api/scheduled/capsules' });
