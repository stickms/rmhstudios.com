import { useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { FollowManager } from '@/components/follows/FollowManager';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildMeta } from '@/lib/seo';
import { followQueryToSearch, parseFollowQuery, type FollowQuery } from '@/lib/social/follow-filters';

const fetchSignedIn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { signedIn: Boolean(session) };
});

export const Route = createFileRoute('/_site/follows')({
  validateSearch: (search: Record<string, unknown>): Partial<FollowQuery> =>
    followQueryToSearch(parseFollowQuery(search)),
  head: () => ({
    meta: [
      ...buildMeta({
        title: 'Followers and following | RMH Studios',
        description: 'Manage who you follow and who follows you.',
        path: '/follows',
      }),
      { name: 'robots', content: 'noindex' },
    ],
  }),
  loader: () => fetchSignedIn(),
  component: FollowsPage,
});

function FollowsPage() {
  const { t } = useTranslation('follows');
  const { signedIn } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = parseFollowQuery(search);

  const onQueryChange = useCallback(
    (next: Partial<FollowQuery>) => {
      void navigate({
        search: (prev) => followQueryToSearch({ ...parseFollowQuery(prev), ...next }),
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <PageLayout
      title={t('title', { defaultValue: 'Followers and following' })}
      description={t('description', {
        defaultValue: 'See who you follow and who follows you, and tidy up either list.',
      })}
    >
      {signedIn ? (
        <FollowManager query={query} onQueryChange={onQueryChange} />
      ) : (
        <SignedOutPrompt
          title={t('signed-out', { defaultValue: 'Sign in to manage who you follow' })}
          callbackURL="/follows"
        />
      )}
    </PageLayout>
  );
}
