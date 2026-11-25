/** Contract for the admin impersonation claims (sprint 14, feature 09). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';

/** One other account that claims a website the reported account also claims. */
export interface ClaimingAccount {
  userId: string;
  handle: string | null;
  name: string | null;
  /** The other account has proved the website (its page links back to the profile). */
  verified: boolean;
}

export interface ClaimedHost {
  host: string;
  /** The reported account has proved this website. */
  verified: boolean;
  /** At most 10, verified claims first. */
  others: ClaimingAccount[];
}

/** Admin only: the websites a reported account claims, each with the other accounts that claim it. */
export const reportClaimsApi = endpoint<{
  query: { userId: string };
  res: { hosts: ClaimedHost[] };
}>()({
  method: 'GET',
  path: '/api/admin/reports/claims',
});
