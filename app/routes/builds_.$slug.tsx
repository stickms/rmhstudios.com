/**
 * Build Detail Route — /builds/$slug
 *
 * Official builds (code-defined in games.ts / apps.ts) are checked first; user-
 * submitted builds fall through to the DB. Rendered full-bleed in the black/white
 * "vibe" aesthetic to match /builds, /library, and the homepage.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { BuildDetail } from '@/components/user-builds';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { stripTrailingSlash } from '@/lib/url';
import '@/components/rmhvibe/vibe.css';
import '@/components/builds/builds.css';

const allOfficial = [...games, ...apps];

const fetchBuild = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    // 1. Check official (code-defined) builds first — content lives in code
    const official = allOfficial.find((b) => b.id === slug);
    if (official) {
      return { kind: 'official' as const, data: official };
    }

    // 2. Fall back to user-submitted build from the DB
    const baseUrl = stripTrailingSlash(import.meta.env.VITE_BETTER_AUTH_URL || 'http://localhost:3000');
    const res = await fetch(`${baseUrl}/api/user-builds/${slug}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return { kind: 'user-build' as const, data };
    }

    throw notFound();
  });

export const Route = createFileRoute('/builds_/$slug')({
  loader: ({ params }) => fetchBuild({ data: params.slug }),
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: 'Build Not Found' }] };
    const d = loaderData.data;
    return {
      meta: [
        { title: `${d.title} | Builds` },
        { name: 'description', content: d.description },
        { property: 'og:title', content: d.title },
        { property: 'og:description', content: d.description },
        ...('imagePath' in d && d.imagePath
          ? [{ property: 'og:image', content: d.imagePath }]
          : 'thumbnailUrl' in d && d.thumbnailUrl
            ? [{ property: 'og:image', content: d.thumbnailUrl }]
            : []),
      ],
    };
  },
  component: BuildPage,
});

function BuildPage() {
  const result = Route.useLoaderData();

  if (result.kind === 'user-build') {
    return (
      <main className="vibe-screen min-h-screen">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 pt-8 pb-16">
          <BuildDetail build={result.data} backHref="/builds" />
        </div>
      </main>
    );
  }

  // Official build detail
  const build = result.data;

  return (
    <main className="vibe-screen min-h-screen">
      <div className="mx-auto max-w-4xl px-5 sm:px-8 pt-8 pb-16">
        <Link to="/builds" className="builds-detail__back">
          <ArrowLeft className="h-4 w-4" />
          Back to builds
        </Link>

        <header className="mt-7">
          {build.status && <span className="builds-detail__badge">{build.status}</span>}
          <h1 className="builds-detail__title">{build.title}</h1>
          <p className="builds-detail__lead">{build.longDescription}</p>

          {build.tags.length > 0 && (
            <div className="builds-detail__tags">
              {build.tags.map((tag) => (
                <span key={tag} className="builds-detail__tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <Link to={build.href} className="builds-detail__cta">
            {build.cta}
            <ExternalLink className="h-4 w-4" />
          </Link>
        </header>

        {build.imagePath && (
          <div className="builds-detail__thumb">
            <OptimizedImage src={build.imagePath} alt={build.title} layout="fullWidth" quality={85} className="w-full" />
          </div>
        )}
      </div>
    </main>
  );
}
