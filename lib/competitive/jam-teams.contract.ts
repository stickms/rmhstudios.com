/**
 * Contracts for game jam teams (client-safe; types by `import type`). A refused call answers
 * `{ error, code }` (see `teamRefusalMessage` in `jam-teams.ts`); read the code with `errorField(e, 'code')`
 * and, for `already-on-entry`, the entry's title with `errorField(e, 'entry')`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { TeamEntryDTO } from '@/lib/competitive/jam-teams';
import type { inviteTeammateBody, respondTeamBody } from '@/lib/competitive/jam-teams-schema';

/** The team the viewer may see: the submitter reads every row, anyone else the accepted ones and their own. */
export const listTeamApi = endpoint<{
  params: { slug: string; entryId: string };
  res: { team: TeamEntryDTO[]; max: number };
}>()({ method: 'GET', path: '/api/jams/$slug/entries/$entryId/team' });

/** The submitter invites a member (repeating an invitation changes nothing). */
export const inviteTeammateApi = endpoint<{
  params: { slug: string; entryId: string };
  body: z.infer<typeof inviteTeammateBody>;
  res: { member: TeamEntryDTO };
}>()({ method: 'POST', path: '/api/jams/$slug/entries/$entryId/team' });

/** The submitter removes a teammate or withdraws an invitation; a member removes their own row (leaves). */
export const removeTeammateApi = endpoint<{
  params: { slug: string; entryId: string };
  query: { userId: string };
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/jams/$slug/entries/$entryId/team' });

/** The invited member accepts or declines. */
export const respondTeamApi = endpoint<{
  params: { slug: string; entryId: string };
  body: z.infer<typeof respondTeamBody>;
  res: { success: true; accept: boolean };
}>()({ method: 'POST', path: '/api/jams/$slug/entries/$entryId/team/respond' });
