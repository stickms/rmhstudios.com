/**
 * Build Detail Route
 *
 * Official builds (code-defined in games.ts / apps.ts) are checked first.
 * User-submitted builds fall through to the DB.
 * Official build content always comes from code; DB only stores engagement.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { BuildDetail } from '@/components/user-builds';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { stripTrailingSlash } from '@/lib/url';

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function BuildPage() {
  const result = Route.useLoaderData();

  if (result.kind === 'user-build') {
    const build = result.data;
    const backHref = build.category?.slug ? `/builds/${build.category.slug}` : '/builds';
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <BuildDetail build={build} backHref={backHref} />
        </div>
      </div>
    );
  }

  // Official build detail
  const build = result.data;
  const isGame = games.some((g) => g.id === build.id);

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          to={isGame ? '/builds/games' : '/builds/apps'}
          className="inline-flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {isGame ? 'Games' : 'Apps'}
        </Link>

        {/* Header */}
        <div className="mb-8">
          {build.status && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent mb-3">
              {build.status}
            </span>
          )}
          <h1 className="text-3xl font-bold text-site-text mb-4">{build.title}</h1>
          <p className="text-site-text-muted mb-6">{build.longDescription}</p>

          {/* Tags */}
          {build.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {build.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded-full text-xs bg-site-surface border border-site-border text-site-text-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA */}
          <Link
            to={build.href}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            {build.cta}
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Thumbnail */}
        {build.imagePath && (
          <div className="rounded-xl overflow-hidden border border-site-border">
            <OptimizedImage
              src={build.imagePath}
              alt={build.title}
              layout="fullWidth"
              quality={85}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
