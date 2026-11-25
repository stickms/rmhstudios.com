/**
 * Contracts for /api/connections/grids/** (redesign audit C1, batch 5).
 * Client-safe: request types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { GridGroup, GridPlayView, GridSummary, MyGridSummary } from '@/lib/party/connections';
import type {
  editGridSchema,
  guessSchema,
  rateSchema,
  saveGridSchema,
  scheduleSchema,
} from '@/lib/party/connections-schema';

/** Today's daily, the top-rated and the newest grids. Public. */
export const listConnectionGridsApi = endpoint<{
  res: {
    daily: GridSummary | null;
    top: GridSummary[];
    recent: GridSummary[];
  };
}>()({
  method: 'GET',
  path: '/api/connections/grids',
});

/** 201 with the new id; 4xx carries the reason (limit reached, duplicate…). `draft: true` saves it unpublished. */
export const createConnectionGridApi = endpoint<{
  body: z.infer<typeof saveGridSchema>;
  res: {
    id: string;
  };
}>()({
  method: 'POST',
  path: '/api/connections/grids',
});

/** The grid to play (no answers) with the caller's progress. 404 when it is gone. */
export const getConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  res: {
    grid: GridPlayView;
  };
}>()({
  method: 'GET',
  path: '/api/connections/grids/$id',
});

/** Author (or an admin) removes it. 404 when it is not theirs. */
export const deleteConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/connections/grids/$id',
});

/** Checks four items server-side. */
export const guessConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  body: z.infer<typeof guessSchema>;
  res: {
    ok: true;
    correct: boolean;
    oneAway: boolean;
    group: {
      index: number;
      label: string;
      items: string[];
    } | null;
    mistakes: number;
    state: 'active' | 'solved' | 'failed';
    solution: GridGroup[] | null;
  };
}>()({
  method: 'POST',
  path: '/api/connections/grids/$id/guess',
});

/** 1-5 stars; 409 until the grid is finished. */
export const rateConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  body: z.infer<typeof rateSchema>;
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/connections/grids/$id/rate',
});

/** Admin: make the grid the daily for a UTC date (`null` clears it). */
export const scheduleConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  body: z.infer<typeof scheduleSchema>;
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/connections/grids/$id/schedule',
});

/** The author changes a draft, or a grid nobody else has played. 409 once another member has played it. */
export const editConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  body: z.infer<typeof editGridSchema>;
  res: {
    ok: true;
  };
}>()({
  method: 'PATCH',
  path: '/api/connections/grids/$id',
});

/** The author publishes a complete draft. 400 while a group or item is still empty. */
export const publishConnectionGridApi = endpoint<{
  params: {
    id: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/connections/grids/$id/publish',
});

/** The caller's own grids, drafts first, with each published grid's figures. Private. */
export const myConnectionGridsApi = endpoint<{
  res: {
    grids: MyGridSummary[];
  };
}>()({
  method: 'GET',
  path: '/api/connections/mine',
});
