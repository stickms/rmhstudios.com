/**
 * Markers for accounts that have been deleted-in-place.
 *
 * `POST /api/account/delete` doesn't drop the `user` row — foreign keys across
 * ~250 tables point at it — so it anonymizes the record instead: name becomes
 * "Deleted user", the PII columns are nulled, and the account is locked with a
 * sentinel ban. These two constants are the contract for "this row is a
 * tombstone, not a person", so sweeps that repopulate user columns can skip it.
 */

/** `user.banReason` written when an account is deleted in place. */
export const DELETED_ACCOUNT_BAN_REASON = 'account_deleted';

/** `user.bannedUntil` for a deleted account — effectively permanent. */
export const DELETED_ACCOUNT_LOCK_UNTIL = new Date('9999-12-31T00:00:00.000Z');

/** True when the row is a deletion tombstone rather than a live account. */
export function isDeletedAccount(user: { banReason?: string | null }): boolean {
  return user.banReason === DELETED_ACCOUNT_BAN_REASON;
}
