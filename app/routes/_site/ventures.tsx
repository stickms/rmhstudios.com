import { useCallback } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Atom,
  Brain,
  Check,
  Landmark,
  Server,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { PageTabs } from '@/components/feed/PageTabs';
import { Button } from '@/components/ui/button';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /ventures — the RMH Ventures hub.
 *
 * The mirror of /services (§15.7) for the company's brand microsites, and the
 * replacement for the sidebar's "RMH Ventures" expanding group. As a group its
 * four children were flattened into four separate wedges of the radial hub —
 * nearly a third of the dial spent on one arm of the company — so they collapse
 * to one destination here, one tab each, each panel a summary card with a
 * prominent link-out. The microsites stay reachable directly at their own URLs.
 */

const VENTURE_TABS = [
  'rmh-capital',
  'rmh-datacenter',
  'rmh-pmc',
  'adaptive-intelligence',
  'deeplink',
] as const;
type VentureTab = (typeof VENTURE_TABS)[number];

interface VentureDef {
  id: VentureTab;
  icon: LucideIcon;
  href: string;
  /**
   * The Deeplink landing page is standalone HTML served by its own server route,
   * not a router page, so it is linked with a plain anchor.
   */
  external?: boolean;
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

const VENTURES: VentureDef[] = [
  {
    id: 'rmh-capital',
    icon: Landmark,
    href: '/rmh-capital',
    navKey: 'nav-rmh-capital',
    name: 'RMH Capital',
    descKey: 'ventures-capital-desc',
    desc: 'The investment arm of RMH Studios — long-horizon capital placed behind the operators, technology, and infrastructure the group builds around.',
    ctaKey: 'ventures-capital-cta',
    cta: 'Visit RMH Capital',
    features: [
      ['ventures-capital-f1', 'Long-horizon positions rather than quarterly ones'],
      ['ventures-capital-f2', 'Concentrated in what the group already operates'],
      ['ventures-capital-f3', 'Research, strategy, and portfolio commentary'],
      ['ventures-capital-f4', 'Direct line to the investment desk'],
    ],
  },
  {
    id: 'rmh-datacenter',
    icon: Server,
    href: '/rmh-datacenter',
    navKey: 'nav-rmh-datacenter',
    name: 'RMH Datacenter',
    descKey: 'ventures-datacenter-desc',
    desc: 'The infrastructure arm — six owned campuses, 148 MW of contracted power and a private backbone between them, sold as colocation, bare metal and liquid-cooled accelerated compute.',
    ctaKey: 'ventures-datacenter-cta',
    cta: 'Visit RMH Datacenter',
    features: [
      ['ventures-datacenter-f1', 'Six campuses across three continents, all owned'],
      ['ventures-datacenter-f2', 'Colocation sold by drawn kilowatts, not rack units'],
      ['ventures-datacenter-f3', '40 kW liquid-cooled racks for accelerated compute'],
      ['ventures-datacenter-f4', 'One AS, 400G between sites, no egress between halls'],
    ],
  },
  {
    id: 'rmh-pmc',
    icon: Shield,
    href: '/rmh-pmc',
    navKey: 'nav-rmh-pmc',
    name: 'RMH PMC',
    descKey: 'ventures-pmc-desc',
    desc: 'The private security arm: operators, an intelligence cell, and a logistics tail held under a single chain of command.',
    ctaKey: 'ventures-pmc-cta',
    cta: 'Visit RMH PMC',
    features: [
      ['ventures-pmc-f1', 'One command, from planning through execution'],
      ['ventures-pmc-f2', 'Protective operations and site security'],
      ['ventures-pmc-f3', 'An intelligence cell with a cleared liaison architecture'],
      ['ventures-pmc-f4', 'Vetted, lawful clients only — every engagement screened'],
    ],
  },
  {
    id: 'adaptive-intelligence',
    icon: Atom,
    href: '/adaptive-intelligence',
    navKey: 'nav-adaptive-intelligence',
    name: 'Adaptive Intelligence',
    descKey: 'ventures-ai-desc',
    desc: 'The research arm — the applied AI work that shows up across the platform, from the feed to the tools that build pages and games.',
    ctaKey: 'ventures-ai-cta',
    cta: 'Visit Adaptive Intelligence',
    features: [
      ['ventures-ai-f1', 'Applied research, shipped into products people use'],
      ['ventures-ai-f2', 'Models behind the feed, search, and creation tools'],
      ['ventures-ai-f3', 'Published notes on what works and what does not'],
      ['ventures-ai-f4', 'Partnerships and research collaborations'],
    ],
  },
  {
    id: 'deeplink',
    icon: Brain,
    href: '/deeplink',
    external: true,
    navKey: 'nav-rmh-deeplink',
    name: 'RMH Deeplink',
    descKey: 'ventures-deeplink-desc',
    desc: 'The neurotechnology arm of RMH Studios — the interface work between people and the systems the group builds.',
    ctaKey: 'ventures-deeplink-cta',
    cta: 'Visit RMH Deeplink',
    features: [
      ['ventures-deeplink-f1', 'Neural interface research and hardware'],
      ['ventures-deeplink-f2', 'Built alongside the Adaptive Intelligence programme'],
      ['ventures-deeplink-f3', 'Programme updates and technical write-ups'],
      ['ventures-deeplink-f4', 'Open roles across research and engineering'],
    ],
  },
];

export const Route = createFileRoute('/_site/ventures')({
  head: () => ({
    meta: buildMeta({
      title: 'RMH Ventures | RMH Studios',
      description:
        'RMH Ventures — RMH Capital, RMH Datacenter, RMH PMC, Adaptive Intelligence, and RMH Deeplink: the brands and programmes built around RMH Studios.',
      path: '/ventures',
    }),
    links: [buildCanonical('/ventures')],
  }),
  // Mirror the active venture into ?tab= so /ventures?tab=rmh-pmc deep-links and
  // back-navigation lands on the right panel; anything else → RMH Capital.
  validateSearch: (search: Record<string, unknown>): { tab?: VentureTab } => {
    const tab = search.tab;
    return VENTURE_TABS.includes(tab as VentureTab) ? { tab: tab as VentureTab } : {};
  },
  component: VenturesPage,
});

function VenturesPage() {
  const { t } = useTranslation(['site', 'feed']);
  const { tab = 'rmh-capital' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/ventures', search: { tab: next as VentureTab }, replace: true });
    },
    [navigate],
  );

