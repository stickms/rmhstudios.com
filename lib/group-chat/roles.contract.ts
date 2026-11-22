/**
 * Contract for group chat admins (s07-04). Client-safe: types come from the zod schema by `import type`.
 * `$id` is the group id; `$userId` a member.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { setAdminBody } from '@/lib/group-chat/roles-schema';

/** Owner only: make a member an admin or take it back. 409 `ADMIN_LIMIT` for a sixth admin; 404 for a non-member. */
export const setGroupAdminApi = endpoint<{
  body: z.infer<typeof setAdminBody>;
  res: {
    success: true;
    admin: boolean;
  };
}>()({
  method: 'PUT',
  path: '/api/group-chats/$id/members/$userId/role',
});
