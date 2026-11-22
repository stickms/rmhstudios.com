/**
 * Leaderboard privacy (sprint 05 #01) — the zod schemas for `/api/settings/leaderboard-privacy`.
 * Split from the contract so client code that only draws the switch does not bring zod along.
 */
import { z } from 'zod';

/** `hidden: true` leaves the member off every public game board. */
export const leaderboardPrivacySchema = z.object({
  hidden: z.boolean(),
});

export const setLeaderboardPrivacyBody = z.object({ hidden: z.boolean() }).strict();
