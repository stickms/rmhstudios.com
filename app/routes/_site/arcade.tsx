/**
 * /arcade — the player surfaces: the party bar, the Ranked summary and the Arcade
 * Pass (daily challenges, your streak, the player leaderboard).
 *
 * They lived on the games index until that page became the Steam-style library
 * (`/games`), which is a catalog and has no room for them. This page keeps them in
 * the site's own material; `/leaderboard` redirects to its Leaderboard tab.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArcadeSection } from '@/components/creator-studio/ArcadeSection';
// Read by `validateSearch` (in every page's entry), so it comes from the UI-free
// module, not ArcadeSection. See components/creator-studio/arcade-tabs.ts.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { CreatorStudioStyles } from '@/components/creator-studio/CreatorStudioStyles';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import { PartyBar } from '@/components/party/PartyBar';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/arcade')({
  // `?sub=` is the Arcade block's sub-tab, mirrored into the URL so `/leaderboard`
  // can deep-link the board even when the viewer is already on this page.
  validateSearch: (search: Record<string, unknown>): { sub?: ArcadeSubTab } =>
    ARCADE_SUB_TABS.includes(search.sub as ArcadeSubTab) ? { sub: search.sub as ArcadeSubTab } : {},
  head: definePage({
    path: '/arcade',
    title: 'Arcade | RMH Studios',
    description:
      'Daily challenges, your streak, ranked standings and the player leaderboard across every RMH Studios game.',
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { t } = useTranslation('site');
  const { sub = 'challenges' } = Route.useSearch();
  const navigate = useNavigate();

  const setSub = useCallback(
    (next: ArcadeSubTab) => {
      void navigate({ to: '/arcade', search: { sub: next }, replace: true });
    },
    [navigate],
  );

  return (
    <>
      <CreatorStudioStyles />
      <PageLayout
        title={t('arcade-page-title', { defaultValue: 'Arcade' })}
        description={t('arcade-page-subtitle', {
          defaultValue: 'Daily challenges, ranked standings and the player leaderboard.',
        })}
        wide
      >
        <div className="flex flex-col gap-3 pb-12 md:px-4">
          <PartyBar inline />
          <RankedSummary />
          <ArcadeSection sub={sub} onSubChange={setSub} />
        </div>
      </PageLayout>
    </>
  );
}
