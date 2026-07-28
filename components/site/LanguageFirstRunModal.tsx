'use client';

/**
 * First-run language chooser. Shown once per device (localStorage-gated) so a
 * new visitor can confirm or change the auto-detected language before diving
 * in. Language can always be changed later in Settings → Language. Coordinated
 * with WelcomeModal via the `rmh:lang-picked` event so the two don't stack.
 */

import { useEffect, useState } from 'react';
import { useCookieConsentAnswered } from '@/components/site/CookieConsent';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { useLocaleStore } from '@/stores/localeStore';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'rmh-lang-picked-v1';
export const LANG_PICKED_EVENT = 'rmh:lang-picked';

export function LanguageFirstRunModal() {
  const { t } = useTranslation('nav');
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const consentAnswered = useCookieConsentAnswered();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Consent first (audit AUD-010): this used to mount alongside the cookie
    // bar and the What's New announcement, so a brand-new visitor had three
    // stacked interruptions to clear before reading anything — with the
    // consent bar painted behind the other two.
    if (!consentAnswered) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, [consentAnswered]);

  const finish = (chosen?: Locale) => {
    if (chosen && chosen !== locale) setLocale(chosen);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
    // Let WelcomeModal know it can take the stage now.
    window.dispatchEvent(new Event(LANG_PICKED_EVENT));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="max-w-md gap-0">
        <div className="mb-4 flex justify-center">
          <div className="rounded-site border border-site-accent/30 bg-site-accent-dim p-3">
            <Globe className="h-7 w-7 text-site-accent" aria-hidden />
          </div>
        </div>

        <DialogTitle className="text-center text-xl font-bold text-site-text">
          {t('lang-firstrun-title', { defaultValue: 'Choose your language' })}
        </DialogTitle>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-site-text-muted">
          {/* Interpolated from LOCALES, not written by hand — the copy claimed
              32 languages while the app ships 16. */}
          {t('lang-firstrun-body', {
            defaultValue:
              'RMH Studios is available in {{count}} languages. You can change this any time in Settings.',
            count: LOCALES.length,
          })}
        </p>

        {/* The scroller shows ~12 of the 16 options with no indication the rest
            exist; the mask fades the last visible row so the list reads as
            continuing. `mask-image` degrades to no mask where unsupported. */}
        <div
          role="listbox"
          aria-label={t('language', { defaultValue: 'Language' })}
          className="mt-5 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto overscroll-contain p-1.5 [mask-image:linear-gradient(to_bottom,#000_calc(100%-2rem),transparent)] sm:grid-cols-3"
        >
          {LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => finish(l)}
                className={cn(
                  'flex items-center justify-between gap-1 rounded-site-sm px-3 py-2 text-left text-sm transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40',
                  active
                    ? 'bg-site-accent-dim text-site-text'
                    : 'text-site-text-muted hover:bg-site-surface-hover hover:text-site-text',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{LOCALE_LABELS[l]}</span>
                {active && <Check className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="accent" size="sm" onClick={() => finish()}>
            {t('lang-firstrun-continue', { defaultValue: 'Continue in {{lang}}', lang: LOCALE_LABELS[locale] })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
