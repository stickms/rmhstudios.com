import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { TodayPage } from '@/components/discovery/TodayPage';
import { getLatestDigest } from '@/lib/discovery/today.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

const fetchToday = createServerFn({ method: 'GET' }).handler(() => getLatestDigest());

export const Route = createFileRoute('/_site/today')({
  loader: () => fetchToday(),
  head: () => ({
    meta: buildMeta({
      title: 'Today on RMH | RMH Studios',
      description:
        'The last 24 hours on RMH Studios: top posts, new builds, news and what is trending.',
      path: '/today',
    }),
    links: [buildCanonical('/today')],
  }),
  component: TodayRoute,
});

function TodayRoute() {
  return <TodayPage digest={Route.useLoaderData()} />;
}
