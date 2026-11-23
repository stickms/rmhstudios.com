/**
 * RMH News article — /news/$slug.
 *
 * A WIRE article (a headline from a public feed, lib/news-wire/) is a reading aid, not a copy of the story: the
 * outlet's picture, the AI summary (cached, written on first open: components/news/NewsSummary.tsx), the feed's own
 * excerpt, and one ink primary that opens the full story at its source (R4). It is `noindex`: the story belongs to its
 * publisher, and the page is not a substitute for it in search.
 *
 * An EDITORIAL article (written for the site) keeps its body as its table of contents (Steel section 10, Article):
 * `ArticleBody` makes each section heading a station. It gets the summary too.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { isAdminRequest } from '@/lib/auth/server-fn-guards.server';
import { getNewsArticleBySlug, getRelatedNews } from '@/lib/news';
import { storedSummary } from '@/lib/news-wire/summary.server';
import { parsePassageSearch } from '@/lib/library/passage-search';
import { buildCanonical, buildMeta, SITE_URL } from '@/lib/seo';
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
import { Button } from '@/components/ui/button';
import { categoryLabel, NewsMeta, NewsPicture } from '@/components/news/NewsParts';
import { isNewsCategory } from '@/lib/news-wire/categorize';
import { NewsStoryRow } from '@/components/news/NewsStoryRow';
import { NewsSummary } from '@/components/news/NewsSummary';
import { ExternalLink } from 'lucide-react';

const fetchArticle = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await getNewsArticleBySlug(slug);
    if (!article) return null;
    // A STAGING article is unpublished: the listing, feed and sitemap already hide it, and a server function is
    // its own HTTP endpoint, so this one has to as well. An admin may preview it, and that view is never cached.
    if (article.status !== 'PUBLISHED') {
      if (!(await isAdminRequest())) return null;
      setResponseHeader('Cache-Control', 'private, no-store');
    }
    const { summary: rawSummary, discordMessageId: _discord, ...rest } = article;
    void _discord;
    const [story, related] = await Promise.all([
      // L5: "Part of story: X" is part of the server HTML, so it never shifts the layout.
      getStoryForArticle(slug),
      getRelatedNews(article.category, slug, 5),
    ]);
    // The cached summary rides in the HTML; a missing one is requested by the browser after paint, never here.
    return { ...rest, summary: storedSummary({ summary: rawSummary }), story, related };
  });

export const Route = createFileRoute('/_site/news/$slug')({
  // `p` is a passage link (lib/library/passage-link.ts): the reader scrolls to it; the canonical URL stays the article's.
  validateSearch: (search: Record<string, unknown>) => {
    const p = parsePassageSearch(search.p);
    return p ? { p } : {};
  },
  loader: ({ params }) => fetchArticle({ data: params.slug }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: 'Article not found | RMH News' }, { name: 'robots', content: 'noindex' }] };
    const wire = loaderData.origin === 'WIRE';
    return {
      meta: [
        ...buildMeta({
          title: `${loaderData.title} | RMH News`,
          description: loaderData.summary?.tldr || loaderData.description || `${loaderData.title} — via ${loaderData.sourcePublisher}.`,
          path: `/news/${params.slug}`,
          type: 'article',
          // The story's own picture, at the outlet's own size (unknown here, so no dimensions are declared).
          image: loaderData.image || undefined,
          imageSize: loaderData.image ? null : undefined,
        }),
        ...(wire ? [{ name: 'robots', content: 'noindex, follow' }] : []),
      ],
      links: [
        buildCanonical(`/news/${params.slug}`),
        { rel: 'alternate', type: 'application/rss+xml', title: 'RMH News', href: `${SITE_URL}/news/rss.xml` },
      ],
      scripts: wire
        ? []
        : [
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
          ],
    };
  },
  component: NewsArticlePage,
});

function NewsArticlePage() {
  const { t } = useTranslation('pages');
  const { t: tn } = useTranslation('c-news');
  const article = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { p: passage } = Route.useSearch();

  if (!article) {
    return (
      <PageLayout
        title={t('article-not-found', { defaultValue: 'Article not found' })}
        backTo="/news"
        backLabel={tn('back-to-rmh-news', { defaultValue: 'Back to RMH News' })}
      >
        <p className="t-body text-site-text-muted">
          {tn('article-gone-hint', {
            defaultValue: 'Headlines leave RMH News after three weeks. The story may still be on its publisher’s site.',
          })}
        </p>
      </PageLayout>
    );
  }

  const wire = article.origin === 'WIRE';
  const category = isNewsCategory(article.category) ? article.category : null;
  const minutes = wire ? 0 : readingTimeMinutes(article.content);

  return (
    <PageLayout
      title={article.title}
      backTo="/news"
      backLabel={tn('back-to-rmh-news', { defaultValue: 'Back to RMH News' })}
      // A headline is a sentence, not a page name: it has to wrap.
      wrapTitle
    >
      <article className="space-y-6 pb-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ viewTransitionName: liquidVTName('news', slug) }}>
          <NewsMeta category={article.category} publisher={article.sourcePublisher} publishedAt={article.publishedAt} />
          {minutes > 0 ? (
            <span className="t-meta">{t('blog-reading-time', { defaultValue: '{{minutes}} min read', minutes })}</span>
          ) : null}
          <ShareButton slug={slug} section="news" className="ms-auto" />
        </div>

        {article.story && <StoryBanner story={article.story} />}

        {article.image ? <NewsPicture src={article.image} alt={article.title} className="aspect-[16/9] w-full" eager /> : null}

        <NewsSummary slug={slug} initial={article.summary} publisher={article.sourcePublisher} />

        {wire ? (
          <section aria-labelledby="news-excerpt-heading" className="space-y-3 border-t border-site-border pt-6">
            <h2 id="news-excerpt-heading" className="t-label">
              {tn('excerpt-heading', { defaultValue: 'From {{publisher}}', publisher: article.sourcePublisher })}
            </h2>
            {article.description ? <p className="t-prose text-site-text">{article.description}</p> : null}
            <Button asChild variant="primary">
              <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer">
                {tn('read-at-publisher', { defaultValue: 'Read at {{publisher}}', publisher: article.sourcePublisher })}
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          </section>
        ) : (
          <>
            {article.sourceUrl ? (
              <div className="border-t border-site-border pt-4">
                <p className="t-label">{t('original-source', { defaultValue: 'Original Source' })}</p>
                <p className="t-heading mt-1">{article.sourceTitle || article.title}</p>
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
            ) : null}
            {/* The body is the article's spine (ArticleBody): each section heading is a station. */}
            <ArticleBody kind="news" slug={slug} content={article.content} title={article.title} passage={passage} />
          </>
        )}

        {/* Below the body, after the reader has the article. Renders nothing for members / un-consented visitors; see
            lib/ads/adsense.ts. */}
        <AdSlot placement="article-end" />

        {article.related.length > 0 ? (
          <section aria-labelledby="news-related-heading" className="border-t border-site-border pt-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="news-related-heading" className="t-heading">
                {tn('more-in-category', {
                  defaultValue: 'More in {{category}}',
                  category: category ? categoryLabel(tn, category) : article.category,
                })}
              </h2>
              <Link to="/news" search={category ? { category } : {}} className="t-body text-site-text-muted underline">
                {tn('see-all', { defaultValue: 'See all' })}
              </Link>
            </div>
            <ul>
              {article.related.map((story) => (
                <NewsStoryRow key={story.slug} story={story} />
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageLayout>
  );
}
