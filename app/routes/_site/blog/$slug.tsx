/**
 * Blog Post Route — /blog/$slug
 *
 * Lives under `_site/` so it renders inside the standard radial shell with
 * `PageLayout` owning the title, lede and back link — the same move
 * `/builds/$slug` and `/user-builds/$slug` made. It used to be a top-level
 * full-screen route that re-typed its own `pt-20 pb-20 min-h-screen` frame, a
 * hand-rolled back link and a `text-4xl md:text-5xl font-semibold` title clamp
 * beside the shared display scale.
 *
 * The public URL is unchanged — only the layout nesting moved.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { readingTimeMinutes } from '@/lib/reading-time';

import { PageLayout } from '@/components/feed/PageLayout';
import { AdSlot } from '@/components/ads/AdSlot';
import { Badge } from '@/components/ui/badge';
import { BlurImage, blurImagePreload } from '@/components/ui/BlurImage';
import { ShareButton } from '@/components/blog/ShareButton';
import { ArticleTakeaways } from '@/components/blog/ArticleTakeaways';
import { ArticleBody } from '@/components/reading/ArticleBody';
import { getPostBySlug } from '@/lib/blog';
import { buildCanonical, buildMeta, ogCardPath, SITE_URL } from '@/lib/seo';
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
      // A post that chose a hero image shares that image; the rest — most of the
      // archive — get a rendered devlog card instead of the site-wide default,
      // which named neither the post nor the blog. `buildMeta` also supplies the
      // Twitter tags and the absolute URL this head used to omit entirely.
      meta: buildMeta({
        title: `${title} | RMH Studios Devlog`,
        description,
        path: `/blog/${params.slug}`,
        image: image || ogCardPath('blog', params.slug),
        imageAlt: image ? title : `${title} — a devlog post on RMH Studios.`,
        // A post's own hero art is whatever shape the author uploaded, so the
        // 1200×630 claim would be a lie for it.
        imageSize: image ? null : undefined,
        type: 'article',
      }),
      links: [
        buildCanonical(`/blog/${params.slug}`),
        // The cover is this page's LCP element (a full-bleed 1280px image above
        // the body copy), and the loader already knows its URL — so the fetch
        // can start from the HTML instead of waiting for layout to reach the
        // <img>. `blurImagePreload` derives href/imagesrcset/imagesizes from the
        // same helpers `BlurImage` uses, so the preload and the <img> resolve to
        // the same candidate and the image is downloaded once. The props below
        // must stay in sync with the <BlurImage> in the body.
        ...(image
          ? [blurImagePreload({ src: image, width: 1280, quality: 85, sizes: '100vw' })]
          : []),
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
  const minutes = readingTimeMinutes(post.content as string);

  return (
    <PageLayout
      title={post.title as string}
      description={post.description as string}
      backTo="/library"
      backLabel={t('back-to-logs', { defaultValue: 'Back to Logs' })}
      // A post title is a sentence, not a page name — it has to wrap.
      wrapTitle
    >
      <article className="space-y-6 pb-12">
        {/* The byline: date, reading time and tags in `t-meta`, with Share at the end. */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
          style={{ viewTransitionName: liquidVTName('blog', slug) }}
        >
          <span className="t-meta">{post.date as string}</span>
          {minutes > 0 ? (
            <span className="t-meta">
              {t('blog-reading-time', { defaultValue: '{{minutes}} min read', minutes })}
            </span>
          ) : null}
          {tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
          <ShareButton slug={slug} className="ms-auto" />
        </div>

        {image && (
          <div className="overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
            <BlurImage
              src={image}
              alt={post.title as string}
              fit="cover"
              width={1280}
              quality={85}
              sizes="100vw"
              className="w-full"
              imgClassName="w-full"
              // The only priority image on this page — see the preload in
              // `head()` above, which must be given these same props.
              priority
            />
          </div>
        )}

        {/* Above the body, because its whole job is to help someone decide
            whether to read it. Renders nothing until (and unless) the
            takeaways arrive. */}
        <ArticleTakeaways slug={slug} />

        {/* The body is the article's spine (ArticleBody): each section heading is a station, the paragraphs hang under it
            as `t-prose`. `markdownComponents` carries all of the body's styling. */}
        <ArticleBody kind="blog" slug={slug} content={post.content as string} />

        {/* Below the body, after the reader has the post. `AdSlot` renders
            nothing for members, for anyone who hasn't answered the cookie
            banner, and when no publisher id is configured — see
            lib/ads/adsense.ts. */}
        <AdSlot placement="article-end" />

        <p className="t-meta max-w-2xl border-t border-site-border pt-4">
          {t('end-of-log', { defaultValue: 'End of Log' })}
        </p>
      </article>
    </PageLayout>
  );
}
