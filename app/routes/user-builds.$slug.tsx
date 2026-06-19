/**
 * User Build Detail Route
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { BuildDetail } from '@/components/user-builds';
import { stripTrailingSlash } from '@/lib/url';
import '@/components/rmhvibe/vibe.css';
import '@/components/builds/builds.css';

const fetchBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const baseUrl = stripTrailingSlash(import.meta.env.VITE_BETTER_AUTH_URL || 'http://localhost:3000');
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
    <main className="vibe-screen min-h-screen">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-16">
        <BuildDetail build={build} backHref="/builds" />
      </div>
    </main>
  );
}
