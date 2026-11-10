/**
 * Contracts for /api/lists (redesign audit C1). Client-safe: request types come
 * from the zod schemas in `constants.ts` and response types from
 * `lists.server.ts`, both by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  ListView,
  listCreateSchema,
  listMemberSchema,
  listUpdateSchema,
} from '@/lib/lists/constants';
import type { ListDetail, ListTimelinePost } from '@/lib/lists/lists.server';

type Ok = { ok: true };
type MemberBody = z.infer<typeof listMemberSchema>;

/** The caller's lists. With `member`, each row also says whether that user is on it. */
export const getUserListsApi = endpoint<{
  query: { member?: string };
  res: { lists: (ListView & { containsTarget?: boolean })[] };
}>()({ method: 'GET', path: '/api/lists' });

export const createListApi = endpoint<{
  body: z.infer<typeof listCreateSchema>;
  res: { list: ListView };
}>()({ method: 'POST', path: '/api/lists' });

export const getListDetailApi = endpoint<{ res: ListDetail }>()({
  method: 'GET',
  path: '/api/lists/$id',
});

export const updateListApi = endpoint<{
  body: z.infer<typeof listUpdateSchema>;
  res: Ok;
}>()({ method: 'PATCH', path: '/api/lists/$id' });

export const deleteListApi = endpoint<{ res: Ok }>()({
  method: 'DELETE',
  path: '/api/lists/$id',
});

export const addListMemberApi = endpoint<{ body: MemberBody; res: Ok }>()({
  method: 'PUT',
  path: '/api/lists/$id/members',
});

/** The owner removes anyone; a member may remove themselves. */
export const removeListMemberApi = endpoint<{ body: MemberBody; res: Ok }>()({
  method: 'DELETE',
  path: '/api/lists/$id/members',
});

export const listFeedApi = endpoint<{
  query: { cursor?: string };
  res: { items: ListTimelinePost[]; nextCursor: string | null };
}>()({ method: 'GET', path: '/api/lists/$id/feed' });
