/**
 * User Build Detail Route — /user-builds/$slug
 *
 * The sibling of `/builds/$slug` for community builds; both render the shared
 * `BuildDetail` body, so both live under `_site/` and share the standard site
 * shell rather than the old top-level `vibe.css` full-screen treatment.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createServerFn } from '@tanstack/react-start';
import { PageLayout } from '@/components/feed/PageLayout';
import { BuildDetail } from '@/components/user-builds';
import { stripTrailingSlash } from '@/lib/url';

const fetchBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const baseUrl = stripTrailingSlash(
      import.meta.env.VITE_BETTER_AUTH_URL || 'http://localhost:3000',
    );
    const res = await fetch(`${baseUrl}/api/user-builds/${slug}`, { cache: 'no-store' });
    if (!res.ok) throw notFound();
    return res.json();
  });

export const Route = createFileRoute('/_site/user-builds/$slug')({
  loader: ({ params }) => fetchBuild({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | User Builds` },
          { name: 'description', content: loaderData.description },
          { property: 'og:title', content: loaderData.title },
          { property: 'og:description', content: loaderData.description },
          ...(loaderData.thumbnailUrl
            ? [{ property: 'og:image', content: loaderData.thumbnailUrl }]
            : []),
        ]
      : [{ title: 'Build Not Found' }],
  }),
  component: BuildPage,
});

function BuildPage() {
  const { t } = useTranslation('pages');
  const build = Route.useLoaderData();

  return (
    <PageLayout
      title={build.title}
      description={build.description}
      backTo="/create"
      backLabel={t('back-to-builds', { defaultValue: 'Back to builds' })}
      wide
    >
      <div className="px-4 pt-4 pb-12">
        <BuildDetail build={build} />
      </div>
    </PageLayout>
  );
}
