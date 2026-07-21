import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { type LucideIcon, Users, CalendarDays, Radio } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileMenuButton } from '@/components/feed/MobileMenuButton';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { CommunitiesColumn } from '@/components/feed/CommunitiesColumn';
import { CommunitiesSkeleton } from '@/components/feed/CommunitiesSkeleton';
import { EventsColumn } from '@/components/events/EventsColumn';
import { SpacesColumn } from '@/components/spaces/SpacesColumn';
import { cn } from '@/lib/utils';
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
 * Top-of-page tab bar switching between the three surfaces. It is the page's one
 * sticky chrome row and carries the mobile drawer button, so each embedded
 * column drops its own sticky header + menu button (see `embedded` props below).
 */
function CommunitiesTabs({ active }: { active: CommunitiesTab }) {
  const { t } = useTranslation('site');
  const navigate = useNavigate();

  const tabs: { id: CommunitiesTab; label: string; icon: LucideIcon }[] = [
    {
      id: 'communities',
      label: t('communities-tab-communities', { defaultValue: 'Communities' }),
      icon: Users,
    },
    { id: 'events', label: t('communities-tab-events', { defaultValue: 'Events' }), icon: CalendarDays },
    { id: 'spaces', label: t('communities-tab-spaces', { defaultValue: 'Spaces' }), icon: Radio },
  ];

  const setTab = useCallback(
    (next: CommunitiesTab) => {
      void navigate({ to: '/communities', search: { tab: next }, replace: true });
    },
    [navigate],
  );

  // Roving keyboard navigation for the tablist (WAI-ARIA tabs pattern):
  // ←/→ (and ↑/↓) move between tabs, Home/End jump to the ends, focus follows.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = COMMUNITIES_TABS.indexOf(active);
      let next = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % COMMUNITIES_TABS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        next = (idx - 1 + COMMUNITIES_TABS.length) % COMMUNITIES_TABS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = COMMUNITIES_TABS.length - 1;
      else return;
      e.preventDefault();
      const nextId = COMMUNITIES_TABS[next];
      setTab(nextId);
      requestAnimationFrame(() => document.getElementById(`communities-tab-${nextId}`)?.focus());
    },
    [active, setTab],
  );

  return (
    <div className="sticky top-0 z-20 glass-chrome border-b border-site-border">
      <div className="flex items-center gap-1 px-2 py-2">
        <MobileMenuButton />
        <div
          role="tablist"
          aria-label={t('communities-sections', { defaultValue: 'Community sections' })}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          onKeyDown={onKeyDown}
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                id={`communities-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`communities-panel-${id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-site-accent-dim text-site-accent'
                    : 'text-site-text-muted hover:bg-site-surface-hover hover:text-site-text',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>
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
