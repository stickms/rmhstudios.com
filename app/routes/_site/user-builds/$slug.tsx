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
import { blurImagePreload } from '@/components/ui/BlurImage';
import { getPublicBuildDetail } from '@/lib/user-builds-detail.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

const fetchBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    // Reads the DB in-process. This used to `fetch` this site's own public
    // `/api/user-builds/<slug>`, which put a whole extra HTTP request cycle —
    // TLS to the public hostname, the CDN hop, Apache, a second Nitro render
    // with its own session lookup — in front of this page's first byte. The
    // anonymous projection is preserved exactly; see lib/user-builds-detail.server.
    const build = await getPublicBuildDetail(slug);
    if (!build) throw notFound();
    return build;
  });

export const Route = createFileRoute('/_site/user-builds/$slug')({
  loader: ({ params }) => fetchBuild({ data: params.slug }),
  head: ({ loaderData, params }) => ({
    // As with `/builds/$slug`: the thumbnail is used when there is one, but
    // absolute — a site-relative `og:image` is ignored by every crawler.
    meta: loaderData
      ? buildMeta({
          title: `${loaderData.title} | User Builds`,
          description: loaderData.description,
          path: `/user-builds/${params.slug}`,
          image: loaderData.thumbnailUrl || undefined,
          imageAlt: loaderData.thumbnailUrl
            ? `${loaderData.title} on RMH Studios`
            : undefined,
          imageSize: loaderData.thumbnailUrl ? null : undefined,
          type: 'article',
        })
      : [{ title: 'Build Not Found' }],
    links: [
      buildCanonical(`/user-builds/${params.slug}`),
      // `BuildDetail` renders the thumbnail as this page's LCP element with
      // `priority`; the loader already has the URL, so the fetch starts from the
      // HTML. `blurImagePreload` mirrors the component's own candidate list, so
      // preload and <img> resolve to one download. Props must match the
      // <BlurImage> in `components/user-builds/BuildDetail.tsx`.
      ...(loaderData?.thumbnailUrl
        ? [
            blurImagePreload({
              src: loaderData.thumbnailUrl,
              width: 1280,
              quality: 85,
              sizes: '100vw',
            }),
          ]
        : []),
    ],
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
