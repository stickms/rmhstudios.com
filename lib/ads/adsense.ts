/**
 * Google AdSense — configuration and the pure gate that decides whether an ad
 * unit may render at all.
 *
 * Client-safe (no `.server` imports): the placements live in React components,
 * and the same predicates are unit-tested in `lib/__tests__/adsense.test.ts`.
 *
 * ## How the integration is shaped
 *
 * The site does NOT use AdSense Auto ads. Auto ads inject units wherever
 * Google's page scan likes the look of, which on this codebase means inside a
 * full-screen game canvas, on top of the radial hub, or in the middle of a
 * checkout flow — none of which we can review before it ships. Every unit here
 * is a MANUAL placement: a named `<AdSlot placement="…">` written into a
 * specific page, backed by a slot id created in the AdSense dashboard.
 *
 * Nothing about ads is loaded until a slot decides it is allowed to render —
 * the `adsbygoogle.js` tag itself is injected lazily by `lib/ads/loader.ts`, so
 * a signed-in member, a visitor who hasn't answered the cookie banner, and every
 * page with no ad unit on it all make zero requests to Google.
 */

import { hasAdFree, parseTier } from '@/lib/entitlements/tiers';

/**
 * Publisher id, e.g. `ca-pub-1234567890123456`. Exposed to the client bundle
 * (hence `VITE_`) because it is part of the ad tag's URL and of every `<ins>`.
 * It is public information by design — it appears in `ads.txt` too.
 *
 * Unset (the default, and the state of every dev machine) disables ads
 * everywhere: `adsAllowed()` returns false, no script is injected, and
 * `/ads.txt` 404s.
 */
export const ADSENSE_CLIENT_ID = (import.meta.env.VITE_ADSENSE_CLIENT_ID ?? '').trim();

/** The tag URL. `client` is required on the URL for the async tag to self-configure. */
export function adsenseScriptSrc(clientId: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
}

/**
 * The named placements. Adding a placement means adding it here AND creating
 * the matching unit in the AdSense dashboard — a slot id left empty makes that
 * one placement inert without touching the others.
 *
 * `minHeight` is the space the slot reserves BEFORE a creative arrives. Ads are
 * the classic layout-shift source: the `<ins>` starts at height 0, then a
 * 250px-tall creative lands a second later and shoves the article text the
 * reader was already reading down the page. Reserving the height up front costs
 * a little whitespace when the slot goes unfilled (we collapse it then — see
 * `AdSlot`) and buys a CLS of zero when it fills.
 */
export interface AdPlacementConfig {
  /** `data-ad-format`. `auto` + full-width responsive is right for in-column units. */
  format: string;
  /** `data-full-width-responsive`. */
  fullWidthResponsive: boolean;
  /** Reserved height in px, to keep CLS at zero while the creative loads. */
  minHeight: number;
}

export type AdPlacement = 'article-end' | 'index-footer' | 'rail';

export const AD_PLACEMENTS: Record<AdPlacement, AdPlacementConfig> = {
  /** Below the body of a blog post / news article, above the footer rule. */
  'article-end': {
    format: 'auto',
    fullWidthResponsive: true,
    minHeight: 280,
  },
  /** Bottom of a long index/listing page, after the last row of cards. */
  'index-footer': {
    format: 'auto',
    fullWidthResponsive: true,
    minHeight: 280,
  },
  /**
   * The desktop live rail. Narrow and tall, and dropped entirely on small
   * screens (the rail itself is), so it takes a vertical unit.
   */
  rail: {
    format: 'auto',
    fullWidthResponsive: false,
    minHeight: 250,
  },
};

/**
 * Parse `VITE_ADSENSE_SLOTS` — the placement→ad-unit-id map, written as
 * `article-end=1234567890,rail=2345678901`.
 *
 * One env var rather than one per placement, because every `VITE_` value has to
 * be threaded through four files to reach a production build (Dockerfile ARG +
 * ENV, docker-bake.hcl variable + arg map, docker-compose build args, the deploy
 * workflow's repository variables). A map means adding a fourth placement is a
 * change to THIS file and the AdSense dashboard, not to the container plumbing.
 *
 * Unknown keys and malformed entries are ignored rather than thrown on: a typo
 * in a deploy variable should cost one unrendered ad slot, not the page it was
 * on. A placement missing from the map is simply disabled.
 */
export function parseSlotMap(raw: string | undefined): Partial<Record<AdPlacement, string>> {
  const out: Partial<Record<AdPlacement, string>> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!value) continue;
    if (key in AD_PLACEMENTS) out[key as AdPlacement] = value;
  }
  return out;
}

const SLOT_IDS = parseSlotMap(import.meta.env.VITE_ADSENSE_SLOTS);

/** The configured AdSense ad-unit id for a placement, or `''` if it has none. */
export function slotIdFor(placement: AdPlacement): string {
  return SLOT_IDS[placement] ?? '';
}

