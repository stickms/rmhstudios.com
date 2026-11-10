/**
 * Contracts for the /api/tournaments reads (redesign audit C1, batch 8): the
 * list and one tournament. The writes (create, register, report, ...) answer
 * through `TournamentError` with bespoke bodies and stay raw. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

/** Same list for everyone, keyed by `?status=` (REGISTRATION, LIVE or COMPLETE; anything else lists all but cancelled). */
export const listTournamentsApi = endpoint<{
  query: { status?: string | undefined };
  res: { tournaments: SerializedTournament[] };
}>()({ method: 'GET', path: '/api/tournaments' });

/** One tournament with entrants, matches and payouts. 404 when unknown. */
export const getTournamentApi = endpoint<{
  params: { id: string };
  res: { tournament: SerializedTournament };
}>()({ method: 'GET', path: '/api/tournaments/$id' });
