import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Briefcase,
  Car,
  CarFront,
  Shirt,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { HubLinkRow } from '@/components/feed/HubLinkRow';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /services — the Services hub (§15.7).
 *
 * A directory of every service, all visible at once: icon, name, one line, and
 * the whole row is the link.
 *
 * It used to be a six-tab strip over one summary card at a time. That hid five
 * of the six services behind a tab on every visit, and the tab labels are
 * product names — "RMHHomes", "Rebar & Rutabaga", "RMH Fashion" — which a
 * segmented control cannot hold: at 1440px they rendered as "RMHH…", "RMHL…",
 * "Rebar …" (UI minimalism audit, 2026-10-09). A hub's job is to show what is
 * there; a list does that in one glance.
 *
 * The two showcases (the RMH family of cars, RMH Fashion) are content rather
 * than signposts, so they moved to pages of their own — `/services/cars` and
 * `/services/fashion` — instead of being panels of this one. Old `?tab=` deep
 * links still land: a showcase tab redirects to its page, and a summary tab
 * just opens the hub, where that service is now always on screen.
 */

const SERVICE_TABS = ['homes', 'rmhladder', 'rideshare', 'restaurant', 'cars', 'fashion'] as const;
type ServiceTab = (typeof SERVICE_TABS)[number];

/** What every service row has. */
interface ServiceBase {
  id: ServiceTab;
  icon: LucideIcon;
  /** English default for the label. */
  name: string;
}

/** A link-out vertical: a standalone app or microsite. */
interface ServiceSummary extends ServiceBase {
  panel: 'summary';
  /** The sidebar nav string this vertical already ships in every locale. */
  navKey: string;
  href: string;
  descKey: string;
  desc: string;
}

/** A showcase: content in its own right, on its own page under /services. */
interface ServiceShowcase extends ServiceBase {
  panel: 'cars' | 'fashion';
  href: string;
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
  },
  {
    id: 'restaurant',
    panel: 'summary',
    icon: UtensilsCrossed,
    href: '/services/rebar-rutabaga',
    navKey: 'services-restaurant-name',
    name: 'Rebar & Rutabaga',
    descKey: 'services-restaurant-desc',
    desc: 'A molecular-gastronomy restaurant in a decommissioned Göteborg rebar foundry — nine spherified courses, read off a glass globe you turn with a finger.',
  },
  {
    id: 'cars',
    panel: 'cars',
    icon: CarFront,
    href: '/services/cars',
    name: 'RMH Cars',
  },
  {
    id: 'fashion',
    panel: 'fashion',
    icon: Shirt,
    href: '/services/fashion',
    name: 'RMH Fashion',
  },
];

export const Route = createFileRoute('/_site/services/')({
  head: () => ({
    meta: buildMeta({
      title: 'Services | RMH Studios',
      description:
        'RMH Studios services — RMHHomes housing marketplace, RMHLadder early-career job discovery, RMH Rideshare, the RMH family of cars, and RMH Fashion: a 3D wardrobe built around a figure you design.',
      path: '/services',
    }),
    links: [buildCanonical('/services')],
  }),
  // `?tab=` is what the old tab strip wrote. Keep every such link working: a
  // showcase tab goes to its own page, anything else opens the hub, where every
  // service is listed.
  validateSearch: (search: Record<string, unknown>): { tab?: ServiceTab } => {
    const tab = search.tab;
    return SERVICE_TABS.includes(tab as ServiceTab) ? { tab: tab as ServiceTab } : {};
  },
  beforeLoad: ({ search }) => {
    if (search.tab === 'cars') throw redirect({ to: '/services/cars', replace: true });
    if (search.tab === 'fashion') throw redirect({ to: '/services/fashion', replace: true });
  },
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useTranslation(['site', 'feed']);

  return (
    <PageLayout
      title={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
      description={t('services-subtitle', {
        defaultValue: 'Housing, career, and transportation tools built around the community.',
      })}
    >
      <ul className="space-y-3 px-3 pb-12">
        {SERVICES.map((service) => (
          <li key={service.id}>
            <ServiceRow service={service} />
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}

/**
 * One service, as a `HubLinkRow`. Names and descriptions reuse the
 * strings the old panels shipped in every locale. A computed key is only safe
 * where the key already exists (the nav strings and the summaries'
 * `descKey`s); the ones new to this page are spelled out, because
 * `i18next-parser` cannot see through a computed key and it would never reach
 * `locales/` otherwise.
 */
function ServiceRow({ service }: { service: ServiceDef }) {
  const { t } = useTranslation(['site', 'feed']);

  const name =
    service.id === 'restaurant'
      ? t('services-restaurant-name', { defaultValue: 'Rebar & Rutabaga' })
      : service.panel === 'summary'
        ? t(service.navKey, { ns: 'feed', defaultValue: service.name })
        : service.panel === 'cars'
          ? t('services-cars-tab', { defaultValue: 'RMH Cars' })
          : t('services-fashion-tab', { defaultValue: 'RMH Fashion' });

  const desc =
    service.panel === 'summary'
      ? t(service.descKey, { defaultValue: service.desc })
      : service.panel === 'cars'
        ? t('services-cars-desc', {
            defaultValue: 'The fleet behind RMH Rideshare — every model, in 3D, turnable.',
          })
        : t('services-fashion-desc', {
            defaultValue: 'A 3D wardrobe built around a figure you design.',
          });

  return <HubLinkRow href={service.href} icon={service.icon} title={name} description={desc} />;
}
