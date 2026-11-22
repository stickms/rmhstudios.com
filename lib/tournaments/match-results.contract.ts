/**
 * Contracts for confirming, disputing, withdrawing and deciding a tournament
 * match result (s06-20). Client-safe: types only. A participant's first report
 * still goes through `reportTournamentMatchApi` and becomes a claim.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DecideResultInput, DisputeResultInput } from '@/lib/tournaments/match-results-schema';

type Settled = {
  ok: true;
  settled: boolean;
  tournamentComplete: boolean;
};

/** The opponent confirms the claimed result: the match settles. */
export const confirmMatchResultApi = endpoint<{
  params: {
    id: string;
    matchId: string;
  };
  res: Settled;
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/confirm',
});

/** The opponent disputes the claimed result: the host decides. */
export const disputeMatchResultApi = endpoint<{
  params: {
    id: string;
    matchId: string;
  };
  body: DisputeResultInput;
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/dispute',
});

/** The claimant takes their claim back before it is answered. */
export const withdrawMatchClaimApi = endpoint<{
  params: {
    id: string;
    matchId: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/withdraw',
});

/** The host (or an admin) decides a claim or a dispute. */
export const decideMatchResultApi = endpoint<{
  params: {
    id: string;
    matchId: string;
  };
  body: DecideResultInput;
  res: Settled;
}>()({
  method: 'POST',
  path: '/api/tournaments/$id/matches/$matchId/decide',
});
