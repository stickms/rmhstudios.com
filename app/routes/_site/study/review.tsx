import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { ReviewAll } from '@/components/study/ReviewAll';
import { noindexHead } from '@/lib/seo';

export const Route =
  createFileRoute(
    '/_site/study/review',
  )(
    {
      head: () =>
        noindexHead(
          'Review all',
        ),
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          folder?: string;
        } => ({
          folder:
            typeof search.folder ===
              'string' &&
            /^[A-Za-z0-9_-]{1,64}$/.test(
              search.folder,
            )
              ? search.folder
              : undefined,
        }),
      component:
        StudyReviewRoute,
    },
  );

function StudyReviewRoute() {
  const {
    folder,
  } =
    Route.useSearch();
  return (
    <PageFrame>
      <ReviewAll
        folder={
          folder
        }
      />
    </PageFrame>
  );
}
