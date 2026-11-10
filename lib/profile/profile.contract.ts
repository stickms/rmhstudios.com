/**
 * Contract for GET /api/profile/:id (redesign audit C1). Client-safe: the
 * payload type is imported with `import type`, which is erased at build time.
 * `:id` is a user id or handle; 404 when nothing answers to it.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { ProfilePayload } from '@/lib/profile.server';

export const getProfileApi = endpoint<{ res: ProfilePayload }>()({
  method: 'GET',
  path: '/api/profile/$id',
});
