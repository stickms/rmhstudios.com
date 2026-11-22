/**
 * The one sign-out path (sprint 07, feature 03).
 *
 * Every place that signs a member out (account menu, globe bar, command palette, sign-in methods) and the account
 * deletion flow go through `signOutAndMaybeClear`. When the member turned on "Clear this device when I sign out", or
 * the caller forces it (a deleted account), the personal data on this device is cleared first. Studio projects and
 * samples and unsent drafts may exist only here, so when any are present the caller's `choose` asks keep-or-delete
 * before anything goes; "keep" is the safe answer and what an unanswered question means.
 *
 * Plain module: the question's wording and its dialog belong to the caller's component (every string goes through
 * `t()` there), so this file only knows the three possible answers.
 */
import { clearPersonalDeviceData } from './clear';
import { browserEnv, countUnsentWork, hasUnsentWork, type DeviceEnv, type UnsentCounts } from './inspect';
import { CLEAR_ON_SIGN_OUT_KEY } from './registry';

export type UnsentChoice = 'keep' | 'delete' | 'cancel';

/** Asks the member what to do with work that exists only on this device. */
export type ChooseUnsent = (counts: UnsentCounts) => Promise<UnsentChoice>;

export type SignOutOutcome = 'signed-out' | 'cancelled';

export function readClearOnSignOut(env: DeviceEnv = browserEnv()): boolean {
  try {
    return env.localStorage?.getItem(CLEAR_ON_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeClearOnSignOut(on: boolean, env: DeviceEnv = browserEnv()): void {
  try {
    if (on) env.localStorage?.setItem(CLEAR_ON_SIGN_OUT_KEY, '1');
    else env.localStorage?.removeItem(CLEAR_ON_SIGN_OUT_KEY);
  } catch {
    // Storage is blocked: the choice cannot be remembered, and nothing is cleared.
  }
}

export interface SignOutOptions {
  /** Performs the actual `authClient.signOut(...)`, with the caller's own redirect. */
  signOut: () => Promise<unknown>;
  /** The keep-or-delete question, asked only when unsent work exists. */
  choose: ChooseUnsent;
  /** Clear whatever the switch says: an account deletion. */
  force?: boolean;
  /** Never clear: signing in again right away (the sign-in methods page). */
  skipClear?: boolean;
  /**
   * What "Cancel" means. `abort` (sign-out): nothing happens at all. `keep` (account deletion, which already
   * happened on the server): the work is kept and the sign-out goes on.
   */
  cancelMeans?: 'abort' | 'keep';
  env?: DeviceEnv;
}

export async function signOutAndMaybeClear(options: SignOutOptions): Promise<SignOutOutcome> {
  const env = options.env ?? browserEnv();
  const wantsClear = options.skipClear !== true && (options.force === true || readClearOnSignOut(env));
  if (wantsClear) {
    let includeUnsent = false;
    try {
      const counts = await countUnsentWork(env);
      if (hasUnsentWork(counts)) {
        const choice = await options.choose(counts);
        if (choice === 'cancel' && options.cancelMeans !== 'keep') return 'cancelled';
        includeUnsent = choice === 'delete';
      }
      await clearPersonalDeviceData({ includeUnsent }, env);
    } catch {
      // A failed clear must never keep a member signed in: the page's own Clear lists what is left.
    }
  }
  await options.signOut();
  return 'signed-out';
}