/**
 * Whether this session's tier has paid for the site, and so sees no ads.
 *
 * The decision itself is `hasAdFree` in `lib/entitlements/tiers.ts` — the same
 * rank comparison the membership page renders the `ad-free` feature card from,
 * rather than a second list of tier names that could disagree with it. All this
 * adds is the narrowing, because `tier` reaches here as a bare string off the
 * session.
 *
 * The three cases and why they differ:
 *
 *  - **absent** (`null`/`undefined`/`''`) — a signed-out visitor. Ads on: this
 *    is the traffic the free tier is funded by.
 *  - **a known tier** — `hasAdFree` answers.
 *  - **anything else** — a value we do not understand, which is NOT evidence of
 *    a free account. A stale `localStorage` session snapshot or a renamed plan
 *    id lands here, and the wrong guess is asymmetric: guessing "free" bills a
 *    paying member in ads, guessing "paid" costs one impression. Fail closed.
 */
export function isAdFreeTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const known = parseTier(tier);
  return known ? hasAdFree(known) : true;
}

/**
 * Path prefixes that never carry ads, whatever a page asks for.
 *
 * Placements are explicit, so in practice a slot only exists where one was
 * written. This list is the second lock: it means a placement added to a shared
 * component (a rail widget, a page frame) can't leak onto a surface where ads
 * are wrong — and several of these are wrong for reasons beyond taste:
 *
 *  - `/login`, `/settings`, `/wallet`, `/checkout`, `/messages` — auth,
 *    payment and private correspondence. Google's own policies prohibit ads on
 *    pages behind a sign-in wall and beside payment forms.
 *  - `/discord` — runs inside Discord's iframe under a CSP that blocks the ad
 *    tag outright; the request would only ever be a console error.
 *  - `/embed` — this site's content rendered inside SOMEONE ELSE'S page.
 *  - `/offline`, `/secret` — no publisher content to place an ad against.
 *  - `/api` — not a page at all.
 */
const EXCLUDED_PREFIXES = [
  '/api',
  '/checkout',
  '/discord',
  '/embed',
  '/login',
  '/messages',
  '/offline',
  '/secret',
  '/settings',
  '/wallet',
];

/** Whether `pathname` sits under a surface that never carries ads. */
export function isAdExcludedPath(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The cookie-banner answer, as `components/site/CookieConsent` stores it. */
export type AdConsent = 'all' | 'essential' | null;

export interface AdGateInput {
  /** `ADSENSE_CLIENT_ID`, passed in so the gate stays pure and testable. */
  clientId: string;
  pathname: string;
  /** Session tier (`free`/`starter`/`pro`/`enterprise`), or null when signed out. */
  tier: string | null | undefined;
  /**
   * Whether `tier` is an ANSWER rather than a placeholder — i.e. the session has
   * resolved far enough to say what this visitor is entitled to.
   *
   * Required, and deliberately not defaulted, because the shape of the bug it
   * exists to prevent is "nobody thought about the loading window": a session
   * still in flight reports no tier, no tier reads as the free tier, and a
   * paying member gets an ad requested on their behalf in the half-second
   * before their membership loads. `false` means "don't know yet", which is not
   * the same as "free" and must not be rounded down to it.
   */
  sessionResolved: boolean;
  /** Cookie-banner answer; `null` = the visitor hasn't chosen yet. */
  consent: AdConsent;
  /** True inside the Discord Activity iframe. */
  discordActivity?: boolean;
}

/**
 * Whether an ad unit may render for this visitor, on this page, right now.
 *
 * Fails closed on every axis, and "closed" means NO AD — the failures worth
 * preventing here are all of the form "an ad appeared for someone it must not
 * have", which costs a membership or a complaint, while the opposite failure
 * costs one impression. Two axes are unobvious and both matter:
 *
 *  - An UNANSWERED cookie banner (`consent: null`) is not permission. The ad
 *    tag reads and writes storage the moment it loads, so it waits behind the
 *    choice the banner exists to collect. That is also why the banner's own
 *    surfaces are on the excluded list — nothing may advertise at someone while
 *    they are being asked whether advertising is okay.
 *  - An UNRESOLVED session (`sessionResolved: false`) is not the free tier.
 *    Entitlement arrives after the first client render, and treating "not known
 *    yet" as "not a member" is how a member ends up with an ad request fired on
 *    their behalf before their own membership finishes loading.
 */
export function adsAllowed({
  clientId,
  pathname,
  tier,
  sessionResolved,
  consent,
  discordActivity = false,
}: AdGateInput): boolean {
  if (!clientId) return false;
  if (discordActivity) return false;
  if (consent === null) return false;
  if (!sessionResolved) return false;
  if (isAdFreeTier(tier)) return false;
  if (isAdExcludedPath(pathname)) return false;
  return true;
}

/**
 * Whether Google may personalise the creative.
 *
 * "Essential only" means the visitor declined everything that isn't needed to
 * run the site, which includes the advertising cookies behind personalisation.
 * We keep serving ads in that case, but request NON-personalised ones — the
 * `requestNonPersonalizedAds` flag in `lib/ads/loader.ts` — which is Google's
 * documented path for exactly this answer.
 *
 * NOTE for anyone extending this: non-personalised is not the same as
 * cookie-less. NPA still uses storage for frequency capping and click fraud, so
 * for a full EEA/UK TCF v2 posture this flag is the floor, not the ceiling — a
 * certified CMP would sit in front of it. See `docs/adsense.md`.
 */
export function adsPersonalized(consent: AdConsent): boolean {
  return consent === 'all';
}
