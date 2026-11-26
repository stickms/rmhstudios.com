/** Contracts for Dream Rift's score submits (redesign audit C1, batch 7). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { coopBoardQuery, coopFinishBody, coopMineQuery } from './coop-schema';
import type { CoopBoardEntry, MyCoopRunsPage } from './coop-runs';

/** Personal high score; the server derives the display name from the account. */
export const submitDreamRiftScoreApi = endpoint<{
  body: {
    score: number;
    difficulty: string;
    stage: number;
    character: string;
    graze: number;
    spellsCaptured: number;
  };
  res: {
    success: true;
    linked?: true;
    created?: true;
    /** False when the run was assisted: it never reached the board. */
    ranked: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/dream-rift/score',
});

/**
 * The host files the co-op run the hub started (2-4 players), once. The body names no account: the run's accounts are
 * the ones the hub recorded by slot. A run that is unknown, already filed, not the caller's or too old is refused
 * (`COOP_RUN_UNKNOWN`).
 */
export const submitDreamRiftCoopApi = endpoint<{
  body: z.infer<typeof coopFinishBody>;
  res: {
    success: true;
  };
}>()({
  method: 'POST',
  path: '/api/dream-rift/coop',
});

/** The co-op board: the top 20 finished runs, every name resolved at read time under board privacy. */
export const listDreamRiftCoopApi = endpoint<{
  query: z.infer<typeof coopBoardQuery>;
  res: CoopBoardEntry[];
}>()({
  method: 'GET',
  path: '/api/dream-rift/coop',
});

/** The caller's own finished co-op runs, newest first, 20 a page. The other players are current names only. */
export const listMyDreamRiftCoopApi = endpoint<{
  query: z.infer<typeof coopMineQuery>;
  res: MyCoopRunsPage;
}>()({
  method: 'GET',
  path: '/api/dream-rift/coop/mine',
});
