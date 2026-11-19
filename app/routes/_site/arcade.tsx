/**
 * /arcade — the player surfaces: the party bar, the Ranked summary and the Arcade
 * Pass (daily challenges and your streak).
 *
 * They lived on the games index until that page became the Steam-style library
 * (`/games`), which is a catalog and has no room for them. This page keeps them in
 * the site's own material. The standings (ranked ladders, tournaments,
 * speedruns, wagers and the player leaderboard) are `/compete`, linked from the
 * header here; the leaderboard was this page's second sub-tab, so an old
 * `/arcade?sub=leaderboard` link is forwarded to it.
 */

import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Swords } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { ArcadeSection } from '@/components/creator-studio/ArcadeSection';
// Read by `validateSearch` (in every page's entry), so it comes from the UI-free
// module, not ArcadeSection. See components/creator-studio/arcade-tabs.ts.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { CreatorStudioStyles } from '@/components/creator-studio/CreatorStudioStyles';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import { PartyBar } from '@/components/party/PartyBar';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/arcade')({
  // `?sub=` was the Arcade block's sub-tab. Old links still carry it: the
  // leaderboard one is sent to its new home, any other value is dropped.
  validateSearch: (search: Record<string, unknown>): { sub?: ArcadeSubTab } =>
    ARCADE_SUB_TABS.includes(search.sub as ArcadeSubTab) ? { sub: search.sub as ArcadeSubTab } : {},
  beforeLoad: ({ search }) => {
    if (search.sub === 'leaderboard') {
      throw redirect({ to: '/compete', search: { tab: 'leaderboard' }, replace: true });
    }
  },
  head: definePage({
    path: '/arcade',
    title: 'Arcade | RMH Studios',
    description:
      'Daily challenges, your streak and the ranked summary across every RMH Studios game.',
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { t } = useTranslation('site');

  return (
    <>
      <CreatorStudioStyles />
      <PageLayout
        title={t('arcade-page-title', { defaultValue: 'Arcade' })}
        description={t('arcade-page-subtitle-compete', {
          defaultValue: 'Daily challenges, your streak and your ranked standing.',
        })}
        headerRight={
          <Button asChild variant="default" size="sm">
            <Link to="/compete">
              <Swords aria-hidden />
              {t('arcade-open-compete', { defaultValue: 'Compete' })}
            </Link>
          </Button>
        }
        wide
      >
        <div className="flex flex-col gap-3 pb-12 md:px-4">
          <PartyBar inline />
          <RankedSummary />
          <ArcadeSection />
        </div>
      </PageLayout>
    </>
  );
}
