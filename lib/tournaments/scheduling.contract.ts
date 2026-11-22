/**
 * Contracts for match times and deadlines (s07-06). Client-safe: types only.
 * Errors carry `TournamentError`'s message, status and code (for example 409
 * `PROPOSAL_CHANGED` when the proposal being accepted was replaced).
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  AcceptTimeInput,
  AwardMatchInput,
  HostSetTimeInput,
  ProposeTimeInput,
  ScheduleSettingsInput,
} from '@/lib/tournaments/scheduling-schema';

type MatchParams = {
  id: string;
  matchId: string;
};

/** One of the two players proposes a time for the match; it replaces any live proposal. */
export const proposeMatchTimeApi = endpoint<{
  params: MatchParams;
  body: ProposeTimeInput;
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/schedule',
});

/** The opponent accepts the live proposal (named by its time). */
export const acceptMatchTimeApi = endpoint<{
  params: MatchParams;
  body: AcceptTimeInput;
  res: {
    ok: true;
    scheduledAt: string;
  };
}>()({
  method: 'PUT',
  path: '/api/tournaments/$id/matches/$matchId/schedule',
});

/** The host (or an admin) sets the time directly, or clears it with null. */
export const setMatchTimeApi = endpoint<{
  params: MatchParams;
  body: HostSetTimeInput;
  res: {
    ok: true;
  };
}>()({
  method: 'PATCH',
  path: '/api/tournaments/$id/matches/$matchId/schedule',
});

/** The host (or an admin) awards an overdue match to one of its entrants. */
export const awardMatchApi = endpoint<{
  params: MatchParams;
  body: AwardMatchInput;
  res: {
    ok: true;
    settled: boolean;
    tournamentComplete: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/award',
});

/** The host (or an admin) sets how long each match has once it is ready; null = no deadline. */
export const scheduleSettingsApi = endpoint<{
  params: {
    id: string;
  };
  body: ScheduleSettingsInput;
  res: {
    ok: true;
  };
}>()({
  method: 'PUT',
  path: '/api/tournaments/$id/schedule-settings',
});
