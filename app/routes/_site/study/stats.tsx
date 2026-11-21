import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { StatsPage } from '@/components/study/StatsPage';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/study/stats')({
  head: () => noindexHead('Study statistics'),
  validateSearch: (search: Record<string, unknown>): { deck?: string } =>
    typeof search.deck === 'string' && search.deck.length > 0 && search.deck.length <= 64 ? { deck: search.deck } : {},
  component: StudyStatsRoute,
});

function StudyStatsRoute() {
  const { deck } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PageFrame>
      <StatsPage
        deckId={deck}
        onDeckChange={(next) =>
          void navigate({
            to: '/study/stats',
            search: next ? { deck: next } : {},
            replace: true,
          })
        }
      />
    </PageFrame>
  );
}
