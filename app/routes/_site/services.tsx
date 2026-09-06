import { Suspense, lazy, useCallback } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Building2,
  Briefcase,
  Car,
  CarFront,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import type { LiquidTab } from '@/components/ui/liquid-tabs';
import { PageTabs } from '@/components/feed/PageTabs';
import { Button } from '@/components/ui/button';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /services — the Services hub (§15.7).
 *
 * Replaces the sidebar's "Services" expanding dropdown (now a plain nav link).
 * A §5.45 tab sheet sits below the "Services" title capsule, one tab per real
 * product vertical. Each tab is a `?tab=` content panel — a summary card with a
 * prominent link-out — rather than a bare link tab (the RMHLadder link-tab
 * pattern): the children are full standalone apps, so link tabs would make this
 * a content-less bounce page, whereas summary panels give /services real value
 * as a hub while the child routes stay reachable directly AND via the link-out.
 *
 * `?tab=cars` is the one panel that is not a summary. **The RMH family of cars**
 * is the fleet behind RMH Rideshare, shown as turnable 3D bodies, and it has no
 * app of its own to link out to — it IS the content. It lives here rather than
 * at a route of its own because it is a chapter of Rideshare rather than a
 * sibling of it, and because the tab strip is already the thing that says which
 * chapter you are reading. Its panel is `lazy()`, so the three.js it needs is
 * fetched when somebody opens the tab and never on the other three.
 */

const SERVICE_TABS = ['homes', 'rmhladder', 'rideshare', 'cars'] as const;
type ServiceTab = (typeof SERVICE_TABS)[number];

/**
 * The fleet showcase. Split out for the same reason `/library/$slug` splits its
 * reader: `routeTree.gen.ts` imports every route module statically, so a
 * top-level import of anything that reaches three.js would ship the vendor
 * chunk on EVERY page of the site.
 */
const CarFamily = lazy(() =>
  import('@/components/rideshare/cars/CarFamily').then((m) => ({ default: m.CarFamily })),
);

/** What every tab has, whatever it renders. */
interface ServiceBase {
  id: ServiceTab;
  icon: LucideIcon;
  /** English default for the label. */
  name: string;
}

/** The three link-out verticals: a summary card with a prominent CTA. */
interface ServiceSummary extends ServiceBase {
  panel: 'summary';
  /** The sidebar nav string this vertical already ships in every locale. */
  navKey: string;
  href: string;
  descKey: string;
  desc: string;
  ctaKey: string;
  cta: string;
  /** [key, defaultValue] feature bullets. */
  features: [string, string][];
}

/** The fleet showcase, which is content rather than a signpost to content. */
interface ServiceShowcase extends ServiceBase {
  panel: 'cars';
}

type ServiceDef = ServiceSummary | ServiceShowcase;

const SERVICES: ServiceDef[] = [
  {
    id: 'homes',
    panel: 'summary',
    icon: Building2,
    href: '/homes',
    navKey: 'nav-homes',
    name: 'RMHHomes',
    descKey: 'services-homes-desc',
    desc: 'A housing marketplace that blends member-posted rentals and houses with real listings aggregated from across the web — browse them all on an interactive map.',
    ctaKey: 'services-homes-cta',
    cta: 'Find a home',
    features: [
      ['services-homes-f1', 'Browse everything on an interactive map'],
      ['services-homes-f2', 'Filter by price, beds, baths, type and source'],
      ['services-homes-f3', 'Save favorites and set alerts for new matches'],
      ['services-homes-f4', 'Post your own listing and message owners directly'],
    ],
  },
  {
    id: 'rmhladder',
    panel: 'summary',
    icon: Briefcase,
    href: '/rmhladder',
    navKey: 'nav-rmhladder',
    name: 'RMHLadder',
    descKey: 'services-ladder-desc',
    desc: 'Discover verified internships, new-grad programs, and early-career roles pulled straight from official company job boards.',
    ctaKey: 'services-ladder-cta',
    cta: 'Browse jobs',
    features: [
      ['services-ladder-f1', 'Verified early-career roles from official sources'],
      ['services-ladder-f2', 'Official boards re-checked every four hours'],
      ['services-ladder-f3', 'Save roles and track your applications'],
      ['services-ladder-f4', 'Compare your resume with the jobs that fit'],
    ],
  },
  {
    id: 'rideshare',
    panel: 'summary',
    icon: Car,
    href: '/rideshare',
    navKey: 'nav-rideshare',
    name: 'RMH Rideshare',
    descKey: 'services-rideshare-desc',
    desc: 'Request a ride or sign up to drive with RMH Rideshare — map your trip and choose the ride class that fits.',
    ctaKey: 'services-rideshare-cta',
    cta: 'Request a ride',
    features: [
      ['services-rideshare-f1', 'Map pickup and drop-off with OpenStreetMap'],
      ['services-rideshare-f2', 'Choose from RMH-X, XL, Comfort, Green or Black'],
      ['services-rideshare-f3', 'A vetted RMH driver claims your request'],
      ['services-rideshare-f4', 'Upfront fares — pay after the trip, tip if you loved it'],
    ],
  },
  {
    id: 'cars',
    panel: 'cars',
    icon: CarFront,
    name: 'RMH Cars',
  },
];

