import { useCallback } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Briefcase, Car, Check, type LucideIcon } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
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
 */

const SERVICE_TABS = ['homes', 'rmhladder', 'rideshare'] as const;
type ServiceTab = (typeof SERVICE_TABS)[number];

interface ServiceDef {
  id: ServiceTab;
  icon: LucideIcon;
  href: string;
  /** Reuse the existing sidebar nav string (feed namespace). */
  navKey: string;
  name: string;
  descKey: string;
  desc: string;
  ctaKey: string;
  cta: string;
  /** [key, defaultValue] feature bullets. */
  features: [string, string][];
}

const SERVICES: ServiceDef[] = [
  {
    id: 'homes',
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
];

export const Route = createFileRoute('/_site/services')({
  head: () => ({
    meta: buildMeta({
      title: 'Services | RMH Studios',
      description:
        'RMH Studios services — RMHHomes housing marketplace, RMHLadder early-career job discovery, and RMH Rideshare.',
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

  const tabs: LiquidTab[] = SERVICES.map((s) => ({
    id: s.id,
    label: t(s.navKey, { ns: 'feed', defaultValue: s.name }),
    icon: s.icon,
  }));

  const active = SERVICES.find((s) => s.id === tab) ?? SERVICES[0];
  const ActiveIcon = active.icon;
  const activeName = t(active.navKey, { ns: 'feed', defaultValue: active.name });

  return (
    <PageLayout
      title={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
      description={t('services-subtitle', {
        defaultValue: 'Housing, career, and transportation tools built around the community.',
      })}
    >
      <div className="px-4 pt-3 pb-12">
        {/* §5.45 tab sheet — its own glass pill, below the title. */}
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          idBase="services"
          fullWidth
          scroll
          aria-label={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
        />

        {/* Active service summary panel (?tab=). */}
        <section
          id={`services-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`services-tab-${active.id}`}
          className="glass-pane rounded-site mt-4 p-6 sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="glass-fill glass-bevel-sm flex size-16 shrink-0 items-center justify-center rounded-site text-site-accent">
              <ActiveIcon className="size-8" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.02em] text-site-text">
                {activeName}
              </h2>
              <p className="mt-2 max-w-prose text-site-text-muted">
                {t(active.descKey, { defaultValue: active.desc })}
              </p>

              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {active.features.map(([key, dflt]) => (
                  <li
                    key={key}
                    className="u-reveal-soft flex items-start gap-2 text-sm text-site-text"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
                    <span>{t(key, { defaultValue: dflt })}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Button asChild variant="accent">
                  <Link to={active.href}>
                    {t(active.ctaKey, { defaultValue: active.cta })}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
