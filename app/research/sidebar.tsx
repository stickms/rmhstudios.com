'use client';

import Link from 'next/link';
import { Megaphone, Newspaper } from 'lucide-react';
import type { NewsArticle } from '@/lib/news';

interface ResearchRightSidebarProps {
    newsArticles: Partial<NewsArticle>[];
}

export function ResearchRightSidebar({ newsArticles }: ResearchRightSidebarProps) {
    return (
        <div className="p-4 space-y-6">
            {/* Conference Announcement */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Megaphone className="w-5 h-5 text-site-accent" />
                    Announcement
                </h2>
                <div className="space-y-2">
                    <p className="text-sm font-bold text-site-text">
                        RMHSTRC 2026
                    </p>
                    <p className="text-xs text-site-text-muted">
                        5th Annual RMH Studios Technical Research Conference
                    </p>
                    <p className="text-xs text-site-text-dim">
                        Rochester, MN &mdash; June 19, 2026
                    </p>
                    <p className="text-xs text-site-text-muted mt-2">
                        Original contributions spanning AI, computational topology, statistical physics, cognitive science, and game design.
                    </p>
                    <Link
                        href="/research/call"
                        className="inline-block mt-2 rounded-lg bg-site-accent px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
                    >
                        View Call for Papers
                    </Link>
                </div>
            </section>

            {/* Latest News */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Newspaper className="w-5 h-5 text-site-accent" />
                    Latest News
                </h2>
                <div className="space-y-3">
                    {newsArticles.slice(0, 4).map((article) => (
                        <Link
                            key={article.slug}
                            href={`/news/${article.slug}`}
                            className="block group"
                        >
                            <p className="text-xs text-site-text-dim">{article.category}</p>
                            <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                                {article.title}
                            </p>
                        </Link>
                    ))}
                </div>
                <Link
                    href="/news"
                    className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors"
                >
                    Show more
                </Link>
            </section>
        </div>
    );
}
