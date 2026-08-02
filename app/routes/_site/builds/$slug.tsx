/**
 * Build Detail Route — /builds/$slug
 *
 * Official builds (code-defined in games.ts / apps.ts) are checked first; user-
 * submitted builds fall through to the DB.
 *
 * Lives under `_site/` so it renders inside the standard radial shell with
 * `PageLayout` owning the title/lede/back link. It used to be a top-level
 * full-screen route painted by `vibe.css` + the `builds-detail__*` block of
 * `builds.css`; both are gone and every surface here is a `--site-*` token.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createServerFn } from '@tanstack/react-start';
import { ExternalLink } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuildDetail } from '@/components/user-builds';
import { BlurImage } from '@/components/ui/BlurImage';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { stripTrailingSlash } from '@/lib/url';
import { buildCanonical, buildMeta } from '@/lib/seo';

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
    const baseUrl = stripTrailingSlash(
      import.meta.env.VITE_BETTER_AUTH_URL || 'http://localhost:3000',
    );
    const res = await fetch(`${baseUrl}/api/user-builds/${slug}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return { kind: 'user-build' as const, data };
    }

    throw notFound();
  });

export const Route = createFileRoute('/_site/builds/$slug')({
  loader: ({ params }) => fetchBuild({ data: params.slug }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: 'Build Not Found' }] };
    const d = loaderData.data;
    // The build's own thumbnail when it has one — but as an ABSOLUTE url. These
    // were emitted site-relative, which crawlers ignore, so every build link
    // unfurled with no image at all rather than with the wrong one.
    const thumb =
      ('imagePath' in d && d.imagePath) || ('thumbnailUrl' in d && d.thumbnailUrl) || null;
    return {
      meta: buildMeta({
        title: `${d.title} | Builds`,
        description: d.description,
        path: `/builds/${params.slug}`,
        image: thumb || undefined,
        imageAlt: thumb ? `${d.title} on RMH Studios` : undefined,
        // A build thumbnail is whatever shape it was uploaded at.
        imageSize: thumb ? null : undefined,
        type: 'article',
      }),
      links: [buildCanonical(`/builds/${params.slug}`)],
    };
  },
  component: BuildPage,
});

function BuildPage() {
  const { t } = useTranslation('pages');
  const result = Route.useLoaderData();
  const backLabel = t('back-to-builds', { defaultValue: 'Back to builds' });

  if (result.kind === 'user-build') {
    const build = result.data;
    return (
      <PageLayout
        title={build.title}
        description={build.description}
        backTo="/create"
        backLabel={backLabel}
        wide
      >
        <div className="px-4 pt-4 pb-12">
          <BuildDetail build={build} />
        </div>
      </PageLayout>
    );
  }

  // Official build detail
  const build = result.data;

  return (
    <PageLayout
      title={build.title}
      description={build.longDescription}
      backTo="/create"
      backLabel={backLabel}
      wide
    >
      <div className="space-y-[var(--site-section-gap)] px-4 pt-4 pb-12">
        {(build.status || build.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {build.status && <Badge variant="accent">{build.status}</Badge>}
            {build.tags.map((tag) => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
        )}

        <div>
          <Button asChild variant="accent" size="lg">
            <Link to={build.href}>
              {build.cta}
              <ExternalLink aria-hidden />
            </Link>
          </Button>
        </div>

        {build.imagePath && (
          <div className="overflow-hidden rounded-site border border-site-border shadow-site">
            <BlurImage
              src={build.imagePath}
              alt={build.title}
              fit="cover"
              width={1280}
              quality={85}
              sizes="100vw"
              className="w-full"
              imgClassName="w-full"
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
