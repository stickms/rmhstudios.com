/** Zod schemas for the RMHType challenge endpoints (s11-12). Server-side; the contract imports types only. */
import { z } from 'zod';

export const sendChallengeBody = z.object({
  opponentId: z.string().min(1).max(40),
  passageId: z.string().min(1).max(64),
});

export const challengeParams = z.object({ id: z.string().min(1).max(40) });

export const challengeSettingsBody = z.object({ enabled: z.boolean() });