export const Route = createFileRoute('/_site/services')({
  head: () => ({
    meta: buildMeta({
      title: 'Services | RMH Studios',
      description:
        'RMH Studios services — RMHHomes housing marketplace, RMHLadder early-career job discovery, RMH Rideshare, and the RMH family of cars in 3D.',
      path: '/services',
    }),
    links: [buildCanonical('/services')],
  }),
  // Mirror the active service into ?tab= so /services?tab=rmhladder deep-links
  // and back-navigation land on the right panel; anything else → homes.
  validateSearch: (search: Record<string, unknown>): { tab?: ServiceTab } => {
    const tab = search.tab;
    return SERVICE_TABS.includes(tab as ServiceTab) ? { tab: tab as ServiceTab } : {};
  },
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useTranslation(['site', 'feed']);
  const { tab = 'homes' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/services', search: { tab: next as ServiceTab }, replace: true });
    },
    [navigate],
  );

  // The three verticals reuse their sidebar nav strings, which already ship in
  // every locale, so a computed key is safe for them. The showcase has no nav
  // entry and needs a NEW key — and `i18next-parser` cannot see through a
  // computed one, so a key written that way never reaches `locales/` and every
  // locale silently serves the default. It is spelled out.
  const tabs: LiquidTab[] = SERVICES.map((s) => ({
    id: s.id,
    label:
      s.panel === 'cars'
        ? t('services-cars-tab', { defaultValue: 'RMH Cars' })
        : t(s.navKey, { ns: 'feed', defaultValue: s.name }),
    icon: s.icon,
  }));

  const active = SERVICES.find((s) => s.id === tab) ?? SERVICES[0];

  return (
    <PageLayout
      title={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
      description={t('services-subtitle', {
        defaultValue: 'Housing, career, and transportation tools built around the community.',
      })}
    >
      {/* §5.45 tab sheet — its own glass pill, below the title. `PageTabs` owns
          the gutter so this strip lines up with every other page's. */}
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="services"
        aria-label={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
      />

      {/* The showcase brings its own panes (a stage, a picker, a spec card), so
          wrapping it in one more would be a pane inside a pane. The three
          summaries are a single card and keep the card. */}
      <div className="px-4 pb-12">
        <section
          id={`services-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`services-tab-${active.id}`}
          className={active.panel === 'summary' ? 'glass-pane rounded-site p-6 sm:p-8' : undefined}
        >
          {active.panel === 'cars' ? (
            // The fallback holds the panel's height rather than collapsing to
            // nothing: this panel is the tallest of the four, and a `null`
            // fallback drops the page to the tab strip and then shoves it back
            // down when the chunk lands. It is a plain box, not the stage's own
            // class — that class ships INSIDE the chunk being waited for.
            <Suspense fallback={<div className="min-h-[70vh]" aria-hidden />}>
              <CarFamily />
            </Suspense>
          ) : (
            <ServiceSummaryPanel service={active} />
          )}
        </section>
      </div>
    </PageLayout>
  );
}

function ServiceSummaryPanel({ service }: { service: ServiceSummary }) {
  const { t } = useTranslation(['site', 'feed']);
  const Icon = service.icon;
  const name = t(service.navKey, { ns: 'feed', defaultValue: service.name });

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="glass-fill glass-bevel-sm flex size-16 shrink-0 items-center justify-center rounded-site text-site-accent">
        <Icon className="size-8" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
          {name}
        </h2>
        <p className="mt-2 max-w-prose text-site-text-muted">
          {t(service.descKey, { defaultValue: service.desc })}
        </p>

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {service.features.map(([key, dflt]) => (
            <li key={key} className="u-reveal-soft flex items-start gap-2 text-sm text-site-text">
              <Check className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
              <span>{t(key, { defaultValue: dflt })}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Button asChild variant="accent">
            <Link to={service.href}>
              {t(service.ctaKey, { defaultValue: service.cta })}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
