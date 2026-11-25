/**
 * What a deletion request pauses and what signing back in restores (s09-14). Pure: no database, client-safe.
 *
 * The hold records only the ids this request changed, so a restore never lifts an admin's suspension and never
 * re-enables a webhook the member had already turned off.
 */

/** Stripe statuses in which a membership is billing the member (s12-18). */
export const BILLING_LIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

/** The `suspendReason` a deletion request writes on an API key. Restore lifts only a key that still carries it. */
export const DELETION_REQUESTED = 'Account deletion requested';

/** The `SYSTEM` notice's `entityType` for scheduled posts that came due while the account was set to be deleted. */
export const DELETION_DRAFTS_WAITED_ENTITY = 'deletion-drafts-waited';

/** Where that notice links to. */
export const DRAFTS_PAGE_PATH = '/drafts';

export interface HeldKeyState {
  id: string;
  revokedAt: Date | null;
  suspendedAt: Date | null;
  suspendReason: string | null;
}

export interface HeldWebhookState {
  id: string;
  enabled: boolean;
}

/** A key this hold may lift: still suspended by this feature, and not revoked since. */
export function keyStillHeld(k: Pick<HeldKeyState, 'revokedAt' | 'suspendedAt' | 'suspendReason'>): boolean {
  return k.suspendedAt !== null && k.suspendReason === DELETION_REQUESTED && k.revokedAt === null;
}

/**
 * The ids to restore, from the hold and the rows' current state: a key in the hold that an admin has since
 * suspended for their own reason (or lifted, or revoked) is left alone; a webhook that is enabled again is left alone.
 */
export function planRestore(
  hold: { keyIds: readonly string[]; webhookIds: readonly string[]; subscriptionIds?: readonly string[] },
  keys: readonly HeldKeyState[],
  webhooks: readonly HeldWebhookState[],
): { keyIds: string[]; webhookIds: string[]; keepHold: boolean } {
  const heldKeys = new Set(hold.keyIds);
  const heldHooks = new Set(hold.webhookIds);
  return {
    keyIds: keys.filter((k) => heldKeys.has(k.id) && keyStillHeld(k)).map((k) => k.id),
    webhookIds: webhooks.filter((w) => heldHooks.has(w.id) && !w.enabled).map((w) => w.id),
    // Stripe is read by the billing sync, not here: every recorded subscription is the sync's to resume (or to find
    // already ended), and the hold stays until it has (s12-18).
    keepHold: (hold.subscriptionIds ?? []).length > 0,
  };
}

/** Both holds merged (a second request while one is pending adds what is new and forgets nothing). */
export function mergeIds(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** The counts the deletion dialog lists before the confirm. */
export interface DeletionPausePreview {
  apiKeys: number;
  webhooks: number;
  scheduledPosts: number;
  /** The memberships a request would end with their period (s12-18): plan name and the date, nothing else. */
  subscriptions: { plan: string; periodEnd: string | null }[];
}
