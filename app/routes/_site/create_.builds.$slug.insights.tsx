/**
 * /create/builds/$slug/insights — a build's first views, likes, comments, unlocks and coins per day, for its owner.
 * `noindex`: every figure on it is the owner's own (a signed-out visitor or another member sees a sign-in prompt or
 * "not found").
 */
import { createFileRoute } from '@tanstack/react-router';
import { Boxes } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Spinner } from '@/components/ui/spinner';
import { BuildInsights } from '@/components/user-builds/BuildInsights';
import { parseRange } from '@/lib/builds/insights';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/create_/builds/$slug/insights')({
  validateSearch: (search: Record<string, unknown>): { range?: '7' | '30' | '90' } => {
    const range = search.range;
    return range === '7' || range === '30' || range === '90' ? { range } : {};
  },
  head: ({ params }) => ({
    meta: [
      ...buildMeta({
        title: 'Build insights | RMH Studios',
        description: 'Views, likes, comments and unlocks of your build, day by day.',
        path: `/create/builds/${params.slug}/insights`,
      }),
      { name: 'robots', content: 'noindex' },
    ],
    links: [buildCanonical(`/create/builds/${params.slug}/insights`)],
  }),
  component: BuildInsightsPage,
});

function BuildInsightsPage() {
  const { t } = useTranslation('build-insights');
  const { slug } = Route.useParams();
  const { range } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: session, isPending } = useSession();
  const title = t('title', { defaultValue: 'Build insights' });

  if (isPending) {
    return (
      <PageLayout title={title} backTo="/create/builds/manage">
        <div className="flex min-h-[40dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={title} backTo="/create/builds/manage">
        <SignedOutPrompt
          icon={Boxes}
          callbackURL={`/create/builds/${slug}/insights`}
          title={t('sign-in-title', { defaultValue: 'Sign in to see your build insights' })}
          description={t('sign-in-body', { defaultValue: 'Insights are shown to the build’s owner.' })}
          actionLabel={t('sign-in', { defaultValue: 'Sign in' })}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={title}
      description={t('subtitle', { defaultValue: 'How people found, liked and unlocked this build.' })}
      backTo="/create/builds/manage"
    >
      <div className="px-4 pt-4 pb-12">
        <BuildInsights
          slug={slug}
          range={parseRange(range)}
          onRangeChange={(next) => void navigate({ search: { range: String(next) as '7' | '30' | '90' }, replace: true })}
        />
      </div>
    </PageLayout>
  );
}
