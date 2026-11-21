/**
 * Contracts for tournament seeding (s05-18). Client-safe: types only. Errors
 * carry `TournamentError`'s message and status.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SeedingView } from '@/lib/tournaments/seeding';
import type { UpdateSeedingInput } from '@/lib/tournaments/seeding-schema';

/**
 * The method and the entrants in projected seed order. The host (or an admin)
 * also sees a manual order; everyone else sees none of it before the start.
 */
export const getSeedingApi = endpoint<{
  params: { id: string };
  res: SeedingView;
}>()({ method: 'GET', path: '/api/tournaments/$id/seeding' });

/** The host (or an admin) sets the method and/or the hand order while registration is open. */
export const updateSeedingApi = endpoint<{
  params: { id: string };
  body: UpdateSeedingInput;
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/tournaments/$id/seeding' });
