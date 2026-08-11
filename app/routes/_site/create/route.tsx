/**
 * /create — the Create hub's layout route.
 *
 * The unified creation hub that combines what used to be separate destinations
 * — Pages (RMHVibe generation), User Builds, AI Personas and Earnings — under
 * one header and one tab strip.
 *
 * Each tab is a **child route**, not a `?tab=` value. This file owns what they
 * share (the header, the strip, the `.cstudio-screen` wrapper) and renders each
 * surface through `<Outlet/>`. Splitting them bought three things a search param
 * could not: a real URL per surface (`/create/earnings` rather than
 * `/create?tab=earnings`), a canonical and title per surface, and a loader per
 * surface — `/create` used to fetch the Pages gallery on every visit no matter
 * which tab you opened.
 *
 * The old `?tab=` links still work; `beforeLoad` maps each one to its path
 * below, so bookmarks and the many in-app deep links survive the move.
 *
 * (Note: the standalone `/studio` route is a separate music DAW — "RMH Studio".)
 */

import { createFileRoute, redirect, Outlet, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { StudioTabs, STUDIO_TAB_PATHS, type StudioTabPath } from '@/components/creator-studio/StudioTabs';
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/ArcadeSection';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';
import '@/components/builds/builds.css';
import '@/components/creator-studio/creator-studio.css';
import '@/components/creator-studio/storefront.css';

/**
 * Where each legacy `?tab=` value now lives.
 *
 * `apps` and `games` leave the hub entirely: each catalog is its own indexable
 * page. The Games tab's *creator* surfaces — the party bar, Ranked, the Arcade
 * Pass — moved to `/games` with it rather than being deleted, since `/arcade`
 * and `/leaderboard` redirect into that Arcade block; `?sub=` travels along.
 */
const LEGACY_TAB_PATHS: Record<string, string> = {
  pages: '/create',
  'user-builds': '/create/builds',
  personas: '/create/personas',
  earnings: '/create/earnings',
  apps: '/apps',
  games: '/games',
};

export const Route = createFileRoute('/_site/create')({
  validateSearch: (search: Record<string, unknown>): { tab?: string; sub?: ArcadeSubTab } => {
    const { tab, sub } = search;
    return {
      // Any legacy tab value is kept VALID here even though nothing renders one
      // any more. `validateSearch` runs before `beforeLoad` and is what
      // `beforeLoad` reads, so a value stripped here is a value the redirect
      // below can never see — dropping them would silently turn every old
      // `?tab=` link into a bare `/create` instead of the surface it names.
      ...(typeof tab === 'string' && tab in LEGACY_TAB_PATHS ? { tab } : {}),
      // `?sub=` is the Arcade block's sub-tab, forwarded to `/games`; anything
      // else is ignored so a stray param can't strand it on a surface that
      // doesn't exist.
      ...(ARCADE_SUB_TABS.includes(sub as ArcadeSubTab) ? { sub: sub as ArcadeSubTab } : {}),
    };
  },
  beforeLoad: ({ search }) => {
    const { tab, sub } = search;
    if (!tab) return;
    const to = LEGACY_TAB_PATHS[tab];
    // The redirect drops `?tab=` (and `?sub=`, except on the one hop that means
    // something), so the destination re-enters with no param and cannot loop.
    throw redirect({
      to,
      search: to === '/games' && sub ? { sub } : {},
      replace: true,
    });
  },
  component: CreateLayout,
});

function CreateLayout() {
  const { t } = useTranslation('feed');
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Exact match, longest first — `/create` is a prefix of every other tab path,
  // so a `startsWith` test would light Pages on all four.
  const active: StudioTabPath =
    STUDIO_TAB_PATHS.find((p) => p === pathname.replace(/\/+$/, '')) ?? '/create';

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
        {/* §16.2: the shared strip in the shared position. This used to add
            `.cstudio-tabs` — its own 40px gutter and a sticky offset — so
            Create's strip was 710px wide where every other page's was 766px,
            and it was the only one that followed you down the page. It also
            passed `iconOnly`, which is why two of its labels read "User B…" and
            "AI Pers…". */}
        <StudioTabs active={active} />
        <Outlet />
      </div>
    </PageLayout>
  );
}
