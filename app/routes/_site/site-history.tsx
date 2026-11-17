/**
 * /site-history — the site's own history, from the first commit to today.
 *
 * Every homepage and feed redesign, with pictures of that commit built and photographed, and each game, app and
 * platform change as it arrived, with the live page one tap away. The entries and how the pictures were made are in
 * components/site-history/entries.ts. (/history is a different page: a signed-in reader's own viewing history.)
 */
import {
  createFileRoute,
  Link,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { SiteHistoryTimeline } from '@/components/site-history/SiteHistoryTimeline';
import {
  buildCanonical,
  buildMeta,
} from '@/lib/seo';

export const Route =
  createFileRoute(
    '/_site/site-history',
  )(
    {
      head: () => ({
        meta: buildMeta(
          {
            title:
              'Site history | RMH Studios',
            description:
              'Every redesign of the RMH Studios homepage and feed, and each game and app as it arrived, from the first commit to today, with pictures and the live pages.',
            path: '/site-history',
          },
        ),
        links:
          [
            buildCanonical(
              '/site-history',
            ),
          ],
      }),
      component:
        SiteHistoryPage,
    },
  );

function SiteHistoryPage() {
  const {
    t,
  } =
    useTranslation(
      'site-history',
    );
  return (
    <PageLayout
      title={t(
        'title',
        {
          defaultValue:
            'Site history',
        },
      )}
      description={t(
        'description',
        {
          defaultValue:
            'Every version of the homepage and feed, and each game and app as it arrived, from the first commit to today.',
        },
      )}
    >
      <div className="t-body max-w-prose space-y-2 pb-6 text-site-text-muted">
        <p>
          {t(
            'intro.picturesToday',
            {
              defaultValue:
                "Pictures of the homepage were taken by building that commit and opening it signed out, with a few invented posts so the feed is not empty. Pictures of games and apps show them as they are today. Open today's page loads the page as it is now inside this one.",
            },
          )}
        </p>
        <p>
          {t(
            'intro.archive',
            {
              defaultValue:
                'Open this version plays the old site or game itself: each was built from its commit and recorded while someone used it, and the recording plays back in your browser. What the recording never saw, such as signing in, posting or a multiplayer lobby, does nothing.',
            },
          )}
        </p>
        <p>
          {t(
            'intro.changelog',
            {
              defaultValue:
                'For the small changes, see the',
            },
          )}{' '}
          <Link
            to="/changelog"
            className="text-site-text underline"
          >
            {t(
              'intro.changelogLink',
              {
                defaultValue:
                  'changelog',
              },
            )}
          </Link>

          .
        </p>
      </div>
      <SiteHistoryTimeline />
    </PageLayout>
  );
}
