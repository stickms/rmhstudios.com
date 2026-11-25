/** Contracts for read-alongs (s11-09; client-safe, types by `import type`). A moderator starts one; members join. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BookChoiceDTO, PlanDTO, ReadAlongPageDTO, ReadAlongSummaryDTO } from '@/lib/communities/read-along';
import type { joinReadAlongBody, progressBody, startReadAlongBody, updateReadAlongBody } from './read-along-schema';

/** The community's read-alongs that are running, paused or finished (not cancelled), for its readers. */
export const listReadAlongsApi = endpoint<{
  res: {
    readAlongs: ReadAlongSummaryDTO[];
    maxActive: number;
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/read-alongs',
});

/** 201, moderators only. A third active read-along is a 409 `READ_ALONG_CAP`. */
export const startReadAlongApi = endpoint<{
  body: z.infer<typeof startReadAlongBody>;
  res: {
    readAlong: ReadAlongSummaryDTO;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/read-alongs',
});

/** Library books the community can read, by title (moderators only). */
export const readAlongBooksApi = endpoint<{
  query: {
    q?: string;
  };
  res: {
    books: BookChoiceDTO[];
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/read-alongs/books',
});

/** The suggested parts for a book: its table of contents grouped, or equal page ranges (moderators only). */
export const readAlongPlanApi = endpoint<{
  query: {
    doc: string;
    parts?: number;
    word?: string;
  };
  res: PlanDTO;
}>()({
  method: 'GET',
  path: '/api/communities/$slug/read-alongs/plan',
});

/** The read-along page. An unknown id, and one in a private community the viewer is not in, answer the same 404. */
export const getReadAlongApi = endpoint<{
  res: {
    readAlong: ReadAlongPageDTO;
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/read-alongs/$id',
});

/** Moderators: replace the parts before the first opens, cancel, or resume a paused read-along. */
export const updateReadAlongApi = endpoint<{
  body: z.infer<typeof updateReadAlongBody>;
  res: {
    readAlong: ReadAlongSummaryDTO;
  };
}>()({
  method: 'PATCH',
  path: '/api/communities/$slug/read-alongs/$id',
});

/** Join (or change "Tell me when a part opens" when already joined). */
export const joinReadAlongApi = endpoint<{
  body: z.infer<typeof joinReadAlongBody>;
  res: {
    success: true;
    notify: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/read-alongs/$id/join',
});

export const leaveReadAlongApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/communities/$slug/read-alongs/$id/join',
});

/** "I've finished this part": the reader's own last finished part. */
export const readAlongProgressApi = endpoint<{
  body: z.infer<typeof progressBody>;
  res: {
    success: true;
    lastPartDone: number;
  };
}>()({
  method: 'PUT',
  path: '/api/communities/$slug/read-alongs/$id/progress',
});
