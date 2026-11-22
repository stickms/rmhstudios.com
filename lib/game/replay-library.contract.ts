/** Contracts for the replay library: the member's list, a game's board, and one replay. Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { myReplaysQuery, replayBoardQuery, setReplayVisibilityBody } from './replay-library-schema';
import type { BoardReplay, LibraryReplay, MyReplaysPage } from './replay-library';
import type { ReplayView } from '@/lib/replays.server';

/** The caller's own replays, newest first, a page at a time. */
export const myReplaysApi = endpoint<{
  query: z.infer<typeof myReplaysQuery>;
  res: MyReplaysPage;
}>()({ method: 'GET', path: '/api/replays/mine' });

/** The top public replays of a game's current version. */
export const replayBoardApi = endpoint<{
  query: z.infer<typeof replayBoardQuery>;
  res: { items: BoardReplay[] };
}>()({ method: 'GET', path: '/api/replays/board' });

/** One replay (public ones to anyone, unlisted ones to their owner). */
export const getReplayApi = endpoint<{
  res: { replay: ReplayView };
}>()({ method: 'GET', path: '/api/replays/$id' });

/** Publish or unlist the caller's replay. */
export const setReplayVisibilityApi = endpoint<{
  body: z.infer<typeof setReplayVisibilityBody>;
  res: LibraryReplay;
}>()({ method: 'PATCH', path: '/api/replays/$id' });

/** Delete the caller's replay. */
export const deleteReplayApi = endpoint<{
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/replays/$id' });
