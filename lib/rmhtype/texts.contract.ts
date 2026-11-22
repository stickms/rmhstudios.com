/** Contracts for the RMHType saved-text endpoints (s10-05). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { GhostSaveOutcome } from '@/lib/rmhtype/ghost-save.server';
import type { TextDetail, TextRunRow, TextSummary } from '@/lib/rmhtype/texts';
import type { createTextBody, textRunBody, updateTextBody } from '@/lib/rmhtype/texts-schema';

/** The caller's texts, most recently changed first. */
export const listRmhTypeTextsApi = endpoint<{ res: { texts: TextSummary[] } }>()({
  method: 'GET',
  path: '/api/rmhtype/texts',
});

/** Save a text. 409 when the caller already keeps 50. */
export const createRmhTypeTextApi = endpoint<{
  body: z.infer<typeof createTextBody>;
  res: { text: TextDetail };
}>()({ method: 'POST', path: '/api/rmhtype/texts' });

/** One of the caller's texts with its body and its last 50 runs, oldest first. Another member's id is 404. */
export const getRmhTypeTextApi = endpoint<{
  res: { text: TextDetail; runs: TextRunRow[] };
}>()({ method: 'GET', path: '/api/rmhtype/texts/$textId' });

/** Rename a text and/or change its body. A changed body resets the bests and deletes the runs and the ghost. */
export const updateRmhTypeTextApi = endpoint<{
  body: z.infer<typeof updateTextBody>;
  res: { text: TextDetail; reset: boolean };
}>()({ method: 'PATCH', path: '/api/rmhtype/texts/$textId' });

/** Delete a text, its runs and its ghost. */
export const deleteRmhTypeTextApi = endpoint<{ res: { deleted: true } }>()({
  method: 'DELETE',
  path: '/api/rmhtype/texts/$textId',
});

/** Record one finished run on a text. Reaches no board, XP, streak, daily entry, profile or achievement. */
export const recordRmhTypeTextRunApi = endpoint<{
  body: z.infer<typeof textRunBody>;
  res: { text: TextSummary; newBest: boolean; ghost: GhostSaveOutcome | 'none' };
}>()({ method: 'POST', path: '/api/rmhtype/texts/$textId/runs' });
