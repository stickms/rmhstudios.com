/**
 * Contracts for /api/settings/auto-delete (redesign audit C1, batch 4).
 * Client-safe: request types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { autoDeleteSchema } from '@/lib/posts-plus/schema';

type AutoDeleteBody = z.infer<typeof autoDeleteSchema>;

export interface AutoDeleteView {
  months: AutoDeleteBody['months'];
  lastRunAt: string | null;
}

/** Without `preview` the response has no `eligible`; with it, the count that window would take now. */
export const getAutoDeleteApi = endpoint<{
  query: { preview?: number | undefined };
  res: AutoDeleteView & { eligible?: number | undefined };
}>()({ method: 'GET', path: '/api/settings/auto-delete' });

export const setAutoDeleteApi = endpoint<{ body: AutoDeleteBody; res: AutoDeleteView }>()({
  method: 'PUT',
  path: '/api/settings/auto-delete',
});
