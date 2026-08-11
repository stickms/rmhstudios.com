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
// `m as motion`, not `motion` — the same alias the six other route modules that
// animate use. `Providers` wraps the app in `LazyMotion`, whose whole point is
// that the feature bundle loads on demand; `m` is the component that honours
// that, while `motion` carries its own full `VisualElement` implementation.
// Because a route module's top level is aggregated into the SHARED ENTRY CHUNK,
// this one import put 36 KB of framer-motion on the critical path of every page
// on the site — defeating the LazyMotion setup for everyone, to animate one
// article page. The rendered markup and the variants are unchanged.
import { m as motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { ShareButton } from '@/components/blog/ShareButton';
import { liquidVTName } from '@/lib/view-transition';
import { getCategoryColor } from '@/lib/news-categories';
import { useTranslation } from 'react-i18next';
import { markdownComponents } from '@/components/blog/MDXAnimations';
import { AdSlot } from '@/components/ads/AdSlot';

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
      {/* The article reveals as a short stagger — back link, meta row, headline,
          lede, source card — on the shared `staggerContainer`/`staggerItem`
          variants. It used to be five hand-written `animate-in … duration-700
          delay-450` chains, which (a) never ran, because that vocabulary needs
          `tailwindcss-animate` and this project does not have it, and (b) would
          have taken 1,150ms to finish if they had, against §7's 0.3s ceiling.
          The container's 60ms step lands the last item at ~400ms. */}
      <motion.div
        className="container mx-auto max-w-3xl relative z-10"
        variants={staggerContainer(0.06)}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={staggerItem}>
        <Link
          to="/news"
          className="inline-flex items-center gap-2 text-(--site-text-dim) hover:text-(--site-text) mb-8 transition-colors duration-site"
        >
          <ArrowLeft className="w-4 h-4" /> {t('back-to-news', { defaultValue: 'Back to News' })}
        </Link>
        </motion.div>

        {/* §5.48 liquid-open hero — the news card morphs into this header. */}
        <header className="mb-12" style={{ viewTransitionName: liquidVTName('news', slug) }}>
          <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-3 mb-4">
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
          </motion.div>

          <motion.h1
            variants={staggerItem}
            className="text-3xl md:text-5xl font-black text-(--site-text) mb-6 tracking-tight leading-tight font-display"
          >
            {article.title}
          </motion.h1>

          <motion.p
            variants={staggerItem}
            className="text-xl text-(--site-text-muted) leading-relaxed border-l-4 border-(--site-accent) pl-6"
          >
            {article.description}
          </motion.p>
        </header>

        {article.sourceUrl && (
          <motion.div
            variants={staggerItem}
            className="mb-10 p-6 rounded-site border border-(--site-border) bg-(--site-surface)"
          >
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
          </motion.div>
        )}

        {/* `markdownComponents` carries the body's styling; the `prose-*`
            classes that used to wrap it were inert (no typography plugin). */}
        <div className="max-w-none break-words">
          <ReactMarkdown components={markdownComponents}>{article.content}</ReactMarkdown>
        </div>

        <hr className="my-12 border-(--site-border)" />

        {/* Below the body, after the reader has the article. Renders nothing
            for members / un-consented visitors — see lib/ads/adsense.ts. */}
        <AdSlot placement="article-end" className="mb-12" />

        <div className="text-center">
          <p className="text-(--site-text-dim) italic">
            {t('end-of-article', { defaultValue: 'End of Article' })}
          </p>
        </div>
      </motion.div>
    </article>
  );
}
