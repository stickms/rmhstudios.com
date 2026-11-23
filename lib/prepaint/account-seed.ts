import type { PrepaintCtx } from './types';

/**
 * Writes the signed-in account's appearance (lib/appearance/account-seed.ts) into storage before the theme and fonts
 * steps read it — unless THIS device keeps its own appearance (sync off, owner 2026-11-23).
 *
 * Storage is the truth for the switch; its `rmh-appearance-sync=0` cookie only tells the server. A script-written
 * cookie can expire long before storage does (Safari caps it at 7 days), and the server then sends the seed again: so
 * the switch is read from storage here, and the cookie is re-written (or a stale one cleared) on every load to match.
 */
export function accountSeedStep({ doc, cfg }: PrepaintCtx): void {
  const off = localStorage.getItem('rmh-appearance-sync') === '0';
  const cookieOff = /(?:^|;\s*)rmh-appearance-sync=0(?:;|$)/.test(doc.cookie);
  if (off && !cookieOff) doc.cookie = 'rmh-appearance-sync=0; Max-Age=31536000; Path=/; SameSite=Lax';
  if (!off && cookieOff) doc.cookie = 'rmh-appearance-sync=; Max-Age=0; Path=/; SameSite=Lax';
  const s = cfg.seed;
  if (!s || off) return;
  for (const k in s) {
    const v = s[k];
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
}
