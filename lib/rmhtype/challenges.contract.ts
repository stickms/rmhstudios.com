/** Contracts for RMHType challenges (s11-12). Client-safe: request types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ChallengeMember, ChallengeRow, ChallengeableRun, ChallengesView } from '@/lib/rmhtype/challenges';
import type { challengeSettingsBody, sendChallengeBody } from '@/lib/rmhtype/challenges-schema';

/** The caller's challenges: received, sent and the last 50 settled, with the switch. */
export const listRmhTypeChallengesApi = endpoint<{
  res: ChallengesView;
}>()({
  method: 'GET',
  path: '/api/rmhtype/challenges',
});

/**
 * Send the caller's best run on a curated passage to a mutual; 201 with the challenge. A refusal never says why a
 * member cannot be challenged (not a mutual, a block, a ban and the switch read the same).
 */
export const sendRmhTypeChallengeApi = endpoint<{
  body: z.infer<typeof sendChallengeBody>;
  res: { success: true; challenge: ChallengeRow };
}>()({
  method: 'POST',
  path: '/api/rmhtype/challenges',
});

/** The opponent declines a pending challenge. Nobody is told. */
export const declineRmhTypeChallengeApi = endpoint<{
  res: { success: true };
}>()({
  method: 'POST',
  path: '/api/rmhtype/challenges/$id/decline',
});

/** The members the caller can challenge: their mutuals, without blocks, bans or members who turned challenges off. */
export const listRmhTypeChallengeMutualsApi = endpoint<{
  res: { mutuals: ChallengeMember[] };
}>()({
  method: 'GET',
  path: '/api/rmhtype/challenges/mutuals',
});

/** The caller's own bests that can be sent: a ghost on a curated passage. */
export const listRmhTypeChallengeableRunsApi = endpoint<{
  res: { runs: ChallengeableRun[] };
}>()({
  method: 'GET',
  path: '/api/rmhtype/challenges/runs',
});

/** The switch: whether the caller accepts challenges. */
export const setRmhTypeChallengeSettingsApi = endpoint<{
  body: z.infer<typeof challengeSettingsBody>;
  res: { success: true; enabled: boolean };
}>()({
  method: 'PUT',
  path: '/api/rmhtype/challenges/settings',
});
