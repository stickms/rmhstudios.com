/**
 * What the page does when the account behind a running machine changes or goes away (another tab
 * signed out, the cookie expired, a different account signed in). There is no browser unload to
 * warn about it and the machine's files belong to the OLD account, so the order is: one bounded
 * save for the old account while its machine is still up, then the machine goes. Pure functions
 * so the rule is testable without React.
 */

/**
 * `follow`: the account differs from the one the machine runs for, and that is known (while the
 * session is still being asked, a missing user is not yet a sign-out). `none` otherwise.
 */
export function accountChange(
  userId: string | null,
  machineUser: string | null,
  sessionPending: boolean,
): 'none' | 'follow' {
  if (userId === machineUser) return 'none';
  if (sessionPending && !userId) return 'none';
  return 'follow';
}

/** The slice of HomeSession this needs. */
export interface Leavable {
  saveBeforeLeaving(timeoutMs: number): Promise<boolean>;
}

/**
 * Tries the last save for the old account (if a machine is running), then hands over. A save
 * that throws does not hold the machine up. `isCancelled` is checked after the save: a newer
 * change of account supersedes this one.
 */
export async function leaveAccount(
  runner: Leavable | null,
  timeoutMs: number,
  isCancelled: () => boolean,
  handOver: () => void,
): Promise<{ saved: boolean | null }> {
  const saved = await attempt(runner, timeoutMs);
  if (!isCancelled()) handOver();
  return { saved };
}

async function attempt(runner: Leavable | null, timeoutMs: number): Promise<boolean | null> {
  if (!runner) return null;
  try {
    return await runner.saveBeforeLeaving(timeoutMs);
  } catch {
    return false;
  }
}
