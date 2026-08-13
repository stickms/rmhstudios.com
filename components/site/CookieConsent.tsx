'use client';

/**
 * Minimal cookie-consent banner. Shows once per browser until the user makes a
 * choice, then never again. Deliberately unobtrusive: a slim bottom card that
 * doesn't block the page, sits above the mobile nav, and remembers the choice
 * in localStorage (no server round-trip, no new env). Casual users dismiss it
 * in one tap and never see it again.
 *
 * Other code gates non-essential behavior on `getCookieConsent()` and listens
 * for the `rmh:cookie-consent` event. Google AdSense (`lib/ads/`) is the main
 * consumer: no ad unit renders and the ad tag is never even fetched until this
 * banner has been answered — which is why the copy below has an advertising
 * variant. A build with a publisher id configured sets advertising cookies, and
 * a consent notice that doesn't say so is not consent.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADSENSE_CLIENT_ID } from '@/lib/ads/adsense';

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

/**
 * Withdraw the stored choice, putting this browser back to "hasn't answered".
 *
 * Nothing used to dispatch `rmh:cookie-consent-reset` even though three
 * components listened for it, so an accepted banner could never be taken back.
 * `CookieConsentControls` (Settings → Privacy) is what calls this now: the
 * banner returns, and anything gated on consent — Google AdSense above all —
 * goes back off until the visitor answers again.
 */
export function clearCookieConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage disabled — nothing was persisted to remove
  }
  // Dispatched unconditionally: the in-memory state of every listener has to
  // fall back to "unanswered" even when the write itself failed.
  window.dispatchEvent(new CustomEvent('rmh:cookie-consent-reset'));
}

/**
 * Whether the visitor has made a cookie choice yet.
 *
 * First-run surfaces use this to sequence themselves behind the consent bar.
 * A brand-new visitor used to get three stacked interruptions at once — the
 * language modal, the What's New announcement, and consent — with the legally
 * required consent bar painted BEHIND the two promotional overlays, because all
 * three mounted independently with no ordering between them.
 */
export function useCookieConsentAnswered(): boolean {
  const [answered, setAnswered] = useState(() => getCookieConsent() !== null);

  useEffect(() => {
    const sync = () => setAnswered(getCookieConsent() !== null);
    sync();
    window.addEventListener('rmh:cookie-consent', sync);
    window.addEventListener('rmh:cookie-consent-reset', sync);
    return () => {
      window.removeEventListener('rmh:cookie-consent', sync);
      window.removeEventListener('rmh:cookie-consent-reset', sync);
    };
  }, []);

  return answered;
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
      // `.glass-overlay`, not `.glass-chrome`. This is `role="dialog"`, it is
      // `fixed`, it floats over live content, and it is the one surface a
      // first-time visitor MUST read before they can dismiss it — which is the
      // definition of the L4 tier. `.glass-chrome` is the sticky-header tier: a
      // 32% fill with no legibility floor, tuned for something you read THROUGH
      // on the way to the content behind it. `.glass-overlay` also supplies its
      // own shadow, so the hand-added `shadow-site` goes with it.
      className="glass-overlay bottom-above-dock fixed inset-x-3 z-40 mx-auto max-w-2xl rounded-site p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden h-5 w-5 shrink-0 text-site-accent sm:block" aria-hidden />
        <p className="flex-1 text-sm text-site-text-muted">
          {ADSENSE_CLIENT_ID
            ? t('cookie-consent-text-ads', {
                defaultValue:
                  'We use essential cookies to run the site, privacy-friendly analytics to improve it, and advertising cookies to fund it. Choosing “Essential only” keeps the ads but stops them being personalised.',
              })
            : t('cookie-consent-text', {
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
          <Button variant="outline" onClick={() => choose('essential')}>
            {t('cookie-consent-essential', { defaultValue: 'Essential only' })}
          </Button>
          <Button onClick={() => choose('all')}>
            {t('cookie-consent-accept', { defaultValue: 'Accept all' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
