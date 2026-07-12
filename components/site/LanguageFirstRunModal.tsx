'use client';

/**
 * First-run language chooser. Shown once per device (localStorage-gated) so a
 * new visitor can confirm or change the auto-detected language before diving
 * in. Language can always be changed later in Settings → Language. Coordinated
 * with WelcomeModal via the `rmh:lang-picked` event so the two don't stack.
 */

import { useEffect, useState } from 'react';
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, []);

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
          {t('lang-firstrun-body', {
            defaultValue: 'RMH Studios is available in 32 languages. You can change this any time in Settings.',
          })}
        </p>

        <div
          role="listbox"
          aria-label={t('language', { defaultValue: 'Language' })}
          className="mt-5 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-3"
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
