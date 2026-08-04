/**
 * Lazy injector for the `adsbygoogle.js` tag.
 *
 * The tag is deliberately NOT in `__root.tsx`'s `head()`. Putting it there
 * would make every page on the site — every game, every signed-in member's
 * feed, every visitor who hasn't answered the cookie banner — pay for a
 * third-party script that most of them will never show an ad from. It is
 * injected here instead, by the first `<AdSlot>` that decides it is allowed to
 * render, and never more than once per document.
 *
 * `preconnectAds()` is the compromise for the case where an ad IS coming: a
 * page that renders a slot warms the TLS handshake to Google's ad host as soon
 * as the slot mounts, so the deferred script fetch is not also paying for
 * connection setup.
 */

import { adsenseScriptSrc } from './adsense';

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  }
}

/** One in-flight/settled load per document. */
let loadPromise: Promise<void> | null = null;

const SCRIPT_ATTR = 'data-rmh-adsense';

/**
 * Ensure `window.adsbygoogle` exists and carries the right personalisation
 * flag. Must run BEFORE the tag executes: the script reads
 * `requestNonPersonalizedAds` off the queue object it inherits, so setting it
 * afterwards has no effect on the units already in flight.
 */
function primeQueue(personalized: boolean): void {
  const queue = (window.adsbygoogle = window.adsbygoogle ?? []);
  if (personalized) {
    delete queue.requestNonPersonalizedAds;
  } else {
    queue.requestNonPersonalizedAds = 1;
  }
}

/**
 * Warm the connection to the ad host. Cheap (one DNS + TLS handshake), and only
 * ever called from a slot that has already passed the gate.
 */
export function preconnectAds(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-rmh-adsense-preconnect]')) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = 'https://pagead2.googlesyndication.com';
  link.crossOrigin = 'anonymous';
  link.setAttribute('data-rmh-adsense-preconnect', '');
  document.head.appendChild(link);
}

/**
 * Inject the AdSense tag once and resolve when it has loaded.
 *
 * Rejects if the script fails — which is the common case, not an edge one: ad
 * blockers are widespread and they make this request fail. Callers must treat a
 * rejection as "no ad here" and render nothing, never as an error worth
 * surfacing. The failed promise is cleared so a later slot can retry (e.g.
 * after a network blip), and `primeQueue` runs on every call so a consent
 * change between slots is honoured by the units that come after it.
 */
export function loadAdSense(clientId: string, personalized: boolean): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('adsense: no window'));
  primeQueue(personalized);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = adsenseScriptSrc(clientId);
    // Required by AdSense; also what lets the tag report script errors to us.
    script.crossOrigin = 'anonymous';
    script.setAttribute(SCRIPT_ATTR, '');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      // Blocked or offline. Drop the memo so a later mount may try again.
      loadPromise = null;
      script.remove();
      reject(new Error('adsense: script failed to load'));
    });
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Ask the ad tag to fill one more `<ins>`.
 *
 * Note what this does NOT do: name an element. `push({})` claims the next
 * un-processed `.adsbygoogle` element in DOCUMENT order, whichever slot's code
 * called it. Each element still carries its own `data-ad-slot`, so every unit
 * gets the right creative — the pairing between "which slot scrolled into view"
 * and "which element got filled" is just not one-to-one when several units share
 * a page. The consequence to know: on a page with two units where only the
 * second is ever scrolled to, the one push fills the FIRST element. No page ships
 * two units today; if one does, that is the behaviour to expect.
 *
 * Throws if the element was already pushed (React 19 StrictMode double-effects,
 * a remount that reused the node), so it is swallowed — `AdSlot` also latches
 * per element to avoid double-pushing.
 */
export function pushAd(): void {
  try {
    (window.adsbygoogle = window.adsbygoogle ?? []).push({});
  } catch {
    // Already-filled slot or a tag that never loaded. Nothing to recover.
  }
}
