/**
 * The company's separately-branded arms, declared once (K2).
 *
 * ## Why this exists
 *
 * Eleven microsites shipped in six weeks, and each one arrived as a route, a
 * components directory, a hub-page tab, and a hand-added block of
 * `STATIC_ROUTES` entries in `lib/sitemap.ts`. Nothing tied those four together,
 * so the sitemap's coverage test — which is doing exactly its job — caught the
 * omission twice and was answered by hand twice:
 *
 *   3fcf074  "Classify /breaches in the sitemap, so main's own coverage test passes again"
 *   16c4308  "Fix CI: classify /sohumbum2 in the sitemap, ..."
 *
 * Two identical commits is a pattern; a third would be a habit. So a vertical
 * declares its pages ONCE, here, and the sitemap derives its entries. Adding
 * microsite #12 means adding a row, and the row is what makes it crawlable.
 *
 * Deliberately NOT a component kit. That is K1, and it is a bigger job — this
 * is only the registry the kit will later render from, which is worth having on
 * its own and is the cheap half.
 *
 * ## Client-safe
 *
 * `/services` and `/ventures` both render hub panels from their own arrays
 * today. Keeping this free of `.server` imports means those pages can be moved
 * onto it without a loader, which is the point of putting it here rather than
 * in `sitemap.ts` (which is client-safe too, but is about crawling rather than
 * about what the company is).
 */

/** Which hub a vertical is listed under. */
export type VerticalHub = 'services' | 'ventures';

/** How often a page of this kind actually changes. */
export type VerticalCadence = 'weekly' | 'monthly' | 'yearly';

export interface VerticalPage {
  /** Path segment under the vertical's base, or '' for its index. */
  segment: string;
  /**
   * How often this page's content really changes — a careers page turns over
   * weekly, a contact page effectively never. Wrong values here are how a
   * sitemap teaches a crawler to ignore it.
   */
  cadence: VerticalCadence;
}

export interface Vertical {
  /** Stable id, and the last segment of the route. */
  id: string;
  hub: VerticalHub;
  /** Absolute base path, no trailing slash. */
  base: string;
  /** English name. The hubs run their own labels through `t()`. */
  name: string;
  /**
   * Every crawlable page, index first. A page missing here is a page missing
   * from the sitemap, which is the single failure this registry prevents.
   */
  pages: readonly VerticalPage[];
  /**
   * True when the vertical is standalone HTML served by its own server route
   * (`.ts`) rather than a router page (`.tsx`).
   *
   * Deeplink is the only one, and it is a real distinction rather than an
   * implementation detail: `/ventures` links to it with a plain anchor because
   * the router does not own it, and a test looking for a `.tsx` would report a
   * live page as missing.
   */
  serverRendered?: true;
}

export const VERTICALS: readonly Vertical[] = [
  // ── Services: the operating businesses ──
  {
    id: 'rebar-rutabaga',
    hub: 'services',
    base: '/services/rebar-rutabaga',
    name: 'Rebar & Rutabaga',
    // A child of the Services hub with its own canonical and Restaurant
    // JSON-LD, so it is its own indexable URL rather than a tab on /services.
    // `monthly` because a tasting menu changes with the season, not the week.
    pages: [{ segment: '', cadence: 'monthly' }],
  },

  // ── Ventures: separately-branded arms, each a small marketing site ──
  {
    id: 'rmh-capital',
    hub: 'ventures',
    base: '/rmh-capital',
    name: 'RMH Capital',
    pages: [
      { segment: '', cadence: 'monthly' },
      { segment: 'businesses', cadence: 'monthly' },
      { segment: 'careers', cadence: 'weekly' },
      { segment: 'contact', cadence: 'yearly' },
      { segment: 'firm', cadence: 'monthly' },
      { segment: 'insights', cadence: 'weekly' },
    ],
  },
  {
    id: 'rmh-datacenter',
    hub: 'ventures',
    base: '/rmh-datacenter',
    name: 'RMH Datacenter',
    pages: [
      { segment: '', cadence: 'monthly' },
      { segment: 'contact', cadence: 'yearly' },
      { segment: 'facilities', cadence: 'monthly' },
      { segment: 'network', cadence: 'monthly' },
      { segment: 'platform', cadence: 'monthly' },
      { segment: 'power', cadence: 'monthly' },
    ],
  },
  {
    id: 'rmh-pmc',
    hub: 'ventures',
    base: '/rmh-pmc',
    name: 'RMH PMC',
    pages: [
      { segment: '', cadence: 'monthly' },
      { segment: 'capabilities', cadence: 'monthly' },
      { segment: 'command', cadence: 'monthly' },
      { segment: 'contact', cadence: 'yearly' },
      { segment: 'intelligence', cadence: 'monthly' },
      { segment: 'operators', cadence: 'monthly' },
    ],
  },
  {
    id: 'adaptive-intelligence',
    hub: 'ventures',
    base: '/adaptive-intelligence',
    name: 'Adaptive Intelligence',
    pages: [{ segment: '', cadence: 'monthly' }],
  },
  {
    id: 'deeplink',
    hub: 'ventures',
    base: '/deeplink',
    name: 'Deeplink',
    pages: [{ segment: '', cadence: 'monthly' }],
    serverRendered: true,
  },
] as const;

/** Every crawlable path a vertical owns, index first. */
export function verticalPaths(v: Vertical): string[] {
  return v.pages.map((p) => (p.segment ? `${v.base}/${p.segment}` : v.base));
}

/**
 * Sitemap priority for a vertical page.
 *
 * An index outranks its children, and a contact page outranks nothing — the
 * same shape the hand-written entries had, now derived rather than retyped
 * eleven times with the opportunity to typo each one.
 */
export function verticalPriority(page: VerticalPage): number {
  if (!page.segment) return 0.5;
  return page.cadence === 'yearly' ? 0.3 : 0.4;
}

/** The verticals listed under one hub, in declaration order. */
export function verticalsForHub(hub: VerticalHub): readonly Vertical[] {
  return VERTICALS.filter((v) => v.hub === hub);
}
