'use client';

import { lazy, Suspense } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BookMarked, Highlighter, Target } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { parseReadingTab, type ReadingTab } from '@/lib/reading/tabs';

const MyHighlightsPanel = lazy(() => import('./MyHighlightsPanel'));
const ShelvesPanel = lazy(() => import('./ShelvesPanel'));
const ChallengePanel = lazy(() => import('./ChallengePanel'));

/** /reading — highlights, shelves and the yearly challenge in one place. */
export function MyReadingPage({ tab }: { tab: ReadingTab }) {
  const { t } = useTranslation('f-reading');
  const navigate = useNavigate();
  return (
    <PageLayout
      title={t('my-reading', { defaultValue: 'My reading' })}
      description={t('my-reading-lede', {
        defaultValue: 'Your highlights and notes, your shelves, and your reading challenge.',
      })}
      backTo="/library"
      backLabel={t('back-to-library', { defaultValue: 'Back to the library' })}
    >
      <div className="space-y-4 px-4 pt-4 pb-12">
        <LiquidTabs
          aria-label={t('my-reading-tabs', { defaultValue: 'My reading sections' })}
          value={tab}
          onChange={(id) =>
            void navigate({ to: '/reading', search: { tab: parseReadingTab(id) }, replace: true })
          }
          tabs={[
            {
              id: 'highlights',
              label: t('tab-highlights', { defaultValue: 'Highlights' }),
              icon: Highlighter,
            },
            {
              id: 'shelves',
              label: t('tab-shelves', { defaultValue: 'Shelves' }),
              icon: BookMarked,
            },
            {
              id: 'challenge',
              label: t('tab-challenge', { defaultValue: 'Challenge' }),
              icon: Target,
            },
          ]}
        />
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          {tab === 'highlights' ? <MyHighlightsPanel /> : null}
          {tab === 'shelves' ? <ShelvesPanel /> : null}
          {tab === 'challenge' ? <ChallengePanel /> : null}
        </Suspense>
      </div>
    </PageLayout>
  );
}
