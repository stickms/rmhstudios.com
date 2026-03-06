/**
 * User Build Detail Route
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { BuildDetail } from '@/components/user-builds';

const fetchBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const baseUrl = import.meta.env.VITE_BETTER_AUTH_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/user-builds/${slug}`, { cache: 'no-store' });
    if (!res.ok) throw notFound();
    return res.json();
  });

export const Route = createFileRoute('/user-builds/$slug')({
  loader: ({ params }) => fetchBuild({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | User Builds` },
          { name: 'description', content: loaderData.description },
          { property: 'og:title', content: loaderData.title },
          { property: 'og:description', content: loaderData.description },
          ...(loaderData.thumbnailUrl ? [{ property: 'og:image', content: loaderData.thumbnailUrl }] : []),
        ]
      : [{ title: 'Build Not Found' }],
  }),
  component: BuildPage,
});

function BuildPage() {
  const build = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <BuildDetail build={build} />
      </div>
    </div>
  );
}
