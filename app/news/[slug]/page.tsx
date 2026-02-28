import { getNewsArticleBySlug, getNewsSlugs } from '@/lib/news';
import { MDXRemote } from 'next-mdx-remote/rsc';
import Link from 'next/link';
import { ArrowLeft, Calendar, ExternalLink } from 'lucide-react';
import { ShareButton } from '@/components/blog/ShareButton';
import { getCategoryColor } from '@/lib/news-categories';

import {
    AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
    AnimatedUl, AnimatedOl, AnimatedLi,
    AnimatedBlockquote, AnimatedImg, AnimatedHr, AnimatedPre,
} from '@/components/blog/MDXAnimations';

const animatedComponents = {
    h1: AnimatedH1,
    h2: AnimatedH2,
    h3: AnimatedH3,
    p: AnimatedP,
    ul: AnimatedUl,
    ol: AnimatedOl,
    li: AnimatedLi,
    blockquote: AnimatedBlockquote,
    img: AnimatedImg,
    hr: AnimatedHr,
    pre: AnimatedPre,
};

export async function generateStaticParams() {
    const slugs = getNewsSlugs();
    return slugs.map((s) => ({
        slug: s.replace(/\.mdx$/, ''),
    }));
}

import type { Metadata } from 'next';

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const article = getNewsArticleBySlug(slug, ['title', 'description']);
    if (!article) return { title: 'Article Not Found | RMH Studios' };

    return {
        title: `${article.title} | RMH News`,
        description: article.description as string,
    };
}

export default async function NewsArticlePage({ params }: Props) {
    const { slug } = await params;
    const article = getNewsArticleBySlug(slug, [
        'title', 'date', 'description', 'content', 'category',
        'sourceTitle', 'sourceUrl', 'sourcePublisher', 'sourceDate', 'tags',
    ]);

    if (!article) {
        return (
            <main className="min-h-screen pt-32 pb-20 px-4 bg-(--site-bg)">
                <div className="container mx-auto max-w-3xl text-center">
                    <h1 className="text-3xl font-bold text-(--site-text)">Article not found</h1>
                    <Link href="/news" className="text-(--site-accent) mt-4 inline-block hover:underline">
                        ← Back to News
                    </Link>
                </div>
            </main>
        );
    }

    const categoryColor = getCategoryColor(article.category as string ?? '');

    return (
        <article className="min-h-screen pt-32 pb-20 px-4 bg-(--site-bg) relative overflow-hidden">
            <div className="container mx-auto max-w-3xl relative z-10">
                <Link
                    href="/news"
                    className="inline-flex items-center gap-2 text-(--site-text-dim) hover:text-(--site-text) mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to News
                </Link>

                <header className="mb-12">
                    <div className="flex flex-wrap items-center gap-3 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
                        <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text} ${categoryColor.border} border`}
                        >
                            {article.category as string}
                        </span>
                        <div className="flex items-center gap-2 text-(--site-accent) font-mono text-sm">
                            <Calendar className="w-4 h-4" />
                            {article.date as string}
                        </div>
                        <ShareButton slug={slug} />
                    </div>

                    <h1
                        className="text-3xl md:text-5xl font-black text-(--site-text) mb-6 tracking-tight leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both"
                        style={{ fontFamily: 'var(--site-font-display)' }}
                    >
                        {article.title as string}
                    </h1>

                    <p className="text-xl text-(--site-text-muted) leading-relaxed border-l-4 border-(--site-accent) pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
                        {article.description as string}
                    </p>
                </header>

                {/* Source Attribution Card */}
                {article.sourceUrl && (
                    <div className="mb-10 p-6 rounded-xl border border-(--site-border) bg-(--site-surface) animate-in fade-in slide-in-from-bottom-4 duration-700 delay-450 fill-mode-both">
                        <p className="text-xs font-semibold uppercase tracking-widest text-(--site-accent) mb-2">
                            📰 Original Source
                        </p>
                        <p className="text-(--site-text) font-bold text-lg mb-1 leading-snug">
                            {(article.sourceTitle as string) || (article.title as string)}
                        </p>
                        <p className="text-(--site-text-dim) text-sm mb-3">
                            {article.sourcePublisher as string}
                            {article.sourceDate && ` · ${article.sourceDate}`}
                        </p>
                        <a
                            href={article.sourceUrl as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-bold text-(--site-accent) hover:opacity-80 transition-opacity"
                        >
                            Read Original Article <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                )}

                {/* MDX Content */}
                <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-(--site-text) prose-p:text-(--site-text-muted) prose-a:text-(--site-accent) hover:prose-a:text-(--site-accent-hover) prose-img:rounded-xl prose-img:border prose-img:border-(--site-border) prose-li:text-(--site-text-muted) prose-strong:text-(--site-text) prose-blockquote:border-l-(--site-accent)">
                    <MDXRemote source={article.content as string} components={animatedComponents} />
                </div>

                <hr className="my-12 border-(--site-border)" />

                <div className="text-center">
                    <p className="text-(--site-text-dim) italic">End of Article</p>
                </div>
            </div>
        </article>
    );
}