  const tabs: LiquidTab[] = VENTURES.map((v) => ({
    id: v.id,
    label: t(v.navKey, { ns: 'feed', defaultValue: v.name }),
    icon: v.icon,
  }));

  const active = VENTURES.find((v) => v.id === tab) ?? VENTURES[0];
  const ActiveIcon = active.icon;
  const activeName = t(active.navKey, { ns: 'feed', defaultValue: active.name });
  const ctaLabel = t(active.ctaKey, { defaultValue: active.cta });

  return (
    <PageLayout
      title={t('nav-ventures', { ns: 'feed', defaultValue: 'RMH Ventures' })}
      description={t('ventures-subtitle', {
        defaultValue: 'The brands and programmes built around RMH Studios.',
      })}
    >
      {/* §5.45 tab sheet — its own glass pill, below the title. `PageTabs` owns
          the gutter so this strip lines up with every other page's. */}
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="ventures"
        aria-label={t('nav-ventures', { ns: 'feed', defaultValue: 'RMH Ventures' })}
      />

      <div className="px-4 pb-12">
        {/* Active venture summary panel (?tab=). */}
        <section
          id={`ventures-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`ventures-tab-${active.id}`}
          className="glass-pane rounded-site p-6 sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="glass-fill glass-bevel-sm flex size-16 shrink-0 items-center justify-center rounded-site text-site-accent">
              <ActiveIcon className="size-8" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
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
                  {active.external ? (
                    <a href={active.href}>
                      {ctaLabel}
                      <ArrowRight className="size-4" aria-hidden />
                    </a>
                  ) : (
                    <Link to={active.href}>
                      {ctaLabel}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
