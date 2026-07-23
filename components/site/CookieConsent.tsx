'use client';

/**
 * Minimal cookie-consent banner. Shows once per browser until the user makes a
 * choice, then never again. Deliberately unobtrusive: a slim bottom card that
 * doesn't block the page, sits above the mobile nav, and remembers the choice
 * in localStorage (no server round-trip, no new env). Casual users dismiss it
 * in one tap and never see it again.
 *
 * The site only sets essential + first-party analytics cookies today, so this
 * is primarily a transparency/consent-of-record control. Other code can gate
 * non-essential behavior on `getCookieConsent() === 'all'` and listen for the
 * `rmh:cookie-consent` event.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CookieConsentChoice = 'all' | 'essential';
const STORAGE_KEY = 'rmh-cookie-consent';

export function getCookieConsent(): CookieConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'all' || v === 'essential' ? v : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
    window.dispatchEvent(new CustomEvent('rmh:cookie-consent', { detail: choice }));
  } catch {
    // storage disabled / private mode — the banner still closes for this session
  }
}

export function CookieConsent() {
  const { t } = useTranslation('common');
  // Start hidden; decide on the client after mount to avoid an SSR/hydration
  // mismatch (localStorage isn't available during SSR).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() === null) setVisible(true);
    const onReset = () => setVisible(getCookieConsent() === null);
    window.addEventListener('rmh:cookie-consent-reset', onReset);
    return () => window.removeEventListener('rmh:cookie-consent-reset', onReset);
  }, []);

  if (!visible) return null;

  const choose = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t('cookie-consent-label', { defaultValue: 'Cookie notice' })}
      // §5.5x A.1: bottom-most member of the mobile floating stack — its presence
      // lifts the mini-player / back-to-top clear of it (globals.css :has() rules).
      data-floating="cookie"
      className="glass-chrome bottom-above-dock fixed inset-x-3 z-40 mx-auto max-w-2xl rounded-site p-4 shadow-site md:bottom-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden h-5 w-5 shrink-0 text-site-accent sm:block" aria-hidden />
        <p className="flex-1 text-sm text-site-text-muted">
          {t('cookie-consent-text', {
            defaultValue:
              'We use essential cookies to run the site and privacy-friendly analytics to improve it.',
          })}{' '}
          <a
            href="/cookies"
            aria-label={t('cookie-consent-learn-aria', {
              defaultValue: 'Learn more about our cookie policy',
            })}
            className="text-site-accent hover:underline"
          >
            {t('cookie-consent-learn', { defaultValue: 'Learn more' })}
          </a>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose('essential')}>
            {t('cookie-consent-essential', { defaultValue: 'Essential only' })}
          </Button>
          <Button size="sm" onClick={() => choose('all')}>
            {t('cookie-consent-accept', { defaultValue: 'Accept all' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
