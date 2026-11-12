/**
 * News Article Route — /news/$slug
 *
 * Lives under `_site/` so it renders inside the site shell with `PageLayout` owning the title, lede and back link,
 * the same move `/blog/$slug` made. It used to be a top-level full-screen route with its own `pt-16` frame, a
 * hand-rolled back link and a 5xl black headline. The public URL is unchanged: only the layout nesting moved.
 * The article is its table of contents (Steel section 10, Article): `ArticleBody` makes each section heading a station.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getNewsArticleBySlug } from '@/lib/news';
import { buildCanonical, SITE_URL } from '@/lib/seo';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import { ShareButton } from '@/components/blog/ShareButton';
import { liquidVTName } from '@/lib/view-transition';
import { useTranslation } from 'react-i18next';
import { readingTimeMinutes } from '@/lib/reading-time';
import { ArticleBody } from '@/components/reading/ArticleBody';
import { StoryBanner } from '@/components/reading/StoryBanner';
import { getStoryForArticle } from '@/lib/reading/stories.server';
import { AdSlot } from '@/components/ads/AdSlot';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

const fetchArticle = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await getNewsArticleBySlug(slug);
    if (!article) return null;
    // L5: "Part of story: X" is part of the server HTML, so it never shifts the layout.
    return { ...article, story: await getStoryForArticle(slug) };
  });

export const Route = createFileRoute('/_site/news/$slug')({
  loader: ({ params }) => fetchArticle({ data: params.slug }),
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | RMH News` },
          { name: 'description', content: loaderData.description },
        ]
      : [{ title: 'Article Not Found | RMH Studios' }],
    links: [
      buildCanonical(`/news/${params.slug}`),
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        title: 'RMH Studios — News',
        href: `${SITE_URL}/news/rss.xml`,
      },
    ],
    scripts: loaderData
      ? [
          jsonLdScript(
            articleSchema({
              title: loaderData.title,
              description: loaderData.description,
              datePublished: loaderData.date,
              path: `/news/${params.slug}`,
              type: 'NewsArticle',
              section: loaderData.category ?? undefined,
            }),
          ),
        ]
      : [],
  }),
  component: NewsArticlePage,
});

function NewsArticlePage() {
  const { t } = useTranslation('pages');
  const article = Route.useLoaderData();
  const minutes = article ? readingTimeMinutes(article.content) : 0;
  const { slug } = Route.useParams();

  if (!article) {
    return (
      <PageLayout
        title={t('article-not-found', { defaultValue: 'Article not found' })}
        backTo="/news"
        backLabel={t('back-to-news', { defaultValue: 'Back to News' })}
      >
        <p className="t-body text-site-text-muted">
          {t('article-not-found-hint', { defaultValue: 'It may have been moved or removed.' })}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={article.title}
      description={article.description}
      backTo="/news"
      backLabel={t('back-to-news', { defaultValue: 'Back to News' })}
      // A headline is a sentence, not a page name: it has to wrap.
      wrapTitle
    >
      <article className="space-y-6 pb-12">
        {/* The byline: category, date and reading time in `t-meta`, with Share at the end. */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
          style={{ viewTransitionName: liquidVTName('news', slug) }}
        >
          {article.category ? <Badge>{article.category}</Badge> : null}
          <span className="t-meta">{article.date}</span>
          {minutes > 0 ? (
            <span className="t-meta">
              {t('blog-reading-time', { defaultValue: '{{minutes}} min read', minutes })}
            </span>
          ) : null}
          <ShareButton slug={slug} section="news" className="ms-auto" />
        </div>

        {article.story && <StoryBanner story={article.story} />}

        {article.sourceUrl && (
          <div className="border-b border-site-border pb-4">
            <p className="t-label">{t('original-source', { defaultValue: 'Original Source' })}</p>
            <p className="t-heading mt-1">{article.sourceTitle || article.title}</p>
            <p className="t-meta mt-1">
              {article.sourcePublisher}
              {article.sourceDate && ` \u00B7 ${article.sourceDate}`}
            </p>
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="t-body mt-2 inline-flex items-center gap-2 font-medium underline"
            >
              {t('read-original-article', { defaultValue: 'Read Original Article' })}{' '}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>
        )}

        {/* The body is the article's spine (ArticleBody): each section heading is a station, the paragraphs hang under
            it as `t-prose`. `markdownComponents` carries all of the body's styling. */}
        <ArticleBody kind="news" slug={slug} content={article.content} />

        {/* Below the body, after the reader has the article. Renders nothing for members / un-consented visitors; see
            lib/ads/adsense.ts. */}
        <AdSlot placement="article-end" />

        <p className="t-meta max-w-2xl border-t border-site-border pt-4">
          {t('end-of-article', { defaultValue: 'End of Article' })}
        </p>
      </article>
    </PageLayout>
  );
}
