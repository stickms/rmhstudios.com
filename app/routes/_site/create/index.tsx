/**
 * /create — Creator Studio.
 *
 * The unified creation hub that combines what used to be three separate
 * destinations — Pages (RMHVibe generation), Builds (official + community
 * games/apps), and AI Personas — into a single wide-layout page with a sticky
 * tab bar. The active tab is mirrored into the `?tab=` search param so deep
 * links and back-navigation land on the right surface.
 *
 * (Note: the standalone `/studio` route is a separate music DAW — "RMH Studio".
 * This Creator Studio lives at `/create` to avoid colliding with it.)
 */

import { useCallback, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { type LucideIcon, FileText, Gamepad2, AppWindow, Boxes, Bot, Coins } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';
import { PagesTab, type VibeGallery } from '@/components/creator-studio/PagesTab';
import { CuratedBuildsTab, UserBuildsTab } from '@/components/creator-studio/BuildsTab';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import { PersonasTab } from '@/components/creator-studio/PersonasTab';
import { EarningsTab } from '@/components/creator-studio/EarningsTab';
import { StudioDashboard } from '@/components/creator-studio/StudioDashboard';
import { PartyBar } from '@/components/party/PartyBar';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';
import '@/components/builds/builds.css';
import '@/components/creator-studio/creator-studio.css';
import '@/components/creator-studio/storefront.css';

const STUDIO_TABS = ['pages', 'games', 'apps', 'user-builds', 'personas', 'earnings'] as const;
type StudioTab = (typeof STUDIO_TABS)[number];

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string }) => data)
  .handler(({ data }): Promise<VibeGallery> => Promise.resolve(listVibePages(data)));

