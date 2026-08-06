'use client';

/**
 * The client-side half of the ad gate: resolves the live inputs
 * (`lib/ads/adsense.ts` owns the decision itself) — publisher id, current path,
 * membership tier and whether that tier is known yet, cookie-consent answer —
 * and re-evaluates when any of them changes.
 *
 * The tier comes from two places on purpose — the live session, and the server's
 * answer carried in the root loader payload. See `useServerTier` below for why
 * one of them isn't enough.
 *
 * Returns `enabled: false` on the server and on the first client render, on
 * purpose. Ads must never be part of the SSR HTML: the consent answer and the
 * live session both live in browser storage, so a server render can only guess,
 * and a guess that renders an ad markup block into the document is a hydration
 * mismatch AND an ad shown to someone who declined. Slots therefore appear
 * after mount, in space the layout already reserved.
 */

import { useEffect, useState } from 'react';
import { rootRouteId, useRouterState } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { getCookieConsent, type CookieConsentChoice } from '@/components/site/CookieConsent';
import { isDiscordActivity } from '@/lib/discord-activity';
import {
  ADSENSE_CLIENT_ID,
  adsAllowed,
  adsPersonalized,
  resolveTier,
  type TierAnswer,
} from '@/lib/ads/adsense';

export interface AdsGate {
  /** Whether a slot may render and request a creative. */
  enabled: boolean;
  /** Whether Google may personalise it (false ⇒ non-personalised ads). */
  personalized: boolean;
  /** The publisher id, so callers don't re-import it. */
  clientId: string;
}

/** The part of `__root.tsx`'s loader payload this hook reads. */
interface RootSessionPayload {
  user?: SessionUser | null;
  /** False when the server's session lookup failed or timed out. */
  sessionResolved?: boolean;
}

/** `tier` is a Better Auth custom field, so it isn't on the base user type. */
interface SessionUser {
  tier?: string | null;
}

/**
 * The LIVE client session's answer, as a {@link TierAnswer}.
 *
 * Two states are "no answer", and a member sees an ad for the length of either
 * one if they're rounded down to the free tier:
 *
 *  - The session is still in flight. Nobody is signed out yet; nobody is signed
 *    in yet either.
 *  - There IS a user but no `tier` on it. `components/Providers` renders a
 *    persisted session snapshot while the live one loads, and a snapshot written
 *    by an older build can be missing the field entirely. A signed-in account
 *    whose entitlement we can't read is unknown, not free.
 */
function liveTier(isPending: boolean, user: SessionUser | undefined): TierAnswer {
  if (isPending) return undefined;
  if (!user) return null;
  return typeof user.tier === 'string' ? user.tier : undefined;
}

/**
 * The SERVER's answer to "what is this visitor entitled to", taken from the root
 * loader — `undefined` when it hasn't got one.
 *
 * This exists to keep the fail-closed gate from costing the free tier anything.
 * The client session resolves a round trip after first render, and gating on it
 * alone delays every ad on the site — including the ones shown to the signed-out
 * majority who were never going to have a tier. But `__root.tsx` already
 * resolved the session against the cookie during SSR and sent the answer down
 * with the document, so on first render it is usually already here.
 *
 * `resolveTier` treats this as a fallback, never an override, so a sign-in, a
 * sign-out or an upgrade is reflected as soon as the live session lands rather
 * than waiting out the root loader's 5-minute `staleTime`. And if the payload is
 * ever missing or reshaped, this yields `undefined` and the gate simply waits
 * for the client session — the failure direction is "an ad is late", not "an ad
 * leaks".
 */
function useServerTier(): TierAnswer {
  return useRouterState({
    // A primitive, so the selector's result is referentially stable and this
    // never re-renders a page full of slots on unrelated router state changes.
    select: (state) => {
      const root = state.matches.find((m) => m.routeId === rootRouteId);
      const data = root?.loaderData as RootSessionPayload | undefined;
      if (!data || data.sessionResolved !== true) return undefined;
      if (!data.user) return null;
      return typeof data.user.tier === 'string' ? data.user.tier : undefined;
    },
  });
}

export function useAdsEnabled(): AdsGate {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session, isPending } = useSession();
  const serverTier = useServerTier();
  const { tier, sessionResolved } = resolveTier(
    liveTier(isPending, session?.user as SessionUser | undefined),
    serverTier,
  );

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
      sessionResolved,
      consent: resolvedConsent,
      discordActivity: isDiscordActivity(),
    });

  return {
    enabled,
    personalized: adsPersonalized(resolvedConsent),
    clientId: ADSENSE_CLIENT_ID,
  };
}
