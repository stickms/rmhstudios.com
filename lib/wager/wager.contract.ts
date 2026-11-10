/** Contracts for /api/wager (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createWagerSchema } from '@/lib/wager/wager-schema';
import type { SerializedWager } from '@/lib/wager/wager.server';

export const listWagersApi = endpoint<{
  query: { filter?: string | undefined; game?: string | undefined };
  res: { wagers: SerializedWager[] };
}>()({ method: 'GET', path: '/api/wager' });

export const getWagerApi = endpoint<{
  params: { id: string };
  res: { wager: SerializedWager };
}>()({ method: 'GET', path: '/api/wager/$id' });

export const createWagerApi = endpoint<{
  body: z.infer<typeof createWagerSchema>;
  res: { wager: SerializedWager };
}>()({ method: 'POST', path: '/api/wager' });