export const Route = createFileRoute('/_site/create/')({
  head: () => ({
    meta: [
      { title: 'Creator Studio | RMH Studios' },
      {
        name: 'description',
        content: 'Create pages, explore games and apps, and build AI personas — all in one place.',
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: StudioTab } => {
    const tab = search.tab;
    return STUDIO_TABS.includes(tab as StudioTab) ? { tab: tab as StudioTab } : {};
  },
  loader: async () => ({
    gallery: await fetchGallery({ data: {} }),
    curated: listCuratedBuilds(),
    // Fresh per load → each refresh re-advertises a different featured mix while
    // staying deterministic between server render and client hydration.
    seed: Math.floor(Math.random() * 1_000_000) + 1,
  }),
  component: CreatorStudio,
});

function CreatorStudio() {
  const { t } = useTranslation('feed');
  const { gallery, curated, seed } = Route.useLoaderData();
  const { tab = 'pages' } = Route.useSearch();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const setTab = useCallback(
    (next: StudioTab) => {
      void navigate({ to: '/create', search: { tab: next }, replace: true });
    },
    [navigate],
  );

  // Roving keyboard navigation for the tablist (WAI-ARIA tabs pattern):
  // ←/→ move between tabs, Home/End jump to the ends, and focus follows.
  const onTabsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = STUDIO_TABS.indexOf(tab);
      let next = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % STUDIO_TABS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + STUDIO_TABS.length) % STUDIO_TABS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = STUDIO_TABS.length - 1;
      else return;
      e.preventDefault();
      const nextId = STUDIO_TABS[next];
      setTab(nextId);
      requestAnimationFrame(() => document.getElementById(`cstudio-tab-${nextId}`)?.focus());
    },
    [tab, setTab],
  );

  const games = useMemo(() => curated.filter((b) => b.kind === 'game'), [curated]);
  const apps = useMemo(() => curated.filter((b) => b.kind === 'app'), [curated]);

  const tabs: { id: StudioTab; label: string; icon: LucideIcon }[] = [
    { id: 'pages', label: t('studio-tab-pages', { defaultValue: 'Pages' }), icon: FileText },
    { id: 'games', label: t('studio-tab-games', { defaultValue: 'Games' }), icon: Gamepad2 },
    { id: 'apps', label: t('studio-tab-apps', { defaultValue: 'Apps' }), icon: AppWindow },
    { id: 'user-builds', label: t('studio-tab-user-builds', { defaultValue: 'User Builds' }), icon: Boxes },
    { id: 'personas', label: t('studio-tab-personas', { defaultValue: 'AI Personas' }), icon: Bot },
    { id: 'earnings', label: t('studio-tab-earnings', { defaultValue: 'Earnings' }), icon: Coins },
  ];

  return (
    <>
      <AnimatedMain
        className="cstudio-screen vibe-screen min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('creator-studio', { defaultValue: 'Creator Studio' })} />

        <header className="cstudio-head">
          <h1 className="cstudio-title">
            {t('studio-headline', { defaultValue: 'Make anything.' })}
          </h1>
          <p className="cstudio-sub">
            {t('studio-sub', {
              defaultValue:
                'Generate shareable pages, dive into our games and apps, and craft AI personas — your whole creative toolkit in one place.',
            })}
          </p>
        </header>

        <div className="cstudio-tabs">
          <div
            className="cstudio-tabs__scroll"
            role="tablist"
            aria-label={t('creator-studio', { defaultValue: 'Creator Studio' })}
            onKeyDown={onTabsKeyDown}
          >
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  id={`cstudio-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`cstudio-panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  className={`cstudio-tab ${active ? 'is-active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {/* Flowing active capsule (§5.4): a layoutId motion element kept
                      ON the existing markup so the richer tab/tabpanel ARIA
                      (aria-controls + aria-labelledby) survives — LiquidTabs has no
                      aria-controls, so migrating to it would drop that wiring. */}
                  {active && (
                    <motion.span
                      layoutId="cstudio-tab-capsule"
                      aria-hidden
                      className="glass-liquid absolute inset-0 rounded-full bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]"
                      transition={reduced ? { duration: 0 } : SPRING.snappy}
                    />
                  )}
                  <Icon className="cstudio-tab__icon relative z-1" aria-hidden="true" />
                  <span className="relative z-1">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'pages' && (
          <div className="cstudio-body cstudio-body--pages" role="tabpanel" id="cstudio-panel-pages" aria-labelledby="cstudio-tab-pages">
            <PagesTab initial={gallery} seed={seed} fetchGallery={fetchGallery} />
          </div>
        )}
        {tab === 'games' && (
          <div className="cstudio-body" role="tabpanel" id="cstudio-panel-games" aria-labelledby="cstudio-tab-games">
            <PartyBar inline />
            <RankedSummary />
            <CuratedBuildsTab
              curated={games}
              seed={seed + 1}
              searchPlaceholder={t('search-games-placeholder', { defaultValue: 'Search games...' })}
              emptyLabel={t('empty-games', { defaultValue: 'No games match that search.' })}
            />
          </div>
        )}
        {tab === 'apps' && (
          <div className="cstudio-body" role="tabpanel" id="cstudio-panel-apps" aria-labelledby="cstudio-tab-apps">
            <CuratedBuildsTab
              curated={apps}
              seed={seed + 2}
              searchPlaceholder={t('search-apps-placeholder', { defaultValue: 'Search apps...' })}
              emptyLabel={t('empty-apps', { defaultValue: 'No apps match that search.' })}
            />
          </div>
        )}
        {tab === 'user-builds' && (
          <div className="cstudio-body" role="tabpanel" id="cstudio-panel-user-builds" aria-labelledby="cstudio-tab-user-builds">
            <UserBuildsTab seed={seed + 3} />
          </div>
        )}
        {tab === 'personas' && (
          <div className="cstudio-body" role="tabpanel" id="cstudio-panel-personas" aria-labelledby="cstudio-tab-personas">
            <PersonasTab seed={seed + 4} />
          </div>
        )}
        {tab === 'earnings' && (
          <div className="cstudio-body" role="tabpanel" id="cstudio-panel-earnings" aria-labelledby="cstudio-tab-earnings">
            <StudioDashboard />
            <EarningsTab />
          </div>
        )}
      </AnimatedMain>
      {/* Trailing gutter to match the feed/blog layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
