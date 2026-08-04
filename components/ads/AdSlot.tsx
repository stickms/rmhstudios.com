'use client';

/**
 * One Google AdSense unit.
 *
 * Everything that makes ads unpleasant is handled here rather than left to each
 * placement:
 *
 *  - **Nothing loads speculatively.** The slot renders `null` until the gate in
 *    `useAdsEnabled` says yes, and even then the tag isn't fetched until an
 *    IntersectionObserver says the slot is near the viewport. A reader who never
 *    scrolls to the bottom of an article never requests an ad.
 *  - **Zero layout shift.** The frame reserves the placement's `minHeight`
 *    before the creative exists, so an ad arriving 800ms into the read doesn't
 *    shove the paragraph out from under the reader.
 *  - **Unfilled slots disappear.** AdSense stamps `data-ad-status="unfilled"`
 *    on the `<ins>` when it has nothing to serve. Left alone that is a labelled
 *    empty box holding open 280px of nothing, which is worse than an ad. We
 *    watch the attribute and collapse the whole frame.
 *  - **It says it's an ad.** A labelled unit is both the honest thing and the
 *    policy-safe one: AdSense requires that units are not presented in a way
 *    that could be mistaken for site content, and this site's cards are exactly
 *    what a creative would otherwise be mistaken for.
 *
 * Placements and their slot ids live in `lib/ads/adsense.ts`.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { AD_PLACEMENTS, slotIdFor, type AdPlacement } from '@/lib/ads/adsense';
import { loadAdSense, preconnectAds, pushAd } from '@/lib/ads/loader';
import { useAdsEnabled } from '@/hooks/useAdsEnabled';

interface AdSlotProps {
  placement: AdPlacement;
  /** Extra classes for the outer frame. */
  className?: string;
}

/** How far outside the viewport a slot starts loading. */
const ROOT_MARGIN = '400px';

/**
 * `collapsed` is the only state that changes what renders — everything else
 * about the request is bookkeeping that must NOT be React state, for the reason
 * in the effect below.
 */
export function AdSlot({ placement, className }: AdSlotProps) {
  const { t } = useTranslation('common');
  const { enabled, personalized, clientId } = useAdsEnabled();
  const config = AD_PLACEMENTS[placement];
  const slotId = slotIdFor(placement);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const labelId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const insRef = useRef<HTMLModElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // A slot with no configured id is a placement whose AdSense unit hasn't been
  // created yet. Render nothing rather than an `<ins>` with an empty
  // `data-ad-slot`, which the tag rejects noisily.
  const active = enabled && slotId.length > 0;

  // Read at request time rather than depended on. Consent can flip mid-session
  // (Settings → Privacy), and if `personalized` were an effect dependency, that
  // flip would tear down and re-arm a request that is already in flight.
  const clientIdRef = useRef(clientId);
  const personalizedRef = useRef(personalized);
  clientIdRef.current = clientId;
  personalizedRef.current = personalized;

  // One request per element. The tag refuses to fill an `<ins>` twice, so the
  // latch is per-`<ins>` — and the `<ins>` is keyed by pathname, so a client-side
  // navigation to another page with the same placement gets a fresh element and
  // a fresh latch.
  const requestedRef = useRef(false);
  useEffect(() => {
    requestedRef.current = false;
    setCollapsed(false);
  }, [pathname]);

  // Near the viewport → warm the connection, load the tag, hand over the `<ins>`.
  //
  // The dependency list is deliberately just `[active, pathname]`. An earlier
  // version tracked progress in React state and listed that state as a
  // dependency, which meant the state update the request itself performed
  // re-ran the effect, and the cleanup marked the in-flight `loadAdSense()`
  // cancelled — so `pushAd()` never ran and no ad was ever requested. The
  // request's own progress cannot be an input to the effect that starts it.
  useEffect(() => {
    if (!active) return;
    const frame = frameRef.current;
    if (!frame) return;

    let cancelled = false;
    const request = () => {
      if (cancelled || requestedRef.current) return;
      requestedRef.current = true;
      preconnectAds();
      loadAdSense(clientIdRef.current, personalizedRef.current).then(
        () => {
          // Not after unmount: `push({})` claims the next unfilled `<ins>` in
          // document order, so pushing for an element that is gone would fill a
          // DIFFERENT slot on the page.
          if (!cancelled) pushAd();
        },
        () => {
          // Blocked, offline, or otherwise unavailable. This is an ordinary
          // outcome (ad blockers are common), not an error: collapse quietly.
          if (!cancelled) setCollapsed(true);
        },
      );
    };

    if (typeof IntersectionObserver === 'undefined') {
      request();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          request();
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(frame);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [active, pathname]);

  // Watch the fill result. `data-ad-status` is set by the tag on the `<ins>` once
  // it has decided — `"filled"` or `"unfilled"` — and there is no callback for
  // it, so an attribute observer is the only signal available.
  //
  // Collapsing an unfilled slot does move the content below it up, which is a
  // layout shift. It is the lesser one: the alternative is a labelled empty box
  // holding open 280px of nothing for the rest of the visit, and Google's own
  // guidance for an unfilled unit is to collapse it.
  useEffect(() => {
    if (!active) return;
    const ins = insRef.current;
    if (!ins || typeof MutationObserver === 'undefined') return;

    const read = () => {
      const status = ins.getAttribute('data-ad-status');
      if (status === 'unfilled') setCollapsed(true);
      return status === 'filled' || status === 'unfilled';
    };
    if (read()) return;

    const observer = new MutationObserver(() => {
      if (read()) observer.disconnect();
    });
    observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    return () => observer.disconnect();
  }, [active, pathname]);

  if (!active || collapsed) return null;

  return (
    <div
      ref={frameRef}
      data-slot="ad-slot"
      data-ad-placement={placement}
      // `aria-hidden` is deliberately NOT set: hiding advertising from assistive
      // tech while showing it to everyone else is its own kind of deception.
      // `role="complementary"` marks it as beside the content rather than part
      // of it, and it takes its name from the visible label rather than a second
      // copy of the same word in an `aria-label`.
      role="complementary"
      aria-labelledby={labelId}
      className={cn('glass-fill overflow-hidden rounded-site p-3', className)}
    >
      <p id={labelId} className="site-kicker mb-2 text-site-text-dim">
        {t('ad-label', { defaultValue: 'Advertisement' })}
      </p>
      <ins
        // The path key forces a fresh element per page. Reusing one across a
        // client-side navigation means pushing an `<ins>` the tag has already
        // filled, which it throws on and then leaves showing the PREVIOUS
        // page's ad.
        key={`${placement}:${pathname}`}
        ref={insRef}
        className="adsbygoogle block"
        style={{ display: 'block', minHeight: config.minHeight }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format={config.format}
        data-full-width-responsive={config.fullWidthResponsive ? 'true' : 'false'}
      />
    </div>
  );
}
