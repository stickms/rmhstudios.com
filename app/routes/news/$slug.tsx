/**
 * News Article Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getNewsArticleBySlug } from '@/lib/news';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, ExternalLink } from 'lucide-react';
import { ShareButton } from '@/components/blog/ShareButton';
import { getCategoryColor } from '@/lib/news-categories';
import {
  AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
  AnimatedUl, AnimatedOl, AnimatedLi,
  AnimatedBlockquote, AnimatedImg, AnimatedHr, AnimatedPre,
} from '@/components/blog/MDXAnimations';

const animatedComponents = {
  h1: AnimatedH1, h2: AnimatedH2, h3: AnimatedH3, p: AnimatedP,
  ul: AnimatedUl, ol: AnimatedOl, li: AnimatedLi,
  blockquote: AnimatedBlockquote, img: AnimatedImg, hr: AnimatedHr, pre: AnimatedPre,
};

const fetchArticle = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await getNewsArticleBySlug(slug);
    return article;
  });

export const Route = createFileRoute('/news/$slug')({
  loader: ({ params }) => fetchArticle({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | RMH News` },
          { name: 'description', content: loaderData.description },
        ]
      : [{ title: 'Article Not Found | RMH Studios' }],
  }),
  component: NewsArticlePage,
});

function NewsArticlePage() {
  const article = Route.useLoaderData();
  const { slug } = Route.useParams();

  if (!article) {
    return (
      <main className="min-h-screen pt-20 pb-20 px-4 bg-(--site-bg)">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold text-(--site-text)">Article not found</h1>
          <Link to="/news" className="text-(--site-accent) mt-4 inline-block hover:underline">
            &larr; Back to News
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
          <ArrowLeft className="w-4 h-4" /> Back to News
        </Link>

        <header className="mb-12">
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
            <ShareButton slug={slug} />
          </div>

          <h1
            className="text-3xl md:text-5xl font-black text-(--site-text) mb-6 tracking-tight leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both"
            style={{ fontFamily: 'var(--site-font-display)' }}
          >
            {article.title}
          </h1>

          <p className="text-xl text-(--site-text-muted) leading-relaxed border-l-4 border-(--site-accent) pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
            {article.description}
          </p>
        </header>

        {article.sourceUrl && (
          <div className="mb-10 p-6 rounded-xl border border-(--site-border) bg-(--site-surface) animate-in fade-in slide-in-from-bottom-4 duration-700 delay-450 fill-mode-both">
            <p className="text-xs font-semibold uppercase tracking-widest text-(--site-accent) mb-2">
              Original Source
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
              Read Original Article <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-(--site-text) prose-p:text-(--site-text-muted) prose-a:text-(--site-accent) hover:prose-a:text-(--site-accent-hover) prose-img:rounded-xl prose-img:border prose-img:border-(--site-border) prose-li:text-(--site-text-muted) prose-strong:text-(--site-text) prose-blockquote:border-l-(--site-accent)">
          <MDXRemote source={article.content} components={animatedComponents} />
        </div>

        <hr className="my-12 border-(--site-border)" />

        <div className="text-center">
          <p className="text-(--site-text-dim) italic">End of Article</p>
        </div>
      </div>
    </article>
  );
}
