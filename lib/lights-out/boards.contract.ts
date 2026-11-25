/**
 * Contracts for /api/lights-out/b/** — member-made Lights Out boards. Client-safe: request types come from the zod
 * schemas by `import type`, so no zod ships to the page.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BoardSummary, BoardView } from '@/lib/lights-out/boards';
import type { createBoardSchema, listBoardsQuery, solveBoardSchema } from '@/lib/lights-out/boards-schema';

/** One page (25) of boards: recent, most played, or the caller's own. Private (it depends on blocks). */
export const listLightsOutBoardsApi = endpoint<{
  query: z.infer<typeof listBoardsQuery>;
  res: { items: BoardSummary[]; nextCursor: string | null };
}>()({
  method: 'GET',
  path: '/api/lights-out/b',
});

/** Publish a board. 201 with the id and the exact optimum; 400 when it cannot be published, 409 at a cap. */
export const createLightsOutBoardApi = endpoint<{
  body: z.infer<typeof createBoardSchema>;
  res: { id: string; optimalMoves: number };
}>()({
  method: 'POST',
  path: '/api/lights-out/b',
});

/** The board to play with its fewest-moves list and the caller's own record. 404 when the caller may not see it. */
export const getLightsOutBoardApi = endpoint<{
  res: { board: BoardView };
}>()({
  method: 'GET',
  path: '/api/lights-out/b/$id',
});

/** The author deletes their board. 404 when it is not theirs. */
export const deleteLightsOutBoardApi = endpoint<{
  res: { ok: true };
}>()({
  method: 'DELETE',
  path: '/api/lights-out/b/$id',
});

/** The member's first press: counts a play, once. */
export const playLightsOutBoardApi = endpoint<{
  res: { ok: true; counted: boolean };
}>()({
  method: 'POST',
  path: '/api/lights-out/b/$id/play',
});

/** The press sequence of a finished attempt. The server replays it; the count it records is the sequence's length. */
export const solveLightsOutBoardApi = endpoint<{
  body: z.infer<typeof solveBoardSchema>;
  res: { ok: true; moves: number; best: number; improved: boolean; optimalMoves: number };
}>()({
  method: 'POST',
  path: '/api/lights-out/b/$id/solve',
});
