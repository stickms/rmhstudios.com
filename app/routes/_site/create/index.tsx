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

import { useCallback } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { FileText, Boxes, Bot, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type LiquidTab } from '@/components/ui/liquid-tabs';
import { PageTabs } from '@/components/feed/PageTabs';
import { PageLayout } from '@/components/feed/PageLayout';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';
import { PagesTab, type VibeGallery } from '@/components/creator-studio/PagesTab';
import { UserBuildsTab } from '@/components/creator-studio/BuildsTab';
// Kept for the `?tab=games` → `/games` redirect only: this page no longer
// renders the Arcade block, but it still has to recognise its `?sub=` to hand
// it on intact.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/ArcadeSection';
import { PersonasTab } from '@/components/creator-studio/PersonasTab';
import { EarningsTab } from '@/components/creator-studio/EarningsTab';
import { StudioDashboard } from '@/components/creator-studio/StudioDashboard';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';
import '@/components/builds/builds.css';
import '@/components/creator-studio/creator-studio.css';
import '@/components/creator-studio/storefront.css';

/**
 * `apps` and `games` are both deliberately absent: each catalog is its own page
 * (`/apps`, `/games`), and neither tab rendered anything the catalog page did
 * not. `?tab=apps` and `?tab=games` redirect out (see `beforeLoad`) so deep
 * links survive.
 *
 * The Games tab's *creator* surfaces — the party bar, Ranked, the Arcade Pass —
 * moved WITH it, onto `/games` above the catalog, rather than being deleted:
 * `/arcade` and `/leaderboard` are redirects into that Arcade block, so dropping
 * it would have stranded both routes and taken the daily challenges and the
 * player leaderboard off the site entirely. `?sub=` travels with the redirect.
 */
const STUDIO_TABS = ['pages', 'user-builds', 'personas', 'earnings'] as const;
type StudioTab = (typeof STUDIO_TABS)[number];

/** Tabs this page no longer renders but still answers for, by redirecting. */
const REDIRECTED_TABS = ['apps', 'games'] as const;
type RedirectedTab = (typeof REDIRECTED_TABS)[number];

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string }) => data)
  .handler(({ data }): Promise<VibeGallery> => Promise.resolve(listVibePages(data)));

export const Route = createFileRoute('/_site/create/')({
  head: () => ({
    meta: buildMeta({
      title: 'Create | RMH Studios',
      description:
        'Create pages, play the daily arcade challenges, explore games and apps, and build AI personas — all in one place.',
      path: '/create',
    }),
    links: [buildCanonical('/create')],
  }),
  beforeLoad: ({ search }) => {
    // Both catalogs moved out to their own indexable pages, and the Games tab's
    // creator surfaces went with them — so `?tab=games` carries its `?sub=`
    // across, keeping `/arcade?tab=leaderboard` → `/leaderboard` → here → the
    // board working as one hop chain.
    const { tab, sub } = search as { tab?: string; sub?: string };
    if (tab === 'apps') throw redirect({ to: '/apps' });
    if (tab === 'games') {
      throw redirect({
        to: '/games',
        search: ARCADE_SUB_TABS.includes(sub as ArcadeSubTab) ? { sub: sub as ArcadeSubTab } : {},
      });
    }
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: StudioTab | RedirectedTab; sub?: ArcadeSubTab } => {
    const { tab, sub } = search;
    const known =
      STUDIO_TABS.includes(tab as StudioTab) || REDIRECTED_TABS.includes(tab as RedirectedTab);
    return {
      // The two moved-out tabs are kept VALID here even though this page no
      // longer renders them. `validateSearch` runs before `beforeLoad` and is
      // what `beforeLoad` reads, so a value stripped here is a value the
      // redirect above can never see — dropping them from the union would
      // silently turn `?tab=apps` and `?tab=games` into a bare `/create` rather
      // than the catalog page they point at.
      ...(known ? { tab: tab as StudioTab | RedirectedTab } : {}),
      // `?sub=` is the Arcade block's sub-tab, forwarded to `/games`; anything
      // else is ignored so a stray param can't strand the section on a surface
      // that doesn't exist.
      ...(ARCADE_SUB_TABS.includes(sub as ArcadeSubTab) ? { sub: sub as ArcadeSubTab } : {}),
    };
  },
  loader: async () => ({
    gallery: await fetchGallery({ data: {} }),
    // `curated` is gone with the Games tab — it was read for one count, and the
    // catalogs it flattened are loaded by `/games` and `/apps` themselves now.
    // Fresh per load → each refresh re-advertises a different featured mix while
    // staying deterministic between server render and client hydration.
    seed: Math.floor(Math.random() * 1_000_000) + 1,
  }),
  component: CreatePage,
});

function CreatePage() {
  const { t } = useTranslation('feed');
  const { gallery, seed } = Route.useLoaderData();
  const { tab = 'pages' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      // Switching top-level tab drops `?sub=` — it only means anything inside
      // the Games tab's Arcade block.
      void navigate({ to: '/create', search: { tab: next as StudioTab }, replace: true });
    },
    [navigate],
  );

  const tabs: LiquidTab[] = [
    { id: 'pages', label: t('studio-tab-pages', { defaultValue: 'Pages' }), icon: FileText },
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
        {/* §16.2: the top-level tabs are the shared strip, in the shared
            position. This used to add `.cstudio-tabs` — its own 40px gutter and
            a sticky offset — so Create's strip was 710px wide where every other
            page's was 766px, and it was the only one that followed you down the
            page. It also passed `iconOnly`, which is why two of its six labels
            read "User B…" and "AI Pers…". `?tab=` mirroring, roving nav and the
            aria-controls wiring (idBase="cstudio" → `cstudio-tab-*` /
            `cstudio-panel-*`) are unchanged. */}
        <PageTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          idBase="cstudio"
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
