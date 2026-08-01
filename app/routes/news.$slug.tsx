/**
 * News Article Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getNewsArticleBySlug } from '@/lib/news';
import { buildCanonical, SITE_URL } from '@/lib/seo';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import ReactMarkdown from 'react-markdown';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, ExternalLink } from 'lucide-react';
import { ShareButton } from '@/components/blog/ShareButton';
import { liquidVTName } from '@/lib/view-transition';
import { getCategoryColor } from '@/lib/news-categories';
import { useTranslation } from 'react-i18next';
import { markdownComponents } from '@/components/blog/MDXAnimations';

const fetchArticle = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await getNewsArticleBySlug(slug);
    return article;
  });

export const Route = createFileRoute('/news/$slug')({
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
  const { slug } = Route.useParams();

  if (!article) {
    return (
      <main className="min-h-screen pt-20 pb-20 px-4 bg-(--site-bg)">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold text-(--site-text)">
            {t('article-not-found', { defaultValue: 'Article not found' })}
          </h1>
          <Link to="/news" className="text-(--site-accent) mt-4 inline-block hover:underline">
            &larr; {t('back-to-news', { defaultValue: 'Back to News' })}
          </Link>
        </div>
      </main>
    );
  }

  const categoryColor = getCategoryColor(article.category ?? '');

  return (
    <article className="min-h-screen pt-20 pb-20 px-4 bg-(--site-bg) relative overflow-hidden">
      <div className="container mx-auto max-w-3xl relative z-10">
        <Link
          to="/news"
          className="inline-flex items-center gap-2 text-(--site-text-dim) hover:text-(--site-text) mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700"
        >
          <ArrowLeft className="w-4 h-4" /> {t('back-to-news', { defaultValue: 'Back to News' })}
        </Link>

        {/* §5.48 liquid-open hero — the news card morphs into this header. */}
        <header className="mb-12" style={{ viewTransitionName: liquidVTName('news', slug) }}>
          <div className="flex flex-wrap items-center gap-3 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text} ${categoryColor.border} border`}
            >
              {article.category}
            </span>
            <div className="flex items-center gap-2 text-(--site-accent) font-mono text-sm">
              <Calendar className="w-4 h-4" />
              {article.date}
            </div>
            <ShareButton slug={slug} section="news" />
          </div>

          <h1
            className="text-3xl md:text-5xl font-black text-(--site-text) mb-6 tracking-tight leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both font-display"
          >
            {article.title}
          </h1>

          <p className="text-xl text-(--site-text-muted) leading-relaxed border-l-4 border-(--site-accent) pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
            {article.description}
          </p>
        </header>

        {article.sourceUrl && (
          <div className="mb-10 p-6 rounded-site border border-(--site-border) bg-(--site-surface) animate-in fade-in slide-in-from-bottom-4 duration-700 delay-450 fill-mode-both">
            <p className="text-xs font-semibold uppercase tracking-widest text-(--site-accent) mb-2">
              {t('original-source', { defaultValue: 'Original Source' })}
            </p>
            <p className="text-(--site-text) font-bold text-lg mb-1 leading-snug">
              {article.sourceTitle || article.title}
            </p>
            <p className="text-(--site-text-dim) text-sm mb-3">
              {article.sourcePublisher}
              {article.sourceDate && ` \u00B7 ${article.sourceDate}`}
            </p>
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-(--site-accent) hover:opacity-80 transition-opacity"
            >
              {t('read-original-article', { defaultValue: 'Read Original Article' })}{' '}
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* `markdownComponents` carries the body's styling; the `prose-*`
            classes that used to wrap it were inert (no typography plugin). */}
        <div className="max-w-none break-words">
          <ReactMarkdown components={markdownComponents}>{article.content}</ReactMarkdown>
        </div>

        <hr className="my-12 border-(--site-border)" />

        <div className="text-center">
          <p className="text-(--site-text-dim) italic">
            {t('end-of-article', { defaultValue: 'End of Article' })}
          </p>
        </div>
      </div>
    </article>
  );
}
