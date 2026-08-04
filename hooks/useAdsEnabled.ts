'use client';

/**
 * The client-side half of the ad gate: resolves the four live inputs
 * (`lib/ads/adsense.ts` owns the decision itself) — publisher id, current path,
 * membership tier, cookie-consent answer — and re-evaluates when any of them
 * changes.
 *
 * Returns `enabled: false` on the server and on the first client render, on
 * purpose. Ads must never be part of the SSR HTML: the consent answer and the
 * live session both live in browser storage, so a server render can only guess,
 * and a guess that renders an ad markup block into the document is a hydration
 * mismatch AND an ad shown to someone who declined. Slots therefore appear
 * after mount, in space the layout already reserved.
 */

import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { getCookieConsent, type CookieConsentChoice } from '@/components/site/CookieConsent';
import { isDiscordActivity } from '@/lib/discord-activity';
import { ADSENSE_CLIENT_ID, adsAllowed, adsPersonalized } from '@/lib/ads/adsense';

export interface AdsGate {
  /** Whether a slot may render and request a creative. */
  enabled: boolean;
  /** Whether Google may personalise it (false ⇒ non-personalised ads). */
  personalized: boolean;
  /** The publisher id, so callers don't re-import it. */
  clientId: string;
}

export function useAdsEnabled(): AdsGate {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSession();
  const tier = (session?.user as { tier?: string | null } | undefined)?.tier ?? null;

  // `undefined` = "not resolved on the client yet", which is distinct from
  // `null` = "resolved, and the visitor hasn't answered the banner". Both keep
  // ads off; only the first one is expected to change on its own.
  const [consent, setConsent] = useState<CookieConsentChoice | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setConsent(getCookieConsent());
    sync();
    // Both events matter: `rmh:cookie-consent` fires when the banner is
    // answered (so the first ad of the session can appear without a reload),
    // and `rmh:cookie-consent-reset` when the choice is cleared from settings —
    // which must take ads back DOWN, not just re-show the banner.
    window.addEventListener('rmh:cookie-consent', sync);
    window.addEventListener('rmh:cookie-consent-reset', sync);
    return () => {
      window.removeEventListener('rmh:cookie-consent', sync);
      window.removeEventListener('rmh:cookie-consent-reset', sync);
    };
  }, []);

  const resolvedConsent = consent === undefined ? null : consent;
  const enabled =
    consent !== undefined &&
    adsAllowed({
      clientId: ADSENSE_CLIENT_ID,
      pathname,
      tier,
      consent: resolvedConsent,
      discordActivity: isDiscordActivity(),
    });

  return {
    enabled,
    personalized: adsPersonalized(resolvedConsent),
    clientId: ADSENSE_CLIENT_ID,
  };
}
