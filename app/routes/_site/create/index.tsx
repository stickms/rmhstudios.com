/**
 * /create — Create.
 *
 * The unified creation hub that combines what used to be separate destinations
 * — Pages (RMHVibe generation), Builds (official + community games/apps), AI
 * Personas, and now the Arcade Pass — into a single wide-layout page with a
 * sticky tab bar. The active tab is mirrored into the `?tab=` search param so
 * deep links and back-navigation land on the right surface, and the Arcade
 * block's own sub-tab into `?sub=` (so `/leaderboard` can deep-link the board).
 *
 * (Note: the standalone `/studio` route is a separate music DAW — "RMH Studio".)
 */

import { useCallback, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { FileText, Gamepad2, AppWindow, Boxes, Bot, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { PageLayout } from '@/components/feed/PageLayout';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';
import { PagesTab, type VibeGallery } from '@/components/creator-studio/PagesTab';
import { CuratedBuildsTab, UserBuildsTab } from '@/components/creator-studio/BuildsTab';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import {
  ArcadeSection,
  ARCADE_SUB_TABS,
  type ArcadeSubTab,
} from '@/components/creator-studio/ArcadeSection';
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
      { title: 'Create | RMH Studios' },
      {
        name: 'description',
        content:
          'Create pages, play the daily arcade challenges, explore games and apps, and build AI personas — all in one place.',
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: StudioTab; sub?: ArcadeSubTab } => {
    const { tab, sub } = search;
    return {
      ...(STUDIO_TABS.includes(tab as StudioTab) ? { tab: tab as StudioTab } : {}),
      // `?sub=` is the Games tab's Arcade block; anything else is ignored so a
      // stray param can't strand the section on a surface that doesn't exist.
      ...(ARCADE_SUB_TABS.includes(sub as ArcadeSubTab) ? { sub: sub as ArcadeSubTab } : {}),
    };
  },
  loader: async () => ({
    gallery: await fetchGallery({ data: {} }),
    curated: listCuratedBuilds(),
    // Fresh per load → each refresh re-advertises a different featured mix while
    // staying deterministic between server render and client hydration.
    seed: Math.floor(Math.random() * 1_000_000) + 1,
  }),
  component: CreatePage,
});

function CreatePage() {
  const { t } = useTranslation('feed');
  const { gallery, curated, seed } = Route.useLoaderData();
  const { tab = 'pages', sub = 'challenges' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      // Switching top-level tab drops `?sub=` — it only means anything inside
      // the Games tab's Arcade block.
      void navigate({ to: '/create', search: { tab: next as StudioTab }, replace: true });
    },
    [navigate],
  );

  const setArcadeSub = useCallback(
    (next: ArcadeSubTab) => {
      void navigate({ to: '/create', search: { tab: 'games', sub: next }, replace: true });
    },
    [navigate],
  );

  const games = useMemo(() => curated.filter((b) => b.kind === 'game'), [curated]);
  const apps = useMemo(() => curated.filter((b) => b.kind === 'app'), [curated]);

  const tabs: LiquidTab[] = [
    { id: 'pages', label: t('studio-tab-pages', { defaultValue: 'Pages' }), icon: FileText },
    { id: 'games', label: t('studio-tab-games', { defaultValue: 'Games' }), icon: Gamepad2 },
    { id: 'apps', label: t('studio-tab-apps', { defaultValue: 'Apps' }), icon: AppWindow },
    {
      id: 'user-builds',
      label: t('studio-tab-user-builds', { defaultValue: 'User Builds' }),
      icon: Boxes,
    },
    { id: 'personas', label: t('studio-tab-personas', { defaultValue: 'AI Personas' }), icon: Bot },
    { id: 'earnings', label: t('studio-tab-earnings', { defaultValue: 'Earnings' }), icon: Coins },
  ];

  return (
    <PageLayout
      title={t('create', { defaultValue: 'Create' })}
      description={t('studio-sub', {
        defaultValue:
          'Generate shareable pages, dive into our games and apps, and craft AI personas — your whole creative toolkit in one place.',
      })}
    >
      {/* `.cstudio-screen` stays as the wrapper: it declares `--studio-gutter`
          and the sticky-group height every `.cstudio-*` descendant reads. What
          it no longer carries is a bespoke hero — the page title is the shared
          `PageLayout` header now, the same one /predictions and /developer use,
          so Create stops being the one page with its own headline scale. */}
      <div className="cstudio-screen vibe-screen min-h-screen">
        {/* §16.2: the top-level tabs are now the shared LiquidTabs sheet (was
            bespoke `.cstudio-tab*` markup). `.cstudio-tabs` positions the sheet
            only (sticky below the hero, gutter margins, column max-width — the
            glass pill look comes from LiquidTabs); `scroll` decouples the inner
            horizontal overflow from the sticky sheet (the mobile-Safari sticky +
            overflow bug the old `__scroll` split guarded against). `?tab=`
            mirroring, roving nav and the aria-controls wiring (idBase="cstudio" →
            `cstudio-tab-*` / `cstudio-panel-*`) are byte-identical. */}
        <LiquidTabs
          className="cstudio-tabs"
          tabs={tabs}
          value={tab}
          onChange={setTab}
          idBase="cstudio"
          scroll
          iconOnly
          aria-label={t('create', { defaultValue: 'Create' })}
        />

        {tab === 'pages' && (
          <div
            className="cstudio-body cstudio-body--pages"
            role="tabpanel"
            id="cstudio-panel-pages"
            aria-labelledby="cstudio-tab-pages"
          >
            <PagesTab initial={gallery} seed={seed} fetchGallery={fetchGallery} />
          </div>
        )}
        {tab === 'games' && (
          <div
            className="cstudio-body"
            role="tabpanel"
            id="cstudio-panel-games"
            aria-labelledby="cstudio-tab-games"
          >
            <PartyBar inline />
            <RankedSummary />
            <ArcadeSection sub={sub} onSubChange={setArcadeSub} />
            <CuratedBuildsTab
              curated={games}
              seed={seed + 1}
              searchPlaceholder={t('search-games-placeholder', { defaultValue: 'Search games...' })}
              emptyLabel={t('empty-games', { defaultValue: 'No games match that search.' })}
            />
          </div>
        )}
        {tab === 'apps' && (
          <div
            className="cstudio-body"
            role="tabpanel"
            id="cstudio-panel-apps"
            aria-labelledby="cstudio-tab-apps"
          >
            <CuratedBuildsTab
              curated={apps}
              seed={seed + 2}
              searchPlaceholder={t('search-apps-placeholder', { defaultValue: 'Search apps...' })}
              emptyLabel={t('empty-apps', { defaultValue: 'No apps match that search.' })}
            />
          </div>
        )}
        {tab === 'user-builds' && (
          <div
            className="cstudio-body"
            role="tabpanel"
            id="cstudio-panel-user-builds"
            aria-labelledby="cstudio-tab-user-builds"
          >
            <UserBuildsTab seed={seed + 3} />
          </div>
        )}
        {tab === 'personas' && (
          <div
            className="cstudio-body"
            role="tabpanel"
            id="cstudio-panel-personas"
            aria-labelledby="cstudio-tab-personas"
          >
            <PersonasTab seed={seed + 4} />
          </div>
        )}
        {tab === 'earnings' && (
          <div
            className="cstudio-body"
            role="tabpanel"
            id="cstudio-panel-earnings"
            aria-labelledby="cstudio-tab-earnings"
          >
            <StudioDashboard />
            <EarningsTab />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
