/** Contracts for community bans and timeouts (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { MyStandingDTO, SanctionDTO } from '@/lib/communities/bans';
import type { createSanctionBody, listSanctionsQuery } from './bans-schema';

/** Moderators only. `status=active` (default) or `past` (the last 100 lifted or expired). */
export const listSanctionsApi = endpoint<{
  query: z.infer<typeof listSanctionsQuery>;
  res: {
    sanctions: SanctionDTO[];
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/bans',
});

/** 201. Replaces the member's active sanction, if any. */
export const createSanctionApi = endpoint<{
  body: z.infer<typeof createSanctionBody>;
  res: {
    success: true;
    id: string;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/bans',
});

/** Lift early (moderators only). */
export const liftSanctionApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/communities/$slug/bans/$banId',
});

/** The caller's own active sanction, without the private reason. */
export const myStandingApi = endpoint<{
  res: {
    standing: MyStandingDTO | null;
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/my-standing',
});
