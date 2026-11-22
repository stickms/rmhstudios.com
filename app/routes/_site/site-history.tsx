/**
 * /site-history — the site's own history, from the first commit to today.
 *
 * Every homepage and feed redesign, with pictures of that commit built and photographed, and each game, app and
 * platform change as it arrived, with the live page one tap away. The entries and how the pictures were made are in
 * components/site-history/entries.ts. The release notes sit above the timeline under
 * #changes; /changelog, which listed only them, redirects there. (/history is a different page: a signed-in reader's own viewing history.)
 */
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { SiteHistoryTimeline } from '@/components/site-history/SiteHistoryTimeline';
import { ChangelogList } from '@/components/devplatform/ChangelogList';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/site-history')({
  head: () => ({
    meta: buildMeta({
      title: 'Site history | RMH Studios',
      description:
        'The latest release notes, then every redesign of the RMH Studios homepage and feed and each game and app as it arrived, from the first commit to today.',
      path: '/site-history',
    }),
    links: [buildCanonical('/site-history')],
  }),
  component: SiteHistoryPage,
});

function SiteHistoryPage() {
  const { t } = useTranslation('site-history');
  return (
    <PageLayout
      title={t('title', {
        defaultValue: 'Site history',
      })}
      description={t('description', {
        defaultValue:
          'Every version of the homepage and feed, and each game and app as it arrived, from the first commit to today.',
      })}
    >
      <div className="t-body max-w-prose space-y-2 pb-6 text-site-text-muted">
        <p>
          {t('intro.picturesToday', {
            defaultValue:
              "Pictures of the homepage were taken by building that commit and opening it signed out, with a few invented posts so the feed is not empty. Pictures of games and apps show them as they are today. Open today's page loads the page as it is now inside this one.",
          })}
        </p>
        <p>
          {t('intro.archive', {
            defaultValue:
              'Open this version plays the old site or game itself: each was built from its commit and recorded while someone used it, and the recording plays back in your browser. What the recording never saw, such as signing in, posting or a multiplayer lobby, does nothing.',
          })}
        </p>
      </div>
      <section
        id="changes"
        aria-labelledby="site-history-changes"
        className="scroll-mt-4 border-t border-site-border pt-6 pb-8"
      >
        <h2 id="site-history-changes" className="t-heading">
          {t('changes.title', {
            defaultValue: 'Latest changes',
          })}
        </h2>
        <p className="t-body mt-1 mb-4 text-site-text-muted">
          {t('changes.body', {
            defaultValue:
              'The release notes for the small changes: new features, fixes and improvements, newest first.',
          })}
        </p>
        <ChangelogList limit={5} />
      </section>
      <SiteHistoryTimeline />
    </PageLayout>
  );
}
