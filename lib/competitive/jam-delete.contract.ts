/**
 * The admin's jam delete (s15-13). It is not in `jams.contract.ts`: the `/jams` route loaders import that file, so
 * whatever it holds is in the client entry on every page, while only the lazy jam page and the server route read this.
 */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Admin only: delete a jam that has not started and has no entries. Candidates, votes and suggestions go with it.
 * Refused with `JAM_DELETE_STARTED` once it has started or has an entry.
 */
export const deleteJamApi = endpoint<{
  params: {
    slug: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/jams/$slug',
});
