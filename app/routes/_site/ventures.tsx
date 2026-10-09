import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Atom, Brain, Landmark, Server, Shield, type LucideIcon } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { HubLinkRow } from '@/components/feed/HubLinkRow';
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
 *
 * Like /services, the hub is a list now rather than a tab strip over one card:
 * five brand names do not fit a segmented control ("RMH Data…", "Adaptive I…",
 * "RMH Dee…" at 1440px), and a hub that hides four of its five destinations is
 * not doing a hub's job (UI minimalism audit, 2026-10-09). `?tab=` is still
 * accepted so old links resolve; it simply opens the list.
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
  },
  {
    id: 'rmh-datacenter',
    icon: Server,
    href: '/rmh-datacenter',
    navKey: 'nav-rmh-datacenter',
    name: 'RMH Datacenter',
    descKey: 'ventures-datacenter-desc',
    desc: 'The infrastructure arm — six owned campuses, 148 MW of contracted power and a private backbone between them, sold as colocation, bare metal and liquid-cooled accelerated compute.',
  },
  {
    id: 'rmh-pmc',
    icon: Shield,
    href: '/rmh-pmc',
    navKey: 'nav-rmh-pmc',
    name: 'RMH PMC',
    descKey: 'ventures-pmc-desc',
    desc: 'The private security arm: operators, an intelligence cell, and a logistics tail held under a single chain of command.',
  },
  {
    id: 'adaptive-intelligence',
    icon: Atom,
    href: '/adaptive-intelligence',
    navKey: 'nav-adaptive-intelligence',
    name: 'Adaptive Intelligence',
    descKey: 'ventures-ai-desc',
    desc: 'The research arm — the applied AI work that shows up across the platform, from the feed to the tools that build pages and games.',
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
  // `?tab=` is what the old tab strip wrote; it is still accepted so those links
  // resolve, and opens the list, where every venture is on screen.
  validateSearch: (search: Record<string, unknown>): { tab?: VentureTab } => {
    const tab = search.tab;
    return VENTURE_TABS.includes(tab as VentureTab) ? { tab: tab as VentureTab } : {};
  },
  component: VenturesPage,
});

function VenturesPage() {
  const { t } = useTranslation(['site', 'feed']);

  return (
    <PageLayout
      title={t('nav-ventures', { ns: 'feed', defaultValue: 'RMH Ventures' })}
      description={t('ventures-subtitle', {
        defaultValue: 'The brands and programmes built around RMH Studios.',
      })}
    >
      <ul className="space-y-3 px-3 pb-12">
        {VENTURES.map((v) => (
          <li key={v.id}>
            <HubLinkRow
              href={v.href}
              external={v.external}
              icon={v.icon}
              title={t(v.navKey, { ns: 'feed', defaultValue: v.name })}
              description={t(v.descKey, { defaultValue: v.desc })}
            />
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
