/** Contracts for self-service account deletion (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/** Schedule erasure (30-day grace). 400 `{ error }` when the confirmation does not match. */
export const deleteAccountApi = endpoint<{
  body: {
    confirm: string;
  };
  res: {
    success: true;
    scheduledAt: string;
    graceDays: number;
    /** Every session is already deleted; the client signs out locally. */
    signOut: true;
  };
}>()({
  method: 'POST',
  path: '/api/account/delete',
});
