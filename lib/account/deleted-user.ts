/**
 * The "Deleted user" account that owns every vibe whose creator deleted their account.
 *
 * Client-safe on purpose (no prisma): the id is a well-known constant, not a secret. The row
 * itself is created by the `deleted_user_owner` migration and is marked exactly like any other
 * deletion tombstone (`banReason` = `DELETED_ACCOUNT_BAN_REASON`, locked until the end of time),
 * so every place that hides or labels tombstones treats it the same. It has no email, password,
 * sessions, accounts or passkeys, so nobody can ever sign in as it.
 */
export const DELETED_USER_ID =
  'deleted-user';

/** True for the shared "Deleted user" sentinel row itself (not for an individual tombstone). */
export function isDeletedUserSentinel(
  userId:
    | string
    | null
    | undefined,
): boolean {
  return (
    userId ===
    DELETED_USER_ID
  );
}
