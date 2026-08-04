'use client';

/**
 * Settings → Privacy: change or withdraw the cookie choice made at the banner.
 *
 * The banner (`CookieConsent`) was a one-way door — it wrote `all` or
 * `essential` to localStorage and then never showed itself again, and nothing
 * anywhere dispatched the `rmh:cookie-consent-reset` event it listens for. So a
 * visitor who tapped "Accept all" had no way to take it back, which is a real
 * problem now that the answer decides whether Google AdSense loads at all:
 * withdrawing consent has to be as easy as giving it, and it wasn't possible.
 *
 * Deliberately OUTSIDE the sign-in gate on that page. Cookie consent is a
 * property of the browser, not the account — a signed-out visitor sets it and
 * must be able to change it.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  getCookieConsent,
  setCookieConsent,
  clearCookieConsent,
  type CookieConsentChoice,
} from '@/components/site/CookieConsent';
import { ADSENSE_CLIENT_ID } from '@/lib/ads/adsense';

export function CookieConsentControls() {
  const { t } = useTranslation('site');
  // Resolved after mount — localStorage doesn't exist during SSR, and rendering
  // a guessed state would flash the wrong answer at whoever came here to check it.
  const [choice, setChoice] = useState<CookieConsentChoice | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setChoice(getCookieConsent());
    sync();
    window.addEventListener('rmh:cookie-consent', sync);
    window.addEventListener('rmh:cookie-consent-reset', sync);
    return () => {
      window.removeEventListener('rmh:cookie-consent', sync);
      window.removeEventListener('rmh:cookie-consent-reset', sync);
    };
  }, []);

  const choose = (next: CookieConsentChoice) => {
    setCookieConsent(next);
    setChoice(next);
    toast.success(t('cookie-controls-saved', { defaultValue: 'Cookie choice saved' }));
  };

  const reset = () => {
    clearCookieConsent();
    setChoice(null);
    toast.success(
      t('cookie-controls-cleared', { defaultValue: 'Cookie choice cleared — we’ll ask again' }),
    );
  };

  const status =
    choice === 'all'
      ? t('cookie-controls-status-all', { defaultValue: 'All cookies' })
      : choice === 'essential'
        ? t('cookie-controls-status-essential', { defaultValue: 'Essential only' })
        : t('cookie-controls-status-none', { defaultValue: 'Not chosen yet' });

  return (
    <section className="glass-fill rounded-site p-4">
      <div className="mb-3 flex items-center gap-2">
        <Cookie className="h-4.5 w-4.5 text-site-accent" aria-hidden />
        <div>
          <h2 className="text-base font-bold text-site-text">
            {t('cookie-controls-title', { defaultValue: 'Cookies & advertising' })}
          </h2>
          <p className="text-xs text-site-text-muted">
            {ADSENSE_CLIENT_ID
              ? t('cookie-controls-subtitle-ads', {
                  defaultValue:
                    'Ads pay for the free tier. “Essential only” keeps them but asks Google not to personalise them; a paid membership removes them entirely.',
                })
              : t('cookie-controls-subtitle', {
                  defaultValue:
                    'Choose what this browser stores beyond what the site needs to run.',
                })}
          </p>
        </div>
      </div>

      <p className="mb-3 text-sm text-site-text-muted">
        {t('cookie-controls-current', { defaultValue: 'Current choice:' })}{' '}
        <strong className="text-site-text">
          {choice === undefined
            ? t('cookie-controls-status-loading', { defaultValue: '…' })
            : status}
        </strong>
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={choice === 'all' ? 'default' : 'outline'}
          onClick={() => choose('all')}
          disabled={choice === undefined}
        >
          {t('cookie-controls-accept', { defaultValue: 'Accept all' })}
        </Button>
        <Button
          variant={choice === 'essential' ? 'default' : 'outline'}
          onClick={() => choose('essential')}
          disabled={choice === undefined}
        >
          {t('cookie-controls-essential', { defaultValue: 'Essential only' })}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={choice === undefined || choice === null}>
          {t('cookie-controls-reset', { defaultValue: 'Ask me again' })}
        </Button>
      </div>
    </section>
  );
}
