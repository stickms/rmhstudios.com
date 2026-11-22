/** Request schemas for the community rules endpoints (shared by the routes and `rules.contract.ts`). */
import { z } from 'zod';
import { RULES_MAX, RULE_DESCRIPTION_MAX, RULE_TITLE_MAX } from '@/lib/communities/rules';

export const ruleInputSchema = z.object({
  /** An existing rule's id, to keep it; omitted for a new one. */
  id: z.string().min(1).max(64).optional(),
  title: z.string().trim().min(1).max(RULE_TITLE_MAX),
  description: z.string().trim().max(RULE_DESCRIPTION_MAX).nullable().optional(),
});

/** PUT: the whole ordered list; rules missing from it are deleted. */
export const saveRulesBody = z.object({
  rules: z.array(ruleInputSchema).max(RULES_MAX),
  requireAgreement: z.boolean(),
});

/** POST: report a post to the community's moderators for breaking a rule. */
export const reportToModsBody = z.object({
  postId: z.string().min(1).max(64),
  ruleId: z.string().min(1).max(64),
});
