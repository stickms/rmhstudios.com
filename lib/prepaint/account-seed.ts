import type { PrepaintCtx } from './types';

/**
 * Apply a signed-in visitor's ACCOUNT appearance (computed server-side by
 * `accountAppearanceSeed`, lib/appearance/account-seed.ts) as localStorage
 * writes, so the theme step that follows paints the account's theme on the
 * first frame instead of this device's. Absent for signed-out visitors and for
 * an account with nothing saved.
 */
export function accountSeedStep({ cfg }: PrepaintCtx): void {
  const s = cfg.seed;
  if (!s) return;
  for (const k in s) {
    const v = s[k];
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
}
