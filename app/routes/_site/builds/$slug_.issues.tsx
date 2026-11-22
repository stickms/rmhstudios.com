/**
 * Build issues route: /builds/$slug/issues
 *
 * The `_` after `$slug` un-nests it from `builds/$slug`, whose loader would otherwise run first and render the build
 * page around this one. A private build is a 404 to everyone but its creator, and so is one that does not exist (the
 * loader checks the build's visibility before anything else is read).
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { BuildIssues } from '@/components/user-builds/BuildIssues';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

const fetchIssueBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const { readIssueBuild } = await import('@/lib/builds/issues.server');
    const { getRequestSession } = await import('@/lib/auth-session.server');
    const session = await getRequestSession();
    const build = await readIssueBuild(slug, session?.user?.id ?? null);
    if (!build) throw notFound();
    return { id: build.id, slug: build.slug, title: build.title, visibility: build.visibility };
  });

export const Route = createFileRoute('/_site/builds/$slug_/issues')({
  loader: ({ params }) => fetchIssueBuild({ data: params.slug }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: 'Build issues | RMH Studios' }] };
    return {
      meta: [
        ...buildMeta({
          title: `Issues | ${loaderData.title}`,
          description: `Bugs reported on ${loaderData.title}, and whether the creator has fixed them.`,
          path: `/builds/${params.slug}/issues`,
          // The build's own card: the issue list is about this one build.
          image: ogCardPath('build', loaderData.id),
          imageAlt: `${loaderData.title} on RMH Studios`,
        }),
        // An unlisted build is reachable only by its link; its issues are not indexed.
        // A private build's (the creator's own view) is not indexed either.
        ...(loaderData.visibility === 'PUBLIC' ? [] : [{ name: 'robots', content: 'noindex, nofollow' }]),
      ],
      links: [buildCanonical(`/builds/${params.slug}/issues`)],
    };
  },
  component: BuildIssuesPage,
});

function BuildIssuesPage() {
  const { t } = useTranslation('build-issues');
  const build = Route.useLoaderData();
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Issues' })}
      description={build.title}
      backTo={`/builds/${build.slug}`}
      backLabel={t('back-to-build', { defaultValue: 'Back to the build' })}
      wide
    >
      <div className="px-4 pt-4 pb-12">
        <BuildIssues buildId={build.id} />
      </div>
    </PageLayout>
  );
}
