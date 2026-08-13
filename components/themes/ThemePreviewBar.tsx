'use client';

/**
 * ThemePreviewBar (§14.2/§14.3) — the floating glass confirm capsule shown while
 * a theme is previewed site-wide (try-before-buy or the editor's preview-on-site).
 * Mounted globally in Providers so it persists as the user navigates the real
 * site under the previewed theme. A small fixed `.glass-overlay` capsule with
 * Buy (when the previewed theme is purchasable) and Exit.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/themeStore';

export function ThemePreviewBar() {
  const { t } = useTranslation('theme-studio');
  const preview = useThemeStore((s) => s.userThemePreview);
  const setPreview = useThemeStore((s) => s.setUserThemePreview);
  const setUserTheme = useThemeStore((s) => s.setUserTheme);
  const [busy, setBusy] = useState(false);

  if (!preview) return null;

  async function buy() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/themes/${preview.id}/buy`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error);
      }
      // Commit the previewed theme as the applied one (drops the transient preview).
      setUserTheme({ id: preview.id, bg: preview.bg, vars: preview.vars });
      toast.success(t('bought', { defaultValue: 'Theme purchased — it is in your inventory' }));
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === 'INSUFFICIENT_COINS'
          ? t('insufficient', { defaultValue: "You don't have enough coins" })
          : t('buy-error', { defaultValue: "Couldn't buy the theme" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label={t('preview-bar-label', { defaultValue: 'Theme preview' })}
      data-motion="pop"
      // Two fixes in one class string.
      //
      // **The lane.** This is bottom-CENTRE at the bare edge offset, which is
      // the hub orb's lane — and the orb is the site's only navigation control
      // on mobile. At 390px the capsule spanned safe+12..safe+64 against an orb
      // at safe+16..safe+76, so 48 of the orb's 60px were covered and untappable
      // for the whole preview. It cannot join the `data-floating` stack the way
      // the cookie bar and mini-player do: those rules are
      // `.vibe-app:has(…) [data-floating='…']`, and this bar is mounted in
      // `Providers` OUTSIDE the shell, so the descendant combinator never
      // matches. So it carries the same arithmetic directly. It is centred and
      // as tall as the orb, so it lifts rather than stepping sideways. The
      // expression is `--float-lift-hub` inlined and reduced: the stack writes
      // `safe + edge + (orb-size + orb-inset - edge + 0.75rem)`, in which the
      // two `edge` terms cancel.
      //
      // **The band.** z-[60] put it ABOVE every z-50 dialog, sheet and the
      // composer — it floated over their scrims, undimmed, reading as part of
      // the modal. Radix at least neutralises its clicks; `ComposeModal` is
      // hand-rolled and does not, so "Buy" and "Exit preview" stayed live
      // through an open composer and would swap the site's theme underneath it.
      // z-40 is the band the other shell-level floating chrome uses
      // (BackToTop, CookieConsent), so a modal now covers it. 60 is `Select`'s
      // band precisely because a select must clear a dialog it was opened
      // INSIDE; this bar is not in that category.
      className="glass-overlay origin-bottom fixed inset-x-0 bottom-[calc(var(--safe-bottom)+var(--site-hub-orb-size)+var(--site-hub-orb-inset)+0.75rem)] z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full px-4 py-2 shadow-site"
    >
      <span className="min-w-0 truncate text-sm text-site-text">
        {t('previewing', { defaultValue: 'Previewing' })}
        {preview.name ? <span className="font-semibold"> {preview.name}</span> : null}
      </span>
      {preview.purchasable && preview.priceCoins != null ? (
        <Button variant="accent" size="sm" onClick={buy} loading={busy}>
          {t('buy-for', { defaultValue: 'Buy' })} · {preview.priceCoins}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={busy}>
        <X className="h-4 w-4" aria-hidden />
        {t('exit-preview', { defaultValue: 'Exit preview' })}
      </Button>
    </div>
  );
}
