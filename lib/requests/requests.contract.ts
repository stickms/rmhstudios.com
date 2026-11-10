/**
 * Contracts for the public request board, /api/requests (redesign audit C1,
 * batch 4). Client-safe: types come from the zod schemas by `import type`.
 * Failures carry the server's `{ error }` text as the `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  FeatureRequestDTO,
  RequestBoardPage,
  requestCreateSchema,
  requestListQuerySchema,
  requestUpdateSchema,
} from '@/lib/requests/schema';

export const listRequestsApi = endpoint<{
  query: z.infer<typeof requestListQuerySchema>;
  res: RequestBoardPage;
}>()({ method: 'GET', path: '/api/requests' });

/** 201. */
export const createRequestApi = endpoint<{
  body: z.infer<typeof requestCreateSchema>;
  res: FeatureRequestDTO;
}>()({ method: 'POST', path: '/api/requests' });

export const getRequestApi = endpoint<{ res: FeatureRequestDTO }>()({
  method: 'GET',
  path: '/api/requests/$id',
});

/** Admin: status, official reply, merge target. */
export const updateRequestApi = endpoint<{
  body: z.infer<typeof requestUpdateSchema>;
  res: FeatureRequestDTO;
}>()({ method: 'PATCH', path: '/api/requests/$id' });

/** The `requestId` is the row the vote landed on (a merge target, when the row was merged). */
export const voteRequestApi = endpoint<{
  res: { requestId: string; voteCount: number; hasVoted: boolean };
}>()({ method: 'POST', path: '/api/requests/$id/vote' });
