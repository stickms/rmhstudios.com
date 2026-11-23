import type { PrepaintCtx } from './types';

/**
 * The reader's fonts, repaired before paint (lib/appearance/fonts.ts). The server renders the faces from the account
 * or the `rmh-fonts` cookie; when this device's storage names other faces (the cookie was cleared, or a change whose
 * cookie write failed), this stamps the `data-font-*` attributes, links the missing sheets and rewrites the cookie so
 * the next request renders right. That one load may show the default face while the sheet arrives.
 *
 * Runs after `account-seed`, which has already written the account's choice into storage when sync is on, so storage
 * is the source of truth here. Self-contained (no catalogue import): `cfg.fonts` names the valid faces and their
 * sheets — `t` for main and reading, `m` for mono, `''` for a default that lives in the site sheet.
 */
export function fontsStep({ doc, html, cfg }: PrepaintCtx): void {
  const f = cfg.fonts;
  if (!f) return;
  const ls = localStorage;
  const pick = (key: string, valid: Record<string, string>, def: string, same?: boolean): string => {
    const v = ls.getItem(key);
    return v && (v in valid || (same && v === 'same')) ? v : def;
  };
  const main = pick('rmh-font-main', f.t, 'dm-sans');
  const reading = pick('rmh-font-reading', f.t, 'same', true);
  const mono = pick('rmh-font-mono', f.m, 'dm-mono');
  const want: Array<[string, string, string]> = [
    ['data-font-main', main, 'dm-sans'],
    ['data-font-reading', reading, 'same'],
    ['data-font-mono', mono, 'dm-mono'],
  ];
  let changed = false;
  for (const [attr, v, def] of want) {
    const target = v === def ? null : v;
    if (html.getAttribute(attr) === target) continue;
    changed = true;
    if (target === null) html.removeAttribute(attr);
    else html.setAttribute(attr, target);
  }
  if (!changed) return;
  const urls = [f.t[main], f.t[reading === 'same' ? main : reading], f.m[mono]];
  for (const href of urls) {
    if (!href || doc.querySelector(`link[href="${href}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  }
  const all = main === 'dm-sans' && reading === 'same' && mono === 'dm-mono';
  doc.cookie = all
    ? 'rmh-fonts=; Max-Age=0; Path=/; SameSite=Lax'
    : `rmh-fonts=${main}.${reading}.${mono}; Max-Age=31536000; Path=/; SameSite=Lax`;
}
