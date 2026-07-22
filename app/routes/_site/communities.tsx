import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { Users, CalendarDays, Radio } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {children}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}

/**
 * Top-of-page section switcher between the three surfaces. §16.2: this is now
 * the shared `LiquidTabs` sheet+capsule grammar (was a bare tab row buried in a
 * `glass-chrome border-b` header — the §5.45 "never in header chrome" violation
 * the owner flagged). It sits BELOW the page title, on its own floating pill,
 * exactly like /store. `?tab=` mirroring + the aria-controls tabpanel wiring
 * (idBase="communities" → `communities-tab-*` / `communities-panel-*`) are
 * byte-identical to the old markup; the mobile drawer button moved to the
 * MobileTopBar (its canonical home) so each embedded column stays header-less.
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
    { id: 'events', label: t('communities-tab-events', { defaultValue: 'Events' }), icon: CalendarDays },
    { id: 'spaces', label: t('communities-tab-spaces', { defaultValue: 'Spaces' }), icon: Radio },
  ];

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/communities', search: { tab: next as CommunitiesTab }, replace: true });
    },
    [navigate],
  );

  return (
    <>
      <MobileTopBar title={t('communities-title', { defaultValue: 'Communities' })} />
      {/* §5.45: floating "Communities" page-title capsule on desktop (mobile uses
          MobileTopBar), then the tab sheet below it. */}
      <div className="mx-2 mt-2 hidden rounded-site glass-chrome px-4 py-3 shadow-site-sm md:mx-3 md:mt-3 md:block">
        <h1 className="font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.022em] text-site-text">
          {t('communities-title', { defaultValue: 'Communities' })}
        </h1>
      </div>
      <div className="my-3 px-2 md:px-3">
        <LiquidTabs
          tabs={tabs}
          value={active}
          onChange={setTab}
          idBase="communities"
          aria-label={t('communities-sections', { defaultValue: 'Community sections' })}
        />
      </div>
    </>
  );
}

function CommunitiesPage() {
  const { communities } = Route.useLoaderData();
  const { tab = 'communities' } = Route.useSearch();

  return (
    <CommunitiesShell>
      <CommunitiesTabs active={tab} />

      {tab === 'communities' && (
        <div role="tabpanel" id="communities-panel-communities" aria-labelledby="communities-tab-communities">
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
          <SpacesColumn embedded />
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
