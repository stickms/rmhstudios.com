/** Contracts for the community rules endpoints (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CommunityRulesDTO } from '@/lib/communities/rules';
import type { reportToModsBody, saveRulesBody } from './rules-schema';

/** A community's rules (a private community answers 404 to a non-member). */
export const getRulesApi = endpoint<{
  res: CommunityRulesDTO;
}>()({
  method: 'GET',
  path: '/api/communities/$slug/rules',
});

/** Mods: replace the ordered list and the agreement switch. 400 past 15 rules. */
export const saveRulesApi = endpoint<{
  body: z.infer<typeof saveRulesBody>;
  res: CommunityRulesDTO;
}>()({
  method: 'PUT',
  path: '/api/communities/$slug/rules',
});

/** Report a community post to its moderators; `alreadyReported` for a repeat. */
export const reportToModsApi = endpoint<{
  body: z.infer<typeof reportToModsBody>;
  res: {
    success: true;
    alreadyReported: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/report',
});
