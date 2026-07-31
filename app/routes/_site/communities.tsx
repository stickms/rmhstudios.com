import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { Users, CalendarDays, Radio } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { CommunitiesColumn } from '@/components/feed/CommunitiesColumn';
import { CommunitiesSkeleton } from '@/components/feed/CommunitiesSkeleton';
import { EventsColumn } from '@/components/events/EventsColumn';
import { SpacesColumn } from '@/components/spaces/SpacesColumn';
import { auth } from '@/lib/auth';
import { listCommunities } from '@/lib/communities.server';

// `/communities` is the merged social-graph hub: the communities directory plus
// the former `/events` and `/spaces` index pages, now tabs. The active tab is
// mirrored into `?tab=` so deep links, redirects (from the retired routes), and
// back-navigation land on the right surface.
const COMMUNITIES_TABS = ['communities', 'events', 'spaces'] as const;
type CommunitiesTab = (typeof COMMUNITIES_TABS)[number];

// Fetch the community list server-side so the directory (the default tab) is
// present at first paint (SSR) and prefetched on hover intent. Events/Spaces
// fetch their own data client-side, so the loader stays a single dataset.
const fetchCommunities = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return { communities: await listCommunities({ userId: session?.user.id ?? null }) };
});

export const Route = createFileRoute('/_site/communities')({
  head: () => ({ meta: [{ title: 'Communities | RMH Studios' }] }),
  // `tab` is optional (omitted for the default) so existing `to="/communities"`
  // links stay valid; the component reads it with a `'communities'` default.
  validateSearch: (search: Record<string, unknown>): { tab?: CommunitiesTab } => {
    const tab = search.tab;
    return COMMUNITIES_TABS.includes(tab as CommunitiesTab) ? { tab: tab as CommunitiesTab } : {};
  },
  loader: async () => await fetchCommunities(),
  // Cold navigations (loader not yet prefetched) show a layout-matched skeleton
  // rather than the generic route fallback, so the real page swaps in without a
  // shift.
  pendingComponent: CommunitiesPending,
  component: CommunitiesPage,
});

function CommunitiesShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('site');
  return (
    <PageLayout
      title={t('communities-title', { defaultValue: 'Communities' })}
      description={t('communities-subtitle', {
        defaultValue: 'Groups to join, events to RSVP to, and live rooms to drop into.',
      })}
    >
      {children}
    </PageLayout>
  );
}

/**
 * Top-of-page section switcher between the three surfaces. §16.2: this is the
 * shared `LiquidTabs` sheet+capsule grammar (was a bare tab row buried in a
 * `glass-chrome border-b` header — the §5.45 "never in header chrome" violation
 * the owner flagged). It sits BELOW the page title, on its own floating pill,
 * exactly like /store and /services. The title itself comes from `PageLayout`
 * now rather than a capsule this page drew for itself. `?tab=` mirroring + the
 * aria-controls tabpanel wiring (idBase="communities" → `communities-tab-*` /
 * `communities-panel-*`) are unchanged; each embedded column stays header-less.
 */
function CommunitiesTabs({ active }: { active: CommunitiesTab }) {
  const { t } = useTranslation('site');
  const navigate = useNavigate();

  const tabs: LiquidTab[] = [
    {
      id: 'communities',
      label: t('communities-tab-communities', { defaultValue: 'Communities' }),
      icon: Users,
    },
    {
      id: 'events',
      label: t('communities-tab-events', { defaultValue: 'Events' }),
      icon: CalendarDays,
    },
    { id: 'spaces', label: t('communities-tab-spaces', { defaultValue: 'Spaces' }), icon: Radio },
  ];

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/communities', search: { tab: next as CommunitiesTab }, replace: true });
    },
    [navigate],
  );

  return (
    <div className="my-3 px-2 md:px-3">
      <LiquidTabs
        tabs={tabs}
        value={active}
        onChange={setTab}
        idBase="communities"
        scroll
        aria-label={t('communities-sections', { defaultValue: 'Community sections' })}
      />
    </div>
  );
}

function CommunitiesPage() {
  const { communities } = Route.useLoaderData();
  const { tab = 'communities' } = Route.useSearch();

  return (
    <CommunitiesShell>
      <CommunitiesTabs active={tab} />

      {tab === 'communities' && (
        <div
          role="tabpanel"
          id="communities-panel-communities"
          aria-labelledby="communities-tab-communities"
        >
          <CommunitiesColumn initialCommunities={communities} embedded />
        </div>
      )}
      {tab === 'events' && (
        <div role="tabpanel" id="communities-panel-events" aria-labelledby="communities-tab-events">
          <EventsColumn embedded />
        </div>
      )}
      {tab === 'spaces' && (
        <div role="tabpanel" id="communities-panel-spaces" aria-labelledby="communities-tab-spaces">
          <SpacesColumn />
        </div>
      )}
    </CommunitiesShell>
  );
}

function CommunitiesPending() {
  return (
    <CommunitiesShell>
      <CommunitiesSkeleton />
    </CommunitiesShell>
  );
}
