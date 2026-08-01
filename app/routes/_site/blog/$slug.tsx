/**
 * Blog Post Route — /blog/$slug
 *
 * Lives under `_site/` so it renders inside the standard radial shell with
 * `PageLayout` owning the title, lede and back link — the same move
 * `/builds/$slug` and `/user-builds/$slug` made. It used to be a top-level
 * full-screen route that re-typed its own `pt-20 pb-20 min-h-screen` frame, a
 * hand-rolled back link and a `text-4xl md:text-5xl font-black` title clamp
 * beside the shared display scale.
 *
 * The public URL is unchanged — only the layout nesting moved.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';

import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { BlurImage } from '@/components/ui/BlurImage';
import { ShareButton } from '@/components/blog/ShareButton';
import { markdownComponents } from '@/components/blog/MDXAnimations';
import { getPostBySlug } from '@/lib/blog';
import { buildCanonical, SITE_URL } from '@/lib/seo';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import { liquidVTName } from '@/lib/view-transition';

const fetchPost = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    // `getPostBySlug` throws on a missing row; convert that into the router's
    // 404 so the shell renders `components/errors/NotFound` instead of the
    // error boundary (page-consistency.md §3 "States").
    try {
      return await getPostBySlug(slug, [
        'title',
        'date',
        'description',
        'content',
        'image',
        'tags',
      ]);
    } catch {
      throw notFound();
    }
  });

export const Route = createFileRoute('/_site/blog/$slug')({
  loader: ({ params }) => fetchPost({ data: params.slug }),
  head: ({ loaderData, params }) => {
    const title = (loaderData?.title as string) ?? 'Post';
    const description = (loaderData?.description as string) ?? '';
    const image = loaderData?.image as string | undefined;
    return {
      meta: [
        { title: `${title} | RMH Studios Devlog` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        ...(image
          ? [
              {
                property: 'og:image',
                content: image.startsWith('http') ? image : `${SITE_URL}${image}`,
              },
            ]
          : []),
      ],
      links: [
        buildCanonical(`/blog/${params.slug}`),
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: 'RMH Studios — Blog',
          href: `${SITE_URL}/blog/rss.xml`,
        },
      ],
      scripts: loaderData
        ? [
            jsonLdScript(
              articleSchema({
                title: loaderData.title as string,
                description: loaderData.description as string | undefined,
                datePublished: loaderData.date as string | undefined,
                path: `/blog/${params.slug}`,
                type: 'BlogPosting',
              }),
            ),
          ]
        : [],
    };
  },
  component: BlogPost,
});

function BlogPost() {
  const post = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { t } = useTranslation('pages');

  const tags = (post.tags as string[] | undefined) ?? [];
  const image = post.image as string | undefined;

  return (
    <PageLayout
      title={post.title as string}
      description={post.description as string}
      backTo="/library"
      backLabel={t('back-to-logs', { defaultValue: 'Back to Logs' })}
      // A post title is a sentence, not a page name — it has to wrap.
      wrapTitle
    >
      <article className="space-y-[var(--site-section-gap)] px-4 pt-4 pb-12">
        {/* §5.48 liquid-open hero. PageLayout owns the title now, so the name
            the library card morphs into sits on this meta strip — the same
            placement BuildDetail uses for its thumbnail. */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ viewTransitionName: liquidVTName('blog', slug) }}
        >
          <span className="inline-flex items-center gap-2 font-mono text-sm text-site-accent">
            <Calendar className="size-4" aria-hidden />
            {post.date as string}
          </span>
          {tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
          <ShareButton slug={slug} className="ms-auto" />
        </div>

        {image && (
          <div className="overflow-hidden rounded-site border border-site-border shadow-site">
            <BlurImage
              src={image}
              alt={post.title as string}
              fit="cover"
              width={1280}
              quality={85}
              sizes="100vw"
              className="w-full"
              imgClassName="w-full"
            />
          </div>
        )}

        {/* `markdownComponents` carries all of this body's styling — the old
            `prose prose-invert …` wrapper was inert (no typography plugin) and
            `prose-invert` would have forced dark-theme ink on the light themes
            if it ever became live. */}
        <div className="max-w-none break-words">
          <ReactMarkdown components={markdownComponents}>{post.content as string}</ReactMarkdown>
        </div>

        <hr className="border-site-border" />

        <p className="text-center text-site-text-dim italic">
          {t('end-of-log', { defaultValue: 'End of Log' })}
        </p>
      </article>
    </PageLayout>
  );
}
