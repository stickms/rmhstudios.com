import { lazy } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BookMarked, Highlighter, NotebookPen, Target } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { parseReadingTab, type ReadingTab } from '@/lib/reading/tabs';

const MyHighlightsPanel = lazy(() => import('./MyHighlightsPanel'));
const HighlightsNotebook = lazy(() => import('./HighlightsNotebook'));
const ShelvesPanel = lazy(() => import('./ShelvesPanel'));
const ChallengePanel = lazy(() => import('./ChallengePanel'));

/**
 * "My reading": highlights and notes (L1), shelves (L7) and the yearly reading
 * challenge (L3), as the library's `?view=reading` section. It was the
 * standalone /reading page until the 2026-11-19 consolidation; that route now
 * redirects here and carries its `?tab=` along. The sub-tab is `&tab=` on
 * /library, so each part still has its own address.
 */
export function MyReadingView({ tab }: { tab: ReadingTab }) {
  const { t } = useTranslation('f-reading');
  const navigate = useNavigate();
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-2 pb-12" aria-labelledby="my-reading-title">
      <div>
        <h2 id="my-reading-title" className="t-heading">
          {t('my-reading', {
            defaultValue: 'My reading',
          })}
        </h2>
        <p className="t-body mt-1 text-site-text-muted">
          {t('my-reading-lede', {
            defaultValue: 'Your highlights and notes, your shelves, and your reading challenge.',
          })}
        </p>
      </div>
      <Tabs
        aria-label={t('my-reading-tabs', {
          defaultValue: 'My reading sections',
        })}
        value={tab}
        onChange={(id) =>
          void navigate({
            to: '/library',
            search: {
              view: 'reading',
              tab: parseReadingTab(id),
            },
            replace: true,
            resetScroll: false,
          })
        }
        tabs={[
          {
            id: 'highlights',
            label: t('tab-highlights', {
              defaultValue: 'Highlights',
            }),
            icon: Highlighter,
          },
          {
            id: 'notebook',
            label: t('tab-notebook', {
              ns: 'highlights',
              defaultValue: 'Notebook',
            }),
            icon: NotebookPen,
          },
          {
            id: 'shelves',
            label: t('tab-shelves', {
              defaultValue: 'Shelves',
            }),
            icon: BookMarked,
          },
          {
            id: 'challenge',
            label: t('tab-challenge', {
              defaultValue: 'Challenge',
            }),
            icon: Target,
          },
        ]}
      />
      <div>
        <ArrivalSuspense fallback={<Skeleton className="h-40 w-full" />}>
          {tab === 'highlights' ? <MyHighlightsPanel /> : null}
          {tab === 'notebook' ? <HighlightsNotebook /> : null}
          {tab === 'shelves' ? <ShelvesPanel /> : null}
          {tab === 'challenge' ? <ChallengePanel /> : null}
        </ArrivalSuspense>
      </div>
    </section>
  );
}
